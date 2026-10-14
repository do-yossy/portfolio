'use strict';
// Threads（Meta）公式API。テキスト投稿のみ。
// 仕様は公式ドキュメント（Threads API）で運用前に必ず確認すること。
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const poll = require('./poll');
const { normalize } = require('./post');

const HOST = 'graph.threads.net';
const AUTH_URL = 'https://threads.net/oauth/authorize';
const SCOPES = 'threads_basic,threads_content_publish';

const id = 'threads';
const label = 'Threads';
const maxLength = 500;

function creds(env = process.env) {
  return { appId: env.THREADS_APP_ID || '', appSecret: env.THREADS_APP_SECRET || '' };
}
function isConfigured(env = process.env) {
  const c = creds(env);
  return !!(c.appId && c.appSecret);
}
function textLength(text) {
  return [...String(text)].length;
}

function authUrl({ state, redirectUri }) {
  const c = creds();
  const q = new URLSearchParams({ client_id: c.appId, redirect_uri: redirectUri, scope: SCOPES, response_type: 'code', state });
  return `${AUTH_URL}?${q.toString()}`;
}

async function call(method, path, { form, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  const body = form ? encodeForm(form) : undefined;
  let r;
  try {
    r = await request({
      host: HOST, method, path: `${path}${qs}`,
      headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
      body,
    });
  } catch (e) {
    throw new SnsError(`Threadsに接続できませんでした (${e.message})`, { retriable: true });
  }
  if (r.status >= 200 && r.status < 300 && r.json) return r.json;
  const msg = r.json && r.json.error && r.json.error.message;
  const err = classify(r.status, msg ? `Threads: ${msg}` : '');
  if (r.json && r.json.error && r.json.error.code === 190) { err.authError = true; err.retriable = false; }
  throw err;
}

// 認可コード → 短期トークン → 長期トークン（約60日）
async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const short = await call('POST', '/oauth/access_token', {
    form: { client_id: c.appId, client_secret: c.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code },
  });
  const long = await call('GET', '/access_token', {
    query: { grant_type: 'th_exchange_token', client_secret: c.appSecret, access_token: short.access_token },
  });
  const me = await call('GET', '/v1.0/me', { query: { fields: 'id,username', access_token: long.access_token } });
  return {
    accessToken: long.access_token,
    refreshToken: '',
    expiresAt: new Date(Date.now() + (Number(long.expires_in) || 60 * 24 * 3600) * 1000).toISOString(),
    externalUserId: String(me.id || short.user_id),
    handle: me.username ? `@${me.username}` : '',
  };
}

// 長期トークンの更新（期限内に更新するとさらに約60日延びる）
async function refresh({ accessToken }) {
  const r = await call('GET', '/refresh_access_token', { query: { grant_type: 'th_refresh_token', access_token: accessToken } });
  return {
    accessToken: r.access_token,
    refreshToken: '',
    expiresAt: new Date(Date.now() + (Number(r.expires_in) || 60 * 24 * 3600) * 1000).toISOString(),
  };
}

function validatePost(args) {
  const p = normalize(args); const text = p.text; const media = p.medias[0];
  if (p.category === 'tree') return 'Threadsのツリー投稿は、このバージョンでは対応していません。';
  if (p.medias.length > 1) return 'Threadsの複数画像は、このバージョンでは対応していません。';
  if (!String(text || '').trim() && !media) return 'Threadsは、本文か画像・動画のどちらかが必要です。';
  if (textLength(text || '') > maxLength) return `Threadsは${maxLength}文字までです。`;
  return null;
}

async function waitFinished(containerId, accessToken) {
  for (let i = 0; i < poll.maxTries(); i++) {
    const s = await call('GET', `/v1.0/${encodeURIComponent(containerId)}`, { query: { fields: 'status,error_message', access_token: accessToken } });
    if (s.status === 'FINISHED') return;
    if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new SnsError(`Threads側で動画の処理に失敗しました${s.error_message ? `（${s.error_message}）` : ''}`);
    await poll.sleep(poll.intervalMs());
  }
  throw new SnsError('Threads側の動画の処理が終わりませんでした。', { retriable: true });
}

// 投稿：コンテナ作成（テキスト／画像／動画）→（動画は処理待ち）→ 公開
async function publish(args) {
  const { accessToken, externalUserId } = args;
  const p = normalize(args); const text = p.text; const media = p.medias[0];
  const err = validatePost(args);
  if (err) throw new SnsError(err);
  const form = { text: text || '', access_token: accessToken };
  if (!media) form.media_type = 'TEXT';
  else if (media.kind === 'image') { form.media_type = 'IMAGE'; form.image_url = media.url; }
  else { form.media_type = 'VIDEO'; form.video_url = media.url; }
  const created = await call('POST', `/v1.0/${encodeURIComponent(externalUserId)}/threads`, { form });
  if (media && media.kind === 'video') await waitFinished(created.id, accessToken);
  let published;
  try {
    published = await call('POST', `/v1.0/${encodeURIComponent(externalUserId)}/threads_publish`, {
      form: { creation_id: created.id, access_token: accessToken },
    });
  } catch (e) { throw ambiguous(e); }
  return { externalId: String(published.id) };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, usesPkce: false, mediaRule: '画像・動画は任意' };
