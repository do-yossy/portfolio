#!/usr/bin/env node
'use strict';
/**
 * 求人ボックス投稿テスト用シード
 * 指定した会社に「テスト求人」を1件だけ作成（求人ボックス掲載対象）。
 * 新アカウント(Brand ideaL=bi / NOWLIVE=nl)の求人ボックス投稿確認に使う。
 *
 * 実行例:
 *   node --experimental-sqlite scripts/seed-test-kyujinbox.js bi
 *   node --experimental-sqlite scripts/seed-test-kyujinbox.js nl
 *
 * 作成後、管理画面の「掲載管理」で対象会社タブを選び
 * 「🚀 求人ボックスに投稿する」で投稿してください（VPN接続が必要）。
 * テスト後は管理画面から削除できます。
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

const { Jobs } = require('../db-factory');

const CO  = String(process.argv[2] || 'bi').toLowerCase();
const NOW = new Date().toISOString();

const job = {
  title:          `【テスト】求人ボックス掲載テスト（${CO.toUpperCase()}）※確認後は削除可`,
  location:       '大阪府大阪市中央区',
  salary:         '月給300,000円〜400,000円',
  jobType:        '配送・ドライバー',
  employmentType: '正社員',
  description:    `これは求人ボックス投稿の動作確認用テスト求人です（会社ID: ${CO}）。\n投稿が確認できたら削除してください。\n\n【仕事内容】\n動作確認用のテスト求人です。実際の募集ではありません。\n\n【勤務地】\n大阪府大阪市中央区\n\n【給与】\n月給300,000円〜400,000円`,
  tags:           ['未経験歓迎', '正社員', 'テスト'],
  catchcopy:      '求人ボックス投稿テスト｜確認後は削除可',
  imageUrl:       '/images/ec-haisou-driver.jpg',
  isPublished:    true,
  publishedAt:    NOW,
  targetMedia:    ['kyujinbox'],
  company:        CO,
};

async function main() {
  console.log(`\n🧪 求人ボックス投稿テスト用求人を作成します（会社: ${CO}）...\n`);
  const existing = await Jobs.findAll();
  if (existing.some(j => j.title === job.title && j.company === CO)) {
    console.log(`⏭️  既に存在します: ${job.title}`);
  } else {
    await Jobs.create(job);
    console.log(`✅ 作成完了: ${job.title}`);
  }
  console.log('\n次の手順:');
  console.log('  1) サーバー再起動（未起動なら node --experimental-sqlite server.js）');
  console.log(`  2) 管理画面「掲載管理」→ ${CO.toUpperCase()} の会社タブを選択`);
  console.log('  3) VPN「接続中」を確認 →「🚀 求人ボックスに投稿する」をクリック');
  console.log('  4) ログに投稿ログが流れ、求人ボックス側に掲載されればOK');
  console.log('  ※ テスト後は管理画面（求人管理）から削除できます。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
