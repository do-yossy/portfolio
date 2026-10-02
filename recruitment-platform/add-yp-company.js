'use strict';
// templates.js の COMPANIES に YUMIPRO AGENCY（yp）を1行追加する一時スクリプト。
// 前回(正規表現でam:の行全体にマッチ)が失敗したため、よりシンプルな「行単位の文字列検索」に変更。
// 「AMBITION合同会社」という文字列を含む行を探し、その直後に1行挿入するだけ。
// 使い方（recruitment-platform フォルダで）: node add-yp-company.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'templates.js');
let src = fs.readFileSync(file, 'utf8');

if (src.includes('yp:')) {
  console.log('既に yp: が存在します。何もしませんでした。');
  process.exit(0);
}

const NEEDLE = 'AMBITION合同会社';
const NEW_LINE = "  yp: { label: 'YUMIPRO AGENCY', full: '合同会社YUMIPRO AGENCY', color: '#65a30d' },";

const useCRLF = src.includes('\r\n');
const lines = src.split(/\r\n|\n/);
const idx = lines.findIndex(l => l.includes(NEEDLE));

if (idx === -1) {
  console.error(`「${NEEDLE}」という文字列が templates.js 内に見つかりませんでした。`);
  console.error('以下の1行を COMPANIES の中に手動で追加してください:');
  console.error(NEW_LINE);
  process.exit(1);
}

lines.splice(idx + 1, 0, NEW_LINE);
const out = lines.join(useCRLF ? '\r\n' : '\n');
fs.writeFileSync(file, out, 'utf8');
console.log(`追加しました（${idx + 2}行目に挿入）: yp（YUMIPRO AGENCY）を templates.js の COMPANIES に追加しました。`);
