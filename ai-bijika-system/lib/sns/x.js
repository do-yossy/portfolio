'use strict';
// X（旧Twitter）API v2。OAuth 2.0（PKCE）で連携し、テキストを投稿する。
// 利用できる投稿数・費用はXのAPIプラン次第。運用前にXの公式ドキュメントで必ず確認すること。
const crypto = require('crypto');
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const { normalize } = require('./post');

const HOST = 'api.x.com';
const AUTH_URL = 'https://x.com/i/oauth2/authorize';
const SCOPES = 'tweet.read tweet.write users.read offline.access';

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
function validatePost(args) {
  const p = normalize(args);
  const items = [{ text: p.text, medias: p.medias }, ...(p.category === 'tree' ? p.tree : [])];
  if (p.category === 'tree' && items.length < 2) return 'ツリー投稿は、2件目以降の投稿が必要です。';
  if (items.length > MAX_TREE) return `Xのツリーは${MAX_TREE}件までです。`;
  for (let i = 0; i < items.length; i++) {
    const t = items[i].text;
    const who = i === 0 ? 'X' : `ツリー${i + 1}件目`;
    if ((items[i].medias || []).length) return 'Xは、現時点ではテキストのみに対応しています（画像・動画は添付できません）。';
    if (!String(t || '').trim()) return `${who}は、本文が必要です。`;
    if (textLength(t) > maxLength) return `${who}の文字数の上限（${maxLength}。日本語は1文字を2として計算）を超えています。`;
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

async function tweet(accessToken, text, replyTo) {
  const body = { text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
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
  const texts = [p.text, ...(p.category === 'tree' ? p.tree.map((c) => c.text) : [])];
  let first = ''; let prev = '';
  for (let i = 0; i < texts.length; i++) {
    try {
      prev = await tweet(accessToken, texts[i], prev);
      if (!first) first = prev;
    } catch (e) {
      if (first) { e.retriable = false; e.message = `${e.message}（ツリーの${i}件目までは投稿済みです。Xでご確認ください）`; throw e; }
      throw ambiguous(e);
    }
  }
  return { externalId: first };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, newPkce, usesPkce: true, mediaRule: 'テキストのみ（ツリー25件まで）' };
