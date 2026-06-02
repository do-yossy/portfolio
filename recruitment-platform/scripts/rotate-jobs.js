#!/usr/bin/env node
'use strict';
/**
 * 求人ローテーションスクリプト
 *
 * 運用方針:
 *   - 常時 TARGET_ACTIVE 件を公開維持
 *   - ROTATE_AFTER_DAYS 日以上掲載中の求人を ROTATE_COUNT 件ずつ非公開化
 *   - 非公開求人から「最後に公開した日が古い順」に ROTATE_COUNT 件を新規公開
 *   - 再公開時は published_at を現在日時に更新（Google Jobsの鮮度保持）
 *
 * 実行方法:
 *   node --experimental-sqlite scripts/rotate-jobs.js
 *
 * Windows タスクスケジューラーで月・水・金 9:00 に自動実行推奨
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
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

const { Jobs } = require('../db-factory');

const TARGET_ACTIVE    = parseInt(process.env.ROTATE_TARGET  || '25', 10);
const ROTATE_COUNT     = parseInt(process.env.ROTATE_COUNT   || '8',  10);
const ROTATE_AFTER_DAYS= parseInt(process.env.ROTATE_DAYS    || '14', 10);

async function main() {
  const now      = new Date();
  const nowIso   = now.toISOString();
  const cutoff   = new Date(now - ROTATE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(`\n📅 求人ローテーション開始 ${nowIso.slice(0,10)}`);
  console.log(`   設定: 常時${TARGET_ACTIVE}件維持 / ${ROTATE_AFTER_DAYS}日で交代 / 1回${ROTATE_COUNT}件`);

  const all      = await Jobs.findAll();        // 全求人（公開・非公開含む）
  const published= all.filter(j => j.is_published);
  const unpublished = all.filter(j => !j.is_published);

  console.log(`\n📊 現在: 公開 ${published.length}件 / 非公開 ${unpublished.length}件 / 合計 ${all.length}件`);

  // ── Step 1: ROTATE_AFTER_DAYS 以上掲載中の求人を古い順に ROTATE_COUNT 件非公開化
  const toUnpublish = published
    .filter(j => (j.published_at || j.created_at || '') < cutoff)
    .sort((a, b) => (a.published_at || a.created_at || '') < (b.published_at || b.created_at || '') ? -1 : 1)
    .slice(0, ROTATE_COUNT);

  if (toUnpublish.length === 0) {
    console.log('\n⏭️  ローテーション対象なし（全求人が掲載から14日未満）');
  } else {
    console.log(`\n🔄 非公開化 ${toUnpublish.length}件:`);
    for (const job of toUnpublish) {
      await Jobs.update(job.id, { isPublished: false });
      console.log(`  ✅ 非公開: ${job.title} (掲載開始: ${(job.published_at || '').slice(0,10)})`);
    }
  }

  // ── Step 2: 現在の公開数を再計算
  const currentActive  = published.length - toUnpublish.length;
  const needToPublish  = Math.max(0, TARGET_ACTIVE - currentActive);
  const actualPublish  = Math.min(needToPublish, toUnpublish.length, unpublished.length + toUnpublish.length);

  // ── Step 3: 非公開求人から「最後に公開した日が古い順」に新規公開
  // 今回非公開化した求人も候補に含める（一旦全非公開から選ぶ）
  const unpublishedNow = all
    .filter(j => !j.is_published)
    .concat(toUnpublish)
    // 重複除去
    .filter((j, idx, arr) => arr.findIndex(x => x.id === j.id) === idx)
    // 今回非公開化したものを除く
    .filter(j => !toUnpublish.find(u => u.id === j.id))
    // 最後に公開した日が古い順にソート（published_at が null / 空 → 最優先）
    .sort((a, b) => {
      const da = a.published_at || '';
      const db = b.published_at || '';
      if (!da && !db) return 0;
      if (!da) return -1;
      if (!db) return  1;
      return da < db ? -1 : 1;
    });

  const toPublish = unpublishedNow.slice(0, actualPublish > 0 ? actualPublish : needToPublish);

  if (toPublish.length === 0) {
    console.log('\n⏭️  新規公開対象なし');
  } else {
    console.log(`\n🆕 新規公開 ${toPublish.length}件:`);
    for (const job of toPublish) {
      await Jobs.update(job.id, { isPublished: true, publishedAt: nowIso });
      console.log(`  ✅ 公開: ${job.title}`);
    }
  }

  // ── 結果サマリー
  const finalActive = currentActive + toPublish.length;
  console.log(`\n📊 ローテーション完了`);
  console.log(`   非公開化: ${toUnpublish.length}件`);
  console.log(`   新規公開: ${toPublish.length}件`);
  console.log(`   公開中合計: ${finalActive}件`);

  if (finalActive < TARGET_ACTIVE) {
    console.log(`\n⚠️  公開数が ${TARGET_ACTIVE} 件を下回っています（${finalActive}件）`);
    console.log('   求人プールを追加登録してください。');
  }
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
