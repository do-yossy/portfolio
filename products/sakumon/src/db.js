// D1 アクセス。契約者(members)と処理済みイベント(events)。
const now = () => Math.floor(Date.now() / 1000);

export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// 既存の契約者は上書きしない(Checkout 直後に確認用で呼ばれても状態を巻き戻さない)
export async function insertMemberIfAbsent(db, { customer, subscription, email, status }) {
  await db
    .prepare('INSERT OR IGNORE INTO members (customer_id, token, email, subscription_id, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(customer, newToken(), email || null, subscription || null, status, now())
    .run();
  return db.prepare('SELECT * FROM members WHERE customer_id = ?').bind(customer).first();
}

// Webhook 用。行が無ければ作り、あれば状態を更新する(イベントの到着順が前後しても収束する)
export async function upsertMember(db, { customer, subscription, email, status }) {
  await insertMemberIfAbsent(db, { customer, subscription, email, status });
  await db
    .prepare('UPDATE members SET status = ?, subscription_id = COALESCE(?, subscription_id), email = COALESCE(?, email), updated_at = ? WHERE customer_id = ?')
    .bind(status, subscription || null, email || null, now(), customer)
    .run();
}

export async function setStatus(db, customer, status, onlyIfNot) {
  await db
    .prepare('UPDATE members SET status = ?, updated_at = ? WHERE customer_id = ? AND status != ?')
    .bind(status, now(), customer, onlyIfNot || '')
    .run();
}

export const findByToken = (db, token) => db.prepare('SELECT * FROM members WHERE token = ?').bind(token).first();

// 初回なら true。同じイベントの再送は false
export async function recordEvent(db, id) {
  const r = await db.prepare('INSERT OR IGNORE INTO events (id, created_at) VALUES (?, ?)').bind(id, now()).run();
  return (r.meta?.changes ?? r.changes) > 0;
}

export const forgetEvent = (db, id) => db.prepare('DELETE FROM events WHERE id = ?').bind(id).run();

export const isActive = (m) => !!m && (m.status === 'active' || m.status === 'trialing');

// ---- ブラウザ単位の会員証 ----
export const MAX_DEVICES = 3;

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 1回の申込(Checkout Session)から会員証を受け取れるのは最初の1回だけ。初回なら true
export async function claimCheckout(db, checkoutId) {
  const r = await db.prepare('INSERT OR IGNORE INTO claimed_checkouts (id, created_at) VALUES (?, ?)').bind(checkoutId, now()).run();
  return (r.meta?.changes ?? r.changes) > 0;
}

// 新しい会員証を発行する。同じ契約の端末が MAX_DEVICES を超えないよう、古いものから失効させる
export async function createSession(db, customer, token) {
  await db
    .prepare('DELETE FROM sessions WHERE customer_id = ? AND id NOT IN (SELECT id FROM sessions WHERE customer_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)')
    .bind(customer, customer, MAX_DEVICES - 1)
    .run();
  await db.prepare('INSERT INTO sessions (id, customer_id, created_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), customer, now()).run();
}

export async function findBySession(db, token) {
  if (!token) return null;
  return db
    .prepare('SELECT m.* FROM sessions s JOIN members m ON m.customer_id = s.customer_id WHERE s.id = ?')
    .bind(await sha256Hex(token))
    .first();
}
