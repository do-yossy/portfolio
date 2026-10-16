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

export function createCheckoutSession(env, origin) {
  return api(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  });
}

export const getCheckoutSession = (env, id) => api(env, 'GET', `/checkout/sessions/${encodeURIComponent(id)}`);

export const createPortalSession = (env, customer, returnUrl) =>
  api(env, 'POST', '/billing_portal/sessions', { customer, return_url: returnUrl });
