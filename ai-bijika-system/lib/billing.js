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
    // 30件プラン（SNS運用代行向け）の価格ID。未設定なら30件プランは売らない（lib/service-core.js の agencyOffered）
    priceIdAgency: env.STRIPE_PRICE_ID_AGENCY || '',
    baseUrl: String(env.SERVICE_BASE_URL || '').replace(/\/+$/, ''),
  };
}

// 課金に必要な設定がそろっているか
function isConfigured(env = process.env) {
  const c = config(env);
  return !!(c.secretKey && c.webhookSecret && c.priceId && /^https?:\/\//.test(c.baseUrl));
}

// opts.idempotencyKey：同じ呼び出しを繰り返しても1回しか実行されないようにする Idempotency-Key ヘッダー（Stripeの公式の仕組み。24時間で失効）
async function stripeRequest(method, path, params, opts = {}) {
  const c = config();
  if (!c.secretKey) throw new Error('STRIPE_SECRET_KEY が未設定です');
  const body = params ? encodeForm(params) : null;
  const r = await request({
    host: STRIPE_HOST, method, path,
    headers: {
      Authorization: `Bearer ${c.secretKey}`,
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
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
// plan：'standard'（通常）／'agency'（30件プラン。STRIPE_PRICE_ID_AGENCY が未設定なら作らない）
async function createCheckoutSession({ userId, email, customerId, trialDays = 0, plan = 'standard' }) {
  const c = config();
  if (plan === 'agency' && !c.priceIdAgency) throw new Error('30件プランの価格（STRIPE_PRICE_ID_AGENCY）が未設定です');
  const params = {
    mode: 'subscription',
    'line_items': [{ price: plan === 'agency' ? c.priceIdAgency : c.priceId, quantity: 1 }],
    success_url: `${c.baseUrl}/service/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.baseUrl}/service/checkout/cancel`,
    client_reference_id: userId,
    locale: 'ja',
    // お支払い方法はクレジットカードだけにする（特商法表記・利用規約・画面の「クレジットカード」と合わせる。変えるときは、それらも直す）
    payment_method_types: ['card'],
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
  const priceId = (item && item.price && item.price.id) || '';
  // プランは、契約の価格IDから判定して同期する（Webhookが唯一の真実）。どちらの価格でもない・価格が付いていないイベントでは、プランを変えない
  const plan = require('./service-core').planFromPriceId(priceId);
  const nowPlan = plan || (known && known.plan) || 'standard';
  // 次回の更新日からの切り替えの予約：切り替わった（プランが予約のプランになった）か、Stripe側で予約が無くなった（schedule が null）ら空にする
  // （schedule の項目が無いオブジェクトでは判断しない）
  let pending = (known && known.pending_plan) || '';
  if (pending && (nowPlan === pending || sub.schedule === null)) pending = '';
  const saved = Subscriptions.upsert(userId, {
    ...(plan ? { plan } : {}),
    pending_plan: pending,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: periodEndOf(sub),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    price_id: priceId,
    stripe_event_created: createdSec || (known && known.stripe_event_created) || 0,
  });
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    endAccess(userId);
    // 紹介された人が、最初の有料の請求の前に契約を終えたら、紹介の特典は付けない
    require('./referral').onSubscriptionEnded(userId);
  }
  return saved;
}

// 利用の終了：保存しているSNSの連携情報（トークン）を削除し、未投稿の予約を取り消し、
// AIアシスタントとの接続とAPIキーも無効にする。
// YouTube は、行を消す前に Google へトークンの取り消しを送る（失敗しても消す：lib/sns/disconnect.js）。
// 行の削除はこの関数の中で済ませる。戻り値は取り消しの結果の Promise（reject しない。待たなくてよい）
function endAccess(userId) {
  const { removeAccount } = require('./sns/disconnect');
  const revoking = SnsAccounts.listForUser(userId).map((a) => removeAccount(a));
  require('./oauth').revokeAll(userId);
  require('./service-store').ApiKeys.revokeAll(userId);
  return Promise.all(revoking);
}

// 運営者による「テスト利用」の付与・取り消し（動作確認用。Stripeを通さない）
// 付与する前の状態を覚えておき、取り消すときに戻す（解約済みの元の契約者が、取り消し後にまた申し込めるように）
function grantTest(userId) {
  const { OPEN_STRIPE_STATUSES } = require('./service-store');
  const cur = Subscriptions.get(userId);
  if (cur && cur.stripe_subscription_id && OPEN_STRIPE_STATUSES.has(cur.status)) {
    return { ok: false, error: 'このアカウントには、Stripeの契約があります。テスト利用は付与できません。' };
  }
  if (cur && cur.status === 'test') return { ok: true };
  Subscriptions.upsert(userId, { status: 'test', pre_test_status: (cur && cur.status) || 'none' });
  return { ok: true };
}
function revokeTest(userId) {
  const cur = Subscriptions.get(userId);
  if (!cur || cur.status !== 'test') return { ok: false, error: 'このアカウントは、テスト利用中ではありません。' };
  const back = cur.stripe_subscription_id ? (cur.pre_test_status && cur.pre_test_status !== 'test' ? cur.pre_test_status : 'canceled') : 'none';
  Subscriptions.upsert(userId, { status: back, pre_test_status: '' });
  endAccess(userId);
  return { ok: true };
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
      if (subId) {
        const saved = applySubscription(await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(subId)}`), undefined, Math.floor(Date.now() / 1000));
        // 紹介された人の、無料期間のあとの最初の有料の請求（amount_paid > 0）が払われたら、紹介した人に特典を付ける。
        // 付与に失敗したら例外のまま（Webhookが500になり、Stripeが再送する。このイベントは処理済みにしない）
        if (event.type === 'invoice.paid' && saved && Number(obj.amount_paid) > 0) await require('./referral').onFirstPaidInvoice(saved.user_id);
      }
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
  // 通常プランへの切り替えを予約している（subscription schedule が付いている）間は、先に予約を外す
  // （schedule が付いた契約を直接更新できるかは未確認。解約すれば切り替えは不要になるため）
  if (cancel && s.pending_plan) await releasePlanSchedule(userId);
  const sub = await stripeRequest('POST', `/v1/subscriptions/${encodeURIComponent(s.stripe_subscription_id)}`, {
    cancel_at_period_end: cancel ? 'true' : 'false',
  });
  return applySubscription(sub, userId, Math.floor(Date.now() / 1000));
}

// ── プランの変更 ──
// 通常→30件：すぐ切り替える。契約の items の価格を入れ替え、日割りは proration_behavior=create_prorations（次回の請求に日割りの差額が載る）。
// 30件→通常：次回の更新日から。Stripe の subscription schedule（from_subscription で作り、現在の期間のあとに通常の価格のフェーズを足す）で予約する。
//   連携が通常プランの上限を超えているときは断る（解除してから変えてもらう）。無料期間中は、まだ請求が無いため、すぐ切り替える（最初の請求から通常の価格）。
// ※ 呼び出し方は Stripe の公式ドキュメント（Subscription schedules・Update a subscription）に合わせたが、実物のStripe（テストモード）では未確認。
const NOW_SEC = () => Math.floor(Date.now() / 1000);
const priceIdOf = (price) => (price && typeof price === 'object' ? price.id : price) || '';
const fail = (error) => ({ ok: false, error });

async function changePlan(userId, target) {
  const core = require('./service-core');
  const c = config();
  const cur = Subscriptions.get(userId);
  if (!['standard', 'agency'].includes(target)) return fail('プランが正しくありません。');
  if (!cur || !cur.stripe_subscription_id) return fail('契約情報が見つかりません。');
  if (!['active', 'trialing'].includes(cur.status)) return fail('お支払いが確認できている契約のときだけ、プランを変更できます。');
  if (cur.cancel_at_period_end) return fail('解約の手続き中は、プランを変更できません。先に解約を取り消してください。');
  const plan = core.planOf(cur);
  const subPath = `/v1/subscriptions/${encodeURIComponent(cur.stripe_subscription_id)}`;

  if (target === plan) {
    // 30件プランで、通常への切り替えを予約している場合の「予約の取り消し」
    if (plan === 'agency' && cur.pending_plan === 'standard') { await releasePlanSchedule(userId); return { ok: true, released: true }; }
    return { ok: true, unchanged: true };
  }

  if (target === 'agency') {
    if (!core.agencyOffered() || !c.priceIdAgency) return fail('30件プランは、現在お申込みいただけません。');
    const sub = await stripeRequest('GET', subPath);
    const items = (sub.items && sub.items.data) || [];
    if (items.length !== 1) return fail('契約の内容を確認できませんでした。お問い合わせください。');
    if (sub.schedule) return fail('予約中の変更があるため、プランを変更できません。お問い合わせください。');
    const updated = await stripeRequest('POST', subPath, {
      items: [{ id: items[0].id, price: c.priceIdAgency }],
      proration_behavior: 'create_prorations',
    });
    applySubscription(updated, userId, NOW_SEC());
    // Webhookの前に画面へ反映する（価格IDから判定できなかった場合に備えて、変更したプランを直接保存する）
    Subscriptions.upsert(userId, { plan: 'agency' });
    return { ok: true, plan: 'agency' };
  }

  // 30件 → 通常
  const n = SnsAccounts.countForUser(userId);
  const max = core.LIMITS.maxAccounts;
  if (n > max) return fail(`連携しているSNSアカウントが${n}件あります。通常プランは${max}件までのため、${n - max}件以上を解除してから変更してください。`);
  if (cur.pending_plan === 'standard') return { ok: true, unchanged: true };
  const sub = await stripeRequest('GET', subPath);
  const items = (sub.items && sub.items.data) || [];
  if (items.length !== 1) return fail('契約の内容を確認できませんでした。お問い合わせください。');
  if (sub.schedule) return fail('予約中の変更があるため、プランを変更できません。お問い合わせください。');
  if (sub.status === 'trialing') {
    const updated = await stripeRequest('POST', subPath, { items: [{ id: items[0].id, price: c.priceId }], proration_behavior: 'none' });
    applySubscription(updated, userId, NOW_SEC());
    Subscriptions.upsert(userId, { plan: 'standard' });
    return { ok: true, plan: 'standard', immediate: true };
  }
  const sched = await stripeRequest('POST', '/v1/subscription_schedules', { from_subscription: sub.id });
  const p0 = sched && sched.phases && sched.phases[0];
  const i0 = p0 && p0.items && p0.items[0];
  if (!sched.id || !p0 || !i0) return fail('プランの変更を予約できませんでした。時間をおいてもう一度お試しください。');
  // 更新では、残す現在のフェーズも、指定しない項目は消えるため、全部渡す（公式の説明）。契約のメタデータ（user_id）も渡す
  await stripeRequest('POST', `/v1/subscription_schedules/${encodeURIComponent(sched.id)}`, {
    end_behavior: 'release',
    phases: [
      { items: [{ price: priceIdOf(i0.price), quantity: i0.quantity || 1 }], start_date: p0.start_date, end_date: p0.end_date, metadata: { user_id: userId } },
      { items: [{ price: c.priceId, quantity: 1 }], duration: { interval: 'month', interval_count: 1 }, proration_behavior: 'none', metadata: { user_id: userId } },
    ],
  });
  // 古いイベントで予約の表示が消えないよう、確定した時刻も進める
  Subscriptions.upsert(userId, { pending_plan: 'standard', stripe_event_created: NOW_SEC() });
  return { ok: true, plan: 'agency', scheduled: 'standard' };
}

// 通常プランへの切り替えの予約を取り消す（契約はそのまま。subscription schedule を release する）
async function releasePlanSchedule(userId) {
  const cur = Subscriptions.get(userId);
  if (!cur || !cur.stripe_subscription_id) return { ok: false };
  const sub = await stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(cur.stripe_subscription_id)}`);
  const sid = sub.schedule && typeof sub.schedule === 'object' ? sub.schedule.id : sub.schedule;
  if (sid) await stripeRequest('POST', `/v1/subscription_schedules/${encodeURIComponent(sid)}/release`);
  Subscriptions.upsert(userId, { pending_plan: '' });
  return { ok: true };
}

module.exports = {
  changePlan, releasePlanSchedule,
  isConfigured, config, createCheckoutSession, createPortalSession, verifyWebhook, handleEvent,
  setCancelAtPeriodEnd, applySubscription, stripeRequest, syncCheckoutSession, endAccess, grantTest, revokeTest,
};
