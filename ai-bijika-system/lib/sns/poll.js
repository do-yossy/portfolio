'use strict';
// メディアの処理待ち（コンテナ・動画の変換）で使う待機。テストでは SNS_POLL_INTERVAL_MS を小さくする
const intervalMs = () => Number(process.env.SNS_POLL_INTERVAL_MS || 3000);
const maxTries = () => Number(process.env.SNS_POLL_MAX_TRIES || 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 状態の確認を、間隔を広げながら繰り返す（Metaの推奨：確認は多くても1分に1回、合計5分まで）。
// check() が { done:true, value } を返したら終わる。時間切れなら null を返す
async function until(check, { maxMs = 5 * 60 * 1000 } = {}) {
  const base = intervalMs();
  const cap = base * 20; // 本番は最大60秒ごと
  const limit = base >= 1000 ? maxMs : base * 200; // テストでは短く
  let waited = 0; let wait = base;
  for (let i = 0; i < 1000; i++) {
    const r = await check();
    if (r && r.done) return r;
    if (waited >= limit) return null;
    await sleep(wait);
    waited += wait;
    wait = Math.min(wait * 2, cap);
  }
  return null;
}
module.exports = { intervalMs, maxTries, sleep, until };
