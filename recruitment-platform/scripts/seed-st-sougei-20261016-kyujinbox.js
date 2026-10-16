#!/usr/bin/env node
'use strict';
/**
 * Style501（st）／送迎系求人（求人ボックス掲載）第2弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。職人送迎・催事送迎・展示会スタッフ送迎のみ（展示会配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='st'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-st-sougei-20261016-kyujinbox.js
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
  { area: '釣鐘町', city: '大阪府大阪市中央区釣鐘町' },
  { area: '高麗橋', city: '大阪府大阪市中央区高麗橋' },
  { area: '真法院町', city: '大阪府大阪市天王寺区真法院町' },
  { area: '大道', city: '大阪府大阪市天王寺区大道' },
  { area: '南河堀町', city: '大阪府大阪市天王寺区南河堀町' },
  { area: '京阪本通', city: '大阪府守口市京阪本通' },
  { area: '藤田町', city: '大阪府守口市藤田町' },
  { area: '東郷通', city: '大阪府守口市東郷通' },
  { area: '大日東町', city: '大阪府守口市大日東町' },
  { area: '住道', city: '大阪府大東市住道' },
  { area: '御領', city: '大阪府大東市御領' },
  { area: '赤井', city: '大阪府大東市赤井' },
  { area: '庄内西町', city: '大阪府豊中市庄内西町' },
  { area: '蛍池中町', city: '大阪府豊中市蛍池中町' },
  { area: '服部元町', city: '大阪府豊中市服部元町' },
  { area: '七松町', city: '兵庫県尼崎市七松町' },
  { area: '立花町', city: '兵庫県尼崎市立花町' },
  { area: '下坂部', city: '兵庫県尼崎市下坂部' },
  { area: '南昭和町', city: '兵庫県西宮市南昭和町' },
  { area: '瓦林町', city: '兵庫県西宮市瓦林町' },
  { area: '高倉通', city: '京都府京都市中京区高倉通' },
  { area: '新町通', city: '京都府京都市中京区新町通' },
  { area: '北野白梅町', city: '京都府京都市北区北野白梅町' },
  { area: '大枝', city: '京都府京都市西京区大枝' },
  { area: '淀', city: '京都府京都市伏見区淀' },
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
