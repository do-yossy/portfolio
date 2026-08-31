/**
 * 「家にあるお金」── 査定の計算
 *
 * 買取相場は状態・年式・ブランドで大きく振れる。
 * 1つの数字に丸めると嘘になるので、**必ず幅で出す**。
 *
 * @file lib/estimate.js
 */

/**
 * 状態による係数。
 * 幅の下限・上限それぞれに掛ける。
 */
export const CONDITIONS = [
  { value: 'new',   label: '未使用・箱あり', low: 0.85, high: 1.00, note: '最も高く売れる状態です' },
  { value: 'good',  label: 'きれい',         low: 0.55, high: 0.80, note: '通常の中古として扱われます' },
  { value: 'used',  label: '使用感あり',     low: 0.30, high: 0.55, note: '傷や汚れの程度で変わります' },
  { value: 'bad',   label: '傷・故障あり',   low: 0.10, high: 0.30, note: '部品取りとして値が付くことがあります' }
];

/** 個数の選択肢。「まとめて何点あるか」を粗く聞く */
export const QUANTITIES = [
  { value: 1, label: '1点' },
  { value: 2, label: '2〜3点' },
  { value: 5, label: '4〜10点' },
  { value: 12, label: '10点以上' }
];

/**
 * 買ったときの値段。
 *
 * 腕時計やバッグは「5,000円〜300,000円」のように幅が60倍になる。
 * 安物から高級品まで同じ品目名だからで、これを出しても判断材料にならない。
 * 購入価格はだいたい覚えているので、1問聞くだけで幅が大きく縮む。
 */
export const PRICE_TIERS = [
  { value: 0, label: '〜1万円' },
  { value: 1, label: '1〜5万円' },
  { value: 2, label: '5〜20万円' },
  { value: 3, label: '20万円以上' }
];

/** この倍率を超えたら、購入価格を聞かないと幅が広すぎる */
export const TIER_THRESHOLD = 8;

/** 幅が広い品目か */
export function needsTier(item) {
  return item.estHigh / item.estLow >= TIER_THRESHOLD;
}

/**
 * 購入価格の段階から、その品目の中の部分区間を取り出す。
 *
 * 価格は等差ではなく等比で分布するので、対数のうえで4等分する。
 * 5,000〜300,000（60倍）なら、1段階あたり約2.8倍の幅に縮む。
 */
function tierRange(item, tier) {
  const n = PRICE_TIERS.length;
  const t = Math.min(n - 1, Math.max(0, Number(tier)));
  const ratio = item.estHigh / item.estLow;
  return {
    low: item.estLow * Math.pow(ratio, t / n),
    high: item.estLow * Math.pow(ratio, (t + 1) / n)
  };
}

const cond = v => CONDITIONS.find(c => c.value === v) || CONDITIONS[1];

/**
 * 1品目の見込み額。
 *
 * 個数はそのまま掛けない。同じ物が増えるほど1点あたりの単価は下がるため、
 * 平方根で伸びを抑える（2点で約1.4倍、10点で約3.2倍）。
 * ここを線形にすると「漫画10セットで20万円」のような非現実的な額になる。
 *
 * @param {{estLow:number, estHigh:number}} item
 * @param {{condition?:string, quantity?:number}} input
 * @returns {{low:number, high:number, mid:number, multiplier:number}}
 */
export function estimateOne(item, input = {}) {
  const c = cond(input.condition);
  const qty = Math.max(1, Number(input.quantity) || 1);
  const multiplier = Math.sqrt(qty);

  // 幅が広い品目は、購入価格の段階で区間を絞る。
  // 未回答なら全区間のまま（勝手に狭めて当たったように見せない）
  const base = (needsTier(item) && input.tier !== undefined && input.tier !== null)
    ? tierRange(item, input.tier)
    : { low: item.estLow, high: item.estHigh };

  const low = Math.round(base.low * c.low * multiplier);
  const high = Math.round(base.high * c.high * multiplier);
  return { low, high, mid: Math.round((low + high) / 2), multiplier, narrowed: base.low !== item.estLow };
}

/**
 * 選んだ品目すべての合計。
 *
 * @param {Object[]} items                全品目
 * @param {Record<string,{condition:string,quantity:number}>} selections  id → 入力
 * @returns {{rows:Object[], low:number, high:number, mid:number, count:number}}
 */
export function estimateAll(items, selections) {
  const rows = [];
  Object.entries(selections || {}).forEach(([id, input]) => {
    const item = items.find(x => x.id === id);
    if (!item || !input) return;
    const est = estimateOne(item, input);
    rows.push({ item, input, ...est });
  });

  // 金額の大きい順。「まずこれから売る」の順番になる
  rows.sort((a, b) => b.mid - a.mid);

  return {
    rows,
    count: rows.length,
    low: rows.reduce((s, r) => s + r.low, 0),
    high: rows.reduce((s, r) => s + r.high, 0),
    mid: rows.reduce((s, r) => s + r.mid, 0)
  };
}

/**
 * 場所ごとの小計。「どの部屋にいくら眠っているか」を出す。
 */
export function byPlace(result, places) {
  return places.map(p => {
    const rows = result.rows.filter(r => r.item.place === p.id);
    return {
      place: p,
      count: rows.length,
      low: rows.reduce((s, r) => s + r.low, 0),
      high: rows.reduce((s, r) => s + r.high, 0),
      mid: rows.reduce((s, r) => s + r.mid, 0)
    };
  }).filter(x => x.count > 0).sort((a, b) => b.mid - a.mid);
}

/**
 * 「まず何から売るか」の順番。
 *
 * 金額だけで並べない。1点で高く売れる物から手を付けたほうが、
 * 手間に対する見返りが大きいため。
 */
export function sellOrder(result, n = 5) {
  const perUnit = r => r.mid / Math.max(1, Number(r.input.quantity) || 1);
  return [...result.rows]
    .sort((a, b) => perUnit(b) - perUnit(a) || b.mid - a.mid)
    .slice(0, n);
}

/**
 * 共有用の文章。
 * 数字が驚きにならないと誰も人に言わないので、合計を先頭に置く。
 */
export function shareText(result) {
  if (!result.count) return '';
  const top = result.rows[0];
  return `家にある不用品を診断したら、合計 ${yen(result.low)}〜${yen(result.high)} でした。\n` +
    `いちばん高いのは「${top.item.name}」で ${yen(top.low)}〜${yen(top.high)}。\n` +
    `${result.count}点、ぜんぶ押し入れとクローゼットに眠っていました。`;
}

export const yen = n => Math.round(n).toLocaleString('ja-JP') + '円';

/**
 * 診断で聞く順番。
 * 「忘れられやすい」かつ「高額」なものを先に聞く。
 * 最初の数問で大きい金額が出ないと、最後まで進んでもらえない。
 */
export function askOrder(items, placeId) {
  return items
    .filter(x => x.place === placeId)
    .sort((a, b) => (b.forgettable ? 1 : 0) - (a.forgettable ? 1 : 0) || b.estHigh - a.estHigh);
}
