#!/usr/bin/env node
'use strict';
/**
 * 【2026-10-23 複製】勤務地のみ新規25件に差し替え（本文・条件は seed-yp-kyujinbox-round7 と同一）。
 * YUMIPRO AGENCY（yp）／お客様送迎・スタッフ送迎・専属ドライバー正社員求人（求人ボックス掲載）— 第7弾25件
 *
 * 2026-10-14、日次の求人ボックス求人作成に伴う追加バッチ。純増方針（既存64件は削除しない）。
 * 第1〜3弾と重複しない新規25エリアで構成。
 *
 * 実行: node --experimental-sqlite scripts/seed-yp-kyujinbox-round8.js
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
  { area: '甲陽園東山町', city: '兵庫県西宮市甲陽園東山町' },
  { area: '武庫元町', city: '兵庫県尼崎市武庫元町' },
  { area: '伊丹市南町', city: '兵庫県伊丹市南町' },
  { area: '打出小槌町', city: '兵庫県芦屋市打出小槌町' },
  { area: '甲陽園若江町', city: '兵庫県西宮市甲陽園若江町' },
  { area: '武庫町', city: '兵庫県尼崎市武庫町' },
  { area: '伊丹市北園', city: '兵庫県伊丹市北園' },
  { area: '前田町', city: '兵庫県芦屋市前田町' },
  { area: '甲陽園山王町', city: '兵庫県西宮市甲陽園山王町' },
  { area: '水明町', city: '兵庫県尼崎市水明町' },
  { area: '鈴原町', city: '兵庫県伊丹市鈴原町' },
  { area: '公光町', city: '兵庫県芦屋市公光町' },
  { area: '甲陽園目神山町', city: '兵庫県西宮市甲陽園目神山町' },
  { area: '西立花町', city: '兵庫県尼崎市西立花町' },
  { area: '昆陽北', city: '兵庫県伊丹市昆陽北' },
  { area: '川西町', city: '兵庫県芦屋市川西町' },
  { area: '苦楽園一番町', city: '兵庫県西宮市苦楽園一番町' },
  { area: '西園田町', city: '兵庫県尼崎市西園田町' },
  { area: '昆陽泉町', city: '兵庫県伊丹市昆陽泉町' },
  { area: '月若町', city: '兵庫県芦屋市月若町' },
  { area: '苦楽園二番町', city: '兵庫県西宮市苦楽園二番町' },
  { area: '梅元町', city: '兵庫県尼崎市梅元町' },
  { area: '瑞穂町', city: '兵庫県伊丹市瑞穂町' },
  { area: '芦屋市浜町', city: '兵庫県芦屋市浜町' },
  { area: '苦楽園三番町', city: '兵庫県西宮市苦楽園三番町' },
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
