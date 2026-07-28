'use strict';
/*
 * 求人ボックス 掲載中求人へ「現在のDB内容」を一括反映
 * ------------------------------------------------------------
 * 既に求人ボックスに掲載中の求人（求人番号 kyujinbox_job_number が紐づくもの）に対し、
 * DBの現在の title / description / rewarding を編集ページで上書き保存する。
 * → optimize-driver-titles.js 等でDBを改善した内容を、“今ある掲載分”にそのまま反映できる。
 *
 * 実行:
 *   node --experimental-sqlite scripts/kyujinbox-reflect-db.js                 # ドライラン(入力+スクショのみ・保存しない)
 *   node --experimental-sqlite scripts/kyujinbox-reflect-db.js --apply         # 実際に保存(掲載更新)
 *   ... --company sq|bg|...   対象会社
 *   ... --drivers             ドライバー系のみ
 *   ... --limit 25            1社あたりの上限（既定25。編集は1件ずつブラウザ操作で時間がかかるため）
 *   ... --show                ブラウザを可視化(HEADLESS=0)
 *
 * 前提: 求人番号が紐づいていること（kyujinbox_metrics.py の収集で title 一致から自動紐付け）。
 *       .env に会社別の求人ボックス認証 KYUJINBOX_*_<CO>（EMAIL/PASSWORD/GROUP_ID）。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const APP_DIR = path.join(__dirname, '..');

// ── .env 読み込み（autoloop と同方式）──
(function loadEnv() {
  const envFile = fs.existsSync(path.join(process.cwd(), '.env'))
    ? path.join(process.cwd(), '.env') : path.join(APP_DIR, '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('='); if (eq < 0) return;
    const key = line.slice(0, eq).trim(), val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

let COMPANIES = [];
try { COMPANIES = require(path.join(APP_DIR, 'db.js')).COMPANIES || []; } catch { /* ignore */ }
const companyName = id => (COMPANIES.find(c => c.id === id) || {}).name || id;

const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const APPLY = has('--apply');
const DRIVERS = has('--drivers');
const SHOW = has('--show');
const COMPANY = (val('--company', 'all') || 'all').toLowerCase();
const LIMIT = parseInt(val('--limit', '25'), 10) || 25;

function credsForCompany(id) {
  const co = String(id || 'sq').toUpperCase();
  const pick = base => (process.env[`${base}_${co}`] || '').trim() || (process.env[base] || '').trim();
  const email = pick('KYUJINBOX_EMAIL'), pw = pick('KYUJINBOX_PASSWORD'), gid = pick('KYUJINBOX_GROUP_ID');
  const env = {};
  if (email) env.KYUJINBOX_EMAIL = email;
  if (pw) env.KYUJINBOX_PASSWORD = pw;
  if (gid) env.KYUJINBOX_GROUP_ID = gid;
  return { env, hasCreds: !!(email && pw && gid) };
}
function detectPython() {
  const cands = [];
  if ((process.env.PYTHON_PATH || '').trim()) cands.push([process.env.PYTHON_PATH.trim()]);
  if (process.platform === 'win32') { for (const v of ['3.12', '3.11', '3.13']) cands.push(['py', `-${v}`]); }
  cands.push(['python']); cands.push(['python3']);
  const TEST = 'from playwright.sync_api import sync_playwright';
  for (const c of cands) {
    try { const r = spawnSync(c[0], [...c.slice(1), '-c', TEST], { timeout: 12000, windowsHide: true }); if (r && r.status === 0) return c; } catch { /* next */ }
  }
  return ['python'];
}

const DB = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(APP_DIR, 'data', 'recruitment.db');
const db = new DatabaseSync(DB);

let sql = `SELECT id, title, description, rewarding, company, kyujinbox_job_number, job_type
           FROM jobs
           WHERE is_published=1 AND kyujinbox_job_number IS NOT NULL AND kyujinbox_job_number <> ''`;
const params = [];
if (COMPANY !== 'all') { sql += ' AND company = ?'; params.push(COMPANY); }
if (DRIVERS) sql += ` AND (job_type LIKE '%ドライバー%' OR job_type LIKE '%配送%' OR job_type LIKE '%運転%' OR title LIKE '%ドライバー%' OR title LIKE '%配送%' OR title LIKE '%運転手%')`;
const rows = db.prepare(sql).all(...params);
db.close();

console.log(`\n===== 掲載中求人へDB内容を反映（${APPLY ? '保存する' : 'ドライラン: 保存しない'}${DRIVERS ? ' / ドライバー限定' : ''}）=====`);
console.log(`求人番号が紐づく掲載中求人: ${rows.length}件（company=${COMPANY}）`);
if (rows.length === 0) {
  console.log('→ 対象がありません。先に kyujinbox_metrics.py で成績収集すると、掲載中求人にkyujinbox_job_numberが紐づきます。');
  process.exit(0);
}

// 会社ごとにまとめて反映
const byCo = {};
for (const r of rows) (byCo[r.company] || (byCo[r.company] = [])).push(r);

const pyCmd = detectPython();
console.log('使用Python:', pyCmd.join(' '));
const reflectScript = path.join(__dirname, 'kyujinbox_reflect.py');

let totalReflected = 0, totalSaved = 0;
for (const [co, list0] of Object.entries(byCo)) {
  const { env, hasCreds } = credsForCompany(co);
  const name = companyName(co);
  if (!hasCreds) { console.log(`\n⏭️  ${name}(${co}): 求人ボックス認証(.env)が未設定のためスキップ`); continue; }
  const list = list0.slice(0, LIMIT);
  console.log(`\n=== ${name}(${co}）: ${list.length}件を反映${list0.length > LIMIT ? `（全${list0.length}件中・--limitで上限）` : ''} ===`);
  const payload = list.map(j => ({
    jobNumber: String(j.kyujinbox_job_number).trim(),
    title: j.title || '',
    description: j.description || '',
    rewarding: j.rewarding || '',
  }));
  const rp = spawnSync(pyCmd[0], [...pyCmd.slice(1), reflectScript], {
    env: { ...process.env, ...env, APPLY: APPLY ? '1' : '0', HEADLESS: SHOW ? '0' : (process.env.HEADLESS || '1') },
    cwd: APP_DIR, input: JSON.stringify(payload), encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024, timeout: 25 * 60 * 1000,
  });
  for (const line of (rp.stdout || '').split('\n')) {
    try {
      const o = JSON.parse(line);
      if (o.type === 'progress') console.log('  ' + o.message);
      else if (o.type === 'reflected') { totalReflected++; if (o.saved) totalSaved++; }
    } catch { /* skip non-JSON */ }
  }
  if (rp.stderr && rp.stderr.trim()) console.log('  ⚠️ ' + rp.stderr.trim().split('\n').slice(-2).join(' '));
}

console.log(`\n完了: 反映処理 ${totalReflected}件 / うち保存 ${totalSaved}件`);
if (!APPLY) console.log('※ ドライランです。問題なければ --apply を付けて再実行すると掲載中求人へ保存されます。');
