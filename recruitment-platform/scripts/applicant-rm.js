'use strict';
// 応募者レコードの確認・削除ツール（間違って登録した応募者を「なかったことに」する用）
// 使い方（recruitment-platform フォルダで）:
//   node scripts/applicant-rm.js list [会社]        … 直近の応募者を新しい順で一覧（id/氏名/電話/媒体/会社/登録日）
//   node scripts/applicant-rm.js del <id> [<id> …]   … 指定IDの応募者を削除（関連する応募履歴も一緒に削除）
// ※ del は「list で確認したidを明示指定」した場合のみ削除するので、誤って一括で消えることはありません。
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const cmd = (process.argv[2] || '').toLowerCase();

if (cmd === 'list') {
  const co = (process.argv[3] || '').toLowerCase();
  const where = co ? 'WHERE company = ?' : '';
  const args = co ? [co] : [];
  const rows = db.prepare(
    `SELECT id,name,phone,media,source_media,company,status,is_archived,applied_at,created_at
     FROM applicants ${where} ORDER BY created_at DESC LIMIT 20`
  ).all(...args);
  console.log(`\n直近の応募者 ${rows.length}件（新しい順${co ? '／会社=' + co : ''}）:`);
  for (const r of rows) {
    console.log(`- id=${r.id}`);
    console.log(`    氏名:${r.name || ''}　電話:${r.phone || ''}　媒体:${r.media || r.source_media || ''}　会社:${r.company || ''}　状態:${r.status || ''}${r.is_archived ? '(アーカイブ)' : ''}`);
    console.log(`    応募日:${String(r.applied_at || '').slice(0, 19)}　登録日:${String(r.created_at || '').slice(0, 19)}`);
  }
  console.log(`\n消したい2件のidを控えて: node scripts/applicant-rm.js del <id> <id>`);
} else if (cmd === 'del') {
  const ids = process.argv.slice(3);
  if (!ids.length) {
    console.log('削除するidを指定してください。先に `node scripts/applicant-rm.js list sq` で確認を。');
    process.exit(1);
  }
  let del = 0;
  for (const id of ids) {
    const r = db.prepare('SELECT id,name,phone,company,media,source_media FROM applicants WHERE id = ?').get(id);
    if (!r) { console.log(`⚠ 見つからない（スキップ）: ${id}`); continue; }
    const apps = db.prepare('DELETE FROM applications WHERE applicant_id = ?').run(id);
    db.prepare('DELETE FROM applicants WHERE id = ?').run(id);
    del++;
    console.log(`✓ 削除: ${r.name || ''}（電話:${r.phone || ''}／媒体:${r.media || r.source_media || ''}／会社:${r.company || ''}）id=${id}${apps.changes ? ` ＋関連応募${apps.changes}件` : ''}`);
  }
  console.log(`\n完了: 応募者 ${del}件を削除しました（＝なかったことにしました）。`);
  console.log(`※ 新規応募・架電リストの数字はDBから即反映されます。スプレッドシートに出していた場合は再push（反映）してください。`);
} else {
  console.log('使い方:');
  console.log('  node scripts/applicant-rm.js list sq          … SQの直近応募者を一覧（idを確認）');
  console.log('  node scripts/applicant-rm.js del <id> <id>    … 指定idの応募者を削除');
}
