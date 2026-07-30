'use strict';
/*
 * 富岡 祐一 の登録状態を診断（架電リストに出ない原因の切り分け）
 * 実行: node --experimental-sqlite scripts/diag-applicant-tomioka.js
 */
const { db, COMPANIES, MEDIA } = require('../db');

const NAME_COMPACT = '富岡祐一';
const rows = db
  .prepare(
    `SELECT id, name, company, media, status, is_archived, is_duplicate, phone, applied_at, notes
       FROM applicants
      WHERE REPLACE(REPLACE(name,' ',''),'　','') = ? OR notes LIKE ?`
  )
  .all(NAME_COMPACT, '%求職者ID:117124%');

if (!rows.length) {
  console.log('❌ 富岡さんのレコードが1件も見つかりません。');
  console.log('   → まだ登録スクリプトを実行していない可能性があります:');
  console.log('     node --experimental-sqlite scripts/add-applicant-tomioka.js');
  process.exit(0);
}

const coName = (id) => (COMPANIES.find((c) => c.id === id) || {}).name || id;
const mdName = (id) => (MEDIA.find((m) => m.id === id) || {}).name || id || '(未設定)';

console.log(`🔎 富岡さんのレコード: ${rows.length}件\n`);
for (const r of rows) {
  const visible = r.is_archived === 0 && r.status === '新規' && r.is_duplicate === 0;
  console.log(`─ ID:${r.id}`);
  console.log(`   会社=${coName(r.company)}(${r.company}) / 媒体=${mdName(r.media)}(${r.media || ''})`);
  console.log(`   status=${r.status} / is_archived=${r.is_archived} / is_duplicate=${r.is_duplicate}`);
  console.log(`   電話=${r.phone || '(未登録)'} / applied_at=${r.applied_at || '(空)'}`);
  console.log(`   架電リスト(アクティブ)に表示される条件を満たす: ${visible ? '✅ はい' : '❌ いいえ'}`);
  if (visible) {
    console.log(`   → 掲載管理の架電リストで「会社: ${coName(r.company)}」「媒体タブ: ${mdName(r.media)}」を選択して表示`);
    console.log(`     URL例: /admin/calls?co=${r.company}&media=${r.media || 'indeed'}`);
  } else {
    const why = [];
    if (r.is_archived !== 0) why.push('過去応募(アーカイブ)になっている');
    if (r.status !== '新規') why.push(`status が「${r.status}」（新規でない）`);
    if (r.is_duplicate !== 0) why.push('重複フラグが立っている');
    console.log(`   → 出ない理由: ${why.join(' / ')}`);
    console.log(`     修正: node --experimental-sqlite scripts/add-applicant-tomioka.js を実行`);
  }
  console.log('');
}
console.log('※ 架電リストは既定で「Indeedタブ」を表示します。媒体が seniorjob の場合は');
console.log('  画面上部の媒体タブで「シニアジョブ」を選び、会社も一致させてください。');
