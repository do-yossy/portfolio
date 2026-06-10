#!/usr/bin/env node
'use strict';
/**
 * 本日 created_at のインポート済み応募者を架電リスト（新規応募）に昇格する
 * 実行: node --experimental-sqlite scripts/promote-today-imports.js
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

const today = new Date().toISOString().slice(0, 10);

// 本日 created_at で is_archived=1 の応募者を確認
const targets = db.prepare(`
  SELECT id, name, company, media, status, applied_at, created_at
  FROM applicants
  WHERE created_at >= ? AND is_archived = 1
  ORDER BY created_at DESC
`).all(today + 'T00:00:00.000Z');

if (targets.length === 0) {
  console.log('本日取り込んで過去リストにある応募者はいません。');
  process.exit(0);
}

console.log(`\n対象: ${targets.length}件`);
targets.forEach(r => console.log(`  ${r.name} | ${r.company}/${r.media} | ${r.status} | applied_at: ${r.applied_at}`));

// is_archived=0, applied_at=today, status=新規 に更新
const now = new Date().toISOString();
const result = db.prepare(`
  UPDATE applicants
  SET is_archived = 0,
      is_imported = 0,
      applied_at  = ?,
      applied_month = ?,
      status      = '新規',
      updated_at  = ?
  WHERE created_at >= ? AND is_archived = 1
`).run(today, today.slice(0, 7), now, today + 'T00:00:00.000Z');

console.log(`\n✅ ${result.changes}件を架電リスト（新規応募）に移動しました。`);
console.log('管理画面 /admin で確認してください。');
