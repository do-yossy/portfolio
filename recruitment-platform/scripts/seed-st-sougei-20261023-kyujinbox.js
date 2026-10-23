#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-st-sougei-20261021-kyujinbox と同一）。
 * Style501（st）／送迎系求人（求人ボックス掲載）第4弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。職人送迎・催事送迎・展示会スタッフ送迎のみ（展示会配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='st'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-st-sougei-20261023-kyujinbox.js
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
  { area: '住道矢田', city: '大阪府大阪市東住吉区住道矢田' },
  { area: '平野宮町', city: '大阪府大阪市平野区平野宮町' },
  { area: '阿倍野椎原', city: '大阪府大阪市阿倍野区阿倍野椎原' },
  { area: '生野東', city: '大阪府大阪市生野区生野東' },
  { area: '大阪市東住吉区青山', city: '大阪府大阪市東住吉区青山' },
  { area: '大阪市平野区町', city: '大阪府大阪市平野区平野市町' },
  { area: '大阪市阿倍野区万代', city: '大阪府大阪市阿倍野区万代' },
  { area: '生野西', city: '大阪府大阪市生野区生野西' },
  { area: '東今川', city: '大阪府大阪市東住吉区東今川' },
  { area: '平野上町', city: '大阪府大阪市平野区平野上町' },
  { area: '常盤町', city: '大阪府大阪市阿倍野区常盤町' },
  { area: '大阪市生野区巽西', city: '大阪府大阪市生野区巽西' },
  { area: '平野馬場', city: '大阪府大阪市平野区平野馬場' },
  { area: '橋本町', city: '大阪府大阪市阿倍野区橋本町' },
  { area: '中川東', city: '大阪府大阪市生野区中川東' },
  { area: '長吉六反', city: '大阪府大阪市平野区長吉六反' },
  { area: '大阪市阿倍野区北畠', city: '大阪府大阪市阿倍野区北畠' },
  { area: '大阪市生野区片江', city: '大阪府大阪市生野区片江' },
  { area: '巽公園', city: '大阪府大阪市生野区巽公園' },
  { area: '荒本西', city: '大阪府東大阪市荒本西' },
  { area: '八尾木北', city: '大阪府八尾市八尾木北' },
  { area: '守口市梅町', city: '大阪府守口市梅町' },
  { area: '香里新町', city: '大阪府寝屋川市香里新町' },
  { area: '岡南町', city: '大阪府枚方市岡南町' },
  { area: '城東町', city: '大阪府高槻市城東町' },
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
