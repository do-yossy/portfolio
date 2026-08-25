/**
 * LIFE CHOICE ── 統合検索「何をすればいい？」
 *
 * 「3万円くらいでキャンプを始めたい」のような1文から、
 *   ① 予算・活動・品目 を読み取り
 *   ② 必要な品目それぞれについて 買う／中古／借りる／もらう を比較し
 *   ③ 予算に収まる組み合わせと、推定節約額を出す
 *
 * 外部APIやAIを使わず、ローカルデータだけで動く（厳守事項9）。
 * 将来 AI API へ差し替えるときは parseQuery() だけを置き換えればよい。
 *
 * @file lib/integrated-search.js
 */

/** 予算の書き方のゆれを吸収する。「3万」「30000円」「3万円くらい」すべて 30000 になる */
const BUDGET_PATTERNS = [
  { re: /([0-9]+(?:\.[0-9]+)?)\s*万/, mul: 10000 },   // 「3万」「1.5万」
  { re: /([0-9][0-9,]*)\s*円/, mul: 1 },              // 「30000円」「3,000円」
  { re: /([0-9][0-9,]{2,})/, mul: 1 }                 // 「5000」
];

/**
 * 自由入力から条件を読み取る。
 * @param {string} query
 * @returns {{budget:number|null, text:string, tokens:string[]}}
 */
export function parseQuery(query) {
  const text = String(query || '').trim();
  let budget = null;
  for (const p of BUDGET_PATTERNS) {
    const m = text.match(p.re);
    if (m) { budget = Math.round(parseFloat(m[1].replace(/,/g, '')) * p.mul); break; }
  }
  const tokens = text
    .replace(/[0-9０-９,，.．]/g, ' ')
    .split(/[\s、。「」『』()（）・/／]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);
  return { budget, text, tokens };
}

/**
 * 入力に合う ActivitySet を探す。
 * 見つからなければ、品目名との直接一致にフォールバックする。
 *
 * @param {string} query
 * @param {import('../types/models.js').ActivitySet[]} sets
 * @param {import('../types/models.js').Product[]} products
 */
export function matchActivity(query, sets, products) {
  const lower = String(query || '').toLowerCase();
  const norm = s => String(s).toLowerCase();

  // 1. ActivitySet のキーワード照合。長いキーワードほど具体的なので優先する
  let best = null;
  for (const set of sets) {
    for (const kw of set.keywords) {
      if (lower.includes(norm(kw)) && (!best || kw.length > best.score)) {
        best = { set, matchedBy: kw, score: kw.length };
      }
    }
  }
  if (best) {
    const items = [...best.set.items].sort((a, b) => a.priority - b.priority);
    return {
      set: best.set,
      products: items
        .map(i => ({ ...i, product: products.find(p => p.id === i.productId) }))
        .filter(x => x.product),
      matchedBy: best.matchedBy,
      score: best.score
    };
  }

  // 2. 品目名・別名との直接一致
  const hits = [];
  for (const p of products) {
    for (const n of [p.name, ...(p.aliases || [])]) {
      if (lower.includes(norm(n))) { hits.push({ productId: p.id, priority: 1, essential: true, product: p }); break; }
    }
  }
  if (hits.length) return { set: null, products: hits.slice(0, 5), matchedBy: '品目名', score: 1 };

  return { set: null, products: [], matchedBy: '', score: 0 };
}

/** レンタル総額。①買う前チェックと同じ式（事項5：計算を重複させない） */
export function rentalTotal(product, uses, years) {
  if (!product.rentalPrice) return null;
  return product.rentalUnit === '回'
    ? product.rentalPrice * uses
    : product.rentalPrice * Math.min(years * 12, Math.ceil(uses / 2));
}

/**
 * 1品目について、買う／中古／借りる／もらう を比較する。
 *
 * @param {Object} product
 * @param {number} uses      通算の使用回数
 * @param {number} years     使う年数
 * @param {Object[]} freeItems
 */
export function compareWays(product, uses, years, freeItems = []) {
  const p = product;
  const ways = [];

  if (p.newPrice) {
    ways.push({
      kind: 'buy', label: '買う', cost: p.newPrice, note: '新品を買う',
      net: p.newPrice - Math.round(p.newPrice * (p.estimatedResaleRate || 0))
    });
  }

  if (p.newPrice && p.usedPriceRate) {
    const usedCost = Math.round(p.newPrice * p.usedPriceRate);
    ways.push({
      kind: 'used', label: '中古', cost: usedCost,
      note: '中古で買う（新品の' + Math.round(p.usedPriceRate * 100) + '%）',
      net: usedCost - Math.round(p.newPrice * (p.usedEstimatedResaleRate || 0))
    });
  }

  const rent = rentalTotal(p, uses, years);
  if (rent !== null) {
    const months = Math.min(years * 12, Math.ceil(uses / 2));
    ways.push({
      kind: 'rent', label: '借りる', cost: rent, net: rent,
      note: p.rentalUnit === '回'
        ? uses + '回ぶん借りる（1回 ' + p.rentalPrice.toLocaleString('ja-JP') + '円）'
        : months + 'ヶ月ぶん借りる（月 ' + p.rentalPrice.toLocaleString('ja-JP') + '円）'
    });
  }

  // もらう：無料品に同じ分類の出品があるか。
  // 現状の無料品データはすべてサンプルなので isDemo を必ず立てる（厳守事項11）。
  const free = freeItems.find(f => f.category && p.category && f.category === p.category);
  if (free) {
    ways.push({ kind: 'free', label: 'もらう', cost: 0, net: 0, note: '同じ分類の出品あり', isDemo: true, freeItemId: free.id });
  }

  // 並び順は「支払額」で決める。
  // ①買う前チェックは実質負担（売却額を引いた額）で判定するが、
  // 統合検索は予算に収まるかを見る機能であり、予算を縛るのは実際に出ていく金額のため。
  // 売却額は net として併記し、画面で両方見せる。
  ways.sort((a, b) => a.cost - b.cost);
  return ways;
}

/**
 * 借りるのが得でいられる上限回数を求める。
 * 「何回までなら借りたほうが安いか」は利用者がいちばん知りたい数字。
 *
 * 月額のレンタルは「使う年数」で頭打ちになるため、上限まで借りても
 * 買うより安いことがある（例：ブランドバッグ 月9,000円×12ヶ月＜中古12万円）。
 * その場合は分岐点が存在しないので Infinity を返す。
 *
 * @returns {number|null} 回数。Infinity＝その期間ならずっと借りるほうが安い。
 *                        レンタルか購入の情報が無ければ null
 */
export function rentBreakEven(product, years) {
  if (!product.rentalPrice || !product.newPrice) return null;
  // 買う側の比較対象は「中古があれば中古、無ければ新品」＝実際に選ぶであろう安いほう
  const target = product.usedPriceRate
    ? Math.round(product.newPrice * product.usedPriceRate)
    : product.newPrice;
  // 使用回数をいくら増やしても買う額を超えないなら、分岐点は存在しない
  if (rentalTotal(product, 100000, years) <= target) return Infinity;
  for (let n = 1; n <= 400; n++) {
    const t = rentalTotal(product, n, years);
    if (t === null || t > target) return n - 1;
  }
  return Infinity;
}

/**
 * 統合検索の本体。
 *
 * @param {string} query
 * @param {Object} data      {products, freeItems, activitySets}
 * @param {Object} [opts]    {budget, years}
 */
export function search(query, data, opts = {}) {
  const parsed = parseQuery(query);
  const match = matchActivity(query, data.activitySets || [], data.products || []);
  if (!match.products.length) {
    return { found: false, parsed, suggestions: suggestActivities(data.activitySets) };
  }

  const budget = opts.budget ?? parsed.budget ?? null;
  // 「始めたい」段階の相談なので、既定は「まず1年」で見る。
  // 長く続ける前提にすると、ほぼ全品目が「買う（中古）」に倒れて助言にならない。
  const years = opts.years ?? 1;
  const usesPerYear = match.set ? match.set.typicalUsesPerYear : 3;
  const uses = Math.max(1, Math.round(usesPerYear * years));

  const rows = match.products.map(item => {
    const p = item.product;
    const ways = compareWays(p, uses, years, data.freeItems || []);
    const buy = ways.find(w => w.kind === 'buy');

    // 厳守事項11：無料品データは現状すべてサンプルなので、
    // 「もらう＝0円」を最安として推奨してはいけない。
    // 選択肢としては見せるが、おすすめと合計金額は実データのみで組む。
    const realWays = ways.filter(w => !w.isDemo);
    const best = realWays[0] || null;
    const freeChance = ways.find(w => w.isDemo) || null;

    return {
      product: p,
      essential: item.essential,
      priority: item.priority,
      // 新品価格が分からない品目（レンタル専用など）は節約額を出さない
      buyCost: buy ? buy.cost : null,
      best,
      freeChance,
      ways: realWays,
      demoWays: freeChance ? [freeChance] : [],
      saving: buy && best ? buy.cost - best.cost : null,
      rentBreakEvenUses: rentBreakEven(p, years)
    };
  });

  // 節約額は「新品価格が分かっている品目」だけで比べる。
  // 価格不明の品目を片方だけに足すと、最安のほうが高く見えてしまう。
  const priced = rows.filter(r => r.buyCost !== null);
  const buyAll = priced.reduce((s, r) => s + r.buyCost, 0);
  const bestAll = priced.reduce((s, r) => s + (r.best ? r.best.cost : 0), 0);
  const bestAllTotal = rows.reduce((s, r) => s + (r.best ? r.best.cost : 0), 0);

  return {
    found: true,
    parsed,
    activity: match.set,
    // 'all' = 必要なものを全部そろえる／'any' = この中から選ぶ（大掃除・楽器など）
    selection: match.set ? (match.set.selection || 'all') : 'all',
    matchedBy: match.matchedBy,
    uses, years, usesPerYear,
    budget,
    rows,
    buyAll,
    bestAll,
    bestAllTotal,
    totalSaving: buyAll - bestAll,
    unpricedCount: rows.length - priced.length,
    // サンプルデータ上「もらえるかもしれない」品目数。金額には含めない
    freeChanceCount: rows.filter(r => r.freeChance).length,
    plan: buildPlan(rows, budget)
  };
}

/**
 * 予算内に収まる組み合わせを作る。
 *
 * 必須が予算に入らない場合は、任意の品目で予算を埋めない。
 * 「テントは買えないがBBQコンロなら買える」という提案は、
 * キャンプを始めたい人にとって無意味なため。
 */
function buildPlan(rows, budget) {
  const essentials = rows.filter(r => r.essential).sort((a, b) => a.priority - b.priority);
  const optionals = rows.filter(r => !r.essential).sort((a, b) => a.priority - b.priority);
  const costOf = r => (r.best ? r.best.cost : 0);

  const essentialTotal = essentials.reduce((s, r) => s + costOf(r), 0);
  const feasible = budget === null || essentialTotal <= budget;

  if (!feasible) {
    return {
      included: [], excluded: rows, total: 0,
      withinBudget: false, feasible: false,
      missingEssential: essentials,
      essentialTotal,
      shortage: essentialTotal - budget
    };
  }

  const included = [...essentials], excluded = [];
  let total = essentialTotal;
  for (const r of optionals) {
    if (budget === null || total + costOf(r) <= budget) { included.push(r); total += costOf(r); }
    else excluded.push(r);
  }
  return {
    included, excluded, total,
    withinBudget: true, feasible: true,
    missingEssential: [], essentialTotal, shortage: 0
  };
}

/** 入力に合うものが無かったときに出す候補 */
export function suggestActivities(sets = [], n = 6) {
  return sets.slice(0, n).map(s => ({ id: s.id, name: s.name, example: s.keywords[0] }));
}
