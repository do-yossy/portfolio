#!/usr/bin/env node
'use strict';
/**
 * 求人ボックスCSV取込のロールバック
 *
 * 指定した分数以内（デフォルト60分）に取り込まれた
 * media='kyujinbox' の応募者レコードを削除します。
 *
 * 使用例:
 *   node --experimental-sqlite scripts/rollback-kyujinbox-import.js          # 直近60分
 *   node --experimental-sqlite scripts/rollback-kyujinbox-import.js 30       # 直近30分
 *   node --experimental-sqlite scripts/rollback-kyujinbox-import.js 30 sq    # 直近30分・会社=sq
 *   node --experimental-sqlite scripts/rollback-kyujinbox-import.js 30 all   # 直近30分・全会社
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = fs.existsSync(path.join(process.cwd(), '.env'))
    ? path.join(process.cwd(), '.env')
    : path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { DatabaseSync } = require('node:sqlite');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'recruitment.db');
const db       = new DatabaseSync(DB_PATH);

const minutes = parseInt(process.argv[2], 10) || 60;
const company = process.argv[3] || 'all';

const threshold = new Date(Date.now() - minutes * 60 * 1000).toISOString();

console.log(`\n📋 求人ボックス取込ロールバック`);
console.log(`   対象: media='kyujinbox' で created_at > ${threshold.slice(0, 16)}（直近${minutes}分）`);
console.log(`   会社: ${company === 'all' ? '全社' : company}\n`);

// 削除対象を確認
let query = `SELECT id, name, phone, email, company, applied_at, created_at, status, is_imported
             FROM applicants
             WHERE media = 'kyujinbox' AND created_at > ?`;
const params = [threshold];

if (company !== 'all') {
  query += ` AND company = ?`;
  params.push(company);
}
query += ` ORDER BY created_at DESC`;

const targets = db.prepare(query).all(...params);

if (targets.length === 0) {
  console.log('⚠️  削除対象のレコードが見つかりませんでした。');
  console.log('   時間範囲を広げる場合は分数を増やしてください: node ... 120');
  process.exit(0);
}

// 削除前の状態を表示
console.log(`🔍 削除対象: ${targets.length}件`);
console.log('─'.repeat(70));
targets.forEach(r => {
  const name    = (r.name || '').slice(0, 10).padEnd(10);
  const phone   = (r.phone || '').slice(0, 12).padEnd(12);
  const company = (r.company || '').slice(0, 4).padEnd(4);
  const status  = (r.status || '').slice(0, 6).padEnd(6);
  const ts      = (r.created_at || '').slice(0, 16);
  console.log(`  ${name} ${phone} [${company}] ${status} ${ts}`);
});
console.log('─'.repeat(70));

// 削除前の新規応募数
const beforeCount = db.prepare(
  `SELECT COUNT(*) as c FROM applicants WHERE is_archived = 0 AND is_duplicate = 0 AND status = '新規'`
).get().c;
const beforeTotal = db.prepare(`SELECT COUNT(*) as c FROM applicants`).get().c;

console.log(`\n📊 削除前: 応募者合計=${beforeTotal}件 / 新規=${beforeCount}件`);
console.log(`\n🗑️  ${targets.length}件を削除中...`);

// 削除実行
const ids = targets.map(r => r.id);
let deleted = 0;
for (const id of ids) {
  db.prepare(`DELETE FROM applicants WHERE id = ?`).run(id);
  deleted++;
}

// 削除後の件数確認
const afterCount = db.prepare(
  `SELECT COUNT(*) as c FROM applicants WHERE is_archived = 0 AND is_duplicate = 0 AND status = '新規'`
).get().c;
const afterTotal = db.prepare(`SELECT COUNT(*) as c FROM applicants`).get().c;

console.log(`✅ ${deleted}件を削除しました`);
console.log(`📊 削除後: 応募者合計=${afterTotal}件 / 新規=${afterCount}件`);
console.log(`   変化: 合計 ${beforeTotal}→${afterTotal}件 / 新規 ${beforeCount}→${afterCount}件\n`);
