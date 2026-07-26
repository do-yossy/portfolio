'use strict';
/*
 * 求人ボックス 各アカウントの求人を一括セット
 * --------------------------------------------------
 * 決定した掲載構成（会社→職種→エリア）:
 *   ST (Style501)     … 大阪 / 配送ドライバー・送迎ドライバー
 *   BI (Brand ideaL)  … 東京 / 秘書兼ドライバー
 *   NL (NOWLIVE)      … 大阪 / 移動販売車（送迎・配送ドライバー）
 *   ※ sq / bg は投入済みのため対象外。pe/lt/nc/nx は不使用。
 *
 * 再実行しても重複しないよう、対象会社(st/bi/nl)の求人を一旦クリアしてから
 * 各seedを投入する（冪等）。各アカウント内はエリア・表現を変えた非重複バリエーション。
 *
 * 実行:  node --experimental-sqlite scripts/setup-kyujinbox-accounts.js
 *   または  npm run seed:accounts
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'data', 'recruitment.db');
const TARGET = ['st', 'bi', 'nl'];

// 実行順に各アカウントのseed（会社→職種→エリア）を定義
const SEEDS = [
  { co: 'st', label: 'ST(Style501) 大阪・配送ドライバー', file: 'seed-haisou-driver-style501-kyujinbox-osaka.js' },
  { co: 'st', label: 'ST(Style501) 大阪・送迎ドライバー', file: 'seed-soutei-driver-style501-kyujinbox-osaka.js' },
  { co: 'bi', label: 'BI(Brand ideaL) 東京・秘書兼ドライバー', file: path.join('scripts', 'seed-bi-secretary-driver-kyujinbox.js') },
  { co: 'nl', label: 'NL(NOWLIVE) 大阪・移動販売車', file: path.join('scripts', 'seed-nl-movingsales-kyujinbox.js') },
];

// 1) 対象会社を一旦クリア（冪等化。前回分やエリア違い（例: 東京版ST）が残らないように）
try {
  const { DatabaseSync } = require('node:sqlite');
  if (fs.existsSync(DB)) {
    const db = new DatabaseSync(DB);
    const q = TARGET.map(() => '?').join(',');
    const before = db.prepare(
      `SELECT company, COUNT(*) c FROM jobs WHERE company IN (${q}) GROUP BY company`
    ).all(...TARGET);
    db.prepare(`DELETE FROM jobs WHERE company IN (${q})`).run(...TARGET);
    db.close();
    const summary = before.map((r) => `${r.company}=${r.c}`).join(' ');
    console.log('🧹 クリア（対象会社の既存求人）:', summary || '（既存なし）');
  } else {
    console.log('（DB未作成: 各seedが作成します）');
  }
} catch (e) {
  console.log('（クリアをスキップ:', e.message, '）');
}

// 2) 各seedを順に実行（seed自身のDBアクセスに合わせ --experimental-sqlite を付与）
for (const s of SEEDS) {
  const abs = path.join(ROOT, s.file);
  if (!fs.existsSync(abs)) {
    console.log(`⚠️ seedが見つかりません: ${s.file}（スキップ）`);
    continue;
  }
  console.log(`\n▶ ${s.label}`);
  execFileSync(process.execPath, ['--experimental-sqlite', abs], { stdio: 'inherit', cwd: ROOT });
}

// 3) 件数サマリー
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB);
  const q = TARGET.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT company, COUNT(*) c FROM jobs WHERE company IN (${q}) AND is_published=1 GROUP BY company`
  ).all(...TARGET);
  db.close();
  const map = Object.fromEntries(rows.map((r) => [r.company, r.c]));
  console.log('\n✅ 完了: 求人ボックス各アカウントをセットしました');
  console.log(`   ST(大阪)=${map.st || 0}件 / BI(東京)=${map.bi || 0}件 / NL(大阪)=${map.nl || 0}件`);
  console.log('   → サーバーを再起動し、掲載管理で各アカウントの求人をご確認ください。');
} catch (e) {
  console.log('\n✅ 完了（件数サマリーは取得できませんでした:', e.message, '）');
}
