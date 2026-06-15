#!/usr/bin/env node
'use strict';
/**
 * EC配送ドライバー求人 5件（大阪府内・正社員・月給42〜62万円・夜間帯配送中心）／第4弾
 * 既存35件と重複しない大阪府内の5市。画像（ec-haisou-driver.jpg）付き。
 * 求人ボックス専用掲載（targetMedia: ['kyujinbox']）
 * 実行: node --experimental-sqlite scripts/seed-ec-haisou-osaka4-kyujinbox.js
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

const COMPANY      = 'sq';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['kyujinbox'];
const JOB_TYPE     = '配送・ドライバー';
const EMP_TYPE     = '正社員';
const IMAGE_URL    = '/images/ec-haisou-driver.jpg';

// 既存35件と重複しない大阪府内の5市
const AREAS = [
  {
    area: '大阪府高槻市（高槻・富田）', city: '大阪府高槻市',
    note: '高槻・富田エリアのECセンターから出発。北摂の住宅地を夜間帯にコンパクト配送します。',
  },
  {
    area: '大阪府枚方市（枚方・樟葉）', city: '大阪府枚方市',
    note: '枚方・樟葉エリアのEC物流拠点。京阪沿線の住宅地で受け取り率の高い好エリアです。',
  },
  {
    area: '大阪府岸和田市（岸和田・春木）', city: '大阪府岸和田市',
    note: '岸和田・春木エリア発の夜間帯ルート配送。泉州エリアで定期顧客の構築も見込めます。',
  },
  {
    area: '大阪府池田市（池田・石橋）', city: '大阪府池田市',
    note: '池田・石橋エリアのEC配送センター。落ち着いた住宅地を夜間帯コンパクトに配送します。',
  },
  {
    area: '大阪府和泉市（和泉中央・光明池）', city: '大阪府和泉市',
    note: '和泉中央・光明池エリアの物流拠点。新興住宅地中心で効率よく夜間帯配送できます。',
  },
];

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

function makeJob(item) {
  const { area, city, note } = item;
  return {
    title:     `【${area}】高時給エリア配送ドライバー｜正社員｜月給42万円〜62万円｜未経験歓迎`,
    location:  city,
    salary:    '月給42万円〜62万円（各種手当込・試用期間3ヶ月／同条件）',
    jobType:   JOB_TYPE,
    catchcopy: `高時給エリア配送ドライバー正社員募集｜月給42万〜62万円｜夜間帯配送中心｜${area}`,
    description: `${city}（${area}）で高時給エリアEC配送ドライバーの正社員を募集します。${note}

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
11:00〜20:00（調整可能）
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
4週目以降：担当ルートを独立して配送開始`,
    tags: [
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
    ],
    faq: makeFaq(),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 EC配送求人（大阪・第4弾 求人ボックス専用）${JOBS.length}件 の登録を開始します...\n`);

  const existing       = await Jobs.findAll();
  const existingTitles = new Set(existing.map(j => j.title));

  let added = 0, skipped = 0;

  for (const job of JOBS) {
    if (existingTitles.has(job.title)) {
      console.log(`  ⏭️  スキップ（既存）: ${job.title}`);
      skipped++;
      continue;
    }
    try {
      await Jobs.create({
        title:          job.title,
        location:       job.location,
        salary:         job.salary,
        jobType:        job.jobType,
        employmentType: EMP_TYPE,
        description:    job.description,
        tags:           job.tags,
        catchcopy:      job.catchcopy,
        imageUrl:       IMAGE_URL,
        faq:            job.faq,
        isPublished:    true,
        publishedAt:    NOW,
        targetMedia:    TARGET_MEDIA,
        company:        COMPANY,
      });
      console.log(`  ✅ 登録完了: ${job.title}`);
      added++;
    } catch (err) {
      console.error(`  ❌ 登録失敗: ${job.title}\n     ${err.message}`);
    }
  }

  console.log(`\n📊 結果: 登録 ${added}件 / スキップ ${skipped}件 / 合計 ${JOBS.length}件`);
  if (added > 0) console.log('\n✅ 完了！管理画面 /admin/jobs で確認してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
