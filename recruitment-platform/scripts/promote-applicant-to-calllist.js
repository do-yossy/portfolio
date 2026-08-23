#!/usr/bin/env node
'use strict';
/**
 * 指定した応募者（名前/電話で検索）を「架電リスト（本日の新規）」へ復帰させるツール。
 * 過去応募（is_archived=1）や重複扱いのため、通常の再追加では重複判定されて架電リストに入らないケースを解決する。
 *   復帰内容: is_archived=0 / is_duplicate=0 / duplicate_of_id=NULL / status='新規' / applied_at=本日(JST) / applied_month=当月。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   ① 検索のみ（更新なし）:
 *      node --experimental-sqlite scripts/promote-applicant-to-calllist.js --phone 09071031774
 *      node --experimental-sqlite scripts/promote-applicant-to-calllist.js --name 湊
 *   ② 復帰させる:
 *      node --experimental-sqlite scripts/promote-applicant-to-calllist.js --phone 09071031774 --fix
 *      node --experimental-sqlite scripts/promote-applicant-to-calllist.js --ids <id1>,<id2> --fix
 *   会社で絞る場合: --company sq
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const has = (f) => argv.includes(f);
const phone = val('--phone');
const name = val('--name');
const ids = val('--ids');
const company = val('--company');
const doFix = has('--fix');

if (!phone && !name && !ids) {
  console.log('検索条件が必要です: --phone 09071031774 / --name 湊 / --ids <id1>,<id2>');
  process.exit(1);
}

const digits = s => String(s || '').replace(/[^0-9]/g, '');
let rows = db.prepare(`SELECT id, name, phone, normalized_phone, company, media, status, is_archived, is_duplicate, applied_at FROM applicants`).all();
const pd = digits(phone);
rows = rows.filter(r => {
  if (ids) return ids.split(',').map(s => s.trim()).includes(r.id);
  let ok = true;
  if (pd) ok = ok && (digits(r.normalized_phone) === pd || digits(r.phone) === pd);
  if (name) ok = ok && String(r.name || '').replace(/[\s　]/g, '').includes(name.replace(/[\s　]/g, ''));
  if (company) ok = ok && r.company === company;
  return ok;
});

console.log(`\n■ 該当: ${rows.length}件`);
rows.forEach((r, i) => {
  const inList = (r.is_archived === 0 && ['新規', '不通', '対応中'].includes(r.status));
  console.log(`  [${i + 1}] id=${r.id}  ${r.name}  ${r.phone}  会社=${r.company} 媒体=${r.media} status=${r.status} archived=${r.is_archived} dup=${r.is_duplicate} applied=${r.applied_at}`);
  console.log(`        現在: ${inList ? '✓架電リストに表示中' : '✗架電リスト外（' + (r.is_archived ? '過去応募' : '') + (r.is_duplicate ? '/重複' : '') + (!['新規', '不通', '対応中'].includes(r.status) ? '/status=' + r.status : '') + '）'}`);
});

if (rows.length === 0) { console.log('\n該当なし。電話番号/氏名を確認してください。\n'); process.exit(0); }
if (!doFix) { console.log('\n（更新なし＝検索のみ）架電リストへ復帰させるには --fix を付けてください。\n'); process.exit(0); }

const jstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const nowIso = new Date().toISOString();
const upd = db.prepare(`UPDATE applicants SET is_imported=0, is_archived=0, is_duplicate=0, duplicate_of_id=NULL, status='新規', applied_at=?, applied_month=?, updated_at=? WHERE id=?`);
let n = 0;
for (const r of rows) { n += upd.run(jstToday, jstToday.slice(0, 7), nowIso, r.id).changes; console.log(`  ✅ 架電リストへ復帰: ${r.name} (id=${r.id})  → 本日(${jstToday})の新規・status=新規`); }
console.log(`\n完了: ${n}件を架電リスト（本日の新規）へ復帰しました。新規応募タブに表示されます（F5または再起動で反映）。\n`);
