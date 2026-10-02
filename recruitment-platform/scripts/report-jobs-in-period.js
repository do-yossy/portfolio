#!/usr/bin/env node
'use strict';
/**
 * 指定期間に掲載されていた求人を調査するレポートスクリプト（読み取り専用）。
 * 2026-10-02、ユーザー要望：「2025年7月～2025年12月に掲載していた求人は調べれるか」
 *
 * 2つの情報源を使う：
 *   1. jobs テーブル（created_at / published_at が期間内）
 *      → 現在もDBに残っている求人のみ対象（求人ボックス入替等で削除済みの求人は含まれない）
 *   2. applications テーブル（applied_at が期間内、job_title は応募時点の文字列がそのまま保存）
 *      → 既に削除済みの求人でも「その期間に実際に応募があった＝掲載されていた」ことが分かる
 *         （applications.job_title は求人が後から削除・改名されても影響を受けない）
 *
 * 完全な「その期間に掲載されていた全求人」を復元することはできない（履歴・監査ログの
 * 仕組みが無いため）が、上記2つを突き合わせることで実態にかなり近い情報が得られる。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/report-jobs-in-period.js 2025-07-01 2025-12-31
 *   node --experimental-sqlite scripts/report-jobs-in-period.js 2025-07-01 2025-12-31 --company st
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

const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith('--'));
const START = positional[0];
const END = positional[1];
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const COMPANY = val('--company', null);

if (!START || !END) {
  console.error('使い方: node --experimental-sqlite scripts/report-jobs-in-period.js <開始日YYYY-MM-DD> <終了日YYYY-MM-DD> [--company st]');
  process.exit(1);
}
const startISO = `${START}T00:00:00Z`;
const endISO = `${END}T23:59:59Z`;

console.log(`\n=== ${START} 〜 ${END} に掲載されていた求人の調査${COMPANY ? `（会社: ${COMPANY}）` : ''} ===\n`);

// 1) jobsテーブル：現在も残っている求人（期間内に作成 or 公開されたもの）
console.log('【1】現在もDBに残っている求人（created_at または published_at が期間内）');
const jobsQuery = COMPANY
  ? `SELECT id, company, title, job_type, target_media, created_at, published_at, is_published
     FROM jobs WHERE company = ? AND ((created_at BETWEEN ? AND ?) OR (published_at BETWEEN ? AND ?))
     ORDER BY company, created_at`
  : `SELECT id, company, title, job_type, target_media, created_at, published_at, is_published
     FROM jobs WHERE (created_at BETWEEN ? AND ?) OR (published_at BETWEEN ? AND ?)
     ORDER BY company, created_at`;
const jobsRows = COMPANY
  ? db.prepare(jobsQuery).all(COMPANY, startISO, endISO, startISO, endISO)
  : db.prepare(jobsQuery).all(startISO, endISO, startISO, endISO);

if (jobsRows.length === 0) {
  console.log('  該当なし（現在のDBには残っていません）');
} else {
  for (const j of jobsRows) {
    console.log(`  [${j.company}] ${j.job_type} | ${j.title.slice(0, 40)} | 作成:${(j.created_at||'').slice(0,10)} 公開:${(j.published_at||'').slice(0,10)} 媒体:${j.target_media}`);
  }
}
console.log(`  → ${jobsRows.length}件`);

// 2) applicationsテーブル：その期間に実際に応募があった求人タイトル（削除済みでも分かる）
console.log('\n【2】その期間に応募があった求人タイトル（応募時点の文字列。既に削除済みの求人も含む）');
const appQuery = `
  SELECT a.job_title, COUNT(*) c, MIN(a.applied_at) first_applied, MAX(a.applied_at) last_applied,
         (SELECT company FROM jobs WHERE id = a.job_id) as job_company
  FROM applications a
  WHERE a.applied_at BETWEEN ? AND ? AND a.job_title != ''
  GROUP BY a.job_title
  ORDER BY c DESC
`;
const appRows = db.prepare(appQuery).all(startISO, endISO);
const filtered = COMPANY ? appRows.filter(r => r.job_company === COMPANY) : appRows;

if (filtered.length === 0) {
  console.log('  該当なし');
} else {
  for (const r of filtered) {
    console.log(`  ${r.job_title.slice(0, 50)} | 応募${r.c}件 | ${r.first_applied?.slice(0,10)}〜${r.last_applied?.slice(0,10)}${r.job_company ? ` | 会社:${r.job_company}` : ' | （求人は削除済み・会社不明）'}`);
  }
}
console.log(`  → ${filtered.length}求人タイトル`);

console.log('\n※ 削除済み求人の会社が「不明」の場合、jobsテーブルから該当レコードが消えているため、\n   応募時点でどの会社の求人だったか直接には分かりません（job_titleから推測する必要があります）。\n※ これはjobsテーブル・applicationsテーブルという限られた情報源からの復元であり、\n   完全な履歴（監査ログ）ではない点にご留意ください。\n');
