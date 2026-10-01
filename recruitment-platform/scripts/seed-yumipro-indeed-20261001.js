#!/usr/bin/env node
'use strict';
/**
 * 合同会社YUMIPRO AGENCY（新規会社・新規取得Indeedアカウント）向けの
 * タクシー推薦の入口（送迎・専属ドライバー系）求人、初回投入分。
 * 2026-10-01、ユーザーとの確認に基づく：
 *   ・本業はエグゼクティブカウンセリング／経営コンサルティング／採用戦略コンサルティング／
 *     組織活性・人財活用コンサルティングの4事業（経営者・役員層が対象）。
 *   ・過去のタクシー推薦成約データのグループB（役員・専属ドライバー系、32%）と相性が良い客層。
 *   ・新規取得のIndeedアカウントだが、sl・amも新規アカウントで初回から14件掲載して問題なかった
 *     実績があるため、件数はst/nl/sl同様14件とする。
 *   ・4事業はそれぞれ別職種（内容重複なし）に割り当て、専属ドライバーのみ1件に限定（ユーザー確認済み）。
 *   ・給与は全職種月給350,000円〜で統一（ユーザー確認済み）。
 *   ・scripts/lib/taxi-funnel-content.js の POOL.yp（重み付き: 経営者カウンセリング4/経営コンサル3/
 *     採用コンサル3/組織コンサル3/専属1＝合計14）を重み付き巡回で使用し、職種ごとに複数件ある場合は
 *     エリアを変えて重複コンテンツに見えないようにする。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/seed-yumipro-indeed-20261001.js             // ドライラン
 *   node --experimental-sqlite scripts/seed-yumipro-indeed-20261001.js --apply     // 実際に作成
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

const { POOL, PLANNED_COUNTS, buildJob, pickByWeight } = require('./lib/taxi-funnel-content');
const { Jobs } = require('../db-factory');

const APPLY = process.argv.includes('--apply');

// 関西圏・実在地名14件（既存バッチ（seed-taxi-funnel-indeed-20260929.js等）と重複しないものを使用）。
const AREAS = [
  { area: '本町',     ward: '大阪市中央区',   pref: '大阪府' },
  { area: '中津',     ward: '大阪市北区',     pref: '大阪府' },
  { area: '新大阪',   ward: '大阪市淀川区',   pref: '大阪府' },
  { area: '弁天町',   ward: '大阪市港区',     pref: '大阪府' },
  { area: '緑地公園', ward: '豊中市',         pref: '大阪府' },
  { area: '千里中央', ward: '吹田市',         pref: '大阪府' },
  { area: '北千里',   ward: '吹田市',         pref: '大阪府' },
  { area: 'なかもず', ward: '堺市北区',       pref: '大阪府' },
  { area: '三宮',     ward: '神戸市中央区',   pref: '兵庫県' },
  { area: '岡本',     ward: '神戸市東灘区',   pref: '兵庫県' },
  { area: '芦屋川',   ward: '芦屋市',         pref: '兵庫県' },
  { area: '河原町',   ward: '京都市中京区',   pref: '京都府' },
  { area: '西院',     ward: '京都市右京区',   pref: '京都府' },
  { area: '北大路',   ward: '京都市北区',     pref: '京都府' },
];

async function main() {
  console.log(`\n=== YUMIPRO AGENCY（yp）向けIndeed新規求人 初回投入${APPLY ? '（--apply・実際に作成)' : '（DRY-RUN)'} ===\n`);

  const total = PLANNED_COUNTS.yp;
  let created = 0;
  for (let i = 0; i < total; i++) {
    const poolEntry = pickByWeight('yp', i);
    const a = AREAS[i % AREAS.length];
    const area = a.area;
    const location = `${a.pref}${a.ward}${a.area}`;
    const newJob = buildJob('yp', poolEntry, area, location, 'indeed');

    console.log(`  作成: [${newJob.jobType}] ${newJob.title}`);
    if (APPLY) {
      await Jobs.create(newJob);
    }
    created++;
  }

  console.log(`\n完了: 作成${created}件（合同会社YUMIPRO AGENCY／Indeed新規／想定${total}件）`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
