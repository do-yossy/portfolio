'use strict';
// 月額SNS自動投稿サービス用のテーブルとモデル。
// 既存の db.js は変更せず、同じDB接続（db.js が export する db）に冪等な CREATE TABLE IF NOT EXISTS で追加する。
const { db, generateId, now } = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT DEFAULT '',
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_used_at TEXT DEFAULT '',
    revoked_at TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

  CREATE TABLE IF NOT EXISTS upload_tickets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS ai_usage (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day, kind)
  );
  CREATE TABLE IF NOT EXISTS ai_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    prompt TEXT NOT NULL,
    operation TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    media_id TEXT DEFAULT '',
    error TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auto_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    theme TEXT NOT NULL,
    tone TEXT DEFAULT '',
    with_image INTEGER NOT NULL DEFAULT 0,
    hour_jst INTEGER NOT NULL DEFAULT 9,
    mode TEXT NOT NULL DEFAULT 'draft',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_day TEXT DEFAULT '',
    last_error TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY,
    stripe_customer_id TEXT DEFAULT '',
    stripe_subscription_id TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'none',
    current_period_end TEXT DEFAULT '',
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    price_id TEXT DEFAULT '',
    agreed_at TEXT DEFAULT '',
    agreed_version TEXT DEFAULT '',
    stripe_event_created INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_sub ON subscriptions(stripe_subscription_id);

  CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sns_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    external_user_id TEXT NOT NULL,
    handle TEXT DEFAULT '',
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT DEFAULT '',
    expires_at TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, platform, external_user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sns_accounts_user ON sns_accounts(user_id);

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    code_verifier TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scheduled_posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    text TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT DEFAULT '',
    external_id TEXT DEFAULT '',
    posted_at TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due ON scheduled_posts(status, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user ON scheduled_posts(user_id, scheduled_at);
`);

try { db.exec('ALTER TABLE subscriptions ADD COLUMN stripe_event_created INTEGER NOT NULL DEFAULT 0'); } catch { /* 既にある */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_media_user ON media_assets(user_id);
`);
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN media_id TEXT DEFAULT ''"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN options TEXT DEFAULT '{}'"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN category TEXT DEFAULT ''"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN media_ids TEXT DEFAULT '[]'"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN tree TEXT DEFAULT '[]'"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN group_id TEXT DEFAULT ''"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN platform TEXT DEFAULT ''"); } catch { /* 既にある */ }
db.exec(`
  CREATE TABLE IF NOT EXISTS post_media (
    post_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    PRIMARY KEY (post_id, media_id)
  );
  CREATE INDEX IF NOT EXISTS idx_post_media_media ON post_media(media_id);
  CREATE INDEX IF NOT EXISTS idx_scheduled_posts_group ON scheduled_posts(group_id);
`);
// 従来の1メディアの予約を、新しい対応表にも反映する
db.exec("INSERT OR IGNORE INTO post_media (post_id, media_id) SELECT id, media_id FROM scheduled_posts WHERE media_id != ''");

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

const Subscriptions = {
  get(userId) {
    return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) || null;
  },
  findByCustomer(customerId) {
    if (!customerId) return null;
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_customer_id = ?').get(customerId) || null;
  },
  findBySubscription(subId) {
    if (!subId) return null;
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(subId) || null;
  },
  // 指定した項目だけを更新する（なければ作成）
  upsert(userId, fields) {
    const t = now();
    const cur = this.get(userId);
    if (!cur) {
      db.prepare(`INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end,
        cancel_at_period_end, price_id, agreed_at, agreed_version, stripe_event_created, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        userId, fields.stripe_customer_id || '', fields.stripe_subscription_id || '', fields.status || 'none',
        fields.current_period_end || '', fields.cancel_at_period_end ? 1 : 0, fields.price_id || '',
        fields.agreed_at || '', fields.agreed_version || '', fields.stripe_event_created || 0, t, t);
      return this.get(userId);
    }
    const next = { ...cur, ...fields };
    db.prepare(`UPDATE subscriptions SET stripe_customer_id=?, stripe_subscription_id=?, status=?, current_period_end=?,
      cancel_at_period_end=?, price_id=?, agreed_at=?, agreed_version=?, stripe_event_created=?, updated_at=? WHERE user_id=?`).run(
      next.stripe_customer_id || '', next.stripe_subscription_id || '', next.status || 'none', next.current_period_end || '',
      next.cancel_at_period_end ? 1 : 0, next.price_id || '', next.agreed_at || '', next.agreed_version || '', next.stripe_event_created || 0, t, userId);
    return this.get(userId);
  },
  // サービスを使える状態か（契約中、または解約手続き済みでも期間末まで）
  isActive(userId) {
    const s = this.get(userId);
    return !!s && ACTIVE_STATUSES.has(s.status);
  },
  all() {
    return db.prepare(`SELECT s.*, u.email FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC`).all();
  },
  countByStatus() {
    return db.prepare('SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status').all();
  },
};

const StripeEvents = {
  seen(id) {
    return !!db.prepare('SELECT 1 FROM stripe_events WHERE id = ?').get(id);
  },
  mark(id, type) {
    db.prepare('INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)').run(id, type, now());
  },
};

const SnsAccounts = {
  upsert({ userId, platform, externalUserId, handle, accessTokenEnc, refreshTokenEnc, expiresAt }) {
    const t = now();
    const ex = db.prepare('SELECT id FROM sns_accounts WHERE user_id=? AND platform=? AND external_user_id=?')
      .get(userId, platform, externalUserId);
    if (ex) {
      db.prepare(`UPDATE sns_accounts SET handle=?, access_token_enc=?, refresh_token_enc=?, expires_at=?, status='active', updated_at=? WHERE id=?`)
        .run(handle || '', accessTokenEnc, refreshTokenEnc || '', expiresAt || '', t, ex.id);
      return ex.id;
    }
    const id = generateId();
    db.prepare(`INSERT INTO sns_accounts (id, user_id, platform, external_user_id, handle, access_token_enc, refresh_token_enc, expires_at, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
      .run(id, userId, platform, externalUserId, handle || '', accessTokenEnc, refreshTokenEnc || '', expiresAt || '', t, t);
    return id;
  },
  get(id) {
    return db.prepare('SELECT * FROM sns_accounts WHERE id = ?').get(id) || null;
  },
  getForUser(id, userId) {
    return db.prepare('SELECT * FROM sns_accounts WHERE id = ? AND user_id = ?').get(id, userId) || null;
  },
  listForUser(userId) {
    return db.prepare('SELECT * FROM sns_accounts WHERE user_id = ? ORDER BY created_at').all(userId);
  },
  countForUser(userId) {
    return db.prepare('SELECT COUNT(*) AS n FROM sns_accounts WHERE user_id = ?').get(userId).n;
  },
  updateTokens(id, { accessTokenEnc, refreshTokenEnc, expiresAt }) {
    db.prepare('UPDATE sns_accounts SET access_token_enc=?, refresh_token_enc=?, expires_at=?, status=\'active\', updated_at=? WHERE id=?')
      .run(accessTokenEnc, refreshTokenEnc || '', expiresAt || '', now(), id);
  },
  setStatus(id, status) {
    db.prepare('UPDATE sns_accounts SET status=?, updated_at=? WHERE id=?').run(status, now(), id);
  },
  remove(id, userId) {
    // 連携解除。未投稿の予約は取り消す
    db.prepare(`UPDATE scheduled_posts SET status='cancelled', last_error='連携を解除したため取り消しました', updated_at=? WHERE account_id=? AND status IN ('pending','draft')`)
      .run(now(), id);
    db.prepare('DELETE FROM auto_rules WHERE account_id=? AND user_id=?').run(id, userId);
    db.prepare('DELETE FROM sns_accounts WHERE id=? AND user_id=?').run(id, userId);
  },
};

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAuthStates = {
  create({ userId, platform, codeVerifier }) {
    const state = require('crypto').randomBytes(24).toString('hex');
    db.prepare('INSERT INTO oauth_states (state, user_id, platform, code_verifier, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(state, userId, platform, codeVerifier || '', now());
    db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString());
    return state;
  },
  // 一度だけ使える。期限切れ・ユーザー不一致なら null
  consume(state, userId, platform) {
    const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state);
    if (!row) return null;
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    if (row.user_id !== userId || row.platform !== platform) return null;
    if (Date.parse(row.created_at) < Date.now() - OAUTH_STATE_TTL_MS) return null;
    return row;
  },
};

const ScheduledPosts = {
  // status: 'pending'（予約）または 'draft'（下書き。SNSへは送らない）。mediaIds はメディアの並び、tree はツリー投稿のカード
  create({ userId, accountId, text, scheduledAt, mediaId, mediaIds, options, category, tree, groupId, status }) {
    const id = generateId();
    const t = now();
    const ids = (mediaIds && mediaIds.length) ? mediaIds : (mediaId ? [mediaId] : []);
    const treeCards = tree || [];
    const acc = db.prepare('SELECT platform FROM sns_accounts WHERE id = ?').get(accountId);
    db.prepare(`INSERT INTO scheduled_posts (id, user_id, account_id, text, scheduled_at, status, media_id, options, category, media_ids, tree, group_id, platform, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, accountId, text, scheduledAt, status || 'pending', ids[0] || '', JSON.stringify(options || {}), category || '', JSON.stringify(ids), JSON.stringify(treeCards), groupId || '', (acc && acc.platform) || '', t, t);
    const all = new Set(ids);
    for (const c of treeCards) for (const m of (c.mediaIds || [])) all.add(m);
    for (const m of all) db.prepare('INSERT OR IGNORE INTO post_media (post_id, media_id) VALUES (?, ?)').run(id, m);
    return id;
  },
  get(id) {
    return db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(id) || null;
  },
  listForUser(userId, limit = 100) {
    return db.prepare(`SELECT p.*, a.platform, a.handle FROM scheduled_posts p LEFT JOIN sns_accounts a ON a.id = p.account_id
      WHERE p.user_id = ? ORDER BY p.scheduled_at DESC LIMIT ?`).all(userId, limit);
  },
  listBetween(userId, fromIso, toIso) {
    return db.prepare(`SELECT p.*, a.platform AS platform, a.handle FROM scheduled_posts p LEFT JOIN sns_accounts a ON a.id = p.account_id
      WHERE p.user_id = ? AND p.status <> 'draft' AND p.scheduled_at >= ? AND p.scheduled_at < ? ORDER BY p.scheduled_at`).all(userId, fromIso, toIso);
  },
  listDrafts(userId) {
    return db.prepare(`SELECT p.*, a.platform AS platform, a.handle FROM scheduled_posts p LEFT JOIN sns_accounts a ON a.id = p.account_id
      WHERE p.user_id = ? AND p.status = 'draft' ORDER BY p.created_at DESC`).all(userId);
  },
  countDrafts(userId) {
    return db.prepare(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE user_id=? AND status='draft'`).get(userId).n;
  },
  listGroup(groupId, userId) {
    return db.prepare('SELECT * FROM scheduled_posts WHERE group_id = ? AND user_id = ? ORDER BY created_at').all(groupId, userId);
  },
  countPending(userId) {
    return db.prepare(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE user_id=? AND status IN ('pending','publishing')`).get(userId).n;
  },
  // 指定日時以降に作成・予約された件数（1日の投稿数の上限チェック用）
  countScheduledBetween(userId, fromIso, toIso) {
    return db.prepare(`SELECT COUNT(*) AS n FROM scheduled_posts WHERE user_id=? AND status IN ('pending','publishing','posted')
      AND scheduled_at >= ? AND scheduled_at < ?`).get(userId, fromIso, toIso).n;
  },
  // Xへの投稿の件数（ツリーは1件ずつ）。月の上限の確認用
  countXUnits(userId, fromIso, toIso) {
    // 連携を解除・再連携しても数え直しにならないよう、投稿を作ったときのSNS（p.platform）で数える
    const rows = db.prepare(`SELECT p.tree FROM scheduled_posts p LEFT JOIN sns_accounts a ON a.id = p.account_id
      WHERE p.user_id=? AND (p.platform='x' OR a.platform='x') AND p.status IN ('pending','publishing','posted') AND p.scheduled_at >= ? AND p.scheduled_at < ?`).all(userId, fromIso, toIso);
    return rows.reduce((n, r) => { let t = 0; try { t = JSON.parse(r.tree || '[]').length; } catch { t = 0; } return n + 1 + t; }, 0);
  },
  // 下書きを予約（または即時投稿）にする
  promote(id, userId, scheduledAt) {
    const r = db.prepare(`UPDATE scheduled_posts SET status='pending', scheduled_at=?, updated_at=? WHERE id=? AND user_id=? AND status='draft'`)
      .run(scheduledAt, now(), id, userId);
    return r.changes === 1;
  },
  cancel(id, userId) {
    const r = db.prepare(`UPDATE scheduled_posts SET status='cancelled', updated_at=? WHERE id=? AND user_id=? AND status IN ('pending','draft')`)
      .run(now(), id, userId);
    return r.changes === 1;
  },
  // 実行時刻が来た予約を1件ずつ確保する（status を publishing に変えられた行だけ返す。二重実行防止）
  claimDue(limit, nowIso) {
    const ids = db.prepare(`SELECT id FROM scheduled_posts WHERE status='pending' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT ?`)
      .all(nowIso, limit).map((r) => r.id);
    const claimed = [];
    for (const id of ids) {
      const r = db.prepare(`UPDATE scheduled_posts SET status='publishing', attempts=attempts+1, updated_at=? WHERE id=? AND status='pending'`)
        .run(now(), id);
      if (r.changes === 1) claimed.push(this.get(id));
    }
    return claimed;
  },
  markPosted(id, externalId) {
    db.prepare(`UPDATE scheduled_posts SET status='posted', external_id=?, posted_at=?, last_error='', updated_at=? WHERE id=?`)
      .run(externalId || '', now(), now(), id);
  },
  markFailed(id, message) {
    db.prepare(`UPDATE scheduled_posts SET status='failed', last_error=?, updated_at=? WHERE id=?`)
      .run(String(message || '').slice(0, 500), now(), id);
  },
  reschedule(id, scheduledAt, message) {
    db.prepare(`UPDATE scheduled_posts SET status='pending', scheduled_at=?, last_error=?, updated_at=? WHERE id=?`)
      .run(scheduledAt, String(message || '').slice(0, 500), now(), id);
  },
  // 起動時：処理中のまま残った行は、二重投稿を避けるため失敗扱いにする（投稿されたかどうかが不明なため）
  failStuck(olderThanIso) {
    return db.prepare(`UPDATE scheduled_posts SET status='failed', last_error=?, updated_at=? WHERE status='publishing' AND updated_at < ?`)
      .run('処理中にサーバーが再起動したため中断されました。投稿されたかをご確認のうえ、必要なら予約し直してください。', now(), olderThanIso).changes;
  },
  stats() {
    return db.prepare('SELECT status, COUNT(*) AS n FROM scheduled_posts GROUP BY status').all();
  },
};

const MediaAssets = {
  create({ userId, token, kind, mime, ext, size }) {
    const id = generateId();
    db.prepare('INSERT INTO media_assets (id, user_id, token, kind, mime, ext, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, token, kind, mime, ext, size, now());
    return id;
  },
  get(id) {
    return db.prepare("SELECT * FROM media_assets WHERE id = ? AND deleted_at = ''").get(id) || null;
  },
  getForUser(id, userId) {
    return db.prepare("SELECT * FROM media_assets WHERE id = ? AND user_id = ? AND deleted_at = ''").get(id, userId) || null;
  },
  getByToken(token) {
    return db.prepare("SELECT * FROM media_assets WHERE token = ? AND deleted_at = ''").get(token) || null;
  },
  totalSize(userId) {
    return db.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM media_assets WHERE user_id = ? AND deleted_at = ''").get(userId).n;
  },
  markDeleted(id) {
    db.prepare('UPDATE media_assets SET deleted_at = ? WHERE id = ?').run(now(), id);
  },
  // 削除してよいメディア：どの予約からも参照されていない（作成から1日以上）、または参照する予約がすべて終了して2日以上
  deletable(nowMs = Date.now()) {
    const unreferencedBefore = new Date(nowMs - 24 * 3600 * 1000).toISOString();
    const finishedBefore = new Date(nowMs - 2 * 24 * 3600 * 1000).toISOString();
    return db.prepare(`SELECT m.* FROM media_assets m WHERE m.deleted_at = '' AND (
      (NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id) AND m.created_at < ?)
      OR (EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM post_media pm JOIN scheduled_posts p ON p.id = pm.post_id WHERE pm.media_id = m.id AND (p.status IN ('pending','publishing','draft') OR p.updated_at >= ?)))
    )`).all(unreferencedBefore, finishedBefore);
  },
};

const AiUsage = {
  // 上限内なら1回分を使って true。上限なら false（同時に呼ばれても超えないよう、1文で更新する）
  tryUse(userId, day, kind, limit) {
    if (limit <= 0) return false;
    db.prepare('INSERT OR IGNORE INTO ai_usage (user_id, day, kind, n) VALUES (?,?,?,0)').run(userId, day, kind);
    return db.prepare('UPDATE ai_usage SET n=n+1 WHERE user_id=? AND day=? AND kind=? AND n<?').run(userId, day, kind, limit).changes === 1;
  },
  refund(userId, day, kind) { db.prepare('UPDATE ai_usage SET n=n-1 WHERE user_id=? AND day=? AND kind=? AND n>0').run(userId, day, kind); },
  used(userId, day, kind) { const r = db.prepare('SELECT n FROM ai_usage WHERE user_id=? AND day=? AND kind=?').get(userId, day, kind); return r ? r.n : 0; },
};

const AiJobs = {
  create({ userId, kind, prompt, operation }) {
    const id = generateId(); const t = now();
    db.prepare('INSERT INTO ai_jobs (id,user_id,kind,prompt,operation,status,created_at,updated_at) VALUES (?,?,?,?,?,\'running\',?,?)').run(id, userId, kind, prompt, operation || '', t, t);
    return id;
  },
  get(id, userId) { return db.prepare('SELECT * FROM ai_jobs WHERE id=? AND user_id=?').get(id, userId) || null; },
  listRunning(limit = 20) { return db.prepare(`SELECT * FROM ai_jobs WHERE status='running' ORDER BY created_at LIMIT ?`).all(limit); },
  finish(id, { mediaId, error }) {
    db.prepare('UPDATE ai_jobs SET status=?, media_id=?, error=?, updated_at=? WHERE id=?').run(error ? 'failed' : 'done', mediaId || '', error || '', now(), id);
  },
};

const AutoRules = {
  MAX: 5,
  count(userId) { return db.prepare('SELECT COUNT(*) AS n FROM auto_rules WHERE user_id=?').get(userId).n; },
  create({ userId, accountId, theme, tone, withImage, hourJst, mode }) {
    const id = generateId();
    db.prepare('INSERT INTO auto_rules (id,user_id,account_id,theme,tone,with_image,hour_jst,mode,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, userId, accountId, theme, tone || '', withImage ? 1 : 0, hourJst, mode, now());
    return id;
  },
  listForUser(userId) { return db.prepare('SELECT * FROM auto_rules WHERE user_id=? ORDER BY created_at').all(userId); },
  get(id, userId) { return db.prepare('SELECT * FROM auto_rules WHERE id=? AND user_id=?').get(id, userId) || null; },
  remove(id, userId) { return db.prepare('DELETE FROM auto_rules WHERE id=? AND user_id=?').run(id, userId).changes === 1; },
  setEnabled(id, userId, on) { return db.prepare('UPDATE auto_rules SET enabled=? WHERE id=? AND user_id=?').run(on ? 1 : 0, id, userId).changes === 1; },
  // 今日まだ実行していない有効なルール（実行は1日1回）
  due(day) { return db.prepare(`SELECT * FROM auto_rules WHERE enabled=1 AND last_day <> ?`).all(day); },
  // 実行済みにする。他の処理が先に実行していたら false（二重実行の防止）
  claim(id, day) { return db.prepare(`UPDATE auto_rules SET last_day=?, last_error='' WHERE id=? AND last_day <> ?`).run(day, id, day).changes === 1; },
  setError(id, msg) { db.prepare('UPDATE auto_rules SET last_error=? WHERE id=?').run(String(msg).slice(0, 300), id); },
  removeForAccount(accountId) { db.prepare('DELETE FROM auto_rules WHERE account_id=?').run(accountId); },
};

// アップロード用の一時URL（AIアシスタントなど、APIキーを持たない場所からファイルを送るため）。15分・1回だけ有効
const UploadTickets = {
  TTL_MS: 15 * 60 * 1000,
  create(userId) {
    const token = `squ_${require('crypto').randomBytes(24).toString('hex')}`;
    db.prepare('DELETE FROM upload_tickets WHERE expires_at < ?').run(new Date().toISOString());
    db.prepare('INSERT INTO upload_tickets (token_hash, user_id, expires_at) VALUES (?,?,?)')
      .run(ApiKeys.hash(token), userId, new Date(Date.now() + this.TTL_MS).toISOString());
    return token;
  },
  consume(token) {
    if (!/^squ_[0-9a-f]{48}$/.test(String(token || ''))) return null;
    const h = ApiKeys.hash(token);
    const row = db.prepare('SELECT user_id, expires_at FROM upload_tickets WHERE token_hash=? AND used=0').get(h);
    if (!row || Date.parse(row.expires_at) < Date.now()) return null;
    if (db.prepare('UPDATE upload_tickets SET used=1 WHERE token_hash=? AND used=0').run(h).changes !== 1) return null;
    return row.user_id;
  },
};

const MAX_API_KEYS = 5;
const ApiKeys = {
  hash(key) { return require('crypto').createHash('sha256').update(String(key)).digest('hex'); },
  // 新しいキーを作る。平文のキーはこの戻り値でしか見られない（保存するのはハッシュだけ）
  create(userId, label) {
    if (this.listForUser(userId).length >= MAX_API_KEYS) return null;
    const key = `sqk_${require('crypto').randomBytes(24).toString('hex')}`;
    const id = generateId();
    db.prepare('INSERT INTO api_keys (id, user_id, label, prefix, key_hash, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, userId, String(label || '').slice(0, 40), key.slice(0, 10), this.hash(key), now());
    return { id, key };
  },
  listForUser(userId) {
    return db.prepare(`SELECT id, label, prefix, created_at, last_used_at FROM api_keys WHERE user_id=? AND revoked_at='' ORDER BY created_at`).all(userId);
  },
  // キーからユーザーを引く（失効したキーは無効）
  authenticate(key) {
    if (!/^sqk_[0-9a-f]{48}$/.test(String(key || ''))) return null;
    const row = db.prepare(`SELECT id, user_id FROM api_keys WHERE key_hash=? AND revoked_at=''`).get(this.hash(key));
    if (!row) return null;
    db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(now(), row.id);
    return row.user_id;
  },
  revoke(id, userId) {
    return db.prepare(`UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at=''`).run(now(), id, userId).changes === 1;
  },
};

module.exports = { UploadTickets, AiUsage, AiJobs, AutoRules, ApiKeys, MAX_API_KEYS, MediaAssets, Subscriptions, StripeEvents, SnsAccounts, OAuthStates, ScheduledPosts, ACTIVE_STATUSES };
