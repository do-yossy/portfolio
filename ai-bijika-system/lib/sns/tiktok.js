'use strict';
// TikTok Content Posting API（Direct Post）。動画をファイルアップロード方式で投稿する。
// 重要：審査は2段階。アプリの審査（Submit for review）の前は、サンドボックスでテスターのアカウントしか使えない。
// アプリの審査の後も、投稿の監査（Audit）を通るまでは、公開範囲は「自分のみ」だけ・24時間で5人まで・投稿するアカウントは非公開（Content Sharing Guidelines）。
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

const MAX_PHOTOS = 35;
const PHOTO_TITLE_MAX = 90;
const PHOTO_DESC_MAX = 4000;

function validatePost(args) {
  const p = normalize(args); const text = p.text; const media = p.medias[0]; const options = p.options;
  if (p.category === 'tree') return 'TikTokには、ツリー投稿はできません。';
  if (!media) return 'TikTokは、動画（MP4・MOV）または写真（JPEG）が必要です。';
  if (media.kind === 'video') {
    if (p.medias.length > 1) return 'TikTokの動画は1本だけ投稿できます。';
    if (textLength(text || '') > maxLength) return `TikTokのタイトルは${maxLength}文字までです。`;
  } else {
    // 写真投稿（フォトモード）：TikTokが当サービスの公開URLから画像を取得する（URLの所有確認がTikTok側で必要）
    if (p.medias.some((m) => m.kind !== 'image')) return 'TikTokでは、写真と動画を同時に投稿できません。';
    if (p.medias.length > MAX_PHOTOS) return `TikTokの写真は${MAX_PHOTOS}枚までです。`;
    if (p.medias.some((m) => m.mime !== 'image/jpeg')) return 'TikTokに投稿できる写真はJPEGです（PNGは使えません）。';
    if (textLength(text || '') > PHOTO_DESC_MAX) return `TikTokの写真投稿の説明は${PHOTO_DESC_MAX}文字までです。`;
  }
  if (!options || !PRIVACY.includes(options.privacy_level)) return 'TikTokの公開範囲を選んでください。';
  // 投稿の監査（Audit）を通るまでは、公開範囲「自分のみ」だけ（公式：監査前のアプリは SELF_ONLY でしか投稿できない）
  if (process.env.TIKTOK_AUDITED !== 'true' && options.privacy_level !== 'SELF_ONLY') return 'TikTokは、このサービスがTikTokの投稿の監査（Audit）を通るまで、公開範囲「自分のみ」でしか投稿できません（投稿するアカウントも非公開にしておく必要があります）。';
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
// 投稿のときに返る、認証以外の理由の拒否（公式の Direct Post のエラー）。連携のやり直しでは直らない
const KNOWN_ERRORS = {
  spam_risk_too_many_posts: 'TikTokの、1日に投稿できる数の上限に達しました。時間をおいてから投稿してください。',
  spam_risk_user_banned_from_posting: 'このTikTokアカウントは、TikTok側で投稿が制限されています。',
  reached_active_user_cap: 'このアプリから投稿できる人数の上限に達しています（このサービスがTikTokの投稿の監査（Audit）を通るまでは、24時間で5人まで）。運営者にお問い合わせください。',
  unaudited_client_can_only_post_to_private_accounts: 'このサービスがTikTokの投稿の監査（Audit）を通るまでは、非公開のTikTokアカウントから、公開範囲「自分のみ」でしか投稿できません。TikTokアカウントを非公開にしてから、もう一度お試しください。',
  url_ownership_unverified: '写真のURLの所有確認が済んでいないため、TikTokに写真を投稿できません（運営者の設定が必要です）。',
  privacy_level_option_mismatch: '選んだ公開範囲は、このアカウントでは使えません。公開範囲を選び直してください。',
};

async function call({ host = HOST, method = 'POST', path, headers = {}, body, json = true }) {
  let r;
  try { r = await request({ host, method, path, headers, body }); }
  catch (e) { throw new SnsError(`TikTokに接続できませんでした (${e.message})`, { retriable: true }); }
  const code = errorCodeOf(r.json);
  const okStatus = r.status >= 200 && r.status < 300;
  if (okStatus && (!json || (r.json && (!code || code === 'ok')))) return r.json || {};
  // 2xx なのに本文を読み取れない（途中で切れた応答など）：受け付けられた可能性があるので、公開の段階では「投稿されたか不明」、状態の確認では次の確認でやり直す
  if (okStatus && json && !r.json) throw classify(r.status, 'TikTokからの応答を読み取れませんでした');
  const msg = (r.json && ((r.json.error && r.json.error.message) || r.json.error_description)) || '';
  const err = classify(r.status >= 400 ? r.status : 400, KNOWN_ERRORS[code] || (msg ? `TikTok: ${msg}` : (code ? `TikTok: ${code}` : '')));
  err.code = code;
  if (['access_token_invalid', 'scope_not_authorized', 'invalid_grant', 'invalid_client', 'token_expired'].includes(code)) { err.authError = true; err.retriable = false; }
  else if (code === 'rate_limit_exceeded') { err.retriable = true; err.authError = false; }
  else if (KNOWN_ERRORS[code] || okStatus) { err.authError = false; err.retriable = false; } // 上限・投稿の監査（Audit）前の制限・設定の問題（連携し直しても直らない）
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
  let opts = d.privacy_level_options || [];
  // 投稿の監査（Audit）を通るまでは「自分のみ」しか投稿できないため、画面の選択肢もそれだけにする
  if (process.env.TIKTOK_AUDITED !== 'true') opts = opts.filter((v) => v === 'SELF_ONLY');
  return {
    nickname: d.creator_nickname || d.creator_username || '',
    privacyLevelOptions: opts,
    audited: process.env.TIKTOK_AUDITED === 'true',
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
  const p = normalize(args); const text = p.text; const media = p.medias[0];
  const err = validatePost(args);
  if (err) throw new SnsError(err);
  const info = await call({ path: '/v2/post/publish/creator_info/query/', headers: bearer(accessToken), body: '{}' });
  const allowed = (info.data && info.data.privacy_level_options) || [];
  if (allowed.length && !allowed.includes(p.options.privacy_level)) {
    throw new SnsError(`選んだ公開範囲は、このアカウントでは使えません（使えるもの：${allowed.join('、')}）。このサービスがTikTokの投稿の監査（Audit）を通るまでは「自分のみ（SELF_ONLY）」だけです。`);
  }
  // アカウント側でコメント・デュエット・ステッチを止めている場合は、送る時点の設定でも必ず「許可しない」にする（予約した後に設定が変わった場合も含む）
  const d = info.data || {};
  const options = { ...p.options, disable_comment: !!p.options.disable_comment || !!d.comment_disabled, disable_duet: !!p.options.disable_duet || !!d.duet_disabled, disable_stitch: !!p.options.disable_stitch || !!d.stitch_disabled };
  if (media.kind === 'image') return publishPhotos({ accessToken, p, options });
  if (info.data && Number(info.data.max_video_post_duration_sec) && media.durationSec && media.durationSec > Number(info.data.max_video_post_duration_sec)) {
    throw new SnsError(`動画が長すぎます（${Math.round(media.durationSec)}秒）。このアカウントで投稿できるのは、最大${info.data.max_video_post_duration_sec}秒です。`);
  }
  const plan = chunkPlan(media.size);
  const init = await call({ path: '/v2/post/publish/video/init/', headers: bearer(accessToken), body: JSON.stringify({
    post_info: { title: text || '', privacy_level: options.privacy_level, disable_comment: !!options.disable_comment, disable_duet: !!options.disable_duet, disable_stitch: !!options.disable_stitch,
      brand_organic_toggle: !!options.commercial_own, brand_content_toggle: !!options.commercial_paid, ...(media.aiGenerated ? { is_aigc: true } : {}) },
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
      const last = i === plan.total - 1;
      let r;
      try {
        r = await request({ host: u.host, method: 'PUT', path: `${u.pathname}${u.search}`, timeoutMs: 120000,
          headers: { 'Content-Type': media.mime === 'video/quicktime' ? 'video/quicktime' : 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${media.size}` }, body: buf });
      } catch (e) {
        const err = new SnsError(`TikTokへのアップロードに失敗しました (${e.message})`, { retriable: true });
        // 最後のチャンクを送り終えた時点で、TikTokが投稿の処理を始めることがある（公式：201は全部を受け取って処理を開始した、の意味）。
        // 応答だけが失われた可能性があるため、最後のチャンクの通信エラーは自動で再試行しない
        throw last ? ambiguous(err) : err;
      }
      if (r.status !== 201 && r.status !== 206 && r.status !== 200) {
        const err = classify(r.status, `TikTokへのアップロードに失敗しました (${r.status})`);
        // 最後のチャンクで 5xx が返った場合も、中継の装置だけがエラーを返し、TikTokは受け取って処理を始めている可能性がある。自動で再試行しない
        throw last ? ambiguous(err) : err;
      }
    }
  } finally { fs.closeSync(fd); }
  // ここから先は、動画を送ったあとの段階。応答だけが失われた場合に再試行すると、二重投稿になりうるため、再試行しない
  // （動画のアップロードまでの失敗は、まだ投稿されていないため、通常どおり再試行できる）
  return waitPublished(accessToken, publishId);
}

async function waitPublished(accessToken, publishId) {
  try {
    const r = await poll.until(async () => {
      let s;
      try { s = await call({ path: '/v2/post/publish/status/fetch/', headers: bearer(accessToken), body: JSON.stringify({ publish_id: publishId }) }); }
      catch (e) { if (e.retriable && !e.authError) return null; throw e; } // 一時的なエラー（429・5xx）は、次の確認でやり直す
      const st = s.data && s.data.status;
      if (st === 'PUBLISH_COMPLETE') return { done: true, value: String((s.data.publicaly_available_post_id && s.data.publicaly_available_post_id[0]) || publishId) };
      if (st === 'FAILED') throw new SnsError(`TikTok側で投稿に失敗しました（${(s.data && s.data.fail_reason) || '理由不明'}）`);
      return null;
    }, { maxMs: 10 * 60 * 1000 });
    if (!r) throw new SnsError('TikTok側の処理が時間内に終わりませんでした。投稿されたかをご確認ください。');
    return { externalId: r.value };
  } catch (e) { throw ambiguous(e); }
}

// 写真投稿：本文の1行目をタイトル（90文字まで）、全体を説明にする
async function publishPhotos({ accessToken, p, options }) {
  const t = String(p.text || '').trim();
  const title = [...(t.split('\n')[0] || '')].slice(0, PHOTO_TITLE_MAX).join('');
  let init;
  try {
    init = await call({ path: '/v2/post/publish/content/init/', headers: bearer(accessToken), body: JSON.stringify({
      post_info: { title, description: t, privacy_level: options.privacy_level, disable_comment: !!options.disable_comment, auto_add_music: options.auto_add_music === true,
        brand_organic_toggle: !!options.commercial_own, brand_content_toggle: !!options.commercial_paid },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: p.medias.map((m) => m.url) },
      post_mode: 'DIRECT_POST', media_type: 'PHOTO', ...(p.medias.some((m) => m.aiGenerated) ? { is_aigc: true } : {}),
    }) });
  } catch (e) { throw ambiguous(e); }
  const publishId = init.data && init.data.publish_id;
  if (!publishId) throw new SnsError('TikTokの写真投稿を開始できませんでした。');
  return waitPublished(accessToken, publishId);
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, creatorInfo, authUrl, exchangeCode, refresh, publish, usesPkce: false, PRIVACY, mediaRule: '動画（MP4・MOV）または写真（JPEG・35枚まで）が必須', needsOptions: true };
