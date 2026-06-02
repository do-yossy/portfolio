'use strict';

// ── Toast ──
function toast(msg, type = 'info') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Confirm Dialog ──
function confirmAction(msg, onOk) {
  const ov = document.getElementById('confirm-overlay');
  const msgEl = document.getElementById('confirm-message');
  if (!ov) { onOk(); return; }
  msgEl.textContent = msg;
  ov.classList.remove('hidden');
  const ok = document.getElementById('confirm-ok');
  const cancel = document.getElementById('confirm-cancel');
  function cleanup() { ov.classList.add('hidden'); ok.removeEventListener('click', yes); cancel.removeEventListener('click', no); }
  function yes() { cleanup(); onOk(); }
  function no()  { cleanup(); }
  ok.addEventListener('click', yes);
  cancel.addEventListener('click', no);
}

// ── VPN status ──
let vpnInterval = null;

async function refreshVpn() {
  const el = document.getElementById('vpn-badge');
  if (!el) return false;
  el.className = 'vpn-badge vpn-checking';
  el.innerHTML = '<span class="dot"></span> 確認中...';
  try {
    const r = await fetch('/api/vpn/status');
    const d = await r.json();
    if (d.connected) {
      el.className = 'vpn-badge vpn-connected';
      el.innerHTML = '<span class="dot"></span> VPN接続中';
      return true;
    } else {
      el.className = 'vpn-badge vpn-disconnected';
      el.innerHTML = '<span class="dot"></span> VPN未接続';
      return false;
    }
  } catch {
    el.className = 'vpn-badge vpn-disconnected';
    el.innerHTML = '<span class="dot"></span> 確認失敗';
    return false;
  }
}

// ── SSE Progress ──
function openProgress(boxId) {
  const wrap = document.getElementById(boxId + '-wrap');
  const box  = document.getElementById(boxId);
  if (wrap) wrap.classList.remove('hidden');
  if (box)  box.innerHTML = '';
  return box;
}

function appendLog(box, msg, type = 'info') {
  if (!box) return;
  const t = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${t}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function runSSE(url, boxId, btnId, onDone) {
  const box = openProgress(boxId);
  const btn = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.dataset.origText = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span> 実行中...'; }
  appendLog(box, '処理を開始しています...', 'info');

  const evs = new EventSource(url);
  evs.onmessage = e => {
    try {
      const d = JSON.parse(e.data);
      appendLog(box, d.message, d.type || 'info');
      if (d.done) {
        evs.close();
        if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.origText; }
        if (onDone) onDone(d);
      }
    } catch {}
  };
  evs.onerror = () => {
    evs.close();
    appendLog(box, '接続が切断されました', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.origText; }
    if (onDone) onDone({ success: false, message: '接続エラー' });
  };
  return evs;
}

// ── XML Download ──
async function downloadXML(type) {
  const btn = document.getElementById('btn-xml-' + type);
  const label = type === 'kyujinbox' ? '求人ボックス' : 'スタンバイ';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 生成中...'; }
  try {
    const r = await fetch('/api/feed/' + type);
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${new Date().toISOString().slice(0,10)}.xml`;
    a.click();
    toast(`${label}のXMLを生成しました`, 'success');
  } catch {
    toast('XML生成に失敗しました', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = `XMLフィードを生成する（${label}）`; }
  }
}

// ── CSV Export ──
async function exportCSV() {
  const btn = document.getElementById('btn-csv-export');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 出力中...'; }
  try {
    const r = await fetch('/api/export/csv');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ca-list-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast('CA対応リストをダウンロードしました', 'success');
  } catch {
    toast('CSV出力に失敗しました', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'CA対応リストをCSV出力する'; }
  }
}

// ── Indeed Scrape ──
function startScrapeIndeed() {
  confirmAction(
    'Indeedから応募者データを取得します。\nVPN接続を確認してから実行してください。\n実行しますか？',
    async () => {
      const vpnOk = await refreshVpn();
      if (!vpnOk) { toast('VPNに接続してから実行してください', 'error'); return; }
      runSSE('/api/scrape/indeed', 'progress-indeed', 'btn-scrape-indeed', d => {
        toast(d.message, d.success ? 'success' : 'error');
        if (d.success) setTimeout(() => location.reload(), 2000);
      });
    }
  );
}

// ── Kyujinbox Post ──
function startPostKyujinbox() {
  confirmAction(
    '求人ボックスに求人を投稿します。\nVPN接続を確認してから実行してください。\n実行しますか？',
    async () => {
      const vpnOk = await refreshVpn();
      if (!vpnOk) { toast('VPNに接続してから実行してください', 'error'); return; }
      runSSE('/api/post/kyujinbox', 'progress-kyujinbox', 'btn-post-kyujinbox', d => {
        toast(d.message, d.success ? 'success' : 'error');
      });
    }
  );
}

// ── Stanby Post ──
function startPostStanby() {
  confirmAction(
    'スタンバイに求人を投稿します。\nVPN接続を確認してから実行してください。\n実行しますか？',
    async () => {
      const vpnOk = await refreshVpn();
      if (!vpnOk) { toast('VPNに接続してから実行してください', 'error'); return; }
      runSSE('/api/post/stanby', 'progress-stanby', 'btn-post-stanby', d => {
        toast(d.message, d.success ? 'success' : 'error');
      });
    }
  );
}

// ── CSV Import ──
function triggerCSVImport() {
  document.getElementById('csv-file-input') && document.getElementById('csv-file-input').click();
}

// ── 媒体別CSVインポート ──
function triggerMediaCSV(media) {
  const el = document.getElementById('csv-' + media);
  if (el) el.click();
}

async function handleMediaCSV(input, media) {
  const file = input.files[0];
  if (!file) return;

  const mediaNames = { indeed: 'Indeed', kyujinbox: '求人ボックス', stanby: 'スタンバイ', past: '過去応募データ' };
  const resultEl = document.getElementById('import-result');
  if (resultEl) { resultEl.className = 'import-result'; resultEl.textContent = `${mediaNames[media]} のCSVを処理中...`; }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('media', media);

  try {
    const r = await fetch('/api/import/csv?media=' + media, { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    const msg = `✅ ${mediaNames[media]}: ${d.imported}件取込・${d.duplicates}件重複検出`;
    if (resultEl) { resultEl.className = 'import-result success'; resultEl.textContent = msg; }
    toast(msg, 'success');
    setTimeout(() => location.reload(), 2000);
  } catch (e) {
    const msg = `❌ ${mediaNames[media]} 取込失敗: ` + e.message;
    if (resultEl) { resultEl.className = 'import-result error'; resultEl.textContent = msg; }
    toast(msg, 'error');
  } finally {
    input.value = '';
  }
}

async function handleCSVFile(input) {
  const file = input.files[0];
  if (!file) return;
  const btn = document.getElementById('btn-import');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> インポート中...'; }
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/import/csv', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    toast(`${d.imported}件取込・${d.duplicates}件重複`, 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    toast('CSV取込に失敗: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'CSVをインポートする'; }
    input.value = '';
  }
}

// ── Status Change (Applicant) ──
async function changeStatus(id, newStatus) {
  try {
    const r = await fetch('/api/applicants/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!r.ok) throw new Error();
    toast('ステータスを更新しました', 'success');
    // Refresh only the badge in the row
    const badge = document.querySelector(`[data-applicant-id="${id}"] .status-badge`);
    if (badge) { badge.className = `badge badge-${newStatus} status-badge`; badge.textContent = newStatus; }
  } catch {
    toast('更新に失敗しました', 'error');
  }
}

// ── Job Modal ──
function showJobModal(job) {
  const m = document.getElementById('job-modal');
  if (!m) return;
  document.getElementById('modal-title').textContent = job ? '求人を編集' : '求人を登録';
  document.getElementById('jf-id').value          = job ? job.id : '';
  document.getElementById('jf-title').value       = job ? job.title : '';
  document.getElementById('jf-location').value    = job ? job.location : '';
  document.getElementById('jf-salary').value      = job ? job.salary : '';
  document.getElementById('jf-type').value        = job ? job.job_type : '';
  document.getElementById('jf-employment').value  = job ? job.employment_type : '';
  document.getElementById('jf-description').value = job ? job.description : '';
  document.getElementById('jf-tags').value        = job ? (JSON.parse(job.tags || '[]')).join(', ') : '';
  document.getElementById('jf-published').checked = job ? !!job.is_published : false;
  m.classList.remove('hidden');
}

function hideJobModal() {
  const m = document.getElementById('job-modal');
  if (m) m.classList.add('hidden');
}

async function saveJob() {
  const id = document.getElementById('jf-id').value;
  const tagsRaw = document.getElementById('jf-tags').value;
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const body = {
    title:          document.getElementById('jf-title').value,
    location:       document.getElementById('jf-location').value,
    salary:         document.getElementById('jf-salary').value,
    jobType:        document.getElementById('jf-type').value,
    employmentType: document.getElementById('jf-employment').value,
    description:    document.getElementById('jf-description').value,
    tags,
    isPublished:    document.getElementById('jf-published').checked
  };
  const url    = id ? `/api/jobs/${id}` : '/api/jobs';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || '保存失敗'); }
    hideJobModal();
    toast(id ? '求人を更新しました' : '求人を登録しました', 'success');
    setTimeout(() => location.reload(), 800);
  } catch (e) { toast('保存に失敗: ' + e.message, 'error'); }
}

async function deleteJob(id) {
  confirmAction('この求人を削除しますか？', async () => {
    const r = await fetch('/api/jobs/' + id, { method: 'DELETE' });
    if (r.ok) { toast('求人を削除しました', 'success'); setTimeout(() => location.reload(), 800); }
    else toast('削除に失敗しました', 'error');
  });
}

async function togglePublish(id, current) {
  const r = await fetch('/api/jobs/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublished: !current })
  });
  if (r.ok) { toast(current ? '非公開にしました' : '公開しました', 'success'); setTimeout(() => location.reload(), 500); }
}

// ── Apply Form ──
async function submitApply(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 送信中...'; }
  const data = Object.fromEntries(new FormData(form));
  try {
    const r = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error();
    const wrap = document.getElementById('apply-wrap');
    if (wrap) wrap.innerHTML = `
      <div class="apply-success">
        <div style="font-size:40px;margin-bottom:12px">✅</div>
        <h3>応募を受け付けました</h3>
        <p>ご応募ありがとうございます。担当者より3営業日以内にご連絡いたします。</p>
      </div>`;
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = '応募する'; }
    toast('送信に失敗しました。再度お試しください。', 'error');
  }
}

// ── AI Rewrite ──
async function generateWithAI() {
  const btn    = document.getElementById('btn-ai-gen');
  const status = document.getElementById('ai-gen-status');
  const desc   = document.getElementById('jf-description');
  if (!btn || !desc) return;

  const title       = document.getElementById('jf-title')?.value;
  const location    = document.getElementById('jf-location')?.value;
  const salary      = document.getElementById('jf-salary')?.value;
  const jobType     = document.getElementById('jf-type')?.value;
  const employment  = document.getElementById('jf-employment')?.value;

  if (!title) { toast('タイトルを入力してから生成してください', 'error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 生成中...';
  if (status) { status.style.display = 'block'; status.textContent = '✨ AIが原稿を生成しています...'; }

  try {
    const r = await fetch('/api/ai/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, location, salary, jobType, employmentType: employment, existingDescription: desc.value })
    });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || '生成失敗');
    desc.value = d.text;
    if (status) { status.textContent = '✅ 原稿を生成しました。内容を確認・修正してください。'; }
    toast('AI原稿を生成しました', 'success');
  } catch (e) {
    if (status) { status.textContent = `❌ ${e.message}`; }
    toast('AI生成に失敗: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ AIで原稿を生成';
  }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  // VPN polling
  if (document.getElementById('vpn-badge')) {
    refreshVpn();
    vpnInterval = setInterval(refreshVpn, 30000);
  }
  // Apply form
  const af = document.getElementById('apply-form');
  if (af) af.addEventListener('submit', submitApply);
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov && ov.id !== 'confirm-overlay') ov.classList.add('hidden');
    });
  });
  // Drop zone
  const dz = document.getElementById('drop-zone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      const fi = document.getElementById('csv-file-input');
      if (fi && e.dataTransfer.files[0]) { fi.files = e.dataTransfer.files; handleCSVFile(fi); }
    });
  }
});
