#!/usr/bin/env node
'use strict';
/**
 * 時間別の対話率を、記録（hourly-rate.csv）から集計して表示する（依存ゼロ・読み取り専用）。
 * 使い方：node hourly-report.js
 *  - hourly-rate.csv：date,hour,calls,connected,rate,note（callsは数字のみ集計。「約18」のような逆算値は、数字を取り出して集計し、末尾に * を付ける）
 *  - call-times.csv：つながった通話の開始時刻（時間帯別の接続件数の参考）
 */
const fs = require('fs');
const path = require('path');
function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const cols = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cols.push(cur); cur = ''; } else cur += ch; }
    cols.push(cur);
    const o = {}; head.forEach((h, i) => { o[h] = cols[i] || ''; }); return o;
  });
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
const rows = readCsv(path.join(__dirname, 'hourly-rate.csv'));
const byHour = {};
for (const r of rows) {
  const h = parseInt(r.hour, 10); if (Number.isNaN(h)) continue;
  const m = String(r.calls).match(/\d+/); const calls = m ? parseInt(m[0], 10) : 0;
  const est = /約|逆算/.test(r.calls + r.note) && /約/.test(r.calls);
  const x = (byHour[h] = byHour[h] || { calls: 0, conn: 0, days: [], est: false });
  x.calls += calls; x.conn += parseInt(r.connected, 10) || 0; x.days.push(r.date); x.est = x.est || est;
}
console.log('【時間別の対話率】（時 / 架電数 / 対話数 / 対話率 / 記録日数）');
for (const h of Object.keys(byHour).map(Number).sort((a, b) => a - b)) {
  const x = byHour[h];
  console.log(`${String(h).padStart(2, '0')}時\t${x.calls}${x.est ? '*' : ''}\t${x.conn}\t${pct(x.conn, x.calls)}\t${x.days.length}日`);
}
console.log('* 架電数に逆算値（約）を含む。20件未満の時間帯は、傾向を断定しない。');
const times = readCsv(path.join(__dirname, 'call-times.csv'));
const th = {};
for (const r of times) { const h = parseInt(String(r.start_time).split(':')[0], 10); if (!Number.isNaN(h)) th[h] = (th[h] || 0) + 1; }
console.log('\n【つながった通話の開始時刻（録音）の時間帯別件数】（時 / 件数）');
for (const h of Object.keys(th).map(Number).sort((a, b) => a - b)) console.log(`${String(h).padStart(2, '0')}時\t${th[h]}`);
