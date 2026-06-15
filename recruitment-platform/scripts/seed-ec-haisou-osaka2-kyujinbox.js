#!/usr/bin/env node
'use strict';
/**
 * EC配送ドライバー求人 15件（大阪・正社員・月収38万円以上）／第2弾
 * 既存掲載（seed-ec-haisou-osaka-kyujinbox.js の10件）と重複しない大阪の別エリア15か所。
 * 求人ボックス専用掲載（targetMedia: ['kyujinbox']）
 * 実行: node --experimental-sqlite scripts/seed-ec-haisou-osaka2-kyujinbox.js
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

// 既存10件と重複しない大阪エリア15か所
const AREAS = [
  {
    area: '大阪市天王寺区（天王寺・あべの）', city: '大阪府大阪市天王寺区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 455000,
    note: '天王寺・あべのエリアのECセンターから出発。大阪南部の主要ターミナル周辺を担当します。',
  },
  {
    area: '大阪市淀川区（十三・西中島）', city: '大阪府大阪市淀川区',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '十三・西中島エリアの大型EC物流拠点。新大阪駅周辺の好アクセスな立地です。',
  },
  {
    area: '大阪市東成区（今里・玉造）', city: '大阪府大阪市東成区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 450000,
    note: '今里・玉造エリアを担当するECドライバー。下町の住宅地が中心で道に慣れやすい環境です。',
  },
  {
    area: '大阪市平野区（平野・加美）', city: '大阪府大阪市平野区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 455000,
    note: '平野・加美エリアのEC配送センター。大阪市最大の人口エリアで安定した配送量があります。',
  },
  {
    area: '大阪市東淀川区（淡路・上新庄）', city: '大阪府大阪市東淀川区',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 455000,
    note: '淡路・上新庄エリア発のルート配送。阪急沿線の住宅地を中心に担当します。',
  },
  {
    area: '大阪市西成区（天下茶屋・岸里）', city: '大阪府大阪市西成区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 450000,
    note: '天下茶屋・岸里エリアの物流拠点。コンパクトな配送エリアで効率よく回れます。',
  },
  {
    area: '大阪市阿倍野区（阿倍野・文の里）', city: '大阪府大阪市阿倍野区',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '阿倍野・文の里エリアのECセンター。あべのハルカス周辺の都市型ルートを担当します。',
  },
  {
    area: '大阪市都島区（都島・桜ノ宮）', city: '大阪府大阪市都島区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 455000,
    note: '都島・桜ノ宮エリア出発のルート配送。大川沿いの落ち着いた住宅地が中心です。',
  },
  {
    area: '大阪市鶴見区（鶴見・横堤）', city: '大阪府大阪市鶴見区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 455000,
    note: '鶴見・横堤エリアのEC物流センター。鶴見緑地周辺の住宅地を安定配送します。',
  },
  {
    area: '東大阪市（布施・長田）', city: '大阪府東大阪市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '布施・長田エリアの大型ECセンター。東大阪の住宅・事業所エリアを幅広く担当します。',
  },
  {
    area: '堺市北区（中百舌鳥・新金岡）', city: '大阪府堺市北区',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '中百舌鳥・新金岡エリアのEC配送拠点。地下鉄・南海沿線の住宅地を担当します。',
  },
  {
    area: '堺市中区（深井・東山）', city: '大阪府堺市中区',
    shift: '8:00〜17:00', salaryMin: 380000, salaryMax: 455000,
    note: '深井・東山エリア発のルート配送。閑静な住宅地が中心で働きやすい環境です。',
  },
  {
    area: '八尾市（八尾・久宝寺）', city: '大阪府八尾市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '八尾・久宝寺エリアの物流センター。中河内エリアへの安定した配送ルートを担当します。',
  },
  {
    area: '寝屋川市（寝屋川・香里園）', city: '大阪府寝屋川市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '寝屋川・香里園エリアのEC配送センター。京阪沿線の住宅地を中心に担当します。',
  },
  {
    area: '茨木市（茨木・南茨木）', city: '大阪府茨木市',
    shift: '8:00〜17:00', salaryMin: 385000, salaryMax: 460000,
    note: '茨木・南茨木エリアのEC物流拠点。北摂エリアの住宅地を安定配送します。',
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
    faq: makeFaq(),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 EC配送求人（大阪・第2弾 求人ボックス専用）${JOBS.length}件 の登録を開始します...\n`);

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
        imageUrl:       '/images/ec-haisou-driver.svg',
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
