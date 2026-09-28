#!/usr/bin/env node
'use strict';
/**
 * 媒体×会社の「掲載数」と「直近30日の応募実績」を突き合わせて一覧化する（読み取り専用）。
 * 掲載数を見直す（増やす/減らす）際の判断材料にする目的。
 * 目安：
 *   - 掲載数が多いのに応募が少ない（1求人あたり応募が0に近い）→ 希薄化・垢BANリスクが高い候補。減らす/統合を検討。
 *   - 掲載数が少ないのに1求人あたり応募が多い → まだ伸ばす余地がある候補。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/posting-inventory-matrix.js
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const pad = (s, n) => String(s).padEnd(n, ' ');
const padL = (s, n) => String(s).padStart(n, ' ');
const jst = ms => new Date(Date.now() + 9 * 3600 * 1000 + ms).toISOString().slice(0, 10);
const since30 = jst(-29 * 86400000);
const today = jst(0);

const MEDIA = [
  { key: 'kyujinbox', label: '求人ボックス', pats: ['求人ボックス', 'kyujinbox'] },
  { key: 'engage',    label: 'engage',       pats: ['engage', 'エンゲージ'] },
  { key: 'indeed',    label: 'Indeed',       pats: ['indeed', 'Indeed'] },
  { key: 'stanby',    label: 'スタンバイ',     pats: ['stanby', 'スタンバイ'] },
  { key: 'google',    label: 'Googleしごと',   pats: ['google', 'Google', 'しごと'] },
  { key: 'seniorjob', label: 'シニアジョブ',   pats: ['シニアジョブ', 'seniorjob'] },
];
const CONAME = { sq:'SQ', bg:'ビッグ(Bigeyes)', st:'Style501', nl:'NOWLIVE', bi:'BrandideaL', nx:'ネクサス', sl:'スマイルライフ', am:'AMBITION', pe:'ピープル', lt:'LifeTailor', nc:'ニクール' };

// ── 掲載数（jobs テーブル・公開中のみ） ──
const jobs = db.prepare(`SELECT company, target_media FROM jobs WHERE is_published = 1`).all();
const postCount = {}; // postCount[company][mediaKey] = 件数
for (const j of jobs) {
  const tm = String(j.target_media || '');
  for (const m of MEDIA) {
    if (m.pats.some(p => tm.includes(p))) {
      postCount[j.company] = postCount[j.company] || {};
      postCount[j.company][m.key] = (postCount[j.company][m.key] || 0) + 1;
    }
  }
}

// ── 直近30日の応募実績（applicants テーブル） ──
const appls = db.prepare(
  `SELECT company, media, is_duplicate FROM applicants WHERE substr(applied_at,1,10) >= ? AND substr(applied_at,1,10) <= ?`
).all(since30, today);
const applCount = {}; // applCount[company][mediaKey] = { total, valid }
for (const a of appls) {
  const m = a.media || '';
  applCount[a.company] = applCount[a.company] || {};
  applCount[a.company][m] = applCount[a.company][m] || { total: 0, valid: 0 };
  applCount[a.company][m].total++;
  if (a.is_duplicate === 0) applCount[a.company][m].valid++;
}

const companies = [...new Set([...Object.keys(postCount), ...Object.keys(applCount)])].sort();

console.log(`\n==================== 媒体×会社 掲載数 vs 直近30日応募実績（${since30}〜${today}） ====================\n`);

for (const co of companies) {
  console.log(`【${CONAME[co] || co}】`);
  console.log('  ' + pad('媒体', 16) + padL('掲載数', 8) + padL('30日応募', 9) + padL('30日有効', 9) + padL('1求人あたり有効', 15) + '  判定');
  let hasAny = false;
  for (const m of MEDIA) {
    const posts = (postCount[co] || {})[m.key] || 0;
    const appl = (applCount[co] || {})[m.key] || { total: 0, valid: 0 };
    if (posts === 0 && appl.total === 0) continue;
    hasAny = true;
    const perPosting = posts > 0 ? (appl.valid / posts).toFixed(2) : '−';
    let judge = '';
    if (posts >= 10 && appl.valid / Math.max(posts, 1) < 0.3) judge = '⚠ 希薄化・要見直し候補';
    else if (posts > 0 && posts < 5 && appl.valid / Math.max(posts, 1) >= 1) judge = '↑ 伸ばす余地あり候補';
    console.log('  ' + pad(m.label, 16) + padL(posts, 8) + padL(appl.total, 9) + padL(appl.valid, 9) + padL(perPosting, 15) + '  ' + judge);
  }
  if (!hasAny) console.log('  （掲載・応募とも無し）');
  console.log('');
}

console.log('※ 「1求人あたり有効」= 直近30日有効応募数 ÷ 掲載数。掲載数が多いのにこの値が低いほど、1求人の露出が薄い（垢BANリスク・ToSリスクの観点でも要注意）。');
console.log('※ 判定は機械的な目安（掲載10件以上かつ1求人あたり0.3件未満＝希薄化候補／掲載5件未満かつ1求人あたり1件以上＝伸ばす余地あり候補）。最終判断は原稿の実態を見て行うこと。\n');
