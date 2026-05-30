'use strict';

function adminLayout(title, content, active = 'dashboard') {
  const nav = [
    { href: '/admin', icon: '🏠', label: 'ダッシュボード', key: 'dashboard' },
    { href: '/admin/jobs', icon: '💼', label: '求人管理', key: 'jobs' },
    { href: '/admin/applicants', icon: '👥', label: '応募者管理', key: 'applicants' },
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
  <div class="sidebar-footer">v1.0 MVP</div>
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
        <button id="btn-xml-stanby" class="btn btn-ghost" onclick="downloadXML('stanby')">
          ⬇ XMLフィードを生成する（スタンバイ）
        </button>
      </div>
      <div id="progress-kyujinbox-wrap" class="progress-wrap hidden">
        <div id="progress-kyujinbox" class="progress-box"></div>
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
  <button class="btn btn-primary" onclick="showJobModal(null)">＋ 求人を登録する</button>
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
${jobModalHTML()}`;
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <label style="margin:0">仕事内容<span class="req">*</span></label>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-ai-gen" onclick="generateWithAI()">
          ✨ AIで原稿を生成
        </button>
      </div>
      <textarea id="jf-description" rows="6" placeholder="仕事内容を入力してください"></textarea>
      <div id="ai-gen-status" class="text-sm text-muted mt-8" style="display:none"></div>
    </div>
    <div class="form-group checkbox-row">
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

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description,
    "identifier": { "@type": "PropertyValue", "name": "recruitment-platform", "value": job.id },
    "datePosted": (job.published_at || job.created_at || '').slice(0,10),
    "validThrough": job.expires_at ? job.expires_at.slice(0,10) : "",
    "employmentType": mapEmploymentType(job.employment_type),
    "hiringOrganization": { "@type": "Organization", "name": "採用企業" },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": job.location,
        "addressCountry": "JP"
      }
    },
    "baseSalary": {
      "@type": "MonetaryAmount",
      "currency": "JPY",
      "value": {
        "@type": "QuantitativeValue",
        "unitText": "MONTH"
      }
    }
  }, null, 2)}<\/script>`;

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

module.exports = { adminLayout, publicLayout, dashboardPage, adminJobsPage, adminApplicantsPage, adminLogsPage, jobsListPage, jobDetailPage, esc };
