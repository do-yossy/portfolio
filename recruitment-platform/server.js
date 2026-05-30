'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { Jobs, Applicants, Applications, Logs } = require('./db');
const { normalizePhone, normalizeEmail, isNameSimilar } = require('./normalize');
const T = require('./templates');

const PORT = process.env.PORT || 3000;
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

// XML generator
function generateKyujinboxXML(jobs) {
  const items = jobs.map(j => {
    const tags = JSON.parse(j.tags || '[]');
    return `  <job>
    <job-id>${j.id}</job-id>
    <job-title><![CDATA[${j.title}]]></job-title>
    <job-catch><![CDATA[${tags.slice(0,2).join('・') || j.employment_type}]]></job-catch>
    <job-url>http://localhost:${PORT}/jobs/${j.id}</job-url>
    <job-category>${j.job_type}</job-category>
    <job-type>${j.employment_type}</job-type>
    <job-salary><![CDATA[${j.salary}]]></job-salary>
    <job-address><![CDATA[${j.location}]]></job-address>
    <job-description><![CDATA[${j.description}]]></job-description>
    <pub-date>${(j.published_at || j.created_at || new Date().toISOString()).slice(0,10)}</pub-date>
    <end-date>${j.expires_at ? j.expires_at.slice(0,10) : ''}</end-date>
  </job>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<jobs>
${items}
</jobs>`;
}

function generateStanbyXML(jobs) {
  const items = jobs.map(j => `  <item>
    <title><![CDATA[${j.title}]]></title>
    <url>http://localhost:${PORT}/jobs/${j.id}</url>
    <salary><![CDATA[${j.salary}]]></salary>
    <location><![CDATA[${j.location}]]></location>
    <job_type>${j.employment_type}</job_type>
    <occupation>${j.job_type}</occupation>
    <description><![CDATA[${j.description.slice(0,500)}]]></description>
    <updated>${(j.updated_at || j.created_at || new Date().toISOString()).slice(0,10)}</updated>
  </item>`).join('\n');
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
function checkDuplicate(data) {
  const nPhone = normalizePhone(data.phone);
  const nEmail  = normalizeEmail(data.email);
  return Applicants.findDuplicate(nPhone, nEmail);
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

  // ── Public: Jobs list ──
  if (pathname === '/jobs' && method === 'GET') {
    const search = query.q || '';
    let jobs = Jobs.findAll(true);
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
    const job = Jobs.findById(jobDetailMatch[1]);
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
    const dupId = checkDuplicate(body);
    const applicant = Applicants.create({
      ...body,
      isDuplicate: !!dupId,
      duplicateOfId: dupId,
      status: dupId ? '重複' : '新規',
      sourceMedia: body.sourceMedia || 'direct'
    });
    if (body.jobId) {
      const job = Jobs.findById(body.jobId);
      Applications.create({
        applicantId: applicant.id,
        jobId: body.jobId,
        jobTitle: job ? job.title : body.jobTitle || '',
        sourceMedia: 'direct'
      });
    }
    sendJSON(res, 201, { ok: true, id: applicant.id, isDuplicate: !!dupId });
    return;
  }

  // ── Admin: Dashboard ──
  if (pathname === '/admin' && method === 'GET') {
    const stats = {
      jobs: Jobs.count(),
      today: Applicants.todayCount(),
      duplicates: Applicants.duplicateCount()
    };
    send(res, 200, T.dashboardPage({ stats, lastPost: Logs.lastPostTime() }));
    return;
  }

  // ── Admin: Jobs page ──
  if (pathname === '/admin/jobs' && method === 'GET') {
    send(res, 200, T.adminJobsPage(Jobs.findAll()));
    return;
  }

  // ── Admin: Applicants page ──
  if (pathname === '/admin/applicants' && method === 'GET') {
    const filter = query.status || 'all';
    const applicants = Applicants.findAll({ status: filter, search: query.search });
    send(res, 200, T.adminApplicantsPage(applicants, filter));
    return;
  }

  // ── Admin: Logs page ──
  if (pathname === '/admin/logs' && method === 'GET') {
    send(res, 200, T.adminLogsPage(Logs.findAll()));
    return;
  }

  // ── API: Jobs CRUD ──
  if (pathname === '/api/jobs' && method === 'GET') {
    sendJSON(res, 200, Jobs.findAll());
    return;
  }
  if (pathname === '/api/jobs' && method === 'POST') {
    const body = await parseJSON(req);
    if (!body.title) { sendError(res, 400, 'タイトルは必須です'); return; }
    sendJSON(res, 201, Jobs.create(body));
    return;
  }
  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const id = jobMatch[1];
    if (method === 'GET') {
      const j = Jobs.findById(id);
      if (!j) { sendError(res, 404, '求人が見つかりません'); return; }
      sendJSON(res, 200, j);
      return;
    }
    if (method === 'PUT') {
      const body = await parseJSON(req);
      const j = Jobs.update(id, body);
      sendJSON(res, 200, j);
      return;
    }
    if (method === 'DELETE') {
      Jobs.delete(id);
      sendJSON(res, 200, { ok: true });
      return;
    }
  }

  // ── API: Applicants ──
  if (pathname === '/api/applicants' && method === 'GET') {
    sendJSON(res, 200, Applicants.findAll());
    return;
  }
  const appMatch = pathname.match(/^\/api\/applicants\/([^/]+)$/);
  if (appMatch) {
    const id = appMatch[1];
    if (method === 'PUT') {
      const body = await parseJSON(req);
      sendJSON(res, 200, Applicants.update(id, body));
      return;
    }
    if (method === 'GET') {
      const a = Applicants.findById(id);
      if (!a) { sendError(res, 404, '応募者が見つかりません'); return; }
      sendJSON(res, 200, a);
      return;
    }
  }

  // ── API: XML Feed ──
  if (pathname === '/api/feed/kyujinbox' && method === 'GET') {
    const jobs = Jobs.findAll(true);
    const xml = generateKyujinboxXML(jobs);
    Logs.create('xml_generate', 'success', `求人ボックスXML生成: ${jobs.length}件`);
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="kyujinbox-feed.xml"' });
    res.end(xml);
    return;
  }
  if (pathname === '/api/feed/stanby' && method === 'GET') {
    const jobs = Jobs.findAll(true);
    const xml = generateStanbyXML(jobs);
    Logs.create('xml_generate', 'success', `スタンバイXML生成: ${jobs.length}件`);
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
      const dupId = checkDuplicate(mapped);
      Applicants.create({
        ...mapped,
        isDuplicate: !!dupId,
        duplicateOfId: dupId,
        status: dupId ? '重複' : '新規'
      });
      if (dupId) duplicates++; else imported++;
    }
    Logs.create('csv_import', 'success', `CSV取込: ${imported}件新規, ${duplicates}件重複`);
    sendJSON(res, 200, { ok: true, imported, duplicates, total: imported + duplicates });
    return;
  }

  // ── API: CSV Export ──
  if (pathname === '/api/export/csv' && method === 'GET') {
    const applicants = Applicants.findAll();
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
    const logId = Logs.create('indeed_scrape', 'running', '開始');

    sseSend(res, { message: 'VPN接続を確認しています...', type: 'info' });
    const vpnOk = await checkVPN();
    if (!vpnOk) {
      sseSend(res, { message: '❌ VPN未接続です。処理を中止します。', type: 'error', done: true, success: false });
      Logs.create('indeed_scrape', 'error', 'VPN未接続');
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
        const dup = checkDuplicate(s);
        Applicants.create({ ...s, isDuplicate: !!dup, duplicateOfId: dup, status: dup ? '重複' : '新規' });
        count++;
        sseSend(res, { message: `✅ 取得: ${s.name}（${s.phone}）`, type: 'success' });
        await new Promise(r => setTimeout(r, 300));
      }
      Logs.create('indeed_scrape', 'success', `Indeed取込完了（デモ）: ${count}件`);
      sseSend(res, { message: `✅ 完了: ${count}件取得しました（デモモード）`, type: 'success', done: true, success: true });
      res.end();
      return;
    }

    // Run real Python script
    sseSend(res, { message: '🔑 Indeedにログイン中...', type: 'info' });
    const env = { ...process.env };
    const proc = spawn('python3', [scriptPath], { env });
    let count = 0;

    proc.stdout.on('data', data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'progress') {
            sseSend(res, { message: obj.message, type: obj.level || 'info' });
          } else if (obj.type === 'applicant') {
            const dup = checkDuplicate(obj.data);
            Applicants.create({ ...obj.data, sourceMedia: 'Indeed', isDuplicate: !!dup, duplicateOfId: dup, status: dup ? '重複' : '新規' });
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

    proc.on('close', code => {
      const ok = code === 0;
      Logs.create('indeed_scrape', ok ? 'success' : 'error', `${ok ? '完了' : '失敗'}: ${count}件取得`);
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
      Logs.create('kyujinbox_post', 'error', 'VPN未接続');
      res.end();
      return;
    }

    const jobs = Jobs.findAll(true);
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
      Logs.create('kyujinbox_post', 'success', `求人ボックス投稿（デモ）: ${target.title}`);
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

    proc.on('close', code => {
      const ok = code === 0;
      Logs.create('kyujinbox_post', ok ? 'success' : 'error', ok ? '求人ボックス投稿完了' : `投稿失敗(exit ${code})`);
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
