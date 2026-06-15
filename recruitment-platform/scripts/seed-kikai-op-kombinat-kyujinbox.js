#!/usr/bin/env node
'use strict';
/**
 * 機械オペレーター（鉄鋼・化学品）求人 10件
 * 大型コンビナート所在地・正社員・未経験歓迎・月給30万円〜37万円・年間休日120日以上
 * 画像（kikai-operator-kombinat.jpg）に合わせた内容。
 * 求人ボックス専用掲載（targetMedia: ['kyujinbox']）
 * 実行: node --experimental-sqlite scripts/seed-kikai-op-kombinat-kyujinbox.js
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
const JOB_TYPE     = '製造・工場';
const EMP_TYPE     = '正社員';
const IMAGE_URL    = '/images/kikai-operator-kombinat.jpg';

// 実在の大型コンビナート（鉄鋼・化学品）所在地10か所
const AREAS = [
  {
    area: '茨城県神栖市（鹿島臨海工業地帯）', city: '茨城県神栖市',
    note: '鹿島臨海工業地帯の大型コンビナート。石油化学・鉄鋼関連の製造ラインを担当します。',
  },
  {
    area: '千葉県市原市（京葉臨海コンビナート）', city: '千葉県市原市',
    note: '国内最大級の京葉臨海コンビナート。化学プラントの設備操作・監視を担当します。',
  },
  {
    area: '千葉県袖ケ浦市（袖ケ浦コンビナート）', city: '千葉県袖ケ浦市',
    note: '東京湾岸の袖ケ浦コンビナート。石油化学・素材製造の安定した大規模拠点です。',
  },
  {
    area: '神奈川県川崎市川崎区（京浜工業地帯）', city: '神奈川県川崎市川崎区',
    note: '京浜工業地帯の中核拠点。鉄鋼・化学品の製造ライン操作とメンテナンス補助業務です。',
  },
  {
    area: '三重県四日市市（四日市コンビナート）', city: '三重県四日市市',
    note: '四日市コンビナートの石油化学プラント。安全教育が充実した大規模工場です。',
  },
  {
    area: '大阪府堺市西区（堺泉北臨海工業地帯）', city: '大阪府堺市西区',
    note: '堺泉北臨海工業地帯の製造拠点。鉄鋼・化学品の製造ライン監視を担当します。',
  },
  {
    area: '岡山県倉敷市（水島コンビナート）', city: '岡山県倉敷市',
    note: '西日本有数の水島コンビナート。化学・鉄鋼の大型製造設備を操作する仕事です。',
  },
  {
    area: '山口県周南市（周南コンビナート）', city: '山口県周南市',
    note: '周南コンビナートの化学プラント。瀬戸内有数の素材製造拠点で安定して働けます。',
  },
  {
    area: '愛媛県新居浜市（新居浜・東予工業地帯）', city: '愛媛県新居浜市',
    note: '新居浜・東予工業地帯の化学品製造拠点。歴史ある大手メーカーの製造ラインです。',
  },
  {
    area: '大分県大分市（大分臨海工業地帯）', city: '大分県大分市',
    note: '大分臨海工業地帯の大型コンビナート。鉄鋼・化学品の製造ライン操作・監視業務です。',
  },
];

function makeFaq() {
  return [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。入社後は丁寧な研修とOJTで指導します。マニュアルが整備されているので未経験の方でも安心してスタートできます。',
    },
    {
      q: '大型コンビナートの仕事とは具体的に何をしますか？',
      a: '製造ラインの機械操作・監視（計器・モニターのチェック）・メンテナンス補助が中心です。重量物の運搬は機械が行うため、体力に自信がない方でも働けます。',
    },
    {
      q: '資格や免許は必要ですか？',
      a: '入社時点では不要です。フォークリフト・危険物取扱者・各種ボイラーなど、必要な資格は入社後に会社負担で取得できます（資格取得支援あり）。',
    },
    {
      q: '月収30万円以上は保証されますか？',
      a: '基本給30万円を保証した上で、各種手当が加算されます。経験・スキルに応じて昇給（年1回査定）もあり、長く安定して働ける環境です。',
    },
    {
      q: '休日はどれくらいありますか？',
      a: '年間休日120日以上で、プライベートも充実できます。週休2日制（シフト制）に加え、有給休暇も取得しやすい職場です。',
    },
    {
      q: '社会保険はありますか？',
      a: '健康保険・厚生年金・雇用保険・労災保険の各種社会保険が完備されています。正社員として安心して働ける環境です。',
    },
  ];
}

function makeJob(item) {
  const { area, city, note } = item;
  const min = 300000, max = 370000;
  const salaryStr = `月給30万円〜37万円（各種手当込・試用期間3ヶ月／同条件）`;
  return {
    title:     `【${area}】機械オペレーター（鉄鋼・化学品）｜正社員｜未経験歓迎｜月収30万円以上`,
    location:  city,
    salary:    salaryStr,
    jobType:   JOB_TYPE,
    catchcopy: `スケールの大きな仕事で、安定した未来を。機械オペレーター（鉄鋼・化学品）正社員募集｜月収30万円以上｜年間休日120日以上`,
    description: `${city}（${area}）で機械オペレーター（鉄鋼・化学品）の正社員を募集します。${note}

【仕事内容】
大型コンビナートの製造ライン操作・監視・メンテナンス補助業務をお任せします。
・製造設備（機械）の操作・立ち上げ／停止
・計器・モニターによる製造状況の監視
・簡単な点検・メンテナンスの補助
手順書・マニュアルに沿って作業を進めるため、未経験の方でも丁寧な研修で安心してスタートできます。

【こんな方に向いています】
・コツコツ丁寧に作業することが得意な方
・安定した正社員雇用で長く働きたい方
・ものづくり・プラントの仕事に興味がある方
・未経験から手に職をつけたい方

【労働時間】
実働8時間（交替制の場合あり）
残業：月平均10時間以内（繁忙期除く）

【休日・休暇】
年間休日120日以上
週休2日制（シフト制）
有給休暇10日〜（勤続年数に応じて増加）
プライベートも充実できる働きやすい環境です。

【給与内訳】
基本給 30万円〜
＋各種手当（皆勤手当・技能手当・交替手当 等）
最大 月給37万円
試用期間3ヶ月（期間中も給与・待遇は同条件）
昇給あり（年1回査定）

【福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与（必要な備品は会社支給）
資格取得支援あり（フォークリフト・危険物取扱・ボイラー等）
昇給あり（年1回査定）

【入社後の流れ】
1週目：安全研修・設備説明・社内ルール
2〜4週目：先輩オペレーターによる丁寧なOJT
5週目以降：担当ラインを独立して操作開始

安定の正社員雇用で、長く働ける環境です。`,
    tags: [
      '未経験歓迎',
      '正社員',
      '機械オペレーター',
      '製造・工場',
      '鉄鋼・化学品',
      '社会保険完備',
      '資格取得支援',
      '年間休日120日以上',
      '昇給あり',
      '月収30万円以上',
    ],
    faq: makeFaq(),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 機械オペレーター（鉄鋼・化学品 大型コンビナート）${JOBS.length}件 の登録を開始します...\n`);

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
