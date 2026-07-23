#!/usr/bin/env node
'use strict';
/**
 * EC配送ドライバー求人 10件（大阪・正社員・月給42〜62万円・夜間帯配送中心）
 * 求人ボックス専用掲載（targetMedia: ['kyujinbox']）
 * 実行: node --experimental-sqlite scripts/seed-ec-haisou-osaka-kyujinbox.js
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
const vary = require('./lib/kyujinbox-vary');

const COMPANY      = 'sq';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['kyujinbox'];
const JOB_TYPE     = '配送・ドライバー';
const EMP_TYPE     = '正社員';

// Google掲載済みエリアと重複しない大阪エリア10か所
const AREAS = [
  {
    area: '大阪市北区（梅田・天満）',   city: '大阪府大阪市北区',
    note: '梅田・天満エリアのECセンターから出発。都心コンパクトエリアで夜間帯の効率配送を実現。',
  },
  {
    area: '大阪市城東区（鴫野・今福）', city: '大阪府大阪市城東区',
    note: '鴫野・今福エリアのEC物流拠点。大阪市東部の住宅地を中心に夜間ルート配送です。',
  },
  {
    area: '大阪市住吉区（我孫子・墨江）', city: '大阪府大阪市住吉区',
    note: '我孫子・墨江エリア発の夜間帯ルート配送。受け取り率が高く再配達が少ない好エリアです。',
  },
  {
    area: '大阪市生野区（桃谷・今里）', city: '大阪府大阪市生野区',
    note: '桃谷・今里エリアのコンパクト配送。定期顧客構築で安定収入アップが見込めます。',
  },
  {
    area: '大阪市旭区（千林・森小路）', city: '大阪府大阪市旭区',
    note: '千林・森小路エリアのEC配送センター。夜間帯の効率配送で大阪市北東ルートを担当します。',
  },
  {
    area: '守口市（守口・土居）',       city: '大阪府守口市',
    note: '守口・土居エリアの大型ECセンター。京阪沿線の夜間帯配送ルートを担当します。',
  },
  {
    area: '門真市（門真・古川橋）',     city: '大阪府門真市',
    note: '門真・古川橋エリア出発の夜間帯ルート配送。住宅地中心で受け取り率◎の好エリアです。',
  },
  {
    area: '摂津市（正雀・鳥飼）',       city: '大阪府摂津市',
    note: '正雀・鳥飼エリアの物流センター。大阪・京都・神戸の中間の好アクセス夜間配送拠点。',
  },
  {
    area: '豊中市（庄内・豊南）',       city: '大阪府豊中市',
    note: '庄内・豊南エリアのEC配送拠点。豊中市内の住宅地を中心に1日60〜80件担当します。',
  },
  {
    area: '吹田市（吹田・千里丘）',     city: '大阪府吹田市',
    note: '吹田・千里丘エリアのEC物流センター。千里ニュータウン周辺の夜間帯配送を担当します。',
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
  return {
    ...vary.buildEc(item),
    location:  item.city,
    salary:    '月給42万円〜62万円（各種手当込・試用期間3ヶ月／同条件）',
    jobType:   JOB_TYPE,
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
  console.log(`\n🚀 EC配送求人（大阪 求人ボックス専用）${JOBS.length}件 の登録を開始します...\n`);

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
        imageUrl:       '/images/ec-haisou-driver.jpg',
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
