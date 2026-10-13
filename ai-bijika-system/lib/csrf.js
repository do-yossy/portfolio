'use strict';
// CSRF対策：セッションCookieから導出するトークンをフォームに埋め込み、POST時に照合する（node:crypto のみ）
const crypto = require('crypto');
const SECRET = process.env.APP_SECRET || crypto.randomBytes(32).toString('hex');

function tokenFor(sessionToken) {
  return crypto.createHmac('sha256', SECRET).update(`csrf:${sessionToken || ''}`).digest('hex').slice(0, 40);
}
function verify(sessionToken, given) {
  if (!sessionToken || !given) return false;
  const a = Buffer.from(tokenFor(sessionToken));
  const b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { tokenFor, verify };
