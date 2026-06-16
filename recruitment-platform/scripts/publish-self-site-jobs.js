#!/usr/bin/env node
'use strict';
/**
 * 自社サイト掲載の求人をすべて「公開(is_published=1)」にするスクリプト。
 *  - 期限切れで一覧から消えないよう expires_at は無期限(null)に設定する
 *  - 既に公開済みの求人はそのまま（冪等。再実行しても安全）
 *
 * 実行(ローカル):  node --experimental-sqlite scripts/publish-self-site-jobs.js
 * 実行(本番):      flyctl ssh console -a sq-saiyou -C "node /app/scripts/publish-self-site-jobs.js"
 */
const { Jobs } = require('../db.js');

const all = Jobs.findAll({}); // 全求人
const targets = all.filter(j => (j.target_media || '').includes('自社サイト'));

let published = 0, already = 0;
for (const j of targets) {
  if (j.is_published) { already++; continue; }
  Jobs.update(j.id, { is_published: 1, expires_at: null }); // 公開・無期限
  published++;
  console.log(`✅ 公開: ${j.title}`);
}
console.log('----------------------------------------');
console.log(`自社サイト求人 ${targets.length}件: 新規公開 ${published}件 / 既に公開 ${already}件`);
