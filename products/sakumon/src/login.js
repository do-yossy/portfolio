// メールの確認コードでのログイン。コードはハッシュで保存し、期限・回数・送信間隔を制限する。
import { createSession, newToken, isActive } from './db.js';

const now = () => Math.floor(Date.now() / 1000);
export const CODE_TTL = 600; // 10分
const RESEND_INTERVAL = 60; // 同じアドレスへは60秒に1通まで
const HOURLY_LIMIT = 5; // 1時間に5通まで
const MAX_ATTEMPTS = 5; // コードの入力は5回まで

export const normalizeEmail = (s) => String(s || '').trim().toLowerCase();
export const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  // 6桁。偏りが出ないよう、拒否サンプリングで作る
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1000000) * 1000000;
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return String(buf[0] % 1000000).padStart(6, '0');
}

const memberByEmail = (db, email) =>
  db.prepare('SELECT * FROM members WHERE lower(email) = ? ORDER BY updated_at DESC LIMIT 1').bind(email).first();

// 契約中の人のアドレスなら、コードを発行して返す。該当なし・送信制限中は null(呼び出し側は同じ画面を返す)
export async function issueCode(db, rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!looksLikeEmail(email)) return null;
  const member = await memberByEmail(db, email);
  if (!isActive(member)) return null;

  const t = now();
  const row = await db.prepare('SELECT * FROM login_codes WHERE email = ?').bind(email).first();
  if (row && t - row.last_sent < RESEND_INTERVAL) return null;
  const fresh = !row || t - row.window_start > 3600;
  const windowStart = fresh ? t : row.window_start;
  const sent = fresh ? 0 : row.sent_in_window;
  if (sent >= HOURLY_LIMIT) return null;

  const code = randomCode();
  await db
    .prepare(
      `INSERT INTO login_codes (email, code_hash, expires_at, attempts, last_sent, window_start, sent_in_window)
       VALUES (?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
         last_sent = excluded.last_sent, window_start = excluded.window_start, sent_in_window = excluded.sent_in_window`,
    )
    .bind(email, await sha256Hex(`${email}:${code}`), t + CODE_TTL, t, windowStart, sent + 1)
    .run();
  return { email, code };
}

// コードが正しければ、新しい会員証(Cookie用トークン)を発行して返す。違えば null
export async function verifyCode(db, rawEmail, rawCode) {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').replace(/\s/g, '');
  if (!looksLikeEmail(email) || !/^\d{6}$/.test(code)) return null;
  const row = await db.prepare('SELECT * FROM login_codes WHERE email = ?').bind(email).first();
  if (!row || row.expires_at < now() || row.attempts >= MAX_ATTEMPTS) return null;

  // 先に試行回数を進める(総当たり対策)
  await db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
  if ((await sha256Hex(`${email}:${code}`)) !== row.code_hash) return null;

  const member = await memberByEmail(db, email);
  if (!isActive(member)) return null;
  // 1回使ったコードは使えない。消せなかった(=他の誰かが先に使った)場合は失敗にする
  const del = await db.prepare('DELETE FROM login_codes WHERE email = ? AND code_hash = ?').bind(email, row.code_hash).run();
  if (!((del.meta?.changes ?? del.changes) > 0)) return null;

  const token = newToken();
  await createSession(db, member.customer_id, token);
  return token;
}

// Resend でコードをメール送信する。送れなければ例外
export async function sendCodeMail(env, email, code) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error('mail not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [email],
      subject: '【サクモン】ログイン確認コード',
      text: `サクモンのログイン確認コードです。\n\n    ${code}\n\nこのコードは${CODE_TTL / 60}分間有効です。\nログイン画面に入力してください。\n\nこのメールに心当たりがない場合は、何もせずに破棄してください。コードを他の人に教えないでください。`,
    }),
  });
  if (!res.ok) throw new Error(`mail send failed: ${res.status}`);
}
