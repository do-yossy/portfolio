#!/usr/bin/env node
'use strict';
/**
 * 倉庫内作業求人 10件（全国・正社員・月収28万円以上）
 * Google しごと検索専用掲載（targetMedia: ['google']）
 * 実行: node --experimental-sqlite scripts/seed-souko-28man-google.js
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
const TARGET_MEDIA = ['google'];
const JOB_TYPE     = '軽作業・物流';
const EMP_TYPE     = '正社員';

const AREAS = [
  {
    area: '北海道札幌市（白石区）', city: '北海道札幌市',
    shift: '9:00〜18:00', vol: '600〜900坪',
    note: '道内最大級の物流拠点。冬場も室内作業のため快適に働けます。',
  },
  {
    area: '宮城県仙台市（宮城野区）', city: '宮城県仙台市',
    shift: '8:30〜17:30', vol: '500〜800坪',
    note: '東北最大の流通ハブ倉庫。ルーティンワーク中心で覚えやすい環境です。',
  },
  {
    area: '茨城県つくば市（研究学園）', city: '茨城県つくば市',
    shift: '9:00〜18:00', vol: '700〜1000坪',
    note: '大型EC倉庫での仕分け・ピッキング。新設施設で設備が充実しています。',
  },
  {
    area: '栃木県宇都宮市（インターパーク）', city: '栃木県宇都宮市',
    shift: '8:00〜17:00', vol: '600〜900坪',
    note: '高速IC近くの大型倉庫。荷物の搬入出・仕分けがメイン業務です。',
  },
  {
    area: '群馬県前橋市（問屋町）', city: '群馬県前橋市',
    shift: '8:30〜17:30', vol: '500〜800坪',
    note: '食品・日用品の入出荷管理。マニュアル完備で未経験でも安心です。',
  },
  {
    area: '新潟県新潟市（東区）', city: '新潟県新潟市',
    shift: '9:00〜18:00', vol: '500〜750坪',
    note: '日本海側最大の物流拠点。安定した在庫量でコンスタントに作業できます。',
  },
  {
    area: '石川県金沢市（金沢港）', city: '石川県金沢市',
    shift: '8:00〜17:00', vol: '500〜750坪',
    note: '北陸エリアの配送拠点。冷暖房完備の快適な倉庫環境です。',
  },
  {
    area: '静岡県浜松市（東区）', city: '静岡県浜松市',
    shift: '8:30〜17:30', vol: '600〜900坪',
    note: '製造業が盛んな浜松エリアの部品・製品倉庫。丁寧な研修があります。',
  },
  {
    area: '愛媛県松山市（南吉田）', city: '愛媛県松山市',
    shift: '9:00〜18:00', vol: '400〜700坪',
    note: '四国最大都市の物流拠点倉庫。チームワークを大切にした職場環境です。',
  },
  {
    area: '鹿児島県鹿児島市（鹿児島港）', city: '鹿児島県鹿児島市',
    shift: '8:30〜17:30', vol: '400〜700坪',
    note: '九州南部の物流拠点。地元密着型の安定した倉庫作業です。',
  },
];

function makeFaq({ area, vol }) {
  return [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。入社後にOJTで丁寧に指導します。マニュアルが整備されているので安心してスタートできます。',
    },
    {
      q: '体力的にきつくないですか？',
      a: '重量物はフォークリフトや台車を使うため、体への負担を最小限に抑えています。立ち仕事はありますが、無理のないペースで働ける職場です。',
    },
    {
      q: '倉庫の広さはどのくらいですか？',
      a: `${area}の倉庫は${vol}規模です。冷暖房完備で、夏冬も快適に作業できる環境です。`,
    },
    {
      q: '月収28万円以上は保証されますか？',
      a: '基本給28万円を保証した上で、皆勤手当・技能手当が加算されます。経験・スキルに応じて昇給もあります。',
    },
    {
      q: '社会保険はありますか？',
      a: '健康保険・厚生年金・雇用保険・労災保険の各種社会保険が完備されています。正社員として安心して働ける環境です。',
    },
  ];
}

function makeJob(item) {
  const { area, city, shift, note } = item;
  const salaryMin = 280000;
  const salaryMax = 360000;
  const salaryStr = `月給${(salaryMin/10000).toFixed(0)}万円〜${(salaryMax/10000).toFixed(0)}万円（各種手当込・試用期間3ヶ月／同条件）`;
  return {
    title:     `【${area}】倉庫内作業スタッフ｜正社員｜未経験歓迎｜月収28万円以上`,
    location:  city,
    salary:    salaryStr,
    jobType:   JOB_TYPE,
    catchcopy: `倉庫内ピッキング・仕分けスタッフ正社員募集｜月収28万円以上｜社保完備`,
    description: `${city}（${area}）で倉庫内作業スタッフの正社員を募集します。${note}

【仕事内容】
倉庫内でのピッキング・仕分け・梱包・入出荷管理業務全般をお任せします。
フォークリフトや専用スキャナーを使用し、効率よく作業を進めます。
研修制度が整っており、未経験の方でも安心してスタートできます。

【こんな方に向いています】
・コツコツ丁寧に作業することが得意な方
・安定した正社員雇用を求めている方
・未経験から物流・倉庫業界に挑戦したい方
・体を動かしながら働きたい方

【労働時間】
${shift}（実働8時間）
残業：月平均10時間以内（繁忙期除く）

【休日・休暇】
週休2日制（シフト制・希望休あり）
年間休日105日以上
有給休暇10日〜（勤続年数に応じて増加）

【給与内訳】
基本給 ${(salaryMin/10000).toFixed(0)}万円
＋皆勤手当 5,000円
＋技能手当 5,000円〜（スキル・経験に応じて）
試用期間3ヶ月（期間中も給与・待遇は同条件）

【福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与
昇給あり（年1回査定）
フォークリフト免許取得支援あり

【入社後の流れ】
1週目：社内ルール・安全研修・設備説明
2〜4週目：先輩スタッフによるOJT
5週目以降：担当エリアを独立して作業開始`,
    tags: [
      '未経験歓迎',
      '正社員',
      '倉庫内作業',
      'ピッキング',
      '仕分け',
      '社会保険完備',
      '昇給あり',
      '安定収入',
      '土日休み',
      '月収28万円以上',
    ],
    faq: makeFaq(item),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 倉庫内作業求人（全国 Googleしごと検索専用）${JOBS.length}件 の登録を開始します...\n`);

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
        imageUrl:       '',
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
