#!/usr/bin/env node
'use strict';
/**
 * 【読み取り専用】過去のIndeed求人内容の復元。Indeedにログインできない会社（sq/bg/pe/nc）向け。
 * 2026-10-02、ユーザー要望：「過去の求人内容をみたいが、インディードで昔使っていたアカウントでもうログインできない」
 *
 * 情報源は2つ：
 *   1. jobs テーブル … 現在DBに残っている求人のタイトル・給与・本文（媒体問わず全件）
 *   2. applicants テーブル … 応募時のjob_title（Indeed上の実際のタイトルがそのまま残る。削除済み求人も分かる）
 * 出力：logs/past-jobs/<会社>.md（本文付き）。DBは変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/export-past-jobs.js sq bg pe nc
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);
const companies = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!companies.length) { console.error('使い方: node --experimental-sqlite scripts/export-past-jobs.js sq bg pe nc'); process.exit(1); }
const outDir = path.join(__dirname, '..', 'logs', 'past-jobs');
fs.mkdirSync(outDir, { recursive: true });

for (const co of companies) {
  const jobs = db.prepare(`SELECT title, job_type, salary, target_media, created_at, is_published, description FROM jobs WHERE company = ? ORDER BY created_at`).all(co);
  const apps = db.prepare(`SELECT job_title, media, COUNT(*) c, SUM(CASE WHEN is_duplicate=0 THEN 1 ELSE 0 END) valid,
      SUM(CASE WHEN is_duplicate=0 AND status='対応中' THEN 1 ELSE 0 END) inprog, MIN(substr(applied_at,1,10)) first, MAX(substr(applied_at,1,10)) last
      FROM applicants WHERE company = ? AND job_title != '' GROUP BY job_title, media ORDER BY c DESC`).all(co);
  let md = `# ${co} 過去求人の復元\n\n## A. 応募があった求人タイトル（応募時の実際の掲載名・削除済み含む）\n\n| タイトル | 媒体 | 応募 | 有効 | 対応中 | 期間 |\n|---|---|---|---|---|---|\n`;
  for (const a of apps) md += `| ${a.job_title.replace(/\|/g, '/')} | ${a.media} | ${a.c} | ${a.valid} | ${a.inprog} | ${a.first}〜${a.last} |\n`;
  md += `\n## B. 現在DBに残っている求人（${jobs.length}件）\n`;
  for (const j of jobs) md += `\n### ${j.title}\n- 職種: ${j.job_type} / 給与: ${j.salary} / 媒体: ${j.target_media} / 作成: ${(j.created_at || '').slice(0, 10)}\n\n${j.description}\n`;
  const f = path.join(outDir, `${co}.md`);
  fs.writeFileSync(f, md);
  console.log(`${co}: 応募タイトル${apps.length}種 / 求人${jobs.length}件 → ${f}`);
}
