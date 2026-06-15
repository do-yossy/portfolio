'use strict';
// jobs テーブルの location フィールドを全件「複数拠点（選択制）」に統一する
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const result = db.prepare(
  `UPDATE jobs SET location = '複数拠点（選択制）', updated_at = ? WHERE location != '複数拠点（選択制）'`
).run(new Date().toISOString());

console.log(`✓ ${result.changes}件の勤務地フィールドをクリアしました`);
