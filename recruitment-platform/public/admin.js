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
      el.innerHTML = '<span class="dot"></span> VPN未接続 <button onclick="connectVpn(event)" class="vpn-connect-btn">接続する</button>';
      return false;
    }
  } catch {
    el.className = 'vpn-badge vpn-disconnected';
    el.innerHTML = '<span class="dot"></span> 確認失敗 <button onclick="connectVpn(event)" class="vpn-connect-btn">接続する</button>';
    return false;
  }
}

async function connectVpn(e) {
  if (e) e.stopPropagation();
  const el = document.getElementById('vpn-badge');
  if (!el) return;
  el.className = 'vpn-badge vpn-checking';
  el.innerHTML = '<span class="dot"></span> 接続中...';
  try {
    const r = await fetch('/api/vpn/connect', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      toast('VPN接続を開始しました。数秒後に確認します。', 'success');
      setTimeout(refreshVpn, 5000);
    } else {
      toast(d.error || 'VPN接続に失敗しました', 'error');
      refreshVpn();
    }
  } catch {
    toast('VPN接続APIエラー', 'error');
    refreshVpn();
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
function copyFeedUrl(type) {
  const el = document.getElementById('feed-url-' + type);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim()).then(() => {
    const label = type === 'kyujinbox' ? '求人ボックス' : 'スタンバイ';
    toast(`${label}のXMLフィードURLをコピーしました`, 'success');
  }).catch(() => toast('コピーに失敗しました', 'error'));
}

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
async function exportCSV(company) {
  const btn = document.getElementById('btn-csv-export');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 出力中...'; }
  try {
    const param = company ? `?company=${encodeURIComponent(company)}` : '';
    const r = await fetch('/api/export/csv' + param);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = company === 'all' ? 'all' : (company || 'list');
    a.download = `ca-list-${label}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast(company === 'all' ? '全社合算CSVをダウンロードしました' : 'CA対応リストをダウンロードしました', 'success');
  } catch {
    toast('CSV出力に失敗しました', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '📤 この会社のCSV出力'; }
  }
}

// ── Indeed Scrape ──
async function runRotation() {
  const btn = document.getElementById('btn-rotate');
  const result = document.getElementById('rotation-result');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 実行中...'; }
  if (result) { result.style.display = 'block'; result.textContent = '実行中...'; }
  try {
    const res = await fetch('/api/admin/rotate-jobs', { method: 'POST' });
    const data = await res.json();
    if (result) result.textContent = data.output || (data.ok ? '完了' : 'エラー');
    showToast(data.ok ? 'ローテーション完了' : 'エラーが発生しました', data.ok ? 'success' : 'error');
    if (data.ok) setTimeout(() => location.reload(), 2000);
  } catch (e) {
    if (result) result.textContent = 'エラー: ' + e.message;
    showToast('通信エラー', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 今すぐローテーション実行'; }
  }
}

async function runAIGenerate() {
  const btn    = document.getElementById('btn-ai-generate');
  const result = document.getElementById('ai-gen-result');
  const target = document.getElementById('ai-gen-target')?.value || 'all';
  const count  = parseInt(document.getElementById('ai-gen-count')?.value || '0', 10);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中...'; }
  if (result) { result.style.display = 'block'; result.textContent = 'AI生成中... しばらくお待ちください（1〜3分かかります）'; }
  try {
    const res = await fetch('/api/admin/generate-jobs-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, count }),
    });
    const data = await res.json();
    if (result) result.textContent = data.output || (data.ok ? '完了' : 'エラー');
    showToast(data.ok ? 'AI求人生成完了' : 'エラーが発生しました', data.ok ? 'success' : 'error');
    if (data.ok) setTimeout(() => location.reload(), 3000);
  } catch (e) {
    if (result) result.textContent = 'エラー: ' + e.message;
    showToast('通信エラー', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 AI求人を生成する'; }
  }
}

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
  const batchSize = document.getElementById('kb-batch-size')?.value || '5';
  confirmAction(
    `求人ボックスに${batchSize}件を投稿します。\nVPN接続を確認してから実行してください。\n実行しますか？`,
    async () => {
      const vpnOk = await refreshVpn();
      if (!vpnOk) { toast('VPNに接続してから実行してください', 'error'); return; }
      runSSE(`/api/post/kyujinbox?limit=${batchSize}`, 'progress-kyujinbox', 'btn-post-kyujinbox', d => {
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

// ── Indeed Post ──
function startPostIndeed() {
  confirmAction(
    'Indeed に求人を掲載します。\nVPN接続を確認してから実行してください。\n実行しますか？',
    async () => {
      const vpnOk = await refreshVpn();
      if (!vpnOk) { toast('VPNに接続してから実行してください', 'error'); return; }
      runSSE('/api/post/indeed', 'progress-indeed-post', 'btn-post-indeed', d => {
        toast(d.message, d.success ? 'success' : 'error');
      });
    }
  );
}

// ── CSV Import ──
function triggerCSVImport() {
  document.getElementById('csv-file-input').click();
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
  document.getElementById('jf-catchcopy').value   = job ? (job.catchcopy || '') : '';
  document.getElementById('jf-description').value = job ? job.description : '';
  document.getElementById('jf-tags').value        = job ? (JSON.parse(job.tags || '[]')).join(', ') : '';
  document.getElementById('jf-published').checked = job ? !!job.is_published : false;
  const existingMedia = job ? (JSON.parse(job.target_media || '[]')[0] || '') : '';
  document.querySelectorAll('[name="jf-media"]').forEach(r => { r.checked = r.value === existingMedia; });
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
    catchcopy:      document.getElementById('jf-catchcopy')?.value || '',
    description:    document.getElementById('jf-description').value,
    tags,
    isPublished:    document.getElementById('jf-published').checked,
    targetMedia:    (() => { const r = document.querySelector('[name="jf-media"]:checked'); return r && r.value ? [r.value] : []; })(),
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

// ── AI Bulk Generate ──
function openBulkModal() {
  const modal = document.getElementById('bulk-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  updateBulkCount();
  document.querySelectorAll('[name="bulk-type"],[name="bulk-loc"]').forEach(cb => {
    cb.addEventListener('change', updateBulkCount);
  });
}

function closeBulkModal() {
  const modal = document.getElementById('bulk-modal');
  if (modal) modal.classList.add('hidden');
  // reset
  const form = document.getElementById('bulk-form');
  const prog = document.getElementById('bulk-progress');
  const btn  = document.getElementById('btn-bulk-gen');
  if (form) form.style.display = '';
  if (prog) prog.style.display = 'none';
  if (btn)  { btn.disabled = false; btn.textContent = '✨ 生成開始'; }
  const done = document.getElementById('btn-bulk-done');
  if (done) done.style.display = 'none';
  const log  = document.getElementById('bulk-log');
  if (log)  log.innerHTML = '';
}

function toggleAllBulkType(on) {
  document.querySelectorAll('[name="bulk-type"]').forEach(cb => { cb.checked = on; });
  updateBulkCount();
}

function toggleAllBulkLoc(on) {
  document.querySelectorAll('[name="bulk-loc"]').forEach(cb => { cb.checked = on; });
  updateBulkCount();
}

function updateBulkCount() {
  const types  = [...document.querySelectorAll('[name="bulk-type"]:checked')].length;
  const locs   = [...document.querySelectorAll('[name="bulk-loc"]:checked')].length;
  const medias = [...document.querySelectorAll('[name="bulk-media"]:checked')].map(cb => cb.value);
  const preview = document.getElementById('bulk-count-preview');
  if (!preview) return;
  const total = types * locs;
  if (!total) { preview.textContent = '職種と勤務地を選択してください'; return; }
  if (!medias.length) {
    preview.textContent = `${types}職種 × ${locs}勤務地 = ${total}件（媒体未割当）`;
    return;
  }
  const base = Math.floor(total / medias.length);
  const rem  = total % medias.length;
  const dist = medias.map((m, i) => `${m}: ${base + (i < rem ? 1 : 0)}件`).join(' / ');
  preview.textContent = `${types}職種 × ${locs}勤務地 = ${total}件 → ${dist}`;
}

function startBulkGenerate() {
  const types = [...document.querySelectorAll('[name="bulk-type"]:checked')].map(cb => cb.value);
  const locs  = [...document.querySelectorAll('[name="bulk-loc"]:checked')].map(cb => cb.value);
  const emp   = document.getElementById('bulk-emp-type')?.value || '正社員';

  if (!types.length || !locs.length) {
    toast('職種と勤務地を選択してください', 'error');
    return;
  }

  const form = document.getElementById('bulk-form');
  const prog = document.getElementById('bulk-progress');
  const btn  = document.getElementById('btn-bulk-gen');
  const log  = document.getElementById('bulk-log');
  const bar  = document.getElementById('bulk-progress-bar');

  form.style.display = 'none';
  prog.style.display = '';
  btn.disabled = true;

  const medias = [...document.querySelectorAll('[name="bulk-media"]:checked')].map(cb => cb.value);
  const params = new URLSearchParams({
    types: types.join(','),
    locations: locs.join(','),
    employmentType: emp,
    media: medias.join(','),
  });

  const es = new EventSource(`/api/generate/bulk?${params}`);
  const total = types.length * locs.length;

  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    const line = document.createElement('div');
    const color = d.type === 'success' ? '#137333' : d.type === 'error' ? '#b91c1c' : d.type === 'warn' ? '#92400e' : '#444';
    line.style.color = color;
    line.textContent = d.message;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;

    if (d.current && d.total) {
      bar.style.width = Math.round((d.current / d.total) * 100) + '%';
    }

    if (d.done) {
      es.close();
      bar.style.width = '100%';
      const doneBtn = document.getElementById('btn-bulk-done');
      if (doneBtn) doneBtn.style.display = '';
      if (d.success) toast(`✅ ${d.count}件の求人を生成しました！`, 'success');
    }
  };

  es.onerror = () => {
    es.close();
    const line = document.createElement('div');
    line.style.color = '#b91c1c';
    line.textContent = '❌ 接続が切断されました';
    log.appendChild(line);
    const doneBtn = document.getElementById('btn-bulk-done');
    if (doneBtn) doneBtn.style.display = '';
  };
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
