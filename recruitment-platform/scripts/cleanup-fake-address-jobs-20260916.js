#!/usr/bin/env node
'use strict';
/**
 * 2026-09-16、generate-kyujinbox-from-performance.js が「区/市+連番丁目」という
 * 架空住所（例: 大阪市北区36丁目）を使っていた分を削除する一時クリーンアップ。
 * 未投稿(kyujinbox_posted_at IS NULL)のもののみ対象。投稿済みのものは一切触らない。
 *
 * 実行: node --experimental-sqlite scripts/cleanup-fake-address-jobs-20260916.js          // 確認のみ
 *       node --experimental-sqlite scripts/cleanup-fake-address-jobs-20260916.js --apply  // 実際に削除
 */
const path = require('path');
const { Jobs } = require('../db-factory');
const APPLY = process.argv.includes('--apply');

// 「<区市町村名>+数字+丁目」だけで構成された、実在の町名を含まない架空パターン
const FAKE_RE = /^.+?[区市町村]\d+丁目$/;

async function main() {
  const all = await Jobs.findAll();
  const targets = all.filter(j => !j.kyujinbox_posted_at && FAKE_RE.test(j.location || ''));

  console.log(`\n=== 架空住所ジョブのクリーンアップ${APPLY ? '（--apply・実際に削除）' : '（確認のみ）'} ===\n`);
  console.log(`対象: ${targets.length}件\n`);
  for (const j of targets) {
    console.log(`  [${j.company}] ${j.title}  (${j.location})`);
    if (APPLY) await Jobs.delete(j.id);
  }
  console.log(`\n${APPLY ? '削除しました' : '（確認のみ・未削除）'}: ${targets.length}件`);
  if (!APPLY) console.log('→ 削除するには --apply を付けて再実行してください。');
}
main().catch(err => { console.error(err); process.exit(1); });
