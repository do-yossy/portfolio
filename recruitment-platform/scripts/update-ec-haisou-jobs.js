#!/usr/bin/env node
'use strict';
/**
 * 既存のEC配送ドライバー求人を新しい内容（月給42〜62万円・夜間帯配送中心）に一括更新。
 * 実行: node --experimental-sqlite scripts/update-ec-haisou-jobs.js
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs } = require('../db-factory');

const IMAGE_URL = '/images/ec-haisou-driver.jpg';
const SALARY    = '月給42万円〜62万円（各種手当込・試用期間3ヶ月／同条件）';
const SHIFT     = '11:00〜20:00（調整可能）';

function makeFaq() {
  return [
    {
      q: '普通自動車免許（AT限定）でも応募できますか？',
      a: 'はい、AT限定免許でも応募できます。使用車両はAT車が中心ですので安心してお問い合わせください。',
    },
    {
      q: '配送件数はどれくらいですか？',
      a: '1日60〜80件が目安です。コンパクトエリアを担当するため効率よく回れます。慣れるまでは先輩ドライバーがサポートします。',
    },
    {
      q: '夜間配送が中心とのことですが、開始時間は何時ですか？',
      a: '稼働時間は11時〜20時が基本で、ピークとなる夜間帯配送（17時〜21時）を中心に担当していただきます。昼間の時間を有効活用できる働き方です。',
    },
    {
      q: '月給42万円〜62万円とありますが、62万円はどのような条件ですか？',
      a: '基本給42万円＋皆勤手当・役職手当・深夜手当の加算で62万円以上を実現できます。稼働実績・経験に応じて昇給もあります。',
    },
    {
      q: '社会保険はありますか？',
      a: '健康保険・厚生年金・雇用保険・労災保険の各種社会保険が完備されています。正社員として安定した働き方ができます。',
    },
  ];
}

function makeDescription(city, area) {
  return `${city}（${area}）で高時給エリアEC配送ドライバーの正社員を募集します。都心エリアでの効率配送で高収入を実現できる環境です。

【特徴・ポイント】
◆ 夜間帯配送（17時〜21時）が中心！昼間の時間を有効活用
◆ コンパクトエリアで1日60〜80件の効率的な配送
◆ 再配達が少なく、受け取り率が高い◎
◆ 定期顧客の構築で収入アップも可能！
◆ 専用アプリで配送管理（簡単操作）

【仕事内容】
大手ECサイト・通販商品を担当エリアの個人宅・企業へお届けする配送業務です。
コンパクトエリアを担当するため、道を覚えやすく効率よく稼働できます。
荷物の仕分け・積み込みから配送まで一連の業務をお任せします。

【こんな方に向いています】
・普通自動車免許（AT可）をお持ちの方
・体を動かす仕事が好きな方
・夜間帯にしっかり稼ぎたい方
・未経験からドライバーを始めたい方
・アプリ・スマホ操作に慣れている方

【労働時間】
${SHIFT}
夜間配送ピーク：17時〜21時
実働8時間
残業：月平均15時間以内（繁忙期除く）

【休日・休暇】
週休2日制（シフト制）
年間休日105日以上
有給休暇10日〜（勤続年数に応じて増加）

【給与内訳】
基本給 42万円
＋皆勤手当 5,000円
＋役職手当 5,000円〜（経験・実績に応じて）
＋深夜手当（22時以降の稼働分）
頑張り次第で月給62万円以上も可能！
試用期間3ヶ月（期間中も給与・待遇は同条件）

【福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）／車通勤OK・駐車場完備
制服・安全靴貸与
ドライブレコーダー搭載車両
車両保険完備
昇給あり（年1回査定）

【入社後の流れ】
1週目：社内ルール・安全運転研修・専用アプリ操作説明
2〜3週目：先輩ドライバーによる同乗研修
4週目以降：担当ルートを独立して配送開始`;
}

const TAGS = [
  '未経験歓迎',
  '正社員',
  'EC配送',
  '配送・ドライバー',
  '夜間配送',
  '高収入',
  '社会保険完備',
  '普通免許OK',
  '月給42万円以上',
  '大阪',
];

async function main() {
  const all = await Jobs.findAll();
  const targets = all.filter(j =>
    j.title && (
      j.title.includes('EC配送ドライバー') ||
      j.title.includes('高時給エリア配送ドライバー')
    ) && j.company === 'sq'
  );

  console.log(`\n🔄 EC配送ドライバー求人 更新対象: ${targets.length}件\n`);

  let updated = 0;
  for (const job of targets) {
    // 【エリア】部分を取得
    const areaMatch = job.title.match(/^【(.+?)】/);
    const area = areaMatch ? areaMatch[1] : job.location;
    const city = job.location || area;

    const newTitle     = `【${area}】高時給エリア配送ドライバー｜正社員｜月給42万円〜62万円｜未経験歓迎`;
    const newCatchcopy = `高時給エリア配送ドライバー正社員募集｜月給42万〜62万円｜夜間帯配送中心｜${area}`;

    try {
      await Jobs.update(job.id, {
        title:       newTitle,
        salary:      SALARY,
        catchcopy:   newCatchcopy,
        description: makeDescription(city, area),
        imageUrl:    IMAGE_URL,
        tags:        TAGS,
        faq:         makeFaq(),
      });
      console.log(`  ✅ 更新完了: ${newTitle}`);
      updated++;
    } catch (err) {
      console.error(`  ❌ 更新失敗: ${job.title}\n     ${err.message}`);
    }
  }

  console.log(`\n📊 結果: ${updated}件 更新 / ${targets.length - updated}件 失敗`);
  if (updated > 0) console.log('\n✅ 完了！管理画面 /admin/jobs で確認してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
