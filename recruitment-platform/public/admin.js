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
      if (d.type === 'ping') return;
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
function copyFeedUrl(type, co) {
  const el = document.getElementById('feed-url-' + type);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim()).then(() => {
    const label = type === 'kyujinbox' ? '求人ボックス' : 'スタンバイ';
    toast(`${label}のXMLフィードURLをコピーしました`, 'success');
  }).catch(() => toast('コピーに失敗しました', 'error'));
}

async function downloadXML(type, co) {
  const btn = document.getElementById('btn-xml-' + type);
  const label = type === 'kyujinbox' ? '求人ボックス' : 'スタンバイ';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 生成中...'; }
  try {
    const r = await fetch('/api/feed/' + type + (co ? `?company=${co}` : ''));
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

// ── List Export (新規 / 月次全件 / 月次NG) ──
async function exportList(type) {
  const month = document.getElementById('export-month')?.value || '';
  const co = new URLSearchParams(location.search).get('co') || '';
  const labels = { new: '新規リスト', monthly: `全応募者_${month}`, ng: `NGリスト_${month}` };
  try {
    let url = `/api/export/csv?type=${type}`;
    if (month && (type === 'monthly' || type === 'ng')) url += `&month=${month}`;
    if (co) url += `&co=${co}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${labels[type]}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast(`${labels[type]}をダウンロードしました`, 'success');
  } catch {
    toast('CSV出力に失敗しました', 'error');
  }
}

// ── Indeed Scrape ──
async function runRotation(co) {
  const btn = document.getElementById('btn-rotate');
  const result = document.getElementById('rotation-result');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 実行中...'; }
  if (result) { result.style.display = 'block'; result.textContent = '実行中...'; }
  try {
    const res = await fetch('/api/admin/rotate-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: co }),
    });
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

async function runAIGenerate(co) {
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
      body: JSON.stringify({ target, count, company: co }),
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

// ── 媒体投稿（ポーリング方式: Cloudflare のSSEタイムアウト回避）──
// ボタン1回で1日分（求人ボックス25件 / スタンバイ16件）を一括投稿する共通処理
function startMediaPost({ endpoint, limit, company, mediaLabel, progressId, btnId }) {
  confirmAction(
    `${mediaLabel}に${limit}件を投稿します。\nVPN接続を確認してから実行してください。\n実行しますか？`,
    async () => {
      const vpnOk = await refreshVpn();
      if (!vpnOk) { toast('VPNに接続してから実行してください', 'error'); return; }

      const box = openProgress(progressId);
      const btn = document.getElementById(btnId);
      if (btn) { btn.disabled = true; btn.dataset.origText = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span> 実行中...'; }
      appendLog(box, '処理を開始しています...', 'info');

      let sessionId = null;
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit, company })
        });
        const d = await r.json();
        if (!r.ok || !d.ok) {
          appendLog(box, d.error || 'サーバーエラーが発生しました', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.origText; }
          return;
        }
        sessionId = d.sessionId;
      } catch (e) {
        appendLog(box, 'サーバーへの接続に失敗しました: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.origText; }
        return;
      }

      let fromIdx = 0;
      const timer = setInterval(async () => {
        try {
          const r = await fetch(`${endpoint}/poll?id=${sessionId}&from=${fromIdx}`);
          if (!r.ok) return;
          const d = await r.json();
          for (const entry of d.logs) appendLog(box, entry.message, entry.type || 'info');
          fromIdx = d.total;
          if (d.done) {
            clearInterval(timer);
            if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.origText; }
            toast(d.success ? `${mediaLabel}への投稿が完了しました` : '投稿が失敗しました', d.success ? 'success' : 'error');
          }
        } catch { /* ignore transient network errors */ }
      }, 2000);
    }
  );
}

// ── Kyujinbox Post（ボタン1回で25件）──
function startPostKyujinbox(co) {
  startMediaPost({
    endpoint: '/api/post/kyujinbox', limit: 25, company: co,
    mediaLabel: '求人ボックス', progressId: 'progress-kyujinbox', btnId: 'btn-post-kyujinbox',
  });
}

// ── Stanby Post（ボタン1回で16件）──
function startPostStanby(co) {
  startMediaPost({
    endpoint: '/api/post/stanby', limit: 16, company: co,
    mediaLabel: 'スタンバイ', progressId: 'progress-stanby', btnId: 'btn-post-stanby',
  });
}

// ── Indeed Post ──
function startPostIndeed(co) {
  confirmAction(
    'Indeed に求人を掲載します。\nVPN接続を確認してから実行してください。\n実行しますか？',
    async () => {
      const vpnOk = await refreshVpn();
      if (!vpnOk) { toast('VPNに接続してから実行してください', 'error'); return; }
      runSSE('/api/post/indeed' + (co ? `?company=${co}` : ''), 'progress-indeed-post', 'btn-post-indeed', d => {
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
    const msg = `${d.imported}件取込・${d.duplicates}件重複` + (d.skipped ? `・${d.skipped}件スキップ(計${d.rows}行)` : '');
    toast(msg, d.imported > 0 ? 'success' : 'warn');
    if (d.skipped > 0 && d.skipReasons?.length) console.warn('スキップ理由:', d.skipReasons);
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
  const rfEl = document.getElementById('jf-rewarding');      if (rfEl) rfEl.value = job ? (job.rewarding || '') : '';
  const wfEl = document.getElementById('jf-worktime');       if (wfEl) wfEl.value = job ? (job.worktime_holiday || '') : '';
  const tfEl = document.getElementById('jf-transportation');  if (tfEl) tfEl.value = job ? (job.transportation || '') : '';
  const hfEl = document.getElementById('jf-how-to-apply');   if (hfEl) hfEl.value = job ? (job.how_to_apply || '') : '';
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
    rewarding:      document.getElementById('jf-rewarding')?.value || '',
    worktimeHoliday: document.getElementById('jf-worktime')?.value || '',
    transportation:  document.getElementById('jf-transportation')?.value || '',
    howToApply:     document.getElementById('jf-how-to-apply')?.value || '',
    tags,
    isPublished:    document.getElementById('jf-published').checked,
    targetMedia:    (() => { const r = document.querySelector('[name="jf-media"]:checked'); return r && r.value ? [r.value] : []; })(),
    company:        document.getElementById('jobs-current-co')?.value || undefined,
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
  // 過去応募者ページ: URLパラメータ（ディープリンク）に応じて初回絞り込みを適用
  if (document.getElementById('past-filter')) opsPastFilter();
  // 架電リストページ: 共有スプレッドシートが設定済みなら「シートを開く」リンクを表示
  if (document.getElementById('sheets-open')) sheetsStatus();
});

// ══════════════════════════════════════════════════════════════
// 運用管理（掲載日報）
// ══════════════════════════════════════════════════════════════
function opsAddPost() {
  document.getElementById('post-modal-title').textContent = '掲載を追加';
  document.getElementById('pm-id').value = '';
  document.getElementById('pm-title').value = '';
  document.getElementById('pm-post-date').value = '';
  document.getElementById('pm-expire-date').value = '';
  document.getElementById('pm-count').value = '0';
  document.getElementById('pm-notes').value = '';
  document.getElementById('post-modal').classList.remove('hidden');
}
async function opsEditPost(id) {
  const res = await fetch('/api/ops/posts');
  const posts = await res.json();
  const p = posts.find(x => x.id === id);
  if (!p) return toast('掲載が見つかりません', 'error');
  document.getElementById('post-modal-title').textContent = '掲載を編集';
  document.getElementById('pm-id').value = p.id;
  document.getElementById('pm-company').value = p.company_id;
  document.getElementById('pm-media').value = p.media;
  document.getElementById('pm-title').value = p.job_title;
  document.getElementById('pm-post-date').value = p.post_date || '';
  document.getElementById('pm-expire-date').value = p.expire_date || '';
  document.getElementById('pm-status').value = p.status;
  document.getElementById('pm-count').value = p.applicant_count;
  document.getElementById('pm-notes').value = p.notes || '';
  document.getElementById('post-modal').classList.remove('hidden');
}
function opsCloseModal() { document.getElementById('post-modal').classList.add('hidden'); }
async function opsSavePost() {
  const id = document.getElementById('pm-id').value;
  const body = {
    company_id: document.getElementById('pm-company').value,
    media: document.getElementById('pm-media').value,
    job_title: document.getElementById('pm-title').value,
    post_date: document.getElementById('pm-post-date').value,
    expire_date: document.getElementById('pm-expire-date').value,
    status: document.getElementById('pm-status').value,
    applicant_count: parseInt(document.getElementById('pm-count').value) || 0,
    notes: document.getElementById('pm-notes').value,
  };
  if (!body.job_title) return toast('求人タイトルを入力してください', 'warn');
  const url = id ? `/api/ops/posts/${id}` : '/api/ops/posts';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) { toast('保存しました', 'success'); location.reload(); }
  else toast('保存に失敗しました', 'error');
}
function opsDeletePost(id) {
  confirmAction('この掲載情報を削除しますか？', async () => {
    const res = await fetch(`/api/ops/posts/${id}`, { method: 'DELETE' });
    if (res.ok) { toast('削除しました', 'success'); location.reload(); }
    else toast('削除に失敗しました', 'error');
  });
}
// 過去応募者フィルター（クライアント側で即時に絞り込み・ページ遷移なし）
function opsPastFilter() {
  const f = document.getElementById('past-filter');
  if (!f) return;
  const getVal  = (n) => { const el = f.querySelector(`[name="${n}"]`); return el ? el.value : 'all'; };
  const getText = (n) => { const el = f.querySelector(`[name="${n}"]`); return (el && el.value !== 'all') ? el.options[el.selectedIndex].text : null; };
  const fc = getVal('company'), fm = getVal('media'), fs = getVal('status'), fmo = getVal('month');

  let total = 0;
  document.querySelectorAll('#past-results .past-section').forEach(sec => {
    let shown = 0;
    sec.querySelectorAll('tbody tr').forEach(tr => {
      const ok = (fc === 'all'  || tr.dataset.company === fc)
              && (fm === 'all'  || tr.dataset.media   === fm)
              && (fs === 'all'  || tr.dataset.status  === fs)
              && (fmo === 'all' || tr.dataset.month   === fmo);
      tr.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    const cnt = sec.querySelector('.section-count');
    if (cnt) cnt.textContent = shown + '件';
    sec.style.display = shown ? '' : 'none';
    total += shown;
  });

  const totalEl = document.getElementById('past-total');
  if (totalEl) totalEl.textContent = total + '件';
  const emptyEl = document.getElementById('past-empty');
  if (emptyEl) emptyEl.style.display = total ? 'none' : '';

  // スプレッドシート出力リンクと抽出条件表示を更新
  const qs = new URLSearchParams();
  if (fc !== 'all')  qs.set('company', fc);
  if (fm !== 'all')  qs.set('media', fm);
  if (fs !== 'all')  qs.set('status', fs);
  if (fmo !== 'all') qs.set('month', fmo);
  const a = document.getElementById('past-export');
  if (a) {
    a.href = '/api/ops/calls/export' + (qs.toString() ? '?' + qs.toString() : '');
    a.textContent = qs.toString() ? '📊 スプレッドシート出力（絞り込み中）' : '📊 スプレッドシート出力（全件）';
  }
  const cond = document.getElementById('past-conditions');
  if (cond) {
    const labels = [getText('company'), getText('media'), getText('status'), getText('month')].filter(Boolean);
    cond.textContent = labels.length ? '抽出条件: ' + labels.join(' / ') : '';
    cond.style.display = labels.length ? '' : 'none';
  }
}

// ══════════════════════════════════════════════════════════════
// 架電リスト
// ══════════════════════════════════════════════════════════════
async function callUpdate(id, field, value) {
  const body = {};
  body[field] = value;
  try {
    const res = await fetch(`/api/ops/calls/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) {
      if (field === 'status') {
        const colors = { '新規':'#3b82f6','架電済(不通)':'#eab308','対応中':'#06b6d4','対応終了':'#16a34a','断られた':'#94a3b8','辞退':'#94a3b8','重複':'#cbd5e1' };
        const tr = document.querySelector(`tr[data-id="${id}"]`);
        if (tr) { tr.style.background = (colors[value] || '#fff') + '15'; tr.dataset.status = value; }
        callsLocalFilter();
      }
      toast('更新しました', 'success');
    } else toast('更新に失敗しました', 'error');
  } catch (e) { toast('通信エラー', 'error'); }
}

function callsLocalFilter() {
  const searchTerm = (document.getElementById('cf-search')?.value || '').toLowerCase().trim();
  const statusVal  = document.getElementById('cf-status')?.value || 'all';
  const tbody = document.querySelector('#calls-table tbody');
  if (!tbody) return;
  let visible = 0;
  for (const tr of tbody.querySelectorAll('tr[data-id]')) {
    const text   = (tr.textContent || '').toLowerCase();
    const status = tr.dataset.status || '';
    const matchS = !searchTerm || text.includes(searchTerm);
    const matchT = statusVal === 'all' || status === statusVal;
    tr.style.display = (matchS && matchT) ? '' : 'none';
    if (matchS && matchT) visible++;
  }
  const countEl = document.getElementById('calls-count');
  if (countEl) countEl.textContent = `${visible}件`;
}

function callImport() {
  const m = document.getElementById('call-import-modal');
  if (!m) { toast('ページを再読み込みしてください', 'warn'); return; }
  const modeEl = document.getElementById('ci-mode');
  if (modeEl) modeEl.value = 'insert';
  m.classList.remove('hidden');
  callImportModeHint();
}
function callImportUpdate() {
  const m = document.getElementById('call-import-modal');
  if (!m) { toast('ページを再読み込みしてください', 'warn'); return; }
  const modeEl = document.getElementById('ci-mode');
  if (modeEl) modeEl.value = 'update';
  m.classList.remove('hidden');
  callImportModeHint();
}
function callCloseImport() {
  const m = document.getElementById('call-import-modal');
  if (m) m.classList.add('hidden');
  const r = document.getElementById('ci-result');
  if (r) r.innerHTML = '';
}
function callImportModeHint() {
  const mode = document.getElementById('ci-mode')?.value || 'insert';
  const hint = document.getElementById('ci-mode-hint');
  if (!hint) return;
  hint.textContent = mode === 'update'
    ? '架電後のCSV/Excel(.xlsx)/スプレッドシートを取り込み、電話番号・メールが一致する既存応募者の「対応状況・架電回数・メモ」を更新します（新規追加はしません）。'
    : '新規の応募者を取り込みます。CSV・Excel(.xlsx)・スプレッドシートに対応。電話番号・メールが既存と一致する場合は重複として記録します。';
}
async function callDoImport() {
  const mode    = document.getElementById('ci-mode')?.value || 'insert';
  const company = document.getElementById('ci-company').value;
  const media   = document.getElementById('ci-media').value;
  const file    = document.getElementById('ci-file').files[0];
  if (!file) return toast('CSVファイルを選択してください', 'warn');
  const fd = new FormData();
  fd.append('mode', mode);
  fd.append('company', company);
  fd.append('media', media);
  fd.append('file', file);
  const resultEl = document.getElementById('ci-result');
  resultEl.innerHTML = mode === 'update' ? '<p>架電結果を反映中...</p>' : '<p>取込中...</p>';
  try {
    const res = await fetch('/api/ops/calls/import', { method: 'POST', body: fd });
    let d;
    try { d = await res.json(); } catch { throw new Error(`サーバーエラー (HTTP ${res.status})`); }
    if (d.ok && d.mode === 'update') {
      resultEl.innerHTML = `<p style="color:#16a34a">✅ ${d.updated}件の対応状況を更新しました` +
        (d.notFound ? `・${d.notFound}件は該当者なし` : '') + `（CSVの行数: ${d.rows}行）</p>` +
        (d.notFoundNames?.length ? `<p style="color:#b45309;font-size:12px">該当なし例: ${d.notFoundNames.join('、')}</p>` : '');
      toast(`${d.updated}件を更新しました`, d.updated > 0 ? 'success' : 'warn');
      setTimeout(() => location.reload(), 1500);
    } else if (d.ok) {
      resultEl.innerHTML = `<p style="color:#16a34a">✅ ${d.imported}件取込・${d.duplicates}件重複` +
        (d.skipped ? `・${d.skipped}件スキップ` : '') + `（CSVの行数: ${d.rows}行）</p>` +
        (d.skipReasons?.length ? `<p style="color:#b45309;font-size:12px">スキップ理由: ${d.skipReasons.join('、')}</p>` : '');
      toast(`${d.imported}件取り込みました`, d.imported > 0 ? 'success' : 'warn');
      setTimeout(() => location.reload(), 1500);
    } else {
      resultEl.innerHTML = `<p style="color:#dc2626">❌ 処理に失敗しました: ${d.error || '不明なエラー'}</p>`;
      toast('処理に失敗しました', 'error');
    }
  } catch (e) {
    resultEl.innerHTML = `<p style="color:#dc2626">❌ エラー: ${e.message}</p>`;
    toast('処理に失敗しました', 'error');
  }
}
// ── 共有スプレッドシート（Google Sheets）連携 ──
async function sheetsStatus() {
  try {
    const r = await fetch('/api/ops/sheets/status');
    const d = await r.json();
    const link = document.getElementById('sheets-open');
    if (link && d.configured && d.url) { link.href = d.url; link.style.display = ''; }
    return d;
  } catch { return { configured: false }; }
}
async function sheetsPush() {
  const st = await sheetsStatus();
  if (!st.configured) { toast('Googleスプレッドシート連携が未設定です（設定方法はGOOGLE_SHEETS_SETUP.mdを参照）', 'warn'); return; }
  toast('スプレッドシートへ反映中...', 'info');
  try {
    const r = await fetch('/api/ops/sheets/push', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      const n = (d.count != null ? d.count : d.appended) || 0;
      toast(`${n}件をスプレッドシートに反映しました（媒体別）`, n > 0 ? 'success' : 'info');
      if (d.warnings && d.warnings.length) toast('注意: ' + d.warnings.join(' / '), 'warn');
      const link = document.getElementById('sheets-open');
      if (link && d.url) { link.href = d.url; link.style.display = ''; }
    } else { toast('反映に失敗: ' + (d.error || '不明なエラー'), 'error'); }
  } catch (e) { toast('通信エラー: ' + e.message, 'error'); }
}
async function sheetsPull() {
  const st = await sheetsStatus();
  if (!st.configured) { toast('Googleスプレッドシート連携が未設定です（設定方法はGOOGLE_SHEETS_SETUP.mdを参照）', 'warn'); return; }
  confirmAction('共有スプレッドシートの内容（対応状況・架電回数・メモ）をDBに取り込みます。よろしいですか？', async () => {
    toast('スプレッドシートから取込中...', 'info');
    try {
      const r = await fetch('/api/ops/sheets/pull', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        toast(`${d.updated}件を更新しました` + (d.notFound ? `・${d.notFound}件は該当なし` : ''), d.updated > 0 ? 'success' : 'info');
        setTimeout(() => location.reload(), 1500);
      } else { toast('取込に失敗: ' + (d.error || '不明なエラー'), 'error'); }
    } catch (e) { toast('通信エラー: ' + e.message, 'error'); }
  });
}

function callCheckDup() {
  confirmAction('全データを横断し、電話番号またはメールアドレスが一致する応募者を「重複」にします（会社・媒体は問いません）。よろしいですか？', async () => {
    try {
      const res = await fetch('/api/ops/check-dup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const d = await res.json();
      if (d.ok) { toast(`${d.flagged}件を重複にしました`, 'success'); setTimeout(() => location.reload(), 1000); }
      else toast('重複チェックに失敗しました', 'error');
    } catch (e) { toast('通信エラー', 'error'); }
  });
}
