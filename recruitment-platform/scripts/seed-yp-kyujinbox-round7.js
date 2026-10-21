#!/usr/bin/env node
'use strict';
/**
 * YUMIPRO AGENCY（yp）／お客様送迎・スタッフ送迎・専属ドライバー正社員求人（求人ボックス掲載）— 第7弾25件
 *
 * 2026-10-14、日次の求人ボックス求人作成に伴う追加バッチ。純増方針（既存64件は削除しない）。
 * 第1〜3弾と重複しない新規25エリアで構成。
 *
 * 実行: node --experimental-sqlite scripts/seed-yp-kyujinbox-round7.js
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

// 既存64件（第1〜3弾）と重複しない新規25エリア（京都・兵庫中心）
const AREAS = [
  { area: '旭通', city: '兵庫県神戸市中央区旭通' },
  { area: '水道筋', city: '兵庫県神戸市灘区水道筋' },
  { area: '岡本', city: '兵庫県神戸市東灘区岡本' },
  { area: '御影本町', city: '兵庫県神戸市東灘区御影本町' },
  { area: '神田町', city: '兵庫県神戸市垂水区神田町' },
  { area: '東園田町', city: '兵庫県尼崎市東園田町' },
  { area: '池尻', city: '兵庫県伊丹市池尻' },
  { area: '御殿山', city: '兵庫県宝塚市御殿山' },
  { area: '久代', city: '兵庫県川西市久代' },
  { area: '大和西', city: '兵庫県川西市大和西' },
  { area: '栄根', city: '兵庫県川西市栄根' },
  { area: '松ノ内町', city: '兵庫県芦屋市松ノ内町' },
  { area: '伊勢町', city: '兵庫県芦屋市伊勢町' },
  { area: '宮塚町', city: '兵庫県芦屋市宮塚町' },
  { area: '本町', city: '兵庫県明石市本町' },
  { area: '魚住町', city: '兵庫県明石市魚住町' },
  { area: '寺町通', city: '京都府京都市上京区寺町通' },
  { area: '石田', city: '京都府京都市伏見区石田' },
  { area: '四宮', city: '京都府京都市山科区四宮' },
  { area: '北大路', city: '京都府京都市北区北大路' },
  { area: '六地蔵', city: '京都府宇治市六地蔵' },
  { area: '追分', city: '京都府亀岡市追分' },
  { area: '駅前町', city: '京都府福知山市駅前町' },
  { area: '浜', city: '京都府舞鶴市浜' },
  { area: '青野町', city: '京都府綾部市青野町' },
];

async function main() {
  console.log(`\n🚗 YUMIPRO AGENCY 送迎ドライバー求人 第4弾（求人ボックス・純増）${COUNT}件 を登録します...\n`);
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
  console.log(`\n📊 結果: 新規 ${added}件（既存は削除せず維持、合計 ${existing.filter(j=>j.company===COMPANY).length + added}件）`);
  console.log('→ 掲載管理の YUMIPRO AGENCY タブ →「🚀 求人ボックスに投稿する」で投稿できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
