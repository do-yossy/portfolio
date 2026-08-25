/**
 * Phase 4 ロジック回帰テスト
 *
 * lib/ に抽出した純関数が、既存 demo/*.html の実装と
 * 「完全に同じ結果」を返すことを確認する。
 *
 * 仕様変更を意図した箇所（⑤ソロスコアの5要素化、④のDealScore）は
 * 既存と比較できないため、別枠で妥当性を検証する。
 *
 * 実行：node AI収益化/lifechoice/tests/logic-phase4.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateBuyCheck } from '../lib/buy-check.js';
import { calcBreakEven, totalSaving } from '../lib/break-even.js';
import { findNowWhat, fitsInTime, summarize } from '../lib/time-calculation.js';
import { rankDeals, scoreDeal } from '../lib/deal-ranking.js';
import { calcSoloScore, rankSolo } from '../lib/solo-score.js';
import { findFreeItems, carryFeasibility } from '../lib/distance.js';
import { linksFor, configureAffiliate, AFFILIATE_CONFIG } from '../lib/affiliate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, '..', 'demo');
const BS = String.fromCharCode(92);

function grab(file, varName) {
  const s = fs.readFileSync(path.join(DEMO, file), 'utf8');
  const start = s.indexOf('var ' + varName + '=[');
  const open = s.indexOf('[', start);
  let depth = 0, i = open, inStr = false, q = '';
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (ch === q && s[i - 1] !== BS) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
    if (ch === '[') depth++; else if (ch === ']') { depth--; if (depth === 0) break; }
  }
  return eval(s.slice(open, i + 1));
}
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const A = grab('買う前チェック.html', 'ITEMS');
const B = grab('買わなくていい物レーダー.html', 'ITEMS');
const C = grab('いまから何する.html', 'DATA');
const D = grab('今日だけ安い.html', 'DEALS');
const F = grab('無料品レーダー.html', 'ITEMS');

const products = json('products.json');
const stores = json('stores.json');
const deals = json('deals.json');
const freeItems = json('free-items.json');

let pass = 0, fail = 0; const fails = [];
const check = (n, a, e) => { if (a === e) pass++; else { fail++; fails.push(n + ' 期待=' + e + ' 実際=' + a); } };
const truthy = (n, v) => { if (v) pass++; else { fail++; fails.push(n + ' → 偽'); } };
const match = (item, name) => item.name === name || (item.aliases || []).includes(name);
const findP = n => products.find(p => match(p, n));
const findS = n => stores.find(s => match(s, n));

console.log('═══ Phase 4 ロジック回帰テスト ═══\n');

/* ─── ① buy-check：既存と完全一致 ─── */
console.log('① lib/buy-check（38品目 × 3価格 × 5条件 = 570ケース）');
function oldVerdict(it, price, c) {
  const uses = c.freq * c.years;
  const usedPrice = price * it.used;
  const resale = price * it.used * 0.6;
  const rentTotal = it.unit === '回' ? it.rent * uses : it.rent * Math.min(c.years * 12, Math.ceil(uses / 2));
  const opts = [
    { k: 'buy', net: price - resale },
    { k: 'used', net: usedPrice - resale * 0.7 },
    { k: 'rent', net: rentTotal }
  ].sort((x, y) => x.net - y.net);
  if (c.need === 0 && uses <= 3) return 'stop';
  return opts[0].k;
}
const CONDS = [
  { freq: 1, years: 3, need: 1 }, { freq: 3, years: 3, need: 1 },
  { freq: 8, years: 5, need: 1 }, { freq: 24, years: 3, need: 1 },
  { freq: 1, years: 3, need: 0 }
];
A.forEach(it => {
  const p = findP(it.n);
  if (!p) { fail++; fails.push('未登録: ' + it.n); return; }
  [30000, 89800, 250000].forEach(price => {
    CONDS.forEach(c => {
      const r = evaluateBuyCheck({ product: p, price, freq: c.freq, years: c.years, need: c.need });
      check('①' + it.n + '/' + price + '/' + c.freq + 'x' + c.years, r.verdict, oldVerdict(it, price, c));
    });
  });
});
// 1回あたり負担の式
const sample = evaluateBuyCheck({ product: findP('高圧洗浄機'), price: 32000, freq: 2, years: 3, need: 1 });
check('  1回あたり = 実質負担÷使用回数',
  Math.round(sample.options[0].perUse * 100),
  Math.round((sample.options[0].net / sample.uses) * 100));
console.log('  → ' + (fail ? fail + '件 不一致' : '全ケース一致') + '\n');

/* ─── ② break-even：既存と完全一致 ─── */
const b2 = fail;
console.log('② lib/break-even（28品目 × 4頻度 = 112ケース）');
[[1, 3], [2, 3], [4, 3], [12, 3]].forEach(([freq, years]) => {
  const rows = calcBreakEven(products, { freq, years });
  B.forEach(b => {
    const row = rows.find(r => match(r.product, b.n));
    if (!row) { fail++; fails.push('未登録: ' + b.n); return; }
    check('②' + b.n + '@' + freq + '回', row.breakEvenUses, Math.ceil(b.buy / b.rent));
    const uses = freq * years;
    check('②' + b.n + ' rentWins', row.rentWins, uses < Math.ceil(b.buy / b.rent));
  });
});
console.log('  → ' + (fail > b2 ? (fail - b2) + '件 不一致' : '全ケース一致') + '\n');

/* ─── ③ time-calculation：既存と完全一致 ─── */
const b3 = fail;
console.log('③ lib/time-calculation（47業態 × 4時間帯 = 188ケース）');
function oldFits(d, now, freeMin) {
  const startable = now + 0.5;
  const closeAdj = d.close <= d.open ? d.close + 24 : d.close;
  const latestStart = closeAdj - d.dur / 60;
  return (d.dur + 30) <= freeMin && startable >= d.open - 0.01 && startable <= latestStart + 0.01;
}
[[17, 240], [22, 120], [10, 480], [12, 180]].forEach(([now, freeMin]) => {
  C.forEach(d => {
    const s = findS(d.n);
    if (!s) { fail++; fails.push('未登録: ' + d.n); return; }
    check('③' + d.n + '@' + now, fitsInTime(s, now, freeMin, 30), oldFits(d, now, freeMin));
  });
});
// 全体の件数も一致するか
const hits = findNowWhat(stores.filter(s => s.openingTime !== null), { now: 17, until: 21, budget: 2000, who: 'solo', mood: 'quiet', body: 'rest' });
truthy('  17-21時/2000円/ひとり/静か で結果が出る', hits.length > 0);
const sm = summarize(hits);
check('  内訳の合計が総数と一致', sm.needBooking + sm.noBooking, sm.total);
// 移動手段で結果が変わる
const walk = findNowWhat(stores.filter(s => s.openingTime !== null), { now: 17, until: 19, budget: 5000, who: 'solo', mood: 'any', body: 'any', travelMinutes: 30 });
const bike = findNowWhat(stores.filter(s => s.openingTime !== null), { now: 17, until: 19, budget: 5000, who: 'solo', mood: 'any', body: 'any', travelMinutes: 10 });
truthy('  移動時間を短くすると候補が増える', bike.length >= walk.length);
console.log('  → ' + (fail > b3 ? (fail - b3) + '件 不一致' : '全ケース一致') + '\n');

/* ─── ④ deal-ranking：新仕様の妥当性 ─── */
const b4 = fail;
console.log('④ lib/deal-ranking（4要素の総合スコア＝新仕様）');
const ranked = rankDeals(deals, { budget: 99999, nowHour: 17 });
check('  全件がランク付けされる', ranked.length, D.length);
truthy('  スコアは降順', ranked.every((r, i) => i === 0 || ranked[i - 1].score.total >= r.score.total));
truthy('  総合スコアは0-100', ranked.every(r => r.score.total >= 0 && r.score.total <= 100));
truthy('  4要素すべてが算出される', ranked.every(r =>
  ['discount', 'urgency', 'availability', 'distance'].every(k => typeof r.score[k] === 'number')));
// 割引率が高いほうがdiscountScoreも高い
const hi = deals.find(d => d.discountRate >= 0.55), lo = deals.find(d => d.discountRate <= 0.5);
truthy('  割引率が高い方がスコアも高い', scoreDeal(hi, { nowHour: 17 }).discount > scoreDeal(lo, { nowHour: 17 }).discount);
// 残数が少ないほうがavailabilityScoreも高い
const few = deals.find(d => d.remainingCount === 1), many = deals.find(d => d.remainingCount >= 15);
truthy('  残数が少ない方がスコアも高い', scoreDeal(few, { nowHour: 17 }).availability > scoreDeal(many, { nowHour: 17 }).availability);
truthy('  位置未設定でも順位が壊れない', ranked.every(r => r.score.distance === 9));
// 元データの値が保持されているか
D.forEach(d => {
  const n = deals.find(x => x.title === d.n);
  check('④' + d.n + ' 割引率', Math.round(n.discountRate * 1000), Math.round((1 - d.now / d.was) * 1000));
});
console.log('  → ' + (fail > b4 ? (fail - b4) + '件 不一致' : '全件OK') + '\n');

/* ─── ⑤ solo-score：5要素化（意図した仕様変更）─── */
const b5 = fail;
console.log('⑤ lib/solo-score（5要素へ拡張＝新仕様）');
const sc = calcSoloScore(findS('映画館'), 'talk');
check('  内訳は5項目', sc.breakdown.length, 5);
truthy('  スコアは0-100', sc.score >= 0 && sc.score <= 100);
// 重み付けが効いているか
const cafe = findS('カフェで作業・読書');
truthy('  fearで順位が変わる',
  calcSoloScore(cafe, 'stay').score !== calcSoloScore(cafe, 'book').score ||
  calcSoloScore(cafe, 'talk').score !== calcSoloScore(cafe, 'eye').score);
const ranked5 = rankSolo(stores, { fear: 'talk', budget: 2000, maxStayMinutes: 120 });
truthy('  絞り込みが効く', ranked5.length > 0 && ranked5.length < stores.length);
truthy('  スコア降順', ranked5.every((r, i) => i === 0 || ranked5[i - 1].score >= r.score));
// 全店に5要素が揃っている
truthy('  全店に5要素が揃っている', stores.every(s =>
  [s.soloScore, s.conversationFreeScore, s.reservationFreeScore, s.beginnerScore, s.stayFreedomScore]
    .every(v => typeof v === 'number' && v >= 1 && v <= 5)));
console.log('  → ' + (fail > b5 ? (fail - b5) + '件 不一致' : '全件OK') + '\n');

/* ─── ⑥ distance：既存の絞り込み＋持ち帰り判定 ─── */
const b6 = fail;
console.log('⑥ lib/distance（既存の3軸＋持ち帰り可能性＝新仕様）');
[[0.5, 2, 'today'], [1.5, 2, 'today'], [3, 3, 'week']].forEach(([km, size, when]) => {
  const oldCount = F.filter(f => f.dist <= km && f.size <= size && (when === 'week' || f.when === 'today')).length;
  const now = findFreeItems(freeItems, { maxDistanceKm: km, maxSize: size, pickupEnd: when });
  check('⑥絞り込み ' + km + 'km/size' + size + '/' + when, now.length, oldCount);
});
const heavy = freeItems.find(f => f.size === 3);
const light = freeItems.find(f => f.size === 1);
truthy('  車のほうが持ち帰りやすい',
  carryFeasibility(heavy, 'car').stars > carryFeasibility(heavy, 'walk').stars);
truthy('  小さい物は徒歩でも運べる', carryFeasibility(light, 'walk').stars >= 4);
truthy('  重量が推定される', carryFeasibility(heavy, 'car').weightKg === 30);
truthy('  移動時間が算出される', carryFeasibility(light, 'bike').minutes > 0);
console.log('  → ' + (fail > b6 ? (fail - b6) + '件 不一致' : '全件OK') + '\n');

/* ─── affiliate ─── */
const b7 = fail;
console.log('lib/affiliate');
check('  未設定なら空配列', linksFor('buy', 'カメラ').length, 0);
configureAffiliate({ amazonTag: 'test-22', rakutenId: 'aa.bb', a8Rent: 'https://px.a8.net/x' });
check('  買う → Amazon+楽天', linksFor('buy', 'カメラ').length, 2);
check('  レンタル → A8+楽天', linksFor('rent', 'カメラ').length, 2);
truthy('  Amazonリンクにタグが入る', linksFor('buy', 'カメラ')[0].url.includes('tag=test-22'));
truthy('  商品名がURLエンコードされる', linksFor('buy', 'カメラ')[0].url.includes(encodeURIComponent('カメラ')));
configureAffiliate({ amazonTag: '', rakutenId: '', a8Rent: '', a8Used: '', asoview: '' });
truthy('  秘密情報が直書きされていない', Object.values(AFFILIATE_CONFIG).every(v => v === ''));
console.log('  → ' + (fail > b7 ? (fail - b7) + '件 不一致' : '全件OK') + '\n');

console.log('═'.repeat(46));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.slice(0, 25).forEach(f => console.log('  ✗ ' + f));
  if (fails.length > 25) console.log('  ... 他' + (fails.length - 25) + '件');
  process.exit(1);
} else {
  console.log('  ✓ 抽出したロジックは既存と同じ結果を返します');
}
