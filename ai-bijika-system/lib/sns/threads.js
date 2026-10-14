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

const MAX_CAROUSEL = 20;
const MAX_TREE = 25;

// 1枚分（本文＋添付）の検証。エラーなら日本語の文
function validateOne(label, text, medias) {
  if (medias.length > MAX_CAROUSEL) return `${label}の画像・動画は${MAX_CAROUSEL}件までです。`;
  if (medias.length > 1 && medias.some((m) => m.mime === 'image/gif')) return `${label}: 複数枚の投稿にGIFは使えません。`;
  if (!String(text || '').trim() && !medias.length) return `${label}は、本文か画像・動画のどちらかが必要です。`;
  if (textLength(text || '') > maxLength) return `${label}は${maxLength}文字までです。`;
  return null;
}

function validatePost(args) {
  const p = normalize(args);
  const e = validateOne('Threads', p.text, p.medias);
  if (e) return e;
  if (p.category === 'tree') {
    if (!p.tree.length) return 'ツリー投稿は、2件目以降の投稿が必要です。';
    if (p.tree.length + 1 > MAX_TREE) return `Threadsのツリーは${MAX_TREE}件までです。`;
    for (let i = 0; i < p.tree.length; i++) {
      const e2 = validateOne(`ツリー${i + 2}件目`, p.tree[i].text, p.tree[i].medias || []);
      if (e2) return e2;
    }
  }
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

function mediaForm(m) {
  return m.kind === 'image' ? { media_type: 'IMAGE', image_url: m.url } : { media_type: 'VIDEO', video_url: m.url };
}

// 1件分の投稿（テキスト／画像／動画／カルーセル）。replyTo があればその投稿への返信にする。戻り値は公開された投稿ID
async function publishOne({ accessToken, externalUserId, text, medias, replyTo }) {
  const base = `/v1.0/${encodeURIComponent(externalUserId)}`;
  const form = { access_token: accessToken };
  if (replyTo) form.reply_to_id = replyTo;
  let created;
  if (medias.length > 1) {
    const kids = [];
    for (const m of medias) {
      const c = await call('POST', `${base}/threads`, { form: { ...mediaForm(m), is_carousel_item: 'true', access_token: accessToken } });
      if (m.kind === 'video') await waitFinished(c.id, accessToken);
      kids.push(c.id);
    }
    created = await call('POST', `${base}/threads`, { form: { ...form, media_type: 'CAROUSEL', children: kids.join(','), text: text || '' } });
  } else if (medias.length === 1) {
    created = await call('POST', `${base}/threads`, { form: { ...form, ...mediaForm(medias[0]), text: text || '' } });
    if (medias[0].kind === 'video') await waitFinished(created.id, accessToken);
  } else {
    created = await call('POST', `${base}/threads`, { form: { ...form, media_type: 'TEXT', text: text || '' } });
  }
  let published;
  try {
    published = await call('POST', `${base}/threads_publish`, { form: { creation_id: created.id, access_token: accessToken } });
  } catch (e) { throw ambiguous(e); }
  return String(published.id);
}

// 投稿。ツリーは1件目→2件目以降を前の投稿への返信として順に公開する
async function publish(args) {
  const { accessToken, externalUserId } = args;
  const p = normalize(args);
  const err = validatePost(args);
  if (err) throw new SnsError(err);
  const items = [{ text: p.text, medias: p.medias }, ...(p.category === 'tree' ? p.tree : [])];
  let first = '';
  let prev = '';
  for (let i = 0; i < items.length; i++) {
    try {
      prev = await publishOne({ accessToken, externalUserId, text: items[i].text, medias: items[i].medias || [], replyTo: prev });
      if (!first) first = prev;
    } catch (e) {
      // 1件目が公開済みなら、自動の再試行は二重投稿になるため止める
      if (first) { e.retriable = false; e.message = `${e.message}（ツリーの${i}件目までは投稿済みです。SNSでご確認ください）`; }
      throw e;
    }
  }
  return { externalId: first };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, usesPkce: false, mediaRule: '画像・動画は任意（最大20件のカルーセル、ツリー25件まで）' };
