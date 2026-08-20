#!/usr/bin/env node
'use strict';
/**
 * 応募者の media（媒体）を指定値に変更するツール（会社不問・ID指定）。
 * 併せて status の変更 / アーカイブ解除も可能。
 * 新規応募ページの分類・媒体クロス集計・架電リストの媒体タブは applicants.media で決まる。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   ① 一覧（更新なし）:
 *      node --experimental-sqlite scripts/set-applicant-media.js --ids id1,id2
 *   ② media を indeed に、status=新規・アーカイブ解除して確定:
 *      node --experimental-sqlite scripts/set-applicant-media.js --ids id1,id2 --media indeed --status 新規 --active --fix
 *
 * media値: indeed / kyujinbox / stanby / google / engage / seniorjob
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const has = f => argv.includes(f);

const idsArg = val('--ids');
const media  = val('--media');
const status = val('--status');
const active = has('--active');
const doFix  = has('--fix');

const MEDIA_LABEL  = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ', google: 'Googleしごと', engage: 'engage', seniorjob: 'シニアジョブ' };
const SOURCE_LABEL = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ', google: 'Google', engage: 'engage', seniorjob: 'シニアジョブ' };

if (!idsArg) { console.log('\n--ids id1,id2 を指定してください。\n'); process.exit(1); }
if (media && !MEDIA_LABEL[media]) { console.log(`\n--media は次のいずれか: ${Object.keys(MEDIA_LABEL).join(' / ')}\n`); process.exit(1); }

const ids = idsArg.split(',').map(s => s.trim()).filter(Boolean);
const rows = ids.map(id => db.prepare(
  'SELECT id,name,company,media,source_media,status,is_archived,applied_at FROM applicants WHERE id=?'
).get(id)).filter(Boolean);

console.log(`\n■ 対象 ${rows.length}/${ids.length}件`);
rows.forEach((r, i) => console.log(`  [${i + 1}] ${r.name} (id=${r.id})  company=${r.company} media=${r.media} status=${r.status} archived=${r.is_archived}`));

const changes = [];
if (media)  changes.push(`media→${media}(${MEDIA_LABEL[media]}) / source_media→${SOURCE_LABEL[media]}`);
if (status) changes.push(`status→${status}`);
if (active) changes.push('is_archived→0（アーカイブ解除・重複解除）');
console.log(`\n変更内容: ${changes.length ? changes.join(' / ') : '（--media / --status / --active いずれも未指定）'}`);

if (!doFix) { console.log('\n（更新なし）確定するには --fix を付けてください。\n'); process.exit(0); }
if (!media && !status && !active) { console.log('\n変更指定がありません（--media/--status/--active のいずれかが必要）。\n'); process.exit(0); }
if (rows.length === 0) { console.log('\n対象IDが見つかりません。\n'); process.exit(0); }

const nowIso = new Date().toISOString();
let n = 0;
for (const r of rows) {
  const sets = [], vals = [];
  if (media)  { sets.push('media=?', 'source_media=?'); vals.push(media, SOURCE_LABEL[media]); }
  if (status) { sets.push('status=?'); vals.push(status); }
  if (active) { sets.push('is_archived=0', 'is_duplicate=0', 'duplicate_of_id=NULL'); }
  sets.push('updated_at=?'); vals.push(nowIso);
  vals.push(r.id);
  n += db.prepare(`UPDATE applicants SET ${sets.join(', ')} WHERE id=?`).run(...vals).changes;
  console.log(`  ✅ 更新: ${r.name} (id=${r.id})`);
}
console.log(`\n完了: ${n}件更新。新規応募ページ・媒体クロス集計・架電リストに反映されます（表示更新はF5/再起動）。\n`);
