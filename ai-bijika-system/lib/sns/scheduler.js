'use strict';
// 予約投稿の実行（同じプロセス内で一定間隔に確認する。Fly.ioは1台構成のため、これで足りる）
// 方針：投稿するのは利用者本人が作成・予約した内容だけ。いいね・フォロー・コメント等の自動操作は行わない。
const { SnsAccounts, ScheduledPosts, Subscriptions } = require('../service-store');
const box = require('../crypto-box');
const registry = require('./index');

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 5 * 60 * 1000; // 5分、10分…
const REFRESH_MARGIN_MS = 3 * 24 * 3600 * 1000; // 期限の3日前から更新（Threads）。Xは期限が短いため常に確認
const X_REFRESH_MARGIN_MS = 10 * 60 * 1000;

function key() {
  return box.keyFromEnv();
}

// 必要ならトークンを更新して、使えるアクセストークンを返す
async function ensureAccessToken(account, adapter) {
  const k = key();
  let access = box.decrypt(account.access_token_enc, k);
  const expMs = account.expires_at ? Date.parse(account.expires_at) : 0;
  const margin = adapter.id === 'x' ? X_REFRESH_MARGIN_MS : REFRESH_MARGIN_MS;
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
    const r = await adapter.publish({ accessToken, externalUserId: account.external_user_id, text: post.text });
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
function start(intervalMs = 30000) {
  if (timer) return;
  ScheduledPosts.failStuck(new Date(Date.now() - 5 * 60 * 1000).toISOString());
  timer = setInterval(() => { tick().catch((e) => console.error('[scheduler]', e)); }, intervalMs);
  if (timer.unref) timer.unref();
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { tick, start, stop, processOne, ensureAccessToken, MAX_ATTEMPTS };
