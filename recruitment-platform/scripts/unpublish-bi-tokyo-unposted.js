#!/usr/bin/env node
'use strict';
/**
 * BrandideaL(bi)の求人ボックス投稿待ち求人のうち、東京都の住所のものを非公開化(is_published=0)して
 * 投稿対象から除外する。
 *
 * 背景：エリアを関西（大阪・兵庫・京都）に統一する方針にした後も、統一前（東京プール時代）に
 * 作成され一度も求人ボックスに投稿されていない求人が残っていた。これらは今後も投稿しない方針
 * （2026-09-08確認）。
 *
 * 【重要】対象は「まだ求人ボックスに投稿していない（kyujinbox_posted_at未設定）」東京都の求人のみ。
 * 既に投稿済みの求人（実際の求人ボックス上に公開中のもの）はここでは一切触らない
 * （システム内でis_published=0にしても、既に外部の求人ボックスに掲載済みのものは
 *   別途求人ボックス側の管理画面で対応が必要）。
 * それ以外の（関西の）求人も一切変更しない。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/unpublish-bi-tokyo-unposted.js          // DRY-RUN
 *   node --experimental-sqlite scripts/unpublish-bi-tokyo-unposted.js --apply  // 実際に非公開化
 */
const path = require('path');
const fs = require('fs');
(function loadEnv(){ const f=path.join(__dirname,'..','.env'); if(!fs.existsSync(f))return;
  fs.readFileSync(f,'utf8').split('\n').forEach(l=>{l=l.trim(); if(!l||l.startsWith('#'))return; const i=l.indexOf('='); if(i<0)return; const k=l.slice(0,i).trim(),v=l.slice(i+1).trim(); if(k&&!(k in process.env))process.env[k]=v;});
})();

const { DatabaseSync } = require('node:sqlite');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const APPLY = process.argv.includes('--apply');

const rows = db.prepare(
  `SELECT id, title, location, target_media FROM jobs
    WHERE company='bi' AND is_published=1 AND kyujinbox_posted_at IS NULL AND location LIKE '%東京都%'`
).all();

const targets = rows.filter(r => {
  let m = []; try { m = JSON.parse(r.target_media || '[]'); } catch { /* noop */ }
  return m.includes('求人ボックス') || m.includes('kyujinbox');
});

console.log(`\n=== BrandideaL 東京都・投稿待ち求人の非公開化${APPLY ? '（--apply・実際に反映）' : '（DRY-RUN）'} ===\n`);
if (targets.length === 0) {
  console.log('該当する求人はありません（既に対応済み、または該当なし）。\n');
  process.exit(0);
}
console.log(`対象: ${targets.length}件\n`);
for (const r of targets) {
  console.log(`  ${APPLY ? '非公開化' : '(DRY-RUN)'}: ${r.title}　［${r.location}］`);
  if (APPLY) {
    db.prepare(`UPDATE jobs SET is_published=0, updated_at=? WHERE id=?`).run(new Date().toISOString(), r.id);
  }
}
console.log(`\n${APPLY ? '完了' : '（DRY-RUN・未反映）'}: ${targets.length}件${APPLY ? 'を非公開化しました' : 'が対象です'}`);
if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
console.log('※ 関西エリアの求人・既に求人ボックスへ投稿済みの求人は一切変更していません。\n');
