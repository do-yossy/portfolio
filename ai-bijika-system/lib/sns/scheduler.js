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

// 投稿へのリンク（permalink）を取得して保存する。対応しているSNS（adapter.permalink があるもの。今は Threads）だけ。
// 例外は外へ出さない（投稿はすでに済んでいるため、ここでの失敗で投稿を失敗・再試行にしない）
async function savePermalink(postId, adapter, accessToken, externalId) {
  if (!externalId || typeof adapter.permalink !== 'function') return '';
  try {
    const url = await adapter.permalink({ accessToken, mediaId: externalId });
    if (url) ScheduledPosts.setPermalink(postId, url);
    return url || '';
  } catch (e) {
    console.error('[permalink]', adapter.id, e && e.message);
    return '';
  }
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
    // 投稿済みにしたあとで、投稿へのリンクを取りに行く（Threads）。取れなくても投稿済みのまま（リンクを出さないだけ）
    await savePermalink(post.id, adapter, accessToken, r.externalId);
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

// ── YouTube：Google の側で取り消された連携の検知と削除 ──
// 公式（YouTube API Services の Developer Policies III.D.2 の2段落目）：Google のセキュリティの設定のページから取り消された場合も、
// その利用者のデータを削除する。そのために、トークンがまだ有効かを定期的に確かめ、更新できない利用者のデータを削除する。
// 削除は、取り消しから30日（暦日）以内に行う。
// 本サービスの作り：
//   1) checkYoutubeTokens：有効な YouTube の連携のトークンを、1日1回、更新して確かめる。更新できなければ「再連携が必要」にする（reauth_at を記録）
//   2) purgeRevokedYoutube：「再連携が必要」になってから YOUTUBE_REAUTH_DELETE_DAYS 日たった連携を消す
// どちらも1時間ごとの定期処理（start の clean）で呼ぶ。投稿の前のトークンの更新（ensureAccessToken）で気づいた場合も、同じく「再連携が必要」になる。

// 確かめる間隔。最後に確かめた日時（token_checked_at。連携した・トークンを更新できたときに記録する）から、この時間以上たった連携だけを確かめる
const YOUTUBE_TOKEN_CHECK_HOURS = 24;
// 削除までの日数（「再連携が必要」になった日時 reauth_at から数える）。28日の根拠：
//   ・取り消しに気づくまで：最長で約25時間。確かめるのは、最後に確かめてから24時間たった後の、最初の1時間ごとの処理のため
//     （最後に確かめた直後に取り消された場合が最長）
//   ・気づいてから消すまで：28日と最長1時間。28日たった後の、最初の1時間ごとの処理で消すため
//   ・合計で、取り消しから最長で28日と26時間（約29.1日）になり、公式の30日以内に収まる。
//     残りの約1日は、再起動や Google の一時的なエラーで、確かめ・削除が遅れたときの余裕（一時的なエラーのときは、次の1時間ごとの処理で確かめ直す）。
//   ・30日にすると、気づくまでの時間の分だけ、取り消しから30日を超えることがある。
// 日数を変えるときは、マイページの文言（lib/service-ui.js。この定数を使う）と、プライバシーポリシー・セットアップ手順の記載もそろえる
const YOUTUBE_REAUTH_DELETE_DAYS = 28;

// 1) トークンが有効かを確かめる。戻り値は { checked: 確かめた件数, refreshed: 更新できた件数, reauth: 「再連携が必要」にした件数 }
//   成功：新しいトークンを保存する（updateTokens。確かめた日時も記録する）
//   invalid_grant などの認証エラー（取り消された・失効した）、または更新用のトークンが無い：「再連携が必要」にする
//   そのほかのエラー（通信・5xx・429 などの一時的なエラーや、本サービスの設定の誤り invalid_client：クライアントIDやシークレットの誤り）：
//     何もしない。確かめた日時を記録しないため、次の1時間ごとの処理で確かめ直す（設定の誤りで、全員を「再連携が必要」にしないため）
// 待っている間に、解除・再連携・投稿の前の更新などで行が変わっていたら、結果を使わない（新しいトークンを、古いトークンの結果で上書きしない）
let checkingYoutube = false;
async function checkYoutubeTokens(nowMs = Date.now()) {
  const res = { checked: 0, refreshed: 0, reauth: 0 };
  const adapter = registry.get('youtube');
  // キーが未設定なら確かめない（送っても、本サービスの設定の誤りでしか失敗しないため）。前の回がまだ動いていれば重ねない
  if (!adapter || typeof adapter.refresh !== 'function' || !adapter.isConfigured() || checkingYoutube) return res;
  checkingYoutube = true;
  try {
    const k = key();
    const before = new Date(nowMs - YOUTUBE_TOKEN_CHECK_HOURS * 3600 * 1000).toISOString();
    for (const listed of SnsAccounts.listTokenCheckDue('youtube', before)) {
      res.checked++;
      let r = null;
      let err = null;
      let noRefresh = false;
      try {
        const refreshTok = listed.refresh_token_enc ? box.decrypt(listed.refresh_token_enc, k) : '';
        if (refreshTok) r = await adapter.refresh({ accessToken: '', refreshToken: refreshTok });
        else noRefresh = true;
      } catch (e) { err = e; }
      const cur = SnsAccounts.get(listed.id);
      if (!cur || cur.status !== 'active' || cur.refresh_token_enc !== listed.refresh_token_enc) continue;
      if (r) {
        SnsAccounts.updateTokens(cur.id, {
          accessTokenEnc: box.encrypt(r.accessToken, k),
          refreshTokenEnc: r.refreshToken ? box.encrypt(r.refreshToken, k) : cur.refresh_token_enc,
          expiresAt: r.expiresAt,
        });
        res.refreshed++;
      } else if (noRefresh || (err && err.authError && err.oauthError !== 'invalid_client')) {
        SnsAccounts.setStatus(cur.id, 'reauth_required');
        res.reauth++;
        console.warn('[youtube token check] トークンを更新できないため、「再連携が必要」にしました', cur.id, noRefresh ? '（更新用のトークンがありません）' : (err && err.message));
      } else {
        console.error('[youtube token check] 確かめられませんでした（次の定期処理で確かめ直します）', cur.id, err && err.message);
      }
    }
  } finally {
    checkingYoutube = false;
  }
  return res;
}

// 2) 「再連携が必要」になってから YOUTUBE_REAUTH_DELETE_DAYS 日たった連携を消す。
// 消し方はマイページの解除と同じ（Google へのトークンの取り消しを送ってから、行・予約・投稿IDとリンクを消す。lib/sns/disconnect.js）。
// その利用者のマイページで知らせる。冪等（消した連携は次から対象にならない）。戻り値は消した件数。
// 一覧は取った時点の写しのため、1件ずつ、消す直前に行を読み直し、まだ「再連携が必要」で期限を過ぎているときだけ消す
// （前の件の取り消しを待つ間に、利用者が再連携・解除した場合に、有効な連携を消したり、取り消しや知らせを出したりしないため）。
// 読み直しから削除までは同期のため、間に割り込まれない
async function purgeRevokedYoutube(nowMs = Date.now()) {
  const { removeAccount } = require('./disconnect');
  const { Notices } = require('../meta-deletion');
  const before = new Date(nowMs - YOUTUBE_REAUTH_DELETE_DAYS * 24 * 3600 * 1000).toISOString();
  let n = 0;
  for (const listed of SnsAccounts.listReauthBefore('youtube', before)) {
    try {
      const account = SnsAccounts.get(listed.id);
      if (!account || account.status !== 'reauth_required' || !account.reauth_at || !(account.reauth_at < before)) continue;
      const revoking = removeAccount(account);
      Notices.add(account.user_id, 'youtube', 'expired');
      n++;
      await revoking;
    } catch (e) {
      console.error('[youtube purge]', e && e.message);
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
  // 起動時：送り始めていた行は5分より古いものを失敗に、まだ送り始めていない行はすぐ予約に戻す（Fly.ioは1台構成で、新旧のプロセスが同時に動かない前提）
  ScheduledPosts.failStuck(new Date(Date.now() - 5 * 60 * 1000).toISOString(), new Date(Date.now() + 1000).toISOString());
  timer = setInterval(() => { tick().catch((e) => console.error('[scheduler]', e)); }, intervalMs);
  if (timer.unref) timer.unref();
  // 投稿が終わったメディアの削除と、長期トークンの延長と、YouTubeの連携のトークンの確認（連携ごとに1日1回）と、
  // 再連携が必要なまま28日たったYouTubeの連携の削除を、1時間ごとに行う
  const clean = () => {
    try { mediaLib.cleanup(); } catch (e) { console.error('[media cleanup]', e); }
    try { ApiUsage.prune(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)); } catch (e) { console.error('[api usage prune]', e); }
    // 処理中のまま長く残った予約（処理の途中でエラーが起きた・止まったもの）を、二重投稿を避けて失敗扱いにする。
    // 処理の最中（tick の実行中）は、まだ送っている途中かもしれないので触らない
    if (!running) { try { ScheduledPosts.failStuck(new Date(Date.now() - 30 * 60 * 1000).toISOString()); } catch (e) { console.error('[fail stuck]', e); } }
    refreshExpiring().catch((e) => console.error('[token refresh]', e));
    checkYoutubeTokens().catch((e) => console.error('[youtube token check]', e));
    purgeRevokedYoutube().catch((e) => console.error('[youtube purge]', e));
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

module.exports = { tick, start, stop, processOne, ensureAccessToken, refreshExpiring, checkYoutubeTokens, purgeRevokedYoutube, YOUTUBE_TOKEN_CHECK_HOURS, YOUTUBE_REAUTH_DELETE_DAYS, savePermalink, MAX_ATTEMPTS };
