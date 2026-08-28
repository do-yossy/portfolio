/**
 * LIFE CHOICE ── 動作確認用の簡易サーバー
 *
 * ESモジュールと fetch を使っているため file:// では動かない。
 * npx serve でもよいが、初回にネットワークが要るので、
 * リポジトリの方針どおり node:http だけで用意する（依存ゼロ）。
 *
 * 実行：node AI収益化/lifechoice/serve.mjs [ポート番号]
 *       または start.bat をダブルクリック
 *
 * @file serve.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 3400;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  // クエリとハッシュを落とし、%xx を戻す
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400); res.end('Bad Request'); return;
  }

  // ROOT の外へ出さない
  const target = path.resolve(ROOT, '.' + rel);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  let file = target;
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch (e) { /* 下の存在確認で拾う */ }

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<meta charset="utf-8"><p>見つかりません：' + rel +
            '</p><p><a href="/">トップへ戻る</a></p>');
    return;
  }

  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // 手元で確認しながら直すので、キャッシュはさせない
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('\nポート ' + PORT + ' は使用中です。');
    console.error('別のポートで起動するには：node serve.mjs 3401\n');
  } else {
    console.error('\n起動できませんでした：' + err.message + '\n');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const url = 'http://localhost:' + PORT + '/';
  console.log('');
  console.log('  LIFE CHOICE を起動しました');
  console.log('  ' + url);
  console.log('');
  console.log('  トップ      ' + url);
  console.log('  品目を追加  ' + url + 'app/my-items.html');
  console.log('  設定        ' + url + 'app/settings.html');
  console.log('  比較ページ  ' + url + 'guide/');
  console.log('');
  console.log('  終了するには Ctrl+C');
  console.log('');
});
