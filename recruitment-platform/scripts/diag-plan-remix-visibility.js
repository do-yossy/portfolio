#!/usr/bin/env node
'use strict';
/**
 * seed-plan-remix-20260906.js --apply で追加した108件が、掲載管理画面（/admin/ops?tab=posts）に
 * 出てこない原因を診断する（読み取り専用・更新なし）。
 *
 * 掲載管理の「会社×媒体」件数は jobs テーブル(is_published=1 & target_media)を直接集計するcrossTab、
 * 掲載「一覧」は media_posts という別テーブル（投稿実行時に作られるログ）を見ている。
 * この2つのどちらを指しているかで原因が変わるため、両方の実データを出す。
 *
 * 使い方: node --experimental-sqlite scripts/diag-plan-remix-visibility.js
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

console.log('\n① 最近作成された求人 15件（company/is_published/target_media/title）');
const recent = db.prepare(
  `SELECT company, is_published, target_media, title, created_at FROM jobs ORDER BY datetime(created_at) DESC LIMIT 15`
).all();
for (const r of recent) {
  console.log(`  [${r.company}] pub=${r.is_published} media=${r.target_media}  ${r.title.slice(0,40)}  (${r.created_at})`);
}

console.log('\n② 9/6バッチの特徴（エリア末尾が4/5/6丁目）に一致する求人の件数（会社別）');
const co5 = ['sq','bg','st','nl','bi'];
for (const co of co5) {
  const row = db.prepare(
    `SELECT COUNT(*) c FROM jobs WHERE company=? AND (title LIKE '%4丁目%' OR title LIKE '%5丁目%' OR title LIKE '%6丁目%')`
  ).get(co);
  const pubRow = db.prepare(
    `SELECT COUNT(*) c FROM jobs WHERE company=? AND is_published=1 AND (title LIKE '%4丁目%' OR title LIKE '%5丁目%' OR title LIKE '%6丁目%')`
  ).get(co);
  console.log(`  ${co}: 該当${row.c}件（うちis_published=1: ${pubRow.c}件）`);
}

console.log('\n③ 会社×媒体クロス集計（掲載管理トップの件数表と同じロジックを再現）');
const MEDIA_NAME = { indeed:'Indeed', kyujinbox:'求人ボックス', stanby:'スタンバイ', google:'Googleしごと', engage:'engage', seniorjob:'シニアジョブ' };
const nameToId = {};
for (const [id,name] of Object.entries(MEDIA_NAME)) { nameToId[name]=id; nameToId[id]=id; }
const table = {};
const allJobs = db.prepare(`SELECT company, target_media FROM jobs WHERE is_published = 1`).all();
for (const j of allJobs) {
  let arr = [];
  try { arr = JSON.parse(j.target_media || '[]'); } catch { arr = []; }
  for (const m of arr) {
    const id = nameToId[m] || m;
    table[j.company] = table[j.company] || {};
    table[j.company][id] = (table[j.company][id] || 0) + 1;
  }
}
for (const co of co5) {
  console.log(`  ${co}: ${JSON.stringify(table[co] || {})}`);
}

console.log('\n④ media_posts テーブル（掲載管理の「一覧」表示元。投稿実行時にのみ作られるログ）の件数');
const mpCount = db.prepare(`SELECT COUNT(*) c FROM media_posts`).get();
const mpRecent = db.prepare(`SELECT company_id, media, job_title, post_date, status, created_at FROM media_posts ORDER BY datetime(created_at) DESC LIMIT 5`).all();
console.log(`  media_posts 総件数: ${mpCount.c}`);
for (const r of mpRecent) console.log(`  [${r.company_id}/${r.media}] ${r.job_title?.slice(0,30)}  status=${r.status} post_date=${r.post_date} (${r.created_at})`);

console.log('\n※ ①②で108件が is_published=1 で見えていれば、DB自体は正常です。');
console.log('※ ③の件数が増えていれば「掲載管理トップの件数表」には反映されています（=クロス集計は生きているjobsを見る）。');
console.log('※ ④のmedia_postsは「実際に投稿ボタンを押して投稿した記録」なので、投稿前は0件のままで正常です。');

console.log('\n⑤「🚀 求人ボックスに投稿する」ボタンと全く同じロジックで、会社別の投稿済み/未投稿を再現');
console.log('   （判定は media_posts ではなく jobs.kyujinbox_posted_at 列で行われている）');
for (const co of co5) {
  const allJobs = db.prepare(`SELECT id, title, target_media, kyujinbox_posted_at FROM jobs WHERE is_published=1 AND company=?`).all(co);
  const kbJobs = allJobs.filter(j => {
    let m = []; try { m = JSON.parse(j.target_media || '[]'); } catch {}
    return m.includes('求人ボックス') || m.includes('kyujinbox');
  });
  const already = kbJobs.filter(j => j.kyujinbox_posted_at).length;
  const unposted = kbJobs.length - already;
  console.log(`  ${co}: 求人ボックス対象=${kbJobs.length}件 / 投稿済み=${already}件 / 未投稿=${unposted}件`);
}
console.log('\n※ ⑤の「未投稿」が、ボタンを押したときに実際に投稿される件数です。');
console.log('※ 重要: 1回のボタン押下で投稿されるのは会社ごとに最大25件（バッチ上限）。');
console.log('　未投稿が25件を超える会社は、ボタンを複数回押す（または画面の投稿件数指定を増やす）必要があります。\n');
