#!/usr/bin/env node
'use strict';
/**
 * EC配送ドライバー求人 10件（大阪・正社員・月収38万円以上）
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

const COMPANY      = 'sq';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['kyujinbox'];
const JOB_TYPE     = '配送・ドライバー';
const EMP_TYPE     = '正社員';

// Google掲載済みエリアと重複しない大阪エリア10か所
const AREAS = [
  {
    area: '大阪市北区（梅田・天満）',   city: '大阪府大阪市北区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 450000,
    note: '梅田・天満エリアのECセンターから出発。都心部の幹線道路を熟知したドライバー大歓迎。',
  },
  {
    area: '大阪市城東区（鴫野・今福）', city: '大阪府大阪市城東区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 450000,
    note: '鴫野・今福エリアのEC物流拠点。大阪市東部の住宅地を中心に安定したルート配送です。',
  },
  {
    area: '大阪市住吉区（我孫子・墨江）', city: '大阪府大阪市住吉区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 450000,
    note: '我孫子・墨江エリア発のルート配送。大阪南部の住宅エリアを担当します。',
  },
  {
    area: '大阪市生野区（桃谷・今里）', city: '大阪府大阪市生野区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 455000,
    note: '桃谷・今里エリアを担当するECドライバー。地域密着型の配送業務です。',
  },
  {
    area: '大阪市旭区（千林・森小路）', city: '大阪府大阪市旭区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 450000,
    note: '千林・森小路エリアのEC配送センター。大阪市北東エリアのルートを担当します。',
  },
  {
    area: '守口市（守口・土居）',       city: '大阪府守口市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 455000,
    note: '守口・土居エリアの大型ECセンター。京阪沿線エリアへの安定配送ルートを担当します。',
  },
  {
    area: '門真市（門真・古川橋）',     city: '大阪府門真市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 455000,
    note: '門真・古川橋エリア出発のルート配送。閑静な住宅地が中心で働きやすい環境です。',
  },
  {
    area: '摂津市（正雀・鳥飼）',       city: '大阪府摂津市',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 455000,
    note: '正雀・鳥飼エリアの物流センター。大阪・京都・神戸の中間に位置する好アクセス拠点。',
  },
  {
    area: '豊中市（庄内・豊南）',       city: '大阪府豊中市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '庄内・豊南エリアのEC配送拠点。豊中市内の住宅地を中心に1日40〜60件を担当します。',
  },
  {
    area: '吹田市（吹田・千里丘）',     city: '大阪府吹田市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '吹田・千里丘エリアのEC物流センター。千里ニュータウン周辺の住宅地を安定配送します。',
  },
];

function makeFaq({ area }) {
  return [
    {
      q: '普通自動車免許（AT限定）でも応募できますか？',
      a: 'はい、AT限定免許でも応募できます。使用車両はAT車が中心ですので安心してお問い合わせください。',
    },
    {
      q: '配送件数はどれくらいですか？',
      a: '1日40〜70件が目安です。慣れるまでは先輩ドライバーがサポートしますので安心してスタートできます。',
    },
    {
      q: '重い荷物の取り扱いはありますか？',
      a: 'ECの商品が中心のため、家電・日用品・衣料品などが多く、重量物は少なめです。台車・台付きカートを使用するので体への負担も軽減されています。',
    },
    {
      q: '月収38万円以上は保証されますか？',
      a: '基本給38万円＋皆勤手当・役職手当が加算されます。試用期間中（3ヶ月）も同条件です。経験・実績に応じて昇給もあります。',
    },
    {
      q: '社会保険はありますか？',
      a: '健康保険・厚生年金・雇用保険・労災保険の各種社会保険が完備されています。正社員として安定した働き方ができます。',
    },
  ];
}

function makeJob(item) {
  const { area, city, shift, salaryMin, salaryMax, note } = item;
  const min = parseInt(salaryMin);
  const max = parseInt(salaryMax);
  const salaryStr = `月給${(min/10000).toFixed(0)}万円〜${(max/10000).toFixed(0)}万円（各種手当込・試用期間3ヶ月／同条件）`;
  return {
    title:     `【${area}】EC配送ドライバー｜正社員｜月収38万円以上｜未経験歓迎`,
    location:  city,
    salary:    salaryStr,
    jobType:   JOB_TYPE,
    catchcopy: `EC配送ドライバー正社員募集｜月収38万円以上｜社会保険完備｜${area}`,
    description: `${city}（${area}）でEC配送ドライバーの正社員を募集します。${note}

【仕事内容】
大手ECサイトの荷物を担当エリアの個人宅・企業へお届けする配送業務です。
ルートは毎日固定に近く、地域に慣れればスムーズに作業できます。
荷物の仕分け・積み込みから配送まで一連の業務をお任せします。

【こんな方に向いています】
・普通自動車免許（AT可）をお持ちの方
・体を動かす仕事が好きな方
・毎日同じルートで安定して働きたい方
・ドライバーデビューを考えている方

【労働時間】
${shift}（実働8時間）
残業：月平均15時間以内（繁忙期除く）

【休日・休暇】
週休2日制（シフト制）
年間休日105日以上
有給休暇10日〜（勤続年数に応じて増加）

【給与内訳】
基本給 ${(min/10000).toFixed(0)}万円
＋皆勤手当 5,000円
＋役職手当 5,000円〜（経験・実績に応じて）
試用期間3ヶ月（期間中も給与・待遇は同条件）

【福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与
ドライブレコーダー搭載車両
車両保険完備
昇給あり（年1回査定）

【入社後の流れ】
1週目：社内ルール・安全運転研修・車両説明
2〜3週目：先輩ドライバーによる同乗研修
4週目以降：担当ルートを独立して配送開始`,
    tags: [
      '未経験歓迎',
      '正社員',
      'EC配送',
      '配送・ドライバー',
      '日勤固定',
      '社会保険完備',
      '普通免許OK',
      '昇給あり',
      '月収38万円以上',
      '大阪',
    ],
    faq: makeFaq(item),
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
