'use strict';

// target_media から 'stanby' / 'スタンバイ' を除去する（スタンバイ未掲載のため）
const { db } = require('../db');

const jobs = db.prepare("SELECT id, title, target_media FROM jobs WHERE is_published = 1").all();
let updated = 0;

for (const job of jobs) {
  let mediaList = [];
  try { mediaList = JSON.parse(job.target_media || '[]'); } catch { continue; }

  const before = mediaList.length;
  const after = mediaList.filter(m => m !== 'stanby' && m !== 'スタンバイ');
  if (after.length === before) continue; // 変更なし

  db.prepare("UPDATE jobs SET target_media = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(after), new Date().toISOString(), job.id);
  console.log(`✓ ${job.title.slice(0, 40)} → [${after.join(', ')}]`);
  updated++;
}

console.log(`\nスタンバイを除去: ${updated}件の求人を更新しました。`);
