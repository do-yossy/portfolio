'use strict';

// 架電リスト（is_archived=0）に今いる応募者を一覧表示する（診断用・変更なし）
const { db } = require('./../db');

const rows = db.prepare(`
  SELECT name, media, company, status, is_imported, source_media, applied_at, created_at
  FROM applicants WHERE is_archived = 0
  ORDER BY company, media, created_at
`).all();

console.log(`架電リストに残っている応募者: ${rows.length}件\n`);
for (const r of rows) {
  console.log(` ${(r.name||'(無名)').padEnd(16)} | media=${r.media} co=${r.company} status=${r.status} imported=${r.is_imported} 取込元=${r.source_media} 応募日=${(r.applied_at||'').slice(0,10)} 作成=${(r.created_at||'').slice(0,10)}`);
}
