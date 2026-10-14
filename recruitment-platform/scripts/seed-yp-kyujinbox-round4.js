#!/usr/bin/env node
'use strict';
/**
 * YUMIPRO AGENCY（yp）／お客様送迎・スタッフ送迎・専属ドライバー正社員求人（求人ボックス掲載）— 第4弾25件
 *
 * 2026-10-14、日次の求人ボックス求人作成に伴う追加バッチ。純増方針（既存64件は削除しない）。
 * 第1〜3弾と重複しない新規25エリアで構成。
 *
 * 実行: node --experimental-sqlite scripts/seed-yp-kyujinbox-round4.js
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
  { area: '四条烏丸', city: '京都府京都市下京区烏丸通' },
  { area: '河原町', city: '京都府京都市中京区河原町通' },
  { area: '西院', city: '京都府京都市右京区西院' },
  { area: '北大路', city: '京都府京都市北区小山' },
  { area: '竹田', city: '京都府京都市伏見区竹田' },
  { area: '桃山', city: '京都府京都市伏見区桃山町' },
  { area: '太秦', city: '京都府京都市右京区太秦' },
  { area: '嵐山', city: '京都府京都市西京区嵐山' },
  { area: '向日町', city: '京都府向日市寺戸町' },
  { area: '長岡天神', city: '京都府長岡京市天神' },
  { area: '三条京阪', city: '京都府京都市東山区三条通' },
  { area: '神戸三宮', city: '兵庫県神戸市中央区三宮町' },
  { area: '元町', city: '兵庫県神戸市中央区元町通' },
  { area: '新長田', city: '兵庫県神戸市長田区久保町' },
  { area: '六甲道', city: '兵庫県神戸市灘区岩屋中町' },
  { area: '垂水', city: '兵庫県神戸市垂水区日向' },
  { area: '西宮北口', city: '兵庫県西宮市北口町' },
  { area: '甲子園', city: '兵庫県西宮市甲子園町' },
  { area: '芦屋川', city: '兵庫県芦屋市業平町' },
  { area: '尼崎', city: '兵庫県尼崎市昭和通' },
  { area: '明石', city: '兵庫県明石市大明石町' },
  { area: '加古川', city: '兵庫県加古川市加古川町' },
  { area: '姫路', city: '兵庫県姫路市駅前町' },
  { area: '宝塚', city: '兵庫県宝塚市栄町' },
  { area: '川西能勢口', city: '兵庫県川西市栄町' },
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
