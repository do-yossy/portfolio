'use strict';
// 月次レポート自動生成CLI（毎月1日にタスクスケジューラで実行する想定）
//   node scripts/monthly_report.js                 → 前月分を生成（all＋各会社）
//   node scripts/monthly_report.js --period 2026-06 --company sq
//   node scripts/monthly_report.js --this          → 今月分（途中経過）を生成
// 生成物: DBのreportsテーブルに保存 ＋ reports/<period>_<company>.html に書き出し
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
// .env 読み込み（最初の出現を採用）
(function loadEnv() {
  const f = fs.existsSync(path.join(process.cwd(), '.env')) ? path.join(process.cwd(), '.env') : path.join(APP_DIR, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim(); if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('='); if (eq < 0) return;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  });
})();

const { db, COMPANIES } = require(path.join(APP_DIR, 'db.js'));
const report = require(path.join(APP_DIR, 'lib', 'report.js'));

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const period = getArg('--period', args.includes('--this') ? report.thisMonth() : report.prevMonth());
const only = getArg('--company', null);

const OUT_DIR = path.join(APP_DIR, 'reports');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 対象会社: 指定があればその1社、無ければ「all」＋データのある各会社
function companiesWithData() {
  const rows = db.prepare(`SELECT DISTINCT company FROM jobs`).all().map(r => r.company);
  return COMPANIES.map(c => c.id).filter(id => rows.includes(id));
}

const targets = only ? [only] : ['all', ...companiesWithData()];

console.log(`=== 求人ボックス 月次レポート生成 ===`);
console.log(`対象期間: ${period} / 対象: ${targets.join(', ')}`);

for (const co of targets) {
  const r = report.generate(period, co);
  const file = path.join(OUT_DIR, `${period}_${co}.html`);
  fs.writeFileSync(file, r.html, 'utf8');
  const s = r.summary;
  console.log(`✓ ${co}: 掲載${s.posted} / 公開中${s.liveCount} / 閲覧${s.totalViews} / 応募${s.totalApplies} / 改善${s.optimized}  → ${path.relative(APP_DIR, file)}`);
}
console.log('完了。管理画面（/）またはreports/フォルダのHTMLで確認できます。');
process.exit(0);
