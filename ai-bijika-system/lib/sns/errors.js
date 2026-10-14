'use strict';
// retriable: 時間をおいて再試行してよい（ネットワーク・5xx・429）
// authError: 連携の再認証が必要（トークン失効・権限取り消し）
class SnsError extends Error {
  constructor(message, { retriable = false, authError = false, status = 0 } = {}) {
    super(message);
    this.name = 'SnsError';
    this.retriable = retriable;
    this.authError = authError;
    this.status = status;
  }
}

// HTTPステータスから分類する。
// 401 だけを「連携のやり直しが必要」とする。403 は「権限・上限・規約などで、その操作が許可されていない」ことが多く
// （例：投稿数の上限、審査前の制限、割り当ての使い切り）、連携し直しても直らないため、通常の失敗として理由をそのまま示す。
// トークンの失効など、403 でも再連携が必要なものは、各SNSのエラーコードで個別に authError にする
function classify(status, message) {
  if (status === 401) return new SnsError(message || '認証エラーです。SNSの連携をやり直してください。', { authError: true, status });
  if (status === 403) return new SnsError(message || 'SNS側で、この操作が許可されませんでした (403)', { status });
  if (status === 429 || status >= 500) return new SnsError(message || `一時的なエラーです (${status})`, { retriable: true, status });
  return new SnsError(message || `SNS側でエラーになりました (${status})`, { status });
}

// 公開の最終段階で、通信エラー・タイムアウト・サーバーエラー(5xx)が起きたときは、投稿されたかどうかが分からない
// （応答だけが失われた可能性がある）。自動で再試行すると二重投稿になりうるため、再試行せずに失敗として、利用者に確認を促す。
// 投稿されていないと確定しているエラー（400番台の拒否、429、SNS側の「失敗」の通知、入力の不備）は、このまま扱う。
function ambiguous(err) {
  if (err && err.retriable && !err.authError && err.status !== 429) {
    err.retriable = false;
    if (!/投稿されたか/.test(err.message)) err.message = `${err.message}（投稿されたかどうか、SNSでご確認ください）`;
  }
  return err;
}

module.exports = { SnsError, classify, ambiguous };
