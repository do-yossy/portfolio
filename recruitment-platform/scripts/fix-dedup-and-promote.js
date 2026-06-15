#!/usr/bin/env node
'use strict';
/**
 * 本日の取込レコードを重複整理してから新規応募へ昇格する
 * 実行: node --experimental-sqlite scripts/fix-dedup-and-promote.js
 *
 * 問題: 旧インポートコードのバグで同じ人が2回取り込まれ、どちらも is_duplicate=0 になっている。
 * 対処: 同一の normalized_phone / normalized_email を持つレコードを検出し、
 *       古い方（最初に取込まれた方）を正規レコードとして残し、
 *       新しい方を重複（is_duplicate=1）としてマークした上で、
 *       正規レコードを本日の新規応募に昇格する。
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { db } = require('../db');

const JST = 9 * 60 * 60 * 1000;
const todayJST = new Date(Date.now() + JST).toISOString().slice(0, 10);
const cutoffUTC = new Date(todayJST + 'T05:00:00+09:00').toISOString();
const nowISO = new Date().toISOString();

console.log(`📅 JST今日: ${todayJST}`);
console.log(`🕔 カットオフ(UTC): ${cutoffUTC}`);
console.log('');

// 本日取込・重複でない全レコードを取得
const candidates = db.prepare(`
  SELECT id, name, normalized_phone, normalized_email, company, media, created_at
  FROM applicants
  WHERE created_at >= ? AND is_duplicate = 0
    AND (is_archived = 1 OR is_imported = 1 OR applied_at < ?)
  ORDER BY created_at ASC
`).all(cutoffUTC, todayJST);

console.log(`🔍 昇格候補（重複整理前）: ${candidates.length}件`);

// 同一 normalized_phone / normalized_email でグループ化
// 最初に見つかったもの（created_at ASC）を正規レコードとして残す
const seen = new Map(); // key: "phone|email" → id
const toMarkDup = []; // 重複としてマークするID → 正規ID

for (const r of candidates) {
  const phone = (r.normalized_phone || '').trim();
  const email = (r.normalized_email || '').trim();
  const key = phone || email || `name:${r.name}`; // 電話もメールもなければ名前で代用
  if (!key) continue;

  if (seen.has(key)) {
    // 同じ連絡先が既に登録済み → この r は重複
    toMarkDup.push({ id: r.id, originalId: seen.get(key) });
    console.log(`  🔁 重複: ${r.name} → 正規レコードID:${seen.get(key).slice(0,8)}...`);
  } else {
    seen.set(key, r.id);
  }
}

// ─────────────────────────────
// Step 1: 重複をマーク
// ─────────────────────────────
if (toMarkDup.length > 0) {
  console.log(`\n[1] 重複としてマーク: ${toMarkDup.length}件`);
  for (const { id, originalId } of toMarkDup) {
    db.prepare(`
      UPDATE applicants
      SET is_duplicate = 1, duplicate_of_id = ?, is_archived = 1,
          status = '重複', updated_at = ?
      WHERE id = ?
    `).run(originalId, nowISO, id);
  }
  console.log(`    ✅ ${toMarkDup.length}件を重複マーク済み`);
} else {
  console.log('\n[1] 重複なし（整理不要）');
}

// ─────────────────────────────
// Step 2: 残りを昇格
// ─────────────────────────────
const r1 = db.prepare(`
  UPDATE applicants
  SET is_archived = 0, is_imported = 0,
      applied_at = ?, applied_month = ?,
      status = '新規', updated_at = ?
  WHERE created_at >= ? AND is_duplicate = 0
    AND (is_archived = 1 OR is_imported = 1 OR applied_at < ?)
`).run(todayJST, todayJST.slice(0, 7), nowISO, cutoffUTC, todayJST);

console.log(`\n[2] 新規応募へ昇格: ${r1.changes}件`);

// ─────────────────────────────
// 結果確認
// ─────────────────────────────
const after = db.prepare(`
  SELECT COUNT(*) c FROM applicants
  WHERE is_archived = 0 AND is_duplicate = 0 AND applied_at >= ?
`).get(todayJST).c;

console.log(`\n✅ 完了。本日の新規応募数: ${after}件`);
console.log('   管理画面をリロードしてください。');
