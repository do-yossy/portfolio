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

  const topApplies = [...live].sort((a, b) => (b.applies - a.applies) || (b.views - a.views)).slice(0, 8);
  const topViews = [...live].sort((a, b) => (b.views - a.views)).slice(0, 8);

  // 職種別
  const byType = new Map();
  for (const r of live) {
    const k = r.job_type || '(不明)';
    const g = byType.get(k) || { jobs: 0, views: 0, applies: 0 };
    g.jobs++; g.views += r.views || 0; g.applies += r.applies || 0;
    byType.set(k, g);
  }
  const jobTypeStats = [...byType.entries()].map(([job_type, g]) => ({ job_type, ...g }))
    .sort((a, b) => b.applies - a.applies || b.views - a.views).slice(0, 8);

  return { period, company: company || 'all', posted, created, optimized,
    liveCount: live.length, totalViews, totalApplies, cvr,
    topApplies, topViews, jobTypeStats };
}

// HTMLレポート生成
function renderHtml(a) {
  const NAVY = '#0F2A43', TEAL = '#17A398', LIGHT = '#F2F5F8', LINE = '#D5DCE3', GRAY = '#5A6B7B', DGRAY = '#33414E';
  const coLabel = a.company === 'all' ? '全アカウント' : coName(a.company);
  const tile = (label, val, unit = '') =>
    `<div style="flex:1;background:#fff;border:1px solid ${LINE};border-radius:10px;padding:14px 10px;text-align:center">
      <div style="color:${GRAY};font-size:12px">${esc(label)}</div>
      <div style="color:${NAVY};font-size:28px;font-weight:800">${esc(val)}<span style="font-size:13px;color:${GRAY}">${esc(unit)}</span></div></div>`;
  const rows = (list) => list.length
    ? list.map((r, i) => `<tr style="background:${i % 2 ? LIGHT : '#fff'}">
        <td style="padding:7px 8px;border:1px solid ${LINE}">${esc((r.title || '').slice(0, 44))}</td>
        <td style="padding:7px 8px;border:1px solid ${LINE};text-align:center">${r.views || 0}</td>
        <td style="padding:7px 8px;border:1px solid ${LINE};text-align:center;color:${TEAL};font-weight:700">${r.applies || 0}</td></tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:${GRAY}">データがありません（成績取得後に反映されます）</td></tr>`;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>月次レポート ${esc(a.period)} ${esc(coLabel)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Meiryo','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;color:${DGRAY};background:#fff;padding:24px;max-width:900px;margin:0 auto}
h1{font-size:22px;color:#fff}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}th{background:${NAVY};color:#fff;padding:8px;border:1px solid ${LINE}}
.hd{background:${NAVY};border-radius:8px;padding:16px 20px;position:relative;overflow:hidden}.hd:before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;background:${TEAL}}
h2{font-size:14px;color:${NAVY};border-left:4px solid ${TEAL};padding-left:8px;margin:20px 0 4px}@media print{body{padding:0}}</style></head><body>
<div class="hd"><h1>求人ボックス 月次レポート</h1><div style="color:#B9C6D3;font-size:13px;margin-top:4px">対象期間：${esc(a.period)}　／　${esc(coLabel)}</div></div>
<div style="display:flex;gap:10px;margin-top:16px">
  ${tile('掲載した求人', a.posted, '件')}${tile('公開中', a.liveCount, '件')}${tile('累計閲覧', a.totalViews, '')}${tile('累計応募', a.totalApplies, '件')}${tile('AI改善', a.optimized, '回')}
</div>
<div style="display:flex;gap:10px;margin-top:10px">
  ${tile('応募率(CVR)', a.cvr, '%')}${tile('新規作成', a.created, '件')}
</div>
<h2>応募が多い求人 TOP</h2>
<table><tr><th>求人タイトル</th><th style="width:80px">閲覧</th><th style="width:80px">応募</th></tr>${rows(a.topApplies)}</table>
<h2>閲覧が多い求人 TOP</h2>
<table><tr><th>求人タイトル</th><th style="width:80px">閲覧</th><th style="width:80px">応募</th></tr>${rows(a.topViews)}</table>
<h2>職種別サマリー</h2>
<table><tr><th>職種</th><th style="width:90px">求人数</th><th style="width:90px">閲覧</th><th style="width:90px">応募</th></tr>
${a.jobTypeStats.length ? a.jobTypeStats.map((t, i) => `<tr style="background:${i % 2 ? LIGHT : '#fff'}"><td style="padding:7px 8px;border:1px solid ${LINE}">${esc(t.job_type)}</td><td style="padding:7px 8px;border:1px solid ${LINE};text-align:center">${t.jobs}</td><td style="padding:7px 8px;border:1px solid ${LINE};text-align:center">${t.views}</td><td style="padding:7px 8px;border:1px solid ${LINE};text-align:center;color:${TEAL};font-weight:700">${t.applies}</td></tr>`).join('') : `<tr><td colspan="4" style="padding:12px;text-align:center;color:${GRAY}">データがありません</td></tr>`}</table>
<p style="color:${GRAY};font-size:11px;margin-top:18px">生成日時：${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC</p>
</body></html>`;
}

// 生成してDBへ保存し {period, company, summary, html, id} を返す
function generate(period, company = 'all') {
  const a = aggregate(period, company);
  const html = renderHtml(a);
  const summary = { posted: a.posted, created: a.created, optimized: a.optimized,
    liveCount: a.liveCount, totalViews: a.totalViews, totalApplies: a.totalApplies, cvr: a.cvr };
  const id = Reports.upsert(period, company, html, summary);
  return { id, period, company, summary, html };
}

module.exports = { generate, aggregate, renderHtml, prevMonth, thisMonth };
