'use strict';
// メディアの処理待ち（コンテナ・動画の変換）で使う待機。
// テストでは SNS_POLL_INTERVAL_MS（確認の間隔）と SNS_POLL_MAX_MS（待つ時間の合計）を小さくする
const envNum = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
const intervalMs = () => envNum('SNS_POLL_INTERVAL_MS', 3000);
const maxTries = () => envNum('SNS_POLL_MAX_TRIES', 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 状態の確認を、間隔を広げながら繰り返す。
// Metaは、コンテナの状態の確認を「1分に1回程度・5分まで」を目安として示している。画像は数秒で終わることが多いため、
// 最初は短い間隔（3秒）で確かめ、間隔を倍々に広げて最大1分ごとにし、待つ時間の合計は maxMs（既定5分）までにする。
// check() が { done:true, value } を返したら終わる。時間切れなら null を返す
async function until(check, { maxMs = 5 * 60 * 1000 } = {}) {
  const base = intervalMs();
  const cap = Math.max(base, Math.min(base * 20, 60 * 1000));
  const limit = envNum('SNS_POLL_MAX_MS', maxMs);
  let waited = 0; let wait = base;
  for (let i = 0; i < 1000; i++) {
    const r = await check();
    if (r && r.done) return r;
    if (waited >= limit) return null;
    const w = Math.min(wait, limit - waited);
    await sleep(w);
    waited += w;
    wait = Math.min(wait * 2, cap);
  }
  return null;
}
module.exports = { intervalMs, maxTries, sleep, until };
