'use strict';

// 既存のインポート済み応募者（架電リストに残っている is_archived=0）の
// created_at を「応募日」に戻す。これにより「本日インポートした数」を集計する
// 会社別×媒体別 新規応募数からは外れる（＝0表示）が、応募者レコード自体は削除されず
// 架電リストに残る。今後インポートするデータは created_at=本日となり正しく集計される。
const { db } = require('../db');

const rows = db.prepare(`
  SELECT id, name, applied_at, created_at
  FROM applicants
  WHERE is_archived = 0 AND is_imported = 1
`).all();

const todayPrefix = new Date().toISOString().slice(0, 10); // 例: 2026-06-04
let updated = 0;

for (const r of rows) {
  // 既に本日より前の created_at なら何もしない
  if (!String(r.created_at || '').startsWith(todayPrefix)) continue;

  // 応募日があればそれを基準に、なければ昨日に設定する
  let base = String(r.applied_at || '').slice(0, 10);
  if (!base || base === todayPrefix) {
    const y = new Date();
    y.setUTCDate(y.getUTCDate() - 1);
    base = y.toISOString().slice(0, 10);
  }
  const newCreatedAt = base + 'T00:00:00Z';

  db.prepare('UPDATE applicants SET created_at = ? WHERE id = ?').run(newCreatedAt, r.id);
  console.log(`✓ ${(r.name || '(無名)').padEnd(16)} created_at: ${r.created_at} → ${newCreatedAt}`);
  updated++;
}

console.log(`\n登録日時を過去日に戻した応募者: ${updated}件`);
console.log('→ 会社別×媒体別 新規応募数は0になり、架電リストにはそのまま残ります。');
