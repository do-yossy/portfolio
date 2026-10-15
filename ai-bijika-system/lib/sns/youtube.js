'use strict';
// YouTube（ショート動画）の投稿。Google OAuth＋YouTube Data API v3（再開可能アップロード）。
// ショートとして扱われる条件は、3分以内で正方形または縦長の動画であること（YouTubeヘルプ）。「#Shorts」は補助として付ける。
// 仕様と審査は運用前にGoogle公式で必ず確認すること。
const fs = require('fs');
const { request } = require('../http-client');
const { SnsError, classify, ambiguous } = require('./errors');
const { normalize } = require('./post');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const SCOPES = `${UPLOAD_SCOPE} https://www.googleapis.com/auth/youtube.readonly`;

const id = 'youtube';
const label = 'YouTube（ショート）';
const maxLength = 5000; // 説明文（UTF-8のバイト数。日本語はおよそ1,600文字）
const TITLE_MAX = 100;
const SHORTS_TAG = '#Shorts';

function creds(env = process.env) { return { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' }; }
function isConfigured(env = process.env) { const c = creds(env); return !!(c.clientId && c.clientSecret); }
// 説明の上限は「バイト数」（公式）。画面の文字数の表示もこの数え方にそろえる
const textLength = (t) => Buffer.byteLength(clean(t), 'utf8');
// タイトル・説明に半角の < > は使えない（公式。使うと invalidTitle／invalidDescription）。全角に置き換える
function clean(t) { return String(t || '').replace(/</g, '＜').replace(/>/g, '＞'); }

const PRIVACY = ['public', 'unlisted', 'private'];

function validatePost(args) {
  const p = normalize(args);
  if (p.category === 'tree') return 'YouTubeには、ツリー投稿はできません。';
  if (p.medias.length !== 1 || p.medias[0].kind !== 'video') return 'YouTubeは、動画が1本必要です。';
  const m = p.medias[0];
  if (m.durationSec && m.durationSec > 180) return 'YouTubeショートは3分以内の動画にしてください。';
  const o = p.options || {};
  if (o.privacy && !PRIVACY.includes(o.privacy)) return 'YouTubeの公開設定が正しくありません。';
  if (o.made_for_kids !== undefined && typeof o.made_for_kids !== 'boolean') return 'YouTubeの「子ども向け」の設定が正しくありません。';
  if (textLength(p.text) > maxLength) return 'YouTubeの説明は5,000バイト（日本語でおよそ1,600文字）までです。';
  return null;
}

function authUrl({ state, redirectUri }) {
  const c = creds();
  return `${AUTH_URL}?${new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri, scope: SCOPES, response_type: 'code', state, access_type: 'offline', prompt: 'consent' }).toString()}`;
}

async function call({ host, method = 'GET', path, headers = {}, body, timeoutMs }) {
  let r;
  try { r = await request({ host, method, path, headers, body, timeoutMs }); } catch (e) {
    throw new SnsError(`YouTubeに接続できませんでした (${e.message})`, { retriable: true });
  }
  if (r.status >= 200 && r.status < 300) return r;
  const em = r.json && r.json.error;
  const msg = em && (em.message || em.error_description || (typeof em === 'string' ? em : ''));
  const err = classify(r.status, msg ? `YouTube: ${msg}` : '');
  if (r.json && r.json.error === 'invalid_grant') { err.authError = true; err.retriable = false; }
  // 403 の理由ごとの扱い（公式のエラー一覧）。再連携が必要なのは、権限が足りない場合だけ
  const reason = em && typeof em === 'object' && Array.isArray(em.errors) && em.errors[0] ? em.errors[0].reason : '';
  if (reason) err.reason = reason;
  if (reason === 'quotaExceeded') {
    err.message = 'YouTube: このサービスの、今日のアップロードの割り当てを使い切りました';
    err.quotaExhausted = true; err.retriable = true; err.authError = false;
  } else if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    err.retriable = true; err.authError = false;
  } else if (reason === 'insufficientPermissions') {
    err.authError = true; err.retriable = false;
  } else if (reason === 'uploadLimitExceeded') {
    err.message = 'YouTube: このチャンネルの、アップロードできる本数の上限に達しています。時間をおいて予約し直してください';
  } else if (reason === 'youtubeSignupRequired') {
    err.message = 'YouTube: このGoogleアカウントにはYouTubeチャンネルがありません。チャンネルを作成してから連携し直してください';
  }
  throw err;
}
const form = (o) => new URLSearchParams(o).toString();
const FORM_H = { 'Content-Type': 'application/x-www-form-urlencoded' };

function tokenResult(t, fallbackRefresh = '') {
  return { accessToken: t.access_token, refreshToken: t.refresh_token || fallbackRefresh, expiresAt: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString() };
}

async function exchangeCode({ code, redirectUri }) {
  const c = creds();
  const t = (await call({ host: 'oauth2.googleapis.com', method: 'POST', path: '/token', headers: FORM_H, body: form({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) })).json;
  if (!t.refresh_token) throw new SnsError('Googleから更新用の許可が得られませんでした。もう一度連携をやり直してください。');
  // 利用者は権限を一部だけ許可できる（公式）。動画のアップロードの許可が無いと、投稿のときに初めて失敗するため、ここで止める
  if (t.scope !== undefined && !String(t.scope).split(/\s+/).includes(UPLOAD_SCOPE)) {
    throw new SnsError('YouTubeへの動画のアップロードが許可されませんでした。もう一度連携し、「動画の管理（アップロード）」の項目にチェックを入れて許可してください。');
  }
  const me = (await call({ host: 'www.googleapis.com', path: '/youtube/v3/channels?part=id,snippet&mine=true', headers: { Authorization: `Bearer ${t.access_token}` } })).json;
  const ch = me.items && me.items[0];
  if (!ch) throw new SnsError('YouTubeチャンネルが見つかりませんでした。チャンネルを作成してから連携してください。');
  return { ...tokenResult(t), externalUserId: String(ch.id), handle: (ch.snippet && ch.snippet.title) || '' };
}

async function refresh({ refreshToken }) {
  const c = creds();
  const t = (await call({ host: 'oauth2.googleapis.com', method: 'POST', path: '/token', headers: FORM_H, body: form({ refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token' }) })).json;
  return tokenResult(t, refreshToken);
}

// 本文の1行目をタイトル（100文字まで）、全体を説明にする。「#Shorts」は、上限に収まる場合だけ添える
// （タイトルの長さを100文字より短く制限してはいけない決まりのため、利用者の文字を削ってまでは付けない）
function titleAndDescription(text) {
  const t = clean(text).trim();
  const first = (t.split('\n')[0] || '').trim();
  let title = [...first].slice(0, TITLE_MAX).join('') || '無題';
  if (!/#shorts/i.test(title) && [...title].length + SHORTS_TAG.length + 1 <= TITLE_MAX) title = `${title} ${SHORTS_TAG}`;
  let description = t;
  const withTag = `${t}\n\n${SHORTS_TAG}`.trim();
  if (!/#shorts/i.test(t) && Buffer.byteLength(withTag, 'utf8') <= maxLength) description = withTag;
  return { title, description };
}

async function publish(args) {
  const { accessToken } = args;
  const p = normalize(args);
  const err = validatePost(args);
  if (err) { const e = new SnsError(err); e.notSent = true; throw e; } // YouTubeへは何も送っていない（割り当てを使っていない）
  const m = p.medias[0];
  const { title, description } = titleAndDescription(p.text);
  // 公開設定を指定しなかった場合は、安全のため「非公開」にする。子ども向けかどうかは利用者の選択（省略時は「子ども向けではない」）
  const status = { privacyStatus: (p.options && p.options.privacy) || 'private', selfDeclaredMadeForKids: !!(p.options && p.options.made_for_kids === true) };
  // AIで作った動画は、本物らしく作った内容として申告する
  if (m.aiGenerated) status.containsSyntheticMedia = true;
  const meta = { snippet: { title, description, categoryId: '22' }, status };
  const init = await call({
    host: 'www.googleapis.com', method: 'POST', path: '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(m.size), 'X-Upload-Content-Type': m.mime || 'video/mp4' },
    body: JSON.stringify(meta),
  });
  const loc = init.headers && init.headers.location;
  if (!loc) throw new SnsError('YouTubeのアップロード先を取得できませんでした。');
  const u = new URL(loc);
  const buf = fs.readFileSync(m.path);
  let r;
  try {
    r = await call({ host: u.host, method: 'PUT', path: `${u.pathname}${u.search}`, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': m.mime || 'video/mp4' }, body: buf, timeoutMs: 600000 });
  } catch (e) { throw ambiguous(e); } // 動画を送った後の失敗は、登録されたか不明
  // 受け付けた直後に、重複・規約などで拒否される、または処理に失敗することがある（status.uploadStatus）
  const st = r.json && r.json.status;
  if (st && (st.uploadStatus === 'rejected' || st.uploadStatus === 'failed')) {
    throw new SnsError(`YouTubeで動画が受け付けられませんでした（${st.rejectionReason || st.failureReason || st.uploadStatus}）`);
  }
  return { externalId: String((r.json && r.json.id) || '') };
}

module.exports = { id, label, maxLength, isConfigured, textLength, validatePost, authUrl, exchangeCode, refresh, publish, titleAndDescription, usesPkce: false, PRIVACY, mediaRule: '動画1本が必須（本文の1行目がタイトル）' };
