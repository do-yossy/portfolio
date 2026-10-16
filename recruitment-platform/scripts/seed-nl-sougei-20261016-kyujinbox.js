#!/usr/bin/env node
'use strict';
/**
 * NOWLIVE（nl）／送迎系求人（求人ボックス掲載）第2弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。移動販売の送迎・催事スタッフ送迎のみ（配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='nl'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-sougei-20261016-kyujinbox.js
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
  { area: '豊津町', city: '大阪府吹田市豊津町' },
  { area: '垂水町', city: '大阪府吹田市垂水町' },
  { area: '片山町', city: '大阪府吹田市片山町' },
  { area: '東中条町', city: '大阪府茨木市東中条町' },
  { area: '西駅前町', city: '大阪府茨木市西駅前町' },
  { area: '紺屋町', city: '大阪府高槻市紺屋町' },
  { area: '野見町', city: '大阪府高槻市野見町' },
  { area: '岡本町', city: '大阪府枚方市岡本町' },
  { area: '香里本通町', city: '大阪府寝屋川市香里本通町' },
  { area: '八坂町', city: '大阪府寝屋川市八坂町' },
  { area: '千里丘', city: '大阪府摂津市千里丘' },
  { area: '八雲東町', city: '大阪府守口市八雲東町' },
  { area: '寺方本通', city: '大阪府守口市寺方本通' },
  { area: '氷野', city: '大阪府大東市氷野' },
  { area: '諸福', city: '大阪府大東市諸福' },
  { area: '岡町南', city: '大阪府豊中市岡町南' },
  { area: '段上町', city: '兵庫県西宮市段上町' },
  { area: '小浜', city: '兵庫県宝塚市小浜' },
  { area: '荒牧', city: '兵庫県伊丹市荒牧' },
  { area: '小戸', city: '兵庫県川西市小戸' },
  { area: '茶屋之町', city: '兵庫県芦屋市茶屋之町' },
  { area: '日ノ岡', city: '京都府京都市山科区日ノ岡' },
  { area: '高倉通', city: '京都府京都市下京区高倉通' },
  { area: '新町通', city: '京都府京都市下京区新町通' },
  { area: '祇園町南側', city: '京都府京都市東山区祇園町南側' },
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
