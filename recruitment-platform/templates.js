'use strict';

function adminLayout(title, content, active = 'dashboard') {
  const nav = [
    { href: '/admin', icon: '🏠', label: 'ダッシュボード', key: 'dashboard' },
    { href: '/admin/jobs', icon: '💼', label: '求人管理', key: 'jobs' },
    { href: '/admin/applicants', icon: '👥', label: '応募者管理', key: 'applicants' },
    { href: '/admin/analytics', icon: '📈', label: '分析・レポート', key: 'analytics' },
    { href: '/admin/logs', icon: '📋', label: '投稿ログ', key: 'logs' },
    { href: '/jobs', icon: '🌐', label: '求人サイトを見る', key: 'site' },
  ].map(n => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}"><span class="nav-icon">${n.icon}</span>${n.label}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | 採用管理</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body class="admin-layout">
<aside class="sidebar">
  <div class="sidebar-logo">
    <h1>SEO採用<br>プラットフォーム</h1>
    <span>管理画面</span>
  </div>
  <nav>${nav}</nav>
  <div class="sidebar-footer"><a href="/admin/logout" style="color:var(--text-muted);font-size:12px;text-decoration:none">🚪 ログアウト</a></div>
</aside>
<main class="main-content">
${content}
</main>
<div id="confirm-overlay" class="modal-overlay hidden">
  <div class="modal modal-sm">
    <h3>確認</h3>
    <p id="confirm-message"></p>
    <div class="modal-footer">
      <button id="confirm-cancel" class="btn btn-ghost">キャンセル</button>
      <button id="confirm-ok" class="btn btn-primary">実行する</button>
    </div>
  </div>
</div>
<div id="toast-container"></div>
<script src="/admin.js"></script>
</body>
</html>`;
}

function publicLayout(title, content, { description = '', jsonld = '', canonical = '' } = {}) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const canonicalUrl = canonical || siteUrl + '/jobs';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:url" content="${canonicalUrl}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
${jsonld}
<link rel="stylesheet" href="/styles.css">
</head>
<body class="pub-body">
<header class="pub-header">
  <div class="pub-header-inner">
    <a href="/jobs" class="pub-header-logo">採用情報</a>
    <nav class="pub-header-nav">
      <a href="/jobs">求人一覧</a>
    </nav>
  </div>
</header>
<main>
${content}
</main>
<footer class="pub-footer">
  <div class="pub-footer-inner">
    <span>${esc(process.env.COMPANY_NAME || '採用企業')}</span>
    <a href="/privacy">プライバシーポリシー</a>
  </div>
</footer>
<div id="toast-container"></div>
<script src="/admin.js"></script>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(str) {
  return esc(str || '').replace(/\n/g, '<br>');
}

// ── Admin Dashboard ──
function dashboardPage({ stats, lastPost, banRisk = {}, mediaBreakdown = [] }) {
  // BAN risk helper
  function banLevel(count, warn, danger) {
    if (count >= danger) return 'ban-danger';
    if (count >= warn)   return 'ban-warn';
    return 'ban-safe';
  }
  const kb = banRisk.kyujinbox || 0;
  const st = banRisk.stanby    || 0;
  const wp = banRisk.weeklyPosts || 0;

  const maxMedia = mediaBreakdown.length > 0 ? Math.max(...mediaBreakdown.map(m => m.count)) : 1;
  const mediaBars = mediaBreakdown.slice(0, 6).map(({ media, count }) => {
    const pct = Math.round((count / maxMedia) * 100);
    return `<div class="media-bar-row">
      <span class="media-bar-label">${esc(media)}</span>
      <div class="media-bar-track"><div class="media-bar-fill" style="width:${pct}%"></div></div>
      <span class="media-bar-count">${count}</span>
    </div>`;
  }).join('');

  const content = `
<div class="header-row">
  <div>
    <div class="page-header">
      <h2>ダッシュボード</h2>
      <p>採用プラットフォームの管理・操作</p>
    </div>
  </div>
  <span id="vpn-badge" class="vpn-badge vpn-checking" onclick="refreshVpn()" title="クリックで再確認">
    <span class="dot"></span> 確認中...
  </span>
</div>

<div class="grid-4 mb-24">
  <div class="card card-sm">
    <div class="card-title">公開求人数</div>
    <div class="card-value">${stats.jobs}</div>
  </div>
  <div class="card card-sm">
    <div class="card-title">本日の応募数</div>
    <div class="card-value">${stats.today}</div>
  </div>
  <div class="card card-sm">
    <div class="card-title">重複件数</div>
    <div class="card-value">${stats.duplicates}</div>
  </div>
  <div class="card card-sm">
    <div class="card-title">最終投稿</div>
    <div class="card-value" style="font-size:14px;padding-top:8px">${lastPost ? lastPost.slice(0,10) : '未実施'}</div>
  </div>
</div>

<div class="grid-2 gap-24 mb-24">
  <div class="card">
    <div class="action-section-title" style="margin-bottom:14px">⚠️ 媒体BANリスク</div>
    <div class="ban-risk-grid">
      <div class="ban-item ${banLevel(kb, 12, 16)}">
        <div class="ban-item-label">求人ボックス</div>
        <div class="ban-item-count">${kb}<span>/20件</span></div>
        <div class="ban-item-bar"><div style="width:${Math.min(100, Math.round(kb/20*100))}%"></div></div>
        <div class="ban-item-status">${kb >= 16 ? '🔴 危険域' : kb >= 12 ? '🟡 注意域' : '🟢 安全域'}</div>
      </div>
      <div class="ban-item ${banLevel(st, 28, 32)}">
        <div class="ban-item-label">スタンバイ</div>
        <div class="ban-item-count">${st}<span>/32件</span></div>
        <div class="ban-item-bar"><div style="width:${Math.min(100, Math.round(st/32*100))}%"></div></div>
        <div class="ban-item-status">${st >= 32 ? '🔴 危険域' : st >= 28 ? '🟡 注意域' : '🟢 安全域'}</div>
      </div>
      <div class="ban-item ${banLevel(wp, 2, 3)}">
        <div class="ban-item-label">今週の投稿回数</div>
        <div class="ban-item-count">${wp}<span>回/週</span></div>
        <div class="ban-item-bar"><div style="width:${Math.min(100, Math.round(wp/3*100))}%"></div></div>
        <div class="ban-item-status">${wp >= 3 ? '🔴 過多' : wp >= 2 ? '🟡 注意' : '🟢 問題なし'}</div>
      </div>
      <div class="ban-item ban-info">
        <div class="ban-item-label" style="font-size:11px;line-height:1.5">
          ・求人ボックス: 1日1〜2件まで<br>
          ・削除再投稿: 月1回のみ<br>
          ・スタンバイ: XML更新週1〜2回
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="action-section-title" style="margin-bottom:14px">📊 媒体別応募数</div>
    ${mediaBreakdown.length === 0
      ? '<p class="text-muted text-sm">応募者データがありません</p>'
      : `<div class="media-bars">${mediaBars}</div>`}
  </div>
</div>

<div class="grid-2 gap-24">
  <div class="card">
    <div class="action-section">
      <div class="action-section-title">📋 求人管理</div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="showJobModal(null)">＋ 求人を登録する</button>
        <a href="/admin/jobs" class="btn btn-ghost">求人一覧を見る</a>
      </div>
    </div>

    <div class="action-section mt-16">
      <div class="action-section-title">📡 媒体運用</div>
      <div class="btn-group">
        <button id="btn-post-kyujinbox" class="btn btn-warning" onclick="startPostKyujinbox()">
          🚀 求人ボックスに投稿する
        </button>
        <button id="btn-xml-kyujinbox" class="btn btn-ghost" onclick="downloadXML('kyujinbox')">
          ⬇ XMLフィードを生成する（求人ボックス）
        </button>
      </div>
      <div id="progress-kyujinbox-wrap" class="progress-wrap hidden">
        <div id="progress-kyujinbox" class="progress-box"></div>
      </div>
      <div class="btn-group mt-8">
        <button id="btn-post-stanby" class="btn btn-warning" onclick="startPostStanby()">
          🚀 スタンバイに投稿する
        </button>
        <button id="btn-xml-stanby" class="btn btn-ghost" onclick="downloadXML('stanby')">
          ⬇ XMLフィードを生成する（スタンバイ）
        </button>
      </div>
      <div id="progress-stanby-wrap" class="progress-wrap hidden">
        <div id="progress-stanby" class="progress-box"></div>
      </div>
      <div class="btn-group mt-8">
        <button id="btn-post-indeed" class="btn btn-warning" onclick="startPostIndeed()">
          🚀 Indeed に掲載する
        </button>
      </div>
      <div id="progress-indeed-post-wrap" class="progress-wrap hidden">
        <div id="progress-indeed-post" class="progress-box"></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="action-section">
      <div class="action-section-title">👥 応募者管理</div>
      <div class="btn-group">
        <button id="btn-scrape-indeed" class="btn btn-success" onclick="startScrapeIndeed()">
          🔍 Indeedから応募者を取得する
        </button>
        <button id="btn-import" class="btn btn-ghost" onclick="triggerCSVImport()">
          📂 CSVをインポートする
        </button>
        <a href="/admin/applicants" class="btn btn-ghost">応募者一覧を見る</a>
        <button id="btn-csv-export" class="btn btn-ghost" onclick="exportCSV()">
          📤 CA対応リストをCSV出力する
        </button>
      </div>
      <input type="file" id="csv-file-input" accept=".csv" style="display:none" onchange="handleCSVFile(this)">
      <div id="progress-indeed-wrap" class="progress-wrap hidden">
        <div id="progress-indeed" class="progress-box"></div>
      </div>
    </div>
  </div>
</div>

${jobModalHTML()}
`;
  return adminLayout('ダッシュボード', content, 'dashboard');
}

// ── Admin Jobs ──
function adminJobsPage(jobs) {
  const rows = jobs.length === 0
    ? `<tr><td colspan="7" class="empty-state"><p>求人が登録されていません</p></td></tr>`
    : jobs.map(j => {
        const tags = JSON.parse(j.tags || '[]').slice(0,3).map(t => `<span class="job-tag">${esc(t)}</span>`).join('');
        return `<tr>
          <td><div style="font-weight:600;max-width:220px">${esc(j.title)}</div><div class="text-muted text-sm">${esc(j.job_type)}</div></td>
          <td>${esc(j.location)}</td>
          <td>${esc(j.salary)}</td>
          <td>${tags}</td>
          <td><span class="badge badge-${j.is_published ? '公開' : '非公開'}">${j.is_published ? '公開' : '非公開'}</span></td>
          <td>${(j.created_at||'').slice(0,10)}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-ghost btn-sm" onclick='showJobModal(${JSON.stringify(j)})'>編集</button>
              <button class="btn btn-ghost btn-sm" onclick="togglePublish('${j.id}', ${!!j.is_published})">${j.is_published ? '非公開' : '公開'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteJob('${j.id}')">削除</button>
            </div>
          </td>
        </tr>`;
      }).join('');

  const content = `
<div class="header-row">
  <h2>求人管理</h2>
  <div style="display:flex;gap:8px">
    <button class="btn btn-secondary" onclick="openBulkModal()" style="background:#7c3aed;color:#fff;border-color:#7c3aed">✨ AI一括生成</button>
    <button class="btn btn-primary" onclick="showJobModal(null)">＋ 求人を登録する</button>
  </div>
</div>
<div class="card">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>タイトル</th><th>勤務地</th><th>給与</th><th>タグ</th>
        <th>状態</th><th>登録日</th><th>操作</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>
${jobModalHTML()}
${bulkModalHTML()}`;
  return adminLayout('求人管理', content, 'jobs');
}

function jobModalHTML() {
  return `
<div id="job-modal" class="modal-overlay hidden">
  <div class="modal">
    <h3 id="modal-title">求人を登録</h3>
    <input type="hidden" id="jf-id">
    <div class="form-row">
      <div class="form-group">
        <label>タイトル<span class="req">*</span></label>
        <input type="text" id="jf-title" placeholder="例: 介護職員（東京）">
      </div>
      <div class="form-group">
        <label>勤務地<span class="req">*</span></label>
        <input type="text" id="jf-location" placeholder="例: 東京都新宿区">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>給与<span class="req">*</span></label>
        <input type="text" id="jf-salary" placeholder="例: 月給22万円〜">
      </div>
      <div class="form-group">
        <label>職種<span class="req">*</span></label>
        <select id="jf-type">
          <option>介護・福祉</option><option>営業</option><option>エンジニア</option>
          <option>事務・管理</option><option>医療・看護</option><option>製造・物流</option>
          <option>飲食・サービス</option><option>販売・接客</option><option>その他</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>雇用形態<span class="req">*</span></label>
        <select id="jf-employment">
          <option>正社員</option><option>パート・アルバイト</option><option>契約社員</option>
          <option>派遣社員</option><option>業務委託</option>
        </select>
      </div>
      <div class="form-group">
        <label>タグ（カンマ区切り）</label>
        <input type="text" id="jf-tags" placeholder="例: 未経験OK, 週2〜, 資格取得支援">
      </div>
    </div>
    <div class="form-group">
      <label>キャッチコピー <span class="text-muted text-sm">（求人ボックス・スタンバイ用・25〜35文字）</span></label>
      <input type="text" id="jf-catchcopy" placeholder="例: 未経験歓迎！研修充実で安心スタート" maxlength="50">
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <label style="margin:0">仕事内容<span class="req">*</span></label>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-ai-gen" onclick="generateWithAI()">
          ✨ AIで原稿を生成
        </button>
      </div>
      <textarea id="jf-description" rows="6" placeholder="仕事内容を入力してください"></textarea>
      <div id="ai-gen-status" class="text-sm text-muted mt-8" style="display:none"></div>
    </div>
    <div class="form-group" style="margin-top:4px">
      <label style="font-weight:600;display:block;margin-bottom:8px">配信媒体 <span class="text-muted text-sm" style="font-weight:400">（1媒体のみ・重複掲載を防ぎます）</span></label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <label class="media-radio-label"><input type="radio" name="jf-media" value=""> なし</label>
        <label class="media-radio-label"><input type="radio" name="jf-media" value="求人ボックス"> 求人ボックス</label>
        <label class="media-radio-label"><input type="radio" name="jf-media" value="スタンバイ"> スタンバイ</label>
        <label class="media-radio-label"><input type="radio" name="jf-media" value="Indeed"> Indeed</label>
      </div>
      <p class="text-sm text-muted" style="margin-top:4px">Googleしごと検索は公開求人に自動掲載されます</p>
    </div>
    <div class="form-group checkbox-row" style="margin-top:4px">
      <input type="checkbox" id="jf-published">
      <label for="jf-published">すぐに公開する</label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="hideJobModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="saveJob()">保存する</button>
    </div>
  </div>
</div>`;
}

function bulkModalHTML() {
  const jobTypes = [
    '看護師・准看護師', '介護士・ケアワーカー', '調理師・キッチンスタッフ',
    '事務・受付スタッフ', '営業（個人向け）', '営業（法人向け）',
    'Webエンジニア（フロントエンド）', 'Webエンジニア（バックエンド）',
    '保育士・幼稚園教諭', 'ドライバー・配送',
  ];
  const locations = [
    { label: '東京・新宿',  value: '東京都新宿区' },
    { label: '東京・品川',  value: '東京都品川区' },
    { label: '東京・渋谷',  value: '東京都渋谷区' },
    { label: '東京・豊島',  value: '東京都豊島区' },
    { label: '大阪・中央',  value: '大阪府大阪市中央区' },
    { label: '大阪・北区',  value: '大阪府大阪市北区' },
    { label: '大阪・阿倍野', value: '大阪府大阪市阿倍野区' },
    { label: '大阪・西区',  value: '大阪府大阪市西区' },
  ];
  const typeChecks = jobTypes.map(t =>
    `<label class="bulk-check"><input type="checkbox" name="bulk-type" value="${esc(t)}"> ${esc(t)}</label>`
  ).join('');
  const locChecks = locations.map(l =>
    `<label class="bulk-check"><input type="checkbox" name="bulk-loc" value="${esc(l.value)}"> ${esc(l.label)}</label>`
  ).join('');

  return `
<div id="bulk-modal" class="modal-overlay hidden">
  <div class="modal" style="max-width:600px;max-height:90vh;overflow-y:auto">
    <h3>✨ AI一括求人生成</h3>
    <p class="text-muted text-sm" style="margin:4px 0 16px">選択した職種×勤務地の組み合わせ分の求人原稿をAIが自動生成します。<br>生成後は「求人管理」で内容確認・公開できます。</p>

    <div id="bulk-form">
      <div class="form-group">
        <label style="font-weight:600;margin-bottom:8px;display:block">職種（複数選択可）
          <span style="font-weight:400;margin-left:8px">
            <a href="#" onclick="toggleAllBulkType(true);return false" style="font-size:12px">全選択</a> /
            <a href="#" onclick="toggleAllBulkType(false);return false" style="font-size:12px">全解除</a>
          </span>
        </label>
        <div class="bulk-checks">${typeChecks}</div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label style="font-weight:600;margin-bottom:8px;display:block">勤務地（複数選択可）
          <span style="font-weight:400;margin-left:8px">
            <a href="#" onclick="toggleAllBulkLoc(true);return false" style="font-size:12px">全選択</a> /
            <a href="#" onclick="toggleAllBulkLoc(false);return false" style="font-size:12px">全解除</a>
          </span>
        </label>
        <div class="bulk-checks">${locChecks}</div>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label style="font-weight:600">雇用形態</label>
        <select id="bulk-emp-type" class="form-input" style="max-width:200px;margin-top:6px">
          <option value="正社員">正社員</option>
          <option value="パート・アルバイト">パート・アルバイト</option>
          <option value="契約社員">契約社員</option>
        </select>
      </div>
      <div class="form-group" style="margin-top:12px">
        <label style="font-weight:600;margin-bottom:8px;display:block">配信媒体 <span class="text-muted text-sm" style="font-weight:400">（均等に割り当てます）</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <label class="bulk-check"><input type="checkbox" name="bulk-media" value="求人ボックス" checked onchange="updateBulkCount()"> 求人ボックス</label>
          <label class="bulk-check"><input type="checkbox" name="bulk-media" value="スタンバイ" checked onchange="updateBulkCount()"> スタンバイ</label>
          <label class="bulk-check"><input type="checkbox" name="bulk-media" value="Indeed" onchange="updateBulkCount()"> Indeed</label>
        </div>
        <p class="text-sm text-muted" style="margin-top:4px">各媒体への重複掲載を防ぐため、求人を均等に振り分けます</p>
      </div>
      <div id="bulk-count-preview" class="text-sm" style="margin-top:8px;color:#7c3aed;font-weight:600"></div>
      <div class="modal-footer" style="margin-top:16px">
        <button class="btn btn-ghost" onclick="closeBulkModal()">キャンセル</button>
        <button class="btn btn-primary" id="btn-bulk-gen" onclick="startBulkGenerate()" style="background:#7c3aed;border-color:#7c3aed">✨ 生成開始</button>
      </div>
    </div>

    <div id="bulk-progress" style="display:none">
      <div id="bulk-progress-bar-wrap" style="background:#f1f3f4;border-radius:4px;height:8px;margin-bottom:12px">
        <div id="bulk-progress-bar" style="background:#7c3aed;height:8px;border-radius:4px;width:0%;transition:width .3s"></div>
      </div>
      <div id="bulk-log" style="max-height:300px;overflow-y:auto;font-size:12px;font-family:monospace;background:#f8f9fa;border-radius:4px;padding:10px;line-height:1.8"></div>
      <div class="modal-footer" style="margin-top:16px">
        <button class="btn btn-primary" id="btn-bulk-done" onclick="closeBulkModal();location.reload()" style="display:none">完了 — 求人管理を更新</button>
      </div>
    </div>
  </div>
</div>`;
}

// ── Admin Applicants ──
function adminApplicantsPage(applicants, filter = 'all') {
  const statusList = ['all','新規','未対応','架電済','面談済','紹介済','NG','重複'];
  const chips = statusList.map(s =>
    `<span class="filter-chip ${s === filter ? 'active' : ''}" onclick="location.href='/admin/applicants?status=${s}'">${s === 'all' ? 'すべて' : s}</span>`
  ).join('');

  const rows = applicants.length === 0
    ? `<tr><td colspan="8" class="empty-state"><p>応募者がいません</p></td></tr>`
    : applicants.map(a => `
      <tr data-applicant-id="${a.id}">
        <td><div style="font-weight:600">${esc(a.name)}</div><div class="text-muted text-sm">${(a.applied_at||'').slice(0,10)}</div></td>
        <td>${esc(a.phone)}</td>
        <td class="truncate">${esc(a.email)}</td>
        <td><span class="badge badge-${esc(a.source_media)}" style="background:#f1f5f9;color:#475569">${esc(a.source_media)}</span></td>
        <td>${esc(a.job_titles || '-')}</td>
        <td>
          <span class="badge badge-${esc(a.status)} status-badge">${esc(a.status)}</span>
        </td>
        <td>
          <select class="s-select" onchange="changeStatus('${a.id}',this.value)">
            ${['新規','未対応','架電済','面談済','紹介済','NG','重複'].map(s => `<option ${s===a.status?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>
          ${a.is_duplicate ? `<a href="/admin/applicants?search=${encodeURIComponent(a.name)}" class="text-sm text-muted">重複元を見る</a>` : ''}
        </td>
      </tr>`).join('');

  const content = `
<div class="header-row">
  <h2>応募者管理</h2>
  <div class="btn-group">
    <button id="btn-import" class="btn btn-ghost" onclick="triggerCSVImport()">📂 CSVをインポート</button>
    <input type="file" id="csv-file-input" accept=".csv" style="display:none" onchange="handleCSVFile(this)">
    <button id="btn-csv-export" class="btn btn-ghost" onclick="exportCSV()">📤 CA対応リスト出力</button>
  </div>
</div>
<div id="drop-zone" class="drop-zone mb-16" onclick="triggerCSVImport()">
  <div class="drop-zone-icon">📄</div>
  <p>CSVファイルをドロップまたはクリックで選択</p>
  <p class="text-sm" style="margin-top:4px">氏名・電話・メール・応募媒体のカラムを含むCSVを対応</p>
</div>
<div class="filter-row">${chips}</div>
<div class="card">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>氏名</th><th>電話</th><th>メール</th><th>媒体</th>
        <th>応募求人</th><th>ステータス</th><th>変更</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
  return adminLayout('応募者管理', content, 'applicants');
}

// ── Admin Logs ──
function adminLogsPage(logs) {
  const actionLabel = {
    kyujinbox_post: '求人ボックス投稿',
    stanby_post: 'スタンバイ投稿',
    indeed_post: 'Indeed掲載',
    indeed_scrape: 'Indeedスクレイピング',
    xml_generate: 'XML生成',
    csv_import: 'CSVインポート'
  };
  const rows = logs.length === 0
    ? `<tr><td colspan="4" class="empty-state"><p>ログがありません</p></td></tr>`
    : logs.map(l => `<tr>
        <td>${(l.created_at||'').slice(0,19).replace('T',' ')}</td>
        <td>${actionLabel[l.action] || l.action}</td>
        <td><span class="badge badge-${l.status}">${esc(l.status)}</span></td>
        <td>${esc(l.message)}</td>
      </tr>`).join('');

  const content = `
<div class="page-header">
  <h2>投稿ログ</h2>
  <p>処理の実行履歴</p>
</div>
<div class="card">
  <div class="table-wrap">
    <table>
      <thead><tr><th>日時</th><th>アクション</th><th>ステータス</th><th>メッセージ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
  return adminLayout('投稿ログ', content, 'logs');
}

// ── Public Jobs List ──
function jobsListPage(jobs, search = '') {
  const cards = jobs.length === 0
    ? `<div class="empty-state"><p>現在募集中の求人はありません</p></div>`
    : jobs.map(j => {
        const tags = JSON.parse(j.tags || '[]').slice(0,4).map(t => `<span class="job-tag">${esc(t)}</span>`).join('');
        return `<a href="/jobs/${j.id}" class="job-card">
          <div class="job-card-top">
            <span class="job-card-type">${esc(j.job_type)}</span>
            <span class="text-sm text-muted">${esc(j.location)}</span>
          </div>
          <h3 class="job-card-title">${esc(j.title)}</h3>
          <div class="job-card-salary">💴 ${esc(j.salary)}</div>
          <div class="job-card-meta">
            <span>📍 ${esc(j.location)}</span>
            <span>🏢 ${esc(j.employment_type)}</span>
          </div>
          <div class="job-tags">${tags}</div>
        </a>`;
      }).join('');

  const content = `
<div class="pub-main">
  <div class="pub-hero">
    <h1>あなたにぴったりの仕事が見つかる</h1>
    <p>東京・大阪を中心に多数の求人を掲載中</p>
    <form class="pub-search" action="/jobs" method="get">
      <input type="search" name="q" value="${esc(search)}" placeholder="職種・キーワードで検索">
      <button type="submit">検索</button>
    </form>
  </div>
  <div style="margin-bottom:12px;font-size:14px;color:var(--text-muted)">
    ${jobs.length}件の求人が見つかりました${search ? `「${esc(search)}」の検索結果` : ''}
  </div>
  <div class="jobs-grid">${cards}</div>
</div>`;

  return publicLayout('求人情報一覧 | 採用サイト', content, {
    description: '東京・大阪の求人情報一覧。介護、営業、エンジニアなど多数掲載。'
  });
}

// ── Job Detail ──
function jobDetailPage(job) {
  const tags = JSON.parse(job.tags || '[]');
  const tagsHtml = tags.map(t => `<span class="job-tag">${esc(t)}</span>`).join('');
  const faq = JSON.parse(job.faq || '[]');
  const faqHtml = faq.length > 0
    ? `<div class="job-body"><h2>よくある質問</h2>${faq.map(f => `<p><strong>Q. ${esc(f.q)}</strong></p><p>A. ${esc(f.a)}</p>`).join('<br>')}</div>`
    : '';

  const salaryParsed = parseSalary(job.salary);
  const salarySchema = salaryParsed ? {
    "@type": "MonetaryAmount",
    "currency": "JPY",
    "value": {
      "@type": "QuantitativeValue",
      ...(salaryParsed.min   ? { "minValue": salaryParsed.min }   : {}),
      ...(salaryParsed.max   ? { "maxValue": salaryParsed.max }   : {}),
      "unitText": salaryParsed.unitText
    }
  } : undefined;

  const jsonldObj = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description,
    "identifier": { "@type": "PropertyValue", "name": process.env.COMPANY_NAME || "採用企業", "value": job.id },
    "datePosted": (job.published_at || job.created_at || '').slice(0, 10),
    ...(job.expires_at ? { "validThrough": job.expires_at.slice(0, 10) } : {}),
    "employmentType": mapEmploymentType(job.employment_type),
    "hiringOrganization": {
      "@type": "Organization",
      "name": process.env.COMPANY_NAME || "採用企業",
      ...(process.env.SITE_URL ? { "sameAs": process.env.SITE_URL } : {})
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": job.location,
        "addressCountry": "JP"
      }
    },
    ...(salarySchema ? { "baseSalary": salarySchema } : {})
  };

  const jsonld = `<script type="application/ld+json">${JSON.stringify(jsonldObj, null, 2)}<\/script>`;

  const content = `
<div class="pub-main">
  <div class="job-detail-wrap">
    <div style="margin-bottom:16px">
      <a href="/jobs" class="btn btn-ghost btn-sm">← 求人一覧へ戻る</a>
    </div>
    <div class="job-detail-header">
      <span class="job-card-type" style="margin-bottom:10px;display:inline-block">${esc(job.job_type)}</span>
      <h1>${esc(job.title)}</h1>
      <div class="job-tags">${tagsHtml}</div>
    </div>
    <div class="job-meta-grid">
      <div class="job-meta-item"><div class="job-meta-label">📍 勤務地</div><div class="job-meta-value">${esc(job.location)}</div></div>
      <div class="job-meta-item"><div class="job-meta-label">💴 給与</div><div class="job-meta-value" style="color:var(--success)">${esc(job.salary)}</div></div>
      <div class="job-meta-item"><div class="job-meta-label">🏢 雇用形態</div><div class="job-meta-value">${esc(job.employment_type)}</div></div>
      <div class="job-meta-item"><div class="job-meta-label">💼 職種</div><div class="job-meta-value">${esc(job.job_type)}</div></div>
    </div>
    <div class="job-body">
      <h2>仕事内容</h2>
      <p>${nl2br(job.description)}</p>
    </div>
    ${faqHtml}
    <div id="apply-wrap">
      <div class="apply-section">
        <h2>この求人に応募する</h2>
        <p>必要事項を入力して送信してください。担当者より3営業日以内にご連絡いたします。</p>
        <form id="apply-form">
          <input type="hidden" name="jobId" value="${job.id}">
          <input type="hidden" name="jobTitle" value="${esc(job.title)}">
          <input type="hidden" name="sourceMedia" value="direct">
          <div class="form-row">
            <div class="form-group">
              <label>お名前<span class="req">*</span></label>
              <input type="text" name="name" required placeholder="山田 太郎">
            </div>
            <div class="form-group">
              <label>電話番号<span class="req">*</span></label>
              <input type="tel" name="phone" required placeholder="090-0000-0000">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>メールアドレス<span class="req">*</span></label>
              <input type="email" name="email" required placeholder="taro@example.com">
            </div>
            <div class="form-group">
              <label>年齢</label>
              <input type="number" name="age" placeholder="25" min="15" max="99">
            </div>
          </div>
          <div class="form-group">
            <label>住所</label>
            <input type="text" name="address" placeholder="東京都新宿区...">
          </div>
          <div class="form-group">
            <label>メッセージ（任意）</label>
            <textarea name="notes" rows="3" placeholder="志望動機・質問等があればご記入ください"></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-lg w-full">応募する</button>
        </form>
      </div>
    </div>
  </div>
</div>`;

  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  return publicLayout(`${esc(job.title)} | 求人詳細`, content, {
    description: `${job.location}・${job.salary}・${job.employment_type}。${job.description.slice(0, 100)}`,
    jsonld,
    canonical: `${siteUrl}/jobs/${job.id}`
  });
}

function mapEmploymentType(t) {
  const m = { '正社員': 'FULL_TIME', 'パート・アルバイト': 'PART_TIME', '契約社員': 'CONTRACTOR', '派遣社員': 'TEMPORARY', '業務委託': 'OTHER' };
  return m[t] || 'OTHER';
}

// Parse Japanese salary string → { min, max, unitText }
// Examples: "月給25万円〜30万円" → {min:250000, max:300000, unitText:"MONTH"}
//           "時給1,200円" → {min:1200, unitText:"HOUR"}
//           "年収400万円〜600万円" → {min:4000000, max:6000000, unitText:"YEAR"}
function parseSalary(salary) {
  if (!salary) return null;
  const s = salary.replace(/,/g, '').replace(/，/g, '');
  let unitText = 'MONTH';
  if (/時給|時間/.test(s))  unitText = 'HOUR';
  if (/日給|日当/.test(s))  unitText = 'DAY';
  if (/年収|年俸/.test(s))  unitText = 'YEAR';

  // Multiplier: 万 = 10000
  const toNum = str => {
    const m = str.match(/([\d.]+)万/);
    if (m) return Math.round(parseFloat(m[1]) * 10000);
    const n = str.match(/[\d]+/);
    return n ? parseInt(n[0], 10) : null;
  };

  // Range: "23万円〜30万円" / "25万〜30万" / "1,200円〜1,600円"
  // Allow any non-digit chars between the number and the range delimiter
  const range = s.match(/([\d.]+万?[\d]*)\D*[〜～〜~]\D*([\d.]+万?[\d]*)/);
  if (range) {
    const min = toNum(range[1]);
    const max = toNum(range[2]);
    if (min && max) return { min, max, unitText };
  }

  // Single value
  const single = toNum(s);
  if (single) return { min: single, unitText };

  return null;
}

// ── SVG Line Chart helper ──────────────────────────────────────
function svgLineChart(data, { width = 560, height = 160, color = '#2563eb' } = {}) {
  if (!data.length) return `<div class="chart-empty">データなし</div>`;
  const pad = { t: 10, r: 10, b: 28, l: 32 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.count), 1);

  const pts = data.map((d, i) => {
    const x = pad.l + (data.length > 1 ? (i / (data.length - 1)) * W : W / 2);
    const y = pad.t + H - (d.count / maxV) * H;
    return { x, y, d };
  });
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fillD = `${pathD} L ${pts[pts.length-1].x.toFixed(1)},${(pad.t + H).toFixed(1)} L ${pts[0].x.toFixed(1)},${(pad.t + H).toFixed(1)} Z`;

  // X labels: show every ~7 points
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = pts.filter((_, i) => i % step === 0 || i === data.length - 1)
    .map(p => `<text x="${p.x.toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9" fill="#94a3b8">${p.d.date.slice(5)}</text>`)
    .join('');

  // Y labels
  const yLabels = [0, Math.ceil(maxV / 2), maxV].map(v => {
    const y = pad.t + H - (v / maxV) * H;
    return `<text x="${pad.l - 4}" y="${y.toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8" dominant-baseline="middle">${v}</text>
    <line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${pad.l + W}" y2="${y.toFixed(1)}" stroke="#f1f5f9" stroke-width="1"/>`;
  }).join('');

  const dots = pts.filter(p => p.d.count > 0)
    .map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}" opacity=".8"/>`)
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
  ${yLabels}
  <path d="${fillD}" fill="${color}" fill-opacity=".08"/>
  <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
  ${dots}
  ${xLabels}
</svg>`;
}

// ── Admin Analytics ────────────────────────────────────────────
function adminAnalyticsPage({ daily, media, status, topJobs, weekly }) {
  const totalApps = daily.reduce((s, d) => s + d.count, 0);
  const wow = weekly.weekOnWeek !== null
    ? `<span style="color:${weekly.weekOnWeek >= 0 ? 'var(--success)' : 'var(--error)'}">${weekly.weekOnWeek >= 0 ? '↑' : '↓'}${Math.abs(weekly.weekOnWeek)}%</span>`
    : '<span style="color:var(--text-muted)">-</span>';

  // Media chart
  const maxMedia = media.length ? Math.max(...media.map(m => m.total), 1) : 1;
  const mediaBars = media.map(m => {
    const pct = Math.round((m.total / maxMedia) * 100);
    const dupPct = m.total > 0 ? Math.round((m.duplicates / m.total) * 100) : 0;
    return `<div class="analytics-bar-row">
      <div class="analytics-bar-label">${esc(m.media)}</div>
      <div class="analytics-bar-track">
        <div class="analytics-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="analytics-bar-meta">
        <span>${m.total}件</span>
        <span class="text-muted">（重複${dupPct}%）</span>
      </div>
    </div>`;
  }).join('');

  // Status donut (simple table)
  const statusColors = { '新規':'#2563eb','未対応':'#d97706','架電済':'#16a34a','面談済':'#7c3aed','紹介済':'#0891b2','NG':'#dc2626','重複':'#94a3b8' };
  const totalStatus = status.reduce((s, r) => s + r.count, 0) || 1;
  const statusBars = status.map(s => {
    const pct = Math.round((s.count / totalStatus) * 100);
    const color = statusColors[s.status] || '#64748b';
    return `<div class="analytics-bar-row">
      <div class="analytics-bar-label"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle"></span>${esc(s.status)}</div>
      <div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="analytics-bar-meta"><span>${s.count}件</span><span class="text-muted">${pct}%</span></div>
    </div>`;
  }).join('');

  // Top jobs table
  const jobRows = topJobs.length === 0
    ? `<tr><td colspan="4" class="empty-state text-sm">データなし</td></tr>`
    : topJobs.map((j, i) => `<tr>
        <td style="color:var(--text-muted)">${i + 1}</td>
        <td><a href="/jobs/${j.id}" target="_blank" style="color:var(--primary)">${esc(j.title)}</a></td>
        <td>${esc(j.location)}</td>
        <td style="font-weight:700;color:var(--primary)">${j.app_count}</td>
      </tr>`).join('');

  const content = `
<div class="page-header">
  <h2>分析・レポート</h2>
  <p>応募データの分析と媒体パフォーマンス</p>
</div>

<div class="grid-4 mb-24">
  <div class="card card-sm">
    <div class="card-title">今週の応募</div>
    <div class="card-value">${weekly.thisWeek}</div>
    <div class="card-sub">先週比 ${wow}</div>
  </div>
  <div class="card card-sm">
    <div class="card-title">過去30日の応募</div>
    <div class="card-value">${totalApps}</div>
  </div>
  <div class="card card-sm">
    <div class="card-title">重複率</div>
    <div class="card-value">${weekly.dupRate}%</div>
    <div class="card-sub">全体平均</div>
  </div>
  <div class="card card-sm">
    <div class="card-title">先週の応募</div>
    <div class="card-value">${weekly.lastWeek}</div>
  </div>
</div>

<div class="card mb-24">
  <div class="action-section-title" style="margin-bottom:16px">📅 応募数トレンド（過去30日）</div>
  <div class="chart-wrap">
    ${svgLineChart(daily)}
  </div>
</div>

<div class="grid-2 gap-24 mb-24">
  <div class="card">
    <div class="action-section-title" style="margin-bottom:14px">📡 媒体別パフォーマンス</div>
    ${media.length === 0
      ? '<p class="text-muted text-sm">データなし</p>'
      : `<div class="analytics-bars">${mediaBars}</div>`}
  </div>
  <div class="card">
    <div class="action-section-title" style="margin-bottom:14px">👥 ステータス分布</div>
    ${status.length === 0
      ? '<p class="text-muted text-sm">データなし</p>'
      : `<div class="analytics-bars">${statusBars}</div>`}
  </div>
</div>

<div class="card">
  <div class="action-section-title" style="margin-bottom:14px">🏆 求人別応募数ランキング</div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>#</th><th>求人タイトル</th><th>勤務地</th><th>応募数</th></tr></thead>
      <tbody>${jobRows}</tbody>
    </table>
  </div>
</div>`;

  return adminLayout('分析・レポート', content, 'analytics');
}

// ── Login page ──
function loginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン | 採用管理</title>
<link rel="stylesheet" href="/styles.css">
<style>
.login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg)}
.login-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:40px;width:100%;max-width:360px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.login-logo{text-align:center;margin-bottom:28px}
.login-logo h1{font-size:20px;font-weight:700;color:var(--primary);margin:0 0 4px}
.login-logo p{font-size:12px;color:var(--text-muted)}
.login-error{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:13px;padding:10px 14px;border-radius:6px;margin-bottom:16px}
</style>
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <div class="login-logo">
      <h1>SEO採用プラットフォーム</h1>
      <p>管理画面へのログイン</p>
    </div>
    ${error ? `<div class="login-error">⚠️ ${esc(error)}</div>` : ''}
    <form method="POST" action="/admin/login">
      <div class="form-group">
        <label class="form-label">ユーザー名</label>
        <input class="form-input" type="text" name="username" autocomplete="username" required autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">パスワード</label>
        <input class="form-input" type="password" name="password" autocomplete="current-password" required>
      </div>
      <button class="btn btn-primary w-full mt-16" type="submit" style="width:100%;justify-content:center">ログイン</button>
    </form>
  </div>
</div>
</body>
</html>`;
}

// ── Privacy Policy ──
function privacyPolicyPage() {
  const company  = process.env.COMPANY_NAME || '採用企業';
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const siteUrl  = process.env.SITE_URL || '';
  const today    = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const content = `
<div class="pub-main" style="max-width:800px;margin:0 auto;padding:40px 24px">
  <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">プライバシーポリシー</h1>
  <p style="font-size:13px;color:#70757a;margin-bottom:40px">制定日：${today}</p>

  <div class="privacy-section">
    <h2>1. 事業者情報</h2>
    <p>${esc(company)}（以下「当社」）は、当採用サイト（以下「本サイト」）において取得する個人情報の取り扱いについて、以下のとおりプライバシーポリシーを定めます。</p>
  </div>

  <div class="privacy-section">
    <h2>2. 収集する個人情報の種類</h2>
    <p>本サイトでは、求人への応募時に以下の個人情報を収集します。</p>
    <ul>
      <li>氏名</li>
      <li>電話番号</li>
      <li>メールアドレス</li>
      <li>年齢（任意）</li>
      <li>住所（任意）</li>
      <li>志望動機・メッセージ（任意）</li>
      <li>応募した求人情報・応募日時</li>
    </ul>
  </div>

  <div class="privacy-section">
    <h2>3. 個人情報の利用目的</h2>
    <p>収集した個人情報は、以下の目的にのみ利用します。</p>
    <ul>
      <li>採用選考の実施および選考結果のご連絡</li>
      <li>採用担当者からのご連絡・面談の調整</li>
      <li>採用管理業務の遂行</li>
      <li>重複応募の確認および応募履歴の管理</li>
    </ul>
    <p>上記以外の目的で個人情報を利用することはありません。</p>
  </div>

  <div class="privacy-section">
    <h2>4. 個人情報の第三者提供</h2>
    <p>当社は、以下の場合を除き、ご本人の同意なく第三者に個人情報を提供しません。</p>
    <ul>
      <li>法令に基づく場合</li>
      <li>人の生命・身体または財産の保護のために必要な場合</li>
      <li>公衆衛生の向上または児童の健全な育成の推進のために特に必要な場合</li>
    </ul>
  </div>

  <div class="privacy-section">
    <h2>5. 個人情報の管理</h2>
    <p>当社は、個人情報の漏洩・滅失・毀損を防止するため、適切なセキュリティ対策を実施します。個人情報へのアクセスは採用担当者に限定し、不要になった個人情報は速やかに削除します。</p>
    <p>個人情報の保管期間は、選考終了後<strong>6ヶ月以内</strong>とします。</p>
  </div>

  <div class="privacy-section">
    <h2>6. 個人情報の開示・訂正・削除について</h2>
    <p>ご本人から個人情報の開示・訂正・削除のご要望があった場合は、本人確認のうえ、合理的な期間内に対応いたします。下記のお問い合わせ先までご連絡ください。</p>
  </div>

  <div class="privacy-section">
    <h2>7. Cookie（クッキー）について</h2>
    <p>本サイトは管理画面のセッション管理のみにCookieを使用します。求職者向けの求人一覧・求人詳細ページではCookieを使用しておらず、トラッキングも行いません。</p>
  </div>

  <div class="privacy-section">
    <h2>8. プライバシーポリシーの変更</h2>
    <p>当社は、法令の変更や事業内容の変化に応じて、本ポリシーを改定することがあります。改定後のポリシーは本ページに掲載した時点で効力を生じます。</p>
  </div>

  <div class="privacy-section">
    <h2>9. お問い合わせ先</h2>
    <p>個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。</p>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-top:8px">
      <p><strong>${esc(company)}</strong><br>
      個人情報保護担当窓口<br>
      ${adminEmail ? `メール：<a href="mailto:${esc(adminEmail)}" style="color:var(--primary)">${esc(adminEmail)}</a>` : 'メール：採用担当までお問い合わせください'}</p>
    </div>
  </div>
</div>`;

  return publicLayout('プライバシーポリシー | 採用サイト', content, {
    description: `${company}の採用サイトにおける個人情報の取り扱いについて説明します。`,
    canonical: `${siteUrl}/privacy`,
  });
}

module.exports = { adminLayout, publicLayout, dashboardPage, adminJobsPage, adminApplicantsPage, adminLogsPage, adminAnalyticsPage, loginPage, jobsListPage, jobDetailPage, privacyPolicyPage, esc };
