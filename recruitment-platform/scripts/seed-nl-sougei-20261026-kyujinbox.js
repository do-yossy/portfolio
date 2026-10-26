#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-26 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-nl-sougei-20261023-kyujinbox と同一）。
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-nl-sougei-20261021-kyujinbox と同一）。
 * NOWLIVE（nl）／送迎系求人（求人ボックス掲載）第3弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。移動販売の送迎・催事スタッフ送迎のみ（配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='nl'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-sougei-20261026-kyujinbox.js
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
  { area: '堺区錦之町東', city: '大阪府堺市堺区錦之町東' },
  { area: '北区北余部西', city: '大阪府堺市北区北余部西' },
  { area: '南区稲葉', city: '大阪府堺市南区稲葉' },
  { area: '堺区錦之町西', city: '大阪府堺市堺区錦之町西' },
  { area: '堺区御陵通', city: '大阪府堺市堺区御陵通' },
  { area: '堺区甲斐町西', city: '大阪府堺市堺区甲斐町西' },
  { area: '堺区緑ヶ丘北町', city: '大阪府堺市堺区緑ヶ丘北町' },
  { area: '堺区緑ヶ丘中町', city: '大阪府堺市堺区緑ヶ丘中町' },
  { area: '東大阪市岸田堂南町', city: '大阪府東大阪市岸田堂南町' },
  { area: '八尾市刑部', city: '大阪府八尾市刑部' },
  { area: '守口市土居町', city: '大阪府守口市土居町' },
  { area: '寝屋川市郡元町', city: '大阪府寝屋川市郡元町' },
  { area: '枚方市招提元町', city: '大阪府枚方市招提元町' },
  { area: '高槻市郡家新町', city: '大阪府高槻市郡家新町' },
  { area: '茨木市総持寺駅前町', city: '大阪府茨木市総持寺駅前町' },
  { area: '箕面市彩都粟生北', city: '大阪府箕面市彩都粟生北' },
  { area: '岸和田市春木泉町', city: '大阪府岸和田市春木泉町' },
  { area: '和泉市緑ケ丘', city: '大阪府和泉市緑ケ丘' },
  { area: '松原市高見の里', city: '大阪府松原市高見の里' },
  { area: '大東市南津の辺', city: '大阪府大東市南津の辺' },
  { area: '京都市伏見区中島', city: '京都府京都市伏見区中島' },
  { area: '京都市山科区栗栖野', city: '京都府京都市山科区栗栖野' },
  { area: '京都市右京区御室', city: '京都府京都市右京区御室' },
  { area: '神戸市東灘区住吉宮町', city: '兵庫県神戸市東灘区住吉宮町' },
  { area: '神戸市灘区六甲町', city: '兵庫県神戸市灘区六甲町' },
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
