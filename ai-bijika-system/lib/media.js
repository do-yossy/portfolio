'use strict';
// 投稿に添付する画像・動画の保存と配信。ファイルは DATA_DIR/media/ に置き、予約が終わったら自動で削除する。
// Instagram など一部のSNSは、メディアを「公開URL」から取得するため、推測できない長いトークン付きのURLで配信する。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MediaAssets } = require('./service-store');

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
    const brand = buf.slice(8, 12).toString('latin1');
    return { kind: 'video', mime: brand.startsWith('qt') ? 'video/quicktime' : 'video/mp4', ext: brand.startsWith('qt') ? 'mov' : 'mp4' };
  }
  return null;
}

// リクエストの本文（バイナリ）をそのままファイルに保存する。上限を超えたら中断して削除する
function saveUpload({ userId, req, contentLength }) {
  return new Promise((resolve) => {
    const used = MediaAssets.totalSize(userId);
    const maxBytes = Math.max(LIMITS.videoBytes, LIMITS.imageBytes);
    if (!Number.isFinite(contentLength) || contentLength <= 0) return resolve({ ok: false, error: 'ファイルが空か、サイズを確認できません。' });
    if (contentLength > maxBytes) return resolve({ ok: false, error: `ファイルが大きすぎます（画像は${LIMITS.imageBytes / 1048576}MB、動画は${LIMITS.videoBytes / 1048576}MBまで）。` });
    if (used + contentLength > LIMITS.userTotalBytes) return resolve({ ok: false, error: '保存できるファイルの合計の上限に達しています。予約済みの投稿が終わると、自動で削除されます。' });
    const token = crypto.randomBytes(24).toString('hex');
    const tmp = path.join(dir(), `${token}.part`);
    const out = fs.createWriteStream(tmp);
    let size = 0;
    let head = Buffer.alloc(0);
    let failed = null;
    const fail = (error) => {
      if (failed) return;
      failed = error;
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

module.exports = { LIMITS, sniff, saveUpload, pathOf, publicUrl, remove, cleanup, serve };
