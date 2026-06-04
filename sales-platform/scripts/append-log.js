'use strict';
/**
 * 学習ログ書き戻し（メールアラート運用フローのステップ5）。
 * 応募コックピットの「学習ログ出力」で得たJSONL(1行1案件)を 応募ログ.jsonl に追記する。
 *   node scripts/append-log.js results.jsonl      # ファイルから
 *   echo '<jsonl>' | node scripts/append-log.js    # 標準入力から
 * 追記後は: node ../営業システム/学習/集計.js で学習が回る。
 */
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, '..', '..', '営業システム', '学習', '応募ログ.jsonl');

function read(cb) {
  const f = process.argv[2];
  if (f) return cb(fs.readFileSync(f, 'utf8'));
  let s = ''; process.stdin.on('data', c => s += c).on('end', () => cb(s));
}
read(raw => {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let ok = 0;
  for (const l of lines) { try { JSON.parse(l); ok++; } catch { console.error('不正行をスキップ:', l.slice(0, 60)); } }
  if (!ok) { console.error('追記する有効なJSONL行がありません'); process.exit(1); }
  fs.appendFileSync(LOG, lines.join('\n') + '\n');
  console.log(`${ok}件を ${LOG} に追記しました。\n→ node 営業システム/学習/集計.js で集計してください。`);
});
