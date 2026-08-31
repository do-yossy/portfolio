/**
 * 検索流入用ページのテスト
 *
 * ・59ページが生成され、リンクが全て繋がっているか
 * ・数値がアプリ側の計算結果と一致するか（別々に計算していないか）
 * ・JS無しで内容が読めるか（検索エンジン向け）
 * ・推定価格をあたかも確定値のように書いていないか（厳守事項11）
 *
 * 実行：node AI収益化/lifechoice/tests/guide-phase6.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { search, rentBreakEven } from '../lib/integrated-search.js';
import { newPriceSource } from '../utils/format.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = path.join(ROOT, 'guide');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const products = json('products.json');
const activitySets = json('activity-sets.json');
const data = { products, activitySets, freeItems: json('free-items.json') };

let pass = 0, fail = 0;
const fails = [];
const check = (name, a, e) => { if (a === e) pass++; else { fail++; fails.push(name + '\n     期待: ' + e + '\n     実際: ' + a); } };
const truthy = (name, v) => { if (v) pass++; else { fail++; fails.push(name + ' → 偽'); } };
const falsy = (name, v) => { if (!v) pass++; else { fail++; fails.push(name + ' → 真であってはならない'); } };
const contains = (name, hay, needle) => {
  if (String(hay).includes(needle)) pass++; else { fail++; fails.push(name + ' に "' + needle + '" が無い'); }
};
const section = t => { console.log('── ' + t); return fail; };
const close = b => console.log('  → ' + (fail > b ? (fail - b) + '件 失敗' : '全件OK') + '\n');
const yen = n => Math.round(n).toLocaleString('ja-JP') + '円';
const read = f => fs.readFileSync(path.join(GUIDE, f), 'utf8');

console.log('═══ 検索流入用ページのテスト ═══\n');

/* ═══ 1. 生成物が揃っているか ═══ */
let b = section('1. ページが揃っている');

truthy('guide/ が存在する', fs.existsSync(GUIDE));
const files = fs.readdirSync(GUIDE).filter(f => f.endsWith('.html'));
check('ページ数', files.length, 1 + products.length + activitySets.length);
truthy('ハブがある', fs.existsSync(path.join(GUIDE, 'index.html')));
products.forEach(p => truthy(p.id + ' の品目ページがある', fs.existsSync(path.join(GUIDE, 'item-' + p.id + '.html'))));
activitySets.forEach(s => truthy(s.id + ' の分野ページがある', fs.existsSync(path.join(GUIDE, 'start-' + s.id + '.html'))));
truthy('sitemap断片がある', fs.existsSync(path.join(GUIDE, 'sitemap-fragment.xml')));
close(b);

/* ═══ 2. 検索エンジン向けの体裁 ═══ */
b = section('2. 検索エンジンが読める体裁になっている');

files.forEach(f => {
  const s = read(f);
  truthy(f + ' にtitleがある', /<title>[^<]{10,}<\/title>/.test(s));
  truthy(f + ' にdescriptionがある', /name="description" content="[^"]{30,}"/.test(s));
  truthy(f + ' にh1が1つある', (s.match(/<h1/g) || []).length === 1);
  truthy(f + ' にパンくずがある', s.includes('g-crumb'));
  // JSを実行しなくても本文が読めること（アプリ側と方針が違う）
  falsy(f + ' はJS描画に依存していない', s.includes('type="module"'));
  truthy(f + ' に本文が十分ある', s.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length > 400);
  truthy(f + ' にアプリへの導線がある', s.includes('../app/'));
});
close(b);

/* ═══ 3. 数値がアプリの計算と一致するか ═══ */
b = section('3. 数値がアプリ側の計算結果と一致する');

activitySets.forEach(set => {
  const r = search(set.name, data, { years: 1 });
  if (!r.found) return;
  const s = read('start-' + set.id + '.html');
  contains(set.id + ' の新品合計', s, yen(r.buyAll));
  contains(set.id + ' の最安合計', s, yen(r.bestAll));
  contains(set.id + ' の差額', s, yen(r.totalSaving));
  // 品目ごとの推奨も一致しているか
  r.rows.forEach(x => contains(set.id + '/' + x.product.id + ' の推奨額', s, yen(x.best.cost)));
});

products.forEach(p => {
  const s = read('item-' + p.id + '.html');
  contains(p.id + ' の新品価格', s, yen(p.newPrice));
  if (p.usedPrice) contains(p.id + ' の中古価格', s, yen(p.usedPrice));
  const be = rentBreakEven(p, 1);
  if (be !== null && be !== Infinity && be >= 1) contains(p.id + ' の分岐点', s, be + '回まで');
  if (be === Infinity) contains(p.id + ' は分岐点なしと書かれている', s, '何回使っても借りるほうが安く');
});
close(b);

/* ═══ 4. 厳守事項11：推定を確定値のように書いていない ═══ */
b = section('4. 推定値であることを明示している');

products.forEach(p => {
  const s = read('item-' + p.id + '.html');
  if (newPriceSource(p) === '推定') {
    contains(p.id + ' は推定と明示', s, '市場の中位帯からの推定');
  } else {
    contains(p.id + ' は確認済みと明示', s, '実勢価格を確認済み');
  }
  if (p.usedPrice) contains(p.id + ' の中古は推定と明示', s, '相場からの推定');
});
files.forEach(f => {
  const s = read(f);
  contains(f + ' に価格の注意書きがある', s, '価格は調査時点の目安です');
  contains(f + ' に中古価格の注意書きがある', s, '実際の出品価格ではありません');
});

// サンプルデータ（無料品・値引き）をガイドに持ち込んでいないこと
files.forEach(f => {
  const s = read(f);
  falsy(f + ' にサンプルの無料品が混ざっていない', s.includes('もらう') || s.includes('無料品レーダー'));
});
close(b);

/* ═══ 5. リンクが全て繋がっているか ═══ */
b = section('5. リンク切れが無い');

files.forEach(f => {
  const s = read(f);
  const hrefs = [...s.matchAll(/href="([^"#]+)"/g)].map(m => m[1]);
  hrefs.filter(h => !h.startsWith('http') && !h.startsWith('data:')).forEach(h => {
    const target = path.resolve(GUIDE, h);
    if (fs.existsSync(target)) pass++;
    else { fail++; fails.push(f + ' → ' + h + ' が存在しない'); }
  });
});

// 品目ページと分野ページが相互に繋がっているか
activitySets.forEach(set => {
  const s = read('start-' + set.id + '.html');
  set.items.forEach(i => contains(set.id + ' から ' + i.productId + ' へリンク', s, 'item-' + i.productId + '.html'));
});
products.forEach(p => {
  const related = activitySets.filter(s => s.items.some(i => i.productId === p.id));
  if (!related.length) return;
  const s = read('item-' + p.id + '.html');
  related.forEach(r => contains(p.id + ' から ' + r.id + ' へリンク', s, 'start-' + r.id + '.html'));
});

// ハブから全ページへ辿れるか
const hub = read('index.html');
products.forEach(p => contains('ハブから ' + p.id + ' へ', hub, 'item-' + p.id + '.html'));
activitySets.forEach(s => contains('ハブから ' + s.id + ' へ', hub, 'start-' + s.id + '.html'));
close(b);

/* ═══ 6. 文言が不自然になっていないか ═══ */
b = section('6. 文言');

activitySets.forEach(s => {
  truthy(s.id + ' に短縮名がある', !!s.shortName);
  const page = read('start-' + s.id + '.html');
  // 「キャンプを始めたいに必要な」のような連結を防ぐ。
  // 短縮名が元の名前と同じ分野（DIY・庭の手入れ等）はそのままで自然なので対象外。
  if (s.shortName !== s.name) {
    falsy(s.id + ' に不自然な連結が無い', page.includes(s.name + 'に必要な'));
  }
  // 「結婚式を始める」のような言い回しを防ぐ
  falsy(s.id + ' に「を始めるのに必要」が無い', page.includes('を始めるのに必要'));
});
files.forEach(f => falsy(f + ' に文字化けが無い', /[가-힣]/.test(read(f))));
close(b);

/* ═══ 7. sitemap 断片 ═══ */
b = section('7. sitemap断片');
const frag = fs.readFileSync(path.join(GUIDE, 'sitemap-fragment.xml'), 'utf8');
check('URL数がページ数と一致', (frag.match(/<loc>/g) || []).length, files.length);
truthy('絶対URLになっている', frag.includes('https://'));
close(b);

console.log('═'.repeat(48));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.slice(0, 25).forEach(f => console.log('  ✗ ' + f));
  if (fails.length > 25) console.log('  … ほか ' + (fails.length - 25) + '件');
  process.exit(1);
} else {
  console.log('  ✓ 検索流入用ページは正しく生成されています');
}
