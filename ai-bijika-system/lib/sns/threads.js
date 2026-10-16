'use strict';
// Threads（Meta）公式API。テキスト投稿のみ。
// 仕様は公式ドキュメント（Threads API）で運用前に必ず確認すること。
const { request, encodeForm } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const poll = require('./poll');
const { normalize } = require('./post');
const { idString } = require('./ids');

const HOST = 'graph.threads.net';
const AUTH_URL = 'https://threads.com/oauth/authorize';
// threads_manage_replies：ツリーの2件目以降（自分の投稿への返信）を作るのに必要
const SCOPES = 'threads_basic,threads_content_publish,threads_manage_replies';

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
// 文字数。公式：テキストは500文字まで、絵文字はUTF-8のバイト数で数える（例：😀 は4、🇯🇵 は8、1️⃣ は7）
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
// 絵文字の判定。国旗（地域指示記号の組）やキーキャップ（1️⃣）も絵文字として数える。RGI_Emoji が使えない環境では近い判定にする
let EMOJI;
try { EMOJI = new RegExp('\\p{RGI_Emoji}', 'v'); } catch { EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u; }
const isEmoji = (g) => EMOJI.test(g) || /\p{Extended_Pictographic}/u.test(g);
function textLength(text) {
  const t = String(text);
  if (!segmenter) return [...t].length;
  let n = 0;
  for (const { segment } of segmenter.segment(t)) n += isEmoji(segment) ? Buffer.byteLength(segment, 'utf8') : 1;
  return n;
}

function authUrl({ state, redirectUri }) {
  const c = creds();
  const q = new URLSearchParams({ client_id: c.appId, redirect_uri: redirectUri, scope: SCOPES, response_type: 'code', state });
  return `${AUTH_URL}?${q.toString()}`;
}

// raw：true なら、応答の JSON と元の文字列 { json, text } を返す（大きな数値のIDを、丸めずに取り出すため。lib/sns/ids.js）
async function call(method, path, { form, query, raw } = {}) {
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
  if (r.status >= 200 && r.status < 300 && r.json) return raw ? { json: r.json, text: r.text } : r.json;
  // エラー文は、入れ子（error.message）と入れ子でない形（error_message）のどちらでも読む
  const msg = (r.json && r.json.error && r.json.error.message) || (r.json && r.json.error_message);
  const err = classify(r.status, msg ? `Threads: ${msg}` : '');
  if (r.json && r.json.error && r.json.error.code === 190) { err.authError = true; err.retriable = false; }
  throw err;
}

// 認可コード → 短期トークン → 長期トークン（約60日）
async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const shortRes = await call('POST', '/oauth/access_token', {
    form: { client_id: c.appId, client_secret: c.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }, raw: true,
  });
  const short = shortRes.json;
  const long = await call('GET', '/access_token', {
    query: { grant_type: 'th_exchange_token', client_secret: c.appSecret, access_token: short.access_token },
  });
  const meRes = await call('GET', '/v1.0/me', { query: { fields: 'id,username', access_token: long.access_token }, raw: true });
  const me = meRes.json;
  // IDが JSON の数値で届いても、桁を丸めない（範囲外で取り出せなければ ''。丸めた値は保存しない）
  const meId = idString(me.id, meRes.text, 'id');
  const tokenUserId = idString(short.user_id, shortRes.text, 'user_id');
  const externalUserId = meId || tokenUserId;
  if (!externalUserId) throw new SnsError('ThreadsのユーザーIDを取得できませんでした。時間をおいて、もう一度連携してください。');
  return {
    accessToken: long.access_token,
    refreshToken: '',
    expiresAt: new Date(Date.now() + (Number(long.expires_in) || 60 * 24 * 3600) * 1000).toISOString(),
    externalUserId,
    handle: me.username ? `@${me.username}` : '',
    // トークンの応答の user_id も控える（Metaから届く削除の求めの照合用。/me の id と同じかは未確認・実物で確かめる）
    providerUserId: tokenUserId,
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
  if (medias.some((m) => m.kind === 'video' && m.durationSec && m.durationSec > 300)) return `${label}の動画は5分（300秒）までです。`;
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

async function containerStatus(containerId, accessToken) {
  return call('GET', `/v1.0/${encodeURIComponent(containerId)}`, { query: { fields: 'status,error_message', access_token: accessToken } });
}
// コンテナの準備ができるまで待つ（FINISHED）。公式：アップロードの処理に時間がかかるため、状態を確かめてから公開する。
// カルーセルの子は、まとめて1つの待ち時間（最大5分）の中で確かめる（1件ずつ待つと、件数に比例して長くなるため）。
// 状態が返ってこない（status が無い）コンテナは、処理待ちが無いものとして先へ進む（テキストのコンテナなど）
async function waitFinished(containerIds, accessToken) {
  const pending = new Set([].concat(containerIds));
  const r = await poll.until(async () => {
    for (const cid of [...pending]) {
      const st = await containerStatus(cid, accessToken);
      if (!st.status || st.status === 'FINISHED' || st.status === 'PUBLISHED') { pending.delete(cid); continue; }
      if (st.status === 'ERROR' || st.status === 'EXPIRED') throw new SnsError(`Threads側で画像・動画の処理に失敗しました${st.error_message ? `（${st.error_message}）` : ''}`);
    }
    return pending.size ? null : { done: true };
  });
  if (!r) throw new SnsError('Threads側の処理が時間内に終わりませんでした。', { retriable: true });
}

// 公開の応答が失われたとき（通信エラー・5xx・本文の無い応答）の確かめ方。
// 公式は「公開の呼び出しが投稿IDを返さなかったときは、GET /{container-id} で公開の状態を確かめる」と案内している（Troubleshooting）。
// 同じコンテナを2回公開した場合に拒否されるかは、公式に書かれていないため、公開のやり直しはしない（二重投稿を防ぐため）。
// 状態が反映されるまで少し待ちながら確かめ、PUBLISHED なら、公開された投稿のIDを自分の最近の投稿から探す（コンテナIDと投稿IDは別の値）。
// PUBLISHED にならなければ、元のエラーを「投稿されたか不明」として投げる（自動で再試行しない）。戻り値：{ id }（見つからなければ ''）
async function recoverPublish({ base, containerId, accessToken, text, startedAt, replyTo, error }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await poll.sleep(poll.intervalMs() * 5);
    let st;
    try { st = await containerStatus(containerId, accessToken); } catch { continue; }
    if (st.status === 'PUBLISHED') return { id: await findPublishedId({ base, accessToken, text, startedAt, replyTo }) };
    if (st.status === 'ERROR' || st.status === 'EXPIRED') break;
  }
  throw ambiguous(error);
}
// 自分の最近の投稿から、本文が一致し、公開を始めた時刻より後の投稿を探す。
// 推測で別の投稿のIDを記録しないよう、本文が空の投稿と、返信（ツリーの2件目以降。/threads の一覧には出ない）は探さずに '' を返す
async function findPublishedId({ base, accessToken, text, startedAt, replyTo }) {
  if (!String(text || '').trim() || replyTo) return '';
  try {
    const list = await call('GET', `${base}/threads`, { query: { fields: 'id,text,timestamp', limit: '10', access_token: accessToken } });
    const since = startedAt - 60 * 1000;
    const hits = (list.data || []).filter((t) => String(t.text || '') === String(text) && t.timestamp && Date.parse(t.timestamp) >= since);
    return hits.length === 1 ? String(hits[0].id) : '';
  } catch { return ''; }
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
      kids.push(c.id);
    }
    await waitFinished(kids, accessToken);
    created = await call('POST', `${base}/threads`, { form: { ...form, media_type: 'CAROUSEL', children: kids.join(','), text: text || '' } });
  } else if (medias.length === 1) {
    created = await call('POST', `${base}/threads`, { form: { ...form, ...mediaForm(medias[0]), text: text || '' } });
  } else {
    created = await call('POST', `${base}/threads`, { form: { ...form, media_type: 'TEXT', text: text || '' } });
  }
  // テキスト・画像・動画・カルーセルのどれも、準備ができてから公開する
  await waitFinished(created.id, accessToken);
  const startedAt = Date.now();
  let published;
  try {
    published = await call('POST', `${base}/threads_publish`, { form: { creation_id: created.id, access_token: accessToken } });
  } catch (e) {
    // 公開されていないと確定しているエラー（400番台の拒否・認証エラー・429）は、そのまま扱う
    if (e.authError || !e.retriable || e.status === 429) throw e;
    // 通信エラー・5xx：応答だけが失われた可能性がある。コンテナの状態で確かめる（公式の案内）
    const r = await recoverPublish({ base, containerId: created.id, accessToken, text, startedAt, replyTo, error: e });
    return r.id;
  }
  return String(published.id);
}

// SNSから受け取ったURLは、https のものだけを使う（画面のリンク・画像に入れるため。javascript: などを入れない）
function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s || s.length > 2000) return '';
  try { return new URL(s).protocol === 'https:' ? s : ''; } catch { return ''; }
}

// 公開した投稿の permalink（Threadsで投稿を開くURL）。公式：GET /{media-id}?fields=permalink。
// 公式の説明では、著作権で問題のある投稿などでは permalink が返らない。取得できなければ ''（投稿の成否には関係させない。呼ぶ側は失敗しても投稿済みのまま）
async function permalink({ accessToken, mediaId }) {
  if (!mediaId) return '';
  try {
    const r = await call('GET', `/v1.0/${encodeURIComponent(mediaId)}`, { query: { fields: 'permalink', access_token: accessToken } });
    return safeUrl(r && r.permalink).slice(0, 500);
  } catch { return ''; }
}

// 連携した本人の最近の投稿（threads_basic の録画の要件：本人の投稿の一覧と、本文・画像・動画の中身を見せる）。
// 公式：GET /{user-id}/threads（その利用者が作った投稿の一覧。新しい順・ページ分けあり）。ここでは最初のページだけを使う。
// 取得したものは画面に出すだけで、DBには保存しない（Allowed Usage：作った本人にだけ見せる）。
// media_type の値（TEXT_POST・IMAGE・VIDEO・CAROUSEL_ALBUM・AUDIO・REPOST_FACADE）は公式のリファレンス（Threads Media）による。
// カルーセルの子の中身（children）の形は公式に書かれていないため取得しない（カルーセルは「Threadsで見る」から見てもらう）。
// 実物のAPIでの応答の形（media_url がどの種類で返るか など）は未確認・実物で確かめる
const RECENT_FIELDS = 'id,media_type,media_url,thumbnail_url,permalink,text,timestamp';
async function listRecent({ accessToken, externalUserId, limit = 20 }) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const r = await call('GET', `/v1.0/${encodeURIComponent(externalUserId)}/threads`, { query: { fields: RECENT_FIELDS, limit: String(n), access_token: accessToken } });
  return (Array.isArray(r && r.data) ? r.data : []).slice(0, n).map((t) => ({
    id: String(t.id || ''),
    mediaType: String(t.media_type || ''),
    mediaUrl: safeUrl(t.media_url),
    thumbnailUrl: safeUrl(t.thumbnail_url),
    permalink: safeUrl(t.permalink),
    text: String(t.text || ''),
    timestamp: String(t.timestamp || ''),
  }));
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
      if (i === 0) first = prev;
    } catch (e) {
      // 1件目が公開済みなら、自動の再試行は二重投稿になるため止める
      if (i > 0) { e.retriable = false; e.message = `${e.message}（ツリーの${i}件目までは投稿済みです。SNSでご確認ください）`; }
      throw e;
    }
    // 公開されたが投稿IDが分からない（応答が失われた）場合、続きは返信先が決められないため止める
    if (!prev && i < items.length - 1) {
      throw new SnsError(`ツリーの${i + 1}件目までは投稿されましたが、通信の問題で投稿IDを確かめられなかったため、続きを投稿できませんでした。SNSでご確認ください。`);
    }
  }
  return { externalId: first };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, permalink, listRecent, usesPkce: false, mediaRule: '画像・動画は任意（最大20件のカルーセル、ツリー25件まで）' };
