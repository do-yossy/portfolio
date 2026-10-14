'use strict';
// URLから画像・動画を取り込む（チャットの添付ファイルのURLや、Googleドライブの共有リンクなど）。
// 安全対策：https のみ／名前解決した先が社内・ローカルのアドレスなら拒否し、確認したアドレスにだけ接続する（DNSの差し替え対策）／
// リダイレクトは3回まで（毎回確認）／取得はメモリに溜めずに保存処理へ流す（容量の上限は取得前に確認）／利用者ごとに同時に1件まで／
// 中身で種類を判定（media.saveUpload と同じ検査）。
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const mediaLib = require('./media');

class FetchError extends Error {}

function ipv4Private(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
// IPv6 を8つの16ビットの数に展開する（埋め込まれたIPv4にも対応）
function expandV6(ip) {
  let x = ip.toLowerCase().split('%')[0];
  const v4 = x.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1].split('.').map(Number);
    x = x.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [head, tail] = x.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = x.includes('::') ? Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map((g) => parseInt(g || '0', 16));
}
function isPrivate(ip) {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  if (!net.isIPv6(ip)) return true;
  const g = expandV6(ip);
  const v4of = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g.every((n) => n === 0)) return true; // ::
  if (g.slice(0, 7).every((n) => n === 0)) return true; // ::1 など
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) return ipv4Private(v4of(g[6], g[7])); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((n) => n === 0)) return true; // ::a.b.c.d（IPv4互換。廃止済み）
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
  if (g[0] === 0x2002) return true; // 6to4
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true; // Teredo・文書用
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // 破棄用
  const top = g[0];
  return (top & 0xfe00) === 0xfc00 || (top & 0xffc0) === 0xfe80 || (top & 0xffc0) === 0xfec0 || (top & 0xff00) === 0xff00;
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

// 確認したアドレスだけを返す lookup（Node 22 は options.all=true で呼ぶため、その場合は配列で返す）
function pinnedLookup(pinned) {
  return (_host, opts, cb) => {
    const o = typeof opts === 'function' ? {} : (opts || {});
    const done = typeof opts === 'function' ? opts : cb;
    if (o.all) done(null, [{ address: pinned.address, family: pinned.family }]);
    else done(null, pinned.address, pinned.family);
  };
}

// 1回分のGET。リダイレクトなら { redirect }、成功なら { res, length }（res は読み終える前の応答）
function open(u, pinned, { timeoutMs = 60000, ca } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: u.hostname, port: u.port || 443, method: 'GET', path: `${u.pathname}${u.search}`, servername: net.isIP(u.hostname) ? undefined : u.hostname,
      headers: { 'User-Agent': 'sns-scheduler-media-import/1.0', Accept: 'image/*,video/*,*/*;q=0.5' },
      lookup: pinnedLookup(pinned),
      ...(ca ? { ca } : {}),
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { if (res.resume) res.resume(); return resolve({ redirect: res.headers.location }); }
      if (res.statusCode !== 200) { if (res.resume) res.resume(); return reject(new FetchError(`ファイルを取得できませんでした (${res.statusCode})`)); }
      resolve({ res, length: parseInt(res.headers['content-length'] || '0', 10) || 0 });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(`ファイルを取得できませんでした (${e.message})`)));
    req.end();
  });
}

const running = new Set(); // 利用者ごとに同時1件まで

// _test は自動テスト専用（名前解決と証明書を差し替える）。APIからは渡さない
async function importFromUrl({ userId, url, timeoutMs = 60000, _test = null }) {
  if (running.has(userId)) throw new FetchError('別の取り込みを処理中です。終わってからもう一度お試しください。');
  running.add(userId);
  try {
    let u;
    try { u = normalizeUrl(url); } catch { throw new FetchError('URLの形式が正しくありません。'); }
    for (let hop = 0; hop <= 3; hop++) {
      if (u.protocol !== 'https:') throw new FetchError('https のURLを指定してください。');
      if (u.username || u.password) throw new FetchError('このURLからは取り込めません。');
      const room = Math.min(mediaLib.LIMITS.videoBytes, mediaLib.remainingBytes(userId));
      if (room <= 0) throw new FetchError('保存できるファイルの合計の上限に達しています。予約済みの投稿が終わると、自動で削除されます。');
      const pinned = _test && _test.resolve ? _test.resolve(u.hostname) : await resolvePublic(u.hostname);
      const r = await open(u, pinned, { timeoutMs, ca: _test && _test.ca });
      if (r.redirect) { u = new URL(r.redirect, u); continue; }
      if (r.length > room) { r.res.destroy(); throw new FetchError(r.length > mediaLib.LIMITS.videoBytes ? 'ファイルが大きすぎます。' : '保存できるファイルの合計の上限を超えます。'); }
      // 長さが分からない場合は、上限までを受け付ける（超えたら saveUpload が中断する）
      const saved = await mediaLib.saveUpload({ userId, req: r.res, contentLength: r.length || room });
      if (!saved.ok) throw new FetchError(/対応していない/.test(saved.error) ? `${saved.error}（共有リンクの場合は「リンクを知っている全員」が閲覧できる設定か確認してください）` : saved.error);
      return saved.media;
    }
    throw new FetchError('リダイレクトが多すぎます。');
  } finally { running.delete(userId); }
}

module.exports = { importFromUrl, isPrivate, normalizeUrl, pinnedLookup, FetchError };
