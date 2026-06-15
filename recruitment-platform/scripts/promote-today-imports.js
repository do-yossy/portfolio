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

// JST 05:00 → UTC（前日20:00 UTC）を基準にする
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const nowMs = Date.now();
const todayJST = new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10); // 'YYYY-MM-DD' in JST
const cutoffUTC = new Date(todayJST + 'T05:00:00+09:00').toISOString(); // JST 05:00 in UTC

console.log(`日本時間 ${todayJST} 05:00以降に取り込まれた応募者を対象に検索します...`);
console.log(`(UTC基準: ${cutoffUTC} 以降)`);

// 本日取り込んだのに新着計上されていない応募者（重複は除く）:
//   - 過去リスト行き (is_archived=1)
//   - 取込フラグ付き (is_imported=1) で新着に数えられない
//   - applied_at が過去日付のまま
const targets = db.prepare(`
  SELECT id, name, company, media, status, applied_at, is_archived, is_imported, created_at
  FROM applicants
  WHERE created_at >= ? AND is_duplicate = 0
    AND (is_archived = 1 OR is_imported = 1 OR applied_at < ?)
  ORDER BY created_at DESC
`).all(cutoffUTC, todayJST);

if (targets.length === 0) {
  console.log('\n本日取り込んで補正が必要な応募者はいません。');
  const inList = db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND applied_at >= ?`).get(todayJST).c;
  console.log(`現在の本日新規応募数: ${inList}件`);
  process.exit(0);
}

const nowISO = new Date().toISOString();

console.log(`\n【本日の新着応募に昇格】${targets.length}件`);
targets.forEach(r => console.log(`  ${r.name} | ${r.company}/${r.media} | ${r.status} | applied_at: ${r.applied_at} | archived=${r.is_archived} imported=${r.is_imported}`));

const r1 = db.prepare(`
  UPDATE applicants
  SET is_archived = 0, is_imported = 0,
      applied_at = ?, applied_month = ?,
      status = '新規', updated_at = ?
  WHERE created_at >= ? AND is_duplicate = 0
    AND (is_archived = 1 OR is_imported = 1 OR applied_at < ?)
`).run(todayJST, todayJST.slice(0, 7), nowISO, cutoffUTC, todayJST);
console.log(`✅ ${r1.changes}件を本日の新着応募に昇格しました。`);

const after = db.prepare(`SELECT COUNT(*) c FROM applicants WHERE is_archived = 0 AND applied_at >= ?`).get(todayJST).c;
console.log(`現在の本日新規応募数: ${after}件`);
console.log('\n管理画面 /admin をリロードして確認してください。');
