#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】給与テスト：同じ職種のIndeed求人のうち3件だけ「月収25万円」にし、
 * 通常給与の求人と比べて「対応中」に繋がるかを分析できるようにする。
 * 2026-10-02、ユーザー要望：「インディードの求人を作る際に3つだけ月収25万円にして
 * 対応中に繋がっているか分析できるようにしたい」
 *
 * 仕組み：
 *   ・mark    : 指定した会社・職種のIndeed求人から3件を選び、タイトル・給与欄・本文の【給与】を
 *               「月収25万円」に変更する。タイトルに必ず「月収25万円」が入るため、応募者の
 *               job_title（Indeed上のタイトルがそのまま入る）で通常求人と区別できる。
 *   ・analyze : applicants.job_title に「月収25万円」を含む応募 と、同じ会社・同じ職種名を
 *               含むそれ以外の応募を比べ、応募数・有効応募・対応中・対応移行率を出す。
 *
 * 比較を公平にするため、3件は同じ職種の中からエリアが偏らないよう等間隔で選ぶ。
 * 給与以外（職種名・本文・勤務条件）は変更しない。
 *
 * 注意：広告に書く給与（月収25万円）は、実際に支給できる条件である必要があります。
 *       実際の条件と異なる場合は実施しないでください（応募者への虚偽表示になります）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/indeed-salary-test.js mark --company am --job-type 学童送迎ドライバー          // ドライラン
 *   node --experimental-sqlite scripts/indeed-salary-test.js mark --company am --job-type 学童送迎ドライバー --apply  // 実際に変更
 *   node --experimental-sqlite scripts/indeed-salary-test.js analyze --company am --job-type 学童送迎ドライバー
 *   ※ 反映後は、Indeedに掲載済みの該当3件も管理画面でタイトル・給与を同じ内容に修正してください。
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
const { Jobs } = require('../db-factory');

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const MODE = argv[0];
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const COMPANY = val('--company', null);
const JOB_TYPE = val('--job-type', null);
const COUNT = parseInt(val('--count', '3'), 10) || 3;

const MARKER = '月収25万円';
const TEST_SALARY = '月収250,000円';
const TEST_TAG = '給与テスト25';

if (!['mark', 'analyze'].includes(MODE) || !COMPANY || !JOB_TYPE) {
  console.error('使い方: node --experimental-sqlite scripts/indeed-salary-test.js <mark|analyze> --company <会社コード> --job-type <職種名> [--apply]');
  process.exit(1);
}

// タイトル内の給与表記（例: 月給35万円〜、月収28万円〜、月給34万円〜・歩合で上限なし）を差し替える。
// 給与表記が見つからない場合は末尾に追記する。
function replaceTitleSalary(title) {
  const re = /(月給|月収)\d{1,3}万円[〜~]?(・歩合で上限なし)?/;
  if (re.test(title)) return title.replace(re, MARKER);
  return `${title}・${MARKER}`;
}

function replaceDescriptionSalary(description) {
  if (/【給与】.*/.test(description)) {
    return description.replace(/【給与】.*/g, `【給与】${TEST_SALARY}`);
  }
  return `${description}\n\n【給与】${TEST_SALARY}`;
}

// n件を等間隔に選ぶ（エリア・作成順の偏りを減らす）
function pickEvenly(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor((i * arr.length) / n)]);
  return out;
}

async function mark() {
  console.log(`\n=== Indeed給与テスト（${MARKER}）${APPLY ? '（--apply・実際に変更）' : '（DRY-RUN）'} 会社=${COMPANY} 職種=${JOB_TYPE} ===\n`);
  const jobs = db.prepare(
    `SELECT id, title, salary, description, tags FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%' ORDER BY created_at, id`
  ).all(COMPANY, JOB_TYPE);
  console.log(`対象職種のIndeed求人: ${jobs.length}件`);

  const already = jobs.filter(j => j.title.includes(MARKER));
  if (already.length >= COUNT) {
    console.log(`既に${already.length}件が「${MARKER}」になっています。何もしません。`);
    return;
  }
  const candidates = jobs.filter(j => !j.title.includes(MARKER));
  const need = COUNT - already.length;
  if (candidates.length - need < 1) {
    console.log('比較用の通常給与の求人が残らないため中止します（テストは通常求人との比較が必要です）。');
    return;
  }

  const picked = pickEvenly(candidates, need);
  for (const job of picked) {
    const newTitle = replaceTitleSalary(job.title);
    const newDescription = replaceDescriptionSalary(job.description);
    let tags;
    try { tags = JSON.parse(job.tags || '[]'); } catch { tags = []; }
    if (!tags.includes(TEST_TAG)) tags.push(TEST_TAG);

    console.log(`  変更: ${job.title.slice(0, 60)}`);
    console.log(`   →  ${newTitle.slice(0, 60)}   給与: ${job.salary} → ${TEST_SALARY}`);
    if (APPLY) {
      await Jobs.update(job.id, { title: newTitle, salary: TEST_SALARY, description: newDescription, tags });
    }
  }
  console.log(`\n${APPLY ? '変更しました' : '変更予定（DRY-RUN）'}: ${picked.length}件（残りの通常給与求人: ${candidates.length - picked.length}件）`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ Indeedに掲載済みの該当求人は、管理画面でも同じタイトル・給与に修正してください（応募者のjob_titleで集計するため）。');
}

function analyze() {
  console.log(`\n=== Indeed給与テスト 分析 会社=${COMPANY} 職種=${JOB_TYPE} ===\n`);
  const rows = db.prepare(
    `SELECT job_title, is_duplicate, status, substr(applied_at,1,10) d FROM applicants
     WHERE company = ? AND media = 'indeed' AND job_title LIKE ?`
  ).all(COMPANY, `%${JOB_TYPE}%`);

  const summarize = list => {
    const total = list.length;
    const valid = list.filter(r => r.is_duplicate === 0).length;
    const inprog = list.filter(r => r.is_duplicate === 0 && r.status === '対応中').length;
    const pct = (n, d) => (d > 0 ? (100 * n / d).toFixed(1) + '%' : '−');
    return { total, valid, inprog, validRate: pct(valid, total), progressRate: pct(inprog, valid) };
  };
  const test = rows.filter(r => r.job_title.includes(MARKER));
  const control = rows.filter(r => !r.job_title.includes(MARKER));
  const t = summarize(test), c = summarize(control);

  const line = (label, s) => console.log(`  ${label.padEnd(18)} 応募${String(s.total).padStart(4)}  有効${String(s.valid).padStart(4)} (${s.validRate})  対応中${String(s.inprog).padStart(4)}  対応移行率 ${s.progressRate}`);
  line(`テスト(${MARKER})`, t);
  line('通常給与', c);

  const jobsCount = db.prepare(
    `SELECT SUM(CASE WHEN title LIKE ? THEN 1 ELSE 0 END) test_jobs, SUM(CASE WHEN title NOT LIKE ? THEN 1 ELSE 0 END) ctrl_jobs
     FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`
  ).get(`%${MARKER}%`, `%${MARKER}%`, COMPANY, JOB_TYPE);
  console.log(`\n  掲載中のIndeed求人数: テスト${jobsCount.test_jobs || 0}件 / 通常${jobsCount.ctrl_jobs || 0}件`);
  const perJob = (s, n) => (n > 0 ? (s.total / n).toFixed(1) : '−');
  console.log(`  1求人あたり応募数:    テスト${perJob(t, jobsCount.test_jobs || 0)} / 通常${perJob(c, jobsCount.ctrl_jobs || 0)}`);

  console.log('\n※ サンプルが小さい間（有効応募が各群で目安30件未満）は偶然の差の可能性が大きく、断定できません。');
  console.log('※ 応募者のjob_titleはIndeed上のタイトル文字列の一致で判定しています（媒体側の表記ゆれで漏れる場合があります）。');
  console.log('※ 「対応中」は架電担当が付けるステータスのため、給与以外の要因（架電のタイミング等）の影響も受けます。\n');
}

(async () => {
  if (MODE === 'mark') await mark(); else analyze();
})().catch(err => { console.error(err); process.exit(1); });
