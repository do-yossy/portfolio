'use strict';
// 月次レポート生成（求人ボックス専用）
// 期間(YYYY-MM)・会社ごとに、掲載数・閲覧・応募・AI改善回数・トップ求人を集計しHTMLを生成する。
const { db, Reports, COMPANIES } = require('../db');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const coName = (id) => (COMPANIES.find(c => c.id === id) || {}).name || id;

// 前月の 'YYYY-MM' を返す（基準日は引数、無ければ今日）
function prevMonth(baseIso) {
  const d = baseIso ? new Date(baseIso) : new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
function thisMonth(baseIso) {
  const d = baseIso ? new Date(baseIso) : new Date();
  return d.toISOString().slice(0, 7);
}
// 'YYYY-MM' の前月 'YYYY-MM'
function prevPeriod(period) {
  const [y, m] = String(period).split('-').map(Number);
  const d = new Date(Date.UTC(y || 2000, (m || 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
// 日本時間の発行日（例: 2026年7月1日）
function jstDateStr() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
// 期間ラベル（例: 2026年6月）
function periodLabel(period) {
  const [y, m] = String(period).split('-');
  return `${y}年${Number(m)}月`;
}
// 自動生成の総評コメント（数値ベース・決定的）
function summaryComment(a, prev) {
  const nf = (n) => Number(n || 0).toLocaleString('en-US');
  const parts = [];
  parts.push(`${periodLabel(a.period)}は求人ボックスへ${a.posted}件を掲載し、公開中${a.liveCount}件から累計${nf(a.totalViews)}回の閲覧・${a.totalApplies}件のご応募を獲得しました（応募率${a.cvr}%）。`);
  if (a.optimized > 0) parts.push(`応募状況を踏まえたAIによる求人内容の改善を${a.optimized}回実施しています。`);
  if (a.jobTypeStats && a.jobTypeStats.length && a.jobTypeStats[0].applies > 0)
    parts.push(`職種別では「${a.jobTypeStats[0].job_type}」が応募${a.jobTypeStats[0].applies}件で最も好調でした。`);
  if (prev && (prev.totalApplies || prev.totalViews || prev.posted)) {
    const dA = a.totalApplies - prev.totalApplies;
    const trend = dA > 0 ? `${dA}件増加` : dA < 0 ? `${Math.abs(dA)}件減少` : '横ばい';
    parts.push(`前月（${periodLabel(prev.period)}）比では、応募数が${trend}しました。`);
  }
  return parts.join('');
}

// 期間・会社の集計
function aggregate(period, company) {
  const hasCo = !!(company && company !== 'all');
  const coFilter = hasCo ? ` AND company = @co` : '';
  const p = hasCo ? { period, co: company } : { period };

  const one = (sql) => db.prepare(sql).get(p) || {};
  const posted = one(`SELECT COUNT(*) c FROM jobs WHERE substr(kyujinbox_posted_at,1,7)=@period${coFilter}`).c || 0;
  const created = one(`SELECT COUNT(*) c FROM jobs WHERE substr(created_at,1,7)=@period${coFilter}`).c || 0;
  const optimized = one(`SELECT COUNT(*) c FROM jobs WHERE last_optimized_at!='' AND substr(last_optimized_at,1,7)=@period${coFilter}`).c || 0;

  // 月末時点の最新スナップショット（その求人の最新の成績）
  const metCoFilter = (company && company !== 'all') ? ` AND m.company=@co` : '';
  const latest = db.prepare(`
    SELECT m.job_id, m.title, m.location, m.status, m.views, m.applies, j.company, j.job_type
    FROM job_metrics m
    JOIN jobs j ON j.id = m.job_id
    WHERE m.job_id IS NOT NULL AND substr(m.collected_at,1,7) <= @period ${metCoFilter}
      AND m.collected_at = (SELECT MAX(collected_at) FROM job_metrics m2
                            WHERE m2.job_id=m.job_id AND substr(m2.collected_at,1,7) <= @period)
  `).all(p);

  const live = latest.filter(r => /公開中|掲載中/.test(r.status || ''));
  const totalViews = live.reduce((s, r) => s + (r.views || 0), 0);
  const totalApplies = live.reduce((s, r) => s + (r.applies || 0), 0);
  const cvr = totalViews ? +(totalApplies / totalViews * 100).toFixed(2) : 0;

  const topApplies = [...live].sort((a, b) => (b.applies - a.applies) || (b.views - a.views)).slice(0, 15);
  const topViews = [...live].sort((a, b) => (b.views - a.views)).slice(0, 10);

  // 職種別（どの職種の求人を何件出して何件応募が来たか）
  const byType = new Map();
  for (const r of live) {
    const k = r.job_type || '(不明)';
    const g = byType.get(k) || { jobs: 0, views: 0, applies: 0 };
    g.jobs++; g.views += r.views || 0; g.applies += r.applies || 0;
    byType.set(k, g);
  }
  const jobTypeStats = [...byType.entries()].map(([job_type, g]) => ({ job_type, ...g }))
    .sort((a, b) => b.applies - a.applies || b.views - a.views).slice(0, 20);

  // エリア別（都道府県で集計：どのエリアの求人を何件出して何件応募が来たか）
  const prefOf = (loc) => { const m = String(loc || '').match(/^(.+?[都道府県])/); return m ? m[1] : (loc || '(不明)'); };
  const byArea = new Map();
  for (const r of live) {
    const k = prefOf(r.location);
    const g = byArea.get(k) || { jobs: 0, views: 0, applies: 0 };
    g.jobs++; g.views += r.views || 0; g.applies += r.applies || 0;
    byArea.set(k, g);
  }
  const areaStats = [...byArea.entries()].map(([area, g]) => ({ area, ...g }))
    .sort((a, b) => b.applies - a.applies || b.views - a.views).slice(0, 20);

  return { period, company: company || 'all', posted, created, optimized,
    liveCount: live.length, totalViews, totalApplies, cvr,
    topApplies, topViews, jobTypeStats, areaStats };
}

// HTMLレポート生成
function renderHtml(a, prev) {
  const NAVY = '#0F2A43', TEAL = '#17A398', LIGHT = '#F2F5F8', LINE = '#D5DCE3', GRAY = '#5A6B7B', DGRAY = '#33414E';
  const coLabel = a.company === 'all' ? '全アカウント' : coName(a.company);
  const provider = (process.env.REPORT_PROVIDER || '株式会社SocialQuality').trim();
  // 宛先（提出先の人材会社）: REPORT_CLIENT_<CO> で明示指定可。
  //   未指定でも、アカウントの会社名が提供元と異なれば「◯◯ 御中」を表示（自分宛は出さない）。
  const clientEnv = a.company && a.company !== 'all'
    ? (process.env[`REPORT_CLIENT_${String(a.company).toUpperCase()}`] || '').trim() : '';
  let addressee = '';
  if (clientEnv) addressee = `${clientEnv}　御中`;
  else if (a.company !== 'all' && coName(a.company) !== provider) addressee = `${coName(a.company)}　御中`;
  // 前月比の差分表示
  const delta = (cur, prev0, unit = '') => {
    if (!prev || prev0 == null) return '';
    const d = +(Number(cur) - Number(prev0)).toFixed(2);
    if (d === 0) return `<span style="color:${GRAY};font-size:11px">前月比 ±0${unit}</span>`;
    const col = d > 0 ? TEAL : '#C0392B';
    return `<span style="color:${col};font-size:11px">前月比 ${d > 0 ? '+' : ''}${d}${unit}</span>`;
  };
  const tile = (label, val, unit = '', deltaHtml = '') =>
    `<div style="flex:1;background:#fff;border:1px solid ${LINE};border-radius:10px;padding:14px 10px;text-align:center">
      <div style="color:${GRAY};font-size:12px">${esc(label)}</div>
      <div style="color:${NAVY};font-size:28px;font-weight:800">${esc(val)}<span style="font-size:13px;color:${GRAY}">${esc(unit)}</span></div>
      ${deltaHtml ? `<div style="margin-top:2px">${deltaHtml}</div>` : ''}</div>`;
  const rows = (list) => list.length
    ? list.map((r, i) => `<tr style="background:${i % 2 ? LIGHT : '#fff'}">
        <td style="padding:7px 8px;border:1px solid ${LINE}">${esc((r.title || '').slice(0, 44))}</td>
        <td style="padding:7px 8px;border:1px solid ${LINE};text-align:center">${r.views || 0}</td>
        <td style="padding:7px 8px;border:1px solid ${LINE};text-align:center;color:${TEAL};font-weight:700">${r.applies || 0}</td></tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:${GRAY}">データがありません（成績取得後に反映されます）</td></tr>`;
  // 掲載数×閲覧×応募のサマリー表（職種別・エリア別で共用）
  const sumTable = (list, keyName) => `<table><tr><th>${keyName}</th><th style="width:90px">掲載求人数</th><th style="width:90px">閲覧</th><th style="width:90px">応募</th></tr>${
    list && list.length ? list.map((t, i) => `<tr style="background:${i % 2 ? LIGHT : '#fff'}">
      <td style="padding:7px 8px;border:1px solid ${LINE}">${esc(t.label)}</td>
      <td style="padding:7px 8px;border:1px solid ${LINE};text-align:center">${t.jobs}</td>
      <td style="padding:7px 8px;border:1px solid ${LINE};text-align:center">${t.views}</td>
      <td style="padding:7px 8px;border:1px solid ${LINE};text-align:center;color:${TEAL};font-weight:700">${t.applies}</td></tr>`).join('')
    : `<tr><td colspan="4" style="padding:12px;text-align:center;color:${GRAY}">データがありません</td></tr>`}</table>`;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>月次レポート ${esc(a.period)} ${esc(coLabel)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Meiryo','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;color:${DGRAY};background:#fff;padding:24px;max-width:900px;margin:0 auto}
h1{font-size:22px;color:#fff}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}th{background:${NAVY};color:#fff;padding:8px;border:1px solid ${LINE}}
.hd{background:${NAVY};border-radius:8px;padding:16px 20px;position:relative;overflow:hidden}.hd:before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;background:${TEAL}}
h2{font-size:14px;color:${NAVY};border-left:4px solid ${TEAL};padding-left:8px;margin:20px 0 4px}@media print{body{padding:0}}
.mt{margin-top:16px}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">
  <div style="font-size:16px;font-weight:700;color:${NAVY}">${esc(addressee)}</div>
  <div style="text-align:right;font-size:12px;color:${GRAY};line-height:1.6">発行日：${esc(jstDateStr())}<br>作成：${esc(provider)}</div>
</div>
<div class="hd"><h1>求人ボックス 月次運用レポート</h1><div style="color:#B9C6D3;font-size:13px;margin-top:4px">対象期間：${esc(periodLabel(a.period))}　／　${esc(coLabel)}</div></div>
<div style="background:${LIGHT};border:1px solid ${LINE};border-left:4px solid ${TEAL};border-radius:8px;padding:12px 14px;margin-top:14px;font-size:13px;line-height:1.8;color:${DGRAY}">
  <div style="font-weight:700;color:${NAVY};margin-bottom:2px">■ 今月の総評</div>
  ${esc(summaryComment(a, prev))}
</div>
<div style="display:flex;gap:10px;margin-top:16px">
  ${tile('掲載した求人', a.posted, '件', delta(a.posted, prev && prev.posted, '件'))}${tile('公開中', a.liveCount, '件')}${tile('累計閲覧', a.totalViews, '', delta(a.totalViews, prev && prev.totalViews))}${tile('累計応募', a.totalApplies, '件', delta(a.totalApplies, prev && prev.totalApplies, '件'))}${tile('AI改善', a.optimized, '回')}
</div>
<div style="display:flex;gap:10px;margin-top:10px">
  ${tile('応募率(CVR)', a.cvr, '%', delta(a.cvr, prev && prev.cvr, '%'))}${tile('新規作成', a.created, '件')}
</div>
<h2>応募が多い求人 TOP</h2>
<table><tr><th>求人タイトル</th><th style="width:80px">閲覧</th><th style="width:80px">応募</th></tr>${rows(a.topApplies)}</table>
<h2>閲覧が多い求人 TOP</h2>
<table><tr><th>求人タイトル</th><th style="width:80px">閲覧</th><th style="width:80px">応募</th></tr>${rows(a.topViews)}</table>
<h2>職種別サマリー（どの職種を何件出して何件応募が来たか）</h2>
${sumTable((a.jobTypeStats || []).map(t => ({ label: t.job_type, jobs: t.jobs, views: t.views, applies: t.applies })), '職種')}
<h2>エリア別サマリー（都道府県別の掲載数・応募数）</h2>
${sumTable((a.areaStats || []).map(t => ({ label: t.area, jobs: t.jobs, views: t.views, applies: t.applies })), 'エリア（都道府県）')}
<div style="margin-top:22px;padding-top:10px;border-top:1px solid ${LINE};display:flex;justify-content:space-between;font-size:11px;color:${GRAY}">
  <span>本レポートは求人ボックスの運用実績をまとめたものです。</span>
  <span>作成：${esc(provider)}　／　発行日：${esc(jstDateStr())}</span>
</div>
</body></html>`;
}

// 生成してDBへ保存し {period, company, summary, html, id} を返す
function generate(period, company = 'all') {
  const a = aggregate(period, company);
  let prev = null;
  try { prev = aggregate(prevPeriod(period), company); } catch { prev = null; }
  const html = renderHtml(a, prev);
  const summary = { posted: a.posted, created: a.created, optimized: a.optimized,
    liveCount: a.liveCount, totalViews: a.totalViews, totalApplies: a.totalApplies, cvr: a.cvr };
  const id = Reports.upsert(period, company, html, summary);
  return { id, period, company, summary, html };
}

module.exports = { generate, aggregate, renderHtml, prevMonth, thisMonth };
