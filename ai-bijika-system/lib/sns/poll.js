'use strict';
// メディアの処理待ち（コンテナ・動画の変換）で使う待機。テストでは SNS_POLL_INTERVAL_MS を小さくする
const intervalMs = () => Number(process.env.SNS_POLL_INTERVAL_MS || 3000);
const maxTries = () => Number(process.env.SNS_POLL_MAX_TRIES || 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { intervalMs, maxTries, sleep };
