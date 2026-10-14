'use strict';
// 依存ゼロの手書きテストハーネス（sales-platform/test.js と同じ形式）＋ https のモック
const https = require('https');
const { EventEmitter } = require('events');

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`); }
}
let finished = false;
// 失敗があれば終了コードを1にする（npm test の && の連鎖を止めるため）
function summary() {
  finished = true;
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  return failed === 0;
}
// 待ち状態のまま処理が尽きると、Node は黙って終了する。最後まで走らなかったテストは失敗として扱う
process.on('exit', () => {
  if (!finished) { console.log(`\nテストが最後まで実行されませんでした（${passed} passed, ${failed} failed の時点で終了）`); process.exitCode = 1; }
});
process.on('unhandledRejection', (e) => { console.log('  FAIL 予期しないエラー:', e && e.stack ? e.stack : e); failed++; process.exitCode = 1; });

// handler({host, method, path, headers, body}) → {status, json?, text?} を返す。throw すると通信エラー扱い
function installHttpsMock(handler) {
  const calls = [];
  const orig = https.request;
  https.request = (options, cb) => {
    const req = new EventEmitter();
    const chunks = [];
    req.write = (c) => { chunks.push(Buffer.from(c)); };
    req.setTimeout = () => {};
    req.destroy = (e) => { if (e) setImmediate(() => req.emit('error', e)); };
    req.end = () => {
      const call = {
        host: options.host, method: options.method || 'GET', path: options.path,
        headers: options.headers || {}, body: Buffer.concat(chunks).toString('utf8'),
      };
      calls.push(call);
      setImmediate(async () => {
        let r;
        try { r = await handler(call); } catch (e) { req.emit('error', e); return; }
        if (!r) r = { status: 404, json: { error: { message: 'no mock' } } };
        const res = new EventEmitter();
        res.statusCode = r.status;
        res.headers = r.headers || {};
        cb(res);
        const text = r.json !== undefined ? JSON.stringify(r.json) : (r.text || '');
        res.emit('data', Buffer.from(text));
        res.emit('end');
      });
    };
    return req;
  };
  return { calls, restore() { https.request = orig; } };
}

module.exports = { ok, summary, installHttpsMock };
