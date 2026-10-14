'use strict';
// 予約投稿の実行（同じプロセス内で一定間隔に確認する。Fly.ioは1台構成のため、これで足りる）
// 方針：投稿するのは利用者本人が作成・予約した内容だけ。いいね・フォロー・コメント等の自動操作は行わない。
const { SnsAccounts, ScheduledPosts, Subscriptions, MediaAssets, ApiUsage } = require('../service-store');
const ptTime = require('../pt-time');
const mediaLib = require('../media');
const box = require('../crypto-box');
const registry = require('./index');

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 5 * 60 * 1000; // 5分、10分…
// 期限の前に更新する余裕。有効期間の長い Threads・Instagram は3日前、短い X・TikTok は直前に更新する
const REFRESH_MARGIN_MS = { x: 10 * 60 * 1000, tiktok: 60 * 60 * 1000, youtube: 5 * 60 * 1000 };
const DEFAULT_REFRESH_MARGIN_MS = 3 * 24 * 3600 * 1000;
// YouTubeのアップロードの、サービス全体の1日（太平洋時間）の上限。割り当てを超えないよう、送る前に1回分を確保する
const envInt = (k, d) => { const v = parseInt(process.env[k] || '', 10); return Number.isFinite(v) && v > 0 ? v : d; };
const youtubePerDay = () => envInt('YOUTUBE_DAILY_LIMIT', 90);
const youtubePerUserDay = () => envInt('YOUTUBE_PER_USER_DAILY', 5);
const YT_DEFER_MSG = 'YouTubeへのアップロードが、サービス全体の1日の上限に達したため、YouTubeの日付が変わった後（日本時間の16時または17時）に自動で投稿します';
const YT_DEFER_USER_MSG = 'YouTubeへの投稿が、1日の上限に達したため、YouTubeの日付が変わった後（日本時間の16時または17時）に自動で投稿します';
// サービス全体と利用者ごとの1回分を、両方そろって確保できたときだけ送る。片方しか確保できなければ戻して、理由を返す。
// サービス全体の枠は、実際の割り当ての消費に合わせて、送るたびに数える。
// 利用者ごとの枠は、予約の時点の数え方（1件の予約を1件）に合わせて、同じ予約はその日1回だけ数える（再試行で枠を使わないように）
function takeYoutube(post, day) {
  if (!ApiUsage.take('youtube', day, youtubePerDay())) return YT_DEFER_MSG;
  const postKey = `youtube:post:${post.id}`;
  if (ApiUsage.take(postKey, day, 1) && !ApiUsage.take(`youtube:user:${post.user_id}`, day, youtubePerUserDay())) {
    ApiUsage.release(postKey, day);
    ApiUsage.release('youtube', day);
    return YT_DEFER_USER_MSG;
  }
  return null;
}
// YouTubeへ何も送らずに失敗したとき（送る前の検証のエラー）は、確保した枠を戻す
function releaseYoutube(post, day) {
  ApiUsage.release('youtube', day);
  if (ApiUsage.get(`youtube:post:${post.id}`, day) > 0) { ApiUsage.release(`youtube:post:${post.id}`, day); ApiUsage.release(`youtube:user:${post.user_id}`, day); }
}

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
    const loadMedia = (id) => {
      const m = MediaAssets.get(id);
      if (!m) return null;
      const p = mediaLib.pathOf(m);
      return { kind: m.kind, mime: m.mime, size: m.size, path: p, url: mediaLib.publicUrl(m), durationSec: m.kind === 'video' ? mediaLib.mp4DurationSec(p) : null, ...(m.kind === 'image' ? (mediaLib.imageSize(p) || {}) : {}), aiGenerated: !!m.ai_generated };
    };
    let mediaIds = [];
    try { mediaIds = JSON.parse(post.media_ids || '[]'); } catch { mediaIds = []; }
    if (!mediaIds.length && post.media_id) mediaIds = [post.media_id];
    let treeCards = [];
    try { treeCards = JSON.parse(post.tree || '[]'); } catch { treeCards = []; }
    const medias = mediaIds.map(loadMedia);
    const cardMedias = treeCards.map((c) => (c.mediaIds || []).map(loadMedia));
    if (medias.includes(null) || cardMedias.some((l) => l.includes(null))) return ScheduledPosts.markFailed(post.id, '添付したファイルが削除されているため投稿できませんでした');
    let options = {};
    try { options = JSON.parse(post.options || '{}'); } catch { options = {}; }
    const category = post.category || (!medias.length ? 'text' : (medias[0].kind === 'video' ? 'video' : 'image'));
    const full = { category, text: post.text, medias, tree: treeCards.map((c, i) => ({ text: c.text, medias: cardMedias[i] })), options };
    if (account.platform === 'youtube') {
      const d = ptTime.dayBounds(new Date().toISOString());
      const why = takeYoutube(post, d.day);
      if (why) return ScheduledPosts.defer(post.id, new Date(Date.parse(d.to) + 5 * 60 * 1000).toISOString(), why);
    }
    ScheduledPosts.markStarted(post.id);
    const r = await adapter.publish({ accessToken, externalUserId: account.external_user_id, post: full });
    ScheduledPosts.markPosted(post.id, r.externalId);
  } catch (e) {
    if (e && e.notSent && account.platform === 'youtube') releaseYoutube(post, ptTime.dayBounds(new Date().toISOString()).day);
    if (e && e.authError) {
      SnsAccounts.setStatus(account.id, 'reauth_required');
      return ScheduledPosts.markFailed(post.id, `${e.message}（SNSの連携をやり直してください）`);
    }
    // SNS側の1日の割り当てを使い切った（YouTubeの quotaExceeded）。その日の残りは送らず、日付が変わった後に回す
    if (e && e.quotaExhausted && account.platform === 'youtube') {
      const d = ptTime.dayBounds(new Date().toISOString());
      ApiUsage.fill('youtube', d.day, youtubePerDay());
      if (post.attempts < MAX_ATTEMPTS) return ScheduledPosts.reschedule(post.id, new Date(Date.parse(d.to) + 5 * 60 * 1000).toISOString(), `${e.message}（YouTubeの日付が変わった後に自動で再試行します）`);
      return ScheduledPosts.markFailed(post.id, e.message);
    }
    if (e && e.retriable && post.attempts < MAX_ATTEMPTS) {
      const at = new Date(Date.now() + RETRY_BASE_MS * 2 ** (post.attempts - 1)).toISOString();
      return ScheduledPosts.reschedule(post.id, at, `${e.message}（自動で再試行します）`);
    }
    return ScheduledPosts.markFailed(post.id, (e && e.message) || '投稿に失敗しました');
  }
}

// 長期トークンの定期延長。Threads・Instagram のトークンは60日で切れ、60日間延長しないと延長もできなくなる（公式）。
// 投稿があるときだけ延長する作りだと、61〜90日先の予約や、しばらく投稿しない人の連携が切れるため、期限の7日前から毎日延長を試みる
const LONG_LIVED = ['threads', 'instagram'];
async function refreshExpiring(nowMs = Date.now()) {
  const k = key();
  let n = 0;
  for (const account of SnsAccounts.listExpiring(LONG_LIVED, new Date(nowMs + 7 * 24 * 3600 * 1000).toISOString())) {
    const adapter = registry.get(account.platform);
    if (!adapter || !adapter.refresh) continue;
    try {
      const access = box.decrypt(account.access_token_enc, k);
      const r = await adapter.refresh({ accessToken: access, refreshToken: '' });
      SnsAccounts.updateTokens(account.id, { accessTokenEnc: box.encrypt(r.accessToken, k), refreshTokenEnc: account.refresh_token_enc, expiresAt: r.expiresAt });
      n++;
    } catch (e) {
      if (e && e.authError) SnsAccounts.setStatus(account.id, 'reauth_required');
      console.error('[token refresh]', account.platform, e && e.message);
    }
  }
  return n;
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
  // 投稿が終わったメディアの削除と、長期トークンの延長を、1時間ごとに行う
  const clean = () => {
    try { mediaLib.cleanup(); } catch (e) { console.error('[media cleanup]', e); }
    try { ApiUsage.prune(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)); } catch (e) { console.error('[api usage prune]', e); }
    // 処理中のまま長く残った予約（処理の途中でエラーが起きた・止まったもの）を、二重投稿を避けて失敗扱いにする。
    // 処理の最中（tick の実行中）は、まだ送っている途中かもしれないので触らない
    if (!running) { try { ScheduledPosts.failStuck(new Date(Date.now() - 30 * 60 * 1000).toISOString()); } catch (e) { console.error('[fail stuck]', e); } }
    refreshExpiring().catch((e) => console.error('[token refresh]', e));
  };
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

module.exports = { tick, start, stop, processOne, ensureAccessToken, refreshExpiring, MAX_ATTEMPTS };
