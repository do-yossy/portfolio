'use strict';
// AI商品化実践システム｜購入者向けWebアプリ（MVP）
// - 購入者アカウント（メール+パスワード）、90日/GATE進捗の保存
// - AIプロンプト実行は購入者自身のAPIキーを都度受け取って中継するのみ。
//   キーはサーバー側に保存しない（lib/aiproxy.js を参照）。
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const APP_DIR = __dirname;

// ── .env 読み込み（自作。dotenv 等の依存は使わない）──
function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  });
}
(function loadEnv() {
  const own = fs.existsSync(path.join(process.cwd(), '.env')) ? path.join(process.cwd(), '.env') : path.join(APP_DIR, '.env');
  loadEnvFile(own);
})();

const { Users, GateProgress, DayProgress, Prompts, AiRuns } = require('./db');
const auth = require('./lib/auth');
const { runPrompt } = require('./lib/aiproxy');
const promptSeeds = require('./seeds/prompts');
const gateDefs = require('./seeds/gates');

Prompts.seedIfEmpty(promptSeeds);

const PORT = parseInt(process.env.PORT || '3300', 10);

// ── 共通レイアウト ──
function layout(title, bodyHtml, { userEmail } = {}) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}｜AI商品化実践システム</title>
<style>
*{box-sizing:border-box}body{font-family:'Meiryo','Yu Gothic',sans-serif;margin:0;background:#F4F6F5;color:#1F2A33}
header{background:#1F4E5F;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center}
header a{color:#fff;text-decoration:none;font-weight:700}
nav a{color:#DCE7E4;text-decoration:none;margin-left:16px;font-size:13px}
main{max-width:880px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:20px;color:#1F4E5F;margin:0 0 6px}
h2{font-size:15px;color:#2E7D6B;margin:24px 0 8px}
.card{background:#fff;border:1px solid #D8DDE2;border-radius:8px;padding:16px 18px;margin-bottom:14px}
.muted{color:#6B6B6B;font-size:12.5px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border:1px solid #D8DDE2;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#2E7D6B;color:#fff;font-weight:700}
tr:nth-child(even) td{background:#F4F6F5}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700}
.GREEN{background:#E5F3E8;color:#1E7D32}
.YELLOW{background:#FFF3E0;color:#8A4B00}
.RED{background:#FDECEA;color:#8A1F11}
.PENDING{background:#EEE;color:#666}
input,textarea,select{width:100%;padding:9px;border:1px solid #D5DCE3;border-radius:6px;font-size:14px;margin-top:4px}
button{padding:9px 16px;background:#2E7D6B;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer}
button.secondary{background:#6B6B6B}
form{margin:0}
.row{display:flex;gap:10px;flex-wrap:wrap}
.row>*{flex:1;min-width:160px}
a.link{color:#2E7D6B}
.warn{background:#FFF3E0;color:#8A4B00;padding:10px 12px;border-radius:6px;font-size:12.5px;margin-bottom:14px}
</style></head><body>
<header><a href="/">AI商品化実践システム</a>
<nav>${userEmail ? `<span style="color:#DCE7E4;font-size:13px">${escapeHtml(userEmail)}</span>
<a href="/dashboard">ダッシュボード</a><a href="/prompts">プロンプト</a><a href="/logout">ログアウト</a>`
    : `<a href="/login">ログイン</a><a href="/signup">アカウント作成</a>`}</nav></header>
<main>${bodyHtml}</main>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function redirect(res, location, extraHeaders) {
  res.writeHead(302, { Location: location, ...(extraHeaders || {}) });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/json')) {
        try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
      } else {
        resolve(Object.fromEntries(new URLSearchParams(data)));
      }
    });
    req.on('error', () => resolve({}));
  });
}

// ── ページ: トップ ──
function homePage(userId) {
  if (userId) return null; // ダッシュボードへリダイレクトさせる
  return layout('ようこそ', `
    <h1>AI商品化実践システム</h1>
    <p class="muted">購入者用のアカウントでログインしてください。まだアカウントがない場合は作成できます。</p>
    <div class="card"><a class="link" href="/login">ログイン</a>　|　<a class="link" href="/signup">アカウント作成</a></div>
  `);
}

// ── ページ: サインアップ／ログイン ──
function authForm(kind, error) {
  const isSignup = kind === 'signup';
  return layout(isSignup ? 'アカウント作成' : 'ログイン', `
    <h1>${isSignup ? 'アカウント作成' : 'ログイン'}</h1>
    ${error ? `<div class="warn">${escapeHtml(error)}</div>` : ''}
    <div class="card">
      <form method="POST" action="${isSignup ? '/signup' : '/login'}">
        <label>メールアドレス</label><input type="email" name="email" required autofocus>
        <label>パスワード${isSignup ? '（8文字以上）' : ''}</label><input type="password" name="password" required minlength="8">
        <div style="margin-top:14px"><button type="submit">${isSignup ? '作成する' : 'ログイン'}</button></div>
      </form>
    </div>
    <p class="muted">${isSignup ? 'すでにアカウントがある場合は<a class="link" href="/login">こちら</a>'
      : 'アカウントをお持ちでない場合は<a class="link" href="/signup">こちら</a>'}</p>
  `);
}

// ── ページ: ダッシュボード ──
function dashboardPage(user) {
  const gates = GateProgress.listForUser(user.id);
  const doneDays = DayProgress.listForUser(user.id);
  const rows = gates.map((g) => {
    const def = gateDefs.find((d) => d.no === g.gate_no);
    return `<tr>
      <td>GATE${g.gate_no}</td><td>${escapeHtml(def.name)}</td><td>${escapeHtml(def.phase)}</td>
      <td><span class="badge ${g.status}">${g.status}</span></td>
      <td>
        <form method="POST" action="/api/gate/${g.gate_no}" style="display:flex;gap:6px">
          <select name="status">
            ${['PENDING', 'GREEN', 'YELLOW', 'RED'].map((s) => `<option value="${s}" ${s === g.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button type="submit">更新</button>
        </form>
      </td>
    </tr>`;
  }).join('');
  return layout('ダッシュボード', `
    <h1>ダッシュボード</h1>
    <p class="muted">DAY進捗：${doneDays.size} / 90 完了</p>
    <h2>GATE進捗</h2>
    <table><tr><th>GATE</th><th>工程</th><th>PHASE</th><th>判定</th><th></th></tr>${rows}</table>
    <h2>90日チェックリスト</h2>
    <div class="card">${dayGrid(doneDays)}</div>
  `, { userEmail: user.email });
}

function dayGrid(doneDays) {
  let html = '<div class="row" style="flex-wrap:wrap">';
  for (let d = 1; d <= 90; d++) {
    const checked = doneDays.has(d) ? 'checked' : '';
    html += `<label style="flex:0 0 auto;min-width:0;font-size:11px;margin:2px;padding:4px 6px;border:1px solid #D8DDE2;border-radius:4px;background:${doneDays.has(d) ? '#E5F3E8' : '#fff'}">
      <input type="checkbox" data-day="${d}" ${checked} style="width:auto;vertical-align:middle"> DAY${d}
    </label>`;
  }
  html += '</div><p class="muted" style="margin-top:8px">チェックすると自動で保存されます。</p>';
  html += `<script>
    document.querySelectorAll('input[data-day]').forEach(cb => {
      cb.addEventListener('change', async () => {
        await fetch('/api/day/' + cb.dataset.day, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ done: cb.checked })
        });
      });
    });
  </script>`;
  return html;
}

// ── ページ: プロンプト一覧 ──
function promptsPage(user) {
  const prompts = Prompts.all();
  const rows = prompts.map((p) => `<tr>
    <td>No.${p.no}</td><td>${escapeHtml(p.phase)}</td><td>${escapeHtml(p.title)}</td>
    <td><a class="link" href="/prompts/${p.no}">開く</a></td>
  </tr>`).join('');
  return layout('プロンプト一覧', `
    <h1>AIプロンプト一覧（No.1〜${prompts.length}）</h1>
    <table><tr><th>No</th><th>PHASE</th><th>タイトル</th><th></th></tr>${rows}</table>
  `, { userEmail: user.email });
}

function promptDetailPage(user, p, providers) {
  return layout(`No.${p.no} ${p.title}`, `
    <h1>No.${p.no}　${escapeHtml(p.title)}</h1>
    <p class="muted">PHASE：${escapeHtml(p.phase)}　｜　使うタイミング：${escapeHtml(p.timing || '―')}</p>
    <div class="card">
      <h2>プロンプト本文（編集して実行できます）</h2>
      <textarea id="promptBody" rows="8">${escapeHtml(p.body)}</textarea>
      ${p.note ? `<p class="muted">注意：${escapeHtml(p.note)}</p>` : ''}
    </div>
    <div class="card">
      <h2>AIに実行させる</h2>
      <div class="warn">APIキーはこのブラウザにのみ保存され、実行のたびにサーバーへ中継されるだけで保存されません。
      ご自身のOpenAIまたはAnthropicのAPIキーをご用意ください（利用料はお客様のご契約に基づき発生します）。</div>
      <div class="row">
        <div><label>プロバイダ</label>
          <select id="provider">${providers.map((pv) => `<option value="${pv}">${pv}</option>`).join('')}</select>
        </div>
        <div><label>APIキー</label><input id="apiKey" type="password" placeholder="sk-... / このブラウザにのみ保存"></div>
      </div>
      <div style="margin-top:10px"><button id="runBtn">実行する</button></div>
      <div id="result" style="margin-top:14px;white-space:pre-wrap;font-size:13px"></div>
    </div>
    <script>
      const KEY_STORE = 'ai-bijika:apiKey:';
      const providerSel = document.getElementById('provider');
      const keyInput = document.getElementById('apiKey');
      function loadKey() { keyInput.value = localStorage.getItem(KEY_STORE + providerSel.value) || ''; }
      providerSel.addEventListener('change', loadKey);
      loadKey();
      document.getElementById('runBtn').addEventListener('click', async () => {
        const provider = providerSel.value;
        const apiKey = keyInput.value.trim();
        const promptText = document.getElementById('promptBody').value;
        const resultEl = document.getElementById('result');
        if (!apiKey) { resultEl.textContent = 'APIキーを入力してください。'; return; }
        localStorage.setItem(KEY_STORE + provider, apiKey);
        resultEl.textContent = '実行中…';
        try {
          const resp = await fetch('/api/run-prompt', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ provider, apiKey, promptText, promptNo: ${p.no} })
          });
          const data = await resp.json();
          resultEl.textContent = resp.ok ? data.output : ('エラー: ' + data.error);
        } catch (e) {
          resultEl.textContent = '通信エラーが発生しました。';
        }
      });
    </script>
  `, { userEmail: user.email });
}

// ── リクエストハンドラ ──
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const pathname = url.pathname;
    const userId = auth.currentUserId(req);
    const user = userId ? Users.findById(userId) : null;

    // ── 認証不要 ──
    if (pathname === '/' && method === 'GET') {
      if (user) return redirect(res, '/dashboard');
      return sendHtml(res, 200, homePage(null));
    }
    if (pathname === '/signup' && method === 'GET') return sendHtml(res, 200, authForm('signup'));
    if (pathname === '/login' && method === 'GET') return sendHtml(res, 200, authForm('login'));

    if (pathname === '/signup' && method === 'POST') {
      const { email, password } = await parseBody(req);
      if (!email || !password || password.length < 8) {
        return sendHtml(res, 400, authForm('signup', 'メールアドレスと8文字以上のパスワードを入力してください。'));
      }
      if (Users.findByEmail(email)) {
        return sendHtml(res, 400, authForm('signup', 'このメールアドレスは既に登録されています。'));
      }
      const { hash, salt } = auth.hashPassword(password);
      const id = Users.create({ email, passwordHash: hash, passwordSalt: salt });
      const token = auth.createSession(id);
      return redirect(res, '/dashboard', { 'Set-Cookie': auth.sessionCookie(token) });
    }

    if (pathname === '/login' && method === 'POST') {
      const { email, password } = await parseBody(req);
      const u = email ? Users.findByEmail(email) : null;
      if (!u || !auth.verifyPassword(password || '', u.password_hash, u.password_salt)) {
        return sendHtml(res, 401, authForm('login', 'メールアドレスまたはパスワードが違います。'));
      }
      const token = auth.createSession(u.id);
      return redirect(res, '/dashboard', { 'Set-Cookie': auth.sessionCookie(token) });
    }

    if (pathname === '/logout') {
      const token = auth.parseCookies(req).get('session');
      auth.destroySession(token);
      return redirect(res, '/', { 'Set-Cookie': auth.clearCookie() });
    }

    // ── 以降は認証必須 ──
    if (!user) return redirect(res, '/login');

    if (pathname === '/dashboard' && method === 'GET') return sendHtml(res, 200, dashboardPage(user));
    if (pathname === '/prompts' && method === 'GET') return sendHtml(res, 200, promptsPage(user));

    const promptMatch = pathname.match(/^\/prompts\/(\d+)$/);
    if (promptMatch && method === 'GET') {
      const p = Prompts.get(parseInt(promptMatch[1], 10));
      if (!p) { res.writeHead(404); return res.end('not found'); }
      const { PROVIDERS } = require('./lib/aiproxy');
      return sendHtml(res, 200, promptDetailPage(user, p, Object.keys(PROVIDERS)));
    }

    const gateMatch = pathname.match(/^\/api\/gate\/(\d+)$/);
    if (gateMatch && method === 'POST') {
      const { status } = await parseBody(req);
      if (!['PENDING', 'GREEN', 'YELLOW', 'RED'].includes(status)) return sendJson(res, 400, { error: 'invalid status' });
      GateProgress.upsert(user.id, parseInt(gateMatch[1], 10), status, '');
      return redirect(res, '/dashboard');
    }

    const dayMatch = pathname.match(/^\/api\/day\/(\d+)$/);
    if (dayMatch && method === 'POST') {
      const { done } = await parseBody(req);
      DayProgress.setDone(user.id, parseInt(dayMatch[1], 10), !!done);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/run-prompt' && method === 'POST') {
      const { provider, apiKey, promptText, promptNo } = await parseBody(req);
      try {
        const output = await runPrompt({ provider, apiKey, promptText });
        AiRuns.create({ userId: user.id, promptNo: promptNo || null, provider, inputText: promptText, outputText: output });
        return sendJson(res, 200, { output });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`AI商品化実践システム: http://localhost:${PORT}`));
}

module.exports = server;
