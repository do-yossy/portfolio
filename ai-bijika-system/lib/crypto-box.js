'use strict';
// SNS連携のトークンなどをDBに保存するときの暗号化（AES-256-GCM。node:crypto のみ）
// 鍵は環境変数 SNS_TOKEN_KEY（64桁の16進文字列＝32バイト）。未設定・不正ならSNS連携は無効になる。
const crypto = require('crypto');

function keyFromEnv(env = process.env) {
  const hex = String(env.SNS_TOKEN_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

function encrypt(plain, key) {
  if (!key) throw new Error('SNS_TOKEN_KEY が未設定です');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function decrypt(box, key) {
  if (!key) throw new Error('SNS_TOKEN_KEY が未設定です');
  const parts = String(box || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('暗号化データの形式が不正です');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { keyFromEnv, encrypt, decrypt };
