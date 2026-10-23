#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-nl-sougei-20261021-kyujinbox と同一）。
 * NOWLIVE（nl）／送迎系求人（求人ボックス掲載）第3弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。移動販売の送迎・催事スタッフ送迎のみ（配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='nl'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-sougei-20261023-kyujinbox.js
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

const COMPANY = 'nl';
const COUNT = 25;
const INCLUDE = ["送迎ドライバー","催事スタッフ送迎ドライバー"]; // 送迎系のみ（配送・専属は含めない）

const AREAS = [
  { area: '堺区北瓦町', city: '大阪府堺市堺区北瓦町' },
  { area: '北区東浅香山町', city: '大阪府堺市北区東浅香山町' },
  { area: '東区白鷺町', city: '大阪府堺市東区白鷺町' },
  { area: '中区小阪', city: '大阪府堺市中区小阪' },
  { area: '南区竹城台', city: '大阪府堺市南区竹城台' },
  { area: '美原区青南台', city: '大阪府堺市美原区青南台' },
  { area: '堺区戎之町東', city: '大阪府堺市堺区戎之町東' },
  { area: '北区蔵前町', city: '大阪府堺市北区蔵前町' },
  { area: '東区菩提町', city: '大阪府堺市東区菩提町' },
  { area: '中区陶器北', city: '大阪府堺市中区陶器北' },
  { area: '南区晴美台', city: '大阪府堺市南区晴美台' },
  { area: '美原区小平尾', city: '大阪府堺市美原区小平尾' },
  { area: '堺区戎之町西', city: '大阪府堺市堺区戎之町西' },
  { area: '北区奥本町', city: '大阪府堺市北区奥本町' },
  { area: '東区高松', city: '大阪府堺市東区高松' },
  { area: '南区御池台', city: '大阪府堺市南区御池台' },
  { area: '堺区神明町東', city: '大阪府堺市堺区神明町東' },
  { area: '北区北長尾町', city: '大阪府堺市北区北長尾町' },
  { area: '東区石原町', city: '大阪府堺市東区石原町' },
  { area: '南区赤坂台', city: '大阪府堺市南区赤坂台' },
  { area: '堺区神明町西', city: '大阪府堺市堺区神明町西' },
  { area: '北区黒土町', city: '大阪府堺市北区黒土町' },
  { area: '南区泉田中', city: '大阪府堺市南区泉田中' },
  { area: '堺区柏木町', city: '大阪府堺市堺区柏木町' },
  { area: '北区大豆塚町', city: '大阪府堺市北区大豆塚町' },
];

// 重みに従って、送迎系の職種を決定論的に巡回
const POOL_S = POOL[COMPANY].filter(p => INCLUDE.includes(p.jobType));
const TOTAL_W = POOL_S.reduce((s, p) => s + p.weight, 0);
function pickS(i) { let n = i % TOTAL_W; for (const p of POOL_S) { if (n < p.weight) return p; n -= p.weight; } return POOL_S[0]; }

async function main() {
  console.log(`\n🚗 NOWLIVE 送迎系求人（求人ボックス・関西）${COUNT}件 を登録します...\n`);
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
  console.log('→ 掲載管理の NOWLIVE タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}
main().catch(err => { console.error(err); process.exit(1); });
