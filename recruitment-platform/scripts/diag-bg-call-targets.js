#!/usr/bin/env node
'use strict';
/**
 * 「本日架電対象」にBGの応募者が計上されない原因を診断＆修正するツール。
 * 本日架電対象の条件（db.js todayCallTargets）: is_archived=0 AND status IN ('新規','不通','対応中')。
 *   ※日付(applied_at)は無関係。アーカイブ・status・重複が原因のことが多い。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   ① 診断（BG応募者の状態と、なぜ対象外かを表示。更新なし）:
 *      node --experimental-sqlite scripts/diag-bg-call-targets.js
 *   ② 直近2名を架電対象へ戻す（is_archived=0・status=新規・重複解除）:
 *      node --experimental-sqlite scripts/diag-bg-call-targets.js --activate-latest 2
 *   ③ ID指定で戻す:
 *      node --experimental-sqlite scripts/diag-bg-call-targets.js --activate-ids id1,id2
 *   会社を変える場合: --company bg（既定 bg）
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const CO = val('--company', 'bg');
const activateLatest = val('--activate-latest', null);
const activateIds = val('--activate-ids', null);
const ACTIVE = ['新規', '不通', '対応中'];

const rows = db.prepare(
  `SELECT id, name, applied_at, status, is_archived, is_duplicate, is_imported, media, call_count
     FROM applicants WHERE company = ? ORDER BY datetime(created_at) DESC, datetime(applied_at) DESC`
).all(CO);

const counts = rows.filter(r => r.is_archived === 0 && ACTIVE.includes(r.status));
console.log(`\n■ 会社=${CO} の応募者: ${rows.length}件　／　本日架電対象に計上=${counts.length}件`);
console.log(`  （条件: is_archived=0 かつ status∈{${ACTIVE.join('/')}}）\n`);

function reason(r) {
  const ng = [];
  if (r.is_archived !== 0) ng.push('アーカイブ済(is_archived=1)');
  if (!ACTIVE.includes(r.status)) ng.push(`status=${r.status}`);
  if (r.is_duplicate === 1) ng.push('重複(is_duplicate=1)');
  return ng.length ? '✗ 対象外: ' + ng.join(' / ') : '✓ 対象';
}
rows.slice(0, 20).forEach((r, i) => {
  console.log(`  [${i + 1}] id=${r.id}  ${r.name}  applied_at=${r.applied_at}  status=${r.status}  archived=${r.is_archived}  dup=${r.is_duplicate}  media=${r.media}`);
  console.log(`        ${reason(r)}`);
});
if (rows.length > 20) console.log(`  …ほか ${rows.length - 20}件`);

// 修正対象の決定
let targets = [];
if (activateIds) {
  const set = new Set(activateIds.split(',').map(s => s.trim()).filter(Boolean));
  targets = rows.filter(r => set.has(r.id));
} else if (activateLatest) {
  const n = Math.max(0, parseInt(activateLatest, 10) || 0);
  // 対象外になっているものを新しい順にn件
  targets = rows.filter(r => !(r.is_archived === 0 && ACTIVE.includes(r.status) && r.is_duplicate === 0)).slice(0, n);
}

if (targets.length === 0) {
  console.log('\n（更新なし＝診断のみ）架電対象へ戻すには --activate-latest 2 または --activate-ids id1,id2 を付けてください。\n');
  process.exit(0);
}

const nowIso = new Date().toISOString();
const upd = db.prepare(`UPDATE applicants SET is_archived = 0, is_duplicate = 0, duplicate_of_id = NULL, status = '新規', updated_at = ? WHERE id = ?`);
let n = 0;
for (const t of targets) { n += upd.run(nowIso, t.id).changes; console.log(`  ✅ 架電対象へ復帰: ${t.name} (id=${t.id})  → is_archived=0 / status=新規 / 重複解除`); }
console.log(`\n完了: ${n}件を架電対象に戻しました。新規応募タブの「本日架電対象（${CO}）」に反映されます（表示更新はF5または再起動）。\n`);
