#!/usr/bin/env node
'use strict';
/**
 * 架電リストに間違えて追加した NL × Indeed の応募者を取り消すツール。
 * 既定は一覧のみ（更新なし）。取り消しは2通り：
 *   ・アーカイブ（架電リスト/本日新規から外す・データは残る＝元に戻せる）… 推奨
 *   ・完全削除（応募者とその応募(applications)を物理削除）… 元に戻せない
 *
 * 使い方（recruitment-platform フォルダで）:
 *   ① 対象を一覧（NL×Indeed×架電リスト、新しい順）:
 *      node --experimental-sqlite scripts/undo-nl-indeed-calllist.js
 *   ② 直近2名をアーカイブ（推奨・元に戻せる）:
 *      node --experimental-sqlite scripts/undo-nl-indeed-calllist.js --archive-latest 2
 *   ③ ID指定でアーカイブ:
 *      node --experimental-sqlite scripts/undo-nl-indeed-calllist.js --archive-ids id1,id2
 *   ④ 完全削除（元に戻せない）:
 *      node --experimental-sqlite scripts/undo-nl-indeed-calllist.js --delete-latest 2
 *      node --experimental-sqlite scripts/undo-nl-indeed-calllist.js --delete-ids id1,id2
 *   会社/媒体を変える場合: --company nl --media indeed（既定）
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const CO = val('--company', 'nl');
const MEDIA = val('--media', 'indeed');
const archiveLatest = val('--archive-latest', null);
const deleteLatest  = val('--delete-latest', null);
const archiveIds    = val('--archive-ids', null);
const deleteIds     = val('--delete-ids', null);

// NL × Indeed × 架電リスト（is_archived=0）を新しい順
const rows = db.prepare(
  `SELECT id, name, applied_at, status, is_archived, is_duplicate, media
     FROM applicants
    WHERE company = ? AND media = ? AND is_archived = 0
    ORDER BY datetime(created_at) DESC, datetime(applied_at) DESC`
).all(CO, MEDIA);

console.log(`\n■ ${CO} × 媒体=${MEDIA} × 架電リスト(is_archived=0): ${rows.length}件（新しい順）\n`);
rows.forEach((r, i) => {
  console.log(`  [${i + 1}] id=${r.id}  ${r.name}  applied_at=${r.applied_at}  status=${r.status}  dup=${r.is_duplicate}`);
});

function pick(idsArg, latestArg) {
  if (idsArg) { const set = new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean)); return rows.filter(r => set.has(r.id)); }
  if (latestArg) { const n = Math.max(0, parseInt(latestArg, 10) || 0); return rows.slice(0, n); }
  return [];
}
const toArchive = pick(archiveIds, archiveLatest);
const toDelete  = pick(deleteIds, deleteLatest);

if (toArchive.length === 0 && toDelete.length === 0) {
  console.log('\n（更新なし＝一覧のみ）');
  console.log('  架電リストから外す（推奨・戻せる）: --archive-latest 2  または --archive-ids id1,id2');
  console.log('  完全削除（戻せない）          : --delete-latest 2  または --delete-ids id1,id2\n');
  process.exit(0);
}

const nowIso = new Date().toISOString();
if (toArchive.length) {
  const upd = db.prepare(`UPDATE applicants SET is_archived = 1, updated_at = ? WHERE id = ?`);
  let n = 0;
  for (const t of toArchive) { n += upd.run(nowIso, t.id).changes; console.log(`  📦 アーカイブ（架電リストから除外）: ${t.name} (id=${t.id})`); }
  console.log(`\n→ アーカイブ ${n}件。架電リスト・本日の新規から外れます（データは残るので必要なら戻せます）。`);
}
if (toDelete.length) {
  const delApp = db.prepare(`DELETE FROM applications WHERE applicant_id = ?`);
  const delOne = db.prepare(`DELETE FROM applicants WHERE id = ?`);
  let n = 0;
  for (const t of toDelete) { delApp.run(t.id); n += delOne.run(t.id).changes; console.log(`  🗑️  完全削除: ${t.name} (id=${t.id})`); }
  console.log(`\n→ 完全削除 ${n}件（応募者と紐づく応募を物理削除。元に戻せません）。`);
}
console.log('  反映確認: 新規応募タブをF5、または node server.js で再起動。\n');
