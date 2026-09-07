#!/usr/bin/env node
'use strict';
/**
 * 採用ファネル日次レポート（読み取り専用）：応募数 → 有効応募数 → 対応中数
 *
 * 定義（2026-09-07 確定）：
 *   応募数     = applicants の全件（is_duplicate=1 の重複応募も含む「生の応募イベント数」）
 *   有効応募数 = 応募数のうち is_duplicate=0（重複を除いた実人数。架電結果が「不通」でも有効応募に含む）
 *   対応中数   = 有効応募のうち status='対応中'
 *   有効応募率 = 有効応募数 ÷ 応募数
 *   対応移行率 = 対応中数 ÷ 有効応募数（分母0は計算しない）
 *
 * 「内定」「入社」等は本システムでは取得不可のため一切扱わない（推測もしない）。
 *
 * 既知の制約（レポート末尾にも表示）：
 *  - 閲覧数/表示数(views)は求人ボックスのみ取得（job_metrics）。Indeed/engageの掲載パフォーマンスは無い。
 *  - 求人単位の紐付けは、自社サイト経由（applications.job_id で厳密）と
 *    媒体経由（applicants.job_title の文字列一致・非厳密）で精度が異なるため分けて集計する。
 *  - 過去のある時点で media が空欄だった一部データは、当時の一括補完処理で
 *    engage が stanby 扱いになっている可能性がある（現在の取り込みは正しく分離済み）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/daily-funnel-report.js
 *   node --experimental-sqlite scripts/daily-funnel-report.js --company sq
 *   node --experimental-sqlite scripts/daily-funnel-report.js --date 2026-09-06
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
const TODAY = val('--date', jst(0));
const CO = val('--company', null);

const MEDIA_NAME = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ/engage(旧データ混在の可能性)', google: 'Googleしごと', engage: 'engage', seniorjob: 'シニアジョブ', '': '(未設定)' };
const pad = (s, n) => String(s).padEnd(n, ' ');
const padL = (s, n) => String(s).padStart(n, ' ');
const pct = (n, d) => (d > 0 ? (100 * n / d).toFixed(1) + '%' : '−');

const coCond = CO ? ` AND company='${CO.replace(/'/g, '')}'` : '';
const coCondA = CO ? ` AND a.company='${CO.replace(/'/g, '')}'` : '';
const D = `substr(applied_at,1,10)`;

function funnel(sinceDate, untilDate) {
  const rows = db.prepare(
    `SELECT is_duplicate, status FROM applicants WHERE ${D} >= ? AND ${D} <= ?${coCond}`
  ).all(sinceDate, untilDate);
  const total = rows.length;
  const valid = rows.filter(r => r.is_duplicate === 0).length;
  const inProgress = rows.filter(r => r.is_duplicate === 0 && r.status === '対応中').length;
  return { total, valid, inProgress, validRate: pct(valid, total), progressRate: pct(inProgress, valid) };
}

console.log(`\n==================== 採用ファネル日次レポート${CO ? `（会社=${CO}）` : ''}  対象日(JST)=${TODAY} ====================`);

// ① 全体KPI（当日 / 7日 / 30日）
const windows = [
  ['当日', TODAY, TODAY],
  ['直近7日', jst(-6 * 86400000), TODAY],
  ['直近30日', jst(-29 * 86400000), TODAY],
];
console.log('\n■① 全体KPI（応募数 → 有効応募数 → 対応中数）');
console.log('  ' + pad('期間', 10) + padL('応募数', 8) + padL('有効応募', 9) + padL('有効応募率', 11) + padL('対応中', 8) + padL('対応移行率', 11));
for (const [label, s, e] of windows) {
  const f = funnel(s, e);
  console.log('  ' + pad(label, 10) + padL(f.total, 8) + padL(f.valid, 9) + padL(f.validRate, 11) + padL(f.inProgress, 8) + padL(f.progressRate, 11));
}

// ② 媒体別（直近7日・30日）
function funnelByMedia(sinceDate, untilDate) {
  const rows = db.prepare(
    `SELECT media, is_duplicate, status FROM applicants WHERE ${D} >= ? AND ${D} <= ?${coCond}`
  ).all(sinceDate, untilDate);
  const medias = [...new Set(rows.map(r => r.media || ''))];
  return medias.map(m => {
    const rs = rows.filter(r => (r.media || '') === m);
    const total = rs.length;
    const valid = rs.filter(r => r.is_duplicate === 0).length;
    const inProgress = rs.filter(r => r.is_duplicate === 0 && r.status === '対応中').length;
    return { media: m, total, valid, inProgress, validRate: pct(valid, total), progressRate: pct(inProgress, valid) };
  }).sort((a, b) => b.valid - a.valid);
}

for (const [label, s, e] of [['直近7日', jst(-6 * 86400000), TODAY], ['直近30日', jst(-29 * 86400000), TODAY]]) {
  console.log(`\n■② 媒体別ファネル（${label}: ${s}〜${e}）`);
  console.log('  ' + pad('媒体', 30) + padL('応募数', 8) + padL('有効応募', 9) + padL('有効応募率', 11) + padL('対応中', 8) + padL('対応移行率', 11));
  for (const r of funnelByMedia(s, e)) {
    console.log('  ' + pad(MEDIA_NAME[r.media] ?? r.media, 30) + padL(r.total, 8) + padL(r.valid, 9) + padL(r.validRate, 11) + padL(r.inProgress, 8) + padL(r.progressRate, 11));
  }
}

// ③ 会社×媒体クロス（直近30日、有効応募数ベース）
if (!CO) {
  const sinceN = jst(-29 * 86400000);
  const rows = db.prepare(
    `SELECT company, media, is_duplicate FROM applicants WHERE ${D} >= ? AND ${D} <= ?`
  ).all(sinceN, TODAY);
  const companies = [...new Set(rows.map(r => r.company))].sort();
  const medias = [...new Set(rows.map(r => r.media || ''))];
  console.log(`\n■③ 会社 × 媒体 クロス（直近30日・有効応募数）`);
  console.log('  ' + pad('会社', 6) + medias.map(m => padL((MEDIA_NAME[m] ?? m) || '(未設定)', 12)).join('') + padL('計', 8));
  for (const co of companies) {
    const row = medias.map(m => rows.filter(r => r.company === co && (r.media || '') === m && r.is_duplicate === 0).length);
    const sum = row.reduce((a, b) => a + b, 0);
    console.log('  ' + pad(co, 6) + row.map(v => padL(v, 12)).join('') + padL(sum, 8));
  }
}

// ④ 求人単位ランキング（直近30日・有効応募数順）
// 自社サイト経由（applications.job_id で厳密紐付け）と
// 媒体経由（applicants.job_title と jobs.title の文字列一致・非厳密）を分けて出す。
const sinceN30 = jst(-29 * 86400000);

console.log(`\n■④-A 求人ランキング（自社サイト経由・applications.job_id で厳密紐付け／直近30日）`);
const directRows = db.prepare(`
  SELECT j.title, ap.job_id,
         COUNT(*) total,
         SUM(CASE WHEN a.is_duplicate=0 THEN 1 ELSE 0 END) valid,
         SUM(CASE WHEN a.is_duplicate=0 AND a.status='対応中' THEN 1 ELSE 0 END) inprog
  FROM applications ap
  JOIN applicants a ON a.id = ap.applicant_id
  JOIN jobs j ON j.id = ap.job_id
  WHERE substr(ap.applied_at,1,10) >= ? AND substr(ap.applied_at,1,10) <= ?${coCondA}
  GROUP BY ap.job_id
  ORDER BY valid DESC
  LIMIT 10
`).all(sinceN30, TODAY);
if (directRows.length === 0) {
  console.log('  該当なし（自社サイト経由の応募は現状少ない/無い可能性）');
} else {
  console.log('  ' + pad('求人タイトル', 42) + padL('応募', 6) + padL('有効応募', 9) + padL('対応中', 8));
  for (const r of directRows) console.log('  ' + pad((r.title || '').slice(0, 40), 42) + padL(r.total, 6) + padL(r.valid, 9) + padL(r.inprog, 8));
}

console.log(`\n■④-B 求人ランキング（媒体経由・job_title文字列一致／直近30日・精度注意）`);
const mediaAppRows = db.prepare(`
  SELECT job_title, is_duplicate, status FROM applicants
  WHERE ${D} >= ? AND ${D} <= ? AND job_title != '' AND media != ''
        AND id NOT IN (SELECT applicant_id FROM applications)${coCond}
`).all(sinceN30, TODAY);
const byTitle = {};
for (const r of mediaAppRows) {
  const t = r.job_title;
  byTitle[t] = byTitle[t] || { total: 0, valid: 0, inprog: 0 };
  byTitle[t].total++;
  if (r.is_duplicate === 0) {
    byTitle[t].valid++;
    if (r.status === '対応中') byTitle[t].inprog++;
  }
}
const titleRanking = Object.entries(byTitle).sort((a, b) => b[1].valid - a[1].valid).slice(0, 10);
if (titleRanking.length === 0) {
  console.log('  該当なし');
} else {
  console.log('  ' + pad('応募時の求人タイトル(自由記述)', 42) + padL('応募', 6) + padL('有効応募', 9) + padL('対応中', 8));
  for (const [title, r] of titleRanking) console.log('  ' + pad(title.slice(0, 40), 42) + padL(r.total, 6) + padL(r.valid, 9) + padL(r.inprog, 8));
  console.log('  ※ jobs.title と完全一致しない場合は同一求人でも別行に分かれることがある（媒体側の表記ゆれのため）。');
}

// ⑤ 職種カテゴリ別（job_title のキーワード推定・直近30日）
const CAT_KEYWORDS = [
  ['配送', /配送|デリバリー|宅配/],
  ['送迎', /送迎/],
  ['ドライバー(その他)', /ドライバー|運転手/],
  ['営業', /営業/],
  ['事務・オフィス', /事務|オフィス|事務職|IT/],
  ['倉庫・軽作業', /倉庫|軽作業|ピッキング|梱包|仕分/],
  ['製造・組立', /製造|組立|組み立て/],
  ['メンテナンス・技術', /メンテナンス|技術|整備/],
  ['イベント', /イベント|設営/],
];
function categorize(title) {
  for (const [name, re] of CAT_KEYWORDS) if (re.test(title)) return name;
  return 'その他/分類不能';
}
const allTitled = db.prepare(
  `SELECT job_title, is_duplicate, status FROM applicants WHERE ${D} >= ? AND ${D} <= ? AND job_title != ''${coCond}`
).all(sinceN30, TODAY);
const byCat = {};
for (const r of allTitled) {
  const c = categorize(r.job_title);
  byCat[c] = byCat[c] || { total: 0, valid: 0, inprog: 0 };
  byCat[c].total++;
  if (r.is_duplicate === 0) {
    byCat[c].valid++;
    if (r.status === '対応中') byCat[c].inprog++;
  }
}
console.log(`\n■⑤ 職種カテゴリ別（job_titleのキーワード推定・直近30日・参考値）`);
console.log('  ' + pad('カテゴリ', 20) + padL('応募', 6) + padL('有効応募', 9) + padL('有効応募率', 11) + padL('対応中', 8) + padL('対応移行率', 11));
for (const [cat, r] of Object.entries(byCat).sort((a, b) => b[1].valid - a[1].valid)) {
  console.log('  ' + pad(cat, 20) + padL(r.total, 6) + padL(r.valid, 9) + padL(pct(r.valid, r.total), 11) + padL(r.inprog, 8) + padL(pct(r.inprog, r.valid), 11));
}

console.log('\n※ 制約：');
console.log('  ・閲覧数/表示数は求人ボックスのみ取得可能（job_metrics）。Indeed/engageの掲載パフォーマンスは無し（別途 scripts/kyujinbox-stats.js を参照）。');
console.log('  ・④-Bと⑤の職種分類は文字列推定のため参考値。断定的な意思決定には④-A・実データの目視確認を併用すること。');
console.log('  ・過去の一部データ（media空欄で保存された古いレコード）はengageがstanby扱いになっている可能性あり。');
console.log('  ・「内定」「入社」等のデータは本システムに存在しないため、このレポートに一切含まない。\n');
