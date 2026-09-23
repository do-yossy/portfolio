#!/usr/bin/env node
'use strict';
/**
 * 投稿済み求人のうちrewarding(この仕事のやりがい)が未設定のものに、job_typeから
 * 判定したカテゴリの正しい文章を設定する(DBのみ)。2026-09-21にgenerate-kyujinbox-
 * from-performance.jsのrewarding未設定バグを直したが、それ以前に投稿された分は
 * DB側が未修正のまま残っていた(1598件)。
 *
 * カテゴリ判定は generate-kyujinbox-from-performance.js の TYPE_CAT と同じ
 * 完全一致を優先し、一致しない複合表記(例:「配送・ドライバー」)はキーワードで
 * フォールバック判定する。
 *
 * 使い方: node scripts/fix-rewarding-bulk.js            (DRY-RUN)
 *         node scripts/fix-rewarding-bulk.js --apply    (DB反映)
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const APPLY = process.argv.includes('--apply');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const db = new DatabaseSync(path.join(DATA_DIR, 'recruitment.db'));

// generate-kyujinbox-from-performance.js と同一
const TYPE_CAT = {
  '配送':'driver','中型ドライバー':'driver','ec配送':'driver','イベント配送':'driver','展示会配送':'driver','企業配送':'driver','配送ドライバー':'driver',
  '送迎':'chauffeur','送迎ドライバー':'chauffeur','秘書兼ドライバー':'chauffeur',
  '軽作業':'warehouse','梱包':'warehouse','組み立て':'warehouse','ピッキング':'warehouse','検品':'warehouse','物流倉庫':'warehouse',
  '製造':'mfg','品質管理':'mfg',
  '技術':'technician','メンテナンス':'technician',
  '営業':'sales','ルート営業':'sales','IT営業':'sales','コンサル営業':'sales','イベント営業':'sales','既存顧客営業':'sales',
  '事務':'office','ITサポート':'office','運行管理':'office',
  'イベント設営':'event','イベント企画':'event','イベント販売':'event','イベントスタッフ':'event','企画':'event',
  '昼アゲ様用':'special',
};
// TYPE_CATに無い複合表記のフォールバック(キーワード優先順)
const FALLBACK = [
  { kws: ['ドライバー', '配送'], cat: 'driver' },
  { kws: ['送迎'], cat: 'chauffeur' },
  { kws: ['軽作業', '物流', '倉庫'], cat: 'warehouse' },
  { kws: ['製造', '品質'], cat: 'mfg' },
  { kws: ['技術', 'メンテナンス'], cat: 'technician' },
  { kws: ['営業'], cat: 'sales' },
  { kws: ['事務', 'サポート'], cat: 'office' },
  { kws: ['イベント', '企画'], cat: 'event' },
];

const REWARDING = {
  driver: '決まったルート・エリアでの配送なので覚えやすく、未経験からでも安心してスタートできます。安定した固定給で長く働けることが魅力です。',
  chauffeur: 'お客様やスタッフの送迎を通じて「ありがとう」を直接いただける、やりがいのあるお仕事です。丁寧な対応を大切にする環境で働けます。',
  warehouse: 'かんたんな軽作業が中心で、未経験の方も無理なく始められます。黙々と作業に集中できる環境で、コツコツ取り組みたい方に向いています。',
  mfg: '手順やマニュアルがあり、未経験からでも段階的に習得できます。ものづくりの現場でスキルを身につけながら長く働ける環境です。',
  technician: '設備・機器の点検やチェックが中心で、手順に沿って段階的に習得できます。未経験から専門知識を身につけられるお仕事です。',
  sales: '決められた商品を売るだけでなく、お客様の課題に寄り添う提案営業です。既存のお客様中心で、ノルマに追われず働けます。',
  office: '基本的なPC操作ができればOKで、未経験・ブランクのある方も歓迎です。落ち着いた環境でコツコツ取り組める事務のお仕事です。',
  event: '現場ごとに新しい出会いがあり、活気ある環境で働けます。人と接するのが好きな方にはやりがいを感じやすいお仕事です。',
  special: '未経験の方も歓迎、丁寧にサポートします。無理のないペースで新しい仕事に挑戦できる環境です。',
};

function categoryFor(jobType) {
  if (TYPE_CAT[jobType]) return TYPE_CAT[jobType];
  for (const { kws, cat } of FALLBACK) {
    if (kws.some(kw => jobType.includes(kw))) return cat;
  }
  return null;
}

const rows = db.prepare(
  "SELECT id, company, job_type, kyujinbox_job_number FROM jobs WHERE kyujinbox_posted_at IS NOT NULL AND kyujinbox_job_number IS NOT NULL AND kyujinbox_job_number != '' AND (rewarding IS NULL OR rewarding = '')"
).all();

const byCo = {};
let updated = 0, unmatched = 0;
const updateStmt = db.prepare('UPDATE jobs SET rewarding = ? WHERE id = ?');

for (const r of rows) {
  const cat = categoryFor(r.job_type);
  if (!cat) { unmatched++; console.log(`  ⚠️ カテゴリ判定不可: ${r.company} ${r.job_type}`); continue; }
  const text = REWARDING[cat];
  if (APPLY) updateStmt.run(text, r.id);
  (byCo[r.company] ||= []).push({ jobNumber: r.kyujinbox_job_number, rewarding: text });
  updated++;
}

console.log(`\n${APPLY ? '反映' : 'DRY-RUN'}: 対象 ${rows.length}件 / カテゴリ判定OK ${updated}件 / 判定不可 ${unmatched}件\n`);
for (const co of Object.keys(byCo)) console.log(`  [${co}] ${byCo[co].length}件`);

if (APPLY) {
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  for (const co of Object.keys(byCo)) {
    fs.writeFileSync(path.join(logsDir, `rewarding-queue-${co}.json`), JSON.stringify(byCo[co], null, 2));
    console.log(`  📝 logs/rewarding-queue-${co}.json (${byCo[co].length}件)`);
  }
} else {
  console.log('\n→ 反映するには --apply を付けて再実行してください。');
}
