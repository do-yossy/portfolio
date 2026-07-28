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
const FORCE = has('--force');   // 反映済みも含めて全件やり直す（既定は未反映のみ＝再実行で自動で次へ進む）
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

// 反映済みを記録する列を用意（無ければ追加）。これで --limit で回すと再実行のたびに次の未反映分へ進む。
try { db.exec('ALTER TABLE jobs ADD COLUMN kyujinbox_reflected_at TEXT'); } catch { /* 既に存在 */ }

let baseWhere = "is_published=1 AND kyujinbox_job_number IS NOT NULL AND kyujinbox_job_number <> ''";
const params = [];
if (COMPANY !== 'all') { baseWhere += ' AND company = ?'; params.push(COMPANY); }
if (DRIVERS) baseWhere += ` AND (job_type LIKE '%ドライバー%' OR job_type LIKE '%配送%' OR job_type LIKE '%運転%' OR title LIKE '%ドライバー%' OR title LIKE '%配送%' OR title LIKE '%運転手%')`;
const reflectedCond = FORCE ? '' : " AND (kyujinbox_reflected_at IS NULL OR kyujinbox_reflected_at = '')";
const totalRemaining = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE ${baseWhere}${reflectedCond}`).get(...params).c;
const grandTotal = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE ${baseWhere}`).get(...params).c;
const rows = db.prepare(
  `SELECT id, title, description, rewarding, company, kyujinbox_job_number, job_type
   FROM jobs WHERE ${baseWhere}${reflectedCond}
   ORDER BY company, kyujinbox_job_number`
).all(...params);

console.log(`\n===== 掲載中求人へDB内容を反映（${APPLY ? '保存する' : 'ドライラン: 保存しない'}${DRIVERS ? ' / ドライバー限定' : ''}${FORCE ? ' / 全件やり直し' : ''}）=====`);
console.log(`対象(求人番号あり): 全${grandTotal}件 / ${FORCE ? '全件対象' : `未反映 ${totalRemaining}件`}（company=${COMPANY}）`);
if (rows.length === 0) {
  console.log(FORCE
    ? '→ 対象がありません。先に kyujinbox_metrics.py で成績収集すると求人番号が紐づきます。'
    : '→ 未反映の対象がありません（全て反映済み）。やり直すなら --force を付けてください。');
  db.close();
  process.exit(0);
}

// 会社ごとにまとめて反映
const byCo = {};
for (const r of rows) (byCo[r.company] || (byCo[r.company] = [])).push(r);

const pyCmd = detectPython();
console.log('使用Python:', pyCmd.join(' '));
const reflectScript = path.join(__dirname, 'kyujinbox_reflect.py');

const markReflected = db.prepare('UPDATE jobs SET kyujinbox_reflected_at=? WHERE kyujinbox_job_number=?');
let totalReflected = 0, totalSaved = 0;
// このバッチで扱う件数は全会社合計で LIMIT まで（＝1回の実行で最大LIMIT件）
let budget = LIMIT;
for (const [co, list0] of Object.entries(byCo)) {
  if (budget <= 0) break;
  const { env, hasCreds } = credsForCompany(co);
  const name = companyName(co);
  if (!hasCreds) { console.log(`\n⏭️  ${name}(${co}): 求人ボックス認証(.env)が未設定のためスキップ`); continue; }
  const list = list0.slice(0, budget);
  budget -= list.length;
  console.log(`\n=== ${name}(${co}）: ${list.length}件を反映（未反映のうち今回分） ===`);
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
  const now = new Date().toISOString();
  for (const line of (rp.stdout || '').split('\n')) {
    try {
      const o = JSON.parse(line);
      if (o.type === 'progress') console.log('  ' + o.message);
      else if (o.type === 'reflected') {
        totalReflected++;
        if (o.saved) { totalSaved++; if (APPLY) { try { markReflected.run(now, String(o.jobNumber).trim()); } catch { /* ignore */ } } }
      }
    } catch { /* skip non-JSON */ }
  }
  if (rp.stderr && rp.stderr.trim()) console.log('  ⚠️ ' + rp.stderr.trim().split('\n').slice(-2).join(' '));
}

// 残り（未反映）を再計算して表示
let remain = totalRemaining;
try { remain = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE ${baseWhere}${reflectedCond}`).get(...params).c; } catch { /* ignore */ }
db.close();
console.log(`\n完了: 反映処理 ${totalReflected}件 / うち保存 ${totalSaved}件`);
if (APPLY) {
  console.log(remain > 0
    ? `📌 未反映は残り ${remain}件。同じコマンドをもう一度実行すると、自動で次の未反映分に進みます。`
    : '🎉 未反映は残り 0件。全て反映済みです。');
} else {
  console.log('※ ドライランです。問題なければ --apply を付けて再実行すると保存＆反映済み記録されます（次回から自動で先へ進みます）。');
}
