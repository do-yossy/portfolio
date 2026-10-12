#!/usr/bin/env node
'use strict';
/**
 * YUMIPRO AGENCY（yp）／お客様送迎・スタッフ送迎・専属ドライバー正社員求人（求人ボックス掲載）— 第3弾25件
 *
 * 2026-10-12、日次の求人ボックス求人作成に伴う追加バッチ。純増方針（既存39件は削除しない）。
 * 第1〜2弾と重複しない新規25エリアで構成。
 *
 * 実行: node --experimental-sqlite scripts/seed-yp-kyujinbox-round3.js
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

// 既存39件（第1〜2弾）と重複しない新規25エリア
const AREAS = [
  { area: '堺東', city: '大阪府堺市堺区三国ケ丘御幸通' },
  { area: '北野田', city: '大阪府堺市東区北野田' },
  { area: '金剛', city: '大阪府富田林市甲田' },
  { area: '河内長野', city: '大阪府河内長野市本町' },
  { area: '美原', city: '大阪府堺市美原区小寺' },
  { area: '岸和田', city: '大阪府岸和田市野田町' },
  { area: '貝塚', city: '大阪府貝塚市海塚' },
  { area: '泉佐野', city: '大阪府泉佐野市市場東' },
  { area: '熊取', city: '大阪府泉南郡熊取町野田' },
  { area: '阪南', city: '大阪府阪南市黒田' },
  { area: '枚方市駅', city: '大阪府枚方市岡本町' },
  { area: '樟葉', city: '大阪府枚方市楠葉花園町' },
  { area: '寝屋川市駅', city: '大阪府寝屋川市早子町' },
  { area: '四条畷', city: '大阪府四條畷市中野本町' },
  { area: '大東', city: '大阪府大東市住道' },
  { area: '柏原', city: '大阪府柏原市上市' },
  { area: '藤井寺', city: '大阪府藤井寺市岡' },
  { area: '羽曳野', city: '大阪府羽曳野市誉田' },
  { area: '太子', city: '大阪府南河内郡太子町山田' },
  { area: '千里中央', city: '大阪府豊中市新千里東町' },
  { area: '豊中', city: '大阪府豊中市玉井町' },
  { area: '池田', city: '大阪府池田市満寿美町' },
  { area: '箕面萱野', city: '大阪府箕面市萱野' },
  { area: '茨木', city: '大阪府茨木市双葉町' },
  { area: '高槻市駅', city: '大阪府高槻市城北町' },
];

async function main() {
  console.log(`\n🚗 YUMIPRO AGENCY 送迎ドライバー求人 第3弾（求人ボックス・純増）${COUNT}件 を登録します...\n`);
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
