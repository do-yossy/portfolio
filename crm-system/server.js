const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'crm.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    role TEXT DEFAULT 'member',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    status TEXT DEFAULT '新規',
    memo TEXT DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS customer_tags (
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (customer_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 初期管理者
if (!db.prepare("SELECT id FROM users WHERE username='admin'").get()) {
  const hash = crypto.createHash('sha256').update('admin123').digest('hex');
  db.prepare("INSERT INTO users (username,password,display_name,role) VALUES ('admin',?,'管理者','admin')").run(hash);
}

// ── Utilities ──────────────────────────────────────────────────────────────
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function decodeBuffer(b) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); } catch {}
  try { return new TextDecoder('shift_jis').decode(b); } catch {}
  return b.toString('utf8');
}

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).filter(l => l.trim())) {
    const cols = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function getUser(req) {
  const cookie = req.headers.cookie || '';
  const token = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('session='))?.split('=')[1];
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token=? AND expires_at > datetime('now','localtime')").get(token);
  if (!session) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
}

function requireAuth(req, res) {
  const user = getUser(req);
  if (!user) { send(res, 401, { error: '認証が必要です' }); return null; }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { send(res, 403, { error: '管理者権限が必要です' }); return null; }
  return user;
}

function logActivity(customer_id, user_id, action, detail = '') {
  db.prepare('INSERT INTO activities (customer_id,user_id,action,detail) VALUES (?,?,?,?)').run(customer_id, user_id, action, detail);
}

function getCustomers(extraWhere = '', params = []) {
  const sql = `
    SELECT c.*,
      cat.name AS category_name,
      GROUP_CONCAT(t.id) AS tag_ids,
      GROUP_CONCAT(t.name) AS tag_names
    FROM customers c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN customer_tags ct ON c.id = ct.customer_id
    LEFT JOIN tags t ON ct.tag_id = t.id
    ${extraWhere ? 'WHERE ' + extraWhere : ''}
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `;
  return db.prepare(sql).all(...params);
}

function parsePart(buffer, boundary) {
  const parts = [];
  const sep = Buffer.from('--' + boundary);
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(sep, start);
    if (idx === -1) break;
    const end = buffer.indexOf(sep, idx + sep.length);
    if (end === -1) break;
    const chunk = buffer.slice(idx + sep.length, end);
    const headerEnd = chunk.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) { start = end; continue; }
    const headerStr = chunk.slice(0, headerEnd).toString();
    const data = chunk.slice(headerEnd + 4, chunk.length - 2);
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const fileMatch = headerStr.match(/filename="([^"]+)"/);
    parts.push({ name: nameMatch?.[1], filename: fileMatch?.[1], data });
    start = end;
  }
  return parts;
}

// ── Server ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  try {

  // ── Auth ────────────────────────────────────────────────────────────────
  if (pathname === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const hash = crypto.createHash('sha256').update(body.password || '').digest('hex');
    const user = db.prepare('SELECT * FROM users WHERE username=? AND password=?').get(body.username, hash);
    if (!user) return send(res, 401, { error: 'ユーザー名またはパスワードが正しくありません' });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, user.id, expires);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; Max-Age=${7*24*3600}`);
    return send(res, 200, { id: user.id, username: user.username, display_name: user.display_name, role: user.role });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const cookie = req.headers.cookie || '';
    const token = cookie.split(';').map(c => c.trim()).find(c => c.startsWith('session='))?.split('=')[1];
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && method === 'GET') {
    const user = getUser(req);
    if (!user) return send(res, 401, { error: '未認証' });
    return send(res, 200, { id: user.id, username: user.username, display_name: user.display_name, role: user.role });
  }

  // ── Users ───────────────────────────────────────────────────────────────
  if (pathname === '/api/users' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    return send(res, 200, db.prepare('SELECT id,username,display_name,role,created_at FROM users ORDER BY id').all());
  }

  if (pathname === '/api/users' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    if (!body.username || !body.password) return send(res, 400, { error: 'ユーザー名とパスワードは必須です' });
    const hash = crypto.createHash('sha256').update(body.password).digest('hex');
    try {
      const r = db.prepare('INSERT INTO users (username,password,display_name,role) VALUES (?,?,?,?)').run(body.username, hash, body.display_name || body.username, body.role || 'member');
      return send(res, 201, { id: r.lastInsertRowid });
    } catch { return send(res, 400, { error: 'そのユーザー名は既に使われています' }); }
  }

  if (pathname.match(/^\/api\/users\/(\d+)$/) && method === 'DELETE') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const id = Number(pathname.split('/')[3]);
    if (id === admin.id) return send(res, 400, { error: '自分自身は削除できません' });
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    return send(res, 200, { ok: true });
  }

  // ── Customers ───────────────────────────────────────────────────────────
  if (pathname === '/api/customers' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    return send(res, 200, getCustomers());
  }

  if (pathname === '/api/customers' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    if (!body.name) return send(res, 400, { error: '名前は必須です' });
    const r = db.prepare('INSERT INTO customers (name,company,phone,email,status,memo,category_id,created_by) VALUES (?,?,?,?,?,?,?,?)').run(
      body.name, body.company||'', body.phone||'', body.email||'',
      body.status||'新規', body.memo||'',
      body.category_id || null, user.id
    );
    const cid = r.lastInsertRowid;
    if (Array.isArray(body.tag_ids)) {
      for (const tid of body.tag_ids) db.prepare('INSERT OR IGNORE INTO customer_tags VALUES (?,?)').run(cid, tid);
    }
    logActivity(cid, user.id, '登録', body.name + ' を登録');
    return send(res, 201, { id: cid });
  }

  if (pathname.match(/^\/api\/customers\/(\d+)$/) && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const rows = getCustomers('c.id=?', [id]);
    if (!rows.length) return send(res, 404, { error: '見つかりません' });
    return send(res, 200, rows[0]);
  }

  if (pathname.match(/^\/api\/customers\/(\d+)$/) && method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    const before = db.prepare('SELECT status FROM customers WHERE id=?').get(id);
    db.prepare("UPDATE customers SET name=?,company=?,phone=?,email=?,status=?,memo=?,category_id=?,updated_at=datetime('now','localtime') WHERE id=?").run(
      body.name||'', body.company||'', body.phone||'', body.email||'',
      body.status||'新規', body.memo||'', body.category_id||null, id
    );
    db.prepare('DELETE FROM customer_tags WHERE customer_id=?').run(id);
    if (Array.isArray(body.tag_ids)) {
      for (const tid of body.tag_ids) db.prepare('INSERT OR IGNORE INTO customer_tags VALUES (?,?)').run(id, tid);
    }
    if (before && before.status !== body.status) logActivity(id, user.id, 'ステータス変更', `${before.status} → ${body.status}`);
    else logActivity(id, user.id, '更新', '顧客情報を更新');
    return send(res, 200, { ok: true });
  }

  if (pathname.match(/^\/api\/customers\/(\d+)$/) && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const c = db.prepare('SELECT name FROM customers WHERE id=?').get(id);
    // Delete files from disk
    const dbFiles = db.prepare('SELECT path FROM files WHERE customer_id=?').all(id);
    for (const f of dbFiles) { try { fs.unlinkSync(f.path); } catch {} }
    db.prepare('DELETE FROM customers WHERE id=?').run(id);
    logActivity(id, user.id, '削除', (c?.name || '') + ' を削除');
    return send(res, 200, { ok: true });
  }

  // ── History ─────────────────────────────────────────────────────────────
  if (pathname.match(/^\/api\/customers\/(\d+)\/history$/) && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const rows = db.prepare(`
      SELECT h.*, u.display_name AS author_name, u.username AS author_username
      FROM history h LEFT JOIN users u ON h.user_id=u.id
      WHERE h.customer_id=? ORDER BY h.created_at DESC
    `).all(id);
    return send(res, 200, rows);
  }

  if (pathname.match(/^\/api\/customers\/(\d+)\/history$/) && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    if (!body.content) return send(res, 400, { error: '内容は必須です' });
    const r = db.prepare('INSERT INTO history (customer_id,user_id,content) VALUES (?,?,?)').run(id, user.id, body.content);
    logActivity(id, user.id, '対応履歴追加', body.content.slice(0, 60));
    return send(res, 201, { id: r.lastInsertRowid });
  }

  if (pathname.match(/^\/api\/history\/(\d+)$/) && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    db.prepare('DELETE FROM history WHERE id=?').run(pathname.split('/')[3]);
    return send(res, 200, { ok: true });
  }

  // ── Activities ──────────────────────────────────────────────────────────
  if (pathname.match(/^\/api\/customers\/(\d+)\/activities$/) && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const rows = db.prepare('SELECT a.*, u.username FROM activities a LEFT JOIN users u ON a.user_id=u.id WHERE a.customer_id=? ORDER BY a.created_at DESC').all(id);
    return send(res, 200, rows);
  }

  if (pathname === '/api/activities' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const rows = db.prepare('SELECT a.*, u.username, c.name AS customer_name FROM activities a LEFT JOIN users u ON a.user_id=u.id LEFT JOIN customers c ON a.customer_id=c.id ORDER BY a.created_at DESC LIMIT 200').all();
    return send(res, 200, rows);
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  if (pathname === '/api/tags' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    return send(res, 200, db.prepare('SELECT * FROM tags ORDER BY name').all());
  }
  if (pathname === '/api/tags' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    if (!body.name) return send(res, 400, { error: 'タグ名は必須です' });
    try {
      const r = db.prepare('INSERT INTO tags (name) VALUES (?)').run(body.name);
      return send(res, 201, { id: r.lastInsertRowid, name: body.name });
    } catch { return send(res, 400, { error: 'そのタグ名は既に存在します' }); }
  }
  if (pathname.match(/^\/api\/tags\/(\d+)$/) && method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    db.prepare('DELETE FROM tags WHERE id=?').run(pathname.split('/')[3]);
    return send(res, 200, { ok: true });
  }

  // ── Categories ───────────────────────────────────────────────────────────
  if (pathname === '/api/categories' && method === 'GET') {
    if (!requireAuth(req, res)) return;
    return send(res, 200, db.prepare('SELECT * FROM categories ORDER BY name').all());
  }
  if (pathname === '/api/categories' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    if (!body.name) return send(res, 400, { error: 'カテゴリ名は必須です' });
    try {
      const r = db.prepare('INSERT INTO categories (name) VALUES (?)').run(body.name);
      return send(res, 201, { id: r.lastInsertRowid, name: body.name });
    } catch { return send(res, 400, { error: 'そのカテゴリ名は既に存在します' }); }
  }
  if (pathname.match(/^\/api\/categories\/(\d+)$/) && method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    db.prepare('DELETE FROM categories WHERE id=?').run(pathname.split('/')[3]);
    return send(res, 200, { ok: true });
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  if (pathname === '/api/stats' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const total = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
    const statusRows = db.prepare('SELECT status, COUNT(*) AS c FROM customers GROUP BY status').all();
    const by_status = {};
    for (const r of statusRows) by_status[r.status] = r.c;
    const by_category = db.prepare(`
      SELECT COALESCE(cat.name,'未分類') AS name, COUNT(*) AS count
      FROM customers c LEFT JOIN categories cat ON c.category_id=cat.id
      GROUP BY c.category_id ORDER BY count DESC LIMIT 10
    `).all();
    const monthly = db.prepare(`
      SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
      FROM customers GROUP BY month ORDER BY month ASC LIMIT 24
    `).all();
    return send(res, 200, { total, by_status, by_category, monthly });
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  if (pathname === '/api/export/csv' && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const rows = getCustomers();
    const headers = ['ID','名前','会社名','電話番号','メール','ステータス','カテゴリ','タグ','メモ','登録日'];
    const csv = [headers.join(','), ...rows.map(c => [
      c.id, c.name, c.company, c.phone, c.email, c.status,
      c.category_name||'', c.tag_names||'', c.memo, (c.created_at||'').slice(0,10)
    ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))].join('\r\n');
    const filename = encodeURIComponent(`顧客リスト_${new Date().toISOString().slice(0,10)}.csv`);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
    return res.end('﻿' + csv);
  }

  // ── CSV Import ────────────────────────────────────────────────────────────
  if (pathname === '/api/import/csv' && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const buffer = await readRaw(req);
    const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
    if (!boundary) return send(res, 400, { error: 'multipart required' });
    const parts = parsePart(buffer, boundary);
    const filePart = parts.find(p => p.filename);
    if (!filePart) return send(res, 400, { error: 'ファイルが見つかりません' });
    const text = decodeBuffer(filePart.data);
    const rows = parseCSV(text);
    if (rows.length < 2) return send(res, 400, { error: 'データがありません' });
    const headers = rows[0].map(h => h.toLowerCase().trim());
    const get = (row, keys) => {
      for (const k of keys) { const i = headers.findIndex(h => h.includes(k)); if (i >= 0 && row[i]) return row[i].trim(); }
      return '';
    };
    const stmt = db.prepare('INSERT INTO customers (name,company,phone,email,status,memo,created_by) VALUES (?,?,?,?,?,?,?)');
    let inserted = 0, skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = get(row, ['名前','氏名','name']);
      if (!name) { skipped++; continue; }
      const r = stmt.run(name, get(row,['会社','company']), get(row,['電話','phone','tel']), get(row,['メール','email','mail']), get(row,['ステータス','status'])||'新規', get(row,['メモ','memo','備考']), user.id);
      inserted++;
    }
    return send(res, 200, { inserted, skipped });
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  if (pathname.match(/^\/api\/customers\/(\d+)\/files$/) && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    return send(res, 200, db.prepare('SELECT id,name,size,created_at FROM files WHERE customer_id=? ORDER BY created_at DESC').all(id));
  }

  if (pathname.match(/^\/api\/customers\/(\d+)\/files$/) && method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const buffer = await readRaw(req);
    const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
    if (!boundary) return send(res, 400, { error: 'multipart required' });
    const parts = parsePart(buffer, boundary);
    const filePart = parts.find(p => p.filename);
    if (!filePart) return send(res, 400, { error: 'ファイルが見つかりません' });
    const ext = path.extname(filePart.filename);
    const saveName = crypto.randomBytes(16).toString('hex') + ext;
    const savePath = path.join(UPLOAD_DIR, saveName);
    fs.writeFileSync(savePath, filePart.data);
    const r = db.prepare('INSERT INTO files (customer_id,name,path,size,uploaded_by) VALUES (?,?,?,?,?)').run(id, filePart.filename, savePath, filePart.data.length, user.id);
    logActivity(id, user.id, 'ファイル添付', filePart.filename);
    return send(res, 201, { id: r.lastInsertRowid, name: filePart.filename, size: filePart.data.length });
  }

  if (pathname.match(/^\/api\/files\/(\d+)$/) && method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const file = db.prepare('SELECT * FROM files WHERE id=?').get(id);
    if (!file) return send(res, 404, { error: '見つかりません' });
    const data = fs.readFileSync(file.path);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`
    });
    return res.end(data);
  }

  if (pathname.match(/^\/api\/files\/(\d+)$/) && method === 'DELETE') {
    const user = requireAuth(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const file = db.prepare('SELECT * FROM files WHERE id=?').get(id);
    if (!file) return send(res, 404, { error: '見つかりません' });
    try { fs.unlinkSync(file.path); } catch {}
    db.prepare('DELETE FROM files WHERE id=?').run(id);
    return send(res, 200, { ok: true });
  }

  // ── Static files ──────────────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/index.html') {
    if (!getUser(req)) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    return serveStatic(res, path.join(__dirname, 'public', 'index.html'));
  }
  if (pathname === '/login' || pathname === '/login.html') {
    return serveStatic(res, path.join(__dirname, 'public', 'login.html'));
  }
  const fp = path.join(__dirname, 'public', pathname.replace(/^\//, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return serveStatic(res, fp);

  res.writeHead(404); res.end('Not found');

  } catch(err) {
    console.error('Server error:', err);
    if (!res.headersSent) send(res, 500, { error: 'サーバーエラーが発生しました' });
  }
});

function serveStatic(res, fp) {
  const ext = path.extname(fp);
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
  res.writeHead(200, { 'Content-Type': (types[ext] || 'text/plain') + '; charset=utf-8' });
  res.end(fs.readFileSync(fp));
}

server.listen(PORT, () => {
  console.log(`\n🗂️  CRM System 起動中`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   初期ログイン: admin / admin123\n`);
});
