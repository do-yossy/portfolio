'use strict';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/recruitment.db');

console.log('ビープル Indeed 重複データ削除スクリプト');
console.log('='.repeat(50));

// ビープルのIndeedデータを applied_at（降順）で取得
const bigeyes = db.prepare(`
  SELECT id, name, phone, applied_at
  FROM applicants
  WHERE company='bigeyes' AND source_media='Indeed' AND is_archived=0
  ORDER BY applied_at DESC, id DESC
`).all();

console.log(`\n現在のビープル Indeed アクティブ件数: ${bigeyes.length}件`);

if (bigeyes.length < 36) {
  console.log('❌ エラー: 36件未満です。削除対象なし。');
  process.exit(1);
}

console.log('\n削除対象（最新18件）:');
const toDelete = bigeyes.slice(0, 18);
toDelete.forEach((r, i) => {
  console.log(`  ${i+1}. ID:${r.id.slice(0,12)} ${r.name} ${r.phone.slice(-4)} ${r.applied_at.slice(0,10)}`);
});

// 削除実行
const deleteIds = toDelete.map(r => r.id);
const placeholders = deleteIds.map(() => '?').join(',');
const stmt = db.prepare(`DELETE FROM applicants WHERE id IN (${placeholders})`);
const result = stmt.run(...deleteIds);

console.log(`\n✅ 削除完了: ${result.changes}件`);
console.log(`残件数: ${bigeyes.length - result.changes}件`);
