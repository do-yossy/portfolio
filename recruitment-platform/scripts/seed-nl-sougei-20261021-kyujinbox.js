#!/usr/bin/env node
'use strict';
/**
 * NOWLIVE（nl）／送迎系求人（求人ボックス掲載）第3弾 25件（関西）
 * 2026-10-16、日次の求人ボックス求人作成。移動販売の送迎・催事スタッフ送迎のみ（配送・専属は含めない）。
 * 勤務地は、既存の全弾と重複しない実在の町名のみ（連番丁目は使わない）。
 * 冪等: 今回のタイトル（company='nl'）のみ削除してから作り直す。
 *
 * 実行: node --experimental-sqlite scripts/seed-nl-sougei-20261021-kyujinbox.js
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
  { area: '堺区宿院町西', city: '大阪府堺市堺区宿院町西' },
  { area: '堺区熊野町東', city: '大阪府堺市堺区熊野町東' },
  { area: '西区浜寺石津町', city: '大阪府堺市西区浜寺石津町' },
  { area: '南区泉ケ丘', city: '大阪府堺市南区泉ケ丘' },
  { area: '小阪', city: '大阪府東大阪市小阪' },
  { area: '永和', city: '大阪府東大阪市永和' },
  { area: '俊徳町', city: '大阪府東大阪市俊徳町' },
  { area: '泉町', city: '大阪府吹田市泉町' },
  { area: '春日', city: '大阪府茨木市春日' },
  { area: '城西町', city: '大阪府高槻市城西町' },
  { area: '大垣内町', city: '大阪府枚方市大垣内町' },
  { area: '池田西町', city: '大阪府寝屋川市池田西町' },
  { area: '御堂町', city: '大阪府門真市御堂町' },
  { area: '幸福町', city: '大阪府門真市幸福町' },
  { area: '八尾木', city: '大阪府八尾市八尾木' },
  { area: '箕面', city: '大阪府箕面市箕面' },
  { area: '鳥飼本町', city: '大阪府摂津市鳥飼本町' },
  { area: '羽衣', city: '大阪府高石市羽衣' },
  { area: '旭町', city: '大阪府泉大津市旭町' },
  { area: '府中町', city: '大阪府和泉市府中町' },
  { area: '宮前町', city: '大阪府岸和田市宮前町' },
  { area: '上町', city: '大阪府泉佐野市上町' },
  { area: '寿町', city: '大阪府富田林市寿町' },
  { area: '古市', city: '大阪府羽曳野市古市' },
  { area: '八幡屋', city: '大阪府大阪市港区八幡屋' },
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
