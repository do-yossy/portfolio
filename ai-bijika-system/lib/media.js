'use strict';
// 投稿に添付する画像・動画の保存と配信。ファイルは DATA_DIR/media/ に置き、予約が終わったら自動で削除する。
// Instagram など一部のSNSは、メディアを「公開URL」から取得するため、推測できない長いトークン付きのURLで配信する。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MediaAssets } = require('./service-store');

const VIDEO_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV']);
const inflight = new Map(); // userId → アップロード中のバイト数（同時アップロードで合計容量の上限を超えないようにする）
const LIMITS = { imageBytes: 8 * 1024 * 1024, videoBytes: 100 * 1024 * 1024, userTotalBytes: 300 * 1024 * 1024 };

function dir() {
  const d = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'media');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// 先頭のバイト列でファイルの種類を判定する（ヘッダーの申告は信用しない）
function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.slice(4, 8).toString('latin1') === 'ftyp') {
    // ftyp は HEIC・AVIF などの画像にもあるため、動画のブランドだけを許可する
    const brand = buf.slice(8, 12).toString('latin1');
    if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime', ext: 'mov' };
    if (VIDEO_BRANDS.has(brand)) return { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
  }
  return null;
}

// リクエストの本文（バイナリ）をそのままファイルに保存する。上限を超えたら中断して削除する
function saveUpload({ userId, req, contentLength }) {
  return new Promise((resolve) => {
    const used = MediaAssets.totalSize(userId) + (inflight.get(userId) || 0);
    const maxBytes = Math.max(LIMITS.videoBytes, LIMITS.imageBytes);
    if (!Number.isFinite(contentLength) || contentLength <= 0) return resolve({ ok: false, error: 'ファイルが空か、サイズを確認できません。' });
    if (contentLength > maxBytes) return resolve({ ok: false, error: `ファイルが大きすぎます（画像は${LIMITS.imageBytes / 1048576}MB、動画は${LIMITS.videoBytes / 1048576}MBまで）。` });
    if (used + contentLength > LIMITS.userTotalBytes) return resolve({ ok: false, error: '保存できるファイルの合計の上限に達しています。予約済みの投稿が終わると、自動で削除されます。' });
    const token = crypto.randomBytes(24).toString('hex');
    const tmp = path.join(dir(), `${token}.part`);
    inflight.set(userId, (inflight.get(userId) || 0) + contentLength);
    const release = () => { const left = (inflight.get(userId) || 0) - contentLength; if (left > 0) inflight.set(userId, left); else inflight.delete(userId); };
    const out = fs.createWriteStream(tmp);
    out.on('error', () => { req.destroy(); fail('ファイルを保存できませんでした。時間をおいてもう一度お試しください。'); });
    let size = 0;
    let head = Buffer.alloc(0);
    let failed = null;
    const fail = (error) => {
      if (failed) return;
      failed = error;
      release();
      out.destroy();
      fs.rm(tmp, { force: true }, () => resolve({ ok: false, error }));
    };
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > contentLength || size > maxBytes) { req.destroy(); return fail('ファイルが大きすぎます。'); }
      if (head.length < 16) head = Buffer.concat([head, c.slice(0, 16 - head.length)]);
      if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('error', () => fail('アップロードに失敗しました。'));
    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        release();
        const kind = sniff(head);
        if (!kind) return fs.rm(tmp, { force: true }, () => resolve({ ok: false, error: '対応していないファイルです。画像はJPEGまたはPNG、動画はMP4（MOV）にしてください。' }));
        const limit = kind.kind === 'image' ? LIMITS.imageBytes : LIMITS.videoBytes;
        if (size > limit) return fs.rm(tmp, { force: true }, () => resolve({ ok: false, error: `${kind.kind === 'image' ? '画像は' + LIMITS.imageBytes / 1048576 : '動画は' + LIMITS.videoBytes / 1048576}MBまでです。` }));
        const final = path.join(dir(), `${token}.${kind.ext}`);
        fs.renameSync(tmp, final);
        const id = MediaAssets.create({ userId, token, kind: kind.kind, mime: kind.mime, ext: kind.ext, size });
        resolve({ ok: true, media: MediaAssets.get(id) });
      });
    });
  });
}

// MP4/MOV の長さ（秒）。moov > mvhd を読む。読めなければ null（検証をしない）
function mp4DurationSec(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const readAt = (pos, len) => { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return b.slice(0, n); };
    const findBox = (start, end, type) => {
      let pos = start;
      while (pos + 8 <= end) {
        const h = readAt(pos, 16);
        let boxSize = h.readUInt32BE(0);
        const t = h.slice(4, 8).toString('latin1');
        let header = 8;
        if (boxSize === 1) { boxSize = Number(h.readBigUInt64BE(8)); header = 16; }
        else if (boxSize === 0) boxSize = end - pos;
        if (boxSize < header) return null;
        if (t === type) return { start: pos + header, end: Math.min(pos + boxSize, end) };
        pos += boxSize;
      }
      return null;
    };
    const moov = findBox(0, size, 'moov');
    if (!moov) return null;
    const mvhd = findBox(moov.start, moov.end, 'mvhd');
    if (!mvhd) return null;
    const b = readAt(mvhd.start, 32);
    const version = b[0];
    const timescale = version === 1 ? b.readUInt32BE(20) : b.readUInt32BE(12);
    const duration = version === 1 ? Number(b.readBigUInt64BE(24)) : b.readUInt32BE(16);
    return timescale ? duration / timescale : null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* 閉じられない */ } }
}

const pathOf = (m) => path.join(dir(), `${m.token}.${m.ext}`);
function publicUrl(m) {
  const base = String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, '');
  return `${base}/media/${m.token}.${m.ext}`;
}

function remove(m) {
  try { fs.rmSync(pathOf(m), { force: true }); } catch { /* 既に無い */ }
  MediaAssets.markDeleted(m.id);
}
function cleanup(nowMs = Date.now()) {
  const list = MediaAssets.deletable(nowMs);
  list.forEach(remove);
  return list.length;
}

// 公開URLからの配信（Rangeリクエスト対応）。トークンを知っている相手にだけ渡る
function serve(req, res, token, ext) {
  const m = MediaAssets.getByToken(token);
  if (!m || m.ext !== ext) { res.writeHead(404); return res.end('Not Found'); }
  const file = pathOf(m);
  let stat;
  try { stat = fs.statSync(file); } catch { res.writeHead(404); return res.end('Not Found'); }
  const headers = { 'Content-Type': m.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : stat.size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : stat.size - 1;
    if (start < 0) start = 0;
    if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file).pipe(res);
}

// 画像の幅と高さ（JPEG・PNG）。読めなければ null（検証をしない）
// Exif（APP1の中身）から、向き（タグ 0x0112）を読む。読めなければ 0
function exifOrientation(app) {
  try {
    if (app.slice(0, 6).toString('latin1') !== 'Exif\0\0') return 0;
    const t = app.slice(6);
    const le = t.slice(0, 2).toString('latin1') === 'II';
    const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
    const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
    const ifd = u32(4);
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === 0x0112) return u16(e + 8);
    }
  } catch { /* 壊れたExif */ }
  return 0;
}

function imageSize(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(32);
    fs.readSync(fd, head, 0, 32, 0);
    if (head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
    if (head[0] !== 0xff || head[1] !== 0xd8) return null;
    const size = fs.fstatSync(fd).size;
    let pos = 2;
    let orientation = 1;
    const b = Buffer.alloc(10);
    while (pos + 4 < size) {
      fs.readSync(fd, b, 0, 10, pos);
      if (b[0] !== 0xff) return null;
      const marker = b[1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
      const len = b.readUInt16BE(2);
      // APP1（Exif）の向き（Orientation）。スマホの縦写真は「横長の画素＋90度回転の指定」で保存されることが多い
      if (marker === 0xe1 && len > 8 && len < 65536) {
        const app = Buffer.alloc(len - 2);
        fs.readSync(fd, app, 0, len - 2, pos + 4);
        const o = exifOrientation(app);
        if (o) orientation = o;
      }
      // SOF0〜SOF15（DHT=C4・JPG=C8・DAC=CC を除く）に、高さと幅がある。向きが5〜8（90度・270度の回転）なら、見た目の幅と高さは入れ替わる
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        const h = b.readUInt16BE(5); const w = b.readUInt16BE(7);
        return orientation >= 5 && orientation <= 8 ? { width: h, height: w, orientation } : { width: w, height: h, orientation };
      }
      pos += 2 + len;
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* */ } }
}

// 利用者が、あと保存できる容量（アップロード中の分を含めて差し引く）
function remainingBytes(userId) {
  return Math.max(0, LIMITS.userTotalBytes - MediaAssets.totalSize(userId) - (inflight.get(userId) || 0));
}

module.exports = { imageSize, remainingBytes, LIMITS, mp4DurationSec, sniff, saveUpload, pathOf, publicUrl, remove, cleanup, serve };
