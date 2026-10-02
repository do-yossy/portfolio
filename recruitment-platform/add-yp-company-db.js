'use strict';
// db.js の OPS_COMPANIES（運用管理マスタ）に YUMIPRO AGENCY（yp）を1行追加する一時スクリプト。
// 「AMBITION合同会社」という文字列を含む行を探し、その直後に1行挿入する。
// 使い方（recruitment-platform フォルダで）: node add-yp-company-db.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'db.js');
let src = fs.readFileSync(file, 'utf8');

if (src.includes("id: 'yp'")) {
  console.log('既に yp が存在します。何もしませんでした。');
  process.exit(0);
}

const NEEDLE = 'AMBITION合同会社';
const NEW_LINE = "  { id: 'yp', name: '合同会社YUMIPRO AGENCY',  short: 'YP', label: 'YUMIPRO AGENCY' },";

const useCRLF = src.includes('\r\n');
const lines = src.split(/\r\n|\n/);
const idx = lines.findIndex(l => l.includes(NEEDLE));

if (idx === -1) {
  console.error(`「${NEEDLE}」という文字列が db.js 内に見つかりませんでした。`);
  console.error('以下の1行を COMPANIES 配列の中に手動で追加してください:');
  console.error(NEW_LINE);
  process.exit(1);
}

lines.splice(idx + 1, 0, NEW_LINE);
const out = lines.join(useCRLF ? '\r\n' : '\n');
fs.writeFileSync(file, out, 'utf8');
console.log(`追加しました（${idx + 2}行目に挿入）: yp（YUMIPRO AGENCY）を db.js の COMPANIES に追加しました。`);
