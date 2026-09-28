#!/usr/bin/env node
'use strict';
/**
 * 求人ボックス掲載のうち「応募0件」の求人を、1回の実行で最大25件（既定）まで原稿修正する。
 * 一度修正した求人は jobs.optimize_count を1以上にして記録し、以後の実行では対象から除外する
 * （＝同じ求人を繰り返し修正しない）。
 *
 * 「応募0件」の判定は job_metrics（求人ボックスの実績スクレイプ結果、kyujinbox_metrics.pyが収集）の
 * 最新スナップショットを使う。job_metricsが一度も無い求人（掲載直後でまだ実績が無い）は対象外とする
 * （実績が付く前に修正してしまうと判断を誤るため）。
 *
 * 修正内容：タイトルに「本当に当てはまる」検索キーワード（未経験OK・普通免許OK・週休2日等、
 * optimize-driver-titles.js と同じロジック）を給与を変えずに追加する。職種・給与は一切変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/revise-zero-application-postings.js               // ドライラン（先頭25件）
 *   node --experimental-sqlite scripts/revise-zero-application-postings.js --apply       // 実際に反映
 *   node --experimental-sqlite scripts/revise-zero-application-postings.js --company sq --limit 25
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
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = has('--apply');
const COMPANY = val('--company', null);
const LIMIT = parseInt(val('--limit', '25'), 10) || 25;
const TITLE_MAX = 52;

// ── optimize-driver-titles.js と同じタイトル生成ロジック（職種は問わず流用） ──
function areaLabel(job) {
  const brs = [...String(job.title || '').matchAll(/【([^】]+)】/g)].map(m => m[1]);
  const place = brs.find(b => /[市区町村県都府]/.test(b));
  if (place) return place.replace(/\s+/g, '');
  const loc = String(job.location || '').replace(/^(.{2,3}?[都道府県])/, '');
  return loc.slice(0, 12) || (job.location || '').slice(0, 12);
}
function salaryRange(salary) {
  const s = String(salary || '').replace(/[,，]/g, '');
  let nums = [...s.matchAll(/(\d{2,3})\s*万/g)].map(x => parseInt(x[1], 10)).filter(n => n >= 15 && n <= 120);
  if (!nums.length) nums = [...s.matchAll(/(\d{5,7})\s*円/g)].map(x => Math.round(parseInt(x[1], 10) / 10000)).filter(n => n >= 15 && n <= 120);
  if (!nums.length) return null;
  return { lo: Math.min(...nums), hi: Math.max(...nums) };
}
function parseTags(t) {
  if (!t) return [];
  try { const a = JSON.parse(t); return Array.isArray(a) ? a.map(String) : []; } catch { return String(t).split(/[,、]/); }
}
function trueKeywords(job) {
  const hay = [job.tags, job.qualifications, job.worktime_holiday, job.benefit, job.description]
    .map(x => String(x || '')).join(' ');
  const all = hay + ' ' + parseTags(job.tags).join(' ');
  const kws = [];
  const add = (cond, label) => { if (cond && !kws.includes(label)) kws.push(label); };
  add(/未経験/.test(all), '未経験OK');
  add(/普通免許|普通自動車|AT限定/.test(all), '普通免許OK');
  add(/日勤/.test(all) || /(^|[^0-9])([6-9]|1[0-2]):\d0\s*[〜～-]\s*1[0-9]:/.test(all), '日勤');
  add(/完全週休(2|二)日|週休(2|二)日/.test(all), '週休2日');
  add(/ブランク/.test(all), 'ブランクOK');
  add(/転勤なし/.test(all), '転勤なし');
  add(/車通勤|マイカー通勤/.test(all), '車通勤OK');
  add(/シニア|60代|中高年/.test(all), 'シニア歓迎');
  return kws;
}
function buildTitle(job) {
  const area = areaLabel(job);
  const jt = (job.job_type || '').trim().replace(/[（(][^）)]*[）)]/g, '').trim() || (job.job_type || '求人');
  const sr = salaryRange(job.salary);
  const kws = trueKeywords(job);
  const salText = sr ? (sr.hi > sr.lo ? `月給${sr.lo}万〜${sr.hi}万` : `月給${sr.lo}万〜`) : '';
  const head = `【${area}】${jt}`;
  const salPart = salText ? `｜${salText}` : '';
  let budget = TITLE_MAX - head.length - salPart.length;
  const kwParts = [];
  for (const k of kws) {
    const cost = 1 + k.length;
    if (cost <= budget) { kwParts.push(k); budget -= cost; }
  }
  const kwStr = kwParts.length ? '｜' + kwParts.join('・') : '';
  return (head + kwStr + salPart).slice(0, TITLE_MAX);
}

// ── job_metrics の最新スナップショットを求人ごと(job_id優先、無ければcompany+job_number)に1件へ集約 ──
const metricsRows = db.prepare(`SELECT * FROM job_metrics`).all();
const latestByKey = new Map();
for (const r of metricsRows) {
  const key = r.job_id ? `id:${r.job_id}` : `num:${r.company}:${r.job_number}`;
  const cur = latestByKey.get(key);
  if (!cur || String(r.collected_at) > String(cur.collected_at)) latestByKey.set(key, r);
}

const coCond = COMPANY ? ' AND company = ?' : '';
const coParams = COMPANY ? [COMPANY] : [];
const jobs = db.prepare(
  `SELECT id, title, location, salary, job_type, tags, qualifications, worktime_holiday, benefit, description, company, target_media, kyujinbox_job_number, optimize_count
     FROM jobs
    WHERE is_published = 1 AND target_media LIKE '%求人ボックス%' AND (optimize_count IS NULL OR optimize_count = 0)${coCond}`
).all(...coParams);

// 応募0件（job_metricsの最新applies=0）のものだけに絞る。job_metrics自体が無い求人は対象外（実績が付く前に判断しないため）。
const candidates = [];
for (const job of jobs) {
  const byId = latestByKey.get(`id:${job.id}`);
  const byNum = job.kyujinbox_job_number ? latestByKey.get(`num:${job.company}:${job.kyujinbox_job_number}`) : null;
  const metric = byId || byNum;
  if (!metric) continue; // 実績未取得はスキップ
  if (Number(metric.applies) === 0) candidates.push(job);
}

console.log(`\n=== 応募0件・未修正の求人ボックス掲載を修正${APPLY ? '（--apply・実際に反映）' : '（DRY-RUN）'} ===\n`);
console.log(`対象候補（未修正・応募0件・実績取得済み）: ${candidates.length}件 / 今回処理: 最大${LIMIT}件\n`);

const target = candidates.slice(0, LIMIT);
const upd = db.prepare(`UPDATE jobs SET title=?, optimize_count = COALESCE(optimize_count,0) + 1, last_optimized_at=?, updated_at=? WHERE id=?`);
const now = new Date().toISOString();
let changed = 0, sameTitle = 0;

for (const job of target) {
  const nt = buildTitle(job);
  if (nt === job.title) {
    sameTitle++;
    console.log(`  変更なし（既に最適な形）: [${job.company}] ${job.title}`);
    if (APPLY) upd.run(job.title, now, now, job.id); // 変更なしでも修正済みとして記録し、以後の対象から外す
    continue;
  }
  console.log(`  [${job.company}] BEFORE: ${job.title}`);
  console.log(`             AFTER : ${nt}`);
  if (APPLY) upd.run(nt, now, now, job.id);
  changed++;
}

console.log(`\n${APPLY ? '反映' : 'DRY-RUN'}: タイトル変更 ${changed}件 / 変更なし(修正済み記録のみ) ${sameTitle}件`);
console.log(`残り未修正候補: ${Math.max(candidates.length - target.length, 0)}件（次回以降の実行で処理）`);
if (!APPLY) console.log('\n→ 反映するには --apply を付けて再実行してください。');
console.log('※ 給与・職種は変更していません。修正済みの求人はoptimize_count>0になり、以後この処理の対象から外れます。\n');
