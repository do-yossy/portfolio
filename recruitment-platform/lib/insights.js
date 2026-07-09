'use strict';
// 掲載中求人の応募実績から「勝ちパターン」を学習する（新規求人の作成に反映するため）
//  - buildInsights: 職種別の応募状況／応募につながるタグ／応募者の傾向（年代・経験・前職）を集計
//  - summarize    : Claudeへ渡す・人が読むための要約テキストを生成
// データ源: job_metrics（閲覧/応募のスナップショット）＋ applicants（応募者属性）
const { db } = require('../db');

const parseTags = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const isLive = (s) => /公開中|掲載中/.test(s || '');

// 各求人の最新スナップショット＋求人本体
function latestJoined(company) {
  return db.prepare(`
    SELECT m.job_id, m.views, m.applies, m.status,
           j.job_type, j.salary, j.location, j.tags, j.title, j.company
    FROM job_metrics m
    JOIN jobs j ON j.id = m.job_id
    WHERE m.company = ? AND m.job_id IS NOT NULL
      AND m.collected_at = (SELECT MAX(collected_at) FROM job_metrics m2 WHERE m2.job_id = m.job_id)
  `).all(company);
}

// ── 応募実績の集計 ────────────────────────────────────────────
function buildInsights(company) {
  const rows = latestJoined(company).filter(r => isLive(r.status));
  const totalJobs = rows.length;
  const totalViews = rows.reduce((s, r) => s + (r.views || 0), 0);
  const totalApplies = rows.reduce((s, r) => s + (r.applies || 0), 0);

  // 職種別（応募が多い順）
  const byType = new Map();
  for (const r of rows) {
    const k = r.job_type || '(不明)';
    const g = byType.get(k) || { jobs: 0, views: 0, applies: 0, applyJobs: 0 };
    g.jobs++; g.views += r.views || 0; g.applies += r.applies || 0;
    if ((r.applies || 0) > 0) g.applyJobs++;
    byType.set(k, g);
  }
  const jobTypeStats = [...byType.entries()].map(([job_type, g]) => ({
    job_type, ...g,
    applyRate: g.jobs ? +(g.applyJobs / g.jobs).toFixed(3) : 0,
    cvr: g.views ? +(g.applies / g.views).toFixed(4) : 0,
  })).sort((a, b) => b.applies - a.applies || b.cvr - a.cvr);

  // タグのリフト（応募あり群 vs 応募なし群での出現率差）
  const withApply = rows.filter(r => (r.applies || 0) > 0);
  const noApply = rows.filter(r => (r.applies || 0) === 0);
  const tagCount = (set) => {
    const m = new Map();
    for (const r of set) for (const t of parseTags(r.tags)) m.set(t, (m.get(t) || 0) + 1);
    return m;
  };
  const wc = tagCount(withApply), nc = tagCount(noApply);
  const tagLift = [...new Set([...wc.keys(), ...nc.keys()])].map(t => {
    const wr = withApply.length ? (wc.get(t) || 0) / withApply.length : 0;
    const nr = noApply.length ? (nc.get(t) || 0) / noApply.length : 0;
    return { tag: t, withRate: +wr.toFixed(3), noRate: +nr.toFixed(3), lift: +(wr - nr).toFixed(3), withApplyJobs: wc.get(t) || 0 };
  }).filter(x => x.withApplyJobs > 0).sort((a, b) => b.lift - a.lift);

  // 応募者プロフィール（重複除く）
  const appRows = db.prepare(`
    SELECT age, experience, current_job, job_title, work_location
    FROM applicants WHERE company = ? AND is_duplicate = 0
  `).all(company);
  const ageBands = { '〜29': 0, '30〜39': 0, '40〜49': 0, '50〜59': 0, '60〜': 0, '不明': 0 };
  for (const a of appRows) {
    const n = parseInt(a.age, 10);
    if (!Number.isFinite(n) || n <= 0) ageBands['不明']++;
    else if (n < 30) ageBands['〜29']++;
    else if (n < 40) ageBands['30〜39']++;
    else if (n < 50) ageBands['40〜49']++;
    else if (n < 60) ageBands['50〜59']++;
    else ageBands['60〜']++;
  }
  const tally = (field) => {
    const m = new Map();
    for (const a of appRows) { const v = (a[field] || '').trim(); if (v) m.set(v, (m.get(v) || 0) + 1); }
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
  };

  return {
    company, totalJobs, totalViews, totalApplies, applicants: appRows.length,
    jobTypeStats, tagLift: tagLift.slice(0, 20), ageBands,
    topAppliedTitles: tally('job_title'),
    topExperience: tally('experience'),
    topCurrentJob: tally('current_job'),
    hasSignal: totalApplies > 0 || appRows.length > 0,
  };
}

// ── Claude／人が読むための要約 ─────────────────────────────────
function summarize(ins) {
  const L = [];
  L.push(`# 掲載実績サマリー（${ins.company}）`);
  L.push(`求人${ins.totalJobs}件・累計閲覧${ins.totalViews}・累計応募${ins.totalApplies}・応募者${ins.applicants}名`);

  if (ins.jobTypeStats.length) {
    L.push('\n## 職種別の応募状況（応募が多い順）');
    for (const t of ins.jobTypeStats.slice(0, 10)) {
      L.push(`- ${t.job_type}: 応募${t.applies}（応募あり求人 ${t.applyJobs}/${t.jobs}件・閲覧${t.views}・CVR ${(t.cvr * 100).toFixed(2)}%）`);
    }
  }

  const winning = ins.tagLift.filter(x => x.lift > 0).slice(0, 10);
  if (winning.length) {
    L.push('\n## 応募につながっているタグ/キーワード（応募あり求人に多い）');
    for (const t of winning) L.push(`- ${t.tag}（応募あり群 ${(t.withRate * 100).toFixed(0)}% vs なし群 ${(t.noRate * 100).toFixed(0)}%）`);
  }
  const losing = ins.tagLift.filter(x => x.lift < 0).slice(-6).reverse();
  if (losing.length) {
    L.push('\n## 応募が少ない群に多いタグ（過度に頼らない）');
    for (const t of losing) L.push(`- ${t.tag}`);
  }

  L.push('\n## 応募者の傾向');
  L.push('年代: ' + Object.entries(ins.ageBands).filter(([, c]) => c > 0).map(([k, c]) => `${k}:${c}`).join(' / '));
  if (ins.topExperience.length) L.push('経験: ' + ins.topExperience.map(x => `${x.value}(${x.count})`).join(', '));
  if (ins.topCurrentJob.length) L.push('前職: ' + ins.topCurrentJob.map(x => `${x.value}(${x.count})`).join(', '));
  if (ins.topAppliedTitles.length) {
    L.push('\n## 応募が来ている求人タイトル（傾向の参考）');
    for (const t of ins.topAppliedTitles) L.push(`- ${t.value}（${t.count}件）`);
  }
  return L.join('\n');
}

module.exports = { buildInsights, summarize, latestJoined };
