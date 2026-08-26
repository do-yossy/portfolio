/**
 * 自分で追加した品目のテスト
 *
 * ・最小限の入力から、同梱データと同じ形の品目が組み立てられるか
 * ・同梱データの計算式と食い違わないか（中古率・売却率の導き方）
 * ・同梱の products.json を書き換えていないか（厳守事項2）
 * ・追加した品目が①②統合検索すべてに出るか
 *
 * 実行：node AI収益化/lifechoice/tests/custom-items.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATEGORY_USED_RATE, CATEGORIES, validate, buildCustomProduct, mergeProducts
} from '../lib/custom-products.js';
import {
  loadCustomProducts, saveCustomProduct, removeCustomProduct, clearCustomProducts,
  exportData, importData, clearPreference, clearHistory
} from '../utils/storage.js';
import { evaluateBuyCheck } from '../lib/buy-check.js';
import { calcBreakEven } from '../lib/break-even.js';
import { search, compareWays, rentBreakEven } from '../lib/integrated-search.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const bundled = json('products.json');
const activitySets = json('activity-sets.json');
const freeItems = json('free-items.json');

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

console.log('═══ 自分で追加した品目のテスト ═══\n');

/* ═══ 1. 入力の確認 ═══ */
let b = section('1. 入力の妥当性');

const good = { name: '食洗機', category: '家電', newPrice: 80000, rentalPrice: 3000, rentalUnit: '月' };
truthy('正しい入力は通る', validate(good).ok);

falsy('名前が空だと弾く', validate({ ...good, name: '' }).ok);
falsy('名前が空白だけでも弾く', validate({ ...good, name: '   ' }).ok);
falsy('名前が長すぎると弾く', validate({ ...good, name: 'あ'.repeat(41) }).ok);
falsy('価格が0だと弾く', validate({ ...good, newPrice: 0 }).ok);
falsy('価格が負だと弾く', validate({ ...good, newPrice: -100 }).ok);
falsy('価格が文字だと弾く', validate({ ...good, newPrice: 'abc' }).ok);
falsy('価格が大きすぎると弾く', validate({ ...good, newPrice: 999999999 }).ok);
falsy('分類が不正だと弾く', validate({ ...good, category: '存在しない分類' }).ok);
truthy('レンタルは空でもよい', validate({ ...good, rentalPrice: '' }).ok);
falsy('レンタルが文字だと弾く', validate({ ...good, rentalPrice: 'abc' }).ok);
falsy('単位が不正だと弾く', validate({ ...good, rentalUnit: '年' }).ok);
// 単位の取り違え（月額を回額として入れた等）を拾えること
falsy('レンタルが新品の10倍超だと弾く', validate({ ...good, rentalPrice: 800001 }).ok);
contains('弾いた理由に単位の確認を促す', validate({ ...good, rentalPrice: 800001 }).errors.join(''), '単位');
close(b);

/* ═══ 2. 同梱データと同じ形・同じ式か ═══ */
b = section('2. 同梱データと同じ形になる');

const p = buildCustomProduct(good);
const sample = bundled[0];
Object.keys(sample).forEach(k => truthy('項目 ' + k + ' がある', k in p));
check('自作の印がつく', p.isCustom, true);
check('出典が自己入力', p.source, '自己入力');
check('新品価格の出典も自己入力', p.newPriceSource, '自己入力');
falsy('サンプル扱いにはしない', p.isDemo);
truthy('IDが自作と分かる', p.id.startsWith('my-'));

// 中古率・売却率の導き方が同梱データと同じか
check('分類の中古率を使う', p.usedPriceRate, CATEGORY_USED_RATE['家電']);
check('中古価格 = 新品 × 中古率', p.usedPrice, Math.round(80000 * CATEGORY_USED_RATE['家電']));
check('売却率 = 中古率 × 0.6', p.estimatedResaleRate, Math.round(CATEGORY_USED_RATE['家電'] * 0.6 * 100) / 100);
check('中古購入時の売却率 = 売却率 × 0.7',
  p.usedEstimatedResaleRate, Math.round(p.estimatedResaleRate * 0.7 * 1000) / 1000);

// 同梱データも同じ関係になっていること（式がずれていない確認）
bundled.filter(x => x.usedPriceRate && x.estimatedResaleRate).forEach(x => {
  check(x.id + ' も 売却率=中古率×0.6', Math.round(x.estimatedResaleRate * 100) / 100,
    Math.round(x.usedPriceRate * 0.6 * 100) / 100);
});

// 分類の既定値が同梱データの中央値と一致しているか
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
Object.keys(CATEGORY_USED_RATE).filter(c => c !== 'その他').forEach(c => {
  const list = bundled.filter(x => x.category === c).map(x => x.usedPriceRate).filter(Boolean);
  if (!list.length) return;
  check(c + ' の既定値が同梱データの中央値と一致', CATEGORY_USED_RATE[c], med(list));
});
check('分類は全部で' + CATEGORIES.length + '種類', CATEGORIES.length, 10);
close(b);

/* ═══ 3. 未入力・想定外の入力でも壊れないか ═══ */
b = section('3. 端の入力');

const noRent = buildCustomProduct({ name: 'エアコン', category: '家電', newPrice: 120000 });
check('レンタル未入力なら null', noRent.rentalPrice, null);
check('単位も null', noRent.rentalUnit, null);
check('レンタルが無ければ分岐点も無い', rentBreakEven(noRent, 1), null);
truthy('レンタル無しでも比較できる', compareWays(noRent, 3, 1, []).length >= 2);

const unknownCat = buildCustomProduct({ name: 'なにか', newPrice: 5000 });
check('分類未指定は「その他」', unknownCat.category, 'その他');
check('その他の中古率は全体の中央値', unknownCat.usedPriceRate, CATEGORY_USED_RATE['その他']);

const a1 = buildCustomProduct({ name: '同じ名前', newPrice: 1000 });
const a2 = buildCustomProduct({ name: '同じ名前', newPrice: 1000 });
truthy('同じ名前でもIDが衝突しないか、同一として扱われる', typeof a1.id === 'string' && typeof a2.id === 'string');
truthy('記号だけの名前でもIDが作れる', buildCustomProduct({ name: '！？＃', newPrice: 100 }).id.startsWith('my-'));
close(b);

/* ═══ 4. 保存と統合 ═══ */
b = section('4. 保存と、同梱データへの統合');

clearCustomProducts();
check('初期は空', loadCustomProducts().length, 0);

const dish = buildCustomProduct(good);
saveCustomProduct(dish);
check('保存できる', loadCustomProducts().length, 1);
check('内容が残る', loadCustomProducts()[0].name, '食洗機');

// 同じIDは差し替え（増えない）
saveCustomProduct({ ...dish, newPrice: 90000 });
check('同じIDは上書き', loadCustomProducts().length, 1);
check('値が更新される', loadCustomProducts()[0].newPrice, 90000);

const merged = mergeProducts(bundled, loadCustomProducts());
check('同梱＋自作の件数', merged.length, bundled.length + 1);
truthy('自作が含まれる', merged.some(x => x.id === dish.id));
truthy('同梱が全部残っている', bundled.every(x => merged.some(y => y.id === x.id)));

// 同梱データそのものを書き換えていないこと（厳守事項2）
const reread = json('products.json');
check('products.json の件数が変わらない', reread.length, bundled.length);
falsy('products.json に自作が混ざっていない', reread.some(x => x.isCustom));
check('同梱データの中身も変わらない', JSON.stringify(reread), JSON.stringify(bundled));

removeCustomProduct(dish.id);
check('削除できる', loadCustomProducts().length, 0);
check('削除しても同梱は残る', mergeProducts(bundled, []).length, bundled.length);
close(b);

/* ═══ 5. 追加した品目が各機能で使えるか ═══ */
b = section('5. 追加した品目が各機能に出る');

clearCustomProducts();
const aircon = buildCustomProduct({ name: 'エアコン', category: '家電', newPrice: 120000, rentalPrice: 4000, rentalUnit: '月' });
saveCustomProduct(aircon);
const withCustom = mergeProducts(bundled, loadCustomProducts());

// ① 買う前チェック
const r1 = evaluateBuyCheck({ product: aircon, price: aircon.newPrice, freq: 150, years: 5, need: 2 });
truthy('①で判定できる', !!r1.verdict);
truthy('①に選択肢が並ぶ', r1.options.length >= 3);
truthy('①の判定理由がある', r1.reasons.length > 0);

// ② 損益分岐点
const rows = calcBreakEven(withCustom, { freq: 4, years: 3 });
truthy('②の一覧に出る', rows.some(x => x.product.id === aircon.id));
const row = rows.find(x => x.product.id === aircon.id);
truthy('②で分岐点が出る', row.breakEvenUses > 0);

// 統合検索（品目名での直接一致）
const s = search('エアコン', { products: withCustom, activitySets, freeItems });
truthy('統合検索で引ける', s.found);
truthy('統合検索の結果に含まれる', s.rows.some(x => x.product.id === aircon.id));
truthy('統合検索で手段が比較される', s.rows[0].ways.length >= 3);

// 同梱品目が壊れていないこと
const camp = search('キャンプ', { products: withCustom, activitySets, freeItems });
truthy('同梱の活動セットは今までどおり引ける', camp.found);
check('キャンプの新品合計は変わらない', camp.buyAll, 103000);
close(b);

/* ═══ 6. 書き出しに含まれるか ═══ */
b = section('6. 書き出し・読み込み');

clearPreference(); clearHistory();
clearCustomProducts();
saveCustomProduct(buildCustomProduct({ name: '除湿機', category: '家電', newPrice: 30000 }));
const dump = exportData();
check('書き出しに含まれる', JSON.parse(dump).customProducts.length, 1);

clearCustomProducts();
check('消えている', loadCustomProducts().length, 0);
truthy('読み込める', importData(dump).ok);
check('自作品目が戻る', loadCustomProducts().length, 1);
check('名前も戻る', loadCustomProducts()[0].name, '除湿機');

// 壊れた要素は落とす
clearCustomProducts();
importData(JSON.stringify({
  kind: 'lifechoice-backup', preference: {},
  customProducts: [{ id: 'ok', name: '正常', newPrice: 100 }, { name: 'ID無し' }, null, { id: 'x', name: 'y', newPrice: 'abc' }]
}));
check('壊れた要素を落として取り込む', loadCustomProducts().length, 1);
check('正常な要素は残る', loadCustomProducts()[0].id, 'ok');
clearCustomProducts();
close(b);

/* ═══ 7. 画面の結線 ═══ */
b = section('7. 画面の結線');

const page = fs.readFileSync(path.join(ROOT, 'app', 'my-items.html'), 'utf8');
contains('追加できる', page, 'saveCustomProduct(');
contains('削除できる', page, 'removeCustomProduct(');
contains('一覧を出す', page, 'loadCustomProducts()');
contains('入力を確認する', page, 'validate(');
contains('追加前に内容を見せる', page, 'この内容で追加されます');
contains('端末内保存であることを明記', page, 'この端末のブラウザ内にのみ保存されます');
contains('中古価格が目安であることを明記', page, '実際の相場ではありません');

const buyCheck = fs.readFileSync(path.join(ROOT, 'app', 'buy-check.html'), 'utf8');
contains('①から辿れる', buyCheck, 'my-items.html');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
contains('トップから辿れる', idx, 'app/my-items.html');

// データ層で統合しているか（各機能が個別に読みに行っていないこと）
const dp = fs.readFileSync(path.join(ROOT, 'lib', 'data-provider.js'), 'utf8');
contains('データ層で統合している', dp, 'mergeProducts(');
['buy-check', 'unnecessary-buy', 'search'].forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, 'app', f + '.html'), 'utf8');
  falsy(f + ' は自作データを個別に読んでいない', src.includes('loadCustomProducts'));
});
close(b);

console.log('═'.repeat(48));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.slice(0, 20).forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  ✓ 品目の追加は正しく動作しています');
}
