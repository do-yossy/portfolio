'use strict';
// 外部API呼び出し用の最小クライアント（node:https のみ。追加依存なし）
const https = require('https');

// フォーム形式にエンコードする（Stripe形式のネスト: a[b][0]=x）
function encodeForm(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') encodeForm(item, `${key}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      encodeForm(v, key, out);
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out.join('&');
}

// body: 文字列 または Buffer。JSON/フォームへの変換は呼び出し側で行う。
// timeoutMs は、通信が途切れたまま待つ時間の上限。これとは別に、全体の締め切り（timeoutMs の2倍、最低1分）を設ける。
// 送るデータが大きいときは、遅い回線（およそ1Mbps）でも送り終えられるよう、その分を締め切りに足す。
// 応答の途中で接続が閉じられた場合（本文が最後まで届かない）も、必ず失敗として返す（待ち続けて、予約の処理全体が止まらないように）
function request({ host, method = 'GET', path, headers = {}, body, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let deadline = null;
    const done = (fn, v) => { if (settled) return; settled = true; if (deadline) clearTimeout(deadline); fn(v); };
    const payload = body === undefined || body === null ? null : Buffer.from(body);
    const req = https.request({
      host, method, path,
      headers: { ...headers, ...(payload ? { 'Content-Length': payload.length } : {}) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        done(resolve, { status: res.statusCode, headers: res.headers || {}, text, json });
      });
      res.on('aborted', () => done(reject, new Error('response aborted')));
      res.on('error', (e) => done(reject, e));
      res.on('close', () => { if (!res.complete) done(reject, new Error('connection closed before the response was complete')); });
    });
    const sendMs = payload ? Math.ceil(payload.length / 128) : 0; // 128バイト/ミリ秒 ≒ 1Mbps
    deadline = setTimeout(() => { req.destroy(new Error('timeout')); done(reject, new Error('timeout')); }, Math.max(timeoutMs * 2, 60000) + sendMs);
    if (deadline.unref) deadline.unref();
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => done(reject, e));
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { request, encodeForm };
