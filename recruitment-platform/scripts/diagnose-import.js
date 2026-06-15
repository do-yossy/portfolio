#!/usr/bin/env node
'use strict';
// 取込が新着応募に反映されない問題の診断
// 実行: node --experimental-sqlite scripts/diagnose-import.js

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

const JST = 9 * 60 * 60 * 1000;
const todayJST = new Date(Date.now() + JST).toISOString().slice(0, 10);
const cutoffUTC = new Date(todayJST + 'T05:00:00+09:00').toISOString();

console.log(`\n===== 取込診断 (JST today: ${todayJST}) =====\n`);

// 1. 直近の取込ログ
console.log('--- 直近の取込ログ (10件) ---');
const logs = db.prepare(`
  SELECT created_at, action, status, message FROM logs
  WHERE action LIKE 'ops_%import%' OR action LIKE '%csv%'
  ORDER BY created_at DESC LIMIT 10
`).all();
if (logs.length === 0) console.log('  取込ログなし');
logs.forEach(l => console.log(`  [${l.created_at.slice(0, 19)}] ${l.action} ${l.status}: ${l.message.slice(0, 90)}`));

// 2. 今日5:00以降に作成されたレコードの内訳
console.log('\n--- 本日5:00(JST)以降に作成されたレコード ---');
const created = db.prepare(`
  SELECT is_archived, is_imported, is_duplicate, COUNT(*) c
  FROM applicants WHERE created_at >= ?
  GROUP BY is_archived, is_imported, is_duplicate
`).all(cutoffUTC);
if (created.length === 0) console.log('  なし（取込がDBに保存されていない）');
created.forEach(r => console.log(`  archived=${r.is_archived} imported=${r.is_imported} duplicate=${r.is_duplicate}: ${r.c}件`));

// 3. 今日5:00以降に更新されたレコード（promoteToNew経由を含む）
console.log('\n--- 本日5:00(JST)以降に更新されたレコード (最新10件) ---');
const updated = db.prepare(`
  SELECT name, company, media, status, applied_at, is_archived, is_imported, created_at, updated_at
  FROM applicants WHERE updated_at >= ?
  ORDER BY updated_at DESC LIMIT 10
`).all(cutoffUTC);
if (updated.length === 0) console.log('  なし');
updated.forEach(r => console.log(
  `  ${r.name} | ${r.company}/${r.media} | ${r.status} | applied_at=${r.applied_at} | archived=${r.is_archived} imported=${r.is_imported}`));

// 4. 新着応募タブのカウント条件と同じクエリ
const todayNew = db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND applied_at >= ?`).get(todayJST).c;
console.log(`\n--- 新着応募タブのカウント（is_archived=0 AND applied_at >= ${todayJST}）---`);
console.log(`  ${todayNew}件`);

// 5. applied_at の形式チェック（今日作成分）
console.log('\n--- 本日作成分の applied_at 形式サンプル ---');
const samples = db.prepare(`
  SELECT DISTINCT applied_at FROM applicants WHERE created_at >= ? LIMIT 10
`).all(cutoffUTC);
if (samples.length === 0) console.log('  なし');
samples.forEach(s => console.log(`  "${s.applied_at}"`));

console.log('\n===========================================\n');
