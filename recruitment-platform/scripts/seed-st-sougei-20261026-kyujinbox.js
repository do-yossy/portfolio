#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-26 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-st-sougei-20261023-kyujinbox と同一）。
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-st-sougei-20261021-kyujinbox と同一）。
 * Style501（st）／送迎系求人（求人ボックス掲載）第4弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。職人送迎・催事送迎・展示会スタッフ送迎のみ（展示会配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='st'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-st-sougei-20261026-kyujinbox.js
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
  { area: '花園東町', city: '大阪府東大阪市花園東町' },
  { area: '若草町', city: '大阪府八尾市若草町' },
  { area: '日吉町', city: '大阪府守口市日吉町' },
  { area: '御幸西町', city: '大阪府寝屋川市御幸西町' },
  { area: '招提田近', city: '大阪府枚方市招提田近' },
  { area: '富田丘町', city: '大阪府高槻市富田丘町' },
  { area: '西福井', city: '大阪府茨木市西福井' },
  { area: '箕面市白島', city: '大阪府箕面市白島' },
  { area: '春木旭町', city: '大阪府岸和田市春木旭町' },
  { area: '青葉台', city: '大阪府和泉市青葉台' },
  { area: '松原市河合', city: '大阪府松原市河合' },
  { area: '太子田', city: '大阪府大東市太子田' },
  { area: '伏見区東浜南町', city: '京都府京都市伏見区東浜南町' },
  { area: '山科区大塚', city: '京都府京都市山科区大塚' },
  { area: '東灘区住吉台', city: '兵庫県神戸市東灘区住吉台' },
  { area: '灘区六甲台町', city: '兵庫県神戸市灘区六甲台町' },
  { area: '兵庫区水木通', city: '兵庫県神戸市兵庫区水木通' },
  { area: '長田区菅原通', city: '兵庫県神戸市長田区菅原通' },
  { area: '須磨区須磨浦通', city: '兵庫県神戸市須磨区須磨浦通' },
  { area: '垂水区垂水町', city: '兵庫県神戸市垂水区垂水町' },
  { area: '西大寺国見町', city: '奈良県奈良市西大寺国見町' },
  { area: '浜大津', city: '滋賀県大津市浜大津' },
  { area: '鳥飼中', city: '大阪府摂津市鳥飼中' },
  { area: '大師町', city: '大阪府河内長野市大師町' },
  { area: '津門西口町', city: '兵庫県西宮市津門西口町' },
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
