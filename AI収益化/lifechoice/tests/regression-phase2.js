/**
 * Phase 2 回帰テスト
 *
 * 目的：data/*.json が既存6HTMLと「完全に同じ計算結果」を再現できることを確認する。
 * 1件でもズレたら失敗として報告する。
 *
 * 実行：node AI収益化/lifechoice/tests/regression-phase2.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(__dirname, '..', '..', 'demo');
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
const E = grab('ソロマップ.html', 'P');
const D = grab('今日だけ安い.html', 'DEALS');
const F = grab('無料品レーダー.html', 'ITEMS');

const products = json('products.json');
const stores = json('stores.json');
const deals = json('deals.json');
const freeItems = json('free-items.json');

let pass = 0, fail = 0;
const fails = [];
function check(name, actual, expected) {
  if (actual === expected) { pass++; return; }
  fail++; fails.push(name + ': 期待=' + expected + ' 実際=' + actual);
}

const norm = s => s.replace(/[（(].*?[）)]/g, '').replace(/[・\s]/g, '').trim();
const match = (item, name) => item.name === name || (item.aliases||[]).includes(name);
const findP = name => products.find(p => match(p, name));
const findS = name => stores.find(s => match(s, name));

console.log('═══ Phase 2 回帰テスト ═══\n');

/* ── ① 買う前チェック：全38品目 × 4条件 で判定結果を照合 ── */
console.log('① 買う前チェックの判定（38品目 × 4条件 = 152ケース）');
const CONDS = [
  { freq: 1, years: 3, need: 1 },
  { freq: 3, years: 3, need: 1 },
  { freq: 24, years: 3, need: 1 },
  { freq: 1, years: 3, need: 0 }
];

function verdictOld(it, price, c) {
  const uses = c.freq * c.years;
  const usedPrice = price * it.used;
  const resale = price * it.used * 0.6;
  const rentTotal = it.unit === '回' ? it.rent * uses : it.rent * Math.min(c.years * 12, Math.ceil(uses / 2));
  const buyNet = price - resale;
  const usedNet = usedPrice - (resale * 0.7);
  const opts = [
    { k: 'buy', net: buyNet }, { k: 'used', net: usedNet }, { k: 'rent', net: rentTotal }
  ].sort((x, y) => x.net - y.net);
  if (c.need === 0 && uses <= 3) return 'stop';
  return opts[0].k;
}
function verdictNew(p, price, c) {
  const uses = c.freq * c.years;
  const usedPrice = price * p.usedPriceRate;
  const resale = price * p.estimatedResaleRate;                 // = price × used × 0.6
  const usedResale = price * p.usedEstimatedResaleRate;         // = price × used × 0.6 × 0.7
  const rentTotal = p.rentalUnit === '回' ? p.rentalPrice * uses
                                          : p.rentalPrice * Math.min(c.years * 12, Math.ceil(uses / 2));
  const opts = [
    { k: 'buy', net: price - resale },
    { k: 'used', net: usedPrice - usedResale },
    { k: 'rent', net: rentTotal }
  ].sort((x, y) => x.net - y.net);
  if (c.need === 0 && uses <= 3) return 'stop';
  return opts[0].k;
}

A.forEach(it => {
  const p = findP(it.n);
  if (!p) { fail++; fails.push('Product未登録: ' + it.n); return; }
  [50000, 89800, 180000].forEach(price => {
    CONDS.forEach(c => {
      check('①' + it.n + '/' + price + '/' + c.freq + 'x' + c.years + (c.need === 0 ? '/欲しいだけ' : ''),
        verdictNew(p, price, c), verdictOld(it, price, c));
    });
  });
});
console.log('  → ' + (fail ? fail + '件 不一致' : '全ケース一致') + '\n');

/* ── ② 損益分岐点：全28品目 ── */
const before = fail;
console.log('② 損益分岐点（28品目）');
B.forEach(b => {
  const p = findP(b.n);
  if (!p) { fail++; fails.push('Product未登録: ' + b.n); return; }
  const oldBp = Math.ceil(b.buy / b.rent);
  const newBp = Math.ceil(p.newPrice / p.rentalPrice);
  check('②' + b.n + ' 損益分岐', newBp, oldBp);
});
console.log('  → ' + (fail > before ? (fail - before) + '件 不一致' : '全件一致') + '\n');

/* ── ③ 時間の逆算：全47業態 × 3時間帯 ── */
const before3 = fail;
console.log('③ 時間の逆算（47業態 × 3時間帯 = 141ケース）');
function fitsOld(d, now, freeMin) {
  const startable = now + 0.5;
  const closeAdj = d.close <= d.open ? d.close + 24 : d.close;
  const latestStart = closeAdj - (d.dur / 60);
  return ((d.dur + 30) <= freeMin) && startable >= d.open - 0.01 && startable <= latestStart + 0.01;
}
function fitsNew(s, now, freeMin) {
  const startable = now + 0.5;
  const closeAdj = s.closingTime <= s.openingTime ? s.closingTime + 24 : s.closingTime;
  const latestStart = closeAdj - (s.estimatedStayMinutes / 60);
  return ((s.estimatedStayMinutes + 30) <= freeMin) && startable >= s.openingTime - 0.01 && startable <= latestStart + 0.01;
}
[[17, 240], [22, 120], [10, 480]].forEach(([now, freeMin]) => {
  C.forEach(d => {
    const s = findS(d.n);
    if (!s) { fail++; fails.push('Store未登録: ' + d.n); return; }
    check('③' + d.n + '@' + now + 'h', fitsNew(s, now, freeMin), fitsOld(d, now, freeMin));
  });
});
console.log('  → ' + (fail > before3 ? (fail - before3) + '件 不一致' : '全ケース一致') + '\n');

/* ── ④ 割引率：全15件 ── */
const before4 = fail;
console.log('④ 割引率（15件）');
D.forEach(d => {
  const n = deals.find(x => x.title === d.n);
  if (!n) { fail++; fails.push('Deal未登録: ' + d.n); return; }
  check('④' + d.n + ' 割引率', Math.round(n.discountRate * 100), Math.round((1 - d.now / d.was) * 100));
  check('④' + d.n + ' 残数', n.remainingCount, d.left);
  check('④' + d.n + ' 締切', n.deadlineHour, d.close);
});
console.log('  → ' + (fail > before4 ? (fail - before4) + '件 不一致' : '全件一致') + '\n');

/* ── ⑤ ソロスコア：⑤の18件が元の値を保持しているか ── */
const before5 = fail;
console.log('⑤ ソロスコア（18件の3項目 = 54ケース）');
E.forEach(e => {
  const s = findS(e.n);
  if (!s) { fail++; fails.push('Store未登録: ' + e.n); return; }
  check('⑤' + e.n + ' solo', s.soloScore, e.solo);
  check('⑤' + e.n + ' quiet', s.conversationFreeScore, e.quiet);
  check('⑤' + e.n + ' nobook', s.reservationFreeScore, e.nobook);
});
console.log('  → ' + (fail > before5 ? (fail - before5) + '件 不一致' : '全件一致') + '\n');

/* ── ⑥ 無料品：全14件 ── */
const before6 = fail;
console.log('⑥ 無料品（14件）');
F.forEach(f => {
  const n = freeItems.find(x => x.title === f.n);
  if (!n) { fail++; fails.push('FreeItem未登録: ' + f.n); return; }
  check('⑥' + f.n + ' 距離', n.distanceKm, f.dist);
  check('⑥' + f.n + ' サイズ', n.size, f.size);
  check('⑥' + f.n + ' 受取', n.pickupEnd, f.when);
});
console.log('  → ' + (fail > before6 ? (fail - before6) + '件 不一致' : '全件一致') + '\n');

/* ── データ件数の保全 ── */
console.log('データ件数の保全');
check('Product件数（①38+②28→統合）', products.length, 38);
check('Store件数（③47件に⑤18件を全統合）', stores.length, 47);
check('Deal件数', deals.length, D.length);
check('FreeItem件数', freeItems.length, F.length);
check('全Dealにデモ印', deals.every(d => d.isDemo), true);
check('全FreeItemにデモ印', freeItems.every(f => f.isDemo), true);
check('新2スコアの付与漏れなし', stores.every(s => s.beginnerScore >= 1 && s.stayFreedomScore >= 1), true);
console.log('');

console.log('═'.repeat(46));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【不一致の詳細】');
  fails.slice(0, 30).forEach(f => console.log('  ✗ ' + f));
  if (fails.length > 30) console.log('  ... 他' + (fails.length - 30) + '件');
  process.exit(1);
} else {
  console.log('  ✓ 既存の計算結果を完全に再現できています');
}
