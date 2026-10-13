'use strict';
// ログイン試行の回数制限（メモリ上。再起動で消える簡易版）
function createLimiter({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map(); // key → [timestamps]
  return {
    // 失敗を1回記録し、上限を超えたら false を返す
    allow(key) {
      const t = Date.now();
      const arr = (hits.get(key) || []).filter((x) => x > t - windowMs);
      return arr.length < max;
    },
    fail(key) {
      const t = Date.now();
      const arr = (hits.get(key) || []).filter((x) => x > t - windowMs);
      arr.push(t);
      hits.set(key, arr);
    },
    reset(key) { hits.delete(key); },
  };
}
module.exports = { createLimiter };
