#!/usr/bin/env node
'use strict';
/**
 * 軽作業・機械オペレーター求人 10件（全国・正社員・月収28万円以上）
 * Google しごと検索専用掲載（targetMedia: ['google']）
 * ※ 既存エリアと重複しない全国エリアで作成
 * 実行: node --experimental-sqlite scripts/seed-lightwork-28man-google.js
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
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
const TARGET_MEDIA = ['google'];   // Googleしごと検索専用
const EMP_TYPE     = '正社員';

// 既存で使われていない全国エリア10か所
const AREAS = [
  {
    area: '愛知県名古屋市（守山区）', city: '愛知県名古屋市',
    jobType: '製造・工場',
    jobLabel: '機械オペレーター（自動車部品製造）',
    shift: '8:00〜17:00',
    salaryMin: 285000, salaryMax: 370000,
    note: '自動車関連部品の製造ライン操作。未経験から正社員でスタートできます。',
    industry: '製造工場'
  },
  {
    area: '神奈川県横浜市（港北区）', city: '神奈川県横浜市',
    jobType: '軽作業・物流',
    jobLabel: '倉庫内ピッキング・仕分けスタッフ',
    shift: '9:00〜18:00',
    salaryMin: 285000, salaryMax: 365000,
    note: '大型EC物流センターでの仕分け・ピッキング。効率的な職場環境です。',
    industry: '物流倉庫'
  },
  {
    area: '千葉県船橋市（行田）',     city: '千葉県船橋市',
    jobType: '軽作業・物流',
    jobLabel: '倉庫内軽作業（入出荷・検品）',
    shift: '8:30〜17:30',
    salaryMin: 280000, salaryMax: 360000,
    note: '食品・日用品の入出荷管理・検品作業。チームで協力しながら働けます。',
    industry: '物流倉庫'
  },
  {
    area: '埼玉県さいたま市（見沼区）', city: '埼玉県さいたま市',
    jobType: '軽作業・物流',
    jobLabel: '倉庫内スタッフ（梱包・ラベル貼り）',
    shift: '9:00〜18:00',
    salaryMin: 280000, salaryMax: 360000,
    note: '通販商品の梱包・ラベル貼り作業。立ち仕事ですが軽作業中心です。',
    industry: '物流倉庫'
  },
  {
    area: '兵庫県神戸市（西区）',     city: '兵庫県神戸市',
    jobType: '製造・工場',
    jobLabel: '製造スタッフ（組立・検査）',
    shift: '8:00〜17:00',
    salaryMin: 285000, salaryMax: 365000,
    note: '電子機器・精密部品の組立・検査。丁寧な作業ができる方向けです。',
    industry: '製造工場'
  },
  {
    area: '京都府京都市（伏見区）',   city: '京都府京都市',
    jobType: '製造・工場',
    jobLabel: '機械オペレーター（食品製造）',
    shift: '8:00〜17:00',
    salaryMin: 280000, salaryMax: 360000,
    note: '食品製造ラインの機械操作・管理。マニュアル完備で未経験でも安心。',
    industry: '製造工場'
  },
  {
    area: '岡山県倉敷市（水島）',     city: '岡山県倉敷市',
    jobType: '製造・工場',
    jobLabel: '製造オペレーター（化学・素材）',
    shift: '8:00〜17:00',
    salaryMin: 280000, salaryMax: 365000,
    note: '素材・化学品製造ラインの監視・操作。手順通りに行えばOKです。',
    industry: '製造工場'
  },
  {
    area: '熊本県菊池郡（大津町）',   city: '熊本県菊池郡',
    jobType: '製造・工場',
    jobLabel: '機械オペレーター（自動車部品）',
    shift: '8:00〜17:00',
    salaryMin: 280000, salaryMax: 360000,
    note: '自動車部品の製造ライン作業。工場内は空調完備で快適な環境です。',
    industry: '製造工場'
  },
  {
    area: '福島県いわき市（勿来）',   city: '福島県いわき市',
    jobType: '軽作業・物流',
    jobLabel: '倉庫内軽作業（ピッキング・梱包）',
    shift: '9:00〜18:00',
    salaryMin: 280000, salaryMax: 355000,
    note: '食品・生活用品の仕分け・梱包作業。冷暖房完備の快適な倉庫です。',
    industry: '物流倉庫'
  },
  {
    area: '山口県周南市（徳山）',     city: '山口県周南市',
    jobType: '製造・工場',
    jobLabel: '製造スタッフ（樹脂・化学品）',
    shift: '8:00〜17:00',
    salaryMin: 280000, salaryMax: 360000,
    note: '樹脂・化学品の製造ライン作業。製造経験不問、丁寧な研修があります。',
    industry: '製造工場'
  },
];

function makeFaq({ area, jobLabel, industry }) {
  return [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。入社後に先輩スタッフがOJTで丁寧に指導します。マニュアルも整備されているので安心してスタートできます。',
    },
    {
      q: '体力的にきつくないですか？',
      a: `${industry}の作業ですが、重量物は機械やフォークリフトが担当します。立ち仕事はありますが、無理のないペースで働ける職場です。`,
    },
    {
      q: '勤務シフトは固定ですか？',
      a: '基本的に日勤固定です。残業は月平均10時間以内で、プライベートと両立しやすい環境です。',
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
  const { area, city, jobType, jobLabel, shift, salaryMin, salaryMax, note, industry } = item;
  const salaryStr = `月給${(salaryMin/10000).toFixed(0)}万円〜${(salaryMax/10000).toFixed(0)}万円（各種手当込・試用期間3ヶ月／同条件）`;
  return {
    title:     `【${area}】${jobLabel}｜正社員｜未経験歓迎｜日勤・安定収入`,
    location:  city,
    salary:    salaryStr,
    jobType,
    catchcopy: `${industry}スタッフ正社員募集｜月収28万円以上｜各種社会保険完備`,
    description: `${city}（${area}）で${jobLabel}の正社員を募集します。${note}

【仕事内容】
${jobLabel}の業務全般をお任せします。
研修制度が整っており、未経験の方でも安心してスタートできます。

【こんな方に向いています】
・コツコツ丁寧に作業することが得意な方
・安定した正社員雇用を求めている方
・未経験からものづくり・物流に挑戦したい方
・転職回数が多くても前向きに働きたい方

【労働時間】
${shift}（実働8時間）
残業：月平均10時間以内（繁忙期除く）

【休日・休暇】
週休2日制（土日・祝日休み）
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
制服貸与
昇給あり（年1回査定）

【入社後の流れ】
1週目：職場見学・社内ルール研修
2〜4週目：先輩スタッフによるOJT
5週目以降：独立して担当業務をスタート`,
    tags: [
      '未経験歓迎',
      '正社員',
      '日勤固定',
      '土日休み',
      '社会保険完備',
      '昇給あり',
      '製造・物流',
      '安定収入',
    ],
    faq: makeFaq(item),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 軽作業・機械オペレーター求人（全国 Googleしごと検索専用）${JOBS.length}件 の登録を開始します...\n`);

  const existing       = await Jobs.findAll();
  const existingTitles = new Set(existing.map(j => j.title));

  let added   = 0;
  let skipped = 0;

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
