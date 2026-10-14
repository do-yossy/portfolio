'use strict';
// URLから画像・動画を取り込む（ChatGPTの添付ファイルのURLや、Googleドライブの共有リンクなど）。
// 安全対策：https のみ／名前解決した先が社内・ローカルのアドレスなら拒否し、確認したアドレスにだけ接続する（DNSの差し替え対策）／
// リダイレクトは3回まで（毎回確認）／サイズと時間の上限／中身で種類を判定（media.saveUpload と同じ検査）。
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const { Readable } = require('stream');
const mediaLib = require('./media');

class FetchError extends Error {}

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return isPrivate(x.slice(7));
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff');
}

// Googleドライブの共有リンクを、直接ダウンロードのURLに直す
function normalizeUrl(raw) {
  const u = new URL(String(raw));
  const m = u.hostname === 'drive.google.com' && (u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/) || (u.pathname === '/open' && [null, u.searchParams.get('id')]));
  if (m && m[1]) return new URL(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(m[1])}&export=download`);
  return u;
}

async function resolvePublic(host) {
  if (net.isIP(host)) { if (isPrivate(host)) throw new FetchError('このURLからは取り込めません。'); return { address: host, family: net.isIP(host) }; }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new FetchError('URLのホストが見つかりません。'); }
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new FetchError('このURLからは取り込めません。');
  return addrs[0];
}

function getOnce(u, pinned, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, port: u.port || 443, method: 'GET', path: `${u.pathname}${u.search}`, servername: u.hostname,
      headers: { 'User-Agent': 'sns-scheduler-media-import/1.0', Accept: 'image/*,video/*,*/*;q=0.5' },
      lookup: (_h, _o, cb) => cb(null, pinned.address, pinned.family), // 確認したアドレスにだけ接続する
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { if (res.resume) res.resume(); return resolve({ redirect: res.headers.location }); }
      if (res.statusCode !== 200) { if (res.resume) res.resume(); return reject(new FetchError(`ファイルを取得できませんでした (${res.statusCode})`)); }
      const declared = parseInt(res.headers['content-length'] || '0', 10);
      if (declared > maxBytes) { res.destroy(); return reject(new FetchError('ファイルが大きすぎます。')); }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { res.destroy(); reject(new FetchError('ファイルが大きすぎます。')); } else chunks.push(c); });
      res.on('end', () => resolve({ body: Buffer.concat(chunks) }));
      res.on('error', () => reject(new FetchError('ファイルを取得できませんでした。')));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(`ファイルを取得できませんでした (${e.message})`)));
    req.end();
  });
}

async function importFromUrl({ userId, url, maxBytes = mediaLib.LIMITS.videoBytes, timeoutMs = 60000 }) {
  let u;
  try { u = normalizeUrl(url); } catch { throw new FetchError('URLの形式が正しくありません。'); }
  for (let hop = 0; hop <= 3; hop++) {
    if (u.protocol !== 'https:') throw new FetchError('https のURLを指定してください。');
    if (u.username || u.password) throw new FetchError('このURLからは取り込めません。');
    const pinned = await resolvePublic(u.hostname);
    const r = await getOnce(u, pinned, maxBytes, timeoutMs);
    if (r.redirect) { u = new URL(r.redirect, u); continue; }
    if (!r.body.length) throw new FetchError('ファイルが空です。');
    const saved = await mediaLib.saveUpload({ userId, req: Readable.from([r.body]), contentLength: r.body.length });
    if (!saved.ok) throw new FetchError(/対応していない/.test(saved.error) ? `${saved.error}（共有リンクの場合は「リンクを知っている全員」が閲覧できる設定か確認してください）` : saved.error);
    return saved.media;
  }
  throw new FetchError('リダイレクトが多すぎます。');
}

module.exports = { importFromUrl, isPrivate, normalizeUrl, FetchError };
