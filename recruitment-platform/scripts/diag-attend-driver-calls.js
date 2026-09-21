#!/usr/bin/env node
'use strict';
/**
 * アテンドドライバー求人の対応移行率が9.1%で7日以上固定している原因を診断する。
 * 有効応募（is_duplicate=0）者のステータス・架電回数・最終架電日を一覧表示する（読み取り専用）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/diag-attend-driver-calls.js
 *   本番DBに対して実行する場合:
 *   flyctl ssh console -a sq-saiyou -C "node --experimental-sqlite scripts/diag-attend-driver-calls.js"
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

const { db } = require('../db');

const JOB_TITLE_LIKE = '%アテンドドライバー%';

const rows = db.prepare(`
  SELECT id, name, company, media, status, call_count, last_called_at, applied_at, notes
  FROM applicants
  WHERE is_duplicate = 0 AND job_title LIKE ?
  ORDER BY applied_at DESC
`).all(JOB_TITLE_LIKE);

console.log(`\n■ アテンドドライバー 有効応募者一覧（${rows.length}件）\n`);

const byStatus = {};
for (const r of rows) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
}

console.log('ステータス別内訳:');
for (const [status, c] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padStart(3)}  ${status || '(空)'}`);
}

const neverCalled = rows.filter(r => !r.call_count || r.call_count === 0);
console.log(`\n架電回数0件（未架電のまま）: ${neverCalled.length}件 / ${rows.length}件`);

console.log('\n詳細:');
console.log('  ' + 'status'.padEnd(8) + 'call_count'.padEnd(12) + 'last_called_at'.padEnd(18) + 'applied_at'.padEnd(22) + 'company/media'.padEnd(16) + 'notes');
for (const r of rows) {
  console.log(
    '  ' +
    String(r.status || '').padEnd(8) +
    String(r.call_count ?? 0).padEnd(12) +
    String(r.last_called_at || '(未架電)').padEnd(18) +
    String(r.applied_at || '').slice(0, 19).padEnd(22) +
    `${r.company}/${r.media}`.padEnd(16) +
    (r.notes || '')
  );
}

console.log(`\n判定の目安:`);
console.log(`  ・「架電回数0件」が大半 → 架電自体が行われていない（人員・優先順位付けの問題の可能性）`);
console.log(`  ・架電はされているが status が「対応中」に上がらない → ステータス更新漏れ、または本当に不通・辞退が多い`);
console.log('');
