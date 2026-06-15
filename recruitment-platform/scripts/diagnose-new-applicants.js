#!/usr/bin/env node
'use strict';

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

console.log('='.repeat(60));
console.log(`JST今日: ${todayJST}`);
console.log(`JST 05:00 の UTC: ${cutoffUTC}`);
console.log('='.repeat(60));

// 1. 新規応募カウント（opsNewStatsと同じロジック）
const newCount = db.prepare(`
  SELECT COUNT(*) c FROM applicants
  WHERE is_archived = 0 AND is_duplicate = 0 AND applied_at >= ?
`).get(todayJST).c;
console.log(`\n[1] 現在の新規応募数（画面表示と同じ）: ${newCount}件`);

// 2. 本日 created_at のレコード（カットオフ以降）
const todayCreated = db.prepare(`
  SELECT id, name, company, media, status, applied_at, is_archived, is_imported, is_duplicate, created_at
  FROM applicants WHERE created_at >= ?
  ORDER BY created_at DESC LIMIT 30
`).all(cutoffUTC);
console.log(`\n[2] 本日取込レコード（JST 05:00以降）: ${todayCreated.length}件`);
todayCreated.forEach(r => {
  const flag = [];
  if (r.is_archived) flag.push('archived');
  if (r.is_imported) flag.push('imported');
  if (r.is_duplicate) flag.push('duplicate');
  console.log(`  ${(r.name||'').padEnd(14)} applied_at=${r.applied_at||'(空)'} ${flag.join(',') || 'OK'} created=${r.created_at}`);
});

// 3. 問題レコード（カウント対象外）
const problems = db.prepare(`
  SELECT id, name, applied_at, is_archived, is_imported, is_duplicate, created_at
  FROM applicants WHERE created_at >= ? AND is_duplicate = 0
    AND (is_archived = 1 OR is_imported = 1 OR applied_at < ?)
  ORDER BY created_at DESC
`).all(cutoffUTC, todayJST);
console.log(`\n[3] 昇格が必要なレコード: ${problems.length}件`);
problems.forEach(r => {
  const why = [];
  if (r.is_archived) why.push('is_archived=1');
  if (r.is_imported) why.push('is_imported=1');
  if ((r.applied_at||'') < todayJST) why.push(`applied_at="${r.applied_at}"<今日`);
  console.log(`  ${(r.name||'').padEnd(14)} 理由: ${why.join(', ')}`);
});

// 4. created_at が古いが applied_at が今日のレコード（逆ケース）
const appliedTodayOldCreated = db.prepare(`
  SELECT COUNT(*) c FROM applicants
  WHERE applied_at >= ? AND created_at < ? AND is_duplicate = 0 AND is_archived = 0
`).get(todayJST, cutoffUTC).c;
console.log(`\n[4] applied_at=今日 だが created_at が古い（取込済み）: ${appliedTodayOldCreated}件`);

// 5. 最新10件
const recent = db.prepare(`
  SELECT name, applied_at, is_archived, is_imported, is_duplicate, created_at
  FROM applicants ORDER BY created_at DESC LIMIT 10
`).all();
console.log(`\n[5] 最新10件（created_at順）:`);
recent.forEach(r => {
  const flag = [r.is_archived?'arch':'',r.is_imported?'imp':'',r.is_duplicate?'dup':''].filter(Boolean).join(',');
  console.log(`  ${(r.name||'').padEnd(14)} applied=${r.applied_at||'(空)'} created=${r.created_at} [${flag||'正常'}]`);
});

console.log('\n' + '='.repeat(60));
if (problems.length > 0) {
  console.log('→ 昇格が必要なレコードがあります。');
  console.log('  node --experimental-sqlite scripts/promote-today-imports.js を実行してください。');
} else if (newCount === 0 && todayCreated.length > 0) {
  console.log('→ 本日取込済みだが新規応募に計上されていません。applied_atを確認してください。');
} else if (newCount > 0) {
  console.log(`→ 新規応募 ${newCount}件 が正常に計上されています。`);
} else {
  console.log('→ 本日の取込レコードが見つかりません。CSVが取り込まれているか確認してください。');
}
