/**
 * LIFE CHOICE ── 自分で追加した品目
 *
 * 同梱データは38品目しかない。実際に買おうとしている物がその中にある
 * とは限らないので、画面から品目を足せるようにする。
 *
 * 利用者に入れてもらうのは「名前・分類・新品価格・レンタル料金」だけ。
 * 中古率や売却率は同梱データから導いた分類ごとの既定値を使う。
 * 数字を1つずつ聞くと使われなくなるため。
 *
 * @file lib/custom-products.js
 */

/**
 * 分類ごとの中古率。同梱38品目の中央値から算出したもの。
 * （tools 側の集計結果を固定値として持つ。データを増やしたら見直す）
 */
export const CATEGORY_USED_RATE = {
  'カメラ':     0.50,
  '趣味':       0.50,
  '家周り':     0.45,
  '旅行':       0.45,
  'アウトドア': 0.40,
  '家電':       0.40,
  'スポーツ':   0.40,
  '育児':       0.35,
  '衣類':       0.30,
  'その他':     0.40   // 全体の中央値
};

export const CATEGORIES = Object.keys(CATEGORY_USED_RATE);

/**
 * 売却率の導き方。Phase 2 で同梱データを作ったときと同じ式を使う。
 *   新品で買った場合の売却率 = 中古率 × 0.6
 *   中古で買った場合の売却率 = 新品購入時 × 0.7
 * ここを変えると同梱データと自作データで基準がずれるので触らない。
 */
const RESALE_OF_USED_RATE = 0.6;
const USED_PURCHASE_DISCOUNT = 0.7;

/**
 * 入力内容を確かめる。
 * @param {Object} input
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validate(input) {
  const errors = [];
  const name = String(input.name || '').trim();
  if (!name) errors.push('品目の名前を入れてください。');
  if (name.length > 40) errors.push('名前が長すぎます（40文字まで）。');

  const price = Number(input.newPrice);
  if (!Number.isFinite(price) || price <= 0) errors.push('新品の価格を入れてください。');
  else if (price > 100000000) errors.push('新品の価格が大きすぎます。');

  if (input.rentalPrice !== '' && input.rentalPrice !== null && input.rentalPrice !== undefined) {
    const rent = Number(input.rentalPrice);
    if (!Number.isFinite(rent) || rent <= 0) errors.push('レンタル料金は数字で入れてください。');
    else if (rent > price * 10) errors.push('レンタル料金が新品価格に対して高すぎます。単位（回／月）をご確認ください。');
    if (input.rentalUnit !== '回' && input.rentalUnit !== '月') errors.push('レンタルの単位を選んでください。');
  }

  if (input.category && !CATEGORY_USED_RATE[input.category]) errors.push('分類が正しくありません。');
  return { ok: errors.length === 0, errors };
}

/**
 * 最小限の入力から、同梱データと同じ形の品目を組み立てる。
 *
 * @param {{id?:string, name:string, category?:string, newPrice:number,
 *          rentalPrice?:number|null, rentalUnit?:'回'|'月', lifespanYears?:number}} input
 * @returns {import('../types/models.js').Product}
 */
export function buildCustomProduct(input) {
  const category = CATEGORY_USED_RATE[input.category] ? input.category : 'その他';
  const usedPriceRate = CATEGORY_USED_RATE[category];
  const newPrice = Math.round(Number(input.newPrice));
  const rentalPrice = input.rentalPrice ? Math.round(Number(input.rentalPrice)) : null;
  const estimatedResaleRate = round2(usedPriceRate * RESALE_OF_USED_RATE);

  return {
    id: input.id || makeId(input.name),
    name: String(input.name).trim(),
    category,
    newPrice,
    usedPriceRate,
    usedPrice: Math.round(newPrice * usedPriceRate),
    rentalPrice,
    rentalUnit: rentalPrice ? (input.rentalUnit === '月' ? '月' : '回') : null,
    estimatedResaleRate,
    usedEstimatedResaleRate: round3(estimatedResaleRate * USED_PURCHASE_DISCOUNT),
    lifespanYears: Number(input.lifespanYears) || 5,
    image: null,
    // 出典は「自分で入れた値」であることが分かるようにする。
    // 同梱データの「実測」「推定」と混ざらないようにするため。
    source: '自己入力',
    newPriceSource: '自己入力',
    sourceNote: null,
    isDemo: false,
    isCustom: true,
    updatedAt: today(),
    aliases: []
  };
}

/** 同じ名前で何度も作らないよう、名前からIDを作る */
function makeId(name) {
  const base = String(name).trim().slice(0, 20)
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return 'my-' + (base || 'item') + '-' + Math.abs(hash(String(name) + today())).toString(36).slice(0, 4);
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

function today() { return new Date().toISOString().slice(0, 10); }
const round2 = n => Math.round(n * 100) / 100;
const round3 = n => Math.round(n * 1000) / 1000;

/**
 * 同梱データと自作データを1つに束ねる。
 * 同じIDがあれば自作を優先する（同梱の値は書き換えない・厳守事項2）。
 *
 * @param {Object[]} bundled
 * @param {Object[]} custom
 */
export function mergeProducts(bundled, custom) {
  if (!custom || !custom.length) return bundled;
  const ids = new Set(custom.map(c => c.id));
  return [...bundled.filter(p => !ids.has(p.id)), ...custom];
}
