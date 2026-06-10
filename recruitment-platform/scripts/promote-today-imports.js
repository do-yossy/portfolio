#!/usr/bin/env node
'use strict';
/**
 * 本日取り込んだ応募者を架電リスト（新規応募）に昇格する
 * 実行: node --experimental-sqlite scripts/promote-today-imports.js
 *
 * DBはUTC保存のため、JST（UTC+9）で「今日」に当たる範囲を検索する。
 * 例: JST 2026-06-10 → UTC 2026-06-09T15:00:00Z 〜 2026-06-10T14:59:59Z
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

// JST midnight → UTC
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const nowMs = Date.now();
const todayJST = new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10); // 'YYYY-MM-DD' in JST
const todayMidnightUTC = new Date(todayJST + 'T00:00:00+09:00').toISOString(); // JST midnight in UTC

console.log(`日本時間 ${todayJST} に取り込まれた応募者を対象に検索します...`);
console.log(`(UTC基準: ${todayMidnightUTC} 以降)`);

// 本日JST created_at で is_archived=1 の応募者を確認
const targets = db.prepare(`
  SELECT id, name, company, media, status, applied_at, created_at
  FROM applicants
  WHERE created_at >= ? AND is_archived = 1
  ORDER BY created_at DESC
`).all(todayMidnightUTC);

// is_archived=0 だが applied_at が古い（本日新着として数えられていない）ものも確認
const misApplied = db.prepare(`
  SELECT id, name, company, media, status, applied_at, created_at
  FROM applicants
  WHERE created_at >= ? AND is_archived = 0 AND applied_at < ?
  ORDER BY created_at DESC
`).all(todayMidnightUTC, todayJST);

if (targets.length === 0 && misApplied.length === 0) {
  console.log('\n本日取り込んで補正が必要な応募者はいません。');
  // 参考: 本日の架電リスト件数を表示
  const inList = db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND applied_at >= ?`).get(todayJST).c;
  console.log(`現在の本日新規応募数: ${inList}件`);
  process.exit(0);
}

const nowISO = new Date().toISOString();

if (targets.length > 0) {
  console.log(`\n【過去リスト → 架電リストに移動】${targets.length}件`);
  targets.forEach(r => console.log(`  ${r.name} | ${r.company}/${r.media} | ${r.status} | applied_at: ${r.applied_at}`));

  const r1 = db.prepare(`
    UPDATE applicants
    SET is_archived = 0, is_imported = 0,
        applied_at = ?, applied_month = ?,
        status = '新規', updated_at = ?
    WHERE created_at >= ? AND is_archived = 1
  `).run(todayJST, todayJST.slice(0, 7), nowISO, todayMidnightUTC);
  console.log(`✅ ${r1.changes}件を架電リストに移動しました。`);
}

if (misApplied.length > 0) {
  console.log(`\n【applied_at補正（架電リスト内・応募日が古い）】${misApplied.length}件`);
  misApplied.forEach(r => console.log(`  ${r.name} | ${r.company}/${r.media} | applied_at: ${r.applied_at} → ${todayJST}`));

  const r2 = db.prepare(`
    UPDATE applicants
    SET applied_at = ?, applied_month = ?, updated_at = ?
    WHERE created_at >= ? AND is_archived = 0 AND applied_at < ?
  `).run(todayJST, todayJST.slice(0, 7), nowISO, todayMidnightUTC, todayJST);
  console.log(`✅ ${r2.changes}件の応募日を本日に補正しました。`);
}

console.log('\n管理画面 /admin をリロードして確認してください。');
