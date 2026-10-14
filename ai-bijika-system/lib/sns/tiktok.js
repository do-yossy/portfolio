'use strict';
// TikTok Content Posting API（Direct Post）。動画をファイルアップロード方式で投稿する。
// 重要：アプリの審査（Audit）を通る前は、投稿はすべて「自分だけ」の公開範囲になり、テスターのアカウントしか使えない。
// 公開範囲の選択・コメント等の可否・利用者への表示など、TikTokのガイドラインに沿った画面が審査で求められる。仕様は公式ドキュメントで確認すること。
const fs = require('fs');
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const poll = require('./poll');
const { normalize } = require('./post');

const HOST = 'open.tiktokapis.com';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const SCOPES = 'user.info.basic,video.publish';

const id = 'tiktok';
const label = 'TikTok';
const maxLength = 2200; // 動画のタイトル（キャプション）の上限
const PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
const MB = 1024 * 1024;

function creds(env = process.env) { return { key: env.TIKTOK_CLIENT_KEY || '', secret: env.TIKTOK_CLIENT_SECRET || '' }; }
function isConfigured(env = process.env) { const c = creds(env); return !!(c.key && c.secret); }
const textLength = (t) => [...String(t)].length;

function validatePost(args) {
  const p = normalize(args); const text = p.text; const media = p.medias[0]; const options = p.options;
  if (p.category === 'tree' || p.medias.length > 1) return 'TikTokは、動画を1つだけ投稿できます（複数画像・ツリーは、このバージョンでは対応していません）。';
  if (!media || media.kind !== 'video') return 'TikTokは、動画（MP4・MOV）が必要です。';
  if (textLength(text || '') > maxLength) return `TikTokのタイトルは${maxLength}文字までです。`;
  if (!options || !PRIVACY.includes(options.privacy_level)) return 'TikTokの公開範囲を選んでください。';
  if (options.commercial_paid && options.privacy_level === 'SELF_ONLY') return '提携（有償）の商用コンテンツは、公開範囲を「自分のみ」にできません。';
  return null;
}

function authUrl({ state, redirectUri }) {
  const c = creds();
  return `${AUTH_URL}?${new URLSearchParams({ client_key: c.key, scope: SCOPES, response_type: 'code', redirect_uri: redirectUri, state }).toString()}`;
}

// TikTokは、失敗でも200で返し、error.code で知らせる。認可のAPIは、error が文字列（invalid_grant など）で返ることがある
function errorCodeOf(json) {
  if (!json || !json.error) return '';
  return typeof json.error === 'string' ? json.error : (json.error.code || '');
}
async function call({ host = HOST, method = 'POST', path, headers = {}, body, json = true }) {
  let r;
  try { r = await request({ host, method, path, headers, body }); }
  catch (e) { throw new SnsError(`TikTokに接続できませんでした (${e.message})`, { retriable: true }); }
  const code = errorCodeOf(r.json);
  const okStatus = r.status >= 200 && r.status < 300;
  if (okStatus && (!json || (r.json && (!code || code === 'ok')))) return r.json || {};
  const msg = (r.json && ((r.json.error && r.json.error.message) || r.json.error_description)) || '';
  const err = classify(r.status >= 400 ? r.status : 400, msg ? `TikTok: ${msg}` : (code ? `TikTok: ${code}` : ''));
  if (['access_token_invalid', 'scope_not_authorized', 'invalid_grant', 'invalid_client', 'token_expired'].includes(code)) { err.authError = true; err.retriable = false; }
  else if (code === 'rate_limit_exceeded') { err.retriable = true; }
  else if (okStatus) { err.retriable = false; }
  throw err;
}
const bearer = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json; charset=UTF-8' });

function tokenResult(t) {
  if (!t || !t.access_token) throw new SnsError('TikTokからトークンを取得できませんでした。連携をやり直してください。', { authError: true });
  return {
    accessToken: t.access_token, refreshToken: t.refresh_token || '',
    expiresAt: new Date(Date.now() + (Number(t.expires_in) || 86400) * 1000).toISOString(),
  };
}

async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const t = await call({ path: '/v2/oauth/token/', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeForm({ client_key: c.key, client_secret: c.secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }) });
  let name = '';
  try {
    const u = await call({ method: 'GET', path: '/v2/user/info/?fields=open_id,display_name', headers: bearer(t.access_token) });
    name = (u.data && u.data.user && u.data.user.display_name) || '';
  } catch { /* 表示名は任意 */ }
  const tr = tokenResult(t);
  return { ...tr, externalUserId: String(t.open_id), handle: name };
}

async function refresh({ refreshToken }) {
  const c = creds();
  const t = await call({ path: '/v2/oauth/token/', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeForm({ client_key: c.key, client_secret: c.secret, grant_type: 'refresh_token', refresh_token: refreshToken }) });
  return tokenResult(t);
}

// 投稿前に、このアカウントで使える公開範囲などをTikTokに問い合わせる（TikTokのガイドライン上、画面に反映する必要がある）
async function creatorInfo({ accessToken }) {
  const info = await call({ path: '/v2/post/publish/creator_info/query/', headers: bearer(accessToken), body: '{}' });
  const d = info.data || {};
  return {
    nickname: d.creator_nickname || d.creator_username || '',
    privacyLevelOptions: d.privacy_level_options || [],
    commentDisabled: !!d.comment_disabled, duetDisabled: !!d.duet_disabled, stitchDisabled: !!d.stitch_disabled,
    maxVideoPostDurationSec: Number(d.max_video_post_duration_sec) || 0,
  };
}

// チャンク分割（5MB〜64MBのチャンク。最後のチャンクは残りを含めて最大128MB）
function chunkPlan(size) {
  if (size <= 64 * MB) return { chunkSize: size, total: 1 };
  const chunkSize = 32 * MB;
  return { chunkSize, total: Math.floor(size / chunkSize) };
}

async function publish(args) {
  const { accessToken } = args;
  const p = normalize(args); const text = p.text; const media = p.medias[0]; const options = p.options;
  const err = validatePost(args);
  if (err) throw new SnsError(err);
  const info = await call({ path: '/v2/post/publish/creator_info/query/', headers: bearer(accessToken), body: '{}' });
  const allowed = (info.data && info.data.privacy_level_options) || [];
  if (allowed.length && !allowed.includes(options.privacy_level)) {
    throw new SnsError(`選んだ公開範囲は、このアカウントでは使えません（使えるもの：${allowed.join('、')}）。アプリの審査が終わるまでは「自分のみ（SELF_ONLY）」だけの場合があります。`);
  }
  if (info.data && Number(info.data.max_video_post_duration_sec) && media.durationSec && media.durationSec > Number(info.data.max_video_post_duration_sec)) {
    throw new SnsError(`動画が長すぎます（${Math.round(media.durationSec)}秒）。このアカウントで投稿できるのは、最大${info.data.max_video_post_duration_sec}秒です。`);
  }
  const plan = chunkPlan(media.size);
  const init = await call({ path: '/v2/post/publish/video/init/', headers: bearer(accessToken), body: JSON.stringify({
    post_info: { title: text || '', privacy_level: options.privacy_level, disable_comment: !!options.disable_comment, disable_duet: !!options.disable_duet, disable_stitch: !!options.disable_stitch,
      brand_organic_toggle: !!options.commercial_own, brand_content_toggle: !!options.commercial_paid },
    source_info: { source: 'FILE_UPLOAD', video_size: media.size, chunk_size: plan.chunkSize, total_chunk_count: plan.total },
  }) });
  const publishId = init.data && init.data.publish_id;
  const uploadUrl = init.data && init.data.upload_url;
  if (!publishId || !uploadUrl) throw new SnsError('TikTokのアップロード先を取得できませんでした。');
  const u = new URL(uploadUrl);
  const fd = fs.openSync(media.path, 'r');
  try {
    for (let i = 0; i < plan.total; i++) {
      const start = i * plan.chunkSize;
      const end = i === plan.total - 1 ? media.size - 1 : start + plan.chunkSize - 1;
      const buf = Buffer.alloc(end - start + 1);
      fs.readSync(fd, buf, 0, buf.length, start);
      const r = await request({ host: u.host, method: 'PUT', path: `${u.pathname}${u.search}`, timeoutMs: 120000,
        headers: { 'Content-Type': media.mime === 'video/quicktime' ? 'video/quicktime' : 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${media.size}` }, body: buf }).catch((e) => { throw new SnsError(`TikTokへのアップロードに失敗しました (${e.message})`, { retriable: true }); });
      if (r.status !== 201 && r.status !== 206 && r.status !== 200) throw classify(r.status, `TikTokへのアップロードに失敗しました (${r.status})`);
    }
  } finally { fs.closeSync(fd); }
  // ここから先は、動画を送ったあとの段階。応答だけが失われた場合に再試行すると、二重投稿になりうるため、再試行しない
  // （動画のアップロードまでの失敗は、まだ投稿されていないため、通常どおり再試行できる）
  try {
  for (let i = 0; i < poll.maxTries(); i++) {
    const s = await call({ path: '/v2/post/publish/status/fetch/', headers: bearer(accessToken), body: JSON.stringify({ publish_id: publishId }) });
    const st = s.data && s.data.status;
    if (st === 'PUBLISH_COMPLETE') return { externalId: String((s.data.publicaly_available_post_id && s.data.publicaly_available_post_id[0]) || publishId) };
    if (st === 'FAILED') throw new SnsError(`TikTok側で投稿に失敗しました（${(s.data && s.data.fail_reason) || '理由不明'}）`);
    await poll.sleep(poll.intervalMs());
  }
  throw new SnsError('TikTok側の処理が終わりませんでした。投稿されたかをご確認ください。');
  } catch (e) { throw ambiguous(e); }
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, creatorInfo, authUrl, exchangeCode, refresh, publish, usesPkce: false, PRIVACY, mediaRule: '動画（MP4・MOV）が必須', needsOptions: true };
