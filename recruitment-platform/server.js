'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { Jobs, Applicants, Applications, Logs, Analytics } = require('./db-factory');
const { normalizePhone, normalizeEmail, isNameSimilar } = require('./normalize');
const { notify } = require('./lib/notify');
const { requireAuth, login, destroySession, sessionCookie, parseCookies } = require('./lib/auth');
const { sendApplicationThanks, sendNewApplicantAlert } = require('./lib/mailer');
const T = require('./templates');
const { privacyPolicyPage } = T;

const PORT     = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

// ── Utilities ──────────────────────────────────────────────

function send(res, status, body, ct = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': ct });
  res.end(body);
}
function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), 'application/json');
}
function sendError(res, status, msg) {
  sendJSON(res, status, { error: msg });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseJSON(req) {
  const buf = await readBody(req);
  try { return JSON.parse(buf.toString()); } catch { return {}; }
}

// Simple multipart parser (extract first file's text content)
function parseMultipart(buf, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  let pos = 0;
  const parts = [];
  while (pos < buf.length) {
    const start = buf.indexOf(boundaryBuf, pos);
    if (start === -1) break;
    pos = start + boundaryBuf.length;
    if (buf[pos] === 0x2D && buf[pos+1] === 0x2D) break; // --
    pos += 2; // skip \r\n
    // Find header end
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;
    const header = buf.slice(pos, headerEnd).toString();
    pos = headerEnd + 4;
    const nextBoundary = buf.indexOf(boundaryBuf, pos);
    const content = nextBoundary !== -1 ? buf.slice(pos, nextBoundary - 2) : buf.slice(pos);
    parts.push({ header, content });
    pos = nextBoundary !== -1 ? nextBoundary : buf.length;
  }
  return parts;
}

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

// Map CSV columns to applicant fields (flexible column names)
function mapCSVRow(row) {
  const col = (keys) => {
    for (const k of keys) {
      const v = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
      if (v) return v;
    }
    return '';
  };
  return {
    name:        col(['氏名','name','名前','お名前','姓名']),
    phone:       col(['電話番号','phone','tel','電話','携帯']),
    email:       col(['メール','email','mail','メールアドレス']),
    age:         col(['年齢','age']),
    address:     col(['住所','address','addr']),
    sourceMedia: col(['媒体','source_media','応募媒体','media']) || 'CSV取込',
    appliedAt:   col(['応募日','applied_at','応募日時','日付']),
  };
}

// SSE helpers
function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
}
function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Location normalizer: strip 丁目/番地/号 and beyond ──
function normLocation(loc) {
  return (loc || '')
    .replace(/[0-9０-９]+丁目.*$/, '')
    .replace(/[0-9０-９]+番地.*$/, '')
    .replace(/[0-9０-９]+-[0-9０-９].*$/, '')
    .trim();
}

// ── Salary parser: extract min/max numbers and type for media XML ──
function parseSalaryNums(salary) {
  const s = (salary || '').replace(/,/g, '').replace(/，/g, '');
  let type = 'monthly';
  if (/時給|時間/.test(s)) type = 'hourly';
  if (/日給|日当/.test(s)) type = 'daily';
  if (/年収|年俸/.test(s)) type = 'yearly';
  const toNum = str => {
    const m = str.match(/([\d.]+)万/);
    if (m) return Math.round(parseFloat(m[1]) * 10000);
    const n = str.match(/[\d]+/);
    return n ? parseInt(n[0], 10) : null;
  };
  const range = s.match(/([\d.]+万?[\d]*)\D*[〜～〜~]\D*([\d.]+万?[\d]*)/);
  if (range) {
    const min = toNum(range[1]); const max = toNum(range[2]);
    if (min && max) return { min, max, type };
  }
  const single = toNum(s);
  return single ? { min: single, type } : { type };
}

// Kyujinbox salary-type label
function kyujinboxSalaryType(type) {
  return { hourly: '時給', daily: '日給', yearly: '年収' }[type] || '月給';
}

// XML generator
function generateKyujinboxXML(jobs) {
  const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
  const company = process.env.COMPANY_NAME || '採用企業';
  const today   = new Date().toISOString().slice(0, 10);

  const items = jobs.map(j => {
    const sal    = parseSalaryNums(j.salary);
    const salType = kyujinboxSalaryType(sal.type);
    const loc    = normLocation(j.location);
    const catch_ = j.catchcopy || JSON.parse(j.tags || '[]').slice(0, 2).join('・') || j.employment_type;
    const pubDate = (j.published_at || j.created_at || today).slice(0, 10);
    const endDate = j.expires_at ? j.expires_at.slice(0, 10) : '';
    return `  <job>
    <job-id><![CDATA[${j.id}]]></job-id>
    <job-title><![CDATA[${j.title}]]></job-title>
    <job-catch><![CDATA[${catch_}]]></job-catch>
    <job-url>${siteUrl}/jobs/${j.id}</job-url>
    <company-name><![CDATA[${company}]]></company-name>
    <job-category><![CDATA[${j.job_type}]]></job-category>
    <job-type><![CDATA[${j.employment_type}]]></job-type>
    <salary-type>${salType}</salary-type>
    <salary-lower>${sal.min || ''}</salary-lower>
    <salary-upper>${sal.max || ''}</salary-upper>
    <job-address><![CDATA[${loc}]]></job-address>
    <job-description><![CDATA[${j.description}]]></job-description>
    <pub-date>${pubDate}</pub-date>
    <end-date>${endDate}</end-date>
  </job>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<jobs>
${items}
</jobs>`;
}

function generateStanbyXML(jobs) {
  const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
  const company = process.env.COMPANY_NAME || '採用企業';

  const items = jobs.map(j => {
    const sal    = parseSalaryNums(j.salary);
    const salTypeMap = { hourly: 'hourly', daily: 'daily', yearly: 'yearly', monthly: 'monthly' };
    const loc    = normLocation(j.location);
    const pref   = loc.match(/^(東京都|大阪府|神奈川県|愛知県|福岡県|北海道|[^\s]{2,4}[都道府県])/)?.[1] || loc;
    const catch_ = j.catchcopy || '';
    const desc   = j.description.slice(0, 500);
    const updated = (j.updated_at || j.created_at || new Date().toISOString()).slice(0, 10);
    return `  <item>
    <title><![CDATA[${j.title}]]></title>
    <url>${siteUrl}/jobs/${j.id}</url>
    <company><![CDATA[${company}]]></company>
    <catch><![CDATA[${catch_}]]></catch>
    <salary><![CDATA[${j.salary}]]></salary>
    <salary-min>${sal.min || ''}</salary-min>
    <salary-max>${sal.max || ''}</salary-max>
    <salary-type>${salTypeMap[sal.type] || 'monthly'}</salary-type>
    <prefecture><![CDATA[${pref}]]></prefecture>
    <location><![CDATA[${loc}]]></location>
    <job_type><![CDATA[${j.employment_type}]]></job_type>
    <occupation><![CDATA[${j.job_type}]]></occupation>
    <description><![CDATA[${desc}]]></description>
    <updated>${updated}</updated>
  </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<items>
${items}
</items>`;
}

// CSV export
function generateCSV(applicants) {
  const headers = ['氏名','電話番号','メールアドレス','年齢','住所','応募媒体','応募日時','ステータス','応募求人','重複フラグ'];
  const rows = applicants
    .filter(a => !a.is_duplicate) // exclude duplicates for CA list
    .map(a => [
      a.name, a.phone, a.email, a.age||'', a.address||'',
      a.source_media, (a.applied_at||'').slice(0,16).replace('T',' '),
      a.status, a.job_titles||'', a.is_duplicate ? '重複' : ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// VPN check
let vpnCache = { connected: false, ts: 0 };
async function checkVPN() {
  // Cache for 30 seconds
  if (Date.now() - vpnCache.ts < 30000) return vpnCache.connected;
  const vpnRanges = (process.env.VPN_IP_RANGES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!vpnRanges.length) {
    // Without config, always return true in development
    vpnCache = { connected: true, ts: Date.now() };
    return true;
  }
  try {
    // Try to get external IP
    const result = await new Promise((resolve, reject) => {
      const opts = url.parse('http://api.ipify.org');
      const req2 = http.get(opts, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(d.trim()));
      });
      req2.setTimeout(5000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.on('error', reject);
    });
    const connected = vpnRanges.some(range => result.startsWith(range.split('/')[0].split('.').slice(0,3).join('.')));
    vpnCache = { connected, ts: Date.now() };
    return connected;
  } catch {
    vpnCache = { connected: false, ts: Date.now() };
    return false;
  }
}

// Duplicate check
async function checkDuplicate(data) {
  const nPhone = normalizePhone(data.phone);
  const nEmail  = normalizeEmail(data.email);
  return await Applicants.findDuplicate(nPhone, nEmail);
}

// ── Claude API ──────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  return new Promise((resolve, reject) => {
    const req2 = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          const obj = JSON.parse(d);
          if (obj.error) reject(new Error(obj.error.message || 'API error'));
          else resolve(obj.content[0].text);
        } catch { reject(new Error('Invalid response: ' + d.slice(0, 200))); }
      });
    });
    req2.setTimeout(30000, () => { req2.destroy(); reject(new Error('タイムアウト（30秒）')); });
    req2.on('error', reject);
    req2.write(body);
    req2.end();
  });
}

// ── Dashboard stats helpers ─────────────────────────────────

async function computeDashboardStats() {
  const allJobs = await Jobs.findAll();

  // BAN risk: count published jobs per media
  const kyujinboxJobs = allJobs.filter(j => j.is_published && JSON.parse(j.target_media || '[]').includes('求人ボックス')).length;
  const stanbyJobs    = allJobs.filter(j => j.is_published && JSON.parse(j.target_media || '[]').includes('スタンバイ')).length;
  // published jobs with no media target → count all published for fallback display
  const publishedTotal = allJobs.filter(j => j.is_published).length;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recentLogs = await Logs.findAll(200);
  const weeklyPosts = recentLogs.filter(l =>
    l.action === 'kyujinbox_post' && l.status === 'success' && (l.created_at || '').slice(0, 10) >= weekAgo
  ).length;

  // Media breakdown
  const allApplicants = await Applicants.findAll();
  const mediaMap = {};
  for (const a of allApplicants) {
    const m = a.source_media || 'その他';
    mediaMap[m] = (mediaMap[m] || 0) + 1;
  }
  const mediaBreakdown = Object.entries(mediaMap)
    .sort((a, b) => b[1] - a[1])
    .map(([media, count]) => ({ media, count }));

  return {
    banRisk: { kyujinbox: kyujinboxJobs || publishedTotal, stanby: stanbyJobs, weeklyPosts },
    mediaBreakdown
  };
}

// ── Router ─────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  const method = req.method;
  const query = parsed.query;

  // ── Static files ──
  if (pathname === '/styles.css' || pathname === '/admin.js') {
    const fp = path.join(PUBLIC_DIR, pathname);
    try {
      const content = fs.readFileSync(fp);
      const ct = pathname.endsWith('.css') ? 'text/css' : 'application/javascript';
      send(res, 200, content, ct);
    } catch { send(res, 404, 'Not Found'); }
    return;
  }

  // ── Root redirect ──
  if (pathname === '/') { res.writeHead(302, { Location: '/jobs' }); res.end(); return; }

  // ── Admin login ──
  if (pathname === '/admin/login' && method === 'GET') {
    send(res, 200, T.loginPage());
    return;
  }
  if (pathname === '/admin/login' && method === 'POST') {
    const body = await readBody(req);
    const params = new URLSearchParams(body.toString());
    const token = login(params.get('username') || '', params.get('password') || '');
    if (token) {
      res.writeHead(302, { 'Set-Cookie': sessionCookie(token), Location: '/admin' });
      res.end();
    } else {
      send(res, 401, T.loginPage('ユーザー名またはパスワードが正しくありません'));
    }
    return;
  }
  if (pathname === '/admin/logout') {
    const cookies = parseCookies(req);
    destroySession(cookies.get('admin_session') || '');
    res.writeHead(302, { 'Set-Cookie': sessionCookie('', true), Location: '/admin/login' });
    res.end();
    return;
  }

  // ── Public: Privacy Policy ──
  if (pathname === '/privacy' && method === 'GET') {
    send(res, 200, privacyPolicyPage());
    return;
  }

  // ── Public: Jobs list ──
  if (pathname === '/jobs' && method === 'GET') {
    const search = query.q || '';
    let jobs = await Jobs.findAll(true);
    if (search) {
      const s = search.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(s) ||
        j.location.toLowerCase().includes(s) ||
        j.job_type.toLowerCase().includes(s) ||
        (j.tags || '').toLowerCase().includes(s)
      );
    }
    send(res, 200, T.jobsListPage(jobs, search));
    return;
  }

  // ── Public: Job detail ──
  const jobDetailMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobDetailMatch && method === 'GET') {
    const job = await Jobs.findById(jobDetailMatch[1]);
    if (!job || !job.is_published) { send(res, 404, '<h1>求人が見つかりません</h1>'); return; }
    send(res, 200, T.jobDetailPage(job));
    return;
  }

  // ── API: Apply ──
  if (pathname === '/api/apply' && method === 'POST') {
    const body = await parseJSON(req);
    if (!body.name || !body.phone || !body.email) {
      sendError(res, 400, '氏名・電話・メールは必須です'); return;
    }
    const dupId = await checkDuplicate(body);
    const applicant = await Applicants.create({
      ...body,
      isDuplicate: !!dupId,
      duplicateOfId: dupId,
      status: dupId ? '重複' : '新規',
      sourceMedia: body.sourceMedia || 'direct'
    });
    let jobTitle = body.jobTitle || '';
    if (body.jobId) {
      const job = await Jobs.findById(body.jobId);
      jobTitle = job ? job.title : jobTitle;
      await Applications.create({
        applicantId: applicant.id,
        jobId: body.jobId,
        jobTitle,
        sourceMedia: 'direct'
      });
    }
    // Fire-and-forget email notifications (don't block response)
    sendApplicationThanks(applicant, jobTitle).catch(() => {});
    sendNewApplicantAlert({ ...applicant, sourceMedia: applicant.source_media }, jobTitle).catch(() => {});
    sendJSON(res, 201, { ok: true, id: applicant.id, isDuplicate: !!dupId });
    return;
  }

  // ── SEO: sitemap.xml ──
  if (pathname === '/sitemap.xml' && method === 'GET') {
    const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
    const jobs = await Jobs.findAll(true);
    const today = new Date().toISOString().slice(0, 10);
    const jobUrls = jobs.map(j => `  <url>
    <loc>${siteUrl}/jobs/${j.id}</loc>
    <lastmod>${(j.updated_at || j.created_at || today).slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/jobs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${jobUrls}
</urlset>`;
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xml);
    return;
  }

  // ── SEO: robots.txt ──
  if (pathname === '/robots.txt' && method === 'GET') {
    const siteUrl = process.env.SITE_URL || `http://localhost:${PORT}`;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`User-agent: *\nAllow: /jobs\nAllow: /jobs/\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
    return;
  }

  // ── API: AI Rewrite ──
  if (pathname === '/api/ai/rewrite' && method === 'POST') {
    const body = await parseJSON(req);
    const { title, location, salary, jobType, employmentType, existingDescription } = body;
    if (!title) { sendError(res, 400, 'タイトルは必須です'); return; }

    const system = `あなたは採用広告のコピーライターです。求職者の心に響く求人原稿を日本語で作成します。
以下の構成で書いてください：
◆仕事内容（主な業務を3〜5点の箇条書き）
◆職場環境（雰囲気・設備・特徴）
◆こんな方歓迎（求める人物像・スキル）

読みやすく具体的に、求職者が応募したくなる文章を300〜500文字で書いてください。`;

    const userMsg = `【職種】${jobType || 'その他'} / 【雇用形態】${employmentType || '正社員'}\n【タイトル】${title}\n【勤務地】${location || ''}\n【給与】${salary || ''}${existingDescription ? `\n【既存原稿（参考）】\n${existingDescription}` : ''}`;

    try {
      const text = await callClaude(system, userMsg);
      sendJSON(res, 200, { ok: true, text });
    } catch (e) {
      sendError(res, 500, `AI生成に失敗しました: ${e.message}`);
    }
    return;
  }

  // ── API: AI Bulk Job Generate (SSE) ──
  if (pathname === '/api/generate/bulk' && method === 'GET') {
    sseInit(res);

    if (!process.env.ANTHROPIC_API_KEY) {
      sseSend(res, { message: 'ANTHROPIC_API_KEY が設定されていません', type: 'error', done: true, success: false });
      res.end(); return;
    }

    const types      = (query.types     || '').split(',').map(s => s.trim()).filter(Boolean);
    const locations  = (query.locations || '').split(',').map(s => s.trim()).filter(Boolean);
    const empType    = query.employmentType || '正社員';
    const mediaList  = (query.media || '').split(',').map(s => s.trim()).filter(Boolean);

    if (!types.length || !locations.length) {
      sseSend(res, { message: '職種と勤務地を1つ以上選択してください', type: 'error', done: true, success: false });
      res.end(); return;
    }

    const salaryMap = {
      '看護師・准看護師':              '月給28万円〜40万円',
      '介護士・ケアワーカー':          '月給22万円〜30万円',
      '調理師・キッチンスタッフ':      '月給22万円〜30万円',
      '事務・受付スタッフ':            '月給20万円〜27万円',
      '営業（個人向け）':              '月給25万円〜45万円（インセンティブあり）',
      '営業（法人向け）':              '月給28万円〜50万円（インセンティブあり）',
      'Webエンジニア（フロントエンド）': '月給30万円〜55万円',
      'Webエンジニア（バックエンド）':  '月給35万円〜60万円',
      '保育士・幼稚園教諭':            '月給22万円〜28万円',
      'ドライバー・配送':              '月給25万円〜35万円',
    };

    const system = `あなたは採用広告のコピーライターです。指定された職種・勤務地・雇用形態の求人情報をJSON形式で生成してください。
必ず以下のJSON形式のみを返してください（マークダウン・コードブロック不要）：
{"title":"求人タイトル","catchcopy":"キャッチコピー","description":"仕事内容","tags":["タグ1","タグ2","タグ3","タグ4"]}

title: 「具体的な職種名 勤務地エリア名」の形式。例「介護士（正社員）東京・新宿」
catchcopy: 求職者の目を引く短いコピー20〜35文字。例「未経験OK！研修充実で安心スタート」
description: 以下の構成で400〜600文字：
◆仕事内容
（主な業務を3〜5点の箇条書き）

◆職場環境
（職場の雰囲気・設備・福利厚生）

◆こんな方歓迎
（求める人物像・必要スキル・歓迎条件）
tags: Googleしごと検索・求人媒体で求職者が検索するキーワードを4〜5個。`;

    const combos = [];
    for (const t of types) for (const l of locations) combos.push({ t, l });
    const total = combos.length;

    sseSend(res, { message: `✨ ${total}件の求人原稿を生成します...`, type: 'info', total });

    let successCount = 0;
    let aborted = false;
    req.on('close', () => { aborted = true; });

    (async () => {
      for (let i = 0; i < combos.length; i++) {
        if (aborted) break;
        const { t, l } = combos[i];
        const salary   = salaryMap[t] || '月給22万円〜35万円';
        const shortLoc = l.replace('東京都', '東京・').replace('大阪府大阪市', '大阪・').replace(/区$/, '').replace(/市$/, '');

        sseSend(res, { message: `[${i+1}/${total}] ${t} × ${shortLoc} を生成中...`, type: 'info', current: i + 1, total });

        try {
          const userMsg = `職種: ${t}\n勤務地: ${l}\n雇用形態: ${empType}\n給与: ${salary}`;
          const raw  = await callClaude(system, userMsg);
          const json = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());

          const assignedMedia = mediaList.length > 0 ? [mediaList[i % mediaList.length]] : [];
          await Jobs.create({
            title:          json.title       || `${t} ${shortLoc}`,
            catchcopy:      json.catchcopy   || '',
            location:       normLocation(l),
            salary,
            jobType:        t,
            employmentType: empType,
            description:    json.description || '',
            tags:           json.tags        || [],
            targetMedia:    assignedMedia,
            isPublished:    false,
          });
          successCount++;
          sseSend(res, { message: `✅ 保存: ${json.title}`, type: 'success', current: i + 1, total });
        } catch (e) {
          sseSend(res, { message: `⚠️ ${t}×${shortLoc} 失敗: ${e.message}`, type: 'warn', current: i + 1, total });
        }
      }

      await Logs.create('bulk_generate', 'success', `AI一括生成: ${successCount}/${total}件`);
      notify(`AI一括生成完了: ${successCount}件の求人を下書き保存しました`).catch(() => {});
      sseSend(res, {
        message: `✅ 完了！ ${successCount}件の求人を下書き保存しました。求人管理から確認・公開してください。`,
        type: 'success', done: true, success: true, count: successCount,
      });
      res.end();
    })().catch(e => {
      sseSend(res, { message: `❌ エラー: ${e.message}`, type: 'error', done: true, success: false });
      res.end();
    });
    return;
  }

  // ── Auth guard: all /admin routes except /admin/login ──
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!requireAuth(req, res)) return;
  }

  // ── Admin: Dashboard ──
  if (pathname === '/admin' && method === 'GET') {
    const stats = {
      jobs: await Jobs.count(),
      today: await Applicants.todayCount(),
      duplicates: await Applicants.duplicateCount()
    };
    const { banRisk, mediaBreakdown } = await computeDashboardStats();
    send(res, 200, T.dashboardPage({ stats, lastPost: await Logs.lastPostTime(), banRisk, mediaBreakdown }));
    return;
  }

  // ── Admin: Jobs page ──
  if (pathname === '/admin/jobs' && method === 'GET') {
    send(res, 200, T.adminJobsPage(await Jobs.findAll()));
    return;
  }

  // ── Admin: Applicants page ──
  if (pathname === '/admin/applicants' && method === 'GET') {
    const filter = query.status || 'all';
    const applicants = await Applicants.findAll({ status: filter, search: query.search });
    send(res, 200, T.adminApplicantsPage(applicants, filter));
    return;
  }

  // ── Admin: Logs page ──
  if (pathname === '/admin/logs' && method === 'GET') {
    send(res, 200, T.adminLogsPage(await Logs.findAll()));
    return;
  }


  // ── Admin: Analytics page ──
  if (pathname === '/admin/analytics' && method === 'GET') {
    const data = {
      daily:   await Analytics.dailyApplications(30),
      media:   await Analytics.mediaBreakdown(),
      status:  await Analytics.statusDistribution(),
      topJobs: await Analytics.topJobs(10),
      weekly:  await Analytics.weeklySummary()
    };
    send(res, 200, T.adminAnalyticsPage(data));
    return;
  }

  // ── API: Analytics JSON ──
  if (pathname === '/api/analytics' && method === 'GET') {
    sendJSON(res, 200, {
      daily:   await Analytics.dailyApplications(30),
      media:   await Analytics.mediaBreakdown(),
      status:  await Analytics.statusDistribution(),
      topJobs: await Analytics.topJobs(10),
      weekly:  await Analytics.weeklySummary()
    });
    return;
  }

  // ── API: Jobs CRUD ──
  if (pathname === '/api/jobs' && method === 'GET') {
    sendJSON(res, 200, await Jobs.findAll());
    return;
  }
  if (pathname === '/api/jobs' && method === 'POST') {
    const body = await parseJSON(req);
    if (!body.title) { sendError(res, 400, 'タイトルは必須です'); return; }
    if (body.location) body.location = normLocation(body.location);
    sendJSON(res, 201, await Jobs.create(body));
    return;
  }
  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const id = jobMatch[1];
    if (method === 'GET') {
      const j = await Jobs.findById(id);
      if (!j) { sendError(res, 404, '求人が見つかりません'); return; }
      sendJSON(res, 200, j);
      return;
    }
    if (method === 'PUT') {
      const body = await parseJSON(req);
      if (body.location) body.location = normLocation(body.location);
      const j = await Jobs.update(id, body);
      sendJSON(res, 200, j);
      return;
    }
    if (method === 'DELETE') {
      await Jobs.delete(id);
      sendJSON(res, 200, { ok: true });
      return;
    }
  }

  // ── API: Applicants ──
  if (pathname === '/api/applicants' && method === 'GET') {
    sendJSON(res, 200, await Applicants.findAll());
    return;
  }
  const appMatch = pathname.match(/^\/api\/applicants\/([^/]+)$/);
  if (appMatch) {
    const id = appMatch[1];
    if (method === 'PUT') {
      const body = await parseJSON(req);
      sendJSON(res, 200, await Applicants.update(id, body));
      return;
    }
    if (method === 'GET') {
      const a = await Applicants.findById(id);
      if (!a) { sendError(res, 404, '応募者が見つかりません'); return; }
      sendJSON(res, 200, a);
      return;
    }
  }

  // ── API: XML Feed ──
  if (pathname === '/api/feed/kyujinbox' && method === 'GET') {
    const jobs = await Jobs.findAll(true);
    const xml = generateKyujinboxXML(jobs);
    await Logs.create('xml_generate', 'success', `求人ボックスXML生成: ${jobs.length}件`);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="kyujinbox-feed.xml"' });
    res.end(xml);
    return;
  }
  if (pathname === '/api/feed/stanby' && method === 'GET') {
    const jobs = await Jobs.findAll(true);
    const xml = generateStanbyXML(jobs);
    await Logs.create('xml_generate', 'success', `スタンバイXML生成: ${jobs.length}件`);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="stanby-feed.xml"' });
    res.end(xml);
    return;
  }

  // ── API: CSV Import ──
  if (pathname === '/api/import/csv' && method === 'POST') {
    const buf = await readBody(req);
    const ct = req.headers['content-type'] || '';
    let csvText = '';
    if (ct.includes('multipart/form-data')) {
      const boundaryMatch = ct.match(/boundary=([^;]+)/);
      if (!boundaryMatch) { sendError(res, 400, 'boundary not found'); return; }
      const parts = parseMultipart(buf, boundaryMatch[1].trim());
      const filePart = parts.find(p => p.header.includes('filename'));
      if (!filePart) { sendError(res, 400, 'ファイルが見つかりません'); return; }
      csvText = filePart.content.toString('utf8');
    } else {
      csvText = buf.toString('utf8');
    }

    const rows = parseCSV(csvText);
    let imported = 0, duplicates = 0;
    for (const row of rows) {
      const mapped = mapCSVRow(row);
      if (!mapped.name || (!mapped.phone && !mapped.email)) continue;
      const dupId = await checkDuplicate(mapped);
      await Applicants.create({
        ...mapped,
        isDuplicate: !!dupId,
        duplicateOfId: dupId,
        status: dupId ? '重複' : '新規'
      });
      if (dupId) duplicates++; else imported++;
    }
    await Logs.create('csv_import', 'success', `CSV取込: ${imported}件新規, ${duplicates}件重複`);
    sendJSON(res, 200, { ok: true, imported, duplicates, total: imported + duplicates });
    return;
  }

  // ── API: CSV Export ──
  if (pathname === '/api/export/csv' && method === 'GET') {
    const applicants = await Applicants.findAll();
    const csv = generateCSV(applicants);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ca-list-${new Date().toISOString().slice(0,10)}.csv"`
    });
    res.end('﻿' + csv); // BOM for Excel
    return;
  }

  // ── API: VPN Status ──
  if (pathname === '/api/vpn/status' && method === 'GET') {
    const connected = await checkVPN();
    sendJSON(res, 200, { connected, ts: Date.now() });
    return;
  }

  // ── API: Indeed Scrape (SSE) ──
  if (pathname === '/api/scrape/indeed' && method === 'GET') {
    sseInit(res);
    const logId = await Logs.create('indeed_scrape', 'running', '開始');

    sseSend(res, { message: 'VPN接続を確認しています...', type: 'info' });
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      sseSend(res, { message: '❌ VPN未接続です。処理を中止します。', type: 'error', done: true, success: false });
      await Logs.create('indeed_scrape', 'error', 'VPN未接続');
      res.end();
      return;
    }

    const scriptPath = path.join(SCRIPTS_DIR, 'indeed_scraper.py');
    if (!fs.existsSync(scriptPath)) {
      sseSend(res, { message: '⚠️ スクレイパースクリプトが見つかりません（scripts/indeed_scraper.py）', type: 'warn' });
      sseSend(res, { message: 'デモモード: サンプルデータを取込します...', type: 'info' });
      // Demo: create sample applicants
      const samples = [
        { name: '田中 花子', phone: '090-1234-5678', email: 'hanako@example.com', sourceMedia: 'Indeed', appliedAt: new Date().toISOString() },
        { name: '佐藤 次郎', phone: '080-8765-4321', email: 'jiro@example.com', sourceMedia: 'Indeed', appliedAt: new Date().toISOString() },
        { name: '鈴木 三郎', phone: '070-1111-2222', email: 'saburo@example.com', sourceMedia: 'Indeed', appliedAt: new Date().toISOString() },
      ];
      let count = 0;
      for (const s of samples) {
        const dup = await checkDuplicate(s);
        await Applicants.create({ ...s, isDuplicate: !!dup, duplicateOfId: dup, status: dup ? '重複' : '新規' });
        count++;
        sseSend(res, { message: `✅ 取得: ${s.name}（${s.phone}）`, type: 'success' });
        await new Promise(r => setTimeout(r, 300));
      }
      await Logs.create('indeed_scrape', 'success', `Indeed取込完了（デモ）: ${count}件`);
      sseSend(res, { message: `✅ 完了: ${count}件取得しました（デモモード）`, type: 'success', done: true, success: true });
      res.end();
      return;
    }

    // Run real Python script
    sseSend(res, { message: '🔑 Indeedにログイン中...', type: 'info' });
    const env = { ...process.env };
    const proc = spawn('python3', [scriptPath], { env });
    let count = 0;

    proc.stdout.on('data', async data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'progress') {
            sseSend(res, { message: obj.message, type: obj.level || 'info' });
          } else if (obj.type === 'applicant') {
            const dup = await checkDuplicate(obj.data);
            await Applicants.create({ ...obj.data, sourceMedia: 'Indeed', isDuplicate: !!dup, duplicateOfId: dup, status: dup ? '重複' : '新規' });
            count++;
            sseSend(res, { message: `✅ 取得: ${obj.data.name}（${obj.data.phone}）`, type: 'success' });
          }
        } catch {
          sseSend(res, { message: line, type: 'info' });
        }
      }
    });

    proc.stderr.on('data', data => {
      sseSend(res, { message: `⚠️ ${data.toString().trim()}`, type: 'warn' });
    });

    proc.on('close', async code => {
      const ok = code === 0;
      const msg = ok ? `✅ Indeed取込完了: ${count}件取得` : `❌ Indeed取込失敗（コード: ${code}）`;
      await Logs.create('indeed_scrape', ok ? 'success' : 'error', msg);
      notify(msg, { emoji: ok ? ':white_check_mark:' : ':x:' }).catch(() => {});
      sseSend(res, {
        message: ok ? `✅ 完了: ${count}件取得しました` : `❌ スクレイピングが失敗しました（終了コード: ${code}）`,
        type: ok ? 'success' : 'error',
        done: true,
        success: ok
      });
      res.end();
    });

    req.on('close', () => { try { proc.kill(); } catch {} });
    return;
  }

  // ── API: Kyujinbox Post (SSE) ──
  if (pathname === '/api/post/kyujinbox' && method === 'GET') {
    sseInit(res);

    sseSend(res, { message: 'VPN接続を確認しています...', type: 'info' });
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      sseSend(res, { message: '❌ VPN未接続です。処理を中止します。', type: 'error', done: true, success: false });
      await Logs.create('kyujinbox_post', 'error', 'VPN未接続');
      res.end();
      return;
    }

    const jobs = await Jobs.findAll(true);
    if (jobs.length === 0) {
      sseSend(res, { message: '⚠️ 公開中の求人がありません', type: 'warn', done: true, success: false });
      res.end();
      return;
    }

    const scriptPath = path.join(SCRIPTS_DIR, 'kyujinbox_poster.py');
    if (!fs.existsSync(scriptPath)) {
      sseSend(res, { message: '⚠️ 投稿スクリプトが見つかりません（scripts/kyujinbox_poster.py）', type: 'warn' });
      sseSend(res, { message: 'デモモード: 投稿シミュレーションを実行します...', type: 'info' });
      const target = jobs[0];
      sseSend(res, { message: `🔑 求人ボックスにログイン中...`, type: 'info' });
      await new Promise(r => setTimeout(r, 800));
      sseSend(res, { message: `📝 「${target.title}」を投稿中...`, type: 'info' });
      await new Promise(r => setTimeout(r, 1200));
      sseSend(res, { message: `✅ 「${target.title}」を投稿しました`, type: 'success' });
      await Logs.create('kyujinbox_post', 'success', `求人ボックス投稿（デモ）: ${target.title}`);
      sseSend(res, { message: `✅ 完了: 1件投稿しました（デモモード）`, type: 'success', done: true, success: true });
      res.end();
      return;
    }

    const jobsJson = JSON.stringify(jobs.slice(0, 2)); // max 2 per day
    const proc = spawn('python3', [scriptPath], {
      env: { ...process.env },
      stdin: 'pipe'
    });
    proc.stdin.write(jobsJson);
    proc.stdin.end();

    proc.stdout.on('data', data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          sseSend(res, { message: obj.message, type: obj.level || 'info' });
        } catch {
          sseSend(res, { message: line, type: 'info' });
        }
      }
    });

    proc.stderr.on('data', data => {
      sseSend(res, { message: `⚠️ ${data.toString().trim()}`, type: 'warn' });
    });

    proc.on('close', async code => {
      const ok = code === 0;
      const msg = ok ? '✅ 求人ボックス投稿完了' : `❌ 求人ボックス投稿失敗(exit ${code})`;
      await Logs.create('kyujinbox_post', ok ? 'success' : 'error', msg);
      notify(msg, { emoji: ok ? ':rocket:' : ':x:' }).catch(() => {});
      sseSend(res, {
        message: ok ? '✅ 求人ボックスへの投稿が完了しました' : `❌ 投稿が失敗しました（コード: ${code}）`,
        type: ok ? 'success' : 'error',
        done: true,
        success: ok
      });
      res.end();
    });

    req.on('close', () => { try { proc.kill(); } catch {} });
    return;
  }

  if (pathname === '/api/post/stanby' && method === 'GET') {
    sseInit(res);

    sseSend(res, { message: 'VPN接続を確認しています...', type: 'info' });
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      sseSend(res, { message: '❌ VPN未接続です。処理を中止します。', type: 'error', done: true, success: false });
      await Logs.create('stanby_post', 'error', 'VPN未接続');
      res.end();
      return;
    }

    const jobs = await Jobs.findAll(true);
    if (jobs.length === 0) {
      sseSend(res, { message: '⚠️ 公開中の求人がありません', type: 'warn', done: true, success: false });
      res.end();
      return;
    }

    const scriptPath = path.join(SCRIPTS_DIR, 'stanby_poster.py');
    if (!fs.existsSync(scriptPath)) {
      sseSend(res, { message: '⚠️ 投稿スクリプトが見つかりません（scripts/stanby_poster.py）', type: 'warn' });
      sseSend(res, { message: 'デモモード: 投稿シミュレーションを実行します...', type: 'info' });
      const target = jobs[0];
      sseSend(res, { message: `🔑 スタンバイにログイン中...`, type: 'info' });
      await new Promise(r => setTimeout(r, 800));
      sseSend(res, { message: `📝 「${target.title}」を投稿中...`, type: 'info' });
      await new Promise(r => setTimeout(r, 1200));
      sseSend(res, { message: `✅ 「${target.title}」を投稿しました`, type: 'success' });
      await Logs.create('stanby_post', 'success', `スタンバイ投稿（デモ）: ${target.title}`);
      sseSend(res, { message: `✅ 完了: 1件投稿しました（デモモード）`, type: 'success', done: true, success: true });
      res.end();
      return;
    }

    const stanbyJobsJson = JSON.stringify(jobs.slice(0, 3)); // max 3 per run
    const stanbyProc = spawn('python3', [scriptPath], {
      env: { ...process.env },
      stdin: 'pipe'
    });
    stanbyProc.stdin.write(stanbyJobsJson);
    stanbyProc.stdin.end();

    stanbyProc.stdout.on('data', data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          sseSend(res, { message: obj.message, type: obj.level || 'info' });
        } catch {
          sseSend(res, { message: line, type: 'info' });
        }
      }
    });

    stanbyProc.stderr.on('data', data => {
      sseSend(res, { message: `⚠️ ${data.toString().trim()}`, type: 'warn' });
    });

    stanbyProc.on('close', async code => {
      const ok = code === 0;
      const msg = ok ? '✅ スタンバイ投稿完了' : `❌ スタンバイ投稿失敗(exit ${code})`;
      await Logs.create('stanby_post', ok ? 'success' : 'error', msg);
      notify(msg, { emoji: ok ? ':rocket:' : ':x:' }).catch(() => {});
      sseSend(res, {
        message: ok ? '✅ スタンバイへの投稿が完了しました' : `❌ 投稿が失敗しました（コード: ${code}）`,
        type: ok ? 'success' : 'error',
        done: true,
        success: ok
      });
      res.end();
    });

    req.on('close', () => { try { stanbyProc.kill(); } catch {} });
    return;
  }

  if (pathname === '/api/post/indeed' && method === 'GET') {
    sseInit(res);

    sseSend(res, { message: 'VPN接続を確認しています...', type: 'info' });
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      sseSend(res, { message: '❌ VPN未接続です。処理を中止します。', type: 'error', done: true, success: false });
      await Logs.create('indeed_post', 'error', 'VPN未接続');
      res.end();
      return;
    }

    const indeedJobs = await Jobs.findAll(true);
    if (indeedJobs.length === 0) {
      sseSend(res, { message: '⚠️ 公開中の求人がありません', type: 'warn', done: true, success: false });
      res.end();
      return;
    }

    const indeedScriptPath = path.join(SCRIPTS_DIR, 'indeed_poster.py');
    if (!fs.existsSync(indeedScriptPath)) {
      sseSend(res, { message: '⚠️ 掲載スクリプトが見つかりません（scripts/indeed_poster.py）', type: 'warn' });
      sseSend(res, { message: 'デモモード: 掲載シミュレーションを実行します...', type: 'info' });
      const target = indeedJobs[0];
      sseSend(res, { message: '🔑 Indeed 掲載管理画面にログイン中...', type: 'info' });
      await new Promise(r => setTimeout(r, 800));
      sseSend(res, { message: `📝 「${target.title}」を掲載中...`, type: 'info' });
      await new Promise(r => setTimeout(r, 1200));
      sseSend(res, { message: `✅ 「${target.title}」を掲載しました`, type: 'success' });
      await Logs.create('indeed_post', 'success', `Indeed掲載（デモ）: ${target.title}`);
      sseSend(res, { message: '✅ 完了: 1件掲載しました（デモモード）', type: 'success', done: true, success: true });
      res.end();
      return;
    }

    const indeedJobsJson = JSON.stringify(indeedJobs.slice(0, 2)); // max 2 per day
    const indeedProc = spawn('python3', [indeedScriptPath], {
      env: { ...process.env },
      stdin: 'pipe'
    });
    indeedProc.stdin.write(indeedJobsJson);
    indeedProc.stdin.end();

    indeedProc.stdout.on('data', data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          sseSend(res, { message: obj.message, type: obj.level || 'info' });
        } catch {
          sseSend(res, { message: line, type: 'info' });
        }
      }
    });

    indeedProc.stderr.on('data', data => {
      sseSend(res, { message: `⚠️ ${data.toString().trim()}`, type: 'warn' });
    });

    indeedProc.on('close', async code => {
      const ok = code === 0;
      const msg = ok ? '✅ Indeed掲載完了' : `❌ Indeed掲載失敗(exit ${code})`;
      await Logs.create('indeed_post', ok ? 'success' : 'error', msg);
      notify(msg, { emoji: ok ? ':rocket:' : ':x:' }).catch(() => {});
      sseSend(res, {
        message: ok ? '✅ Indeed への掲載が完了しました' : `❌ 掲載が失敗しました（コード: ${code}）`,
        type: ok ? 'success' : 'error',
        done: true,
        success: ok
      });
      res.end();
    });

    req.on('close', () => { try { indeedProc.kill(); } catch {} });
    return;
  }

  // ── 404 ──
  if (pathname.startsWith('/api/')) {
    sendError(res, 404, 'Not Found');
  } else {
    send(res, 404, `<html><body style="font-family:sans-serif;text-align:center;padding:80px">
      <h2 style="font-size:40px;color:#94a3b8">404</h2>
      <p>ページが見つかりません</p>
      <a href="/">トップへ戻る</a>
    </body></html>`);
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 採用プラットフォーム起動中`);
  console.log(`   管理画面: http://localhost:${PORT}/admin`);
  console.log(`   求人サイト: http://localhost:${PORT}/jobs\n`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} は使用中です。PORT環境変数で変更してください。`);
    process.exit(1);
  }
  throw err;
});
