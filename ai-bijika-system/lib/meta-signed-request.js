'use strict';
// Meta（Threads・Instagram・Facebook）から届く signed_request の検証（データ削除の求め・連携の取り消しの知らせ）。
// 公式のデータ削除のコールバックの説明と例（developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback）：
//   ・POST の本文の signed_request は「<署名>.<中身>」の形で、どちらも base64url
//   ・署名は、中身（base64url のままの文字列）を、アプリのシークレットで HMAC-SHA256 したもの
//   ・中身は JSON で、algorithm（HMAC-SHA256）・user_id・issued_at などが入る
// 未確認（実物で確かめる。テスターでアプリを外したときに届く中身で確かめる）：
//   ・Threads・Instagram で、どのシークレット（Threads用・Instagram app secret か、メインのアプリのものか）で署名されるか
//   ・user_id がどのIDか（Threads の /me の id か、Instagram の2種類のIDのどちらか、Facebook のアプリスコープのIDか）
//   ・連携の取り消し（Deauthorize）に届く中身の形（公式で確かめられたのは、データ削除のコールバックの例だけ。同じ形とみなしている）
//   ・本文が form（application/x-www-form-urlencoded）以外で届くことがあるか（公式の例は form。念のため JSON も読む）
// user_id がどのIDか分からないため、照合は、SNSごとに保存した複数のIDのどれでも引けるようにしている（lib/meta-deletion.js）。
// user_id が JSON の数値で届いた場合も、桁を丸めずに扱う（lib/sns/ids.js。丸めると、隣のIDの別人の連携を消すおそれがあるため）。
const crypto = require('crypto');
const { idString } = require('./sns/ids');

// SNSごとのアプリのシークレット（連携に使うものと同じ環境変数）
const SECRET_ENV = { threads: 'THREADS_APP_SECRET', instagram: 'INSTAGRAM_APP_SECRET', facebook: 'FACEBOOK_APP_SECRET' };
const MAX_LENGTH = 8192;
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function secretFor(platform, env = process.env) {
  const k = SECRET_ENV[platform];
  return k ? String(env[k] || '').trim() : '';
}

const decode = (s) => Buffer.from(String(s).replace(/=+$/, ''), 'base64url');

// 届いた本文から signed_request を取り出す（form か JSON）
function fromBody(raw, contentType = '') {
  if (/json/i.test(String(contentType))) {
    try { const j = JSON.parse(raw); return j && typeof j.signed_request === 'string' ? j.signed_request : ''; } catch { return ''; }
  }
  return new URLSearchParams(String(raw || '')).get('signed_request') || '';
}

// 検証できれば { ok: true, data, userId }、できなければ { ok: false, error }
// （error は運営者のログ用。相手には理由を詳しく返さない）。
// 届いた中身（signed_request から決まる値）は、ハッシュにしたものも含めて保存しない（lib/meta-deletion.js）
function parse(signedRequest, secret) {
  if (!secret) return { ok: false, error: 'no secret' };
  const sr = typeof signedRequest === 'string' ? signedRequest.trim() : '';
  if (!sr || sr.length > MAX_LENGTH) return { ok: false, error: 'missing' };
  const parts = sr.split('.');
  if (parts.length !== 2 || !B64URL.test(parts[0]) || !B64URL.test(parts[1])) return { ok: false, error: 'malformed' };
  const [encodedSig, payload] = parts;
  // 署名を先に確かめる（確かめる前の中身は信用しない）。比べるのは、長さが同じときだけ timingSafeEqual で
  const sig = decode(encodedSig);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return { ok: false, error: 'bad signature' };
  let data;
  const text = decode(payload).toString('utf8');
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'bad json' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'bad json' };
  // 署名の方式が HMAC-SHA256 以外と書かれていれば受け付けない（公式の例の方式だけを扱う）
  if (String(data.algorithm || '').toUpperCase() !== 'HMAC-SHA256') return { ok: false, error: 'unsupported algorithm' };
  // 数値で届いた user_id は、安全な範囲なら String()、範囲外なら中身の文字列から数字をそのまま取り出す。
  // 取り出せなければ、丸めた値で照合しないよう受け付けない（運営者のログに 'unsafe user_id' と残る）
  const unsafe = typeof data.user_id === 'number' && !Number.isSafeInteger(data.user_id);
  const userId = idString(data.user_id, text, 'user_id');
  if (!userId && unsafe) return { ok: false, error: 'unsafe user_id' };
  if (!userId || userId.length > 128) return { ok: false, error: 'no user_id' };
  // issued_at（発行の時刻）は、古いものを断る決まりが公式に見当たらないため、確かめない（未確認）。
  // 同じ求めがもう一度届いたときは、その時点で残っている連携を、もう一度同じように削除する（たいていは何も残っていない）。
  // 確認コードは、求めごとに新しく出す（同じ求めかどうかを見分ける値を残さないため。lib/meta-deletion.js）
  return { ok: true, data, userId };
}

module.exports = { SECRET_ENV, secretFor, fromBody, parse };
