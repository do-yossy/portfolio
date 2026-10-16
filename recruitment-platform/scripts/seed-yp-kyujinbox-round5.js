#!/usr/bin/env node
'use strict';
/**
 * YUMIPRO AGENCY（yp）／お客様送迎・スタッフ送迎・専属ドライバー正社員求人（求人ボックス掲載）— 第5弾25件
 *
 * 2026-10-14、日次の求人ボックス求人作成に伴う追加バッチ。純増方針（既存64件は削除しない）。
 * 第1〜3弾と重複しない新規25エリアで構成。
 *
 * 実行: node --experimental-sqlite scripts/seed-yp-kyujinbox-round5.js
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
  { area: '昆陽', city: '兵庫県伊丹市昆陽' },
  { area: '売布', city: '兵庫県宝塚市売布' },
  { area: '中山寺', city: '兵庫県宝塚市中山寺' },
  { area: '火打', city: '兵庫県川西市火打' },
  { area: '大原町', city: '兵庫県芦屋市大原町' },
  { area: '船戸町', city: '兵庫県芦屋市船戸町' },
  { area: '岸地通', city: '兵庫県神戸市灘区岸地通' },
  { area: '住吉本町', city: '兵庫県神戸市東灘区住吉本町' },
  { area: '磯上通', city: '兵庫県神戸市中央区磯上通' },
  { area: '荒田町', city: '兵庫県神戸市兵庫区荒田町' },
  { area: '御蔵通', city: '兵庫県神戸市長田区御蔵通' },
  { area: '大明石町', city: '兵庫県明石市大明石町' },
  { area: '白浜町', city: '兵庫県姫路市白浜町' },
  { area: '平岡町', city: '兵庫県加古川市平岡町' },
  { area: '駅前町', city: '兵庫県三田市駅前町' },
  { area: '納屋町', city: '京都府京都市伏見区納屋町' },
  { area: '安朱', city: '京都府京都市山科区安朱' },
  { area: '音羽', city: '京都府京都市山科区音羽' },
  { area: '山ノ内', city: '京都府京都市右京区山ノ内' },
  { area: '西京極', city: '京都府京都市右京区西京極' },
  { area: '樫原', city: '京都府京都市西京区樫原' },
  { area: '平野', city: '京都府京都市北区平野' },
  { area: '三十三間堂廻り', city: '京都府京都市東山区三十三間堂廻り' },
  { area: '羽束師', city: '京都府京都市伏見区羽束師' },
  { area: '槇島', city: '京都府宇治市槇島' },
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
