'use strict';
// templates.js の COMPANIES に YUMIPRO AGENCY（yp）を1行だけ追加する一時スクリプト。
// 既存のローカル変更には一切触れず、「yp:」が無ければ am: の直後に1行挿入するだけ。
// 使い方（recruitment-platform フォルダで）: node add-yp-company.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'templates.js');
let src = fs.readFileSync(file, 'utf8');

if (src.includes("yp:")) {
  console.log('既に yp: が存在します。何もしませんでした。');
  process.exit(0);
}

const marker = /^(\s*am:\s*\{[^}]*\},)\s*$/m;
if (!marker.test(src)) {
  console.error('am: の行が見つかりませんでした。手動で追加してください:');
  console.error("  yp: { label: 'YUMIPRO AGENCY', full: '合同会社YUMIPRO AGENCY', color: '#65a30d' },");
  process.exit(1);
}

src = src.replace(marker, (match, line) => {
  return `${line}\n  yp: { label: 'YUMIPRO AGENCY', full: '合同会社YUMIPRO AGENCY', color: '#65a30d' },`;
});

fs.writeFileSync(file, src, 'utf8');
console.log('追加しました: yp（YUMIPRO AGENCY）を templates.js の COMPANIES に挿入しました。');
