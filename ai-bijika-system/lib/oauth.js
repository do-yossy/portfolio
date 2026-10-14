'use strict';
// MCP 接続用の OAuth 2.1 認可サーバー（AIアシスタントから、APIキーなしで「ログイン→許可」だけで接続できるようにする）。
//   メタデータ（RFC 8414・RFC 9728）／クライアントの動的登録（RFC 7591）／認可コード＋PKCE(S256)／リフレッシュトークン（使うたびに更新）
// トークンはハッシュだけを保存する。利用者はマイページで接続中のアプリを確認・解除できる。
const crypto = require('crypto');
const { db, generateId, now } = require('../db');
const csrf = require('./csrf');
const auth = require('./auth');
const { escapeHtml } = require('./ui');
const { createLimiter } = require('./ratelimit');

db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
`);

const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 24 * 3600;
const CODE_TTL = 600;
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const rand = (prefix) => `${prefix}${crypto.randomBytes(32).toString('hex')}`;
const base = () => String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, '');
const regLimiter = createLimiter({ max: 20, windowMs: 60 * 60 * 1000 });
const tokenLimiter = createLimiter({ max: 60, windowMs: 15 * 60 * 1000 });

// 戻り先は https、または手元のアプリ用の http://localhost・127.0.0.1 だけを許可する
function validRedirect(u) {
  try {
    const x = new URL(u);
    if (x.hash) return false;
    if (x.protocol === 'https:') return true;
    return x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname);
  } catch { return false; }
}

const Clients = {
  create(name, uris) {
    const id = `mcpc_${crypto.randomBytes(16).toString('hex')}`;
    db.prepare('INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES (?,?,?,?)').run(id, name, JSON.stringify(uris), now());
    return id;
  },
  get(id) {
    const r = db.prepare('SELECT * FROM oauth_clients WHERE id=?').get(String(id || ''));
    if (!r) return null;
    return { ...r, redirectUris: JSON.parse(r.redirect_uris) };
  },
};

function issueTokens(clientId, userId) {
  const access = rand('sqa_'); const refresh = rand('sqr_'); const t = Date.now();
  const ins = db.prepare('INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, expires_at, created_at) VALUES (?,?,?,?,?,?)');
  ins.run(hash(access), 'access', clientId, userId, new Date(t + ACCESS_TTL * 1000).toISOString(), now());
  ins.run(hash(refresh), 'refresh', clientId, userId, new Date(t + REFRESH_TTL * 1000).toISOString(), now());
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: 'posts' };
}

// アクセストークンからユーザーを引く（期限切れ・解除済みは無効）
function authenticate(token) {
  if (!/^sqa_[0-9a-f]{64}$/.test(String(token || ''))) return null;
  const r = db.prepare(`SELECT user_id, expires_at FROM oauth_tokens WHERE token_hash=? AND kind='access' AND revoked=0`).get(hash(token));
  if (!r || Date.parse(r.expires_at) < Date.now()) return null;
  return r.user_id;
}

// マイページ用：接続中のアプリ（有効なリフレッシュトークンを持つもの）
function listConnections(userId) {
  return db.prepare(`SELECT c.id, c.name, MAX(t.created_at) AS last_at FROM oauth_tokens t JOIN oauth_clients c ON c.id = t.client_id
    WHERE t.user_id=? AND t.revoked=0 AND t.expires_at > ? GROUP BY c.id, c.name ORDER BY last_at DESC`).all(userId, new Date().toISOString());
}
function revokeClient(userId, clientId) {
  db.prepare('UPDATE oauth_tokens SET revoked=1 WHERE user_id=? AND client_id=?').run(userId, clientId);
}
// 契約終了時など：すべての接続を解除
function revokeAll(userId) { db.prepare('UPDATE oauth_tokens SET revoked=1 WHERE user_id=?').run(userId); }

function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function readRaw(req, limit = 20000) {
  return new Promise((resolve) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { resolve(null); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}
const cors = { 'Access-Control-Allow-Origin': '*' };

function metadataAs() {
  const b = base();
  return {
    issuer: b, authorization_endpoint: `${b}/oauth/authorize`, token_endpoint: `${b}/oauth/token`, registration_endpoint: `${b}/oauth/register`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['posts'],
  };
}
function metadataPr() {
  const b = base();
  return { resource: `${b}/mcp`, authorization_servers: [b], bearer_methods_supported: ['header'], scopes_supported: ['posts'] };
}
// /mcp が未認証のときに返すヘッダー（クライアントはここから認可サーバーを見つける）
const challengeHeader = () => ({ 'WWW-Authenticate': `Bearer resource_metadata="${base()}/.well-known/oauth-protected-resource"` });

function consentPage({ client, params, csrfToken, user }) {
  const host = (() => { try { return new URL(params.redirect_uri).host; } catch { return ''; } })();
  const hidden = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource']
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k] || '')}">`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>接続の許可</title>
<style>:root{--bg:#faf8f3;--fg:#222;--card:#fff;--line:#e3dccb}@media (prefers-color-scheme:dark){:root{--bg:#1b1a17;--fg:#eee;--card:#25231f;--line:#3a3630}}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:520px;margin:40px auto;padding:0 16px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
button{font-size:16px;padding:10px 18px;border-radius:10px;border:1px solid var(--line);cursor:pointer;margin-right:8px}.p{background:#2f5d50;color:#fff;border-color:#2f5d50}li{margin:4px 0}</style></head>
<body><div class="card"><h1 style="font-size:20px">「${escapeHtml(client.name)}」からの接続を許可しますか？</h1>
<p>ログイン中：${escapeHtml(user.email)}</p>
<p>許可すると、このアプリ（AIアシスタントなど）が、あなたのアカウントで次の操作をできるようになります。</p>
<ul><li>連携しているSNSアカウントの確認</li><li>投稿の作成（即時・予約・下書き）と取り消し、状態の確認</li><li>画像・動画のアップロード、AIによる文章・画像の生成</li></ul>
<p style="font-size:13px">接続先：${escapeHtml(host)}　／　あとからマイページでいつでも解除できます。心当たりがない場合は許可しないでください。</p>
<form method="POST" action="/oauth/authorize"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">${hidden}
<button class="p" type="submit" name="decision" value="allow">許可する</button><button type="submit" name="decision" value="deny">許可しない</button></form></div></body></html>`;
}

function redirectTo(res, url) { res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' }); res.end(); }
function withParams(uri, params) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, v);
  return u.toString();
}

async function handle({ req, res, method, pathname, url, user }) {
  if (pathname === '/.well-known/oauth-authorization-server' && method === 'GET') { send(res, 200, metadataAs(), cors); return true; }
  if ((pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') && method === 'GET') { send(res, 200, metadataPr(), cors); return true; }
  if (!pathname.startsWith('/oauth/')) return false;
  const ip = String(req.headers['fly-client-ip'] || req.socket.remoteAddress || '');

  if (method === 'OPTIONS' && (pathname === '/oauth/register' || pathname === '/oauth/token')) {
    res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }); res.end(); return true;
  }

  // クライアントの動的登録
  if (pathname === '/oauth/register' && method === 'POST') {
    if (!regLimiter.allow(ip)) { send(res, 429, { error: 'too_many_requests' }, cors); return true; }
    regLimiter.fail(ip);
    let b = null; try { b = JSON.parse((await readRaw(req)) || ''); } catch { b = null; }
    const uris = b && Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
    if (!uris.length || uris.length > 5 || !uris.every(validRedirect)) { send(res, 400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris は https（または localhost）のURLを1〜5件指定してください。' }, cors); return true; }
    const name = String((b && b.client_name) || 'MCPクライアント').replace(/[\u0000-\u001f]/g, '').slice(0, 60) || 'MCPクライアント';
    const id = Clients.create(name, uris);
    send(res, 201, { client_id: id, client_name: name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(Date.now() / 1000) }, cors);
    return true;
  }

  // 認可（ログイン → 同意画面）
  if (pathname === '/oauth/authorize' && (method === 'GET' || method === 'POST')) {
    let params;
    if (method === 'GET') params = Object.fromEntries(url.searchParams);
    else params = Object.fromEntries(new URLSearchParams((await readRaw(req)) || ''));
    const client = Clients.get(params.client_id);
    if (!client || !client.redirectUris.includes(params.redirect_uri)) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<p>接続の要求が正しくありません（アプリまたは戻り先が登録されていません）。</p>'); return true;
    }
    const back = (p) => redirectTo(res, withParams(params.redirect_uri, { ...p, state: params.state }));
    if (method === 'GET' && params.response_type !== 'code') { back({ error: 'unsupported_response_type' }); return true; }
    if (params.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge || '')) { back({ error: 'invalid_request', error_description: 'PKCE(S256) is required' }); return true; }
    if (!user) {
      const next = `/oauth/authorize?${new URLSearchParams(params).toString()}`;
      redirectTo(res, `/service/login?next=${encodeURIComponent(next)}`); return true;
    }
    const session = auth.parseCookies(req).get('session');
    if (method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });
      res.end(consentPage({ client, params, csrfToken: csrf.tokenFor(session), user }));
      return true;
    }
    if (!csrf.verify(session, params.csrf)) { res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<p>操作の有効期限が切れました。もう一度お試しください。</p>'); return true; }
    if (params.decision !== 'allow') { back({ error: 'access_denied' }); return true; }
    const code = rand('sqc_');
    db.prepare('INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at) VALUES (?,?,?,?,?,?)')
      .run(hash(code), client.id, user.id, params.redirect_uri, params.code_challenge, new Date(Date.now() + CODE_TTL * 1000).toISOString());
    back({ code });
    return true;
  }

  // トークンの発行
  if (pathname === '/oauth/token' && method === 'POST') {
    if (!tokenLimiter.allow(ip)) { send(res, 429, { error: 'too_many_requests' }, cors); return true; }
    const raw = (await readRaw(req)) || '';
    let p;
    if (String(req.headers['content-type'] || '').includes('application/json')) { try { p = JSON.parse(raw); } catch { p = {}; } } else p = Object.fromEntries(new URLSearchParams(raw));
    const fail = (error, d) => { tokenLimiter.fail(ip); send(res, 400, { error, error_description: d }, cors); };
    if (p.grant_type === 'authorization_code') {
      const row = db.prepare('SELECT * FROM oauth_codes WHERE code_hash=?').get(hash(p.code || ''));
      if (row) db.prepare('DELETE FROM oauth_codes WHERE code_hash=?').run(row.code_hash); // 1回だけ使える
      if (!row || Date.parse(row.expires_at) < Date.now()) return fail('invalid_grant', '認可コードが無効か、期限切れです。'), true;
      if (row.client_id !== p.client_id || row.redirect_uri !== p.redirect_uri) return fail('invalid_grant', 'client_id または redirect_uri が一致しません。'), true;
      const challenge = crypto.createHash('sha256').update(String(p.code_verifier || '')).digest('base64url');
      if (!p.code_verifier || challenge !== row.code_challenge) return fail('invalid_grant', 'code_verifier が一致しません。'), true;
      send(res, 200, issueTokens(row.client_id, row.user_id), cors);
      return true;
    }
    if (p.grant_type === 'refresh_token') {
      const row = db.prepare(`SELECT * FROM oauth_tokens WHERE token_hash=? AND kind='refresh'`).get(hash(p.refresh_token || ''));
      if (!row || row.revoked || Date.parse(row.expires_at) < Date.now() || (p.client_id && p.client_id !== row.client_id)) return fail('invalid_grant', 'リフレッシュトークンが無効です。'), true;
      db.prepare('UPDATE oauth_tokens SET revoked=1 WHERE token_hash=?').run(row.token_hash); // 使い回し防止（ローテーション）
      send(res, 200, issueTokens(row.client_id, row.user_id), cors);
      return true;
    }
    fail('unsupported_grant_type', 'grant_type は authorization_code または refresh_token です。');
    return true;
  }
  return false;
}

module.exports = { handle, authenticate, challengeHeader, listConnections, revokeClient, revokeAll, validRedirect };
