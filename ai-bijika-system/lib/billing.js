'use strict';
// 月額課金（Stripe）。Stripe REST を node:https で直接呼ぶ（SDKは使わない。追加依存なし）。
// 決済の状態（契約中か）は Webhook を唯一の真実とし、Checkoutの戻りURLだけでは契約中にしない。
const crypto = require('crypto');
const { request, encodeForm } = require('./http-client');
const { Subscriptions, StripeEvents, SnsAccounts } = require('./service-store');

const STRIPE_HOST = 'api.stripe.com';

function config(env = process.env) {
  return {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    priceId: env.STRIPE_PRICE_ID || '',
    baseUrl: String(env.SERVICE_BASE_URL || '').replace(/\/+$/, ''),
  };
}

// 課金に必要な設定がそろっているか
function isConfigured(env = process.env) {
  const c = config(env);
  return !!(c.secretKey && c.webhookSecret && c.priceId && /^https?:\/\//.test(c.baseUrl));
}

async function stripeRequest(method, path, params) {
  const c = config();
  if (!c.secretKey) throw new Error('STRIPE_SECRET_KEY が未設定です');
  const body = params ? encodeForm(params) : null;
  const r = await request({
    host: STRIPE_HOST, method, path,
    headers: {
      Authorization: `Bearer ${c.secretKey}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body || undefined,
  });
  if (r.status >= 200 && r.status < 300 && r.json) return r.json;
  const msg = (r.json && r.json.error && r.json.error.message) || `Stripe API エラー (${r.status})`;
  const err = new Error(msg);
  err.status = r.status;
  throw err;
}

// Checkout（サブスクリプション）の作成。戻り値は Stripe の決済ページURL
async function createCheckoutSession({ userId, email, customerId, trialDays = 0 }) {
  const c = config();
  const params = {
    mode: 'subscription',
    'line_items': [{ price: c.priceId, quantity: 1 }],
    success_url: `${c.baseUrl}/service/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.baseUrl}/service/checkout/cancel`,
    client_reference_id: userId,
    locale: 'ja',
    metadata: { user_id: userId },
    subscription_data: { metadata: { user_id: userId }, ...(trialDays > 0 ? { trial_period_days: trialDays } : {}) },
    // トライアルでも支払い方法の登録を必須にする（期間が終わると自動で課金される）
    ...(trialDays > 0 ? { payment_method_collection: 'always' } : {}),
  };
  if (customerId) params.customer = customerId;
  else params.customer_email = email;
  const s = await stripeRequest('POST', '/v1/checkout/sessions', params);
  if (!s.url) throw new Error('決済ページのURLを取得できませんでした');
  return s.url;
}

async function createPortalSession(customerId) {
  const c = config();
  const s = await stripeRequest('POST', '/v1/billing_portal/sessions', {
    customer: customerId, return_url: `${c.baseUrl}/service/app`,
  });
  return s.url;
}

// Webhook署名の検証（Stripe-Signature: t=...,v1=...）。toleranceSec 秒より古いものは拒否
function verifyWebhook(rawBody, sigHeader, secret, toleranceSec = 300, nowMs = Date.now()) {
  if (!secret || !sigHeader) return false;
  const parts = String(sigHeader).split(',').map((p) => p.trim().split('='));
  const t = (parts.find((p) => p[0] === 't') || [])[1];
  const sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const eb = Buffer.from(expected, 'hex');
  return sigs.some((s) => {
    if (!/^[0-9a-f]+$/i.test(s)) return false;
    const sb = Buffer.from(s, 'hex');
    return sb.length === eb.length && crypto.timingSafeEqual(sb, eb);
  });
}

// Stripe の subscription オブジェクトを契約状態に反映する
function periodEndOf(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const sec = sub.current_period_end || (item && item.current_period_end);
  return sec ? new Date(sec * 1000).toISOString() : '';
}
// createdSec: この状態が確定した時刻（Webhookイベントの created、またはAPIで取得した時刻）。
// 保存済みより古い情報（順不同で後から届いたイベント）は反映しない。
function applySubscription(sub, hintedUserId, createdSec) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || '';
  const userId = (sub.metadata && sub.metadata.user_id) || hintedUserId
    || (Subscriptions.findBySubscription(sub.id) || Subscriptions.findByCustomer(customerId) || {}).user_id;
  if (!userId) return null;
  const known = Subscriptions.get(userId);
  // 別の（古い）契約の「終了」を知らせる遅れたイベントで、いまの契約を終了扱いにしない（再契約したあとに届く場合がある）
  if (known && known.stripe_subscription_id && known.stripe_subscription_id !== sub.id && ['canceled', 'incomplete_expired'].includes(sub.status)) return known;
  if (createdSec && known && known.stripe_event_created > createdSec) return known; // 古い情報は無視
  const item = sub.items && sub.items.data && sub.items.data[0];
  const saved = Subscriptions.upsert(userId, {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: periodEndOf(sub),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    price_id: (item && item.price && item.price.id) || '',
    stripe_event_created: createdSec || (known && known.stripe_event_created) || 0,
  });
  // 契約が終了したら、保存しているSNSの連携情報（トークン）を削除し、未投稿の予約を取り消す
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    for (const a of SnsAccounts.listForUser(userId)) SnsAccounts.remove(a.id, userId);
    require('./oauth').revokeAll(userId); // AIアシスタントとの接続とAPIキーも無効にする
    require('./service-store').ApiKeys.revokeAll(userId);
  }
  return saved;
}

// 同じイベントが再送されても二重に処理しない
async function handleEvent(event) {
  if (!event || !event.id || !event.type) return { handled: false };
  if (StripeEvents.seen(event.id)) return { handled: false, duplicate: true };
  const obj = event.data && event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription') break;
      const userId = obj.client_reference_id || (obj.metadata && obj.metadata.user_id);
      if (!userId) break;
      Subscriptions.upsert(userId, {
        stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : '',
        stripe_subscription_id: typeof obj.subscription === 'string' ? obj.subscription : '',
      });
      if (obj.subscription) {
        const sub = await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(obj.subscription)}`);
        applySubscription(sub, userId, Math.floor(Date.now() / 1000));
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      applySubscription(obj, undefined, event.created);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subId = typeof obj.subscription === 'string' ? obj.subscription
        : (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription) || '';
      if (subId) applySubscription(await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(subId)}`), undefined, Math.floor(Date.now() / 1000));
      break;
    }
    default:
      break;
  }
  StripeEvents.mark(event.id, event.type);
  return { handled: true };
}

// 決済ページから戻ってきた直後に、Stripeに直接問い合わせて契約を反映する（Webhookの到着を待つ間に、
// 申込み画面をもう一度開いて2本目の契約を作ってしまうことを防ぐ）。Stripeから取得した情報だけを使い、
// セッションが本人のものであること、決済が完了していることを確認する。
async function syncCheckoutSession(userId, sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) return false;
  const sess = await stripeRequest('GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!sess || sess.client_reference_id !== userId) return false;
  if (sess.status !== 'complete' || typeof sess.subscription !== 'string') return false;
  Subscriptions.upsert(userId, {
    stripe_customer_id: typeof sess.customer === 'string' ? sess.customer : '',
    stripe_subscription_id: sess.subscription,
  });
  const sub = await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(sess.subscription)}`);
  applySubscription(sub, userId, Math.floor(Date.now() / 1000));
  return true;
}

// 解約（次回更新を止める。契約期間の終わりまでは使える）／解約の取り消し
async function setCancelAtPeriodEnd(userId, cancel) {
  const s = Subscriptions.get(userId);
  if (!s || !s.stripe_subscription_id) throw new Error('契約情報が見つかりません');
  const sub = await stripeRequest('POST', `/v1/subscriptions/${encodeURIComponent(s.stripe_subscription_id)}`, {
    cancel_at_period_end: cancel ? 'true' : 'false',
  });
  return applySubscription(sub, userId, Math.floor(Date.now() / 1000));
}

module.exports = {
  isConfigured, config, createCheckoutSession, createPortalSession, verifyWebhook, handleEvent,
  setCancelAtPeriodEnd, applySubscription, stripeRequest, syncCheckoutSession,
};
