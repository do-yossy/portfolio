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

// ---- 請求の方式: 7日間の無料体験のあと、月額1,980円(税込)。体験が終わった日から、毎月同じ日に自動で更新 ----
// 以前の「申込月は日割り・毎月1日に更新」は、無料体験と合わせられないため、やめた(2026-11-16 代表決定)
export const TRIAL_DAYS = 7;
const TRIAL_NOTE = `${TRIAL_DAYS}日間の無料体験のあと、月額1,980円(税込)が自動で請求され、以後、毎月自動で更新されます。体験期間中に解約すれば、料金はかかりません。`;

export function createCheckoutSession(env, origin, nowMs = Date.now(), src = '') {
  const params = {
    mode: 'subscription',
    'subscription_data[trial_period_days]': String(TRIAL_DAYS),
    payment_method_collection: 'always',
    'custom_text[submit][message]': TRIAL_NOTE,
    // 会社が販売者として売る前提(特商法表記)。Managed Payments(Stripeが販売者)は使わない
    'managed_payments[enabled]': 'false',
    // 閲覧者の国に合わせた通貨の自動変換(Adaptive Pricing)は使わない。常に円(1,980円も円)で表示・請求する
    'adaptive_pricing[enabled]': 'false',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  };
  // 流入元(note・threads など)を、契約に記録する。個人を特定する情報は入れない
  if (src) {
    params['metadata[src]'] = src;
    params['subscription_data[metadata][src]'] = src;
  }
  return api(env, 'POST', '/checkout/sessions', params);
}

export const getCheckoutSession = (env, id) => api(env, 'GET', `/checkout/sessions/${encodeURIComponent(id)}`);

export const createPortalSession = (env, customer, returnUrl) =>
  api(env, 'POST', '/billing_portal/sessions', { customer, return_url: returnUrl });
