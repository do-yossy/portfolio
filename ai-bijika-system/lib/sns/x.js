'use strict';
// X（旧Twitter）API v2。OAuth 2.0（PKCE）で連携し、テキスト・画像（4枚まで）・動画（1本）・ツリーを投稿する。
// メディアは v2 のメディアアップロード（画像は一括、動画は分割アップロード）。エンドポイントの細部は運用前に公式で必ず確認すること。
// 利用できる投稿数・費用はXのAPIプラン次第。運用前にXの公式ドキュメントで必ず確認すること。
const crypto = require('crypto');
const fs = require('fs');
const { request, encodeForm } = require('../http-client');
const poll = require('./poll');
const { SnsError, classify, ambiguous } = require('./errors');
const { normalize } = require('./post');

const HOST = 'api.x.com';
const AUTH_URL = 'https://x.com/i/oauth2/authorize';
const SCOPES = 'tweet.read tweet.write users.read offline.access media.write';

const id = 'x';
const label = 'X';
const maxLength = 280; // 重み付き文字数（日本語などは1文字を2として数える）

function creds(env = process.env) {
  return { clientId: env.X_CLIENT_ID || '', clientSecret: env.X_CLIENT_SECRET || '' };
}
function isConfigured(env = process.env) {
  const c = creds(env);
  return !!(c.clientId && c.clientSecret);
}

// 簡易な重み付き長さ。Xの公式ルール（twitter-text）の近似：CJK等は2、それ以外は1、URLは23
function textLength(text) {
  let n = 0;
  const s = String(text).replace(/https?:\/\/\S+/g, () => { n += 23; return ''; });
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const wide = (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
      || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff);
    n += wide ? 2 : 1;
  }
  return n;
}

const MAX_TREE = 25;
const MAX_IMAGES = 4;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_SEC = 140;
const CHUNK = 4 * 1024 * 1024;
function validatePost(args) {
  const p = normalize(args);
  const items = [{ text: p.text, medias: p.medias }, ...(p.category === 'tree' ? p.tree : [])];
  if (p.category === 'tree' && items.length < 2) return 'ツリー投稿は、2件目以降の投稿が必要です。';
  if (items.length > MAX_TREE) return `Xのツリーは${MAX_TREE}件までです。`;
  for (let i = 0; i < items.length; i++) {
    const t = items[i].text;
    const who = i === 0 ? 'X' : `ツリー${i + 1}件目`;
    const ms = items[i].medias || [];
    const vids = ms.filter((m) => m.kind === 'video');
    if (vids.length && ms.length > 1) return `${who}: 動画は1本だけで、画像と同時には添付できません。`;
    if (ms.length > MAX_IMAGES) return `${who}: 画像は${MAX_IMAGES}枚までです。`;
    if (ms.some((m) => m.kind === 'image' && m.size > IMAGE_MAX_BYTES)) return `${who}: Xに添付できる画像は5MBまでです。`;
    if (vids.some((m) => m.durationSec && m.durationSec > VIDEO_MAX_SEC)) return `${who}: Xに添付できる動画は${VIDEO_MAX_SEC}秒までです。`;
    if (!String(t || '').trim() && !ms.length) return `${who}は、本文か画像・動画が必要です。`;
    if (textLength(t || '') > maxLength) return `${who}の文字数の上限（${maxLength}。日本語は1文字を2として計算）を超えています。`;
  }
  return null;
}

function newPkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function authUrl({ state, redirectUri, codeChallenge }) {
  const c = creds();
  const q = new URLSearchParams({
    response_type: 'code', client_id: c.clientId, redirect_uri: redirectUri, scope: SCOPES,
    state, code_challenge: codeChallenge, code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${q.toString()}`;
}

function basicAuth() {
  const c = creds();
  return `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`;
}

async function call({ method, path, headers, body }) {
  let r;
  try {
    r = await request({ host: HOST, method, path, headers, body });
  } catch (e) {
    throw new SnsError(`Xに接続できませんでした (${e.message})`, { retriable: true });
  }
  if (r.status >= 200 && r.status < 300 && r.json) return r.json;
  const detail = (r.json && (r.json.detail || r.json.error_description || r.json.title)) || '';
  throw classify(r.status, detail ? `X: ${detail}` : '');
}

function tokenResult(t) {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token || '',
    expiresAt: new Date(Date.now() + (Number(t.expires_in) || 7200) * 1000).toISOString(),
  };
}

async function exchangeCode({ code, redirectUri, codeVerifier }) {
  const c = creds();
  const t = await call({
    method: 'POST', path: '/2/oauth2/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: encodeForm({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: c.clientId }),
  });
  const me = await call({ method: 'GET', path: '/2/users/me', headers: { Authorization: `Bearer ${t.access_token}` } });
  return { ...tokenResult(t), externalUserId: String(me.data.id), handle: me.data.username ? `@${me.data.username}` : '' };
}

// アクセストークンの有効期間は短い（約2時間）。更新のたびにリフレッシュトークンも新しくなる
async function refresh({ refreshToken }) {
  const c = creds();
  const t = await call({
    method: 'POST', path: '/2/oauth2/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: encodeForm({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: c.clientId }),
  });
  return tokenResult(t);
}

// multipart/form-data の本文を作る（依存を増やさないための最小実装）
function multipart(fields) {
  const boundary = `----sq${require('crypto').randomBytes(12).toString('hex')}`;
  const parts = [];
  for (const [name, v] of Object.entries(fields)) {
    if (Buffer.isBuffer(v)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n`), v, Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${v}\r\n`));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` };
}

async function uploadImage(accessToken, m) {
  const mp = multipart({ media: fs.readFileSync(m.path), media_category: 'tweet_image', media_type: m.mime });
  const r = await call({ method: 'POST', path: '/2/media/upload', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': mp.type }, body: mp.body });
  const idv = r.data && r.data.id;
  if (!idv) throw new SnsError('Xへの画像のアップロードに失敗しました。');
  return String(idv);
}

async function uploadVideo(accessToken, m) {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const init = await call({ method: 'POST', path: '/2/media/upload/initialize', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: m.mime === 'video/quicktime' ? 'video/quicktime' : 'video/mp4', total_bytes: m.size, media_category: 'tweet_video' }) });
  const mid = init.data && init.data.id;
  if (!mid) throw new SnsError('Xへの動画のアップロードを開始できませんでした。');
  const fd = fs.openSync(m.path, 'r');
  try {
    for (let i = 0, pos = 0; pos < m.size; i++, pos += CHUNK) {
      const buf = Buffer.alloc(Math.min(CHUNK, m.size - pos));
      fs.readSync(fd, buf, 0, buf.length, pos);
      const mp = multipart({ media: buf, segment_index: String(i) });
      await call({ method: 'POST', path: `/2/media/upload/${encodeURIComponent(mid)}/append`, headers: { ...auth, 'Content-Type': mp.type }, body: mp.body });
    }
  } finally { fs.closeSync(fd); }
  let st = await call({ method: 'POST', path: `/2/media/upload/${encodeURIComponent(mid)}/finalize`, headers: auth });
  for (let i = 0; i < poll.maxTries(); i++) {
    const info = st.data && st.data.processing_info;
    if (!info || info.state === 'succeeded') return String(mid);
    if (info.state === 'failed') throw new SnsError(`X側で動画の処理に失敗しました${info.error && info.error.message ? `（${info.error.message}）` : ''}`);
    await poll.sleep(Math.min(poll.intervalMs() * Math.max(1, Number(info.check_after_secs) || 1), 30000));
    st = await call({ method: 'GET', path: `/2/media/upload?command=STATUS&media_id=${encodeURIComponent(mid)}`, headers: auth });
  }
  throw new SnsError('X側の動画の処理が終わりませんでした。', { retriable: true });
}

async function uploadAll(accessToken, medias) {
  const ids = [];
  for (const m of medias || []) ids.push(m.kind === 'video' ? await uploadVideo(accessToken, m) : await uploadImage(accessToken, m));
  return ids;
}

async function tweet(accessToken, text, replyTo, mediaIds) {
  const body = { text: text || '' };
  if (!body.text) delete body.text;
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
  if (mediaIds && mediaIds.length) body.media = { media_ids: mediaIds };
  const r = await call({
    method: 'POST', path: '/2/tweets',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  return String(r.data.id);
}

// ツリーは、前の投稿への返信として順に投稿する
async function publish(args) {
  const { accessToken } = args;
  const p = normalize(args);
  const err = validatePost(args);
  if (err) throw new SnsError(err);
  const items = [{ text: p.text, medias: p.medias }, ...(p.category === 'tree' ? p.tree : [])];
  let first = ''; let prev = '';
  for (let i = 0; i < items.length; i++) {
    try {
      const mediaIds = await uploadAll(accessToken, items[i].medias);
      try { prev = await tweet(accessToken, items[i].text, prev, mediaIds); } catch (e) { throw ambiguous(e); }
      if (!first) first = prev;
    } catch (e) {
      if (first) { e.retriable = false; e.message = `${e.message}（ツリーの${i}件目までは投稿済みです。Xでご確認ください）`; }
      throw e;
    }
  }
  return { externalId: first };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, newPkce, usesPkce: true, mediaRule: '画像4枚まで（各5MB）または動画1本は任意。ツリー25件まで' };
