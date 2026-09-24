#!/usr/bin/env node
'use strict';
/**
 * 取込済み応募者の年齢データがどこまで埋まっているかを、全期間・媒体別に確認する（読み取り専用）。
 * スプレッドシート取込(pullFromSheets)の年齢同期バグ修正（2026-09-24）が効いているか確認する目的。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/age-completeness-report.js
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

const { DatabaseSync } = require('node:sqlite');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const pct = (n, d) => (d > 0 ? (100 * n / d).toFixed(1) + '%' : '−');
const pad = (s, n) => String(s).padEnd(n, ' ');
const padL = (s, n) => String(s).padStart(n, ' ');
const MEDIA_NAME = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ/engage(旧データ混在の可能性)', google: 'Googleしごと', engage: 'engage', seniorjob: 'シニアジョブ', '': '(未設定)' };

// 全期間・有効応募（is_duplicate=0）のみ対象
const rows = db.prepare(`SELECT media, age, applied_at FROM applicants WHERE is_duplicate = 0`).all();

console.log(`\n==================== 年齢データ充足率レポート（全期間・有効応募ベース） ====================\n`);
console.log(`対象件数: ${rows.length}件\n`);

const byMedia = {};
for (const r of rows) {
  const m = r.media || '';
  byMedia[m] = byMedia[m] || { total: 0, withAge: 0 };
  byMedia[m].total++;
  if (r.age && r.age > 0) byMedia[m].withAge++;
}

console.log('■媒体別 年齢データ充足率');
console.log('  ' + pad('媒体', 30) + padL('有効応募', 9) + padL('年齢あり', 9) + padL('充足率', 9));
for (const [m, v] of Object.entries(byMedia).sort((a, b) => b[1].total - a[1].total)) {
  console.log('  ' + pad(MEDIA_NAME[m] ?? m, 30) + padL(v.total, 9) + padL(v.withAge, 9) + padL(pct(v.withAge, v.total), 9));
}

// 直近7日以内に応募したものだけで見た充足率（=最近の取込・架電で新しく埋まっているか）
const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
const since7 = jst(-6 * 86400000);
const recentByMedia = {};
for (const r of rows) {
  if ((r.applied_at || '').slice(0, 10) < since7) continue;
  const m = r.media || '';
  recentByMedia[m] = recentByMedia[m] || { total: 0, withAge: 0 };
  recentByMedia[m].total++;
  if (r.age && r.age > 0) recentByMedia[m].withAge++;
}
console.log('\n■媒体別 年齢データ充足率（直近7日応募分のみ）');
console.log('  ' + pad('媒体', 30) + padL('有効応募', 9) + padL('年齢あり', 9) + padL('充足率', 9));
for (const [m, v] of Object.entries(recentByMedia).sort((a, b) => b[1].total - a[1].total)) {
  console.log('  ' + pad(MEDIA_NAME[m] ?? m, 30) + padL(v.total, 9) + padL(v.withAge, 9) + padL(pct(v.withAge, v.total), 9));
}

console.log(`\n※ 全期間の数値は年齢同期バグ修正（2026-09-24）より前の取込データを多く含むため低いのが通常。`);
console.log('※ 「📥 スプレッドシートから取込」を実行した後にこのスクリプトを再実行すると、充足率が上がっているか確認できる。\n');
