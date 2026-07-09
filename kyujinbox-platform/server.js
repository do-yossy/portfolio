'use strict';
// 求人ボックス専用システム サーバー（軽量版）
// - 求人一覧 / 統計 / 求人ボックスへの複数アカウント自動投稿 / 投稿ログのポーリング
// - 月次レポートの自動生成（毎月・前月分）＋閲覧/生成API
// 現システム(recruitment-platform)には一切依存せず、独立して稼働する。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const APP_DIR = __dirname;
const SCRIPTS_DIR = path.join(APP_DIR, 'scripts');
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const LOGS_DIR = path.join(APP_DIR, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── .env 読み込み（最初の出現を採用）──
(function loadEnv() {
  const f = fs.existsSync(path.join(process.cwd(), '.env')) ? path.join(process.cwd(), '.env') : path.join(APP_DIR, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim(); if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('='); if (eq < 0) return;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  });
})();

const { Jobs, Logs, Reports, COMPANIES } = require('./db');
const report = require('./lib/report');
const { requireAuth, isAuthenticated, login, destroySession, sessionCookie, parseCookies } = require('./lib/auth');

const PORT = parseInt(process.env.PORT || '3200', 10);

// ── ログイン画面（現システムと同じ ADMIN_USER / ADMIN_PASSWORD で認証）──
function loginPage(errorMsg) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン｜求人ボックス運用システム</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Meiryo','Yu Gothic',sans-serif;background:#0F2A43;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:12px;padding:32px 30px;width:340px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
h1{font-size:17px;color:#0F2A43;margin-bottom:4px}.sub{color:#5A6B7B;font-size:12px;margin-bottom:20px}
label{display:block;font-size:12px;color:#5A6B7B;margin:12px 0 4px}
input{width:100%;padding:10px;border:1px solid #D5DCE3;border-radius:6px;font-size:14px}
button{width:100%;margin-top:20px;padding:11px;background:#17A398;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer}
.err{background:#f6e6e4;color:#c0433b;font-size:12px;padding:8px 10px;border-radius:6px;margin-top:12px}
.tick{width:36px;height:6px;background:#17A398;border-radius:3px;margin-bottom:14px}
</style></head><body><form class="card" method="POST" action="/login">
<div class="tick"></div><h1>求人ボックス運用システム</h1><div class="sub">管理画面にログイン</div>
<label>ユーザー名</label><input name="username" autocomplete="username" autofocus>
<label>パスワード</label><input name="password" type="password" autocomplete="current-password">
${errorMsg ? `<div class="err">${errorMsg}</div>` : ''}
<button type="submit">ログイン</button></form></body></html>`;
}

// ── 会社名・認証解決（現システムと同一規則）──
const companyFullName = (id) => (COMPANIES.find(c => c.id === id) || {}).name || (process.env.COMPANY_NAME || '株式会社SocialQuality');

function kyujinboxEnvForCompany(id) {
  const co = String(id || 'sq').toUpperCase();
  const pick = base => (process.env[`${base}_${co}`] || '').trim() || (process.env[base] || '').trim();
  const email = pick('KYUJINBOX_EMAIL'), password = pick('KYUJINBOX_PASSWORD'), groupId = pick('KYUJINBOX_GROUP_ID');
  const phone = pick('KYUJINBOX_PHONE'), image = pick('KYUJINBOX_JOB_IMAGE');
  const env = { COMPANY_NAME: companyFullName(id) };
  if (email) env.KYUJINBOX_EMAIL = email;
  if (password) env.KYUJINBOX_PASSWORD = password;
  if (groupId) env.KYUJINBOX_GROUP_ID = groupId;
  env.KYUJINBOX_PHONE = phone || '';
  if (image) env.KYUJINBOX_JOB_IMAGE = image;
  const profile = pick('KYUJINBOX_PROFILE_JSON') ||
    (fs.existsSync(path.join(SCRIPTS_DIR, `kyujinbox-profile-${String(id || 'sq')}.json`))
      ? path.join(SCRIPTS_DIR, `kyujinbox-profile-${String(id || 'sq')}.json`) : '');
  if (profile) env.KYUJINBOX_PROFILE_JSON = profile;
  return { env, hasCreds: !!(email && password && groupId) };
}
const kyujinboxConfiguredCompanies = () => COMPANIES.map(c => c.id).filter(id => kyujinboxEnvForCompany(id).hasCreds);

// ── Python 検出 ──
const PYTHON_CMD = (function detectPython() {
  const cands = [];
  if ((process.env.PYTHON_PATH || '').trim()) cands.push(process.env.PYTHON_PATH.trim());
  if (process.platform === 'win32') cands.push('py');
  cands.push('python', 'python3');
  for (const c of cands) {
    try { const r = spawnSync(c, ['-c', 'import sys'], { timeout: 8000, windowsHide: true }); if (r && r.status === 0) return c; } catch {}
  }
  return 'python';
})();

// ── ポーリング用セッション ──
const sessions = new Map();
function createSession() {
  const id = Math.random().toString(36).slice(2, 10);
  const session = { logs: [], done: false, success: false, cursor: 0 };
  sessions.set(id, session);
  setTimeout(() => sessions.delete(id), 30 * 60 * 1000);
  return { id, session };
}

// ── HTTP ヘルパ ──
const sendJSON = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
function parseJSON(req) {
  return new Promise(resolve => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } }); });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

// ── 月次レポート 自動生成（前月分が無ければ作る）──
function ensureMonthlyReports() {
  try {
    const period = report.prevMonth();
    if (Reports.has(period, 'all')) return;
    const cosWith = COMPANIES.map(c => c.id).filter(id =>
      require('./db').db.prepare(`SELECT 1 FROM jobs WHERE company=? LIMIT 1`).get(id));
    for (const co of ['all', ...cosWith]) report.generate(period, co);
    Logs.create('report_generate', 'success', `月次レポート自動生成: ${period}（${['all', ...cosWith].length}件）`);
    console.log(`📄 月次レポートを自動生成しました: ${period}`);
  } catch (e) { console.log('月次レポート自動生成エラー:', e.message); }
}

// ── ルーティング ──
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = u.pathname;
  const method = req.method;

  try {
    // ── ログイン（現システムと同じ ADMIN_USER / ADMIN_PASSWORD）──
    if (pathname === '/login' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(loginPage());
    }
    if (pathname === '/login' && method === 'POST') {
      const raw = await new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });
      const params = new URLSearchParams(raw);
      const token = login(params.get('username') || '', params.get('password') || '');
      if (token) { res.writeHead(302, { 'Set-Cookie': sessionCookie(token), Location: '/' }); return res.end(); }
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(loginPage('ユーザー名またはパスワードが正しくありません'));
    }
    if (pathname === '/logout') {
      const cookies = parseCookies(req);
      destroySession(cookies.get('admin_session') || '');
      res.writeHead(302, { 'Set-Cookie': sessionCookie('', true), Location: '/login' }); return res.end();
    }
    // ── 認証ガード（/login・静的アセット以外は要ログイン）──
    if (!isAuthenticated(req)) {
      if (pathname.startsWith('/api/')) return sendJSON(res, 401, { error: '未ログインです。/login からログインしてください。' });
      if (pathname === '/' || pathname.startsWith('/report')) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    }

    // 静的
    if (pathname === '/' && method === 'GET') return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
    if (pathname.startsWith('/public/')) return serveStatic(res, path.join(PUBLIC_DIR, pathname.slice(8)));
    if (['/admin.js', '/styles.css'].includes(pathname)) return serveStatic(res, path.join(PUBLIC_DIR, pathname.slice(1)));

    // 求人一覧
    if (pathname === '/api/jobs' && method === 'GET') {
      const company = u.searchParams.get('company');
      const jobs = Jobs.findAll({ company: company || null });
      return sendJSON(res, 200, { jobs: jobs.map(j => ({
        id: j.id, title: j.title, location: j.location, salary: j.salary, company: j.company,
        job_type: j.job_type, is_published: j.is_published,
        kyujinbox_posted_at: j.kyujinbox_posted_at, optimize_count: j.optimize_count,
      })) });
    }

    // 統計
    if (pathname === '/api/stats' && method === 'GET') {
      const all = Jobs.findAll({});
      const isKb = j => { try { return JSON.parse(j.target_media || '[]').some(m => /求人ボックス|kyujinbox/.test(m)); } catch { return false; } };
      const perCompany = {};
      for (const c of COMPANIES) {
        const cj = all.filter(j => j.company === c.id);
        perCompany[c.id] = { name: c.name, total: cj.length, published: cj.filter(j => j.is_published).length,
          posted: cj.filter(j => j.kyujinbox_posted_at).length, configured: kyujinboxEnvForCompany(c.id).hasCreds };
      }
      return sendJSON(res, 200, {
        total: all.length, published: all.filter(j => j.is_published).length,
        kyujinbox: all.filter(j => j.is_published && isKb(j)).length,
        posted: all.filter(j => j.kyujinbox_posted_at).length,
        configuredCompanies: kyujinboxConfiguredCompanies(), perCompany, lastPost: Logs.lastPostTime(),
      });
    }

    // ログ
    if (pathname === '/api/logs' && method === 'GET') return sendJSON(res, 200, { logs: Logs.findAll(50) });

    // ポーリング
    if (pathname.startsWith('/api/session/') && method === 'GET') {
      const id = pathname.split('/').pop();
      const s = sessions.get(id);
      if (!s) return sendJSON(res, 404, { error: 'session not found' });
      const newLogs = s.logs.slice(s.cursor); s.cursor = s.logs.length;
      return sendJSON(res, 200, { logs: newLogs, done: s.done, success: s.success });
    }

    // ── 求人ボックス投稿（複数アカウント）──
    if (pathname === '/api/post/kyujinbox' && method === 'POST') {
      const body = await parseJSON(req);
      // 件数上限は固定しない。未指定なら全件（100件・300件・それ以上も可）。
      const parsedLimit = parseInt(body.limit, 10);
      const batchSize = (Number.isFinite(parsedLimit) && parsedLimit > 0) ? parsedLimit : 1000000;
      const kbCompany = body.company && body.company !== 'all' ? body.company : null;
      const forceRepost = body.forceRepost === true || body.forceRepost === 'true';

      let targetCompanies = kbCompany ? [kbCompany] : kyujinboxConfiguredCompanies();
      if (targetCompanies.length === 0) targetCompanies = ['sq'];

      const perCompany = []; let totalPosted = 0;
      for (const co of targetCompanies) {
        const allJobs = Jobs.findAll({ onlyPublished: true, company: co });
        let kbJobs = allJobs.filter(j => { try { return JSON.parse(j.target_media || '[]').some(m => /求人ボックス|kyujinbox/.test(m)); } catch { return false; } });
        if (kbJobs.length === 0 && targetCompanies.length === 1) kbJobs = allJobs;
        const already = kbJobs.filter(j => j.kyujinbox_posted_at).length;
        totalPosted += already;
        if (!forceRepost) kbJobs = kbJobs.filter(j => !j.kyujinbox_posted_at);
        if (kbJobs.length > 0) perCompany.push({ co, jobs: kbJobs, already });
      }
      if (perCompany.length === 0) {
        const msg = totalPosted > 0
          ? `⚠️ 未投稿の求人がありません（${totalPosted}件は投稿済み）。再投稿は「強制再投稿」を使ってください。`
          : '⚠️ 公開中の求人がありません';
        return sendJSON(res, 400, { error: msg, allPosted: totalPosted > 0 });
      }

      const { id, session } = createSession();
      const pushLog = (message, type = 'info') => session.logs.push({ message: String(message ?? ''), type });
      sendJSON(res, 200, { ok: true, sessionId: id });

      (async () => {
        const scriptPath = path.join(SCRIPTS_DIR, 'kyujinbox_poster.py');
        if (!fs.existsSync(scriptPath)) { pushLog('⚠️ 投稿スクリプトが見つかりません（scripts/kyujinbox_poster.py）', 'warn'); session.done = true; session.success = false; return; }
        pushLog(`🐍 使用Python: ${PYTHON_CMD}`, 'info');
        if (perCompany.length > 1) pushLog(`🏢 複数アカウントへ順に投稿します（${perCompany.map(p => companyFullName(p.co)).join('・')}）`, 'info');

        const runOne = ({ co, jobs, already }) => new Promise(resolve => {
          const { env: credEnv, hasCreds } = kyujinboxEnvForCompany(co);
          const coName = companyFullName(co);
          if (!hasCreds) { pushLog(`⚠️ ${coName}: 認証情報(.env)が未設定のためスキップ`, 'warn'); return resolve(true); }
          if (already > 0 && !forceRepost) pushLog(`ℹ️ ${coName}: 投稿済み ${already}件をスキップ（未投稿 ${jobs.length}件を投稿）`, 'info');
          pushLog(`📋 ${coName}: 求人ボックス向け ${Math.min(batchSize, jobs.length)}件を投稿します...`, 'info');
          const jobIdMap = Object.fromEntries(jobs.map(j => [j.id, j]));
          const proc = spawn(PYTHON_CMD, [scriptPath], { env: { ...process.env, ...credEnv, KYUJINBOX_BATCH_SIZE: String(batchSize) } });
          proc.stdin.write(JSON.stringify(jobs.slice(0, batchSize))); proc.stdin.end();
          proc.stdout.on('data', data => {
            for (const line of data.toString().split('\n').filter(l => l.trim())) {
              try {
                const obj = JSON.parse(line);
                if (obj.type === 'posted' && obj.jobId && jobIdMap[obj.jobId]) {
                  Jobs.update(obj.jobId, { kyujinbox_posted_at: new Date().toISOString() });
                  pushLog(`📌 投稿済みとしてマーク: ${jobIdMap[obj.jobId].title}`, 'info');
                } else pushLog(obj.message, obj.level || 'info');
              } catch { pushLog(line, 'info'); }
            }
          });
          proc.stderr.on('data', d => { const t = d.toString().trim(); if (t) pushLog(`⚠️ ${t}`, 'warn'); });
          proc.on('error', err => { pushLog(`❌ ${coName}: プロセス起動失敗: ${err.message}`, 'error'); resolve(false); });
          proc.on('close', code => {
            const ok = code === 0;
            pushLog(ok ? `✅ ${coName}: 投稿が完了しました` : `❌ ${coName}: 投稿が失敗しました（コード: ${code}）`, ok ? 'success' : 'error');
            resolve(ok);
          });
        });

        let allOk = true;
        for (const entry of perCompany) { if (!await runOne(entry)) allOk = false; }
        Logs.create('kyujinbox_post', allOk ? 'success' : 'error', allOk ? '✅ 求人ボックス投稿完了' : '❌ 一部失敗');
        pushLog(allOk ? '✅ すべての投稿が完了しました' : '⚠️ 一部のアカウントで投稿に失敗しました', allOk ? 'success' : 'error');
        session.done = true; session.success = allOk;
      })().catch(err => { pushLog(`❌ 内部エラー: ${err.message}`, 'error'); session.done = true; session.success = false; });
      return;
    }

    // ── 求人票ZIP(PDF)取り込み → 求人ボックス用に登録 ──
    if (pathname === '/api/import' && method === 'POST') {
      const co = u.searchParams.get('company') || 'sq';
      const kind = u.searchParams.get('kind') === 'agency' ? 'agency' : 'normal';
      const publish = u.searchParams.get('publish') !== '0'; // 既定: 公開状態で登録
      // 生バイト(ZIP)を受け取り一時ファイルへ保存
      const chunks = [];
      await new Promise((resolve, reject) => { req.on('data', d => chunks.push(d)); req.on('end', resolve); req.on('error', reject); });
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) return sendJSON(res, 400, { error: 'ZIPファイルが空です' });
      const zipPath = path.join(LOGS_DIR, `import_${Date.now()}.zip`);
      fs.writeFileSync(zipPath, buf);

      const { id, session } = createSession();
      const pushLog = (message, type = 'info') => session.logs.push({ message: String(message ?? ''), type });
      sendJSON(res, 200, { ok: true, sessionId: id });

      (async () => {
        const script = path.join(SCRIPTS_DIR, 'import_jobs.py');
        if (!fs.existsSync(script)) { pushLog('⚠️ 取り込みスクリプトが見つかりません（scripts/import_jobs.py）', 'warn'); session.done = true; return; }
        const { env: credEnv } = kyujinboxEnvForCompany(co);
        const proc = spawn(PYTHON_CMD, [script, zipPath], {
          env: { ...process.env, ...credEnv, JOB_KIND: kind, COMPANY: co },
        });
        let created = 0;
        proc.stdout.on('data', data => {
          for (const line of data.toString().split('\n').filter(l => l.trim())) {
            let obj; try { obj = JSON.parse(line); } catch { pushLog(line, 'info'); continue; }
            if (obj.type === 'progress') { pushLog(obj.message, 'info'); }
            else if (obj.type === 'job' && obj.job) {
              try {
                const j = obj.job;
                Jobs.create({
                  title: j.title || '(無題)', location: j.location || '', salary: j.salary || '',
                  jobType: j.jobType || '', employmentType: j.employmentType || '正社員',
                  description: j.description || '', catchcopy: j.catchcopy || '', tags: j.tags || [],
                  qualifications: j.qualifications || '', benefit: j.benefit || '',
                  worktimeHoliday: j.worktimeHoliday || '', transportation: j.transportation || '',
                  rewarding: j.rewarding || '', howToApply: j.howToApply || '',
                  company: co, jobKind: kind, sourceFile: obj.source_file || '',
                  targetMedia: ['求人ボックス'], isPublished: publish,
                  imageUrl: (credEnv.KYUJINBOX_JOB_IMAGE || ''),
                });
                created++;
                pushLog(`  💾 登録: ${(j.title || '').slice(0, 40)}`, 'success');
              } catch (e) { pushLog(`  ❌ 登録失敗: ${e.message}`, 'error'); }
            } else if (obj.type === 'done') {
              pushLog(`📊 取り込み完了: 変換${obj.count}件 / 登録${created}件 / 失敗${obj.failed}件`, 'success');
            }
          }
        });
        proc.stderr.on('data', d => { const t = d.toString().trim(); if (t) pushLog(`⚠️ ${t}`, 'warn'); });
        proc.on('close', code => {
          try { fs.unlinkSync(zipPath); } catch {}
          const kindLabel = kind === 'agency' ? '人材紹介求人' : '通常求人';
          Logs.create('import', code === 0 ? 'success' : 'error', `求人票取り込み(${kindLabel}): 登録${created}件`);
          pushLog(code === 0 ? `✅ 取り込みが完了しました（${kindLabel}・登録${created}件）。求人一覧で確認し、投稿してください。` : `❌ 取り込みが失敗しました（コード:${code}）`, code === 0 ? 'success' : 'error');
          session.done = true; session.success = code === 0;
        });
        proc.on('error', err => { pushLog(`❌ プロセス起動失敗: ${err.message}`, 'error'); session.done = true; });
      })().catch(err => { pushLog(`❌ 内部エラー: ${err.message}`, 'error'); session.done = true; });
      return;
    }

    // ── 月次レポート ──
    if (pathname === '/api/reports' && method === 'GET') return sendJSON(res, 200, { reports: Reports.list(24) });

    if (pathname === '/api/report/generate' && method === 'POST') {
      const body = await parseJSON(req);
      const period = body.period || report.prevMonth();
      const company = body.company || 'all';
      const r = report.generate(period, company);
      Logs.create('report_generate', 'success', `月次レポート生成: ${period} (${company})`);
      return sendJSON(res, 200, { ok: true, period: r.period, company: r.company, summary: r.summary });
    }

    // レポートHTMLを直接表示 /report/2026-06/all
    if (pathname.startsWith('/report/') && method === 'GET') {
      const parts = pathname.split('/').filter(Boolean); // ['report', period, company?]
      const period = parts[1], company = parts[2] || 'all';
      let rec = Reports.get(period, company);
      if (!rec) { const r = report.generate(period, company); rec = Reports.get(period, company) || { html: r.html }; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(rec.html);
    }
    // 最新レポート
    if (pathname === '/report' && method === 'GET') {
      const rec = Reports.latest();
      if (!rec) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<p>まだレポートがありません。管理画面から生成してください。</p>'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(rec.html);
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error('server error', e);
    if (!res.headersSent) sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n🟢 求人ボックス専用システム 起動`);
  console.log(`   ログイン: http://localhost:${PORT}/login`);
  console.log(`   管理画面: http://localhost:${PORT}/`);
  console.log(`   ログイン認証: ${process.env.ADMIN_PASSWORD ? 'あり（ADMIN_USER/ADMIN_PASSWORD）' : '無し（ADMIN_PASSWORD未設定＝開放）'}`);
  console.log(`   認証済み求人ボックスアカウント: ${kyujinboxConfiguredCompanies().map(companyFullName).join('・') || '(未設定)'}`);
  ensureMonthlyReports();
  // 毎日1回、前月分の月次レポートが無ければ自動生成（月替わり後の初回起動で前月分が作られる）
  setInterval(ensureMonthlyReports, 24 * 60 * 60 * 1000);
});
