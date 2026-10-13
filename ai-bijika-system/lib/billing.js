'use strict';
// 月額課金（Stripe）。Stripe REST を node:https で直接呼ぶ（SDKは使わない。追加依存なし）。
// 決済の状態（契約中か）は Webhook を唯一の真実とし、Checkoutの戻りURLだけでは契約中にしない。
const crypto = require('crypto');
const { request, encodeForm } = require('./http-client');
const { Subscriptions, StripeEvents } = require('./service-store');

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
async function createCheckoutSession({ userId, email, customerId }) {
  const c = config();
  const params = {
    mode: 'subscription',
    'line_items': [{ price: c.priceId, quantity: 1 }],
    success_url: `${c.baseUrl}/service/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.baseUrl}/service/checkout/cancel`,
    client_reference_id: userId,
    locale: 'ja',
    metadata: { user_id: userId },
    subscription_data: { metadata: { user_id: userId } },
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
function applySubscription(sub, hintedUserId) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || '';
  const userId = (sub.metadata && sub.metadata.user_id) || hintedUserId
    || (Subscriptions.findBySubscription(sub.id) || Subscriptions.findByCustomer(customerId) || {}).user_id;
  if (!userId) return null;
  const item = sub.items && sub.items.data && sub.items.data[0];
  return Subscriptions.upsert(userId, {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: periodEndOf(sub),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    price_id: (item && item.price && item.price.id) || '',
  });
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
        applySubscription(sub, userId);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      applySubscription(obj);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subId = typeof obj.subscription === 'string' ? obj.subscription
        : (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription) || '';
      if (subId) applySubscription(await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(subId)}`));
      break;
    }
    default:
      break;
  }
  StripeEvents.mark(event.id, event.type);
  return { handled: true };
}

// 解約（次回更新を止める。契約期間の終わりまでは使える）／解約の取り消し
async function setCancelAtPeriodEnd(userId, cancel) {
  const s = Subscriptions.get(userId);
  if (!s || !s.stripe_subscription_id) throw new Error('契約情報が見つかりません');
  const sub = await stripeRequest('POST', `/v1/subscriptions/${encodeURIComponent(s.stripe_subscription_id)}`, {
    cancel_at_period_end: cancel ? 'true' : 'false',
  });
  return applySubscription(sub, userId);
}

module.exports = {
  isConfigured, config, createCheckoutSession, createPortalSession, verifyWebhook, handleEvent,
  setCancelAtPeriodEnd, applySubscription, stripeRequest,
};
