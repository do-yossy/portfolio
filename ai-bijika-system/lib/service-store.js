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
  CREATE TABLE IF NOT EXISTS api_usage (
    platform TEXT NOT NULL,
    day TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (platform, day)
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
try { db.exec("ALTER TABLE scheduled_posts ADD COLUMN rule_id TEXT DEFAULT ''"); } catch { /* 既にある */ }
// SNSへ送り始めた時刻（処理中のまま止まったときに、送り始めていたかどうかを見分ける）
// 列を新しく足したときだけ、それまで処理中だった行を「送り始めていた」扱いにする（古い版で送信中だった予約を、もう一度送らないように）
try {
  db.exec("ALTER TABLE scheduled_posts ADD COLUMN started_at TEXT DEFAULT ''");
  db.exec("UPDATE scheduled_posts SET started_at=updated_at WHERE status='publishing' AND started_at=''");
} catch { /* 既にある */ }
// 自動運用：作るもの（none／image／video）、実行する時刻（カンマ区切り。最大3つ）、SNSごとの設定（YouTubeの公開設定など）
try { db.exec("ALTER TABLE auto_rules ADD COLUMN media TEXT DEFAULT ''"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE auto_rules ADD COLUMN hours TEXT DEFAULT ''"); } catch { /* 既にある */ }
try { db.exec("ALTER TABLE auto_rules ADD COLUMN options TEXT DEFAULT '{}'"); } catch { /* 既にある */ }
// 動画の生成ジョブ：完成したら投稿を作るための情報（自動運用から作った場合）
try { db.exec("ALTER TABLE ai_jobs ADD COLUMN payload TEXT DEFAULT ''"); } catch { /* 既にある */ }
// テスト利用を付ける前の状態（取り消すときに戻す）
try { db.exec("ALTER TABLE subscriptions ADD COLUMN pre_test_status TEXT DEFAULT ''"); } catch { /* 既にある */ }
// AIで作ったメディアか（TikTokなどで「AI生成」の表示をするため）
try { db.exec("ALTER TABLE media_assets ADD COLUMN ai_generated INTEGER NOT NULL DEFAULT 0"); } catch { /* 既にある */ }
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

// test：運営者が動作確認のために付与した「テスト利用」（Stripeを通さない。料金はかからない）
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'test']);
// Stripe の契約が「まだ開いている」状態（新しく申し込ませない・テスト利用で上書きしない）
const OPEN_STRIPE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

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
        cancel_at_period_end, price_id, agreed_at, agreed_version, stripe_event_created, pre_test_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        userId, fields.stripe_customer_id || '', fields.stripe_subscription_id || '', fields.status || 'none',
        fields.current_period_end || '', fields.cancel_at_period_end ? 1 : 0, fields.price_id || '',
        fields.agreed_at || '', fields.agreed_version || '', fields.stripe_event_created || 0, fields.pre_test_status || '', t, t);
      return this.get(userId);
    }
    const next = { ...cur, ...fields };
    db.prepare(`UPDATE subscriptions SET stripe_customer_id=?, stripe_subscription_id=?, status=?, current_period_end=?,
      cancel_at_period_end=?, price_id=?, agreed_at=?, agreed_version=?, stripe_event_created=?, pre_test_status=?, updated_at=? WHERE user_id=?`).run(
      next.stripe_customer_id || '', next.stripe_subscription_id || '', next.status || 'none', next.current_period_end || '',
      next.cancel_at_period_end ? 1 : 0, next.price_id || '', next.agreed_at || '', next.agreed_version || '', next.stripe_event_created || 0, next.pre_test_status || '', t, userId);
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
  // 期限が近い連携（期限の延長が必要なもの）
  listExpiring(platforms, beforeIso) {
    const ph = platforms.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM sns_accounts WHERE status='active' AND expires_at <> '' AND expires_at < ? AND platform IN (${ph})`).all(beforeIso, ...platforms);
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
  create({ userId, accountId, text, scheduledAt, mediaId, mediaIds, options, category, tree, groupId, status, ruleId }) {
    const id = generateId();
    const t = now();
    const ids = (mediaIds && mediaIds.length) ? mediaIds : (mediaId ? [mediaId] : []);
    const treeCards = tree || [];
    const acc = db.prepare('SELECT platform FROM sns_accounts WHERE id = ?').get(accountId);
    db.prepare(`INSERT INTO scheduled_posts (id, user_id, account_id, text, scheduled_at, status, media_id, options, category, media_ids, tree, group_id, platform, rule_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, accountId, text, scheduledAt, status || 'pending', ids[0] || '', JSON.stringify(options || {}), category || '', JSON.stringify(ids), JSON.stringify(treeCards), groupId || '', (acc && acc.platform) || '', ruleId || '', t, t);
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
  // 自動運用のルールが最近作った投稿の本文（同じような投稿が続かないよう、AIに渡す）
  recentTextsForRule(ruleId, limit = 5) {
    return db.prepare(`SELECT text FROM scheduled_posts WHERE rule_id = ? ORDER BY created_at DESC LIMIT ?`).all(ruleId, limit).map((r) => r.text);
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
      WHERE p.user_id=? AND (p.platform='x' OR a.platform='x') AND p.scheduled_at >= ? AND p.scheduled_at < ?
        AND (p.status IN ('pending','publishing','posted')
          OR (p.status = 'failed' AND (p.last_error LIKE '%投稿されたか%' OR p.last_error LIKE '%投稿済み%' OR p.last_error LIKE '%再起動%')))`).all(userId, fromIso, toIso);
    // 「失敗」でも、投稿されたかどうか分からないもの・ツリーの途中まで投稿済みのものは、実際に投稿された可能性があるため数える
    return rows.reduce((n, r) => { let t = 0; try { t = JSON.parse(r.tree || '[]').length; } catch { t = 0; } return n + 1 + t; }, 0);
  },
  // 下書きを予約（または即時投稿）にする
  promote(id, userId, scheduledAt) {
    const r = db.prepare(`UPDATE scheduled_posts SET status='pending', scheduled_at=?, updated_at=? WHERE id=? AND user_id=? AND status='draft'`)
      .run(scheduledAt, now(), id, userId);
    return r.changes === 1;
  },
  // 取り消した下書きを、下書きに戻す（下書きを開いて保存し直すときに、新しい投稿を作れなかった場合）
  restoreDraft(id, userId) {
    return db.prepare(`UPDATE scheduled_posts SET status='draft', updated_at=? WHERE id=? AND user_id=? AND status='cancelled'`).run(now(), id, userId).changes === 1;
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
      const r = db.prepare(`UPDATE scheduled_posts SET status='publishing', attempts=attempts+1, started_at='', updated_at=? WHERE id=? AND status='pending'`)
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
  // SNSへ送らずに後ろへずらす（サービス全体の上限に達したときなど）。試行回数は数えない
  defer(id, scheduledAt, message) {
    db.prepare(`UPDATE scheduled_posts SET status='pending', scheduled_at=?, last_error=?, attempts=MAX(attempts-1, 0), updated_at=? WHERE id=?`)
      .run(scheduledAt, String(message || '').slice(0, 500), now(), id);
  },
  // そのSNSへの予約・投稿の件数（YouTubeの1日の割り当ての確認用）。userId を渡すとその利用者だけ、省略するとサービス全体
  countPlatformBetween(platform, fromIso, toIso, userId = null) {
    return db.prepare(`SELECT COUNT(*) AS n FROM scheduled_posts p LEFT JOIN sns_accounts a ON a.id = p.account_id
      WHERE (p.platform=? OR a.platform=?) AND p.scheduled_at >= ? AND p.scheduled_at < ? AND p.status IN ('pending','publishing','posted')
        AND (? IS NULL OR p.user_id = ?)`)
      .get(platform, platform, fromIso, toIso, userId, userId).n;
  },
  // SNSへ送り始める直前に印を付ける
  markStarted(id) {
    db.prepare(`UPDATE scheduled_posts SET started_at=?, updated_at=? WHERE id=? AND status='publishing'`).run(now(), now(), id);
  },
  // 処理中のまま残った行の後始末（起動時と、定期の確認）。
  // SNSへ送り始めていた行は、投稿されたかどうかが分からないため、二重投稿を避けて失敗にする。
  // まだ送り始めていなかった行（まとめて確保したうちの後ろのもの）は、送っていないので予約に戻す（試行回数も戻す）
  // unstartedBefore を省略すると olderThanIso と同じ。起動時は、まだ送り始めていない行をすぐ予約に戻してよい（1台構成のため、ほかに処理中のプロセスは無い）
  failStuck(olderThanIso, unstartedBefore = olderThanIso) {
    const back = db.prepare(`UPDATE scheduled_posts SET status='pending', attempts=MAX(attempts-1, 0), updated_at=? WHERE status='publishing' AND started_at='' AND updated_at < ?`)
      .run(now(), unstartedBefore).changes;
    const failed = db.prepare(`UPDATE scheduled_posts SET status='failed', last_error=?, updated_at=? WHERE status='publishing' AND started_at!='' AND updated_at < ?`)
      .run('処理中にサーバーが再起動したため中断されました。投稿されたかをご確認のうえ、必要なら予約し直してください。', now(), olderThanIso).changes;
    return failed + back;
  },
  stats() {
    return db.prepare('SELECT status, COUNT(*) AS n FROM scheduled_posts GROUP BY status').all();
  },
};

const MediaAssets = {
  markAiGenerated(id) { db.prepare('UPDATE media_assets SET ai_generated=1 WHERE id=?').run(id); },
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
  // その月（日本時間。day は YYYY-MM-DD）の合計
  usedMonth(userId, day, kind) {
    const r = db.prepare('SELECT COALESCE(SUM(n),0) AS n FROM ai_usage WHERE user_id=? AND kind=? AND day LIKE ?').get(userId, kind, `${String(day).slice(0, 7)}-%`);
    return r ? r.n : 0;
  },
};

const AiJobs = {
  create({ userId, kind, prompt, operation, payload }) {
    const id = generateId(); const t = now();
    db.prepare('INSERT INTO ai_jobs (id,user_id,kind,prompt,operation,status,payload,created_at,updated_at) VALUES (?,?,?,?,?,\'running\',?,?,?)').run(id, userId, kind, prompt, operation || '', payload ? JSON.stringify(payload) : '', t, t);
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
  create({ userId, accountId, theme, tone, media, hours, mode, options, withImage, hourJst }) {
    const id = generateId();
    const hs = (hours && hours.length ? hours : [hourJst || 0]).slice(0, 3);
    if (!media) media = withImage ? 'image' : 'none';
    db.prepare('INSERT INTO auto_rules (id,user_id,account_id,theme,tone,with_image,hour_jst,mode,media,hours,options,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, userId, accountId, theme, tone || '', media === 'image' ? 1 : 0, hs[0] || 0, mode, media || 'none', hs.join(','), JSON.stringify(options || {}), now());
    return id;
  },
  listForUser(userId) { return db.prepare('SELECT * FROM auto_rules WHERE user_id=? ORDER BY created_at').all(userId); },
  get(id, userId) { return db.prepare('SELECT * FROM auto_rules WHERE id=? AND user_id=?').get(id, userId) || null; },
  remove(id, userId) { return db.prepare('DELETE FROM auto_rules WHERE id=? AND user_id=?').run(id, userId).changes === 1; },
  setEnabled(id, userId, on) { return db.prepare('UPDATE auto_rules SET enabled=? WHERE id=? AND user_id=?').run(on ? 1 : 0, id, userId).changes === 1; },
  enabled() { return db.prepare('SELECT * FROM auto_rules WHERE enabled=1').all(); },
  // 実行済みにする（key は「YYYY-MM-DD#HH」。前回より新しい回のときだけ更新する＝二重実行の防止）。他の処理が先に実行していたら false
  claim(id, key) {
    // 旧形式（「YYYY-MM-DD」だけ）は、その日の最後の回まで実行済みとして比べる
    return db.prepare(`UPDATE auto_rules SET last_day=?, last_error='' WHERE id=? AND (last_day IS NULL OR (CASE WHEN instr(last_day, '#') = 0 AND last_day <> '' THEN last_day || '#99' ELSE last_day END) < ?)`).run(key, id, key).changes === 1;
  },
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

// SNSのAPIの、サービス全体での1日の使用回数（YouTubeのアップロードの割り当てなど）
const ApiUsage = {
  // 上限未満なら1回分を確保して true。上限に達していれば false
  take(platform, day, limit) {
    return db.prepare(`INSERT INTO api_usage (platform, day, n) VALUES (?, ?, 1)
      ON CONFLICT(platform, day) DO UPDATE SET n = n + 1 WHERE n < ?`).run(platform, day, limit).changes === 1;
  },
  // SNS側で割り当てを使い切ったと言われたとき、その日の残りを使わないようにする
  fill(platform, day, limit) {
    db.prepare(`INSERT INTO api_usage (platform, day, n) VALUES (?, ?, ?) ON CONFLICT(platform, day) DO UPDATE SET n = MAX(n, excluded.n)`).run(platform, day, limit);
  },
  get(platform, day) {
    const r = db.prepare('SELECT n FROM api_usage WHERE platform=? AND day=?').get(platform, day);
    return r ? r.n : 0;
  },
  // 古い日付の記録を消す（数日分あれば足りる）
  prune(beforeDay) { db.prepare('DELETE FROM api_usage WHERE day < ?').run(beforeDay); },
  // 確保した1回分を戻す（ほかの上限に当たって、実際には送らなかったとき）
  release(platform, day) {
    db.prepare('UPDATE api_usage SET n = n - 1 WHERE platform=? AND day=? AND n > 0').run(platform, day);
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
  revokeAll(userId) { db.prepare(`UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at=''`).run(now(), userId); },
  revoke(id, userId) {
    return db.prepare(`UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at=''`).run(now(), id, userId).changes === 1;
  },
};

// 複数の行をまとめて書き込む（全部書くか、何も書かないか）。fn は同期の関数
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; }
}

module.exports = { transaction, OPEN_STRIPE_STATUSES, UploadTickets, ApiUsage, AiUsage, AiJobs, AutoRules, ApiKeys, MAX_API_KEYS, MediaAssets, Subscriptions, StripeEvents, SnsAccounts, OAuthStates, ScheduledPosts, ACTIVE_STATUSES };
