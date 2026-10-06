#!/usr/bin/env node
'use strict';
/**
 * 【読み取り専用】「タクシーの話を聞いた」件数を、職種名・媒体・会社別に集計する。
 * システムに専用の項目が無いため、架電メモ（applicants.notes）に目印を入れる運用で数える。
 * 2026-10-06、ユーザー確認：「タクシーの話を聞いたを記録できない（システムに項目なし）」
 *
 * 運用ルール（現場）:
 *   架電のメモ欄に、タクシーの話を聞いてもらえた応募者へ「【タク話】」と入力する
 *   （興味ありで担当に繋いだ場合は「【タク話◎】」）。個人情報は書かない。
 *
 * 出力: 目印のある応募者を、会社・媒体・求人タイトル別に集計（応募数に対する割合も出す）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/count-taxi-pitch.js                     // 直近30日
 *   node --experimental-sqlite scripts/count-taxi-pitch.js --since 2026-10-01
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

const argv = process.argv.slice(2);
const si = argv.indexOf('--since');
const since = si >= 0 ? argv[si + 1] : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

const rows = db.prepare(
  `SELECT company, media, job_title, status, notes FROM applicants WHERE substr(applied_at,1,10) >= ? AND is_duplicate = 0`
).all(since);

const hit = r => /【タク話/.test(r.notes || '');
const strong = r => /【タク話◎】/.test(r.notes || '');
console.log(`\n=== タクシーの話を聞いた件数（${since}以降・有効応募ベース）===`);
console.log(`有効応募 ${rows.length}件 / タク話 ${rows.filter(hit).length}件 / うち◎（担当に繋いだ） ${rows.filter(strong).length}件\n`);

const group = (keyFn, label) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r) || '(不明)';
    const b = m.get(k) || { n: 0, taxi: 0, strong: 0 };
    b.n++; if (hit(r)) b.taxi++; if (strong(r)) b.strong++;
    m.set(k, b);
  }
  console.log(`【${label}別】 応募 / タク話 / ◎ / タク話率`);
  [...m.entries()].sort((a, b) => b[1].taxi - a[1].taxi || b[1].n - a[1].n).slice(0, 15)
    .forEach(([k, b]) => console.log(`  ${String(k).slice(0, 30).padEnd(32)} ${String(b.n).padStart(4)} / ${String(b.taxi).padStart(3)} / ${String(b.strong).padStart(3)} / ${(100 * b.taxi / b.n).toFixed(1)}%`));
  console.log();
};
group(r => r.company, '会社');
group(r => r.media, '媒体');
group(r => r.job_title, '求人タイトル');
console.log('※ 目印「【タク話】」が架電メモに入っている応募者のみ数えます。入力が無い分は0件扱いです。');
