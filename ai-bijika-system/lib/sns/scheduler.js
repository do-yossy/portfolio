'use strict';
// 予約投稿の実行（同じプロセス内で一定間隔に確認する。Fly.ioは1台構成のため、これで足りる）
// 方針：投稿するのは利用者本人が作成・予約した内容だけ。いいね・フォロー・コメント等の自動操作は行わない。
const { SnsAccounts, ScheduledPosts, Subscriptions, MediaAssets } = require('../service-store');
const mediaLib = require('../media');
const box = require('../crypto-box');
const registry = require('./index');

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 5 * 60 * 1000; // 5分、10分…
// 期限の前に更新する余裕。有効期間の長い Threads・Instagram は3日前、短い X・TikTok は直前に更新する
const REFRESH_MARGIN_MS = { x: 10 * 60 * 1000, tiktok: 60 * 60 * 1000 };
const DEFAULT_REFRESH_MARGIN_MS = 3 * 24 * 3600 * 1000;

function key() {
  return box.keyFromEnv();
}

// 必要ならトークンを更新して、使えるアクセストークンを返す
async function ensureAccessToken(account, adapter) {
  const k = key();
  let access = box.decrypt(account.access_token_enc, k);
  const expMs = account.expires_at ? Date.parse(account.expires_at) : 0;
  const margin = REFRESH_MARGIN_MS[adapter.id] || DEFAULT_REFRESH_MARGIN_MS;
  if (expMs && expMs - Date.now() < margin) {
    const refreshTok = account.refresh_token_enc ? box.decrypt(account.refresh_token_enc, k) : '';
    const r = await adapter.refresh({ accessToken: access, refreshToken: refreshTok });
    access = r.accessToken;
    SnsAccounts.updateTokens(account.id, {
      accessTokenEnc: box.encrypt(r.accessToken, k),
      refreshTokenEnc: r.refreshToken ? box.encrypt(r.refreshToken, k) : account.refresh_token_enc,
      expiresAt: r.expiresAt,
    });
  }
  return access;
}

async function processOne(post) {
  const account = SnsAccounts.get(post.account_id);
  if (!account) return ScheduledPosts.markFailed(post.id, '連携が解除されているため投稿できませんでした');
  if (account.status !== 'active') return ScheduledPosts.markFailed(post.id, 'SNSの連携が無効になっています。連携をやり直してください');
  if (!Subscriptions.isActive(post.user_id)) return ScheduledPosts.markFailed(post.id, 'ご契約が有効でないため投稿しませんでした');
  const adapter = registry.get(account.platform);
  if (!adapter) return ScheduledPosts.markFailed(post.id, '未対応のSNSです');
  try {
    const accessToken = await ensureAccessToken(account, adapter);
    let media = null;
    if (post.media_id) {
      const m = MediaAssets.get(post.media_id);
      if (!m) return ScheduledPosts.markFailed(post.id, '添付したファイルが削除されているため投稿できませんでした');
      media = { kind: m.kind, mime: m.mime, size: m.size, path: mediaLib.pathOf(m), url: mediaLib.publicUrl(m) };
    }
    let options = {};
    try { options = JSON.parse(post.options || '{}'); } catch { options = {}; }
    const r = await adapter.publish({ accessToken, externalUserId: account.external_user_id, text: post.text, media, options });
    ScheduledPosts.markPosted(post.id, r.externalId);
  } catch (e) {
    if (e && e.authError) {
      SnsAccounts.setStatus(account.id, 'reauth_required');
      return ScheduledPosts.markFailed(post.id, `${e.message}（SNSの連携をやり直してください）`);
    }
    if (e && e.retriable && post.attempts < MAX_ATTEMPTS) {
      const at = new Date(Date.now() + RETRY_BASE_MS * 2 ** (post.attempts - 1)).toISOString();
      return ScheduledPosts.reschedule(post.id, at, `${e.message}（自動で再試行します）`);
    }
    return ScheduledPosts.markFailed(post.id, (e && e.message) || '投稿に失敗しました');
  }
}

let running = false;
// 実行時刻が来た予約を処理する。戻り値は処理件数
async function tick(limit = 20) {
  if (running) return 0;
  running = true;
  try {
    const due = ScheduledPosts.claimDue(limit, new Date().toISOString());
    for (const post of due) {
      try { await processOne(post); } catch (e) { ScheduledPosts.markFailed(post.id, e.message); }
    }
    return due.length;
  } finally {
    running = false;
  }
}

let timer = null;
let cleanTimer = null;
function start(intervalMs = 30000) {
  if (timer) return;
  ScheduledPosts.failStuck(new Date(Date.now() - 5 * 60 * 1000).toISOString());
  timer = setInterval(() => { tick().catch((e) => console.error('[scheduler]', e)); }, intervalMs);
  if (timer.unref) timer.unref();
  // 投稿が終わったメディアを1時間ごとに削除する
  const clean = () => { try { mediaLib.cleanup(); } catch (e) { console.error('[media cleanup]', e); } };
  clean();
  cleanTimer = setInterval(clean, 3600 * 1000);
  if (cleanTimer.unref) cleanTimer.unref();
}
function stop() {
  if (timer) clearInterval(timer);
  if (cleanTimer) clearInterval(cleanTimer);
  timer = null;
  cleanTimer = null;
}

module.exports = { tick, start, stop, processOne, ensureAccessToken, MAX_ATTEMPTS };
