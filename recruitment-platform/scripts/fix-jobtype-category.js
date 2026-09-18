#!/usr/bin/env node
'use strict';
/**
 * 求人ボックスに投稿済みの求人について、正しい「職種区分」(select[name="jobType"]の26大分類)を
 * 判定し、会社別の反映キュー(logs/reflect-jobtype-queue-<co>.json)を書き出す。
 *
 * 背景: 2026-06-02のkyujinbox_poster.pyの変更で、新規投稿時の職種区分選択が
 * 「ドライバー系キーワード」を全求人に無条件優先するようになっていたため、ピッキング・
 * 事務・営業・イベント等ドライバー以外の求人も一律「配送・物流・交通」に誤って
 * 割り当てられていた（2026-09-18にkyujinbox_poster.py側は修正済み）。
 *
 * このスクリプトはDBそのものは一切変更しない（job_typeフィールドは元々正しい）。
 * 対象は「投稿済み(kyujinbox_posted_at + kyujinbox_job_number あり)」かつ、
 * job_typeがドライバー/送迎系（=旧バグでも結果的に正しかった）以外の求人のみ。
 *
 * 使い方: node scripts/fix-jobtype-category.js
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const db = new DatabaseSync(path.join(DATA_DIR, 'recruitment.db'));

// kyujinbox_poster.py の CATEGORY_KEYWORDS と同一（2026-09-18時点）
const CATEGORY_KEYWORDS = [
  { kws: ['ドライバー', '配送', '運送', '軽貨物', '宅配', '配達', 'デリバリー', '送迎'], label: '配送・物流・交通' },
  { kws: ['ピッキング', '梱包', '組み立て', '検品', '軽作業', '物流倉庫', '倉庫'], label: '軽作業・倉庫作業' },
  { kws: ['製造', '品質管理', '機械オペレーター'], label: '工場・製造' },
  { kws: ['技術', 'メンテナンス', '点検'], label: '警備・清掃・点検' },
  { kws: ['営業', 'コールセンター'], label: '営業・コールセンター' },
  { kws: ['事務', 'サポート', '運行管理', '受付'], label: '事務・受付' },
  { kws: ['イベント', '企画'], label: 'レジャー・イベント・スポーツ' },
];

function targetLabelFor(jobType) {
  if (!jobType) return null;
  for (const { kws, label } of CATEGORY_KEYWORDS) {
    if (kws.some(kw => jobType.includes(kw))) return label;
  }
  return null;
}

const DRIVER_GROUP_LABEL = CATEGORY_KEYWORDS[0].label; // '配送・物流・交通'（旧バグでも結果的に正しかった分）

const rows = db.prepare(
  "SELECT id, company, job_type, kyujinbox_job_number FROM jobs WHERE kyujinbox_posted_at IS NOT NULL AND kyujinbox_job_number IS NOT NULL AND kyujinbox_job_number != ''"
).all();

const byCo = {};
let skippedAlreadyOk = 0, skippedNoMatch = 0, targeted = 0;
for (const r of rows) {
  const label = targetLabelFor(r.job_type);
  if (!label) { skippedNoMatch++; continue; }
  if (label === DRIVER_GROUP_LABEL) { skippedAlreadyOk++; continue; } // 旧バグでも既に正しい
  (byCo[r.company] ||= []).push({ jobNumber: r.kyujinbox_job_number, jobTypeLabel: label, _jobType: r.job_type });
  targeted++;
}

console.log('=== 職種区分 修正対象の集計 ===\n');
for (const co of Object.keys(byCo).sort()) {
  console.log(`[${co}] 対象 ${byCo[co].length}件`);
  const byLabel = {};
  for (const j of byCo[co]) byLabel[j.jobTypeLabel] = (byLabel[j.jobTypeLabel] || 0) + 1;
  for (const [label, n] of Object.entries(byLabel)) console.log(`   → ${label}: ${n}件`);
}
console.log(`\n合計: 対象 ${targeted}件 / 既に正しい(配送・物流・交通) ${skippedAlreadyOk}件 / 分類不能 ${skippedNoMatch}件`);

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
for (const co of Object.keys(byCo)) {
  const queue = byCo[co].map(({ jobNumber, jobTypeLabel }) => ({ jobNumber, jobTypeLabel }));
  fs.writeFileSync(path.join(logsDir, `reflect-jobtype-queue-${co}.json`), JSON.stringify(queue, null, 2));
  console.log(`  📝 logs/reflect-jobtype-queue-${co}.json (${queue.length}件) を書き出しました`);
}
