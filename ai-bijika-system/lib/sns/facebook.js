'use strict';
// Facebookページへの投稿（Facebookログイン＋Graph API）。連携時に、管理しているページのうち先頭の1つを対象にする。
// 仕様・必要な権限・アプリレビューは、運用前にMeta公式ドキュメントで必ず確認すること。
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const { normalize } = require('./post');

const API_VERSION = 'v22.0';
const HOST = 'graph.facebook.com';
const AUTH_URL = `https://www.facebook.com/${API_VERSION}/dialog/oauth`;
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';

const id = 'facebook';
const label = 'Facebookページ';
const maxLength = 63206;
const MAX_IMAGES = 10;

function creds(env = process.env) { return { appId: env.FACEBOOK_APP_ID || '', appSecret: env.FACEBOOK_APP_SECRET || '' }; }
function isConfigured(env = process.env) { const c = creds(env); return !!(c.appId && c.appSecret); }
const textLength = (t) => [...String(t)].length;

function validatePost(args) {
  const p = normalize(args);
  if (p.category === 'tree') return 'Facebookには、ツリー投稿はできません。';
  const vids = p.medias.filter((m) => m.kind === 'video');
  const imgs = p.medias.filter((m) => m.kind === 'image');
  if (vids.length && imgs.length) return 'Facebookは、画像と動画を同時には投稿できません。';
  if (vids.length > 1) return 'Facebookの動画は1本までです。';
  if (imgs.length > MAX_IMAGES) return `Facebookの画像は${MAX_IMAGES}枚までです。`;
  if (!String(p.text || '').trim() && !p.medias.length) return 'Facebookは、本文か画像・動画のどちらかが必要です。';
  if (textLength(p.text) > maxLength) return `Facebookは${maxLength}文字までです。`;
  return null;
}

function authUrl({ state, redirectUri }) {
  const c = creds();
  return `${AUTH_URL}?${new URLSearchParams({ client_id: c.appId, redirect_uri: redirectUri, scope: SCOPES, response_type: 'code', state }).toString()}`;
}

async function call({ method = 'GET', path, query, form }) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  let r;
  try {
    r = await request({ host: HOST, method, path: `${path}${qs}`, headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body: form ? encodeForm(form) : undefined, timeoutMs: 120000 });
  } catch (e) {
    throw new SnsError(`Facebookに接続できませんでした (${e.message})`, { retriable: true });
  }
  if (r.status >= 200 && r.status < 300 && r.json) return r.json;
  const em = r.json && r.json.error;
  const err = classify(r.status, em && em.message ? `Facebook: ${em.message}` : '');
  if (em && em.code === 190) { err.authError = true; err.retriable = false; }
  throw err;
}

// ユーザートークン → 長期トークン → ページのアクセストークン（長期ユーザートークンから得たページトークンは期限がない）
async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const short = await call({ path: `/${API_VERSION}/oauth/access_token`, query: { client_id: c.appId, client_secret: c.appSecret, redirect_uri: redirectUri, code } });
  const long = await call({ path: `/${API_VERSION}/oauth/access_token`, query: { grant_type: 'fb_exchange_token', client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: short.access_token } });
  const pages = await call({ path: `/${API_VERSION}/me/accounts`, query: { fields: 'id,name,access_token', access_token: long.access_token } });
  const page = pages.data && pages.data[0];
  if (!page) throw new SnsError('管理しているFacebookページが見つかりませんでした。ページの管理権限をご確認ください。');
  return { accessToken: page.access_token, refreshToken: '', expiresAt: '', externalUserId: String(page.id), handle: page.name || '' };
}

// ページトークンは期限がないため更新は不要
async function refresh({ accessToken }) {
  return { accessToken, refreshToken: '', expiresAt: '' };
}

async function publish(args) {
  const { accessToken, externalUserId } = args;
  const p = normalize(args);
  const err = validatePost(args);
  if (err) throw new SnsError(err);
  const base = `/${API_VERSION}/${encodeURIComponent(externalUserId)}`;
  const imgs = p.medias.filter((m) => m.kind === 'image');
  const vid = p.medias.find((m) => m.kind === 'video');
  let r;
  if (vid) {
    try { r = await call({ method: 'POST', path: `${base}/videos`, form: { file_url: vid.url, description: p.text || '', access_token: accessToken } }); } catch (e) { throw ambiguous(e); }
    return { externalId: String(r.id) };
  }
  const form = { message: p.text || '', access_token: accessToken };
  if (imgs.length) {
    const ids = [];
    for (const m of imgs) {
      const ph = await call({ method: 'POST', path: `${base}/photos`, form: { url: m.url, published: 'false', access_token: accessToken } });
      ids.push(ph.id);
    }
    ids.forEach((fid, i) => { form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: fid }); });
  }
  try { r = await call({ method: 'POST', path: `${base}/feed`, form }); } catch (e) { throw ambiguous(e); }
  return { externalId: String(r.id) };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, usesPkce: false, mediaRule: '画像（10枚まで）または動画1本は任意' };
