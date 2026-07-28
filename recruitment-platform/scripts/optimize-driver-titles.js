'use strict';
/*
 * ドライバー求人タイトル 一括最適化（求人ボックス向け）
 * ------------------------------------------------------------
 * 目的: ドライバー系求人のタイトルを「勝ち型」に寄せて検索マッチ（露出）を増やす。
 *   - 給与は変更しない（据え置き）。職種も偽らない（役員運転手/送迎/ルート配送はそのまま）。
 *   - その求人の実データ（tags/資格/休日/給与）から“本当に当てはまる”検索キーワードだけを付与。
 *   - タイトルは「【エリア】{職種}｜{未経験OK・普通免許OK・週休2日 等}｜月給{下限}万〜{上限}万」形へ。
 *   - 安定フィールドから再生成するため冪等（再実行しても同じ結果）。
 *
 * 実行:
 *   node --experimental-sqlite scripts/optimize-driver-titles.js               # ドライラン（変更前後を表示のみ）
 *   node --experimental-sqlite scripts/optimize-driver-titles.js --apply       # DBに反映
 *   ... --company sq|bg|st|nl   対象会社を限定
 *   ... --limit 20              表示件数
 *   ※反映後、求人ボックスに新タイトルを載せるには「強制再投稿」または次の掲載更新が必要。
 */
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const APPLY = has('--apply');
const COMPANY = (val('--company', 'all') || 'all').toLowerCase();
const SHOW = parseInt(val('--limit', '25'), 10) || 25;
const TITLE_MAX = 52; // 求人ボックスのタイトル目安上限

const DB = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB);

// ── ヘルパ ──
function areaLabel(job) {
  // 現タイトルの【…】から地名らしきものを優先（掲載の地域表記を維持）。無ければ location から。
  const brs = [...String(job.title || '').matchAll(/【([^】]+)】/g)].map(m => m[1]);
  const place = brs.find(b => /[市区町村県都府]/.test(b));
  if (place) return place.replace(/\s+/g, '');
  const loc = String(job.location || '').replace(/^(.{2,3}?[都道府県])/, '');
  return loc.slice(0, 12) || (job.location || '').slice(0, 12);
}
function salaryRange(salary) {
  const s = String(salary || '').replace(/[,，]/g, '');   // カンマ除去（420,000円 対応）
  let nums = [...s.matchAll(/(\d{2,3})\s*万/g)].map(x => parseInt(x[1], 10)).filter(n => n >= 15 && n <= 120);
  if (!nums.length) nums = [...s.matchAll(/(\d{5,7})\s*円/g)].map(x => Math.round(parseInt(x[1], 10) / 10000)).filter(n => n >= 15 && n <= 120);
  if (!nums.length) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return { lo, hi };
}
function parseTags(t) {
  if (!t) return [];
  try { const a = JSON.parse(t); return Array.isArray(a) ? a.map(String) : []; } catch { return String(t).split(/[,、]/); }
}
// タグ/資格/休日/勤務時間/本文から“本当に当てはまる”検索キーワードだけを付与（優先順）
function trueKeywords(job) {
  const hay = [job.tags, job.qualifications, job.holiday, job.worktime_holiday, job.benefit, job.description]
    .map(x => String(x || '')).join(' ');
  const tags = parseTags(job.tags).join(' ');
  const all = hay + ' ' + tags;
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

const where = COMPANY === 'all' ? '' : "AND company = ?";
const params = COMPANY === 'all' ? [] : [COMPANY];
const rows = db.prepare(
  `SELECT id, title, location, salary, job_type, tags, qualifications, worktime_holiday, benefit, description, company, target_media
   FROM jobs
   WHERE is_published=1 AND target_media LIKE '%求人ボックス%'
     AND ( job_type LIKE '%ドライバー%' OR job_type LIKE '%配送%' OR job_type LIKE '%運転%'
        OR title LIKE '%ドライバー%' OR title LIKE '%配送%' OR title LIKE '%運転手%' )
     ${where}`
).all(...params);

function buildTitle(job) {
  const area = areaLabel(job);
  // 職種は維持しつつ、括弧書き（企業配送 等）はタイトルでは除いて字数を確保
  const jt = (job.job_type || 'ドライバー').trim().replace(/[（(][^）)]*[）)]/g, '').trim() || 'ドライバー';
  const sr = salaryRange(job.salary);
  const kws = trueKeywords(job);
  // 順序: 【エリア】職種 ｜ キーワード ｜ 月給lo万〜hi万（給与は必ず残す）
  const salText = sr ? (sr.hi > sr.lo ? `月給${sr.lo}万〜${sr.hi}万` : `月給${sr.lo}万〜`) : '';
  const head = `【${area}】${jt}`;
  const salPart = salText ? `｜${salText}` : '';
  let budget = TITLE_MAX - head.length - salPart.length;   // キーワードに使える残り字数
  const kwParts = [];
  for (const k of kws) {
    const cost = 1 + k.length;   // 区切り（｜ or ・）1字 + 語
    if (cost <= budget) { kwParts.push(k); budget -= cost; }
  }
  const kwStr = kwParts.length ? '｜' + kwParts.join('・') : '';
  return (head + kwStr + salPart).slice(0, TITLE_MAX);
}

let changed = 0, same = 0, shown = 0;
const upd = db.prepare('UPDATE jobs SET title=?, updated_at=? WHERE id=?');
const now = new Date().toISOString();
console.log(`\n===== ドライバー求人タイトル最適化（${APPLY ? '反映' : 'ドライラン'} / company=${COMPANY}）=====`);
console.log(`対象ドライバー系求人: ${rows.length}件  （給与は変更しません）\n`);
for (const job of rows) {
  const nt = buildTitle(job);
  if (nt === job.title) { same++; continue; }
  if (shown < SHOW) {
    console.log('BEFORE: ' + String(job.title || '').slice(0, 60));
    console.log('AFTER : ' + nt + `  (${nt.length}字)`);
    console.log('');
    shown++;
  }
  if (APPLY) upd.run(nt, now, job.id);
  changed++;
}
console.log(`変更: ${changed}件 / 変更なし: ${same}件` + (shown < changed ? `（表示は先頭${shown}件のみ）` : ''));
if (!APPLY) {
  console.log('\n※ これはドライランです。問題なければ --apply を付けて再実行してください:');
  console.log('   node --experimental-sqlite scripts/optimize-driver-titles.js --apply');
} else {
  console.log('\n✅ 反映しました。求人ボックスに新タイトルを載せるには「強制再投稿」または次回の掲載更新を実行してください。');
}
db.close();
