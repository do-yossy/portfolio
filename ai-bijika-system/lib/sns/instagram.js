'use strict';
// Instagram（「Instagram APIとInstagram ログイン」）の公開投稿。プロアカウント（ビジネス／クリエイター）が対象。
// 画像（JPEG）またはリール動画を、メディアの公開URL経由で投稿する。仕様は公式ドキュメントで運用前に必ず確認すること。
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const poll = require('./poll');

const API_VERSION = 'v22.0';
const GRAPH = 'graph.instagram.com';
const AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

const id = 'instagram';
const label = 'Instagram';
const maxLength = 2200; // キャプションの上限

function creds(env = process.env) { return { appId: env.INSTAGRAM_APP_ID || '', appSecret: env.INSTAGRAM_APP_SECRET || '' }; }
function isConfigured(env = process.env) { const c = creds(env); return !!(c.appId && c.appSecret); }
const textLength = (t) => [...String(t)].length;

// 投稿前の検証。エラーなら日本語の文、問題なければ null
function validatePost({ text, media }) {
  if (!media) return 'Instagramは、画像または動画が必要です。';
  if (media.kind === 'image' && media.mime !== 'image/jpeg') return 'Instagramに投稿できる画像はJPEGです（PNGは使えません）。';
  if (textLength(text || '') > maxLength) return `Instagramのキャプションは${maxLength}文字までです。`;
  return null;
}

function authUrl({ state, redirectUri }) {
  const c = creds();
  return `${AUTH_URL}?${new URLSearchParams({ client_id: c.appId, redirect_uri: redirectUri, scope: SCOPES, response_type: 'code', state }).toString()}`;
}

async function call({ host = GRAPH, method = 'GET', path, query, form }) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  let r;
  try {
    r = await request({ host, method, path: `${path}${qs}`, headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body: form ? encodeForm(form) : undefined });
  } catch (e) {
    throw new SnsError(`Instagramに接続できませんでした (${e.message})`, { retriable: true });
  }
  if (r.status >= 200 && r.status < 300 && r.json) return r.json;
  const em = r.json && r.json.error;
  const err = classify(r.status, em && em.message ? `Instagram: ${em.message}` : '');
  // 認証エラーと判断するのは、トークンの失効・無効を示すコード(190)のときだけ（他のOAuthExceptionは連携を無効にしない）
  if (em && em.code === 190) { err.authError = true; err.retriable = false; }
  throw err;
}

async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const short = await call({ host: 'api.instagram.com', method: 'POST', path: '/oauth/access_token', form: { client_id: c.appId, client_secret: c.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code } });
  const first = (short.data && short.data[0]) || short;
  const long = await call({ path: '/access_token', query: { grant_type: 'ig_exchange_token', client_secret: c.appSecret, access_token: first.access_token } });
  const me = await call({ path: `/${API_VERSION}/me`, query: { fields: 'user_id,username', access_token: long.access_token } });
  return {
    accessToken: long.access_token, refreshToken: '',
    expiresAt: new Date(Date.now() + (Number(long.expires_in) || 60 * 24 * 3600) * 1000).toISOString(),
    externalUserId: String(me.user_id || me.id || first.user_id),
    handle: me.username ? `@${me.username}` : '',
  };
}

async function refresh({ accessToken }) {
  const r = await call({ path: '/refresh_access_token', query: { grant_type: 'ig_refresh_token', access_token: accessToken } });
  return { accessToken: r.access_token, refreshToken: '', expiresAt: new Date(Date.now() + (Number(r.expires_in) || 60 * 24 * 3600) * 1000).toISOString() };
}

async function waitFinished(containerId, accessToken) {
  for (let i = 0; i < poll.maxTries(); i++) {
    const s = await call({ path: `/${API_VERSION}/${encodeURIComponent(containerId)}`, query: { fields: 'status_code', access_token: accessToken } });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new SnsError('Instagram側で動画の処理に失敗しました。動画の形式・長さをご確認ください。');
    await poll.sleep(poll.intervalMs());
  }
  throw new SnsError('Instagram側の動画の処理が終わりませんでした。', { retriable: true });
}

async function publish({ accessToken, externalUserId, text, media }) {
  const err = validatePost({ text, media });
  if (err) throw new SnsError(err);
  const form = { caption: text || '', access_token: accessToken };
  if (media.kind === 'image') form.image_url = media.url;
  else { form.media_type = 'REELS'; form.video_url = media.url; }
  const created = await call({ method: 'POST', path: `/${API_VERSION}/${encodeURIComponent(externalUserId)}/media`, form });
  if (media.kind === 'video') await waitFinished(created.id, accessToken);
  let published;
  try {
    published = await call({ method: 'POST', path: `/${API_VERSION}/${encodeURIComponent(externalUserId)}/media_publish`, form: { creation_id: created.id, access_token: accessToken } });
  } catch (e) { throw ambiguous(e); }
  return { externalId: String(published.id) };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, usesPkce: false, mediaRule: '画像（JPEG）または動画（MP4・MOV）が必須' };
