#!/usr/bin/env node
'use strict';
/**
 * EC配送ドライバー求人 10件（大阪・正社員・月給42〜62万円・夜間帯配送中心）／第3弾
 * 既存25件（osaka 10件＋osaka2 15件）と重複しない大阪市の残り10区。
 * 画像（ec-haisou-driver.jpg）に合わせた内容。
 * 求人ボックス専用掲載（targetMedia: ['kyujinbox']）
 * 実行: node --experimental-sqlite scripts/seed-ec-haisou-osaka3-kyujinbox.js
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
const IMAGE_URL    = '/images/ec-haisou-driver.jpg';

// 既存25件と重複しない大阪市の残り10区
const AREAS = [
  {
    area: '大阪市福島区（福島・野田）', city: '大阪府大阪市福島区',
    note: '福島・野田エリアのECセンターから出発。梅田近接の都心コンパクトエリアで夜間帯の効率配送を実現。',
  },
  {
    area: '大阪市此花区（西九条・伝法）', city: '大阪府大阪市此花区',
    note: '西九条・伝法エリアのEC物流拠点。湾岸エリアの住宅・事業所を夜間帯コンパクト配送します。',
  },
  {
    area: '大阪市西区（西本町・新町）', city: '大阪府大阪市西区',
    note: '西本町・新町エリアの都心EC配送。受け取り率が高く再配達が少ない好エリアです。',
  },
  {
    area: '大阪市港区（弁天町・市岡）', city: '大阪府大阪市港区',
    note: '弁天町・市岡エリア発の夜間帯ルート配送。コンパクトな配送エリアで効率よく回れます。',
  },
  {
    area: '大阪市大正区（三軒家・鶴町）', city: '大阪府大阪市大正区',
    note: '三軒家・鶴町エリアの物流拠点。落ち着いた住宅地中心で夜間帯の定期配送を担当します。',
  },
  {
    area: '大阪市浪速区（難波・日本橋）', city: '大阪府大阪市浪速区',
    note: '難波・日本橋エリアの都市型ECセンター。ミナミ周辺のコンパクトルートを夜間帯配送します。',
  },
  {
    area: '大阪市西淀川区（御幣島・佃）', city: '大阪府大阪市西淀川区',
    note: '御幣島・佃エリアのEC物流センター。阪神沿線の住宅地を夜間帯に安定配送します。',
  },
  {
    area: '大阪市東住吉区（駒川・田辺）', city: '大阪府大阪市東住吉区',
    note: '駒川・田辺エリア発のルート配送。定期顧客の構築で収入アップも見込める好エリアです。',
  },
  {
    area: '大阪市住之江区（住之江・粉浜）', city: '大阪府大阪市住之江区',
    note: '住之江・粉浜エリアのEC配送拠点。南港・住宅地を夜間帯コンパクトに配送します。',
  },
  {
    area: '大阪市中央区（本町・谷町）', city: '大阪府大阪市中央区',
    note: '本町・谷町エリアの都心ECセンター。ビジネス街と住宅の混在エリアを夜間帯配送します。',
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
  console.log(`\n🚀 EC配送求人（大阪・第3弾 求人ボックス専用）${JOBS.length}件 の登録を開始します...\n`);

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
