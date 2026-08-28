/**
 * 画面側のテスト（購入価格の質問まわり）
 * 実行：node 家にあるお金/tests/page.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsTier, PRICE_TIERS, estimateOne } from '../lib/estimate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0; const fails = [];
const truthy = (n, v) => { if (v) pass++; else { fail++; fails.push(n + ' → 偽'); } };
const contains = (n, h, x) => { if (String(h).includes(x)) pass++; else { fail++; fails.push(n + ' に "' + x + '" が無い'); } };
const check = (n, a, e) => { if (a === e) pass++; else { fail++; fails.push(n + ' 期待:' + e + ' 実際:' + a); } };

console.log('═══ 画面のテスト ═══\n');

contains('購入価格を聞いている', page, 'PRICE_TIERS');
contains('質問文がある', page, '買ったときの値段');
contains('その場で金額を出す', page, 'data-live');
contains('点数は折りたたむ', page, '複数ある場合はこちら');
contains('未回答なら絞れないと伝える', page, 'もっと絞れます');
check('価格の段階は4つ', PRICE_TIERS.length, 4);

// 幅が縮むこと
let narrowed = 0, before = 0, after = 0;
items.filter(needsTier).forEach(i => {
  const full = estimateOne(i, { condition: 'good', quantity: 1 });
  const t1 = estimateOne(i, { condition: 'good', quantity: 1, tier: 1 });
  truthy(i.id + ' 段階を選ぶと幅が縮む', (t1.high / t1.low) < (full.high / full.low));
  truthy(i.id + ' 段階を選んでも範囲内', t1.low >= full.low * 0.99 && t1.high <= full.high * 1.01);
  narrowed++; before += full.high / full.low; after += t1.high / t1.low;
});
console.log('  幅の平均: ' + (before / narrowed).toFixed(1) + '倍 → ' + (after / narrowed).toFixed(1) + '倍');
truthy('平均で1/3以下に縮む', after / narrowed < (before / narrowed) / 3);

// 段階が上がるほど高くなる
const watch = items.find(i => i.name.includes('腕時計'));
const tiers = PRICE_TIERS.map(t => estimateOne(watch, { condition: 'good', quantity: 1, tier: t.value }));
truthy('段階が上がるほど高い', tiers.every((x, i) => i === 0 || tiers[i - 1].mid < x.mid));

// 未回答でも落ちない
truthy('段階未回答でも動く', estimateOne(watch, { condition: 'good' }).low > 0);
truthy('不正な段階でも動く', estimateOne(watch, { tier: 99 }).low > 0);
truthy('負の段階でも動く', estimateOne(watch, { tier: -5 }).low > 0);

console.log('\n' + '═'.repeat(46));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) { fails.slice(0, 10).forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('  ✓ 画面と絞り込みは正しく動作しています');
