#!/usr/bin/env node
'use strict';
/**
 * 本日AI自動生成された求人を削除する
 * 実行: node --experimental-sqlite scripts/delete-today-ai-jobs.js
 * 確認のみ: node --experimental-sqlite scripts/delete-today-ai-jobs.js --dry-run
 */

const path = require('path');
const fs   = require('fs');

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

const { db } = require('../db');

const dryRun = process.argv.includes('--dry-run');

// JST 05:00 以降に作成された求人を対象
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const todayJST = new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
const cutoffUTC = new Date(todayJST + 'T05:00:00+09:00').toISOString();

console.log(`\n対象: ${todayJST} 05:00(JST) 以降に作成された求人`);
console.log(`UTC基準: ${cutoffUTC} 以降\n`);

const targets = db.prepare(`
  SELECT id, title, target_media, created_at
  FROM jobs
  WHERE created_at >= ?
  ORDER BY created_at DESC
`).all(cutoffUTC);

if (targets.length === 0) {
  console.log('削除対象の求人はありません。');
  process.exit(0);
}

console.log(`削除対象: ${targets.length}件`);
targets.forEach(r => {
  console.log(`  [${r.created_at.slice(0, 19)}] ${r.title}`);
});

if (dryRun) {
  console.log('\n--dry-run モードのため削除しません。');
  process.exit(0);
}

const result = db.prepare(`DELETE FROM jobs WHERE created_at >= ?`).run(cutoffUTC);
console.log(`\n✅ ${result.changes}件の求人を削除しました。`);
