#!/usr/bin/env node
'use strict';
/**
 * 現在の掲載内容（公開中の求人）を媒体別・会社別にテキスト出力する（読み取り専用）。
 * target_media に該当媒体を含む is_published=1 の求人を一覧化。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/list-postings.js                 // 全媒体
 *   node --experimental-sqlite scripts/list-postings.js --media engage  // engageのみ
 *   node --experimental-sqlite scripts/list-postings.js --media kyujinbox // 求人ボックスのみ
 *   node --experimental-sqlite scripts/list-postings.js --company st
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const onlyMedia = val('--media');
const onlyCo = val('--company');

// 媒体の判定キーワード（target_media に含まれる表記ゆれを吸収）
const MEDIA = [
  { key: 'kyujinbox', label: '求人ボックス', pats: ['求人ボックス', 'kyujinbox'] },
  { key: 'engage',    label: 'engage（エンゲージ）', pats: ['engage', 'エンゲージ'] },
  { key: 'indeed',    label: 'Indeed', pats: ['indeed', 'Indeed'] },
  { key: 'stanby',    label: 'スタンバイ', pats: ['stanby', 'スタンバイ'] },
  { key: 'google',    label: 'Googleしごと', pats: ['google', 'Google', 'しごと'] },
];
const CONAME = { sq:'SQ', bg:'Bigeyes', pe:'ピープル', lt:'LifeTailor', nc:'ニクール', nx:'ネクサス', st:'Style501', bi:'BrandideaL', nl:'NOWLIVE' };

const rows = db.prepare(
  `SELECT company, job_type, title, location, target_media
     FROM jobs WHERE is_published = 1 ORDER BY company, job_type, title`
).all();

let grand = 0;
for (const m of MEDIA) {
  if (onlyMedia && onlyMedia.toLowerCase() !== m.key) continue;
  const hit = rows.filter(r => {
    const tm = String(r.target_media || '');
    return m.pats.some(p => tm.includes(p)) && (!onlyCo || r.company === onlyCo);
  });
  if (hit.length === 0) continue;
  console.log(`\n================ ${m.label}：${hit.length}件 ================`);
  const byCo = {};
  for (const r of hit) (byCo[r.company] = byCo[r.company] || []).push(r);
  for (const co of Object.keys(byCo)) {
    console.log(`\n【${CONAME[co] || co}】${byCo[co].length}件`);
    for (const r of byCo[co]) console.log(`  ${r.title}　［${r.location}］`);
  }
  grand += hit.length;
}
console.log(`\n---- 合計 ${grand}件（is_published=1） ----`);
console.log('※ target_media 表記で媒体判定。engageが出ない場合は掲載を媒体側で直接管理している可能性があります。\n');
