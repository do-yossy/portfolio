/**
 * LIFE CHOICE ── ② 買わなくていい物レーダー
 *
 *   損益分岐点 = 購入価格 ÷ レンタル料金
 *   レンタル総額 = レンタル料金 × 使用回数
 *   差額 = 購入価格 − レンタル総額（正ならレンタルが得）
 *
 * @file lib/break-even.js
 */

/**
 * @typedef {Object} BreakEvenRow
 * @property {import('../types/models.js').Product} product
 * @property {number} breakEvenUses   何回使えば買ったほうが得か
 * @property {number} rentTotal
 * @property {number} diff            購入価格 − レンタル総額
 * @property {boolean} rentWins
 */

/**
 * @param {import('../types/models.js').Product[]} products
 * @param {{freq:number, years:number}} opts
 * @returns {BreakEvenRow[]}  diff降順
 */
export function calcBreakEven(products, opts) {
  const uses = opts.freq * opts.years;
  return products
    .filter(p => p.newPrice && p.rentalPrice)
    .map(p => {
      const breakEvenUses = Math.ceil(p.newPrice / p.rentalPrice);
      const rentTotal = p.rentalPrice * uses;
      return {
        product: p,
        breakEvenUses,
        rentTotal,
        diff: p.newPrice - rentTotal,
        rentWins: uses < breakEvenUses
      };
    })
    .sort((a, b) => b.diff - a.diff);
}

/** 合計の節約見込み（レンタルが得な品目だけ足す） */
export function totalSaving(rows) {
  return rows.filter(r => r.rentWins).reduce((sum, r) => sum + r.diff, 0);
}
