'use strict';
// Facebookページへの投稿（Facebookログイン＋Graph API）。連携時に許可されたページのうち、投稿できるページが1つだけのときに、そのページを対象にする。
// 仕様・必要な権限・アプリレビューは、運用前にMeta公式ドキュメントで必ず確認すること。
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const { normalize } = require('./post');
const { idString } = require('./ids');

const API_VERSION = 'v22.0';
const HOST = 'graph.facebook.com';
const AUTH_URL = `https://www.facebook.com/${API_VERSION}/dialog/oauth`;
// business_management：ビジネスポートフォリオにひも付いたページは、これが無いと一覧に出てこない（v17.0以降の公式の変更）
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement,business_management';
// 投稿に欠かせない権限。利用者は権限ごとに拒否できるため、連携のときに許可されたかを確かめる
const REQUIRED_PERMISSIONS = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'];

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
  // auth_type=rerequest：一度拒否された権限は、これを付けないと二度と求められない（公式）
  return `${AUTH_URL}?${new URLSearchParams({ client_id: c.appId, redirect_uri: redirectUri, scope: SCOPES, response_type: 'code', state, auth_type: 'rerequest' }).toString()}`;
}

// raw：true なら、応答の JSON と元の文字列 { json, text } を返す（大きな数値のIDを、丸めずに取り出すため。lib/sns/ids.js）
async function call({ method = 'GET', path, query, form, raw }) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  let r;
  try {
    r = await request({ host: HOST, method, path: `${path}${qs}`, headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body: form ? encodeForm(form) : undefined, timeoutMs: 120000 });
  } catch (e) {
    throw new SnsError(`Facebookに接続できませんでした (${e.message})`, { retriable: true });
  }
  if (r.status >= 200 && r.status < 300 && r.json) return raw ? { json: r.json, text: r.text } : r.json;
  const em = r.json && r.json.error;
  const err = classify(r.status, em && em.message ? `Facebook: ${em.message}` : '');
  // HTTPステータスではなく、Graph API のエラーコードで分ける（公式のエラー処理のガイド）
  const code = em && Number(em.code); const sub = em && Number(em.error_subcode);
  // 呼び出しの上限（4・17・32・341・613）は、受け付けられていない（処理されていない）ので、公開の最終段階でも再試行してよい（status を 429 として扱う）。
  // 一時的な障害（1・2）は、公式は「待って再試行」とだけ書いていて、処理されなかったとは書いていない。
  // そのため再試行の対象にはするが、公開の最終段階では「投稿されたか不明」として止める（status は元のまま。ambiguous が扱う）
  if ([4, 17, 32, 341, 613].includes(code)) { err.retriable = true; err.authError = false; err.status = 429; }
  else if ([1, 2].includes(code)) { err.retriable = true; err.authError = false; }
  if (code === 190 || (code === 102 && !sub) || (sub >= 458 && sub <= 467) || sub === 492) { err.authError = true; err.retriable = false; }
  else if (code === 10 || (code >= 200 && code <= 299)) {
    err.authError = true; err.retriable = false;
    err.message = `${err.message}（ページへの投稿の許可がありません。連携をやり直し、すべての項目を許可してください）`;
  }
  if (code) err.code = code;
  throw err;
}

// ユーザートークン → 長期トークン → ページのアクセストークン（長期ユーザートークンから得たページトークンは期限がない）
async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const short = await call({ path: `/${API_VERSION}/oauth/access_token`, query: { client_id: c.appId, client_secret: c.appSecret, redirect_uri: redirectUri, code } });
  const long = await call({ path: `/${API_VERSION}/oauth/access_token`, query: { grant_type: 'fb_exchange_token', client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: short.access_token } });
  const perms = await call({ path: `/${API_VERSION}/me/permissions`, query: { access_token: long.access_token } });
  const granted = new Set((perms.data || []).filter((x) => x.status === 'granted').map((x) => x.permission));
  const missing = REQUIRED_PERMISSIONS.filter((x) => !granted.has(x));
  if (missing.length) throw new SnsError('Facebookページへの投稿に必要な許可が得られませんでした。もう一度連携し、表示されるすべての項目を許可してください。');
  const pagesRes = await call({ path: `/${API_VERSION}/me/accounts`, query: { fields: 'id,name,access_token,tasks', access_token: long.access_token }, raw: true });
  const pages = pagesRes.json;
  // 投稿できる（CREATE_CONTENT の作業ができる）ページだけを候補にする
  const list = (pages.data || []).filter((pg) => pg && pg.access_token && (!Array.isArray(pg.tasks) || pg.tasks.includes('CREATE_CONTENT')));
  if (!list.length) throw new SnsError('投稿できるFacebookページが見つかりませんでした。ページで投稿できる役割があるかをご確認ください。ページがビジネスポートフォリオにひも付いている場合は、ビジネス側での役割も必要です。');
  // 意図しないページに投稿しないよう、候補が2つ以上のときは連携を止める（ページを選ぶ画面は、Facebookの連携画面で行う）
  if (list.length > 1) throw new SnsError(`投稿できるFacebookページが${list.length}つあります。もう一度連携し、Facebookの画面でページを選ぶところで、投稿に使うページを1つだけ選んでください。`);
  const page = list[0];
  // 連携した人のアプリスコープのユーザーID（Metaから届くデータ削除の求めの user_id は、この種類のIDと公式に書かれている。
  // 取り消しの知らせ（Deauthorize）の中身は未確認・実物で確かめる）。
  // externalUserId はページIDのため、照合用に別に控える。取れなければ、削除の求めに応えられないので連携を止める
  // IDが JSON の数値で届いても、桁を丸めない（範囲外で取り出せなければ ''。丸めた値は保存しない）
  const meRes = await call({ path: `/${API_VERSION}/me`, query: { fields: 'id', access_token: long.access_token }, raw: true });
  const meId = meRes.json ? idString(meRes.json.id, meRes.text, 'id') : '';
  if (!meId) throw new SnsError('FacebookのユーザーIDを取得できませんでした。時間をおいて、もう一度連携してください。');
  const pageId = idString(page.id, pagesRes.text, 'id');
  if (!pageId) throw new SnsError('FacebookページのIDを取得できませんでした。時間をおいて、もう一度連携してください。');
  return { accessToken: page.access_token, refreshToken: '', expiresAt: '', externalUserId: pageId, handle: page.name || '', providerUserId: meId };
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
