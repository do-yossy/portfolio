// Stripe の署名検証と、イベント → 契約状態への反映。依存ゼロ(Web Crypto のみ)。

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Stripe-Signature: t=タイムスタンプ,v1=署名[,v1=署名...]
export async function verifyStripeSignature(rawBody, header, secret, { now = Date.now() / 1000, tolerance = 300 } = {}) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(now - Number(t)) > tolerance) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}

export const ACTIVE = new Set(['active', 'trialing']);

// 対象イベントだけを契約状態の更新に変換する。対象外は null。
export function eventToUpdate(event) {
  const o = event?.data?.object;
  if (!o) return null;
  switch (event.type) {
    case 'checkout.session.completed':
      if (!o.customer) return null;
      return { customer: o.customer, email: o.customer_details?.email ?? o.customer_email ?? null, status: null };
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return { customer: o.customer, email: null, status: o.status };
    case 'customer.subscription.deleted':
      return { customer: o.customer, email: null, status: 'canceled' };
    case 'invoice.paid':
      return { customer: o.customer, email: null, status: 'active' };
    case 'invoice.payment_failed':
      return { customer: o.customer, email: null, status: 'past_due' };
    default:
      return null;
  }
}

// 古いイベントが新しい状態を上書きしないよう、created の新しいものだけ反映する(再送にも強い)。
export async function applyEvent(db, event) {
  const u = eventToUpdate(event);
  if (!u || !u.customer) return false;
  const created = event.created ?? 0;
  const cur = await db.prepare('SELECT status, updated_at FROM subscriptions WHERE customer_id = ?').bind(u.customer).first();
  if (!cur) {
    await db
      .prepare('INSERT INTO subscriptions (customer_id, email, status, updated_at) VALUES (?, ?, ?, ?)')
      .bind(u.customer, u.email, u.status ?? 'incomplete', created)
      .run();
    return true;
  }
  if (u.email) await db.prepare('UPDATE subscriptions SET email = ? WHERE customer_id = ?').bind(u.email, u.customer).run();
  if (u.status && created >= cur.updated_at) {
    await db.prepare('UPDATE subscriptions SET status = ?, updated_at = ? WHERE customer_id = ?').bind(u.status, created, u.customer).run();
  }
  return true;
}

export async function isActive(db, customer) {
  const row = await db.prepare('SELECT status FROM subscriptions WHERE customer_id = ?').bind(customer).first();
  return !!row && ACTIVE.has(row.status);
}
