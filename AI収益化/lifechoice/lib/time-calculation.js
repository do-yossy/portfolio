/**
 * LIFE CHOICE ── ③ いまから何する？（時間の逆算）
 *
 * 本サービスの中核。
 *
 *   現在時刻 + 移動時間 + 所要時間 ≦ 閉店時刻
 *
 * 既存 demo/いまから何する.html は移動時間を30分固定にしていたが、
 * ここでは UserPreference.transportation から算出できるよう引数にした。
 * 既定値は30分なので、指定しなければ既存と同じ結果になる。
 *
 * @file lib/time-calculation.js
 */

/**
 * @typedef {Object} NowWhatInput
 * @property {number} now          現在時刻（小数時間 17.5 = 17:30）
 * @property {number} until        終了時刻
 * @property {number} budget       予算（1人あたり）
 * @property {'solo'|'multi'} who
 * @property {'quiet'|'talk'|'any'} mood
 * @property {'rest'|'active'|'any'} body
 * @property {number} [travelMinutes=30]  移動にかける時間
 *
 * @typedef {Object} NowWhatHit
 * @property {import('../types/models.js').Store} store
 * @property {number} score
 * @property {string[]} notes
 */

/** 閉店時刻の日跨ぎ補正（例：open=17 close=2 → close=26） */
export function adjustedClosing(store) {
  if (store.closingTime === null || store.openingTime === null) return null;
  return store.closingTime <= store.openingTime ? store.closingTime + 24 : store.closingTime;
}

/**
 * 今から間に合うか。既存実装と同じ判定。
 * @param {import('../types/models.js').Store} store
 * @param {number} now
 * @param {number} freeMinutes
 * @param {number} travelMinutes
 */
export function fitsInTime(store, now, freeMinutes, travelMinutes = 30) {
  if (store.openingTime === null || store.closingTime === null) return false;
  const startable = now + travelMinutes / 60;
  const closeAdj = adjustedClosing(store);
  const latestStart = closeAdj - (store.estimatedStayMinutes / 60);
  const fitsTime = (store.estimatedStayMinutes + travelMinutes) <= freeMinutes;
  const fitsOpen = startable >= store.openingTime - 0.01 && startable <= latestStart + 0.01;
  return fitsTime && fitsOpen;
}

/**
 * 条件に合う場所をスコア順で返す。
 * 加点方式は既存実装をそのまま踏襲している。
 * @param {import('../types/models.js').Store[]} stores
 * @param {NowWhatInput} input
 * @returns {NowWhatHit[]}
 */
export function findNowWhat(stores, input) {
  const travel = input.travelMinutes ?? 30;
  let until = input.until;
  if (until <= input.now) until += 24;
  const freeMinutes = Math.round((until - input.now) * 60);

  return stores.map(s => {
    const notes = [];
    let score = 0;

    if (!fitsInTime(s, input.now, freeMinutes, travel)) return null;

    // 予算
    if (s.budgetMin > input.budget) return null;
    if (s.budgetMax <= input.budget) score += 2;
    else { score += 1; notes.push('予算内に収まるプランを選ぶ必要あり'); }

    // ひとり適性
    if (input.who === 'solo') {
      if (s.soloScore <= 2) return null;
      score += s.soloScore;
      if (s.soloScore >= 5) notes.push('一人客が多く浮かない');
    } else {
      score += 3;
    }

    // 気分（会話）── conversationFreeScore は 5=話しかけられない
    if (input.mood === 'quiet') {
      if (s.conversationFreeScore <= 1) return null;
      if (s.conversationFreeScore >= 5) score += 3;
    } else if (input.mood === 'talk') {
      if (s.conversationFreeScore >= 5) score -= 2;
      if (s.conversationFreeScore <= 1) score += 4;
    }

    // 体を動かすか
    if (input.body === 'rest') {
      if (s.activityLevel === 2) score -= 3;
      if (s.activityLevel === 0) score += 2;
    } else if (input.body === 'active') {
      if (s.activityLevel === 0) score -= 3;
      if (s.activityLevel === 2) score += 4;
    }

    // 空き時間にちょうど収まるものを加点
    const ratio = (s.estimatedStayMinutes + travel) / freeMinutes;
    if (ratio > 0.6 && ratio <= 1) score += 2;

    return { store: s, score, notes };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
}

/** 結果の内訳（要予約 / 予約不要） */
export function summarize(hits) {
  const needBooking = hits.filter(h => h.store.requiresReservation).length;
  return { total: hits.length, needBooking, noBooking: hits.length - needBooking };
}
