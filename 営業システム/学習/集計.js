#!/usr/bin/env node
'use strict';
/*
 * 応募ログ.jsonl を集計し、学習ループの判断材料を出力する。
 *   node 集計.js        … 実データのみ集計（example:true は除外）
 *   node 集計.js --all   … 見本(example)も含めて集計（動作確認用）
 *
 * 出力：全体KPI / タイプ別 / 媒体別 / テンプレ別 / 予測vs実績キャリブレーション / 改善提案
 * 週次レポート（役割8）としてもそのまま使える。
 */
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, '応募ログ.jsonl');
const includeExamples = process.argv.includes('--all');

// ── ユーティリティ ─────────────────────────────
const yen = n => '¥' + Math.round(n || 0).toLocaleString('ja-JP');
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const avg = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
const DECIDED = new Set(['won', 'lost', 'no_reply', 'declined']); // 受注率の母数
const isWon = r => r.outcome === 'won';

// 媒体手数料（営業案件管理ツール.html と同一ロジック）
function mediaFee(amount, channel) {
  if (channel === 'cwtech') return 0;
  if (channel === 'lancers') return Math.round(amount * 0.165);
  let f = Math.min(amount, 100000) * 0.20;
  if (amount > 100000) f += Math.min(amount - 100000, 100000) * 0.10;
  if (amount > 200000) f += (amount - 200000) * 0.05;
  return Math.round(f);
}

// ── ロード ─────────────────────────────────────
function load() {
  if (!fs.existsSync(LOG)) { console.error('応募ログ.jsonl が見つかりません'); return []; }
  return fs.readFileSync(LOG, 'utf8')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map((l, i) => { try { return JSON.parse(l); } catch { console.error(`! ${i + 1}行目: JSON解析に失敗（スキップ）`); return null; } })
    .filter(Boolean)
    .filter(r => includeExamples || !r.example);
}

// ── 集計 ───────────────────────────────────────
function summarize(rows) {
  const decided = rows.filter(r => DECIDED.has(r.outcome));
  const won = rows.filter(isWon);
  const net = won.reduce((s, r) => s + ((r.actual_price || 0) - mediaFee(r.actual_price || 0, r.channel)), 0);
  const hours = won.reduce((s, r) => s + (r.actual_hours || 0), 0);
  return {
    n: rows.length,
    decided: decided.length,
    won: won.length,
    winRate: pct(won.length, decided.length),
    revenue: won.reduce((s, r) => s + (r.actual_price || 0), 0),
    net,
    avgPrice: avg(won.map(r => r.actual_price || 0)),
    avgProfit: avg(won.filter(r => r.profit_rate).map(r => r.profit_rate)),
    avgHours: avg(won.filter(r => r.actual_hours).map(r => r.actual_hours)),
    effWage: hours > 0 ? net / hours : 0,
    mrr: won.reduce((s, r) => s + (r.maintenance || 0), 0),
  };
}

function byKey(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || '(不明)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].map(([k, rs]) => ({ key: k, ...summarize(rs) }))
    .sort((a, b) => b.winRate - a.winRate);
}

function bar(label, s) {
  return `  ${String(label).padEnd(12)} 応募${String(s.n).padStart(3)} / 確定${String(s.decided).padStart(3)} / 受注${String(s.won).padStart(3)} / 受注率${String(s.winRate).padStart(3)}% / 平均単価${yen(s.avgPrice).padStart(10)} / 利益率${Math.round(s.avgProfit)}%`;
}

// ── 改善提案（売上を上げる方向にルールベースで生成）────────
function suggestions(rows, all) {
  const out = [];
  const types = byKey(rows, 'type').filter(t => t.decided >= 1);
  // ① 応募あたり期待利益（受注率×平均単価×利益率）が高いタイプに応募を寄せる
  const ranked = types.filter(t => t.won > 0)
    .map(t => ({ ...t, ev: (t.winRate / 100) * (t.avgPrice || 0) * ((t.avgProfit || 0) / 100) }))
    .sort((a, b) => b.ev - a.ev);
  if (ranked.length) {
    out.push(`【単価↑】応募あたり期待利益が最大のタイプは「${ranked[0].key}」（${yen(ranked[0].ev)}/応募＝受注率${ranked[0].winRate}%×単価${yen(ranked[0].avgPrice)}×利益率${Math.round(ranked[0].avgProfit)}%）。応募リソースをここに寄せる。`);
  }
  // ② テンプレ別 受注率が全体平均-10pt以下 → 02を見直し
  const overall = all.winRate;
  byKey(rows, 'template').filter(t => t.decided >= 3 && t.winRate <= overall - 10)
    .forEach(t => out.push(`【受注率↑】テンプレ${t.key} の受注率${t.winRate}%が全体${overall}%を大きく下回る → 02-提案文テンプレート.md の${t.key}をリライト。`));
  // ③ キャリブレーション：予測と実績の乖離 → 01の配点/閾値を調整
  for (const band of ['S', 'A', 'B']) {
    const rs = rows.filter(r => r.priority === band && DECIDED.has(r.outcome));
    if (rs.length >= 3) {
      const predicted = avg(rs.map(r => r.pred_win_rate || 0));
      const actual = pct(rs.filter(isWon).length, rs.length);
      if (Math.abs(predicted - actual) >= 15) {
        out.push(`【精度↑】優先度${band}：予測${Math.round(predicted)}% vs 実績${actual}%（乖離${Math.round(Math.abs(predicted - actual))}pt） → 01の配点/閾値を再調整。`);
      }
    }
  }
  // ④ 保守アタッチ率
  const won = rows.filter(isWon);
  if (won.length >= 2) {
    const attach = pct(won.filter(r => (r.maintenance || 0) > 0).length, won.length);
    if (attach < 50) out.push(`【MRR↑】保守の付帯率${attach}% → 全受注で保守プランを必ず提案（継続収益が月商安定の鍵）。`);
  }
  // ⑤ 利益率が目標未満
  if (all.won > 0 && all.avgProfit < 50) {
    out.push(`【利益率↑】平均利益率${Math.round(all.avgProfit)}%が目標50%未満 → 低工数・テンプレ流用案件の比率を上げる（01の②を重視）。`);
  }
  return out.length ? out : ['データ蓄積中。10応募を超えたら傾向が安定し、具体的な改善提案が出ます。'];
}

// ── 出力 ───────────────────────────────────────
function main() {
  const rows = load();
  const sep = '─'.repeat(64);
  console.log('\n' + sep);
  console.log(` 営業 学習レポート   ${new Date().toISOString().slice(0, 10)}${includeExamples ? '   [見本込み --all]' : ''}`);
  console.log(sep);

  if (!rows.length) {
    console.log(' まだ実データがありません。案件に応募したら 応募ログ.jsonl に追記してください。');
    console.log(' （書式確認は `node 集計.js --all`）\n');
    return;
  }

  const all = summarize(rows);
  console.log('■ 全体KPI');
  console.log(`  応募 ${all.n} / 結果確定 ${all.decided} / 受注 ${all.won}（受注率 ${all.winRate}%）`);
  console.log(`  売上 ${yen(all.revenue)} ／ 手取り ${yen(all.net)} ／ 平均単価 ${yen(all.avgPrice)}`);
  console.log(`  平均利益率 ${Math.round(all.avgProfit)}% ／ 平均工数 ${all.avgHours.toFixed(1)}h ／ 実効時給 ${yen(all.effWage)}`);
  console.log(`  継続収益(MRR) ${yen(all.mrr)}/月（年換算 ${yen(all.mrr * 12)}）`);

  console.log('\n■ タイプ別（受注率順）');
  byKey(rows, 'type').forEach(s => console.log(bar(s.key, s)));
  console.log('\n■ 媒体別');
  byKey(rows, 'channel').forEach(s => console.log(bar(s.key, s)));
  console.log('\n■ テンプレ別');
  byKey(rows, 'template').forEach(s => console.log(bar('テンプレ' + s.key, s)));

  console.log('\n■ 予測 vs 実績（優先度バンド・キャリブレーション）');
  for (const band of ['S', 'A', 'B', 'skip']) {
    const rs = rows.filter(r => r.priority === band && DECIDED.has(r.outcome));
    if (!rs.length) continue;
    const predicted = Math.round(avg(rs.map(r => r.pred_win_rate || 0)));
    const actual = pct(rs.filter(isWon).length, rs.length);
    const gap = actual - predicted;
    console.log(`  ${band.padEnd(5)} 予測 ${String(predicted).padStart(3)}% / 実績 ${String(actual).padStart(3)}% / 乖離 ${gap >= 0 ? '+' : ''}${gap}pt（n=${rs.length}）`);
  }

  console.log('\n■ 改善提案（売上↑の打ち手）');
  suggestions(rows, all).forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log(sep + '\n');
}

main();
