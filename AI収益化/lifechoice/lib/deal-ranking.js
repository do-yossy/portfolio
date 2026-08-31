/**
 * LIFE CHOICE ── ④ 今日だけ安い（Deal Score）
 *
 *   DealScore = discountScore + urgencyScore + distanceScore + availabilityScore
 *
 * 既存実装は割引率の単純降順だったが、4要素の総合スコアへ拡張する。
 * 距離データがまだ無いため（判断5：市区町村単位から開始）、
 * 位置が未設定のときは distanceScore を中立値にして順位を歪めない。
 *
 * @file lib/deal-ranking.js
 */

/**
 * @typedef {Object} DealScoreBreakdown
 * @property {number} discount      0-40  割引率
 * @property {number} urgency       0-25  締切までの近さ
 * @property {number} availability  0-20  残数の少なさ（希少性）
 * @property {number} distance      0-15  近さ（位置未設定なら中立）
 * @property {number} total         0-100
 *
 * @typedef {Object} RankedDeal
 * @property {import('../types/models.js').Deal} deal
 * @property {DealScoreBreakdown} score
 * @property {boolean} isUrgent
 */

const W = { discount: 40, urgency: 25, availability: 20, distance: 15 };

/**
 * 割引率の正規化の上限。
 * 「今日だけ安い」に載る案件は50%引きが下限のような分布になるため、
 * 上限を0.5にすると全件が満点に張り付いて順位がつかない。
 * 実データの最大が62.5%だったので、70%引きで満点となるようにする。
 */
const DISCOUNT_CAP = 0.7;

/**
 * @param {import('../types/models.js').Deal} deal
 * @param {{nowHour?:number, userLat?:number, userLng?:number}} ctx
 * @returns {DealScoreBreakdown}
 */
export function scoreDeal(deal, ctx = {}) {
  // 割引率：DISCOUNT_CAP で満点
  const discount = Math.min(1, deal.discountRate / DISCOUNT_CAP) * W.discount;

  // 締切までの近さ：残り1時間で満点、8時間以上で0
  const nowHour = ctx.nowHour ?? new Date().getHours();
  const hoursLeft = Math.max(0, deal.deadlineHour - nowHour);
  const urgency = hoursLeft <= 0 ? 0
    : (1 - Math.min(1, (hoursLeft - 1) / 7)) * W.urgency;

  // 残数：少ないほど高い（1個で満点、20個以上で0）
  const availability = (1 - Math.min(1, (deal.remainingCount - 1) / 19)) * W.availability;

  // 距離：位置が無ければ中立（満点の6割）にして順位を歪めない
  let distance;
  if (deal.latitude != null && ctx.userLat != null) {
    const km = haversine(ctx.userLat, ctx.userLng, deal.latitude, deal.longitude);
    distance = (1 - Math.min(1, km / 10)) * W.distance;
  } else {
    distance = W.distance * 0.6;
  }

  const round = n => Math.round(n * 10) / 10;
  return {
    discount: round(discount),
    urgency: round(urgency),
    availability: round(availability),
    distance: round(distance),
    total: round(discount + urgency + availability + distance)
  };
}

/**
 * @param {import('../types/models.js').Deal[]} deals
 * @param {{budget?:number, category?:string, nowHour?:number, userLat?:number, userLng?:number}} opts
 * @returns {RankedDeal[]}
 */
export function rankDeals(deals, opts = {}) {
  return deals
    .filter(d => (opts.budget == null || d.salePrice <= opts.budget))
    .filter(d => (!opts.category || opts.category === 'all' || d.category === opts.category))
    .map(d => ({
      deal: d,
      score: scoreDeal(d, opts),
      isUrgent: d.remainingCount <= 2
    }))
    .sort((a, b) => b.score.total - a.score.total);
}

/** 2地点間の距離（km） */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
