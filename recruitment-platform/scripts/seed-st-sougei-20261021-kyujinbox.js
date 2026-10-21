#!/usr/bin/env node
'use strict';
/**
 * Style501（st）／送迎系求人（求人ボックス掲載）第4弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。職人送迎・催事送迎・展示会スタッフ送迎のみ（展示会配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='st'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-st-sougei-20261021-kyujinbox.js
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

const COMPANY = 'st';
const COUNT = 25;
const INCLUDE = ["職人送迎ドライバー","催事送迎ドライバー","展示会スタッフ送迎ドライバー"]; // 送迎系のみ（配送・専属は含めない）

const AREAS = [
  { area: '山之内', city: '大阪府大阪市住吉区山之内' },
  { area: '遠里小野', city: '大阪府大阪市住吉区遠里小野' },
  { area: '墨江', city: '大阪府大阪市住吉区墨江' },
  { area: '万代', city: '大阪府大阪市住吉区万代' },
  { area: '杉本', city: '大阪府大阪市住吉区杉本' },
  { area: '大領', city: '大阪府大阪市住吉区大領' },
  { area: '庭井', city: '大阪府大阪市住吉区庭井' },
  { area: '湯里', city: '大阪府大阪市東住吉区湯里' },
  { area: '北田辺', city: '大阪府大阪市東住吉区北田辺' },
  { area: '西今川', city: '大阪府大阪市東住吉区西今川' },
  { area: '鷹合', city: '大阪府大阪市東住吉区鷹合' },
  { area: '中野', city: '大阪府大阪市東住吉区中野' },
  { area: '矢田', city: '大阪府大阪市東住吉区矢田' },
  { area: '公園南矢田', city: '大阪府大阪市東住吉区公園南矢田' },
  { area: '平野東', city: '大阪府大阪市平野区平野東' },
  { area: '平野西', city: '大阪府大阪市平野区平野西' },
  { area: '平野元町', city: '大阪府大阪市平野区平野元町' },
  { area: '加美西', city: '大阪府大阪市平野区加美西' },
  { area: '長吉長原', city: '大阪府大阪市平野区長吉長原' },
  { area: '長吉出戸', city: '大阪府大阪市平野区長吉出戸' },
  { area: '長吉川辺', city: '大阪府大阪市平野区長吉川辺' },
  { area: '背戸口', city: '大阪府大阪市平野区背戸口' },
  { area: '流町', city: '大阪府大阪市平野区流町' },
  { area: '西脇', city: '大阪府大阪市平野区西脇' },
  { area: '平野北', city: '大阪府大阪市平野区平野北' },
];

// 重みに従って、送迎系の職種を決定論的に巡回
const POOL_S = POOL[COMPANY].filter(p => INCLUDE.includes(p.jobType));
const TOTAL_W = POOL_S.reduce((s, p) => s + p.weight, 0);
function pickS(i) { let n = i % TOTAL_W; for (const p of POOL_S) { if (n < p.weight) return p; n -= p.weight; } return POOL_S[0]; }

async function main() {
  console.log(`\n🚗 Style501 送迎系求人（求人ボックス・関西）${COUNT}件 を登録します...\n`);
  const jobs = [];
  for (let i = 0; i < COUNT; i++) {
    const a = AREAS[i % AREAS.length];
    jobs.push(buildJob(COMPANY, pickS(i), a.area, a.city, '求人ボックス'));
  }
  const myTitles = new Set(jobs.map(j => j.title));
  const existing = await Jobs.findAll();
  let removed = 0;
  for (const j of existing) { if (j.company === COMPANY && myTitles.has(j.title)) { await Jobs.delete(j.id); removed++; } }
  if (removed) console.log(`  🧹 既存の同一バッチ ${removed}件 を削除（冪等・入れ直し）\n`);
  for (const job of jobs) { await Jobs.create(job); console.log(`  ✅ 登録完了 [${job.jobType}]: ${job.title}`); }
  console.log(`\n📊 結果: 新規 ${jobs.length}件（削除 ${removed}件）`);
  console.log('→ 掲載管理の Style501 タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}
main().catch(err => { console.error(err); process.exit(1); });
