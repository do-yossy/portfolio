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
function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

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
