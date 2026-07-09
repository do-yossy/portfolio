'use strict';
const $ = (id) => document.getElementById(id);
const api = async (url, opts) => (await fetch(url, opts)).json();

let COMPANIES = [];

async function loadStats() {
  const s = await api('/api/stats');
  const t = [
    ['総求人', s.total], ['公開中', s.published], ['求人ボックス', s.kyujinbox], ['投稿済み', s.posted],
  ].map(([l, n]) => `<div class="tile"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  const co = Object.entries(s.perCompany).filter(([, v]) => v.total > 0 || v.configured)
    .map(([id, v]) => `<div class="tile"><div class="n">${v.posted}/${v.published}</div><div class="l">${v.name.slice(0, 10)} ${v.configured ? '<span class="badge ok">認証OK</span>' : '<span class="badge no">未設定</span>'}</div></div>`).join('');
  $('stats').innerHTML = t + co;
}

async function loadCompanies() {
  const s = await api('/api/stats');
  COMPANIES = Object.entries(s.perCompany).map(([id, v]) => ({ id, name: v.name, configured: v.configured }));
  const opts = COMPANIES.map(c => `<option value="${c.id}">${c.name}${c.configured ? '' : '（未設定）'}</option>`).join('');
  $('company').innerHTML = '<option value="all">すべて（認証済み全社）</option>' + opts;
  $('repCompany').innerHTML = '<option value="all">すべて</option>' + opts;
  $('jobCompany').innerHTML = '<option value="">すべて</option>' + opts;
  $('impCompany').innerHTML = opts;
  $('b_company').innerHTML = opts;
}

async function generateFromBase() {
  const btn = $('b_btn'), log = $('b_log'); log.innerHTML = '';
  const base = {
    title: $('b_title').value, jobType: $('b_jobtype').value, salary: $('b_salary').value,
    employmentType: $('b_emp').value, tags: $('b_tags').value, catchcopy: $('b_catch').value,
    description: $('b_desc').value, qualifications: $('b_qual').value, benefit: $('b_benefit').value,
    worktimeHoliday: $('b_worktime').value, transportation: $('b_transport').value,
    rewarding: $('b_rewarding').value, howToApply: $('b_apply').value,
  };
  if (!base.title.trim()) { appendLog(log, [{ message: 'タイトルを入力してください', type: 'warn' }]); return; }
  if (!$('b_locations').value.trim()) { appendLog(log, [{ message: '勤務地リストを入力してください（1行に1件）', type: 'warn' }]); return; }
  btn.disabled = true;
  try {
    const r = await api('/api/generate-from-base', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base, locations: $('b_locations').value, company: $('b_company').value, jobKind: $('b_kind').value, publish: true }),
    });
    if (r.error) { appendLog(log, [{ message: r.error, type: 'warn' }]); btn.disabled = false; return; }
    appendLog(log, [{ message: `✅ ${r.created}件を作成しました（公開状態）。求人一覧で確認し、投稿してください。`, type: 'success' }]);
    (r.titles || []).forEach(t => appendLog(log, [{ message: '　・' + t.slice(0, 50), type: 'info' }]));
    loadStats(); loadJobs();
  } catch (e) { appendLog(log, [{ message: 'エラー: ' + e.message, type: 'error' }]); }
  finally { btn.disabled = false; }
}

async function importZip() {
  const btn = $('impBtn'), log = $('impLog'); log.innerHTML = '';
  const file = $('zipFile').files[0];
  if (!file) { appendLog(log, [{ message: 'ZIPファイルを選択してください', type: 'warn' }]); return; }
  btn.disabled = true;
  try {
    const qs = `company=${encodeURIComponent($('impCompany').value)}&kind=${$('impKind').value}&publish=1`;
    const r = await api('/api/import?' + qs, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
    if (r.error) { appendLog(log, [{ message: r.error, type: 'warn' }]); btn.disabled = false; return; }
    const poll = setInterval(async () => {
      const s = await api('/api/session/' + r.sessionId);
      appendLog(log, s.logs || []);
      if (s.done) { clearInterval(poll); btn.disabled = false; loadStats(); loadJobs(); }
    }, 900);
  } catch (e) { appendLog(log, [{ message: 'エラー: ' + e.message, type: 'error' }]); btn.disabled = false; }
}

function appendLog(el, entries) {
  for (const e of entries) {
    const span = document.createElement('div');
    span.className = e.type || 'info';
    span.textContent = e.message;
    el.appendChild(span);
  }
  el.scrollTop = el.scrollHeight;
}

async function post(force) {
  const btnP = $('postBtn'), btnF = $('forceBtn');
  btnP.disabled = btnF.disabled = true;
  const log = $('log'); log.innerHTML = '';
  try {
    const r = await api('/api/post/kyujinbox', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: $('company').value, limit: $('limit').value, forceRepost: !!force }),
    });
    if (r.error) { appendLog(log, [{ message: r.error, type: 'warn' }]); btnP.disabled = btnF.disabled = false; return; }
    const sid = r.sessionId;
    const poll = setInterval(async () => {
      const s = await api('/api/session/' + sid);
      appendLog(log, s.logs || []);
      if (s.done) { clearInterval(poll); btnP.disabled = btnF.disabled = false; loadStats(); loadJobs(); }
    }, 900);
  } catch (e) { appendLog(log, [{ message: 'エラー: ' + e.message, type: 'error' }]); btnP.disabled = btnF.disabled = false; }
}

async function loadReports() {
  const { reports } = await api('/api/reports');
  if (!reports.length) { $('reports').innerHTML = '<div class="muted">まだレポートがありません。「今すぐ生成」で作成できます。</div>'; return; }
  $('reports').innerHTML = reports.map(r => {
    let s = {}; try { s = JSON.parse(r.summary || '{}'); } catch {}
    const coName = r.company === 'all' ? '全社' : (COMPANIES.find(c => c.id === r.company) || {}).name || r.company;
    return `<div class="repRow"><span><b>${r.period}</b> ／ ${coName}　<span class="muted">掲載${s.posted ?? '-'}・応募${s.totalApplies ?? '-'}・改善${s.optimized ?? '-'}</span></span>
      <a href="/report/${r.period}/${r.company}" target="_blank">レポートを開く ↗</a></div>`;
  }).join('');
}

async function genReport() {
  const btn = $('genBtn'); btn.disabled = true; const old = btn.textContent; btn.textContent = '生成中...';
  try {
    const period = $('period').value || undefined;
    await api('/api/report/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period, company: $('repCompany').value }) });
    await loadReports();
  } finally { btn.disabled = false; btn.textContent = old; }
}

async function loadJobs() {
  const co = $('jobCompany').value;
  const { jobs } = await api('/api/jobs' + (co ? '?company=' + co : ''));
  if (!jobs.length) { $('jobs').innerHTML = '<div class="muted">求人がありません。seedを実行して投入してください。</div>'; return; }
  const rows = jobs.slice(0, 100).map(j => `<tr>
    <td>${(j.title || '').slice(0, 40)}</td><td>${j.location || ''}</td>
    <td>${(COMPANIES.find(c => c.id === j.company) || {}).name?.slice(0, 8) || j.company}</td>
    <td>${j.is_published ? '公開' : '下書き'}</td>
    <td>${j.kyujinbox_posted_at ? '<span class="badge ok">投稿済</span>' : '<span class="badge no">未投稿</span>'}</td>
    <td>${j.optimize_count || 0}</td></tr>`).join('');
  $('jobs').innerHTML = `<table><tr><th>タイトル</th><th>勤務地</th><th>会社</th><th>状態</th><th>投稿</th><th>改善</th></tr>${rows}</table>`;
}

$('postBtn').onclick = () => post(false);
$('forceBtn').onclick = () => { if (confirm('投稿済みも含めて再投稿します。よろしいですか？')) post(true); };
$('genBtn').onclick = genReport;
$('impBtn').onclick = importZip;
$('b_btn').onclick = generateFromBase;
$('jobCompany').onchange = loadJobs;

(async function init() {
  await loadCompanies();
  await Promise.all([loadStats(), loadReports(), loadJobs()]);
})();
