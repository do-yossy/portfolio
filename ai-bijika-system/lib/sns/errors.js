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

// HTTPステータスから分類する
function classify(status, message) {
  if (status === 401 || status === 403) return new SnsError(message || '認証エラーです。SNSの連携をやり直してください。', { authError: true, status });
  if (status === 429 || status >= 500) return new SnsError(message || `一時的なエラーです (${status})`, { retriable: true, status });
  return new SnsError(message || `SNS側でエラーになりました (${status})`, { status });
}

// 公開の最終段階で起きたエラーは、投稿されたかどうかが分からない（応答だけが失われた可能性がある）。
// 自動で再試行すると二重投稿になりうるため、再試行せずに失敗として、利用者に確認を促す。
function ambiguous(err) {
  if (err && !err.authError) {
    err.retriable = false;
    if (!/投稿されたか/.test(err.message)) err.message = `${err.message}（投稿されたかどうか、SNSでご確認ください）`;
  }
  return err;
}

module.exports = { SnsError, classify, ambiguous };
