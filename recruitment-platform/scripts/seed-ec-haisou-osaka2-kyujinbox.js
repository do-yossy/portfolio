#!/usr/bin/env node
'use strict';
/**
 * EC配送ドライバー求人 15件（大阪・正社員・月給42〜62万円・夜間帯配送中心）／第2弾
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
    note: '天王寺・あべのエリアのECセンターから出発。夜間帯の都心ターミナル周辺を効率配送します。',
  },
  {
    area: '大阪市淀川区（十三・西中島）', city: '大阪府大阪市淀川区',
    note: '十三・西中島エリアの大型EC物流拠点。新大阪駅周辺のコンパクトエリアで夜間帯配送します。',
  },
  {
    area: '大阪市東成区（今里・玉造）', city: '大阪府大阪市東成区',
    note: '今里・玉造エリアを担当するECドライバー。下町の住宅地が中心で受け取り率が高いエリアです。',
  },
  {
    area: '大阪市平野区（平野・加美）', city: '大阪府大阪市平野区',
    note: '平野・加美エリアのEC配送センター。大阪市最大の人口エリアで夜間帯60〜80件を担当します。',
  },
  {
    area: '大阪市東淀川区（淡路・上新庄）', city: '大阪府大阪市東淀川区',
    note: '淡路・上新庄エリア発の夜間帯ルート配送。阪急沿線の住宅地で定期顧客構築が見込めます。',
  },
  {
    area: '大阪市西成区（天下茶屋・岸里）', city: '大阪府大阪市西成区',
    note: '天下茶屋・岸里エリアの物流拠点。コンパクトな配送エリアで夜間帯効率よく回れます。',
  },
  {
    area: '大阪市阿倍野区（阿倍野・文の里）', city: '大阪府大阪市阿倍野区',
    note: '阿倍野・文の里エリアのECセンター。あべのハルカス周辺の都市型夜間帯ルートを担当します。',
  },
  {
    area: '大阪市都島区（都島・桜ノ宮）', city: '大阪府大阪市都島区',
    note: '都島・桜ノ宮エリア出発の夜間帯ルート配送。大川沿いの落ち着いた住宅地が中心です。',
  },
  {
    area: '大阪市鶴見区（鶴見・横堤）', city: '大阪府大阪市鶴見区',
    note: '鶴見・横堤エリアのEC物流センター。鶴見緑地周辺の住宅地を夜間帯コンパクト配送します。',
  },
  {
    area: '東大阪市（布施・長田）', city: '大阪府東大阪市',
    note: '布施・長田エリアの大型ECセンター。東大阪の住宅・事業所エリアで夜間帯配送を担当します。',
  },
  {
    area: '堺市北区（中百舌鳥・新金岡）', city: '大阪府堺市北区',
    note: '中百舌鳥・新金岡エリアのEC配送拠点。地下鉄・南海沿線の夜間帯配送を担当します。',
  },
  {
    area: '堺市中区（深井・東山）', city: '大阪府堺市中区',
    note: '深井・東山エリア発の夜間帯ルート配送。閑静な住宅地中心で受け取り率◎の好エリアです。',
  },
  {
    area: '八尾市（八尾・久宝寺）', city: '大阪府八尾市',
    note: '八尾・久宝寺エリアの物流センター。中河内エリアで夜間帯の安定した配送ルートを担当します。',
  },
  {
    area: '寝屋川市（寝屋川・香里園）', city: '大阪府寝屋川市',
    note: '寝屋川・香里園エリアのEC配送センター。京阪沿線の住宅地で夜間帯の定期配送を担当します。',
  },
  {
    area: '茨木市（茨木・南茨木）', city: '大阪府茨木市',
    note: '茨木・南茨木エリアのEC物流拠点。北摂の夜間帯配送で定期顧客構築で収入アップも可能。',
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
