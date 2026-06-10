#!/usr/bin/env node
'use strict';
// 本日 applied_at の架電リスト応募者を一覧表示（カウントの内訳確認用）
// 実行: node --experimental-sqlite scripts/check-today-applicants.js

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

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const todayJST = new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);

const rows = db.prepare(`
  SELECT name, company, media, applied_at, created_at, is_imported
  FROM applicants
  WHERE is_archived = 0 AND applied_at >= ?
  ORDER BY applied_at DESC, created_at DESC
`).all(todayJST);

console.log(`\n本日(${todayJST})の新規応募: ${rows.length}件\n`);
rows.forEach(r => {
  console.log(`  ${r.name} | ${r.company}/${r.media} | applied_at: ${r.applied_at} | created_at: ${r.created_at.slice(0,16)} | imported: ${r.is_imported}`);
});
