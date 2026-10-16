'use strict';
// Instagram（「Instagram APIとInstagram ログイン」）の公開投稿。プロアカウント（ビジネス／クリエイター）が対象。
// 画像（JPEG）またはリール動画を、メディアの公開URL経由で投稿する。仕様は公式ドキュメントで運用前に必ず確認すること。
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const poll = require('./poll');
const { normalize } = require('./post');
const { idString } = require('./ids');

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
function validatePost(args) {
  const p = normalize(args); const text = p.text; const media = p.medias[0];
  if (p.category === 'tree') return 'Instagramには、ツリー投稿はできません。';
  if (!media) return 'Instagramは、画像または動画が必要です。';
  if (p.medias.length > 10) return 'Instagramのカルーセルは10件までです。';
  if (p.medias.some((m) => m.kind === 'image' && m.mime !== 'image/jpeg')) return 'Instagramに投稿できる画像はJPEGです（PNGは使えません）。';
  // 公式：画像の縦横比は 4:5（縦長）〜 1.91:1（横長）の範囲。スマホの縦写真（3:4）や縦長のスクリーンショットは範囲外
  if (p.medias.some((m) => m.kind === 'image' && m.width && m.height && (m.width / m.height < 0.8 - 1e-6 || m.width / m.height > 1.91 + 1e-6))) return 'Instagramの画像の縦横比は、4:5（縦長）〜1.91:1（横長）の範囲にしてください（スマホの縦写真3:4は範囲外です。正方形などに切り抜いてください）。';
  if (textLength(text || '') > maxLength) return `Instagramのキャプションは${maxLength}文字までです。`;
  return null;
}

function authUrl({ state, redirectUri }) {
  const c = creds();
  return `${AUTH_URL}?${new URLSearchParams({ client_id: c.appId, redirect_uri: redirectUri, scope: SCOPES, response_type: 'code', state }).toString()}`;
}

// 2207001：サーバーのエラー／2207003：メディアの取得のタイムアウト／2207032：作成の失敗／2207053：新しいコンテナで再試行／2207008：公開の一時的なエラー／2207027：まだ公開の準備ができていない
const TRANSIENT_SUBCODES = [2207001, 2207003, 2207032, 2207053, 2207008, 2207027];

// raw：true なら、応答の JSON と元の文字列 { json, text } を返す（大きな数値のIDを、丸めずに取り出すため。lib/sns/ids.js）
async function call({ host = GRAPH, method = 'GET', path, query, form, raw }) {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  let r;
  try {
    r = await request({ host, method, path: `${path}${qs}`, headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body: form ? encodeForm(form) : undefined });
  } catch (e) {
    throw new SnsError(`Instagramに接続できませんでした (${e.message})`, { retriable: true });
  }
  if (r.status >= 200 && r.status < 300 && r.json) return raw ? { json: r.json, text: r.text } : r.json;
  const em = r.json && r.json.error;
  const err = classify(r.status, em && em.message ? `Instagram: ${em.message}` : '');
  // 認証エラーと判断するのは、トークンの失効・無効を示すコード(190)のときだけ（他のOAuthExceptionは連携を無効にしない）
  if (em && em.code === 190) { err.authError = true; err.retriable = false; }
  // 公式で「時間をおいて再試行」とされているもの（HTTP 400 でも一時的なエラー）
  else if (em && (em.is_transient === true || TRANSIENT_SUBCODES.includes(em.error_subcode))) err.retriable = true;
  if (em) err.subcode = em.error_subcode;
  throw err;
}

async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const shortRes = await call({ host: 'api.instagram.com', method: 'POST', path: '/oauth/access_token', form: { client_id: c.appId, client_secret: c.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }, raw: true });
  const short = shortRes.json;
  const first = (short.data && short.data[0]) || short;
  const long = await call({ path: '/access_token', query: { grant_type: 'ig_exchange_token', client_secret: c.appSecret, access_token: first.access_token } });
  // id も取る（Metaから届く削除の求めの照合用）
  const meRes = await call({ path: `/${API_VERSION}/me`, query: { fields: 'id,user_id,username', access_token: long.access_token }, raw: true });
  const me = meRes.json;
  // IDが JSON の数値で届いても、桁を丸めない（範囲外で取り出せなければ ''。丸めた値は保存しない）
  const tokenUserId = idString(first.user_id, shortRes.text, 'user_id');
  const meUserId = idString(me.user_id, meRes.text, 'user_id');
  const meId = idString(me.id, meRes.text, 'id');
  const externalUserId = meUserId || meId || tokenUserId;
  // 照合用のIDが1つも無いと、Metaから届く削除の求めに応えられないため、連携を止める
  if (!externalUserId || (!tokenUserId && !meId)) throw new SnsError('InstagramのユーザーIDを取得できませんでした。時間をおいて、もう一度連携してください。');
  return {
    accessToken: long.access_token, refreshToken: '',
    expiresAt: new Date(Date.now() + (Number(long.expires_in) || 60 * 24 * 3600) * 1000).toISOString(),
    externalUserId,
    handle: me.username ? `@${me.username}` : '',
    // Instagram側の利用者IDは2種類ある（トークンの応答の user_id と、/me の user_id。公式の business-login の説明）。
    // Metaから届く削除の求めの user_id がどれに当たるかは未確認（実物で確かめる）のため、/me の id とあわせて、すべて控える
    providerUserId: tokenUserId,
    providerAltId: meId,
  };
}

async function refresh({ accessToken }) {
  const r = await call({ path: '/refresh_access_token', query: { grant_type: 'ig_refresh_token', access_token: accessToken } });
  return { accessToken: r.access_token, refreshToken: '', expiresAt: new Date(Date.now() + (Number(r.expires_in) || 60 * 24 * 3600) * 1000).toISOString() };
}

// コンテナの準備ができるまで待つ（FINISHED）。公式：画像・カルーセルも含め、状態を確かめてから公開する。確認は間隔を広げながら最大5分。
// カルーセルの子は、まとめて1つの待ち時間の中で確かめる（1件ずつ待つと、件数に比例して長くなり、ほかの予約の処理も止まるため）
async function waitFinished(containerIds, accessToken) {
  const pending = new Set([].concat(containerIds));
  const r = await poll.until(async () => {
    for (const cid of [...pending]) {
      const st = await call({ path: `/${API_VERSION}/${encodeURIComponent(cid)}`, query: { fields: 'status_code,status', access_token: accessToken } });
      if (st.status_code === 'FINISHED' || st.status_code === 'PUBLISHED') { pending.delete(cid); continue; }
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new SnsError(`Instagram側で画像・動画の処理に失敗しました${st.status ? `（${st.status}）` : ''}。形式・縦横比・長さをご確認ください。`);
    }
    return pending.size ? null : { done: true };
  });
  if (!r) throw new SnsError('Instagram側の処理が時間内に終わりませんでした。', { retriable: true });
}

async function publish(args) {
  const { accessToken, externalUserId } = args;
  const p = normalize(args); const text = p.text; const media = p.medias[0];
  const err = validatePost(args);
  if (err) throw new SnsError(err);
  const base = `/${API_VERSION}/${encodeURIComponent(externalUserId)}`;
  let created;
  if (p.medias.length > 1) {
    const kids = [];
    for (const m of p.medias) {
      const f = { is_carousel_item: 'true', access_token: accessToken };
      if (m.kind === 'image') f.image_url = m.url; else { f.media_type = 'VIDEO'; f.video_url = m.url; }
      const c = await call({ method: 'POST', path: `${base}/media`, form: f });
      kids.push(c.id);
    }
    await waitFinished(kids, accessToken);
    created = await call({ method: 'POST', path: `${base}/media`, form: { media_type: 'CAROUSEL', children: kids.join(','), caption: text || '', access_token: accessToken } });
  } else {
    const form = { caption: text || '', access_token: accessToken };
    if (media.kind === 'image') form.image_url = media.url;
    else { form.media_type = 'REELS'; form.video_url = media.url; }
    created = await call({ method: 'POST', path: `${base}/media`, form });
  }
  await waitFinished(created.id, accessToken);
  // 公開。公式で一時的とされるエラー（2207008・2207027）は、同じコンテナのまま少し待って2回まで再試行する（まだ公開されていないため二重投稿にならない）
  for (let attempt = 0; ; attempt++) {
    try {
      const published = await call({ method: 'POST', path: `${base}/media_publish`, form: { creation_id: created.id, access_token: accessToken } });
      return { externalId: String(published.id) };
    } catch (e) {
      if ((e.subcode === 2207008 || e.subcode === 2207027) && attempt < 2) { await poll.sleep(poll.intervalMs() * 10); continue; }
      throw ambiguous(e);
    }
  }
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, usesPkce: false, mediaRule: '画像（JPEG）または動画（MP4・MOV）が必須' };
