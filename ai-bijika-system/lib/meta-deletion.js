'use strict';
// Meta（Threads・Instagram・Facebook）から届く「データ削除の求め」と「連携の取り消しの知らせ」の処理。
// どちらも、該当するSNSアカウントの連携を、そのアカウントを本サービスで連携している全員分、マイページの「解除」と同じように消す
// （連携の行とトークンの削除、未投稿の予約・下書きと自動運用の取り消し、投稿済みの予約の投稿ID・リンクの削除：SnsAccounts.remove）。
// 扱いは、プライバシーポリシーの5（2項・3項）と、データ削除の手順のページ（/service/legal/data-deletion）に書いたものと合わせること。
// 署名の検証は lib/meta-signed-request.js。HTTPの受け口は lib/service-routes.js（ログイン不要）。
const crypto = require('crypto');
const { db, generateId, now } = require('../db');
const { SnsAccounts, transaction } = require('./service-store');

db.exec(`
  CREATE TABLE IF NOT EXISTS meta_deletion_requests (
    code TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    removed INTEGER NOT NULL DEFAULT 0,
    received INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sns_removal_notices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    dismissed_at TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_sns_removal_notices_user ON sns_removal_notices(user_id);
`);
// meta_deletion_requests に残すのは、次の列だけ（届いた求めを特定できる値は残さない）：
//   code：確認コード（Metaに返し、状況のページのURLに入れる。推測できない乱数。求めごとに新しく出す）
//   platform：SNS／kind：deletion（データ削除の求め）・deauthorize（連携の取り消しの知らせ）
//   status：completed（受け付けて処理を終えた）。今は受け取ったその場で処理するため、ほかの状態は使っていない
//   removed：消した連携の数（運営者の確認用。状況のページには、0件かどうかだけを出す）
//   received：受け取った回数（求めごとに確認コードを新しく出すため、今は1）
//   created_at・updated_at：受け付けた日時
// SNS側の利用者ID（user_id）と、signed_request の中身から決まる値（ハッシュにしたものを含む）は保存しない。
// そのため、同じ求めが2回届いても見分けず、2回目にも新しい確認コードを返す（そのときに残っている連携があれば、それも消す）

const PLATFORMS = ['threads', 'instagram', 'facebook'];
const KINDS = ['deletion', 'deauthorize'];
const CODE_RE = /^[a-f0-9]{32}$/;

// 求めを処理する。userId は signed_request の user_id（照合にだけ使い、保存しない）。
// 戻り値 { code, removed }
function handle({ platform, kind, userId }) {
  if (!PLATFORMS.includes(platform) || !KINDS.includes(kind)) throw new Error('unknown platform or kind');
  const r = transaction(() => {
    const t = now();
    const rows = SnsAccounts.findByProviderId(platform, userId);
    const notified = new Set();
    for (const a of rows) {
      SnsAccounts.remove(a.id, a.user_id);
      // 連携が消えたことを、その利用者のマイページで知らせる（同じ利用者・同じSNSは1件にまとめる）
      if (!notified.has(a.user_id)) {
        notified.add(a.user_id);
        Notices.add(a.user_id, platform, kind, t);
      }
    }
    const code = crypto.randomBytes(16).toString('hex');
    db.prepare(`INSERT INTO meta_deletion_requests (code, platform, kind, status, removed, received, created_at, updated_at)
      VALUES (?, ?, ?, 'completed', ?, 1, ?, ?)`).run(code, platform, kind, rows.length, t, t);
    return { code, removed: rows.length };
  });
  // 該当する連携が無かった（すでに解除済み・本サービスで連携していない・届いたIDの種類が保存したIDと違う など）。
  // 運営者が気づけるよう、SNS・種類・確認コードだけをログに出す（IDは出さない）
  if (r.removed === 0) console.warn('[meta] 該当する連携が見つかりませんでした', platform, kind, r.code);
  return r;
}

// 状況のページ用（ログイン不要で開くため、利用者やSNSアカウントを特定できる情報は返さない）。
// found：該当する連携があって削除したか（件数は出さない）
function getRequest(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!CODE_RE.test(c)) return null;
  const row = db.prepare('SELECT code, platform, kind, status, removed, created_at, updated_at FROM meta_deletion_requests WHERE code = ?').get(c);
  if (!row) return null;
  const { removed, ...rest } = row;
  return { ...rest, found: removed > 0 };
}

// マイページの知らせ（SNS側の操作や、再連携が必要なまま期限が過ぎたことで、連携の情報を削除したこと）。閉じるまで、または90日間表示する
// kind：deletion・deauthorize（Metaから）／expired（YouTube：再連携が必要なまま28日たった。lib/sns/scheduler.js の YOUTUBE_REAUTH_DELETE_DAYS）
const NOTICE_DAYS = 90;
const Notices = {
  add(userId, platform, kind, t = now()) {
    db.prepare('INSERT INTO sns_removal_notices (id, user_id, platform, kind, created_at) VALUES (?, ?, ?, ?, ?)').run(generateId(), userId, platform, kind, t);
  },
  listForUser(userId, nowMs = Date.now()) {
    const since = new Date(nowMs - NOTICE_DAYS * 24 * 3600 * 1000).toISOString();
    return db.prepare("SELECT id, platform, kind, created_at FROM sns_removal_notices WHERE user_id = ? AND dismissed_at = '' AND created_at >= ? ORDER BY created_at DESC LIMIT 10").all(userId, since);
  },
  dismiss(id, userId) {
    return db.prepare("UPDATE sns_removal_notices SET dismissed_at = ? WHERE id = ? AND user_id = ? AND dismissed_at = ''").run(now(), id, userId).changes === 1;
  },
};

module.exports = { PLATFORMS, KINDS, handle, getRequest, Notices };
