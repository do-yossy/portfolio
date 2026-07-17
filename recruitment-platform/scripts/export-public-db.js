'use strict';
// 公開ホスティング用に「求人だけ」のDBを書き出す（応募者などの個人情報を一切含めない）。
// 使い方（recruitment-platform フォルダで）:
//   node scripts/export-public-db.js [出力先パス]
//   既定の出力先: data/public.db
// 生成した public.db を公開サーバー（Oracle等）に置き、PUBLIC_MODE=1・DATA_DIR で参照する。
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const SRC = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const OUT = process.argv[2] || path.join(path.dirname(SRC), 'public.db');
const PUBLISHED_ONLY = String(process.env.PUBLIC_DB_PUBLISHED_ONLY || '1') !== '0';

if (!fs.existsSync(SRC)) { console.error('元DBが見つかりません:', SRC); process.exit(1); }

// 1) 元DBの一貫したスナップショットを VACUUM INTO で作成（WALも取り込む）
for (const ext of ['', '-wal', '-shm']) { try { fs.existsSync(OUT + ext) && fs.unlinkSync(OUT + ext); } catch {} }
const src = new DatabaseSync(SRC);
src.exec(`VACUUM INTO '${OUT.replace(/'/g, "''")}'`);
try { src.close(); } catch {}

// 2) スナップショットから個人情報・非公開データを削除
const db = new DatabaseSync(OUT);
const wipe = ['applicants', 'applications', 'logs', 'job_metrics', 'media_posts'];
for (const t of wipe) {
  try { const r = db.prepare(`DELETE FROM ${t}`).run(); console.log(`  除外 ${t}: ${r.changes}件`); }
  catch { /* テーブルが無ければ無視 */ }
}
if (PUBLISHED_ONLY) {
  try { const r = db.prepare('DELETE FROM jobs WHERE is_published != 1').run(); if (r.changes) console.log(`  非公開求人を除外: ${r.changes}件`); } catch {}
}
db.exec('VACUUM;');
const n = db.prepare('SELECT COUNT(*) c FROM jobs').get().c;
try { db.close(); } catch {}

console.log(`\n✅ 公開用DBを書き出しました: ${OUT}`);
console.log(`   求人 ${n}件（応募者・応募・ログ・実績等の個人情報は含みません）`);
console.log(`   → このファイルを公開サーバーに置き、PUBLIC_MODE=1 で起動してください。`);
