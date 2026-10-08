#!/usr/bin/env node
'use strict';
/**
 * YUMIPRO AGENCY（yp）／お客様送迎・スタッフ送迎・専属ドライバー正社員求人（求人ボックス掲載）— 第2弾25件
 *
 * 2026-10-09、ユーザー指示により「求人ボックスは純増しない・入替のみ」の方針を変更し、
 * ypの求人ボックスを純増（14件→39件）する。既存14件の削除は行わない（追加のみ）。
 * コンテンツは scripts/lib/taxi-funnel-content.js の yp プール（お客様送迎ドライバー/
 * スタッフ送迎ドライバー/専属ドライバー）を重み付きで巡回して使用。
 *
 * 実行: node --experimental-sqlite scripts/seed-yp-kyujinbox-round2.js
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

const { buildJob, pickByWeight } = require('./lib/taxi-funnel-content');
const { Jobs } = require('../db-factory');

const COMPANY = 'yp';
const COUNT = 25;

// 既存14件と重複しない新規25エリア（swap-kyujinbox-taxi-funnel.jsのAREASとは別の実在地名）
const AREAS = [
  { area: '梅田', city: '大阪府大阪市北区梅田' },
  { area: '福島', city: '大阪府大阪市福島区福島' },
  { area: '本町', city: '大阪府大阪市中央区本町' },
  { area: '天満', city: '大阪府大阪市北区天満' },
  { area: '中津', city: '大阪府大阪市北区中津' },
  { area: '天下茶屋', city: '大阪府大阪市西成区天下茶屋' },
  { area: '弁天町', city: '大阪府大阪市港区弁天' },
  { area: '緑橋', city: '大阪府大阪市東成区中道' },
  { area: '深江橋', city: '大阪府大阪市東成区深江南' },
  { area: '新深江', city: '大阪府大阪市東成区神路' },
  { area: '今里', city: '大阪府大阪市東成区大今里' },
  { area: '関目', city: '大阪府大阪市城東区関目' },
  { area: '野江内代', city: '大阪府大阪市城東区野江' },
  { area: '森ノ宮', city: '大阪府大阪市中央区森ノ宮中央' },
  { area: '玉造', city: '大阪府大阪市中央区玉造' },
  { area: '四天王寺前', city: '大阪府大阪市天王寺区四天王寺' },
  { area: '北加賀屋', city: '大阪府大阪市住之江区北加賀屋' },
  { area: '西長堀', city: '大阪府大阪市西区西長堀' },
  { area: '九条', city: '大阪府大阪市西区九条' },
  { area: '芦原橋', city: '大阪府大阪市浪速区芦原' },
  { area: '花園町', city: '大阪府大阪市西成区花園南' },
  { area: '岸里玉出', city: '大阪府大阪市西成区岸里東' },
  { area: '住吉大社', city: '大阪府大阪市住吉区住吉' },
  { area: '我孫子', city: '大阪府大阪市住吉区我孫子' },
  { area: '長居', city: '大阪府大阪市東住吉区長居' },
];

async function main() {
  console.log(`\n🚗 YUMIPRO AGENCY 送迎ドライバー求人 第2弾（求人ボックス・純増）${COUNT}件 を登録します...\n`);
  const existing = await Jobs.findAll();
  const existingPoolCount = existing.filter(j => j.company === COMPANY).length;
  let added = 0;
  for (let i = 0; i < COUNT; i++) {
    const a = AREAS[i % AREAS.length];
    const poolEntry = pickByWeight(COMPANY, existingPoolCount + i);
    const job = buildJob(COMPANY, poolEntry, a.area, a.city, '求人ボックス');
    await Jobs.create(job);
    console.log(`  ✅ 登録完了 [${job.jobType}]: ${job.title}`);
    added++;
  }
  console.log(`\n📊 結果: 新規 ${added}件（既存14件は削除せず維持、合計 ${existing.filter(j=>j.company===COMPANY).length + added}件）`);
  console.log('→ 掲載管理の YUMIPRO AGENCY タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
