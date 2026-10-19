// Stripe 連携(依存ゼロ)。署名検証は Web Crypto、API 呼び出しは fetch。
const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Stripe-Signature: t=...,v1=...,v1=...  → 署名一致かつ許容時間内なら true
export async function verifySignature(body, header, secret, nowSec = Date.now() / 1000, tolerance = 300) {
  if (!header || !secret) return false;
  let t = null;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSec - Number(t)) > tolerance) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`)));
  return v1.some((s) => safeEqual(s, expected));
}

async function api(env, method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json?.error?.message || 'error'}`);
  return json;
}

// ---- 請求の方式: 申込月は日割り、翌月1日(日本時間0時)から毎月1日に自動継続 ----
const JST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// 残りがこれより短いと、日割り額がJPYの最低決済額(50円)を下回りうるので、日割り請求をしない(次の1日まで無料)
const MIN_PRORATION_MS = 2 * DAY_MS;

// 翌月1日0時(日本時間)のUNIX秒と、申込月の扱い(日割りにするか)
export function billingPlan(nowMs = Date.now()) {
  const jst = new Date(nowMs + JST_MS);
  const anchorMs = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 1, 1) - JST_MS;
  return {
    anchor: Math.floor(anchorMs / 1000),
    proration: anchorMs - nowMs < MIN_PRORATION_MS ? 'none' : 'create_prorations',
  };
}

export function createCheckoutSession(env, origin, nowMs = Date.now()) {
  const plan = billingPlan(nowMs);
  return api(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    'subscription_data[billing_cycle_anchor]': String(plan.anchor),
    'subscription_data[proration_behavior]': plan.proration,
    // 会社が販売者として売る前提(特商法表記)。Managed Payments(Stripeが販売者)は使わない
    'managed_payments[enabled]': 'false',
    // 閲覧者の国に合わせた通貨の自動変換(Adaptive Pricing)は使わない。常に円(980円・日割りも円)で表示・請求する
    'adaptive_pricing[enabled]': 'false',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  });
}

export const getCheckoutSession = (env, id) => api(env, 'GET', `/checkout/sessions/${encodeURIComponent(id)}`);

export const createPortalSession = (env, customer, returnUrl) =>
  api(env, 'POST', '/billing_portal/sessions', { customer, return_url: returnUrl });
