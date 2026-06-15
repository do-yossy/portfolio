'use strict';

const COMPANIES = {
  sq: { label: 'Social Quality', full: '株式会社Social Quality', color: '#7c3aed' },
  bg: { label: 'Bigeyes',        full: '株式会社Bigeyes',        color: '#ea580c' },
  pe: { label: 'ピープル',        full: '合同会社ピープル',        color: '#16a34a' },
  lt: { label: 'Life Tailor',    full: '株式会社Life Tailor',    color: '#0891b2' },
  nc: { label: 'ニクール',        full: '合同会社ニクール',        color: '#db2777' },
  nx: { label: 'ネクサス',        full: 'ネクサス株式会社',        color: '#0d9488' },
};

// 運用管理の媒体マスタ
const OPS_MEDIA = [
  { id: 'indeed',    name: 'Indeed' },
  { id: 'kyujinbox', name: '求人ボックス' },
  { id: 'stanby',    name: 'スタンバイ' },
  { id: 'google',    name: 'Googleしごと検索' },
  { id: 'engage',    name: 'engage' },
];
const CALL_STATUS_COLORS = {
  '新規':  '#3b82f6',
  '不通':  '#f97316',
  '対応中': '#eab308',
  '終了':  '#06b6d4',
};

function adminLayout(title, content, active = 'posts', co = 'sq') {
  // per-section hrefs that carry the current company through navigation
  const pageHref = {
    posts:     (c) => `/admin/ops?tab=posts&co=${c}`,
    new:       (c) => `/admin/ops?tab=new&co=${c}`,
    past:      (c) => `/admin/ops?tab=past&co=${c}`,
    calls:     (c) => `/admin/calls?co=${c}`,
    jobs:      (c) => `/admin/jobs?co=${c}`,
    analytics: (c) => `/admin/analytics?co=${c}`,
    logs:      (c) => `/admin/logs?co=${c}`,
    site:      ()  => '/jobs',
  };
  const getHref = (key, c) => pageHref[key] ? pageHref[key](c) : `/admin/ops?tab=posts&co=${c}`;

  const nav = [
    { key: 'posts',     icon: '📋', label: '掲載管理' },
    { key: 'new',       icon: '🆕', label: '新規応募' },
    { key: 'past',      icon: '📚', label: '過去応募者' },
    { key: 'calls',     icon: '📞', label: '架電リスト' },
    { key: 'jobs',      icon: '💼', label: '求人管理' },
    { key: 'analytics', icon: '📈', label: '分析・レポート' },
    { key: 'logs',      icon: '📋', label: '投稿ログ' },
    { key: 'site',      icon: '🌐', label: '求人サイトを見る' },
  ].map(n => `<a href="${getHref(n.key, co)}" class="${n.key === active ? 'active' : ''}"><span class="nav-icon">${n.icon}</span>${n.label}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | 採用管理</title>
<link rel="stylesheet" href="/styles.css?v=${process.env.ASSET_VERSION || '1'}">
</head>
<body class="admin-layout">
<aside class="sidebar">
  <div class="sidebar-logo">
    <h1>採用管理システム</h1>
    <span>運用・架電管理</span>
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
<script src="/admin.js?v=${process.env.ASSET_VERSION || '1'}"></script>
</body>
</html>`;
}

function publicLayout(title, content, { description = '', jsonld = '', canonical = '', bare = false } = {}) {
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const canonicalUrl = canonical || siteUrl + '/jobs';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="google-site-verification" content="3jz3zHw23HzRLL6kianNdfBLtX-V9JZnXrN-YmkYNeU">
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:url" content="${canonicalUrl}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
${jsonld}
<link rel="stylesheet" href="/styles.css?v=${process.env.ASSET_VERSION || '1'}">
</head>
<body class="pub-body">
${bare ? '' : `<header class="pub-header">
  <div class="pub-header-inner">
    <a href="/jobs" class="pub-header-logo">採用情報</a>
    <nav class="pub-header-nav">
      <a href="/jobs">求人一覧</a>
    </nav>
  </div>
</header>`}
<main>
${content}
</main>
${bare ? '' : `<footer class="pub-footer">
  <div class="pub-footer-inner">
    <span>${esc(process.env.COMPANY_NAME || '採用企業')}</span>
    <a href="/privacy">プライバシーポリシー</a>
  </div>
</footer>`}
<div id="toast-container"></div>
<script src="/admin.js?v=${process.env.ASSET_VERSION || '1'}"></script>
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
function dashboardPage({ stats, lastPost, banRisk = {}, mediaBreakdown = [], todayKyujinbox = 0, todayStanby = 0, indeedRepostCount = 0, siteUrl = '', co = 'sq',
  TARGET_ACTIVE = parseInt(process.env.ROTATE_TARGET || '25', 10),
  ROTATE_AFTER_DAYS = parseInt(process.env.ROTATE_DAYS || '14', 10),
}) {
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

<div class="card mb-24">
  <div class="action-section-title" style="margin-bottom:16px">📅 今日の作業 <span class="text-muted text-sm" style="font-weight:400">（目標: 1日50件応募）</span></div>
  <div class="daily-tasks">
    ${[
      { label: '求人ボックス（目標25件/日）', done: todayKyujinbox, target: 25, alert: false },
      { label: 'スタンバイ（目標25件/日）',   done: todayStanby,    target: 25, alert: false },
      { label: 'Indeed 再掲載（3日ごと）',    done: indeedRepostCount, target: 1, alert: indeedRepostCount > 0 },
    ].map(({ label, done, target, alert }) => {
      const pct  = Math.min(100, Math.round(done / target * 100));
      const isDone = !alert && done >= target;
      const remain = alert
        ? (done > 0 ? `🔴 ${done}件が再掲載期限超過` : '✅ 全件OK')
        : isDone ? '✅ 完了' : `あと${target - done}件`;
      return `<div class="daily-task${alert && done > 0 ? ' daily-task-alert' : ''}">
        <div class="daily-task-label">${label}</div>
        <div class="daily-task-progress">
          <div class="daily-task-bar-wrap"><div class="daily-task-bar${alert && done > 0 ? ' bar-alert' : ''}" style="width:${pct}%"></div></div>
          <span class="daily-task-count">${done}${target > 1 ? '/' + target + '件' : '件'}</span>
        </div>
        <div class="daily-task-remain ${isDone || (alert && done === 0) ? 'task-done' : alert ? 'task-alert-text' : ''}">${remain}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="margin-top:14px;font-size:13px;color:#64748b">
    ✨ <a href="/admin/jobs" style="color:#7c3aed">求人管理</a> でAI一括生成 → 媒体を選択して公開すると件数が更新されます
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
      <div class="action-section-title">🔄 求人ローテーション <span class="text-muted text-sm">（常時${TARGET_ACTIVE}件維持・${ROTATE_AFTER_DAYS}日で交代）</span></div>
      <div class="btn-group" style="align-items:center;flex-wrap:wrap;gap:8px">
        <button class="btn btn-primary" onclick="runRotation()" id="btn-rotate">
          🔄 今すぐローテーション実行
        </button>
        <span class="text-sm text-muted">月・水・金 9時に自動実行</span>
      </div>
      <div id="rotation-result" class="text-sm" style="margin-top:8px;white-space:pre-wrap;background:#f8fafc;border-radius:6px;padding:8px;display:none"></div>
    </div>

    <!-- AI求人自動生成セクション（無効化中） -->

    <div class="action-section mt-16">
      <div class="action-section-title">📡 媒体運用</div>

      <div class="media-op-section">
        <div class="media-op-label">求人ボックス <span class="text-muted text-sm">（スクレイピング投稿・VPN必須）</span></div>
        <div class="btn-group" style="align-items:center">
          <label style="font-size:12px;color:#64748b;white-space:nowrap">1回の投稿数:</label>
          <select id="kb-batch-size" class="form-input" style="width:70px;padding:4px 8px;font-size:13px">
            <option value="3">3件</option>
            <option value="5" selected>5件</option>
            <option value="8">8件</option>
            <option value="10">10件</option>
          </select>
          <button id="btn-post-kyujinbox" class="btn btn-warning" onclick="startPostKyujinbox()">
            🚀 求人ボックスに投稿する（未投稿のみ）
          </button>
          <button id="btn-post-kyujinbox-force" class="btn btn-ghost btn-sm" onclick="startPostKyujinboxForce()" title="投稿済み求人も含めて全件投稿">
            🔄 強制再投稿
          </button>
          <button class="btn btn-ghost btn-sm" onclick="resetKyujinboxPosted()" title="投稿済みフラグをリセット">
            ♻️ フラグリセット
          </button>
        </div>
        <div class="text-sm text-muted" style="margin-top:4px">目標25件/日 → 5件 × 5回（数時間おきに実行）／1度投稿した求人は次回スキップ</div>
        <div id="progress-kyujinbox-wrap" class="progress-wrap hidden">
          <div id="progress-kyujinbox" class="progress-box"></div>
        </div>
      </div>

      <div class="media-op-section mt-14">
        <div class="media-op-label">スタンバイ <span class="text-muted text-sm">（XMLフィード自動連携）</span></div>
        <div class="feed-url-row">
          <code class="feed-url-code" id="feed-url-stanby">${siteUrl}/api/feed/stanby</code>
          <button class="btn btn-ghost btn-sm" onclick="copyFeedUrl('stanby')">コピー</button>
          <button class="btn btn-ghost btn-sm" onclick="downloadXML('stanby')">DL</button>
        </div>
        <div class="text-sm text-muted" style="margin-top:4px">このURLをスタンバイ管理画面の「XMLフィード」に登録してください</div>
      </div>

      <div class="media-op-section mt-14">
        <div class="media-op-label">Googleしごと検索 <span class="text-muted text-sm">（JSON-LD自動掲載・掲載7日で自動除外）</span></div>
        <div class="btn-group">
          <button class="btn btn-ghost btn-sm" onclick="expireGoogleJobs()" title="掲載から7日経過した求人をGoogleしごと検索から除外">
            🗑️ 7日経過求人をGoogle除外（手動）
          </button>
        </div>
        <div class="text-sm text-muted" style="margin-top:4px">公開求人に自動掲載。掲載7日後にGoogleしごと検索から除外されます（毎時自動チェック）</div>
      </div>

      <div class="media-op-section mt-14">
        <div class="media-op-label">Indeed <span class="text-muted text-sm">（手動掲載・3日ごとに再掲載）</span></div>
        <div class="btn-group">
          <button id="btn-post-indeed" class="btn btn-warning btn-sm" onclick="startPostIndeed()">
            🚀 Indeed に掲載する
          </button>
          ${indeedRepostCount > 0 ? `<span class="badge" style="background:#fee2e2;color:#b91c1c;padding:4px 10px;border-radius:20px;font-size:12px">🔴 ${indeedRepostCount}件が再掲載期限超過</span>` : '<span style="font-size:12px;color:#16a34a">✅ 全件OK</span>'}
        </div>
        <div id="progress-indeed-post-wrap" class="progress-wrap hidden">
          <div id="progress-indeed-post" class="progress-box"></div>
        </div>
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
  return adminLayout('ダッシュボード', content, 'dashboard', co);
}

// ── Admin Jobs ──
function adminJobsPage(jobs, co = 'sq') {
  const coKeys = Object.keys(COMPANIES);
  const coTabs = coKeys.map(c =>
    `<a href="/admin/jobs?co=${c}" class="call-co-tab ${c === co ? 'active' : ''}" style="${c === co ? 'background:' + COMPANIES[c].color + ';border-color:' + COMPANIES[c].color : ''}">${COMPANIES[c].label}</a>`
  ).join('');

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
<div class="call-co-tabs">${coTabs}</div>
<div class="card">
  <div style="padding:10px 16px 2px;font-size:13px;color:#64748b">${COMPANIES[co]?.label || co} の求人 <strong>${jobs.length}件</strong></div>
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
<input type="hidden" id="jobs-current-co" value="${esc(co)}">
${jobModalHTML()}
${bulkModalHTML()}`;
  return adminLayout('求人管理', content, 'jobs', co);
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
      <div class="form-group" style="grid-column:1/-1">
        <label>勤務地（複数可・選択制・車通勤可）<span class="req">*</span></label>
        <div id="jf-locations-chips" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 8px;min-height:36px;border:1px solid #d1ccc0;border-radius:8px;background:#faf8f3;margin-bottom:6px;"></div>
        <div style="display:flex;gap:6px">
          <input type="text" id="jf-location-input" placeholder="例: 大阪府大阪市北区芝田" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();addJobLocation();}">
          <button type="button" onclick="addJobLocation()" style="padding:8px 14px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap">追加</button>
        </div>
        <input type="hidden" id="jf-location">
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
    <details class="form-group" style="margin-top:4px;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px">
      <summary style="font-weight:600;cursor:pointer;color:#1e40af">求人ボックス必須項目（展開して入力）</summary>
      <p class="text-sm text-muted" style="margin:6px 0 12px">求人ボックスへ自動投稿するには以下の項目が必要です。各130文字以内。</p>
      <div class="form-group">
        <label>やりがい <span class="req">*</span><span class="text-muted text-sm">（例: 多くのお客様に喜ばれるやりがいのある仕事です / 130字以内）</span></label>
        <textarea id="jf-rewarding" rows="3" maxlength="140" placeholder="例: 毎日多くのお客様に感謝されるやりがいのある仕事です。未経験でも研修で成長できます。"></textarea>
      </div>
      <div class="form-group">
        <label>勤務時間・休日 <span class="req">*</span><span class="text-muted text-sm">（130字以内）</span></label>
        <textarea id="jf-worktime" rows="3" maxlength="140" placeholder="例: 9:00〜18:00（実働8時間）　週休2日制（土日祝）　年間休日120日"></textarea>
      </div>
      <div class="form-group">
        <label>アクセス <span class="req">*</span><span class="text-muted text-sm">（130字以内）</span></label>
        <textarea id="jf-transportation" rows="2" maxlength="140" placeholder="例: JR大阪駅より徒歩5分、または車通勤OK（駐車場完備）"></textarea>
      </div>
      <div class="form-group">
        <label>応募方法</label>
        <textarea id="jf-how-to-apply" rows="2" placeholder="例: 下記URLよりWebでご応募ください。書類選考後にご連絡いたします。"></textarea>
      </div>
    </details>
    <div class="form-group" style="margin-top:4px">
      <label style="font-weight:600;display:block;margin-bottom:8px">配信媒体 <span class="text-muted text-sm" style="font-weight:400">（1媒体のみ・重複掲載を防ぎます）</span></label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <label class="media-radio-label"><input type="radio" name="jf-media" value=""> なし</label>
        <label class="media-radio-label"><input type="radio" name="jf-media" value="自社サイト"> 自社サイト</label>
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
function adminApplicantsPage(applicants, filter = 'all', co = 'sq') {
  const statusList = ['all','新規','未対応','架電済','面談済','紹介済','NG','重複'];
  const chips = statusList.map(s =>
    `<span class="filter-chip ${s === filter ? 'active' : ''}" onclick="location.href='/admin/applicants?status=${s}&co=${co}'">${s === 'all' ? 'すべて' : s}</span>`
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
    <button id="btn-csv-export" class="btn btn-ghost" onclick="exportCSV('${co}')">📤 この会社のCSV出力</button>
    <button class="btn btn-primary" onclick="exportCSV('all')" title="Social Quality + Life Tailor を合算してCSV出力">📊 全社合算CSV出力</button>
  </div>
</div>
<div class="card mb-16">
  <div class="action-section-title">📤 リスト出力</div>
  <div class="btn-group flex-wrap">
    <button class="btn btn-primary btn-sm" onclick="exportList('new')">① 新規リスト出力</button>
    <div class="flex items-center gap-8">
      <input type="month" id="export-month" class="input-sm" value="${new Date().toISOString().slice(0,7)}">
      <button class="btn btn-ghost btn-sm" onclick="exportList('monthly')">② 月次全応募者出力</button>
      <button class="btn btn-warning btn-sm" onclick="exportList('ng')">③ 月次NGリスト出力</button>
    </div>
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
  return adminLayout('応募者管理', content, 'applicants', co);
}

// ── Admin Logs ──
function adminLogsPage(logs, co = 'sq') {
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
  return adminLayout('投稿ログ', content, 'logs', co);
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

  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const jobUrl  = `${siteUrl}/jobs/${job.id}`;

  // 都道府県を location 文字列から抽出（Google Jobs: addressRegion）
  const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
  const addressRegion = PREFS.find(p => job.location.includes(p)) || '';

  // validThrough: DB に expires_at があればその値、なければ掲載日から60日後
  const datePosted = (job.published_at || job.created_at || '').slice(0, 10);
  const validThrough = job.expires_at
    ? job.expires_at.slice(0, 10)
    : (() => {
        const d = new Date(datePosted || Date.now());
        d.setDate(d.getDate() + 60);
        return d.toISOString().slice(0, 10);
      })();

  const jsonldObj = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description,
    "url": jobUrl,
    "identifier": { "@type": "PropertyValue", "name": process.env.COMPANY_NAME || "採用企業", "value": job.id },
    "datePosted": datePosted,
    "validThrough": validThrough,
    "directApply": true,
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
        ...(addressRegion ? { "addressRegion": addressRegion } : {}),
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
          <input type="hidden" name="sourceMedia" id="apply-source-media" value="direct">
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
</div>
<script>
(function(){
  // Googleしごと検索・Google広告からの流入を検知してsourceMediaをセット
  const field = document.getElementById('apply-source-media');
  if (!field) return;
  const params = new URLSearchParams(window.location.search);
  const utmSource = (params.get('utm_source') || '').toLowerCase();
  const ref = (document.referrer || '').toLowerCase();
  if (utmSource.includes('google') || ref.includes('google.com')) {
    field.value = 'google';
  }
})();
</script>`;

  return publicLayout(`${esc(job.title)} | 求人詳細`, content, {
    description: `${job.location}・${job.salary}・${job.employment_type}。${job.description.slice(0, 100)}`,
    jsonld,
    canonical: `${siteUrl}/jobs/${job.id}`
  });
}

// ── 新デザイン採用トップページ（イーストアジア風・プレビュー用） ──────────
// /preview/top で表示。
function topPageV2(jobs) {
  const companyName = process.env.COMPANY_NAME || '株式会社Social Quality';
  // ヘッダーロゴ: 本体サイト(social-quality.com)のワードマーク「Social.Quality」に合わせる。
  // 株式会社などの法人格を外し、語間をドットで連結（例: Social Quality → Social.Quality）。
  const brandNoPrefix = companyName.replace(/^(株式会社|有限会社|合同会社)\s*/, '');
  const brandParts = brandNoPrefix.split(/\s+/).filter(Boolean);
  const logoHtml = brandParts.length >= 2
    ? `${esc(brandParts[0])}<span class="et-logo-dot">.</span>${esc(brandParts.slice(1).join(''))}`
    : esc(brandNoPrefix);
  const PREFS =['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

  const typeCounts = {};
  const prefCounts = {};
  for (const j of jobs) {
    typeCounts[j.job_type] = (typeCounts[j.job_type] || 0) + 1;
    const locs = (() => { try { return JSON.parse(j.locations || '[]'); } catch { return []; } })();
    const descLocMatch = !locs.length && (j.description || '').match(/【所在地】([^\n【]*)/);
    const descLoc = descLocMatch ? descLocMatch[1].trim() : '';
    const allLocs = locs.length ? locs : [descLoc || j.location || ''];
    const seenPrefs = new Set();
    for (const loc of allLocs) {
      const p = PREFS.find(pf => (loc || '').includes(pf));
      if (p && !seenPrefs.has(p)) { seenPrefs.add(p); prefCounts[p] = (prefCounts[p] || 0) + 1; }
    }
  }
  const typeIcon = t => {
    if (/配送|ドライバー/.test(t)) return '🚚';
    if (/製造|工場/.test(t)) return '🏭';
    if (/倉庫|軽作業/.test(t)) return '📦';
    if (/営業/.test(t)) return '💼';
    if (/カウンセラー|アドバイザー|事務/.test(t)) return '💬';
    if (/介護|看護/.test(t)) return '🤝';
    return '👷';
  };
  const typeCards = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([t, c]) => `<a href="/preview/jobs?q=${encodeURIComponent(t)}" class="et-typecard">
      <div class="et-typecard-icon">${typeIcon(t)}</div>
      <div class="et-typecard-label">${esc(t)}<span>${c}件</span></div>
    </a>`).join('');

  const areaList = Object.entries(prefCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([p, c]) => `<details class="et-areabox">
      <summary>${esc(p)}（${c}件）</summary>
      <div class="et-areabox-body"><a href="/preview/jobs?q=${encodeURIComponent(p)}">${esc(p)}の求人を見る →</a></div>
    </details>`).join('');

  const voices = [
    {
      no: '01', meta: '配送ドライバー / 入社2年目 / 20代男性',
      title: '未経験でも3ヶ月で一人前になれました',
      text: '前職は飲食店。体力には自信がありましたが、ドライバー経験は全くゼロでした。入社後は先輩が丁寧にルートを教えてくれて、焦らず覚えることができました。今では担当エリアを一人でこなせるようになり、お客様に「ありがとう」と言われるのが毎日の励みです。',
      before: '飲食店スタッフ → 配送ドライバー',
    },
    {
      no: '02', meta: '軽作業スタッフ / 入社1年目 / 40代女性',
      title: 'ブランクがあっても温かく迎えてもらえた',
      text: '子育てで10年ほどブランクがあり、再就職に不安を感じていました。面接時から担当者がとても親切で、シフトの相談にも柔軟に対応してもらえました。職場のメンバーも年代がバラバラで、みんなが気にかけてくれる雰囲気。無理なく続けられています。',
      before: '専業主婦（10年）→ 軽作業スタッフ',
    },
    {
      no: '03', meta: '送迎ドライバー / 入社4年目 / 50代男性',
      title: '「ありがとう」が毎日もらえる仕事',
      text: 'デイサービスの送迎を担当しています。最初は福祉の仕事に縁がないと思っていましたが、利用者の方々と顔見知りになり、「今日も来てくれてよかった」と言ってもらえるのが何より嬉しいです。運転が好きな人にはとても向いている仕事だと思います。',
      before: '長距離トラック運転手 → 送迎ドライバー',
    },
  ].map(v => `<div class="et-voice">
      <div class="et-voice-no">${v.no}<span class="et-voice-slash"></span></div>
      <div class="et-voice-meta">${esc(v.meta)}</div>
      <div class="et-voice-title">${esc(v.title)}</div>
      <div class="et-voice-text">${esc(v.text)}</div>
      <div class="et-voice-before"><span>BEFORE</span>${esc(v.before)}</div>
    </div>`).join('');

  const features = [
    { icon: '🎓', t: '資格取得支援', d: '業務に必要な資格は費用会社負担で取得できます。フォークリフト・危険物など、キャリアに活かせる資格多数。' },
    { icon: '🏅', t: '正社員登用制度', d: '長期的なキャリア形成が見込めます。実績・勤務態度に応じて積極的に登用しています。' },
    { icon: '🛡️', t: '社会保険完備', d: '健康保険・厚生年金・雇用保険・労災保険を完備。安心して長く働ける環境です。' },
    { icon: '🗾', t: '多彩な職種と勤務地', d: '配送・製造・倉庫など多彩な職種を全国で募集中。あなたに合った働き方が見つかります。' },
  ].map(f => `<div class="et-feature">
      <div class="et-feature-icon">${f.icon}</div>
      <div class="et-feature-t">${esc(f.t)}</div>
      <div class="et-feature-d">${esc(f.d)}</div>
    </div>`).join('');

  const flow = [
    { t: '応募', d: 'WEBからお申し込みください。24時間いつでも受付しています♪' },
    { t: '面接日決定', d: '応募確認後、担当者よりご連絡し面接日を決定します！' },
    { t: 'オンライン面接', d: 'ご自宅からビデオ通話で面接を実施します。リラックスしてご参加ください。' },
    { t: '合否連絡', d: '面接後、数日以内に合否のご連絡をいたします！採用後の日程もご案内♪' },
  ].map((s, i) => `<div class="et-step">
      <div class="et-step-no">STEP ${i + 1}</div>
      <div class="et-step-t">${esc(s.t)}</div>
      <div class="et-step-d">${esc(s.d)}</div>
    </div>`).join('');

  const faqs = [
    { q: '異業種からの転職でも大丈夫でしょうか？', a: 'はい、大丈夫です。未経験から始めたスタッフが多数活躍しています。研修・OJTで丁寧にサポートします。' },
    { q: '家庭の事情で扶養内でお仕事をしたいのですが可能でしょうか？', a: '職種・勤務地によって柔軟に対応可能です。面接時にご希望をお聞かせください。' },
    { q: '契約社員から正社員を目指すことはできますか？', a: 'はい、正社員登用制度があります。実績・勤務態度に応じて積極的に登用しています。' },
    { q: '働きながら資格を取得できますか？', a: '資格取得支援制度があり、フォークリフトなど業務に必要な資格は会社負担で取得できます。' },
    { q: '交通費は支給されますか？', a: 'はい、規定内で支給いたします。詳細は各求人の募集要項をご確認ください。' },
  ].map(f => `<details class="et-faq">
      <summary><span class="et-faq-qmark">Q</span>${esc(f.q)}</summary>
      <div class="et-faq-a">${esc(f.a)}</div>
    </details>`).join('');

  const content = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800;900&display=swap');
  /* Social Quality HP準拠: クリーム背景・黒・赤アクセント・書体=Noto Sans JP */
  body.pub-body { background: #f4f1ea; font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; }
  .et-head { background: rgba(244,241,234,.95); backdrop-filter: blur(6px); border-bottom: 1px solid #e4dfd4; position: sticky; top: 0; z-index: 50; }
  .et-head-in { max-width: 1080px; margin: 0 auto; display: flex; align-items: center; gap: 8px; padding: 0 20px; flex-wrap: wrap; }
  .et-logo { font-size: 22px; font-weight: 900; color: #111; letter-spacing: -.01em; padding: 14px 0; margin-right: auto; white-space: nowrap; }
  .et-logo-dot { color: #e0371f; }
  .et-nav { display: flex; flex-wrap: wrap; align-items: center; }
  .et-nav a { font-size: 13px; font-weight: 600; color: #111; text-decoration: none; padding: 14px 12px; }
  .et-nav a:hover { color: #e0371f; }
  .et-nav a.et-pill { background: #111; color: #fff; border-radius: 999px; padding: 9px 24px; margin-left: 10px; }
  .et-nav a.et-pill:hover { background: #e0371f; color: #fff; }
  /* ヒーロー */
  .et-hero { position: relative; background: #f4f1ea; overflow: hidden; padding: 80px 20px 64px; }
  .et-hero::before { content: ''; position: absolute; top: -160px; right: -100px; width: 520px; height: 520px; background: radial-gradient(circle, rgba(236,118,88,.38), rgba(244,241,234,0) 64%); pointer-events: none; }
  .et-hero-in { max-width: 1080px; margin: 0 auto; position: relative; display: flex; align-items: flex-start; gap: 40px; }
  .et-hero-text { flex: 0 0 52%; min-width: 0; }
  .et-hero-imgs { flex: 1; position: relative; height: 380px; }
  .et-hi { position: absolute; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 48px rgba(0,0,0,.18); }
  .et-hi img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .et-hi-1 { width: 230px; height: 172px; top: 0; left: 0; z-index: 3; }
  .et-hi-2 { width: 215px; height: 161px; top: 110px; left: 170px; z-index: 2; }
  .et-hi-3 { width: 222px; height: 167px; top: 210px; left: 30px; z-index: 1; }
  @media (max-width: 760px) { .et-hero-imgs { display: none; } .et-hero-text { flex: 1; } }
  .et-hero-label { color: #e0371f; font-size: 12px; font-weight: 700; letter-spacing: .22em; margin-bottom: 24px; display: flex; align-items: center; gap: 14px; }
  .et-hero-label::before { content: ''; width: 34px; height: 2px; background: #e0371f; display: block; flex-shrink: 0; }
  .et-hero h1 { font-size: 58px; font-weight: 900; color: #111; line-height: 1.28; letter-spacing: -.01em; margin: 0 0 22px; }
  .et-hero h1 .red { color: #e0371f; }
  .et-hero-lead { font-size: 14px; color: #4a4a4a; line-height: 2.1; margin: 0 0 32px; max-width: 560px; }
  .et-btn { display: inline-flex; align-items: center; gap: 10px; border-radius: 999px; font-size: 14px; font-weight: 700; padding: 14px 34px; text-decoration: none; transition: all .2s; }
  .et-btn.black { background: #111; color: #fff; }
  .et-btn.black:hover { background: #e0371f; }
  .et-btn.line { border: 1.5px solid #111; color: #111; }
  .et-btn.line:hover { background: #111; color: #fff; }
  /* 黒マーキー帯 */
  .et-marquee { background: #111; overflow: hidden; padding: 15px 0; }
  .et-marquee-track { display: flex; white-space: nowrap; width: max-content; animation: etMarquee 24s linear infinite; }
  .et-marquee span { color: #f4f1ea; font-size: 19px; font-weight: 800; letter-spacing: .14em; padding: 0 16px; }
  .et-marquee span.sl { color: #e0371f; padding: 0 4px; }
  @keyframes etMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  /* セクション共通 */
  .et-sec { max-width: 1080px; margin: 0 auto; padding: 76px 20px 8px; }
  .et-h2 { font-size: 32px; font-weight: 800; color: #111; margin: 0; letter-spacing: .04em; display: flex; align-items: center; gap: 16px; }
  .et-h2::before { content: '—'; color: #e0371f; font-weight: 700; }
  .et-h2::after { content: none; }
  .et-h2sub { color: #e0371f; font-size: 12px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; margin: 8px 0 36px 40px; }
  /* 職種タブ（4固定） */
  .et-jobtabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .et-jobtab { background: #fff; border-radius: 18px; overflow: hidden; text-decoration: none; box-shadow: 0 1px 3px rgba(0,0,0,.06); transition: transform .25s, box-shadow .25s; display: flex; flex-direction: column; align-items: center; padding: 28px 16px 22px; }
  .et-jobtab:hover { transform: translateY(-5px); box-shadow: 0 14px 30px rgba(0,0,0,.10); }
  .et-jobtab-icon { font-size: 48px; margin-bottom: 10px; }
  .et-jobtab-name { font-size: 15px; font-weight: 800; color: #111; margin-bottom: 6px; text-align: center; }
  .et-jobtab-desc { font-size: 11.5px; color: #777; text-align: center; line-height: 1.7; }
  @media (max-width: 640px) { .et-jobtabs { grid-template-columns: repeat(2, 1fr); } }
  /* エリア */
  .et-areachips { display: flex; flex-wrap: wrap; gap: 12px; }
  .et-areachip { background: #fff; border: 1.5px solid #111; border-radius: 999px; color: #111; font-size: 14px; font-weight: 700; padding: 11px 30px; text-decoration: none; transition: all .2s; }
  .et-areachip:hover { background: #111; color: #fff; }
  /* スタッフの一言 */
  .et-voices { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 22px; }
  .et-voices { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 22px; }
  .et-voice { background: #fff; border-radius: 18px; padding: 26px 24px; box-shadow: 0 1px 3px rgba(0,0,0,.05); display: flex; flex-direction: column; }
  .et-voice-no { font-family: Georgia, serif; font-style: italic; font-size: 50px; color: #e0371f; font-weight: 700; line-height: 1; position: relative; display: inline-block; padding-right: 24px; margin-bottom: 14px; }
  .et-voice-slash { position: absolute; right: 0; top: 4px; bottom: -4px; width: 2px; background: #111; transform: rotate(20deg); }
  .et-voice-meta { display: inline-block; background: #111; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 14px; border-radius: 999px; margin-bottom: 12px; }
  .et-voice-title { font-size: 16px; font-weight: 800; color: #111; line-height: 1.6; margin-bottom: 10px; }
  .et-voice-text { font-size: 13.5px; color: #444; line-height: 2; margin-bottom: 16px; flex: 1; }
  .et-voice-before { margin-top: auto; border-top: 1px solid #efece4; padding-top: 12px; font-size: 12px; color: #777; display: flex; align-items: center; gap: 8px; }
  .et-voice-before span { background: #e0371f; color: #fff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; flex-shrink: 0; letter-spacing: .06em; }
  /* 会社の特徴 */
  .et-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .et-feature { background: #fff; border: none; border-radius: 18px; padding: 28px 24px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
  .et-feature-icon { font-size: 40px; margin-bottom: 10px; }
  .et-feature-t { font-size: 15.5px; font-weight: 800; color: #111; margin-bottom: 8px; }
  .et-feature-d { font-size: 12.5px; color: #555; line-height: 1.9; text-align: left; }
  /* 応募の流れ（黒帯） */
  .et-flowband { background: #111; margin-top: 76px; padding: 64px 20px 70px; position: relative; overflow: hidden; }
  .et-flowband::before { content: ''; position: absolute; left: -80px; top: -60px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(224,55,31,.3), transparent 65%); }
  .et-flowband .et-h2 { color: #f4f1ea; }
  .et-flowband .et-h2sub { color: #e0371f; }
  .et-flow-in { max-width: 1080px; margin: 0 auto; position: relative; }
  .et-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
  .et-step { background: #1d1d1d; border-radius: 16px; padding: 24px 18px; text-align: center; }
  .et-step-no { font-family: Georgia, serif; font-style: italic; color: #e0371f; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
  .et-step-t { font-size: 16px; font-weight: 700; color: #f4f1ea; margin-bottom: 8px; }
  .et-step-d { font-size: 12.5px; color: #aaa; line-height: 1.8; }
  /* FAQ */
  .et-faq { background: #fff; border-radius: 14px; margin-bottom: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
  .et-faq summary { color: #111; font-size: 14px; font-weight: 700; padding: 16px 20px; cursor: pointer; list-style: none; display: flex; align-items: center; gap: 12px; }
  .et-faq summary::-webkit-details-marker { display: none; }
  .et-faq summary::after { content: '＋'; margin-left: auto; font-weight: 700; color: #e0371f; }
  .et-faq[open] summary::after { content: '−'; }
  .et-faq-qmark { background: #e0371f; color: #fff; font-weight: 800; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .et-faq-a { background: #fff; border-top: 1px solid #efece4; padding: 14px 20px 16px 58px; font-size: 13.5px; color: #444; line-height: 1.9; }
  /* 下部CTA（黒の角丸カード） */
  .et-ctaband { background: #111; border-radius: 28px; max-width: 1040px; margin: 76px auto 0; padding: 52px 36px; }
  .et-ctaband-in { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
  .et-ctabtn { display: inline-block; border: 1.5px solid #fff; border-radius: 999px; color: #fff; font-size: 14px; font-weight: 700; padding: 14px 44px; text-decoration: none; letter-spacing: .08em; transition: all .2s; }
  .et-ctabtn:hover { background: #fff; color: #111; }
  .et-ctabtn.orange { background: #e0371f; border-color: #e0371f; }
  .et-ctabtn.orange:hover { background: #c12c16; color: #fff; }
  .et-footer { background: #111; color: #999; font-size: 12px; text-align: center; padding: 30px 16px; margin-top: 30px; }
  .et-footer a { color: #ccc; text-decoration: none; margin: 0 12px; }
  @media (max-width: 640px) {
    .et-hero h1 { font-size: 34px; line-height: 1.3; }
    .et-h2 { font-size: 22px; }
    .et-h2sub { margin-left: 34px; }
    .et-marquee span { font-size: 15px; }
  }
</style>
<header class="et-head">
  <div class="et-head-in">
    <div class="et-logo">${logoHtml}</div>
    <nav class="et-nav">
      <a href="#type">職種から探す</a>
      <a href="#area">エリアから探す</a>
      <a href="#voice">スタッフの一言</a>
      <a href="#about">会社の特徴</a>
      <a href="#company">企業情報</a>
      <a href="#faq">よくある質問</a>
      <a class="et-pill" href="/preview/jobs">応募はこちら</a>
    </nav>
  </div>
</header>
<div class="et-hero">
  <div class="et-hero-in">
    <div class="et-hero-text">
      <div class="et-hero-label">RECRUIT INFORMATION — ${esc(companyName)}</div>
      <h1><span class="red">あなたらしく</span>、<br>働ける場所。</h1>
      <p class="et-hero-lead">配送・製造・倉庫内作業など、全国の正社員求人を多数掲載。未経験からでも安心して始められる環境と、頑張りがきちんと評価される待遇をご用意しています。</p>
      <a class="et-btn black" href="/preview/jobs">お仕事一覧を見る →</a>
      <a class="et-btn line" href="#flow" style="margin-left:10px">応募の流れ</a>
    </div>
    <div class="et-hero-imgs">
      <div class="et-hi et-hi-1">
        <img src="/images/it-office.jpg" alt="IT職種" loading="lazy">
      </div>
      <div class="et-hi et-hi-2">
        <img src="/images/haisou-fleet.jpg" alt="配送ドライバー職種" loading="lazy">
      </div>
      <div class="et-hi et-hi-3">
        <img src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=444&h=333&q=80" alt="製造・工場職種" loading="lazy">
      </div>
    </div>
  </div>
</div>
<div class="et-marquee">
  <div class="et-marquee-track">
    <span>IT・エンジニア</span><span class="sl">/</span><span>製造・工場</span><span class="sl">/</span><span>送迎ドライバー</span><span class="sl">/</span><span>配送ドライバー</span><span class="sl">/</span><span>FULL-TIME JOBS</span><span class="sl">/</span><span>未経験歓迎</span><span class="sl">/</span><span>NATIONWIDE RECRUIT</span><span class="sl">/</span>
    <span>IT・エンジニア</span><span class="sl">/</span><span>製造・工場</span><span class="sl">/</span><span>送迎ドライバー</span><span class="sl">/</span><span>配送ドライバー</span><span class="sl">/</span><span>FULL-TIME JOBS</span><span class="sl">/</span><span>未経験歓迎</span><span class="sl">/</span><span>NATIONWIDE RECRUIT</span><span class="sl">/</span>
  </div>
</div>
<section class="et-sec" id="type">
  <h2 class="et-h2">職種から探す</h2>
  <div class="et-h2sub">Search by job</div>
  <div class="et-jobtabs">
    <a class="et-jobtab" href="/preview/jobs?type=IT">
      <div class="et-jobtab-icon">💻</div>
      <div class="et-jobtab-name">IT</div>
    </a>
    <a class="et-jobtab" href="/preview/jobs?type=製造">
      <div class="et-jobtab-icon">🏭</div>
      <div class="et-jobtab-name">製造・工場</div>
    </a>
    <a class="et-jobtab" href="/preview/jobs?type=送迎">
      <div class="et-jobtab-icon">🚐</div>
      <div class="et-jobtab-name">送迎ドライバー</div>
    </a>
    <a class="et-jobtab" href="/preview/jobs?type=配送">
      <div class="et-jobtab-icon">🚚</div>
      <div class="et-jobtab-name">配送ドライバー</div>
    </a>
  </div>
</section>
<section class="et-sec" id="area">
  <h2 class="et-h2">エリアから探す</h2>
  <div class="et-h2sub">Search by area</div>
  <div class="et-areachips">
    <a href="/preview/jobs?q=${encodeURIComponent('東京都')}" class="et-areachip">東京都</a>
    <a href="/preview/jobs?q=${encodeURIComponent('神奈川県')}" class="et-areachip">神奈川県</a>
    <a href="/preview/jobs?q=${encodeURIComponent('埼玉県')}" class="et-areachip">埼玉県</a>
    <a href="/preview/jobs?q=${encodeURIComponent('千葉県')}" class="et-areachip">千葉県</a>
    <a href="/preview/jobs?q=${encodeURIComponent('大阪府')}" class="et-areachip">大阪府</a>
    <a href="/preview/jobs?q=${encodeURIComponent('兵庫県')}" class="et-areachip">兵庫県</a>
    <a href="/preview/jobs?q=${encodeURIComponent('京都府')}" class="et-areachip">京都府</a>
    <a href="/preview/jobs?q=${encodeURIComponent('和歌山県')}" class="et-areachip">和歌山県</a>
  </div>
</section>
<section class="et-sec" id="voice">
  <h2 class="et-h2">働く人の声</h2>
  <div class="et-h2sub">Staff Voice</div>
  <div class="et-voices">${voices}</div>
</section>
<section class="et-sec" id="about">
  <h2 class="et-h2">選ばれる理由</h2>
  <div class="et-h2sub">Why choose us</div>
  <div class="et-features">${features}</div>
</section>
<section class="et-sec" id="company">
  <h2 class="et-h2">企業情報</h2>
  <div class="et-h2sub">About us</div>
  <div class="et-company-card">
    <p class="et-company-lead">${esc(companyName)}は、<strong>Webサイト制作・システム / アプリ / AI開発を主力</strong>に、マーケティング支援から物流・配送、製造まで幅広く事業を展開する会社です。</p>
    <p class="et-company-text">ひとつの専門にとどまらず、企画から開発・運用、現場での実行までを自社で一貫して手がけることで、お客様の「やりたい」を形にしています。事業領域を横断して連携できる体制こそが、私たちの強みです。</p>

    <div class="et-mvv">
      <div class="et-mvv-item">
        <div class="et-mvv-label">MISSION<span>使命</span></div>
        <div class="et-mvv-title">つくる力で、人と企業の可能性を解き放つ。</div>
        <div class="et-mvv-text">Web・アプリ・AIの開発力を軸に、人と企業の「できる」を増やす。テクノロジーと創造力で、まだ無い価値を生み出していきます。</div>
      </div>
      <div class="et-mvv-item">
        <div class="et-mvv-label">VISION<span>目指す姿</span></div>
        <div class="et-mvv-title">確かな価値を提供できる企業へ。</div>
        <div class="et-mvv-text">デジタルの力で誰もが自分らしく活躍できる場をつくり、お客様・働く仲間・社会に、確かな価値を届け続ける企業を目指します。</div>
      </div>
      <div class="et-mvv-item">
        <div class="et-mvv-label">VALUE<span>価値観</span></div>
        <div class="et-mvv-title">挑戦を楽しむ・本質にこだわる・仲間を信じる。</div>
        <div class="et-mvv-text">前例がなくてもまず挑む。流行ではなく本質的な価値にこだわる。立場を越えて仲間を信じ、チームで大きな成果をつくります。</div>
      </div>
    </div>

    <div class="et-biz">
      <div class="et-biz-col">
        <div class="et-biz-head"><span class="et-biz-badge main">MAIN</span>メイン事業</div>
        <ul class="et-biz-list">
          <li><b>Web制作・システム / アプリ / AI開発</b><span>企画・設計から開発・運用まで自社一貫</span></li>
          <li><b>マーケティング・販促支援</b><span>集客から採用広報まで成果ベースで支援</span></li>
          <li><b>自社プロダクト / SaaS開発</b><span>現場の課題から生まれた仕組みを製品化</span></li>
          <li><b>AI・DXソリューション</b><span>生成AIを活用した業務効率化・自動化支援</span></li>
        </ul>
      </div>
      <div class="et-biz-col">
        <div class="et-biz-head"><span class="et-biz-badge next">NEXT</span>これから展開していく事業</div>
        <ul class="et-biz-list next">
          <li><b>物流・配送</b><span>EC配送・ルート配送を全国エリアで展開</span></li>
          <li><b>製造・倉庫管理</b><span>工場内作業・軽作業・倉庫運営を受託</span></li>
          <li><b>EC・物流プラットフォーム</b><span>自社配送網を活かした通販・物流サービスの展開</span></li>
          <li><b>全国エリアの事業拡大</b><span>物流・製造拠点を主要都市へ順次拡大</span></li>
        </ul>
      </div>
    </div>
  </div>
</section>
<div class="et-flowband" id="flow">
  <div class="et-flow-in">
    <h2 class="et-h2">応募から採用までの流れ</h2>
    <div class="et-h2sub">About The Flow</div>
    <div class="et-steps">${flow}</div>
  </div>
</div>
<section class="et-sec" id="faq">
  <h2 class="et-h2">よくある質問</h2>
  <div class="et-h2sub">Q and A</div>
  ${faqs}
</section>
<div class="et-ctaband">
  <h2 style="color:#fff;font-size:26px;font-weight:800;text-align:center;margin:0 0 8px;letter-spacing:.04em">あなたの次の仕事、ここにある。</h2>
  <p style="color:#aaa;font-size:13px;text-align:center;margin:0 0 24px">まずはお気軽に求人一覧をご覧ください</p>
  <div class="et-ctaband-in">
    <a class="et-ctabtn" href="/preview/jobs">お仕事一覧へ</a>
    <a class="et-ctabtn orange" href="/preview/jobs">今すぐ応募する</a>
  </div>
</div>
<div class="et-footer">
  <a href="/privacy">プライバシーポリシー</a>
  <div style="margin-top:10px">© ${esc(companyName)} All Rights Reserved.</div>
</div>
<style>
  /* スクロール表示アニメーション */
  .et-reveal { opacity: 0; transform: translateY(28px); transition: opacity .7s ease, transform .7s ease; }
  .et-reveal.is-visible { opacity: 1; transform: none; }
  .et-reveal-d1 { transition-delay: .1s; } .et-reveal-d2 { transition-delay: .2s; } .et-reveal-d3 { transition-delay: .3s; }
  /* ヒーローの文字をふわっと表示 */
  .et-hero-label, .et-hero h1, .et-hero-lead, .et-hero .et-btn { opacity: 0; transform: translateY(16px); animation: etFadeUp .8s ease forwards; }
  .et-hero h1 { animation-delay: .15s; }
  .et-hero-lead { animation-delay: .3s; }
  .et-hero .et-btn { animation-delay: .45s; }
  .et-hi { opacity: 0; animation: etFadeUp .9s ease forwards; }
  .et-hi-1 { animation-delay: .25s; }
  .et-hi-2 { animation-delay: .45s; }
  .et-hi-3 { animation-delay: .65s; }
  @keyframes etFadeUp { to { opacity: 1; transform: none; } }
  html { scroll-behavior: smooth; }
  .et-typecard, .et-feature, .et-step { transition: transform .25s ease, box-shadow .25s ease; }
  .et-typecard:hover, .et-feature:hover { transform: translateY(-4px); }
  /* 企業情報 */
  .et-company-card { max-width: 920px; margin: 0 auto; background: #fff; border: 1px solid #e6e1d6; border-radius: 16px; padding: 36px 34px; box-shadow: 0 4px 20px rgba(0,0,0,.04); }
  .et-company-lead { font-size: 17px; font-weight: 700; line-height: 1.9; color: #1a1a1a; margin: 0 0 14px; }
  .et-company-lead strong { color: #e0371f; }
  .et-company-text { font-size: 14.5px; line-height: 2; color: #555; margin: 0 0 30px; }
  /* MVV */
  .et-mvv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 34px; }
  .et-mvv-item { background: #faf8f3; border: 1px solid #ece7dc; border-left: 3px solid #e0371f; border-radius: 12px; padding: 22px 20px; }
  .et-mvv-label { font-family: Georgia, serif; font-style: italic; font-size: 17px; font-weight: 700; color: #e0371f; letter-spacing: .04em; margin-bottom: 12px; display: flex; align-items: baseline; gap: 8px; }
  .et-mvv-label span { font-family: inherit; font-style: normal; font-size: 11px; font-weight: 700; color: #999; letter-spacing: .12em; }
  .et-mvv-title { font-size: 15px; font-weight: 800; color: #111; line-height: 1.6; margin-bottom: 10px; }
  .et-mvv-text { font-size: 12.5px; color: #666; line-height: 1.95; }
  @media (max-width: 760px) { .et-mvv { grid-template-columns: 1fr; } }
  /* 事業（メイン / これから） */
  .et-biz { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .et-biz-col { background: #faf8f3; border: 1px solid #ece7dc; border-radius: 12px; padding: 22px 22px 8px; }
  .et-biz-head { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 800; color: #111; margin-bottom: 16px; }
  .et-biz-badge { font-size: 10.5px; font-weight: 800; letter-spacing: .08em; padding: 3px 10px; border-radius: 999px; }
  .et-biz-badge.main { background: #e0371f; color: #fff; }
  .et-biz-badge.next { background: #111; color: #fff; }
  .et-biz-list { list-style: none; margin: 0; padding: 0; }
  .et-biz-list li { padding: 12px 0 12px 22px; border-top: 1px solid #ece7dc; position: relative; }
  .et-biz-list li:first-child { border-top: none; }
  .et-biz-list li::before { content: ''; position: absolute; left: 2px; top: 18px; width: 8px; height: 8px; border-radius: 50%; background: #e0371f; }
  .et-biz-list.next li::before { background: #111; }
  .et-biz-list li b { display: block; font-size: 13.5px; font-weight: 800; color: #111; line-height: 1.5; }
  .et-biz-list li span { display: block; font-size: 12px; color: #777; line-height: 1.7; margin-top: 3px; }
  @media (max-width: 760px) { .et-biz { grid-template-columns: 1fr; } }
  @media (max-width: 640px) {
    .et-company-card { padding: 24px 18px; }
    .et-company-lead { font-size: 15.5px; }
  }
</style>
<script>
(function(){
  // セクション・カードにスクロール表示アニメーションを適用
  const targets = [];
  document.querySelectorAll('.et-sec, .et-flowband').forEach(sec => {
    sec.classList.add('et-reveal'); targets.push(sec);
  });
  document.querySelectorAll('.et-typecard, .et-voice, .et-feature, .et-step').forEach((el, i) => {
    el.classList.add('et-reveal', 'et-reveal-d' + ((i % 3) + 1)); targets.push(el);
  });
  if (!('IntersectionObserver' in window)) { targets.forEach(t => t.classList.add('is-visible')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  targets.forEach(t => io.observe(t));
})();
</script>`;

  return publicLayout(`採用情報 | ${esc(companyName)}`, content, {
    description: `${companyName}の採用情報サイト。職種・エリアから求人を探せます。`,
    bare: true,
  });
}

// ── 新デザイン求人一覧ページ（ディンプル風・プレビュー用） ──────────
// /preview/jobs で表示。未公開求人には「未公開」バッジを付けて表示する。
function jobsListPageV2(jobs, search = '') {
  const rows = jobs.length === 0
    ? `<div style="text-align:center;padding:60px 20px;color:#999">現在募集中の求人はありません</div>`
    : jobs.map(j => {
        const draftBadge = j.is_published ? '' : '<span class="hpl-draft">未公開</span>';
        const catchcopy = j.catchcopy || '';
        const jlocs = (() => { try { return JSON.parse(j.locations || '[]'); } catch { return []; } })();
        const displayLoc = jlocs.length > 1 ? `複数拠点（選択制・車通勤可）` : (jlocs[0] || '');
        return `<div class="hpl-item">
          <div class="hpl-item-head">
            <span class="hpl-emp">${esc(j.employment_type)}</span>
            <span class="hpl-jobtype">${esc(j.job_type)}</span>
            ${draftBadge}
          </div>
          ${catchcopy ? `<div class="hpl-catch">${esc(catchcopy)}</div>` : ''}
          <h3 class="hpl-title"><a href="/preview/jobs/${j.id}">${esc(j.title)}</a></h3>
          <table class="hpl-table"><tbody>
            <tr><th>勤務地</th><td>${esc(displayLoc)}</td></tr>
            <tr><th>給与</th><td>${esc(j.salary)}</td></tr>
          </tbody></table>
          <div class="hpl-more"><a href="/preview/jobs/${j.id}" class="hpl-btn">詳細を見る</a></div>
        </div>`;
      }).join('');

  const content = `
<style>
  body.pub-body { background: #f4f1ea; }
  .hpl-band { background: #f4f1ea; padding: 44px 16px 0; }
  .hpl-band-inner { max-width: 1080px; margin: 0 auto; color: #111; }
  .hpl-band-title { font-size: 30px; font-weight: 800; letter-spacing: .04em; display: flex; align-items: center; gap: 14px; }
  .hpl-band-title::before { content: '—'; color: #e0371f; font-weight: 700; }
  .hpl-band-sub { font-size: 12px; color: #e0371f; font-weight: 700; letter-spacing: .25em; margin: 6px 0 0 38px; }
  .hpl-wrap { max-width: 1080px; margin: 0 auto; padding: 0 16px 60px; }
  .hpl-search { display: flex; gap: 0; max-width: 540px; margin: 24px 0 8px; background: #fff; border-radius: 999px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
  .hpl-search input { flex: 1; border: none; outline: none; padding: 14px 24px; font-size: 14px; background: transparent; }
  .hpl-search button { border: none; background: #111; color: #fff; font-weight: 700; font-size: 14px; padding: 0 32px; cursor: pointer; transition: background .2s; }
  .hpl-search button:hover { background: #e0371f; }
  .hpl-count { font-size: 13px; color: #888; margin: 12px 0 20px; }
  .hpl-item { border: none; border-radius: 18px; padding: 24px 28px; margin-bottom: 16px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.05); transition: box-shadow .2s, transform .2s; }
  .hpl-item:hover { box-shadow: 0 12px 28px rgba(0,0,0,.10); transform: translateY(-2px); }
  .hpl-item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .hpl-emp { background: #111; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 14px; border-radius: 999px; }
  .hpl-jobtype { font-size: 12px; color: #999; }
  .hpl-draft { background: #8a8a8a; color: #fff; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 999px; }
  .hpl-catch { font-size: 12.5px; color: #e0371f; font-weight: 700; margin-bottom: 4px; }
  .hpl-title { font-size: 17px; font-weight: 700; line-height: 1.5; margin: 0 0 14px; }
  .hpl-title a { color: #111; text-decoration: none; }
  .hpl-title a:hover { color: #e0371f; }
  .hpl-table { border-collapse: collapse; font-size: 13.5px; margin-bottom: 14px; width: 100%; max-width: 560px; }
  .hpl-table th { width: 90px; background: #ebe6db; color: #111; font-weight: 700; text-align: left; padding: 8px 12px; border: 1px solid #e4dfd4; }
  .hpl-table td { padding: 8px 14px; border: 1px solid #e4dfd4; color: #333; background: #fff; }
  .hpl-more { text-align: right; }
  .hpl-btn { display: inline-block; background: #111; color: #fff; border: none; font-size: 13px; font-weight: 700; padding: 10px 32px; border-radius: 999px; text-decoration: none; transition: background .2s; }
  .hpl-btn:hover { background: #e0371f; }
  @media (max-width: 640px) {
    .hpl-item { padding: 16px; }
    .hpl-title { font-size: 15px; }
  }
</style>
<div class="hpl-band">
  <div class="hpl-band-inner">
    <div class="hpl-band-title">求人情報</div>
    <div class="hpl-band-sub">RECRUIT</div>
  </div>
</div>
<div class="hpl-wrap">
  <div style="font-size:11.5px;color:#888;margin:14px 0 0"><a href="/preview/top" style="color:#2e75b6;text-decoration:none">求人情報トップ</a> ＞ お仕事一覧</div>
  <form class="hpl-search" action="/preview/jobs" method="get">
    <input type="search" name="q" value="${esc(search)}" placeholder="職種・勤務地・キーワードで検索">
    <button type="submit">検索</button>
  </form>
  <div class="hpl-count">${jobs.length}件の求人${search ? `（「${esc(search)}」の検索結果）` : ''}</div>
  ${rows}
</div>`;

  return publicLayout('求人情報一覧 | 採用サイト', content, {
    description: '全国の正社員求人情報一覧。配送・物流・製造など多数掲載。'
  });
}

// ── 新デザイン求人詳細ページ（ディンプル風・プレビュー用） ──────────
// /preview/jobs/:id で表示。承認後に /jobs/:id へ切り替える。
function jobDetailPageV2(job) {
  const tags = JSON.parse(job.tags || '[]');
  const faq = JSON.parse(job.faq || '[]');
  const jobLocs = (() => { try { return JSON.parse(job.locations || '[]'); } catch { return []; } })();
  const hasMultiLoc = jobLocs.length > 1;
  const firstLoc = jobLocs[0] || '';
  const locSummary = hasMultiLoc ? `複数拠点（選択制・車通勤可）` : firstLoc;
  const locDetail = hasMultiLoc ? `【選択制・車通勤可】\n` + jobLocs.join('\n') : firstLoc;

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

  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const jobUrl  = `${siteUrl}/jobs/${job.id}`;

  const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
  const addressRegion = PREFS.find(p => firstLoc.includes(p)) || '';

  const datePosted = (job.published_at || job.created_at || '').slice(0, 10);
  const validThrough = job.expires_at
    ? job.expires_at.slice(0, 10)
    : (() => {
        const d = new Date(datePosted || Date.now());
        d.setDate(d.getDate() + 60);
        return d.toISOString().slice(0, 10);
      })();

  const jsonldObj = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description,
    "url": jobUrl,
    "identifier": { "@type": "PropertyValue", "name": process.env.COMPANY_NAME || "採用企業", "value": job.id },
    "datePosted": datePosted,
    "validThrough": validThrough,
    "directApply": true,
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
        ...(addressRegion ? { "addressRegion": addressRegion } : {}),
        "addressCountry": "JP"
      }
    },
    ...(salarySchema ? { "baseSalary": salarySchema } : {})
  };
  const jsonld = `<script type="application/ld+json">${JSON.stringify(jsonldObj, null, 2)}<\/script>`;

  // キャッチコピー
  const catchcopy = job.catchcopy || '';

  // 仕事内容の【見出し】をセクションに分解
  const descParts = String(job.description || '').split(/【([^】]+)】/);
  const introText = (descParts[0] || '').trim();
  const secMap = {};
  const secOrder = [];
  for (let i = 1; i < descParts.length; i += 2) {
    const h = (descParts[i] || '').trim();
    const body = (descParts[i + 1] || '').trim();
    if (h && body) { secMap[h] = body; secOrder.push(h); }
  }
  const used = new Set();
  const pick = (...names) => {
    for (const n of names) if (secMap[n]) { used.add(n); return secMap[n]; }
    return '';
  };

  // お仕事情報テーブル（イーストアジア風の項目順）
  const mainDesc = pick('仕事内容', 'お仕事内容') || introText || String(job.description || '').trim();
  const salaryDetail = pick('給与内訳', '給与・待遇');
  const shiftText = pick('労働時間', '勤務時間', 'シフト・勤務時間');
  // 給与額は上部の基本情報テーブルにのみ表示する。
  // お仕事情報の「給与」行は内訳（手当・想定年収など）だけを出し、
  // 内訳の先頭行が給与フィールドと同額ならその行も取り除く（内訳が無い求人は行ごと省略）。
  const normSalary = s => String(s || '').replace(/\s/g, '');
  let salaryCell = salaryDetail;
  if (salaryCell && normSalary(salaryCell.split('\n')[0]) === normSalary(job.salary)) {
    salaryCell = salaryCell.split('\n').slice(1).join('\n').trim();
  }
  const infoRows = [
    ['お仕事内容', mainDesc],
    ['給与', salaryCell],
    ['所在地', locDetail],
    ['雇用形態', job.employment_type],
    ['シフト・勤務時間', shiftText],
    ['休日・休暇', pick('休日・休暇', '休日')],
    ['応募資格', pick('応募資格', 'こんな方に向いています', 'こんな方におすすめ')],
    ['待遇・福利厚生', pick('福利厚生', '待遇・福利厚生', '待遇')],
    ['入社後の流れ', pick('入社後の流れ', '研修', '入社後の研修')],
    ...secOrder.filter(h => !used.has(h) && !['勤務地','アクセス'].includes(h)).map(h => [h, secMap[h]]),
  ].filter(([, v]) => v);

  // 注目ポイント: タグ（✔リスト）＋導入文
  const pointsText = [
    tags.map(t => `✔ ${t}`).join('\n'),
    introText && mainDesc !== introText ? introText : '',
  ].filter(Boolean).join('\n\n');

  const faqHtml = faq.length > 0
    ? `<div class="ea-secband">よくある質問</div>
      <div class="ea-secbody">${faq.map(f =>
        `<div class="ea-faq-q">Q. ${esc(f.q)}</div><div class="ea-faq-a">A. ${esc(f.a)}</div>`).join('')}
      </div>`
    : '';

  const imageHtml = job.image_url
    ? `<div class="ea-image"><img src="${esc(job.image_url)}" alt="${esc(job.title)}"></div>`
    : '';

  // 会社情報テーブル（GIG INC.風）。会社名・MVV・大切にしているもの・働く人々で構成。
  const companyName = process.env.COMPANY_NAME || '株式会社Social Quality';
  const shortName = companyName.replace(/^(株式会社|有限会社|合同会社)\s*/, '');
  const mvvContent =
    'MISSION（使命）\nつくる力で、人と企業の可能性を解き放つ。\n\n'
    + 'VISION（目指す姿）\n確かな価値を提供できる企業へ。\n\n'
    + 'VALUE（価値観）\n挑戦を楽しむ・本質にこだわる・仲間を信じる。';
  const valuesContent =
    '１：付加価値のあるものを生み出す\n'
    + 'Web・AI開発から物流・製造の現場まで、どんな仕事にも「もっと良くできる」余地があると信じています。工夫と改善を積み重ね、関わる人すべてに確かな価値を届けることを大切にしています。\n\n'
    + '２：挑戦を恐れず、前へ進む\n'
    + '新しいことに踏み出し、ときに失敗しながら経験を糧にする。個人でもチームでも自走し、EC・物流プラットフォームや全国エリア拡大など新事業にも積極的に挑む文化をつくっています。\n\n'
    + '３：チームで勝ちにいく\n'
    + '現場スタッフ・ドライバー・エンジニア・プランナー、立場に関係なく意見が言える環境を大切にしています。責任感と当事者意識を持ち、仲間と一緒に結果を出すことが私たちの誇りです。';
  const companyRows = [
    ['会社名',                companyName],
    ['MISSION / VISION / VALUE', mvvContent],
    ['私たちが大切にしているもの', valuesContent],
  ].filter(([, v]) => v && String(v).trim());
  const companyTable = `<table class="ea-table"><tbody>
    ${companyRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
  </tbody></table>`;

  const content = `
<style>
  body.pub-body { background: #f4f1ea; }
  .ea-titlebar { background: #111; }
  .ea-titlebar-in { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
  .ea-titlebar h1 { color: #f4f1ea; font-size: 15.5px; font-weight: 700; line-height: 1.5; margin: 0; flex: 1; }
  .ea-apply-top { background: #e0371f; color: #fff; font-weight: 700; font-size: 14px; border: none; border-radius: 999px; padding: 10px 28px; cursor: pointer; white-space: nowrap; transition: background .2s; }
  .ea-apply-top:hover { background: #c12c16; }
  .ea-wrap { max-width: 1000px; margin: 0 auto; padding: 0 16px 70px; }
  .ea-breadcrumb { font-size: 11.5px; color: #888; margin: 12px 0 16px; }
  .ea-breadcrumb a { color: #e0371f; text-decoration: none; font-weight: 600; }
  .ea-breadcrumb a:hover { text-decoration: underline; }
  .ea-headline { font-size: 16px; font-weight: 700; color: #111; line-height: 1.8; margin: 6px 0 16px; white-space: pre-wrap; }
  .ea-summary { width: 100%; border-collapse: collapse; font-size: 13.5px; margin-bottom: 18px; }
  .ea-summary th { width: 92px; background: #ebe6db; border: 1px solid #e4dfd4; padding: 9px 12px; color: #111; font-weight: 700; text-align: left; }
  .ea-summary td { border: 1px solid #e4dfd4; padding: 9px 14px; color: #333; background: #fff; }
  .ea-image { margin: 14px 0; }
  .ea-image img { max-width: 430px; width: 100%; border-radius: 14px; }
  .ea-secband { background: #111; color: #f4f1ea; font-size: 15px; font-weight: 700; padding: 11px 18px; margin: 28px 0 0; border-radius: 12px 12px 0 0; }
  .ea-secbody { border: 1px solid #e4dfd4; border-top: none; padding: 18px 20px; font-size: 14px; line-height: 2; color: #333; white-space: pre-wrap; background: #fff; border-radius: 0 0 12px 12px; }
  .ea-table { width: 100%; border-collapse: collapse; font-size: 13.5px; border: 1px solid #e4dfd4; background: #fff; }
  .ea-table th { width: 150px; background: #ebe6db; border: 1px solid #e4dfd4; padding: 13px 14px; font-weight: 700; color: #111; text-align: left; vertical-align: top; }
  .ea-table td { border: 1px solid #e4dfd4; padding: 13px 16px; color: #333; line-height: 1.9; white-space: pre-wrap; }
  .ea-faq-q { font-weight: 700; color: #e0371f; margin: 10px 0 2px; }
  .ea-faq-a { margin-bottom: 8px; }
  .ea-company p { margin: 0 0 14px; }
  .ea-company .ea-biz-list { margin: 0 0 14px; padding-left: 0; list-style: none; }
  .ea-company .ea-biz-list li { position: relative; padding: 7px 12px 7px 30px; margin-bottom: 6px; background: #faf8f3; border: 1px solid #e4dfd4; border-radius: 8px; line-height: 1.6; }
  .ea-company .ea-biz-list li::before { content: "▶"; position: absolute; left: 11px; color: #e0371f; font-size: 10px; top: 11px; }
  .ea-company .ea-biz-lead { margin-top: 16px; padding: 14px 16px; background: #fff7f5; border-left: 4px solid #e0371f; border-radius: 6px; font-weight: 600; color: #111; }
  .ea-applybtn-wrap { text-align: center; margin: 36px 0 0; }
  .ea-applybtn { background: #e0371f; color: #fff; font-size: 17px; font-weight: 700; border: none; border-radius: 999px; padding: 16px 90px; cursor: pointer; box-shadow: 0 2px 10px rgba(224,55,31,.3); transition: background .2s; }
  .ea-applybtn:hover { background: #c12c16; }
  @media (max-width: 640px) {
    .ea-titlebar-in { flex-direction: column; align-items: flex-start; gap: 8px; }
    .ea-table th { width: 100px; padding: 10px; }
    .ea-table td { padding: 10px 12px; }
    .ea-summary th { width: 70px; }
    .ea-applybtn { width: 100%; padding: 15px 0; }
  }
</style>
<div class="ea-titlebar">
  <div class="ea-titlebar-in">
    <h1>${esc(job.title)}</h1>
    <button class="ea-apply-top" onclick="document.getElementById('apply-wrap').scrollIntoView({behavior:'smooth'})">応募する</button>
  </div>
</div>
<div class="ea-wrap">
  <div class="ea-breadcrumb">
    <a href="/preview/top">求人情報トップ</a> ＞ <a href="/preview/jobs">お仕事一覧</a> ＞ ${esc(firstLoc)} ＞ ${esc(job.title)}
  </div>
  ${catchcopy ? `<div class="ea-headline">${esc(catchcopy)}</div>` : ''}
  <table class="ea-summary"><tbody>
    <tr><th>給与</th><td>${esc(job.salary)}</td><th>シフト</th><td>${esc((shiftText.split('\n')[0] || 'シフト制'))}</td></tr>
    <tr><th>勤務地</th><td>${esc(locSummary)}</td><th>雇用形態</th><td>${esc(job.employment_type)}</td></tr>
  </tbody></table>
  ${imageHtml}
  ${pointsText ? `
  <div class="ea-secband">注目ポイント</div>
  <div class="ea-secbody">${esc(pointsText)}</div>` : ''}
  <div class="ea-secband">お仕事情報</div>
  <table class="ea-table"><tbody>
    ${infoRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
  </tbody></table>
  ${faqHtml}
  <div class="ea-secband">会社情報</div>
  ${companyTable}
  <div class="ea-secband">応募情報</div>
  <div class="ea-secbody" style="white-space:normal" id="apply-wrap">
    <p style="margin:0 0 16px">下記フォームより応募してください。担当者より3営業日以内にご連絡いたします。</p>
    <form id="apply-form">
      <input type="hidden" name="jobId" value="${job.id}">
      <input type="hidden" name="jobTitle" value="${esc(job.title)}">
      <input type="hidden" name="sourceMedia" id="apply-source-media" value="direct">
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
      <div class="ea-applybtn-wrap" style="margin-top:8px">
        <button type="submit" class="ea-applybtn">応募する</button>
      </div>
    </form>
  </div>
</div>
<script>
(function(){
  const field = document.getElementById('apply-source-media');
  if (!field) return;
  const params = new URLSearchParams(window.location.search);
  const utmSource = (params.get('utm_source') || '').toLowerCase();
  const ref = (document.referrer || '').toLowerCase();
  if (utmSource.includes('google') || ref.includes('google.com')) {
    field.value = 'google';
  }
})();
</script>`;

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
function adminAnalyticsPage({ daily, media, status, topJobs, weekly, co = 'sq' }) {
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

  return adminLayout('分析・レポート', content, 'analytics', co);
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
      <h1>ATS採用プラットフォーム</h1>
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

// ══════════════════════════════════════════════════════════════
// 運用管理ページ（3タブ）
// ══════════════════════════════════════════════════════════════
function opsPage({ tab = 'posts', co = 'sq', posts = [], postsCross = {}, applicantsCross = {}, todayTargets = {}, stats = {}, pastApplicants = [], months = [], filter = {}, siteUrl = '', indeedRepostCount = 0 } = {}) {
  const companyName = id => (COMPANIES[id] ? COMPANIES[id].label : id.toUpperCase());

  const tabBar = `
    <div class="ops-tabs">
      <a href="/admin/ops?tab=posts" class="ops-tab ${tab === 'posts' ? 'active' : ''}">📋 掲載管理</a>
      <a href="/admin/ops?tab=new"   class="ops-tab ${tab === 'new'   ? 'active' : ''}">🆕 新規応募</a>
      <a href="/admin/ops?tab=past"  class="ops-tab ${tab === 'past'  ? 'active' : ''}">📚 過去応募者</a>
    </div>`;

  // ── クロス集計表の共通レンダラ ──
  const crossTable = (data, label, mediaList = OPS_MEDIA) => {
    const totalsByMedia = {}; mediaList.forEach(m => totalsByMedia[m.id] = 0);
    let grand = 0;
    const rows = COMPANIES_ORDER.map(cid => {
      let rowTotal = 0;
      const cells = mediaList.map(m => {
        const v = (data[cid] && data[cid][m.id]) || 0;
        rowTotal += v; totalsByMedia[m.id] += v; grand += v;
        return `<td class="num${v === 0 ? ' zero' : ''}">${v}</td>`;
      }).join('');
      return `<tr><th>${companyName(cid)}</th>${cells}<td class="num total">${rowTotal}</td></tr>`;
    }).join('');
    const footCells = mediaList.map(m => `<td class="num total">${totalsByMedia[m.id]}</td>`).join('');
    return `
      <table class="cross-table">
        <thead><tr><th>${label}</th>${mediaList.map(m => `<th>${m.name}</th>`).join('')}<th>合計</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>合計</th>${footCells}<td class="num total">${grand}</td></tr></tfoot>
      </table>`;
  };
  const POSTS_MEDIA = OPS_MEDIA.filter(m => m.id !== 'indeed');

  let body = '';

  // ── Tab A: 掲載管理 ──
  if (tab === 'posts') {
    // Per-company totals from postsCross
    const companyTotals = COMPANIES_ORDER.map(cid => {
      const mediaData = postsCross[cid] || {};
      const total = OPS_MEDIA.reduce((sum, m) => sum + (mediaData[m.id] || 0), 0);
      return { cid, total, label: companyName(cid) };
    });
    const grandTotal = companyTotals.reduce((sum, c) => sum + c.total, 0);

    const summaryCards = `
      <section class="stat-cards">
        <div class="stat-card"><div class="stat-label">掲載総数</div><div class="stat-value">${grandTotal}</div></div>
        ${companyTotals.map(c =>
          `<div class="stat-card"><div class="stat-label">${c.label}</div><div class="stat-value">${c.total}</div></div>`
        ).join('')}
      </section>`;

    const postRows = '';

    body = `
      ${summaryCards}
      <section class="card">
        <h2>媒体別 × 会社別 掲載中件数</h2>
        ${crossTable(postsCross, '会社＼媒体', POSTS_MEDIA)}
      </section>
      ${opsAutomationPanel(co, siteUrl, indeedRepostCount)}`;
  }

  // ── Tab B: 新規応募者 ──
  if (tab === 'new') {
    const targetRows = COMPANIES_ORDER.map(cid =>
      `<tr><th>${companyName(cid)}</th><td class="num">${(todayTargets.byCompany && todayTargets.byCompany[cid]) || 0}</td></tr>`
    ).join('');
    body = `
      <section class="stat-cards">
        <div class="stat-card"><div class="stat-label">本日の新規応募</div><div class="stat-value">${stats.todayNew || 0}</div></div>
        <div class="stat-card"><div class="stat-label">本日架電対象（全体）</div><div class="stat-value">${(todayTargets.total) || 0}</div></div>
      </section>
      <section class="card">
        <h2>会社別 × 媒体別 新規応募数</h2>
        ${crossTable(applicantsCross, '会社＼媒体')}
      </section>
      <section class="card">
        <h2>本日架電を行う件数（会社別）</h2>
        <p class="muted">架電リストに残っている「新規」の件数（不通・対応中・終了は過去応募へ移動）</p>
        <table class="cross-table" style="max-width:360px">
          <thead><tr><th>会社</th><th>架電対象件数</th></tr></thead>
          <tbody>${targetRows}</tbody>
          <tfoot><tr><th>合計</th><td class="num total">${todayTargets.total || 0}</td></tr></tfoot>
        </table>
        <div style="margin-top:16px">
          <a href="/admin/calls" class="btn btn-primary">📞 架電リストを開く</a>
        </div>
      </section>`;
  }

  // ── Tab C: 過去応募者 ──
  if (tab === 'past') {
    const sel = (name, options, current) => `
      <select name="${name}" class="filter-select" onchange="opsPastFilter()">
        ${options.map(o => `<option value="${o.v}"${o.v === current ? ' selected' : ''}>${o.l}</option>`).join('')}
      </select>`;
    const companyOpts = [{ v: 'all', l: '全ての会社' }, ...COMPANIES_ORDER.map(c => ({ v: c, l: companyName(c) }))];
    const mediaOpts = [{ v: 'all', l: '全ての媒体' }, ...OPS_MEDIA.map(m => ({ v: m.id, l: m.name }))];
    const statusOpts = [{ v: 'all', l: '全ての対応状況' }, ...CALL_STATUSES_LIST.map(s => ({ v: s, l: s }))];
    const monthOpts = [{ v: 'all', l: '全ての応募月' }, ...months.map(m => ({ v: m, l: m }))];

    // 対応状況別にグルーピング
    const groups = {};
    CALL_STATUSES_LIST.forEach(s => groups[s] = []);
    pastApplicants.forEach(a => { (groups[a.status] || (groups[a.status] = [])).push(a); });

    const sectionsOrder = ['不通', '対応中', '終了', '新規'];
    const sectionLabels = {
      '不通': '🔁 再架電リスト（不通）', '対応中': '🔵 対応中',
      '終了': '✅ 終了', '新規': '🆕 新規',
    };
    const sections = sectionsOrder.filter(s => (groups[s] || []).length).map(s => {
      const rows = groups[s].map(a => `
        <tr data-company="${esc(a.company || '')}" data-media="${esc(a.media || '')}" data-status="${esc(a.status || '')}" data-month="${esc((a.applied_at || '').slice(0, 7))}">
          <td class="name-col">${esc(a.name || '')}</td>
          <td><a href="tel:${esc(a.phone || '')}" style="color:inherit;text-decoration:none">${esc(a.phone || '')}</a></td>
          <td>${esc(a.email || '')}</td>
          <td>${esc(a.gender || '')}</td>
          <td>${a.age || ''}</td>
          <td>${esc(a.address || '')}</td>
          <td>${esc(a.job_title || '')}</td>
          <td>${esc(a.current_job || '')}</td>
          <td>${esc(a.education || '')}</td>
          <td style="white-space:nowrap">
            <span style="font-size:12px">${companyName(a.company)}</span>
            <button onclick="moveCompany('${esc(a.id)}','${esc(a.company || '')}')" style="margin-left:4px;padding:1px 5px;font-size:10px;border:1px solid #cbd5e1;border-radius:3px;background:#f8fafc;cursor:pointer" title="会社変更">↔</button>
          </td>
          <td>${esc(mediaName(a.media))}</td>
          <td style="white-space:nowrap">${esc((a.applied_at || '').slice(0, 10))}</td>
          <td class="num">${a.call_count || 0}</td>
          <td style="white-space:nowrap">${esc((a.last_called_at || '').slice(0, 10))}</td>
          <td>${esc(a.notes || '')}</td>
        </tr>`).join('');
      return `
        <details class="past-section" open data-status="${esc(s)}">
          <summary><span class="dot" style="background:${CALL_STATUS_COLORS[s] || '#999'}"></span>${sectionLabels[s] || s} <span class="count section-count">${groups[s].length}件</span></summary>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr>
                <th class="name-col">名前</th><th>電話番号</th><th>メール</th><th>性別</th><th>年齢</th>
                <th>居住地</th><th>求人タイトル</th><th>現在の職業</th><th>学歴</th>
                <th>会社</th><th>媒体</th><th>応募日</th><th>架電回数</th><th>最終架電</th><th>メモ</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>`;
    }).join('');

    // 初期のスプレッドシート出力リンク（URLパラメータからのディープリンク用）。
    // 以降は絞り込み操作に応じて opsPastFilter() が href を更新する。
    const exportQS = new URLSearchParams();
    if (filter.company !== 'all') exportQS.set('company', filter.company);
    if (filter.media   !== 'all') exportQS.set('media',   filter.media);
    if (filter.status  !== 'all') exportQS.set('status',  filter.status);
    if (filter.month   !== 'all') exportQS.set('month',   filter.month);
    const exportHref = '/api/ops/calls/export' + (exportQS.toString() ? `?${exportQS.toString()}` : '');

    body = `
      <section class="card">
        <div class="card-head">
          <h2>絞り込み <span class="count" id="past-total">${pastApplicants.length}件</span></h2>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="callImport()" title="過去応募者データ（CSV / Excel）を取り込む">📥 過去応募者を取り込む</button>
            <button class="btn btn-secondary btn-sm" onclick="callSmartImport()" title="全会社・全媒体が1つに混在したExcelを自動振り分けで取り込む">🪄 まとめてExcel取込</button>
            <button class="btn btn-primary btn-sm" onclick="sheetsPushPast()" title="過去応募者を架電用とは別の専用スプレッドシートへ出力（GOOGLE_PAST_SHEET_ID）">📤 過去リストを別シート出力</button>
            <a id="past-export" href="${exportHref}" class="btn btn-secondary btn-sm" download>📊 CSV出力（全件）</a>
          </div>
        </div>
        <form id="past-filter" class="filter-bar">
          ${sel('company', companyOpts, filter.company || 'all')}
          ${sel('media', mediaOpts, filter.media || 'all')}
          ${sel('status', statusOpts, filter.status || 'all')}
          ${sel('month', monthOpts, filter.month || 'all')}
        </form>
        <p class="muted" id="past-conditions" style="margin:10px 0 0;display:none"></p>
      </section>
      <div id="past-results">
        ${sections}
        <section class="card" id="past-empty" style="display:none"><p class="empty">該当する応募者がいません。</p></section>
      </div>
      ${callImportModalHtml(co, OPS_MEDIA[0].id)}`;
  }

  const PAGE_TITLES = { posts: '📋 掲載管理', new: '🆕 新規応募', past: '📚 過去応募者' };
  const content = `
    <div class="page-head"><h1>${PAGE_TITLES[tab] || '📋 掲載管理'}</h1></div>
    ${tabBar}
    ${body}
    ${tab === 'posts' ? postModalHtml(co) : ''}`;

  return adminLayout(PAGE_TITLES[tab] || '掲載管理', content, tab, co);
}

// 掲載管理タブ内の「自動掲載・媒体運用」パネル（会社サブタブで切替）
function opsAutomationPanel(co, siteUrl = '', indeedRepostCount = 0) {
  const companyName = id => (COMPANIES[id] ? COMPANIES[id].label : id.toUpperCase());
  const company = COMPANIES[co] || COMPANIES.sq;
  const coTabs = COMPANIES_ORDER.map(c =>
    `<a href="/admin/ops?tab=posts&co=${c}" class="call-co-tab ${c === co ? 'active' : ''}">${companyName(c)}</a>`
  ).join('');

  return `
  <section class="card">
    <div class="card-head" style="align-items:center">
      <h2>📡 媒体運用</h2>
      <span id="vpn-badge" class="vpn-badge vpn-checking" onclick="refreshVpn()" title="クリックで再確認">
        <span class="dot"></span> 確認中...
      </span>
    </div>
    <p class="muted" style="margin:-4px 0 12px">各媒体への投稿には VPN 接続が必要です。上のランプが「接続中」であることを確認してから投稿してください。</p>
    <div class="call-co-tabs">${coTabs}</div>
    <p class="muted" style="margin:8px 0 16px">対象会社: <strong style="color:${company.color}">${company.full}</strong></p>

    <div class="action-section">
      <div class="media-op-section">
        <div class="media-op-label">求人ボックス <span class="text-muted text-sm">（スクレイピング投稿・VPN必須）</span></div>
        <div class="btn-group" style="align-items:center">
          <button id="btn-post-kyujinbox" class="btn btn-warning" onclick="startPostKyujinbox('${co}')">🚀 求人ボックスに投稿する（未投稿のみ）</button>
          <button id="btn-post-kyujinbox-force" class="btn btn-ghost btn-sm" onclick="startPostKyujinboxForce('${co}')" title="投稿済み求人も含めて全件投稿">🔄 強制再投稿</button>
          <button class="btn btn-ghost btn-sm" onclick="resetKyujinboxPosted('${co}')" title="投稿済みフラグをリセット">♻️ フラグリセット</button>
          <button id="btn-publish-kyujinbox-drafts" class="btn btn-ghost btn-sm" onclick="startPublishKyujinboxDrafts()" title="求人ボックス側に残っている下書きを巡回して公開（写真も後付け）">📤 下書きを公開＋写真添付</button>
        </div>
        <div class="text-sm text-muted" style="margin-top:4px">1度投稿した求人は次回スキップ（スキップしたくない場合は強制再投稿 or フラグリセット）。<br>「下書きを公開＋写真添付」は、求人ボックスに下書きのまま残った求人を巡回して公開し、写真も後付けします。</div>
        <div id="progress-kyujinbox-wrap" class="progress-wrap hidden"><div id="progress-kyujinbox" class="progress-box"></div></div>
      </div>

      <div class="media-op-section mt-14">
        <div class="media-op-label">スタンバイ <span class="text-muted text-sm">（スクレイピング投稿・VPN必須）</span></div>
        <div class="btn-group" style="align-items:center">
          <button id="btn-post-stanby" class="btn btn-warning" onclick="startPostStanby('${co}')">🚀 スタンバイに16件投稿する</button>
        </div>
        <div class="text-sm text-muted" style="margin-top:4px">ボタン1回で1日分（16件）を一括投稿します。</div>
        <div id="progress-stanby-wrap" class="progress-wrap hidden"><div id="progress-stanby" class="progress-box"></div></div>
      </div>
    </div>
  </section>`;
}

function postModalHtml(co) {
  const mediaOpts = OPS_MEDIA.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  const coOpts = COMPANIES_ORDER.map(c => `<option value="${c}"${c === co ? ' selected' : ''}>${COMPANIES[c].label}</option>`).join('');
  return `
  <div id="post-modal" class="modal-overlay hidden">
    <div class="modal">
      <h3 id="post-modal-title">掲載を追加</h3>
      <input type="hidden" id="pm-id">
      <div class="form-grid">
        <label>会社<select id="pm-company">${coOpts}</select></label>
        <label>媒体<select id="pm-media">${mediaOpts}</select></label>
        <label class="full">求人タイトル<input type="text" id="pm-title"></label>
        <label>掲載日<input type="date" id="pm-post-date"></label>
        <label>期限<input type="date" id="pm-expire-date"></label>
        <label>状態<select id="pm-status"><option>掲載中</option><option>審査中</option><option>停止</option></select></label>
        <label>応募数<input type="number" id="pm-count" value="0" min="0"></label>
        <label class="full">メモ<input type="text" id="pm-notes"></label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="opsCloseModal()">キャンセル</button>
        <button class="btn btn-primary" onclick="opsSavePost()">保存</button>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// 架電リストページ（会社タブ × 媒体サブタブ）
// ══════════════════════════════════════════════════════════════
function callsPage({ co = 'sq', media = 'indeed', applicants = [], statusFilter = 'all', search = '' } = {}) {
  const companyName = id => (COMPANIES[id] ? COMPANIES[id].label : id.toUpperCase());
  const baseHref = (c, m) => `/admin/calls?co=${c}&media=${m}`;
  const isAll = co === 'all';

  const companyTabs = [
    `<a href="/admin/calls?co=all&media=${media}" class="call-co-tab ${isAll ? 'active' : ''}">🏢 全社まとめ</a>`,
    ...COMPANIES_ORDER.map(c =>
      `<a href="${baseHref(c, media)}" class="call-co-tab ${c === co ? 'active' : ''}">${companyName(c)}</a>`)
  ].join('');

  const mediaTabs = [
    `<a href="${baseHref(isAll ? 'all' : co, 'all')}" class="call-media-tab ${media === 'all' ? 'active' : ''}">すべての媒体</a>`,
    ...OPS_MEDIA.map(m =>
      `<a href="${baseHref(isAll ? 'all' : co, m.id)}" class="call-media-tab ${m.id === media ? 'active' : ''}">${m.name}</a>`),
  ].join('');

  const countOpts = n => Array.from({ length: 11 }, (_, i) =>
    `<option value="${i}"${i === (n || 0) ? ' selected' : ''}>${i}</option>`).join('');
  const statusOpts = cur => CALL_STATUSES_LIST.map(s =>
    `<option value="${s}"${s === cur ? ' selected' : ''}>${s}</option>`).join('');
  const statusFilterOpts = [{ v: 'all', l: '全ての対応状況' }, ...CALL_STATUSES_LIST.map(s => ({ v: s, l: s }))].map(o =>
    `<option value="${o.v}"${o.v === statusFilter ? ' selected' : ''}>${o.l}</option>`).join('');

  // 全社まとめ時は会社列、全媒体表示時は媒体列を追加
  const showMedia = media === 'all';
  const NCOLS = 18 + (isAll ? 1 : 0) + (showMedia ? 1 : 0);
  const coCell = a => isAll ? `<td style="white-space:nowrap;font-size:12px"><span style="display:inline-block;background:${COMPANIES[a.company]?.color || '#94a3b8'};color:#fff;padding:1px 6px;border-radius:4px">${companyName(a.company)}</span></td>` : '';
  const mediaCell = a => showMedia ? `<td style="white-space:nowrap;font-size:12px">${esc(mediaName(a.media))}</td>` : '';
  const rows = applicants.length ? applicants.map((a, i) => `
    <tr data-id="${esc(a.id)}" data-status="${esc(a.status || '')}" style="background:${(CALL_STATUS_COLORS[a.status] || '#fff')}15">
      <td class="num">${i + 1}</td>
      ${coCell(a)}
      ${mediaCell(a)}
      <td class="name-col">${esc(a.name || '')}${a.is_duplicate ? ` <span class="dup-badge" onclick="showDupInfo('${esc(a.id)}')" style="cursor:pointer" title="重複元を見る">重複</span>` : ''}${a.returning_from_id ? ` <span style="background:#e0f2fe;color:#0369a1;font-size:10px;padding:1px 5px;border-radius:3px;cursor:pointer" onclick="showReturningInfo('${esc(a.id)}')" title="前回応募を見る">再応募</span>` : ''}</td>
      <td style="white-space:nowrap;color:#555">${esc(a.furigana || '')}</td>
      <td><a href="tel:${esc(a.phone || '')}" style="color:inherit;text-decoration:none">${esc(a.phone || '')}</a></td>
      <td>${esc(a.email || '')}</td>
      <td>${esc(a.gender || '')}</td>
      <td style="white-space:nowrap">${esc(a.birth_date || '')}</td>
      <td class="num">${a.age || ''}</td>
      <td>${esc(a.address || '')}</td>
      <td>${esc(a.current_job || '')}</td>
      <td>${esc(a.job_title || '')}</td>
      <td class="exp-cell" title="${esc(a.experience || '')}">${esc((a.experience || '').slice(0, 30))}${(a.experience || '').length > 30 ? '…' : ''}</td>
      <td>${esc(a.education || '')}</td>
      <td style="white-space:nowrap">${esc((a.applied_at || '').slice(0, 10))}</td>
      <td><select class="call-count-sel" onchange="callUpdate('${esc(a.id)}','call_count',this.value)">${countOpts(a.call_count)}</select></td>
      <td><select class="call-status-sel" onchange="callUpdate('${esc(a.id)}','status',this.value)">${statusOpts(a.status)}</select></td>
      <td style="white-space:nowrap">${esc((a.last_called_at || '').slice(0, 10))}</td>
      <td><input class="call-memo" value="${esc(a.notes || '')}" onblur="callUpdate('${esc(a.id)}','notes',this.value)" placeholder="メモ"></td>
    </tr>`).join('') : `<tr><td colspan="${NCOLS}" class="empty">応募者はいません。CSVをインポートしてください。</td></tr>`;

  const headingLabel = isAll
    ? `全社まとめ / ${mediaName(media)}`
    : `${companyName(co)} / ${mediaName(media)}`;
  const exportCoParam = isAll ? '' : `&co=${esc(co)}`;
  const morningExportHref = `/api/ops/calls/export?active=1&media=${esc(media)}${exportCoParam}`;

  const content = `
    <div class="page-head">
      <h1>📞 架電リスト</h1>
      <div class="head-actions">
        <button class="btn btn-primary btn-sm" onclick="sheetsPush()" title="応募者情報をスプレッドシートに反映（重複情報も自動記載）">📤 スプレッドシートへ反映</button>
        <button class="btn btn-warning btn-sm" onclick="sheetsPull()" title="共有スプレッドシートで更新した対応状況・架電回数・メモをDBに取り込む">📥 スプレッドシートから取込</button>
        <a id="sheets-open" href="#" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="display:none">🔗 シートを開く</a>
        <button class="btn btn-secondary btn-sm" onclick="sheetsInitRecruitment()" title="スプレッドシートに推薦管理・案件精査タブを作成（既存タブは上書きしません）">📋 推薦・案件精査シート作成</button>
        <span style="width:1px;height:24px;background:#e2e8f0;margin:0 2px"></span>
        <button class="btn btn-ghost btn-sm" onclick="callImport()" title="各媒体のCSV/Excelを取り込む">⬆ CSV/Excel取込</button>
        <a href="${morningExportHref}" class="btn btn-ghost btn-sm" download>📞 朝の架電リスト(xlsx)</a>
        <button class="btn btn-ghost btn-sm" onclick="callCheckDup()">♻️ 重複チェック</button>
      </div>
    </div>
    <div class="call-co-tabs">${companyTabs}</div>
    <div class="call-media-tabs">${mediaTabs}</div>
    <section class="card">
      <div class="card-head">
        <h2>${headingLabel} <span class="count" id="calls-count">${applicants.length}件</span></h2>
      </div>
      <div class="filter-bar" style="padding:0 0 12px">
        <input type="text" id="cf-search" class="filter-input" placeholder="名前・電話・住所・求人名で検索..." value="${esc(search)}" oninput="callsLocalFilter()">
        <select id="cf-status" class="filter-select" onchange="callsLocalFilter()">${statusFilterOpts}</select>
      </div>
      <div class="table-scroll">
        <table class="data-table calls-table" id="calls-table">
          <thead><tr>
            <th class="num">#</th>${isAll ? '<th>会社</th>' : ''}${showMedia ? '<th>媒体</th>' : ''}<th class="name-col">名前</th><th>ふりがな</th><th>電話番号</th><th>メール</th>
            <th>性別</th><th>生年月日</th><th>年齢</th><th>居住地</th>
            <th>現在の職業</th><th>求人タイトル</th><th>経験</th><th>学歴</th>
            <th>応募日</th><th>架電回数</th><th>対応状況</th><th>最終架電</th><th>メモ</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    ${callImportModalHtml(isAll ? COMPANIES_ORDER[0] : co, media)}`;

  return adminLayout('架電リスト', content, 'calls', isAll ? COMPANIES_ORDER[0] : co);
}

function callImportModalHtml(co, media) {
  const coOpts = COMPANIES_ORDER.map(c => `<option value="${c}"${c === co ? ' selected' : ''}>${COMPANIES[c].label}</option>`).join('');
  const mediaOpts = OPS_MEDIA.map(m => `<option value="${m.id}"${m.id === media ? ' selected' : ''}>${m.name}</option>`).join('');
  return `
  <div id="call-import-modal" class="modal-overlay hidden">
    <div class="modal">
      <h3>データインポート（CSV / Excel）</h3>
      <div class="form-grid">
        <label class="full">取込モード<select id="ci-mode" onchange="callImportModeHint()">
          <option value="insert">新規追加（応募者を取り込む）</option>
          <option value="update">架電結果を反映（既存の対応状況・架電回数・メモを更新）</option>
        </select></label>
        <label>会社<select id="ci-company">${coOpts}</select></label>
        <label>媒体<select id="ci-media">${mediaOpts}</select></label>
        <label class="full">CSV / Excelファイル<input type="file" id="ci-file" accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <label class="full" id="ci-countnew-row" style="display:flex;align-items:center;gap:8px;font-size:13px">
          <input type="checkbox" id="ci-countnew" style="width:auto">
          <strong>本日の新着として計上する</strong>（本日の新規応募・会社別×媒体別に反映）
        </label>
      </div>
      <p id="ci-mode-hint" class="muted" style="font-size:12px;margin:0 0 8px">新規の応募者を取り込みます。CSV・Excel(.xlsx)・スプレッドシートに対応。電話番号・メールが既存と一致する場合は重複として記録します。</p>
      <div id="ci-result" class="import-result"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="callCloseImport()">閉じる</button>
        <button class="btn btn-primary" onclick="callDoImport()">取込実行</button>
      </div>
    </div>
  </div>
  <div id="call-smart-import-modal" class="modal-overlay hidden">
    <div class="modal">
      <h3>🪄 まとめてExcel取込</h3>
      <p class="muted" style="font-size:12px;margin:0 0 10px">
        全会社・全媒体が1つに混在したExcel（シート＝媒体、シート内の会社見出し行＝会社）を自動で振り分けて取り込みます。<br>
        ・シート名から媒体を判定（indeed / engage / 求人ボックス 等）<br>
        ・「合同会社ピープル」「株式会社ライフテイラー」「ニクール」等の見出し行で会社を判定<br>
        ・電話番号／メールが既存と一致する応募者は重複として記録します
      </p>
      <div class="form-grid">
        <label class="full">既定の会社（見出しが無い場合の振り分け先）
          <select id="si-company">${COMPANIES_ORDER.map(c => `<option value="${c}">${COMPANIES[c].label}</option>`).join('')}</select>
        </label>
        <label class="full">Excelファイル(.xlsx)<input type="file" id="si-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <label class="full" style="display:flex;align-items:center;gap:8px;font-size:13px">
          <input type="checkbox" id="si-split" style="width:auto">
          架電回数で振り分ける（未架電→架電リスト / 架電済み→過去リスト）
        </label>
        <label class="full" style="display:flex;align-items:center;gap:8px;font-size:13px">
          <input type="checkbox" id="si-countnew" style="width:auto">
          <strong>本日の新着として計上する</strong>（本日の新規応募・会社別×媒体別に反映）
        </label>
        <label class="full" style="display:flex;align-items:center;gap:8px;font-size:13px">
          <input type="checkbox" id="si-fillmissing" style="width:auto">
          <strong>空欄補完モード</strong>（既存レコードの生年月日・フリガナ等の空欄を補完、新規追加はしない）
        </label>
      </div>
      <p class="muted" style="font-size:11px;margin:0 0 8px">※「本日の新着」にチェック＝今日入ってきた新規応募として計上し架電リストへ。<br>「空欄補完」にチェック＝既存レコードの空欄のみ埋める（重複・新規レコードは作らない）。</p>
      <div id="si-result" class="import-result"></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="callCloseSmartImport()">閉じる</button>
        <button class="btn btn-primary" onclick="callDoSmartImport()">自動振り分けで取込</button>
      </div>
    </div>
  </div>`;
}

// 運用テンプレ用のヘルパ定数
const COMPANIES_ORDER = ['sq', 'bg', 'pe', 'lt', 'nc', 'nx'];
const CALL_STATUSES_LIST = ['新規', '不通', '対応中', '終了'];
function mediaName(id) { if (id === 'all') return 'すべての媒体'; const m = OPS_MEDIA.find(x => x.id === id); return m ? m.name : (id || '-'); }

module.exports = { adminLayout, publicLayout, dashboardPage, adminJobsPage, adminApplicantsPage, adminLogsPage, adminAnalyticsPage, loginPage, jobsListPage, jobsListPageV2, jobDetailPage, jobDetailPageV2, topPageV2, privacyPolicyPage, esc, opsPage, callsPage };
