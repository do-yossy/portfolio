'use strict';
// URLからの取り込みを、モックを使わずに確かめる（ローカルの https サーバーに、本物の https.request で接続する）
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aibj-fetch-'));
const { ok, summary } = require('./helpers');
const { Users } = require('../db');
const media = require('../lib/media');
const fm = require('../lib/fetch-media');

const key = fs.readFileSync(path.join(__dirname, 'fixtures', 'localhost-key.pem'));
const cert = fs.readFileSync(path.join(__dirname, 'fixtures', 'localhost-cert.pem'));
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) & 255))]);

(async () => {
  const server = https.createServer({ key, cert }, (req, res) => {
    if (req.url === '/a.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': JPEG.length }); return res.end(JPEG); }
    if (req.url === '/chunked.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.write(JPEG.subarray(0, 100)); return setTimeout(() => res.end(JPEG.subarray(100)), 10); }
    if (req.url === '/redir') { res.writeHead(302, { Location: '/a.jpg' }); return res.end(); }
    if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
    if (req.url === '/huge') { res.writeHead(200, { 'Content-Length': String(500 * 1024 * 1024) }); return res.end(); }
    if (req.url === '/text') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>not a file</html>'); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const uid = Users.create({ email: 'f@example.com', passwordHash: 'h', passwordSalt: 's' });
  const _test = { resolve: () => ({ address: '127.0.0.1', family: 4 }), ca: cert };
  const imp = (p) => fm.importFromUrl({ userId: uid, url: `https://localhost:${port}${p}`, _test });

  console.log('名前解決の固定（Node 22 の all:true にも対応）');
  const lk = fm.pinnedLookup({ address: '93.184.216.34', family: 4 });
  let got = null;
  lk('x', { all: true }, (e, a) => { got = a; });
  ok(Array.isArray(got) && got[0].address === '93.184.216.34' && got[0].family === 4, 'all:true のときは配列で返す');
  lk('x', { all: false }, (e, a, f) => { got = [a, f]; });
  ok(got[0] === '93.184.216.34' && got[1] === 4, 'all:false のときはアドレスと種別で返す');
  lk('x', (e, a) => { got = a; });
  ok(got === '93.184.216.34', 'options を省略した呼び方にも対応する');

  console.log('本物の https で取り込む');
  let m = await imp('/a.jpg');
  ok(m.kind === 'image' && fs.readFileSync(media.pathOf(m)).equals(JPEG), 'ホスト名のURLから画像を取り込める（中身が壊れない）');
  m = await imp('/chunked.jpg');
  ok(m.kind === 'image' && m.size === JPEG.length, '長さの分からない応答（chunked）でも取り込める');
  m = await imp('/redir');
  ok(m.kind === 'image', 'リダイレクト先から取り込める');
  let err = null; try { await imp('/loop'); } catch (e) { err = e; }
  ok(err instanceof fm.FetchError && /リダイレクト/.test(err.message), 'リダイレクトは3回まで');
  err = null; try { await imp('/huge'); } catch (e) { err = e; }
  ok(err instanceof fm.FetchError && /大きすぎ|上限/.test(err.message), '大きすぎるファイルは、受け取る前に断る');
  err = null; try { await imp('/text'); } catch (e) { err = e; }
  ok(err instanceof fm.FetchError && /対応していない/.test(err.message), '画像・動画以外は保存しない');
  ok(fs.readdirSync(path.join(process.env.DATA_DIR, 'media')).filter((f) => f.endsWith('.part')).length === 0, '失敗した取り込みの一時ファイルを残さない');
  const p1 = imp('/chunked.jpg');
  err = null; try { await imp('/a.jpg'); } catch (e) { err = e; }
  await p1;
  ok(err && /処理中/.test(err.message), '同じ利用者の取り込みは同時に1件まで');

  console.log('証明書の検証');
  err = null; try { await fm.importFromUrl({ userId: uid, url: `https://localhost:${port}/a.jpg`, _test: { resolve: _test.resolve } }); } catch (e) { err = e; }
  ok(err instanceof fm.FetchError, '信頼できない証明書のサーバーからは取り込まない');

  console.log('社内・ローカルのアドレス');
  const priv = ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.0.1', '172.20.0.1', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', 'fec0::1', 'ff02::1',
    '::ffff:127.0.0.1', '::7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1', '2001:0:4136:e378::1'];
  ok(priv.every(fm.isPrivate), `社内・ローカル・変換用のアドレスを拒否する（${priv.length}種）`);
  ok(!fm.isPrivate('93.184.216.34') && !fm.isPrivate('2606:4700::1111') && !fm.isPrivate('::ffff:8.8.8.8'), '公開アドレスは許可する');
  err = null; try { await fm.importFromUrl({ userId: uid, url: 'https://127.0.0.1/a.jpg' }); } catch (e) { err = e; }
  ok(err instanceof fm.FetchError, 'IPアドレスで社内を指定しても拒否する');

  server.close();
  summary();
})();
