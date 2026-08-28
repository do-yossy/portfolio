/**
 * 「家にあるお金」のテスト
 *
 * ・査定の計算が破綻しないか（個数を増やしても非現実的な額にならないか）
 * ・金額を確定値のように見せていないか
 * ・忘れられやすい高額品を先に聞く設計になっているか
 *
 * 実行：node 家にあるお金/tests/estimate.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONDITIONS, QUANTITIES, estimateOne, estimateAll,
  byPlace, sellOrder, shareText, askOrder, yen
} from '../lib/estimate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const items = json('items.json');
const places = json('places.json');

let pass = 0, fail = 0;
const fails = [];
const check = (n, a, e) => { if (a === e) pass++; else { fail++; fails.push(n + '\n     期待: ' + e + '\n     実際: ' + a); } };
const truthy = (n, v) => { if (v) pass++; else { fail++; fails.push(n + ' → 偽'); } };
const falsy = (n, v) => { if (!v) pass++; else { fail++; fails.push(n + ' → 真であってはならない'); } };
const contains = (n, h, x) => { if (String(h).includes(x)) pass++; else { fail++; fails.push(n + ' に "' + x + '" が無い'); } };
const section = t => { console.log('── ' + t); return fail; };
const close = b => console.log('  → ' + (fail > b ? (fail - b) + '件 失敗' : '全件OK') + '\n');

console.log('═══ 家にあるお金 テスト ═══\n');

/* ═══ 1. データ ═══ */
let b = section('1. データの健全性');

check('場所は7つ', places.length, 7);
truthy('品目がある', items.length >= 40);
const ids = new Set();
items.forEach(i => {
  falsy('idが重複していない: ' + i.id, ids.has(i.id)); ids.add(i.id);
  truthy(i.id + ' に名前がある', !!i.name);
  truthy(i.id + ' の場所が実在する', places.some(p => p.id === i.place));
  truthy(i.id + ' の下限が正', i.estLow > 0);
  truthy(i.id + ' は下限 < 上限', i.estLow < i.estHigh);
  truthy(i.id + ' に理由の一言がある', !!i.note);
  check(i.id + ' の出どころは推定', i.source, '推定');
  truthy(i.id + ' の forgettable が真偽値', typeof i.forgettable === 'boolean');
});
places.forEach(p => {
  truthy(p.id + ' に品目がある', items.some(i => i.place === p.id));
  truthy(p.id + ' に探し方の案内がある', !!p.hint);
});
close(b);

/* ═══ 2. 1品目の計算 ═══ */
b = section('2. 1品目の見込み額');

const bag = items.find(i => i.name === 'ブランドバッグ');
const e1 = estimateOne(bag, { condition: 'good', quantity: 1 });
check('きれい・1点の下限', e1.low, Math.round(bag.estLow * 0.55));
check('きれい・1点の上限', e1.high, Math.round(bag.estHigh * 0.80));
truthy('下限 < 上限', e1.low < e1.high);
truthy('中央値が間に入る', e1.mid >= e1.low && e1.mid <= e1.high);

// 状態が悪いほど下がる
const order = ['new', 'good', 'used', 'bad'].map(c => estimateOne(bag, { condition: c, quantity: 1 }));
truthy('状態が悪いほど下がる', order.every((x, i) => i === 0 || order[i - 1].mid > x.mid));

// 個数は平方根で伸ばす（線形だと非現実的な額になる）
const q1 = estimateOne(bag, { condition: 'good', quantity: 1 });
const q12 = estimateOne(bag, { condition: 'good', quantity: 12 });
truthy('点数が増えれば上がる', q12.mid > q1.mid);
truthy('12点でも12倍にはならない', q12.mid < q1.mid * 12);
truthy('12点で3〜4倍程度', q12.mid > q1.mid * 3 && q12.mid < q1.mid * 4);

// 端の入力
truthy('個数0でも落ちない', estimateOne(bag, { quantity: 0 }).low > 0);
truthy('個数未指定でも落ちない', estimateOne(bag, {}).low > 0);
truthy('状態が不正でも落ちない', estimateOne(bag, { condition: 'xxx' }).low > 0);
truthy('入力なしでも落ちない', estimateOne(bag).low > 0);
close(b);

/* ═══ 3. 合計 ═══ */
b = section('3. 合計と並び順');

const sel = {};
items.slice(0, 8).forEach(i => { sel[i.id] = { condition: 'good', quantity: 1 }; });
const r = estimateAll(items, sel);
check('件数', r.count, 8);
truthy('合計の下限 < 上限', r.low < r.high);
check('合計は各行の和', r.low, r.rows.reduce((s, x) => s + x.low, 0));
truthy('金額の大きい順', r.rows.every((x, i) => i === 0 || r.rows[i - 1].mid >= x.mid));

check('選択なしなら0件', estimateAll(items, {}).count, 0);
check('選択なしなら合計0', estimateAll(items, {}).low, 0);
check('nullでも落ちない', estimateAll(items, null).count, 0);
check('存在しないidは無視', estimateAll(items, { zzz: { condition: 'good' } }).count, 0);

// 場所ごとの小計
const bp = byPlace(r, places);
truthy('場所ごとに分かれる', bp.length > 0);
check('場所の小計の和 = 全体', bp.reduce((s, x) => s + x.mid, 0), r.mid);
truthy('小計も大きい順', bp.every((x, i) => i === 0 || bp[i - 1].mid >= x.mid));
truthy('0件の場所は出さない', bp.every(x => x.count > 0));
close(b);

/* ═══ 4. 売る順番 ═══ */
b = section('4. まず何から売るか');

const many = {};
items.forEach(i => { many[i.id] = { condition: 'good', quantity: i.name.includes('漫画') ? 12 : 1 }; });
const rAll = estimateAll(items, many);
const so = sellOrder(rAll, 5);
check('5件返す', so.length, 5);
truthy('1点あたりが大きいものが上位',
  so[0].mid / (so[0].input.quantity || 1) >= so[4].mid / (so[4].input.quantity || 1));
truthy('全部選んでも落ちない', rAll.count === items.length);
close(b);

/* ═══ 5. 共有文 ═══ */
b = section('5. 共有用の文章');

const t = shareText(r);
contains('合計が入る', t, yen(r.low));
contains('最高額の品目名が入る', t, r.rows[0].item.name);
contains('点数が入る', t, String(r.count));
check('0件なら空', shareText(estimateAll(items, {})), '');
// 数字が先頭に来ること（人に言いたくなる形）
truthy('1行目に金額がある', /[0-9,]+円/.test(t.split('\n')[0]));
close(b);

/* ═══ 6. 聞く順番（設計の要） ═══ */
b = section('6. 忘れられやすい高額品を先に聞く');

places.forEach(p => {
  const asked = askOrder(items, p.id);
  check(p.id + ' の件数', asked.length, items.filter(i => i.place === p.id).length);
  // forgettable が先に来る
  const firstNonForget = asked.findIndex(x => !x.forgettable);
  const lastForget = asked.map(x => x.forgettable).lastIndexOf(true);
  truthy(p.id + '：忘れやすい物が先', firstNonForget === -1 || lastForget < firstNonForget);
  // 同じ印の中では高額が先
  const forget = asked.filter(x => x.forgettable);
  truthy(p.id + '：印の中で高額が先', forget.every((x, i) => i === 0 || forget[i - 1].estHigh >= x.estHigh));
});
close(b);

/* ═══ 7. 金額を断定していないか ═══ */
b = section('7. 推定であることの明示');

const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
contains('推定と明記', page, 'すべて推定');
contains('保証しないと明記', page, '保証するものではありません');
contains('端末内保存であることを明記', page, 'どこにも送信されません');
contains('古物営業の注意', page, '古物営業');
contains('業者を推奨していないと明記', page, '特定の業者を推奨していません');
// 断定表現が無いこと
falsy('「必ず」と言っていない', /必ず[0-9]/.test(page));
falsy('「確実に売れます」と言っていない', page.includes('確実に売れ'));
// 常に幅で出しているか
items.forEach(i => truthy(i.id + ' は幅で持っている', i.estLow !== i.estHigh));
close(b);

console.log('═'.repeat(46));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.slice(0, 20).forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  ✓ 査定の計算と表示は正しく動作しています');
}
