'use strict';
const $ = (id) => document.getElementById(id);
const api = async (url, opts) => (await fetch(url, opts)).json();

let COMPANIES = [];

async function loadStats() {
  const el = $('stats');
  if (!el) return; // 上部の集計タイルは非表示（要素が無ければ何もしない）
  const s = await api('/api/stats');
  const t = [
    ['総求人', s.total], ['公開中', s.published], ['求人ボックス', s.kyujinbox], ['投稿済み', s.posted],
  ].map(([l, n]) => `<div class="tile"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  const co = Object.entries(s.perCompany).filter(([, v]) => v.total > 0 || v.configured)
    .map(([id, v]) => `<div class="tile"><div class="n">${v.posted}/${v.published}</div><div class="l">${v.name.slice(0, 10)} ${v.configured ? '<span class="badge ok">認証OK</span>' : '<span class="badge no">未設定</span>'}</div></div>`).join('');
  el.innerHTML = t + co;
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

const LOCATION_PRESETS = {
  zenkoku47: ['北海道札幌市','青森県青森市','岩手県盛岡市','宮城県仙台市','秋田県秋田市','山形県山形市','福島県福島市','茨城県水戸市','栃木県宇都宮市','群馬県前橋市','埼玉県さいたま市','千葉県千葉市','東京都新宿区','神奈川県横浜市','新潟県新潟市','富山県富山市','石川県金沢市','福井県福井市','山梨県甲府市','長野県長野市','岐阜県岐阜市','静岡県静岡市','愛知県名古屋市','三重県津市','滋賀県大津市','京都府京都市','大阪府大阪市','兵庫県神戸市','奈良県奈良市','和歌山県和歌山市','鳥取県鳥取市','島根県松江市','岡山県岡山市','広島県広島市','山口県山口市','徳島県徳島市','香川県高松市','愛媛県松山市','高知県高知市','福岡県福岡市','佐賀県佐賀市','長崎県長崎市','熊本県熊本市','大分県大分市','宮崎県宮崎市','鹿児島県鹿児島市','沖縄県那覇市'],
  seireishi: ['北海道札幌市','宮城県仙台市','埼玉県さいたま市','千葉県千葉市','神奈川県横浜市','神奈川県川崎市','神奈川県相模原市','新潟県新潟市','静岡県静岡市','静岡県浜松市','愛知県名古屋市','京都府京都市','大阪府大阪市','大阪府堺市','兵庫県神戸市','岡山県岡山市','広島県広島市','福岡県北九州市','福岡県福岡市','熊本県熊本市'],
  osaka24: ['都島区','福島区','此花区','西区','港区','大正区','天王寺区','浪速区','西淀川区','淀川区','東淀川区','東成区','生野区','旭区','城東区','鶴見区','阿倍野区','住之江区','住吉区','東住吉区','平野区','西成区','北区','中央区'].map(k => '大阪府大阪市' + k),
  tokyo23: ['千代田区','中央区','港区','新宿区','文京区','台東区','墨田区','江東区','品川区','目黒区','大田区','世田谷区','渋谷区','中野区','杉並区','豊島区','北区','荒川区','板橋区','練馬区','足立区','葛飾区','江戸川区'].map(k => '東京都' + k),
};

function updateLocCount() {
  const n = ($('b_locations').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)).length;
  $('b_count').textContent = n + '件';
}
function insertPreset() {
  const key = $('b_preset').value;
  if (!key || !LOCATION_PRESETS[key]) return;
  const ta = $('b_locations');
  const cur = ta.value.trim();
  ta.value = (cur ? cur + '\n' : '') + LOCATION_PRESETS[key].join('\n');
  $('b_preset').value = '';
  updateLocCount();
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
      <span><a href="/report/${r.period}/${r.company}" target="_blank">レポートを開く ↗</a>
      <button class="ghost repDel" data-period="${r.period}" data-company="${r.company}" style="margin-left:8px;padding:3px 10px;font-size:12px">削除</button></span></div>`;
  }).join('');
  $('reports').querySelectorAll('.repDel').forEach(b => b.onclick = () => deleteReport(b.dataset.period, b.dataset.company));
}

async function deleteReport(period, company) {
  if (!confirm(`${period} のレポートを削除しますか？`)) return;
  await api('/api/report/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period, company }) });
  await loadReports();
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
$('refreshOldBtn').onclick = refreshOld;

async function refreshOld() {
  const btn = $('refreshOldBtn'); const log = $('log'); log.innerHTML = '';
  btn.disabled = true; const old = btn.textContent; btn.textContent = '修正中...';
  try {
    const r = await api('/api/refresh-old', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: $('company').value }) });
    if (r.error) { appendLog(log, [{ message: r.error, type: 'warn' }]); return; }
    if (!r.refreshed) { appendLog(log, [{ message: '✅ 修正が必要な古い求人はありませんでした。', type: 'success' }]); }
    else {
      appendLog(log, [{ message: `🔄 古い求人を ${r.refreshed}件修正しました（再掲載キューへ ${r.requeued}件）。「投稿する」で再掲載されます。`, type: 'success' }]);
      (r.titles || []).forEach(t => appendLog(log, [{ message: '　・' + t.slice(0, 50), type: 'info' }]));
    }
    loadStats(); loadJobs();
  } catch (e) { appendLog(log, [{ message: 'エラー: ' + e.message, type: 'error' }]); }
  finally { btn.disabled = false; btn.textContent = old; }
}
$('genBtn').onclick = genReport;
$('impBtn').onclick = importZip;
$('b_btn').onclick = generateFromBase;
$('b_presetBtn').onclick = insertPreset;
$('b_clearBtn').onclick = () => { $('b_locations').value = ''; updateLocCount(); };
$('b_locations').oninput = updateLocCount;
$('jobCompany').onchange = loadJobs;

(async function init() {
  await loadCompanies();
  await Promise.all([loadStats(), loadReports(), loadJobs()]);
})();
