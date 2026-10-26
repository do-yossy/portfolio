#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-26 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-yp-kyujinbox-round8 と同一）。
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-yp-kyujinbox-round7 と同一）。
 * YUMIPRO AGENCY（yp）／お客様送迎・スタッフ送迎・専属ドライバー正社員求人（求人ボックス掲載）— 第7弾25件
 *
 * 2026-10-14、日次の求人ボックス求人作成に伴う追加バッチ。純増方針（既存64件は削除しない）。
 * 第1〜3弾と重複しない新規25エリアで構成。
 *
 * 実行: node --experimental-sqlite scripts/seed-yp-kyujinbox-round9.js
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
  { area: '夙川町', city: '兵庫県西宮市夙川町' },
  { area: '浜田町', city: '兵庫県尼崎市浜田町' },
  { area: '荒牧南', city: '兵庫県伊丹市荒牧南' },
  { area: '精道町', city: '兵庫県芦屋市精道町' },
  { area: '越水町', city: '兵庫県西宮市越水町' },
  { area: '玉江橋', city: '兵庫県尼崎市玉江橋' },
  { area: '桜ケ丘', city: '兵庫県伊丹市桜ケ丘' },
  { area: '西蔵町', city: '兵庫県芦屋市西蔵町' },
  { area: '南郷町', city: '兵庫県西宮市南郷町' },
  { area: '長洲本通', city: '兵庫県尼崎市長洲本通' },
  { area: '緑ケ丘', city: '兵庫県伊丹市緑ケ丘' },
  { area: '親王塚町', city: '兵庫県芦屋市親王塚町' },
  { area: '石刈町', city: '兵庫県西宮市石刈町' },
  { area: '神田北通', city: '兵庫県尼崎市神田北通' },
  { area: '伊丹市野間', city: '兵庫県伊丹市野間' },
  { area: '朝日ケ丘町', city: '兵庫県芦屋市朝日ケ丘町' },
  { area: '津門大塚町', city: '兵庫県西宮市津門大塚町' },
  { area: '神田中通', city: '兵庫県尼崎市神田中通' },
  { area: '野間北', city: '兵庫県伊丹市野間北' },
  { area: '三条町', city: '兵庫県芦屋市三条町' },
  { area: '津門綾羽町', city: '兵庫県西宮市津門綾羽町' },
  { area: '神田南通', city: '兵庫県尼崎市神田南通' },
  { area: '梅ノ木', city: '兵庫県伊丹市梅ノ木' },
  { area: '翠ケ丘町', city: '兵庫県芦屋市翠ケ丘町' },
  { area: '津門住江町', city: '兵庫県西宮市津門住江町' },
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
