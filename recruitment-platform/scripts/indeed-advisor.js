#!/usr/bin/env node
'use strict';
/**
 * 【読み取り専用】Indeedアナリティクス（求人別CSV）を読み込み、掲載の運用判断を出す。
 * 2026-10-07、背景：新規応募が100件/日に届かず、掲載方法（残す／入れ替える／次に出すエリア）を
 * 毎週データで決められるようにする。
 *
 * 入力：Indeed employers の「求人別レポート」CSV（JobsCampaigns_*.csv）。会社ごとに1ファイル、複数指定可。
 * 出力：
 *   1. 会社別の募集中件数（目標14〜18件に対する過不足）
 *   2. 区分別（配送／送迎／専属・一般ドライバー／倉庫・軽作業／その他）の 表示・クリック・応募・応募率
 *   3. 求人ごとの判断（維持／入れ替え候補／様子見）
 *        維持      … 応募1件以上、または表示100回以上（14日以上は終了しない）
 *        入れ替え  … 掲載3日以上で、表示60回未満 または クリック3回未満
 *        様子見    … 上記以外、または掲載3日未満
 *   4. エリア別の成績（3件以上）→ 次に出すエリア／減らすエリア
 *
 * 使い方（ファイルの場所を引数で渡す）:
 *   node scripts/indeed-advisor.js <CSV> [<CSV> ...] [--today 2026-10-07]
 */
const fs = require('fs');
const argv = process.argv.slice(2);
const ti = argv.indexOf('--today');
const files = argv.filter((a, i) => !a.startsWith('--') && (ti < 0 || i !== ti + 1));
if (!files.length) { console.error('使い方: node scripts/indeed-advisor.js <CSV> [<CSV> ...] [--today YYYY-MM-DD]'); process.exit(1); }

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const num = x => { const n = parseFloat(x); return Number.isFinite(n) ? n : 0; };
const parseJpDate = s => { const m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };

const jobs = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  const [head, ...body] = parseCsv(text);
  const ix = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  for (const r of body) {
    if (!r[ix['求人']]) continue;
    jobs.push({
      title: r[ix['求人']], area: (r[ix['市区町村']] || '').replace(/\s/g, ''), company: r[ix['企業名']],
      created: parseJpDate(r[ix['作成日']]), status: r[ix['求人のステータス']],
      imp: num(r[ix['表示回数']]), clk: num(r[ix['クリック数']]), start: num(r[ix['応募開始数']]), app: num(r[ix['応募数']]),
    });
  }
}
const latest = ti >= 0 ? new Date(argv[ti + 1]) : new Date(Math.max(...jobs.map(j => j.created ? j.created.getTime() : 0)));
const ageOf = j => j.created ? Math.floor((latest - j.created) / 86400000) + 1 : 0;

const kind = t => /配送/.test(t) ? '配送' : /送迎|アテンド/.test(t) ? '送迎' : /^(専属ドライバー|ドライバー)$/.test(t) ? '専属・一般ドライバー' : /梱包|ピッキング|倉庫|軽作業/.test(t) ? '倉庫・軽作業' : 'その他';
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '−');

// 1. 会社別の募集中
console.log(`\n=== 会社別の募集中件数（基準日 ${latest.toISOString().slice(0, 10)}）===`);
const byCo = new Map();
for (const j of jobs) { const b = byCo.get(j.company) || { all: 0, live: 0, app: 0 }; b.all++; if (j.status === '募集中') b.live++; b.app += j.app; byCo.set(j.company, b); }
for (const [co, b] of byCo) console.log(`  ${co}: 募集中 ${b.live}件 / 期間中の求人 ${b.all}件 / 応募 ${b.app}件 ${b.live < 12 ? '  ⚠ 募集中が少ない（目標14〜18件）' : ''}`);

// 2. 区分別
console.log('\n=== 区分別（応募率＝応募÷クリック／表示あたり応募）===');
const byKind = new Map();
for (const j of jobs) { const k = kind(j.title); const b = byKind.get(k) || { n: 0, imp: 0, clk: 0, app: 0 }; b.n++; b.imp += j.imp; b.clk += j.clk; b.app += j.app; byKind.set(k, b); }
for (const [k, b] of [...byKind].sort((a, b) => b[1].app - a[1].app))
  console.log(`  ${k.padEnd(12)} 求人${String(b.n).padStart(4)} 表示${String(b.imp).padStart(6)} クリック${String(b.clk).padStart(5)} 応募${String(b.app).padStart(4)} 応募率${pct(b.app, b.clk).padStart(6)} 応募/求人${(b.app / b.n).toFixed(2)} 表示/求人${(b.imp / b.n).toFixed(0)}`);

// 3. 求人ごとの判断（募集中のみ）
console.log('\n=== 募集中の求人ごとの判断 ===');
const live = jobs.filter(j => j.status === '募集中');
const judge = j => {
  const age = ageOf(j);
  if (j.app >= 1 || j.imp >= 100) return '維持（14日以上は終了しない）';
  if (age >= 3 && (j.imp < 60 || j.clk < 3)) return '入れ替え候補';
  return '様子見';
};
const groups = { '維持（14日以上は終了しない）': [], '入れ替え候補': [], '様子見': [] };
for (const j of live) groups[judge(j)].push(j);
for (const [g, list] of Object.entries(groups)) {
  console.log(`  【${g}】 ${list.length}件`);
  list.slice(0, 40).forEach(j => console.log(`    ${j.company.slice(0, 10).padEnd(11)} ${j.title.slice(0, 16).padEnd(18)} ${j.area.padEnd(10)} 掲載${String(ageOf(j)).padStart(2)}日 表示${String(j.imp).padStart(4)} クリック${String(j.clk).padStart(3)} 応募${j.app}`));
}

// 4. エリア別
console.log('\n=== エリア別（3件以上掲載）応募/求人 ===');
const byArea = new Map();
for (const j of jobs) { const b = byArea.get(j.area) || { n: 0, imp: 0, app: 0 }; b.n++; b.imp += j.imp; b.app += j.app; byArea.set(j.area, b); }
const areas = [...byArea].filter(([, b]) => b.n >= 3).sort((a, b) => b[1].app / b[1].n - a[1].app / a[1].n);
console.log('  【次に出す候補（強い）】');
areas.slice(0, 6).forEach(([a, b]) => console.log(`    ${a.padEnd(12)} ${b.n}件 表示/求人${(b.imp / b.n).toFixed(0)} 応募/求人${(b.app / b.n).toFixed(2)}`));
console.log('  【減らす候補（弱い）】');
areas.slice(-6).reverse().forEach(([a, b]) => console.log(`    ${a.padEnd(12)} ${b.n}件 表示/求人${(b.imp / b.n).toFixed(0)} 応募/求人${(b.app / b.n).toFixed(2)}`));
console.log('\n※ 件数が少ない場合は偶然の差の可能性があります。数週間分を溜めて判断してください。');
