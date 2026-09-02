#!/usr/bin/env node
'use strict';
/**
 * SQ × 媒体=シニアジョブ で「昨日 架電リストに追加した人」を、本日(JST)の新規応募として計上し直すツール。
 * 「本日の新規」は applicants.applied_at が本日(JST)の日付なら計上される。昨日の日付のままだと本日分に出ないため、
 * 対象の applied_at を本日に更新する（システムの promoteToNew と同じ挙動：is_imported/is_archived/duplicate も解除）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   ① 対象を一覧表示（更新なし。既定=昨日追加分）:
 *      node --experimental-sqlite scripts/promote-sq-seniorjob-today.js
 *   ② 昨日追加分をまとめて本日の新規へ:
 *      node --experimental-sqlite scripts/promote-sq-seniorjob-today.js --fix
 *   ③ 日付を指定して一覧/修正（例 8/8 追加分）:
 *      node --experimental-sqlite scripts/promote-sq-seniorjob-today.js --from 2026-08-08 --fix
 *   ④ ID指定で確実に:
 *      node --experimental-sqlite scripts/promote-sq-seniorjob-today.js --ids <id1>,<id2> --fix
 *   ⑤ 本日のSQシニアジョブ件数を「2」に合わせる（架電リストの不足分だけ本日へ上げる）:
 *      node --experimental-sqlite scripts/promote-sq-seniorjob-today.js --target 2 --fix
 *   ⑥ 過去応募者（アーカイブ済み）からN名を本日へ復帰させる:
 *      node --experimental-sqlite scripts/promote-sq-seniorjob-today.js --from-archived 2 --fix
 *   ⑦ --target で候補が足りない時に過去応募者からも補充:
 *      node --experimental-sqlite scripts/promote-sq-seniorjob-today.js --target 2 --include-archived --fix
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

// JST基準の本日・昨日（YYYY-MM-DD）
const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
const TODAY = jst(0);
const YESTERDAY = jst(-86400000);

const fromDate     = val('--from') || YESTERDAY;   // 既定：昨日追加分
const idsArg       = val('--ids');
const targetArg    = val('--target');              // 例: --target 2 → 本日のSQシニアジョブを2件にする
const fromArchived = val('--from-archived');       // 例: --from-archived 2 → 過去応募者から2名を本日へ復帰
const includeArch  = has('--include-archived');    // --target で候補不足時に過去応募者からも補充
const doFix        = has('--fix');

// SQ × シニアジョブ × 架電リスト（is_archived=0）
let rows = db.prepare(
  `SELECT id, name, applied_at, applied_month, status, is_archived, is_duplicate
     FROM applicants
    WHERE company = 'sq' AND media = 'seniorjob' AND is_archived = 0
    ORDER BY datetime(applied_at) DESC`
).all();

const isToday = r => String(r.applied_at || '').slice(0, 10) === TODAY;

// 過去応募者（アーカイブ済み）のSQシニアジョブ候補（新しい順・本日以外・重複除く）
const archivedCandidates = () => db.prepare(
  `SELECT id, name, applied_at, applied_month, status, is_archived, is_duplicate
     FROM applicants
    WHERE company='sq' AND media='seniorjob' AND is_archived=1 AND is_duplicate=0
      AND substr(applied_at,1,10) <> ?
    ORDER BY datetime(applied_at) DESC`
).all(TODAY);

let targets, modeLabel;
if (idsArg) {
  const set = new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean));
  // ID指定はアーカイブ済みも対象にできるよう全件から拾う
  const all = rows.concat(archivedCandidates());
  targets = all.filter(r => set.has(r.id));
  modeLabel = 'ID指定';
} else if (fromArchived !== null) {
  // 過去応募者（アーカイブ）から N 名を本日へ復帰（架電リストの現行分は触らない）
  const nWant = Math.max(0, parseInt(fromArchived, 10) || 0);
  const arch = archivedCandidates();
  targets = arch.slice(0, nWant);
  modeLabel = `過去応募者から${nWant}名を本日へ復帰（アーカイブ候補${arch.length}名）`;
  if (arch.length < nWant) modeLabel += ` ※候補が${arch.length}名しかありません`;
} else if (targetArg !== null) {
  // 目標件数に合わせて、本日のSQシニアジョブ実数（重複除く）を数え、足りない分だけ本日へ上げる
  const target = Math.max(0, parseInt(targetArg, 10) || 0);
  const todayCount = rows.filter(r => isToday(r) && r.is_duplicate === 0).length;
  const need = target - todayCount;
  let candidates = rows.filter(r => !isToday(r));          // 架電リスト内の本日以外（新しい順）
  let usedArch = 0;
  if (includeArch && need > candidates.length) {
    const short = need - candidates.length;
    const fromArch = archivedCandidates().slice(0, short);
    usedArch = fromArch.length;
    candidates = candidates.concat(fromArch);
  }
  targets = need > 0 ? candidates.slice(0, need) : [];
  modeLabel = `目標${target}件（本日実数=${todayCount} / あと${Math.max(0, need)}件を本日へ${usedArch ? `・うち過去応募者から${usedArch}名復帰` : ''}）`;
  if (need > 0 && candidates.length < need) {
    modeLabel += ` ※候補が${candidates.length}件しかありません${includeArch ? '' : '（--include-archived で過去応募者からも補充可）'}`;
  }
} else {
  targets = rows.filter(r => String(r.applied_at || '').slice(0, 10) === fromDate);
  modeLabel = fromDate;
}

console.log(`\n■ SQ × 媒体=シニアジョブ × 架電リスト（is_archived=0）: 全${rows.length}件`);
console.log(`   本日(JST)=${TODAY} / 対象=${modeLabel}　→ 上げる対象 ${targets.length}件\n`);
targets.forEach((r, i) => {
  const tag = r.is_archived === 1 ? '  ←過去応募者(アーカイブ)から復帰' : '';
  console.log(`  [${i + 1}] id=${r.id}  ${r.name}  applied_at=${r.applied_at}  status=${r.status}  dup=${r.is_duplicate}${tag}`);
});

if (!doFix) {
  console.log('\n（更新なし＝一覧表示のみ）本日の新規へ上げるには末尾に --fix を付けて実行してください。');
  console.log('  例: node --experimental-sqlite scripts/promote-sq-seniorjob-today.js --fix\n');
  process.exit(0);
}
if (targets.length === 0) { console.log('\n対象がありません（日付/条件を確認してください）。\n'); process.exit(0); }

const nowIso = new Date().toISOString();
const upd = db.prepare(
  `UPDATE applicants
      SET is_imported = 0, is_archived = 0, is_duplicate = 0, duplicate_of_id = NULL,
          applied_at = ?, applied_month = ?, updated_at = ?
    WHERE id = ?`
);
let n = 0;
for (const t of targets) {
  n += upd.run(TODAY, TODAY.slice(0, 7), nowIso, t.id).changes;
  console.log(`  ✅ 本日の新規へ: ${t.name} (id=${t.id})  applied_at ${t.applied_at} → ${TODAY}`);
}
console.log(`\n完了: ${n}件を本日(${TODAY})の新規応募として計上し直しました。新規応募ページ・媒体クロス集計に即反映されます。\n`);
