#!/usr/bin/env node
'use strict';
/**
 * 機械オペレーター求人 10件（全国・正社員・月収28万円以上）
 * 求人ボックス専用掲載（targetMedia: ['kyujinbox']）
 * 実行: node --experimental-sqlite scripts/seed-kikai-op-28man-kyujinbox.js
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
const JOB_TYPE     = '製造・工場';
const EMP_TYPE     = '正社員';

// 既存求人と重複しない全国エリア10か所
const AREAS = [
  {
    area: '岩手県盛岡市（都南）',   city: '岩手県盛岡市',
    shift: '8:00〜17:00', salaryMin: 280000, salaryMax: 360000,
    jobLabel: '機械オペレーター（食品・飲料製造）',
    note: '食品・飲料の製造ラインを担当。衛生管理が徹底された清潔な職場環境です。',
    industry: '食品製造',
  },
  {
    area: '秋田県秋田市（飯島）',   city: '秋田県秋田市',
    shift: '8:00〜17:00', salaryMin: 280000, salaryMax: 360000,
    jobLabel: '機械オペレーター（紙・パルプ製造）',
    note: '製紙・パルプ関連の製造ライン操作。安定した大手メーカーの製造拠点です。',
    industry: '製造工場',
  },
  {
    area: '山形県山形市（蔵王）',   city: '山形県山形市',
    shift: '8:00〜17:00', salaryMin: 280000, salaryMax: 360000,
    jobLabel: '機械オペレーター（精密機器製造）',
    note: '精密機器の製造ライン管理。細かい作業が得意な方に向いています。',
    industry: '製造工場',
  },
  {
    area: '長野県松本市（島内）',   city: '長野県松本市',
    shift: '8:00〜17:00', salaryMin: 280000, salaryMax: 365000,
    jobLabel: '機械オペレーター（光学・電子部品）',
    note: '光学機器・電子部品の製造ライン操作。精度の高い作業を行う職場です。',
    industry: '製造工場',
  },
  {
    area: '富山県富山市（婦中）',   city: '富山県富山市',
    shift: '8:00〜17:00', salaryMin: 285000, salaryMax: 365000,
    jobLabel: '機械オペレーター（医薬品・化学品）',
    note: '医薬品・化学品の製造ライン管理。手順書に沿った確実な作業が求められます。',
    industry: '製造工場',
  },
  {
    area: '三重県四日市市（霞）',   city: '三重県四日市市',
    shift: '8:00〜17:00', salaryMin: 285000, salaryMax: 370000,
    jobLabel: '機械オペレーター（石油化学・素材）',
    note: '石油化学プラントの設備監視・操作。安全教育が充実した大規模工場です。',
    industry: '製造工場',
  },
  {
    area: '広島県福山市（東深津）', city: '広島県福山市',
    shift: '8:00〜17:00', salaryMin: 280000, salaryMax: 365000,
    jobLabel: '機械オペレーター（鉄鋼・金属加工）',
    note: '鉄鋼・金属加工の製造ライン操作。ものづくりの醍醐味を感じられる職場です。',
    industry: '製造工場',
  },
  {
    area: '香川県高松市（香川）',   city: '香川県高松市',
    shift: '8:00〜17:00', salaryMin: 280000, salaryMax: 360000,
    jobLabel: '機械オペレーター（食品・菓子製造）',
    note: '食品・菓子の製造ライン管理。四国最大都市の安定した製造工場です。',
    industry: '食品製造',
  },
  {
    area: '長崎県大村市（松原）',   city: '長崎県大村市',
    shift: '8:00〜17:00', salaryMin: '280000', salaryMax: 360000,
    jobLabel: '機械オペレーター（造船・機械部品）',
    note: '造船関連の機械部品製造ライン。技術力の高いベテランに囲まれて成長できます。',
    industry: '製造工場',
  },
  {
    area: '大分県大分市（大在）',   city: '大分県大分市',
    shift: '8:00〜17:00', salaryMin: 280000, salaryMax: 365000,
    jobLabel: '機械オペレーター（鉄鋼・化学品）',
    note: '大型コンビナートの製造ライン操作・監視。スケールの大きい仕事です。',
    industry: '製造工場',
  },
];

function makeFaq({ area, jobLabel, industry }) {
  return [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。入社後にOJTで丁寧に指導します。マニュアルが整備されているので安心してスタートできます。',
    },
    {
      q: '体力的にきつくないですか？',
      a: `${industry}の作業ですが、重量物は機械が担当します。立ち仕事はありますが、無理のないペースで働ける職場です。`,
    },
    {
      q: '資格や免許は必要ですか？',
      a: '入社時点では不要です。必要な資格は入社後に会社負担で取得できます。フォークリフトや危険物取扱など、キャリアに活かせる資格が取れます。',
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
  return {
    ...vary.buildKikai(item, 'op28'),
    location:  item.city,
    salary:    `月給${(parseInt(item.salaryMin)/10000).toFixed(0)}万円〜${(parseInt(item.salaryMax)/10000).toFixed(0)}万円（各種手当込・試用期間3ヶ月／同条件）`,
    jobType:   JOB_TYPE,
    tags: [
      '未経験歓迎',
      '正社員',
      '機械オペレーター',
      '製造・工場',
      '日勤固定',
      '社会保険完備',
      '資格取得支援',
      '昇給あり',
      '月収28万円以上',
      '安定収入',
    ],
    faq: makeFaq(item),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 機械オペレーター求人（全国 求人ボックス専用）${JOBS.length}件 の登録を開始します...\n`);

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
