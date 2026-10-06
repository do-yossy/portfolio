#!/usr/bin/env node
'use strict';
/**
 * 【読み取り専用・個人情報は出力しない】Indeedの応募者を会社別に集計し、
 * 「Indeedアナリティクスの応募数」と「システムの有効応募数」のずれの原因（同一人物の複数応募・他社との重複）を調べる。
 * 2026-10-06、背景：YUMIPROのIndeed応募（アナリティクス17件）に対し、システムの有効応募が3件だった。
 *
 * 出力（会社ごと）:
 *   ・応募件数（applicants行数）／ユニーク人数（電話番号の正規化値で判定）／1人あたり応募件数
 *   ・is_duplicate の内訳（過去応募・他社と重複 など）、他社にも応募している人数
 *   ・求人タイトル別の応募件数と、ユニーク人数
 *   ・ステータス内訳
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/analyze-indeed-applicants-by-company.js yp
 *   node --experimental-sqlite scripts/analyze-indeed-applicants-by-company.js yp am st sl --since 2026-09-28
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const si = argv.indexOf('--since');
const SINCE = si >= 0 ? argv[si + 1] : '2000-01-01';
const companies = argv.filter((a, i) => !a.startsWith('--') && (si < 0 || (i !== si + 1)));
if (!companies.length) { console.error('使い方: node --experimental-sqlite scripts/analyze-indeed-applicants-by-company.js <会社コード...> [--since YYYY-MM-DD]'); process.exit(1); }

const keyOf = r => r.normalized_phone || r.normalized_email || `id:${r.id}`;

for (const co of companies) {
  const rows = db.prepare(
    `SELECT id, job_title, status, is_duplicate, normalized_phone, normalized_email, substr(applied_at,1,10) d
     FROM applicants WHERE company = ? AND media = 'indeed' AND substr(applied_at,1,10) >= ?`
  ).all(co, SINCE);
  console.log(`\n==== ${co} Indeed応募（${SINCE}以降） ====`);
  if (!rows.length) { console.log('  該当なし'); continue; }

  const people = new Map();
  for (const r of rows) { const k = keyOf(r); people.set(k, (people.get(k) || 0) + 1); }
  const multi = [...people.values()].filter(n => n > 1).length;
  console.log(`  応募 ${rows.length}件 / ユニーク ${people.size}人（1人あたり ${(rows.length / people.size).toFixed(2)}件、複数求人に応募した人 ${multi}人）`);

  const dup = rows.filter(r => r.is_duplicate).length;
  console.log(`  is_duplicate=1: ${dup}件（有効 ${rows.length - dup}件）`);

  // 他社にも応募している人数
  const keys = [...people.keys()].filter(k => !k.startsWith('id:'));
  let other = 0;
  const q = db.prepare(`SELECT COUNT(*) n FROM applicants WHERE company != ? AND (normalized_phone = ? OR normalized_email = ?)`);
  for (const k of keys) { if (q.get(co, k, k).n > 0) other++; }
  console.log(`  他社にも応募歴がある人: ${other}人 / ${keys.length}人`);
  console.log(`  対応中: ${rows.filter(r => r.status === '対応中').length}件（応募の ${(100 * rows.filter(r => r.status === '対応中').length / rows.length).toFixed(1)}%）`);

  const byTitle = new Map();
  for (const r of rows) {
    const b = byTitle.get(r.job_title) || { n: 0, set: new Set(), dup: 0, active: 0 };
    b.n++; b.set.add(keyOf(r)); if (r.is_duplicate) b.dup++; if (r.status === '対応中') b.active++;
    byTitle.set(r.job_title, b);
  }
  console.log('  求人タイトル別（応募件数 / ユニーク人数 / 重複 / 対応中）:');
  [...byTitle.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([t, b]) => console.log(`    ${String(t).slice(0, 34).padEnd(36)} ${String(b.n).padStart(3)} / ${String(b.set.size).padStart(3)} / 重複${String(b.dup).padStart(2)} / 対応中${String(b.active).padStart(2)}`));

  const st = new Map();
  for (const r of rows) st.set(r.status, (st.get(r.status) || 0) + 1);
  console.log('  ステータス: ' + [...st.entries()].map(([k, v]) => `${k}=${v}`).join(' ／ '));
}
console.log('\n※ ユニーク人数は電話番号・メールの正規化値で判定（個人を特定する情報は出力しません）。');
