'use strict';
// AI商品化実践システム｜購入者向けWebアプリ（MVP）
// - 購入者アカウント（メール+パスワード）、90日/GATE進捗の保存
// - AIプロンプト実行は購入者自身のAPIキーを都度受け取って中継するのみ。
//   キーはサーバー側に保存しない（lib/aiproxy.js を参照）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const STATIC_FILES = {
  '/manifest.json': { file: 'manifest.json', type: 'application/manifest+json; charset=utf-8' },
  '/sw.js': { file: 'sw.js', type: 'application/javascript; charset=utf-8' },
  '/icon-192.png': { file: 'icon-192.png', type: 'image/png' },
  '/icon-512.png': { file: 'icon-512.png', type: 'image/png' },
};

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
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)}｜AI商品化実践システム</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon-192.png"><link rel="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#1F4E5F">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="AI商品化">
<style>
:root{--safe-b:env(safe-area-inset-bottom,0px);--safe-t:env(safe-area-inset-top,0px)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{font-family:'Meiryo','Yu Gothic',sans-serif;margin:0;background:#F4F6F5;color:#1F2A33;
  padding-top:calc(52px + var(--safe-t));padding-bottom:calc(60px + var(--safe-b))}
header{position:fixed;top:0;left:0;right:0;z-index:10;background:#1F4E5F;color:#fff;
  padding:calc(12px + var(--safe-t)) 16px 12px;display:flex;justify-content:space-between;align-items:center}
header a.brand{color:#fff;text-decoration:none;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header .who{color:#DCE7E4;font-size:11px;max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
main{max-width:720px;margin:0 auto;padding:16px 16px 24px}
h1{font-size:19px;color:#1F4E5F;margin:0 0 6px}
h2{font-size:14.5px;color:#2E7D6B;margin:22px 0 8px}
.card{background:#fff;border:1px solid #D8DDE2;border-radius:10px;padding:14px 16px;margin-bottom:12px}
.muted{color:#6B6B6B;font-size:12.5px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border:1px solid #D8DDE2;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#2E7D6B;color:#fff;font-weight:700}
tr:nth-child(even) td{background:#F4F6F5}
.badge{display:inline-block;padding:3px 9px;border-radius:10px;font-size:11px;font-weight:700}
.GREEN{background:#E5F3E8;color:#1E7D32}
.YELLOW{background:#FFF3E0;color:#8A4B00}
.RED{background:#FDECEA;color:#8A1F11}
.PENDING{background:#EEE;color:#666}
input,textarea,select{width:100%;padding:11px;border:1px solid #D5DCE3;border-radius:8px;font-size:16px;margin-top:4px}
button{padding:12px 18px;background:#2E7D6B;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;min-height:44px}
button.secondary{background:#6B6B6B}
form{margin:0}
.row{display:flex;gap:10px;flex-wrap:wrap}
.row>*{flex:1;min-width:160px}
a.link{color:#2E7D6B}
.warn{background:#FFF3E0;color:#8A4B00;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:14px}
.gate-list{display:flex;flex-direction:column;gap:10px}
.gate-item{background:#fff;border:1px solid #D8DDE2;border-radius:10px;padding:12px 14px}
.gate-item .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.gate-item .top strong{font-size:14px}
.gate-item .top span.muted{font-size:11.5px}
.gate-item form{display:flex;gap:8px}
.gate-item select{margin-top:0;flex:1}
.gate-item button{padding:10px 14px;font-size:13px;min-height:40px}
.day-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px}
.daycell{display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-size:10.5px;padding:8px 2px;border:1px solid #D8DDE2;border-radius:8px;background:#fff;min-height:44px}
.daycell.done{background:#E5F3E8;border-color:#8FCB9C}
.daycell input{width:auto;margin:0 0 3px}
nav.bottombar{position:fixed;bottom:0;left:0;right:0;z-index:10;background:#fff;
  border-top:1px solid #D8DDE2;display:flex;padding-bottom:var(--safe-b)}
nav.bottombar a{flex:1;text-align:center;padding:10px 4px 8px;color:#6B6B6B;text-decoration:none;font-size:11px}
nav.bottombar a.active{color:#2E7D6B;font-weight:700}
nav.bottombar .ico{display:block;font-size:19px;margin-bottom:2px}
@media (min-width:600px){main{padding:24px 20px 40px}}
</style></head><body>
<header><a class="brand" href="${userEmail ? '/dashboard' : '/'}">AI商品化実践システム</a>
${userEmail ? `<span class="who">${escapeHtml(userEmail)}</span>` : `<span></span>`}</header>
<main>${bodyHtml}</main>
${userEmail ? `<nav class="bottombar">
  <a href="/dashboard"><span class="ico">📊</span>ダッシュボード</a>
  <a href="/prompts"><span class="ico">💬</span>プロンプト</a>
  <a href="/logout"><span class="ico">🚪</span>ログアウト</a>
</nav>` : ''}
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
</script>
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
  const items = gates.map((g) => {
    const def = gateDefs.find((d) => d.no === g.gate_no);
    return `<div class="gate-item">
      <div class="top">
        <strong>GATE${g.gate_no}　${escapeHtml(def.name)}</strong>
        <span class="badge ${g.status}">${g.status}</span>
      </div>
      <span class="muted">${escapeHtml(def.phase)}</span>
      <form method="POST" action="/api/gate/${g.gate_no}" style="margin-top:8px">
        <select name="status">
          ${['PENDING', 'GREEN', 'YELLOW', 'RED'].map((s) => `<option value="${s}" ${s === g.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button type="submit">更新</button>
      </form>
    </div>`;
  }).join('');
  return layout('ダッシュボード', `
    <h1>ダッシュボード</h1>
    <p class="muted">DAY進捗：${doneDays.size} / 90 完了</p>
    <h2>GATE進捗</h2>
    <div class="gate-list">${items}</div>
    <h2>90日チェックリスト</h2>
    <div class="card">${dayGrid(doneDays)}</div>
  `, { userEmail: user.email });
}

function dayGrid(doneDays) {
  let html = '<div class="day-grid">';
  for (let d = 1; d <= 90; d++) {
    const checked = doneDays.has(d) ? 'checked' : '';
    const done = doneDays.has(d) ? ' done' : '';
    html += `<label class="daycell${done}" data-cell="${d}">
      <input type="checkbox" data-day="${d}" ${checked}>DAY${d}
    </label>`;
  }
  html += '</div><p class="muted" style="margin-top:10px">タップすると自動で保存されます。</p>';
  html += `<script>
    document.querySelectorAll('input[data-day]').forEach(cb => {
      cb.addEventListener('change', async () => {
        cb.closest('.daycell').classList.toggle('done', cb.checked);
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
      <h2>ふだん使っているChatGPTで使う</h2>
      <p class="muted">APIキーが無くても、Free/Plusなど通常契約のChatGPTでそのまま使えます。</p>
      <div class="row">
        <button id="copyBtn" type="button">コピーする</button>
        <button id="openChatGptBtn" type="button" class="secondary">ChatGPTで開く</button>
      </div>
      <p id="copyMsg" class="muted" style="margin-top:6px"></p>
    </div>
    <div class="card">
      <h2>AIに実行させる（このアプリ内でAPIキーを使って自動実行）</h2>
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
      const CHATGPT_URL_LIMIT = 1500; // これを超える長さのプロンプトはURL方式が不安定になりうるため、コピーのみ案内する
      document.getElementById('copyBtn').addEventListener('click', async () => {
        const text = document.getElementById('promptBody').value;
        const msgEl = document.getElementById('copyMsg');
        try {
          await navigator.clipboard.writeText(text);
          msgEl.textContent = 'コピーしました。ChatGPTに貼り付けてください。';
        } catch (e) {
          msgEl.textContent = 'コピーできませんでした。プロンプト本文を選択して手動でコピーしてください。';
        }
      });
      document.getElementById('openChatGptBtn').addEventListener('click', () => {
        const text = document.getElementById('promptBody').value;
        const msgEl = document.getElementById('copyMsg');
        if (text.length > CHATGPT_URL_LIMIT) {
          msgEl.textContent = 'プロンプトが長いため自動入力できません。「コピーする」→ChatGPTに手動で貼り付けてください。';
          window.open('https://chatgpt.com/', '_blank', 'noopener');
          return;
        }
        window.open('https://chatgpt.com/?q=' + encodeURIComponent(text), '_blank', 'noopener');
        msgEl.textContent = '新しいタブでChatGPTを開きました（自動入力されない場合は「コピーする」→貼り付けてください）。';
      });
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

    // ── PWA静的ファイル（認証不要）──
    if (STATIC_FILES[pathname] && method === 'GET') {
      const asset = STATIC_FILES[pathname];
      const filePath = path.join(PUBLIC_DIR, asset.file);
      if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'public, max-age=3600' });
      return fs.createReadStream(filePath).pipe(res);
    }

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
