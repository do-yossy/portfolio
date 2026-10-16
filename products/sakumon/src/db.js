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
