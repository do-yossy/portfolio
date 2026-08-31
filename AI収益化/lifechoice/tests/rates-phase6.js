/**
 * アフィリエイト料率のテスト
 *
 * docs/料率とAPIの実確認.md で確認した公式の値どおりに計算されるか。
 * とくに「美容家電を5%で置くと売上想定が2.5倍ずれる」点を回帰として固定する。
 *
 * 実行：node AI収益化/lifechoice/tests/rates-phase6.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AMAZON_RATE, RAKUTEN_CAP, amazonBucket, amazonReward,
  rakutenReward, bestShop, rewardFor, rentReward
} from '../lib/affiliate-rates.js';
import { search } from '../lib/integrated-search.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const products = json('products.json');
const data = { products, freeItems: json('free-items.json'), activitySets: json('activity-sets.json') };
const find = id => products.find(p => p.id === id);

let pass = 0, fail = 0;
const fails = [];
const check = (name, a, e) => { if (a === e) pass++; else { fail++; fails.push(name + '\n     期待: ' + e + '\n     実際: ' + a); } };
const truthy = (name, v) => { if (v) pass++; else { fail++; fails.push(name + ' → 偽'); } };
const section = t => { console.log('── ' + t); return fail; };
const close = b => console.log('  → ' + (fail > b ? (fail - b) + '件 失敗' : '全件OK') + '\n');

console.log('═══ アフィリエイト料率テスト ═══\n');

/* ═══ 1. 確認済みの料率どおりか ═══ */
let b = section('1. Amazonの料率（公式・確認済み）');
check('カメラ・PC・家電', AMAZON_RATE['カメラ・PC・家電'], 0.02);
check('スポーツ・ベビー・工具', AMAZON_RATE['スポーツ・ベビー・工具'], 0.04);
check('ドラッグストア・ビューティー', AMAZON_RATE['ドラッグストア・ビューティー'], 0.05);
check('ファッション・シューズ・バッグ', AMAZON_RATE['ファッション・シューズ・バッグ'], 0.08);
check('その他', AMAZON_RATE['その他'], 0.02);
close(b);

/* ═══ 2. 品目の区分けが正しいか ═══ */
b = section('2. 品目ごとの料率区分');

// ⚠ もっとも間違えやすい箇所。美容家電は「ビューティー5%」ではなく「家電2%」
check('美容家電は家電扱い（5%ではない）', amazonBucket(find('beauty-appliance')), 'カメラ・PC・家電');
check('美容家電の料率は2%', AMAZON_RATE[amazonBucket(find('beauty-appliance'))], 0.02);
check('美容家電5万円の報酬', amazonReward(find('beauty-appliance'), 50000), 1000);
truthy('5%で置くと2.5倍ずれる（誤りの再現）', 50000 * 0.05 === amazonReward(find('beauty-appliance'), 50000) * 2.5);

check('カメラは2%', amazonBucket(find('mirrorless-camera')), 'カメラ・PC・家電');
check('礼服はファッション8%', amazonBucket(find('formal-wear')), 'ファッション・シューズ・バッグ');
check('振袖はファッション8%', amazonBucket(find('furisode')), 'ファッション・シューズ・バッグ');
check('スーツケースはバッグ8%', amazonBucket(find('suitcase-large')), 'ファッション・シューズ・バッグ');
check('ベビーカーはベビー4%', amazonBucket(find('stroller')), 'スポーツ・ベビー・工具');
check('電動工具は工具4%', amazonBucket(find('power-tool')), 'スポーツ・ベビー・工具');
check('自転車はスポーツ扱い（趣味カテゴリだが上書き）', amazonBucket(find('bicycle')), 'スポーツ・ベビー・工具');
check('ロードバイクもスポーツ扱い', amazonBucket(find('road-bike')), 'スポーツ・ベビー・工具');
check('ギターはその他2%', amazonBucket(find('guitar')), 'その他');

// 全品目が既知の区分に落ちること
products.forEach(p => truthy(p.id + ' の区分が定義済み', AMAZON_RATE[amazonBucket(p)] !== undefined));
close(b);

/* ═══ 3. 紹介料の上限 ═══ */
b = section('3. 上限の扱い');

// Amazonの上限1,000円は2024年8月7日に廃止済み → 高額品は満額入る
check('Amazonは上限なし（10万円のカメラで2,000円）', amazonReward(find('mirrorless-camera'), 100000), 2000);
truthy('Amazonは1,000円を超えられる', amazonReward(find('mirrorless-camera'), 100000) > 1000);

// 楽天は1商品1,000円が上限
check('楽天の上限は1,000円', RAKUTEN_CAP, 1000);
check('楽天10万円は上限で頭打ち', rakutenReward(100000), 1000);
check('楽天1万円は料率どおり', rakutenReward(10000), 300);

// 高額品はAmazonが有利
check('10万円のカメラはAmazonが有利', bestShop(find('mirrorless-camera'), 100000).shop, 'amazon');
check('1万円のカメラは楽天が有利', bestShop(find('mirrorless-camera'), 10000).shop, 'rakuten');
close(b);

/* ═══ 4. 推奨から報酬を出せるか ═══ */
b = section('4. 推奨内容と報酬の対応');

check('買うはAmazon/楽天へ', rewardFor(find('formal-wear'), { kind: 'buy', cost: 45000 }).channel, 'Amazon');
check('中古は専門店へ（個人間フリマは収益にならないため）',
  rewardFor(find('formal-wear'), { kind: 'used', cost: 13500 }).channel, '中古専門店');
check('借りるはレンタルへ', rewardFor(find('formal-wear'), { kind: 'rent', cost: 5000 }).channel, 'レンタル');
check('もらうは収益なし', rewardFor(find('formal-wear'), { kind: 'free', cost: 0 }).reward, 0);

// 未確認の料率にはその印がついていること
truthy('買うの料率は確認済み', rewardFor(find('formal-wear'), { kind: 'buy', cost: 45000 }).verified);
truthy('中古の料率は未確認', !rewardFor(find('formal-wear'), { kind: 'used', cost: 13500 }).verified);
truthy('レンタルの料率は未確認', !rewardFor(find('formal-wear'), { kind: 'rent', cost: 5000 }).verified);
close(b);

/* ═══ 5. 事業構造：どの導線に依存しているか ═══ */
b = section('5. 収益がどの導線に依存しているか');

let buy = 0, used = 0, rent = 0;
data.activitySets.forEach(set => {
  const r = search(set.name, data, { years: 1 });
  const plan = r.plan.feasible ? r.plan.included : r.rows;
  plan.forEach(x => {
    if (!x.best) return;
    if (x.best.kind === 'buy') buy += x.best.cost;
    else if (x.best.kind === 'used') used += x.best.cost;
    else if (x.best.kind === 'rent') rent += x.best.cost;
  });
});
const total = buy + used + rent;

// この事業は構造的に中古へ流れる。Amazonの料率がいくら有利でも新品購入は推奨されない。
console.log('     買う ' + Math.round(buy / total * 100) + '%／中古 ' + Math.round(used / total * 100) +
  '%／借りる ' + Math.round(rent / total * 100) + '%');
truthy('中古が取引額の大半を占める（構造的な事実）', used / total > 0.8);
check('新品購入は推奨されない（中古のほうが必ず安いため）', buy, 0);
truthy('レンタルは1割程度', rent / total > 0.05 && rent / total < 0.3);
close(b);

console.log('═'.repeat(48));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  ✓ 料率は確認済みの値どおりに計算されています');
}
