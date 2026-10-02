#!/usr/bin/env node
'use strict';
/**
 * 合同会社YUMIPRO AGENCY（新規会社・新規開設の求人ボックスアカウント）向けの
 * タクシー推薦の入口（送迎・専属ドライバー系）求人、初回投入分。
 * 2026-10-01、ユーザーとの確認に基づく：
 *   ・Indeed分（seed-yumipro-indeed-20261001.js）と同じ考え方・同じ内容プールを使う。
 *   ・求人ボックスは既存会社（sq/bg/st/bi/nl/sl/am）では「入替のみ・純増なし」方針だが、
 *     YUMIPROは新規開設アカウントのため既存掲載が無く、入替ではなく新規掲載（純増）として扱う。
 *   ・件数はIndeed分の14件とは別に25件とする（2026-10-01ユーザー指定）。「求人ボックスも
 *     同じように職種ごとの掲載数を考えて」との指示を受け、Indeedの配分比率（経営者カウンセリング
 *     4／経営コンサル3／採用コンサル3／組織コンサル3＝13に対する4:3:3:3の比率）を24件
 *     （25件−専属1件）にそのまま比例配分：7/6/6/5＝24＋専属1＝25。専属ドライバーは
 *     Indeed同様1件に固定（pickByWeightの機械的な周回には頼らず、職種ごとの件数を直接指定）。
 *   ・Indeed分とエリアの文言が重複しないよう、求人ボックス専用のエリア一覧（25件）を使う
 *     （同一媒体内での重複コンテンツを避けるのが目的で、媒体をまたいだ重複は各媒体のBAN判定上
 *     問題にならないため、Indeed分と全く同じ内容でも支障はないが、念のため分けている）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/seed-yumipro-kyujinbox-20261001.js             // ドライラン
 *   node --experimental-sqlite scripts/seed-yumipro-kyujinbox-20261001.js --apply     // 実際に作成
 */
const path = require('path');
const fs = require('fs');
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

const { POOL, buildJob } = require('./lib/taxi-funnel-content');
const { Jobs } = require('../db-factory');

const APPLY = process.argv.includes('--apply');

// POOL.yp の並び順（経営者カウンセリング／経営コンサル／採用コンサル／組織コンサル／専属）に対応する
// 職種ごとの掲載数。Indeedの配分比率(4:3:3:3)を24件に比例配分し、専属は1件固定。
const COUNTS = [7, 6, 6, 5, 1];
const TOTAL = COUNTS.reduce((s, c) => s + c, 0); // 25

// 関西圏・実在地名25件（Indeed分（seed-yumipro-indeed-20261001.js）とは別の地点を使用）。
const AREAS = [
  { area: '淡路',     ward: '大阪市東淀川区', pref: '大阪府' },
  { area: '鴫野',     ward: '大阪市城東区',   pref: '大阪府' },
  { area: '安立',     ward: '堺市堺区',       pref: '大阪府' },
  { area: '千林',     ward: '大阪市旭区',     pref: '大阪府' },
  { area: '石橋',     ward: '池田市',         pref: '大阪府' },
  { area: '北野田',   ward: '堺市東区',       pref: '大阪府' },
  { area: '光明池',   ward: '堺市南区',       pref: '大阪府' },
  { area: '沢之町',   ward: '守口市',         pref: '大阪府' },
  { area: '六甲',     ward: '神戸市灘区',     pref: '兵庫県' },
  { area: '塚口',     ward: '尼崎市',         pref: '兵庫県' },
  { area: '門戸厄神', ward: '西宮市',         pref: '兵庫県' },
  { area: '西大路',   ward: '京都市下京区',   pref: '京都府' },
  { area: '丹波橋',   ward: '京都市伏見区',   pref: '京都府' },
  { area: '桂',       ward: '京都市西京区',   pref: '京都府' },
  { area: '喜連瓦屋',   ward: '大阪市東住吉区', pref: '大阪府' },
  { area: '松原',       ward: '松原市',         pref: '大阪府' },
  { area: '富田林',     ward: '富田林市',       pref: '大阪府' },
  { area: '河内長野',   ward: '河内長野市',     pref: '大阪府' },
  { area: '茶山台',     ward: '堺市南区',       pref: '大阪府' },
  { area: '摂津富田',   ward: '高槻市',         pref: '大阪府' },
  { area: '須磨',       ward: '神戸市須磨区',   pref: '兵庫県' },
  { area: '甲東園',     ward: '西宮市',         pref: '兵庫県' },
  { area: '伊丹',       ward: '伊丹市',         pref: '兵庫県' },
  { area: '山科',       ward: '京都市山科区',   pref: '京都府' },
  { area: '洛西口',     ward: '京都市西京区',   pref: '京都府' },
];

async function main() {
  console.log(`\n=== YUMIPRO AGENCY（yp）向け求人ボックス新規求人 初回投入${APPLY ? '（--apply・実際に作成)' : '（DRY-RUN)'} ===\n`);

  let areaIdx = 0;
  let created = 0;
  for (let p = 0; p < POOL.yp.length; p++) {
    const poolEntry = POOL.yp[p];
    const count = COUNTS[p] || 0;
    for (let c = 0; c < count; c++) {
      const a = AREAS[areaIdx % AREAS.length];
      areaIdx++;
      const area = a.area;
      const location = `${a.pref}${a.ward}${a.area}`;
      const newJob = buildJob('yp', poolEntry, area, location, '求人ボックス');

      console.log(`  作成: [${newJob.jobType}] ${newJob.title}`);
      if (APPLY) {
        await Jobs.create(newJob);
      }
      created++;
    }
  }

  console.log(`\n完了: 作成${created}件（合同会社YUMIPRO AGENCY／求人ボックス新規／想定${TOTAL}件）`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ 新規開設アカウントのため純増扱い（既存会社の「入替のみ」方針とは異なる）。');
}

main().catch(err => { console.error(err); process.exit(1); });
