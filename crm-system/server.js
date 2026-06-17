const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'crm.db');

// DB初期化
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    status TEXT DEFAULT '新規',
    memo TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

// ユーティリティ
function send(res, status, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type + '; charset=utf-8' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
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
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const cols = [];
    let cur = '', inQ = false;
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

function generateCSV(customers) {
  const headers = ['ID','名前','会社名','電話番号','メール','ステータス','メモ','登録日'];
  const rows = customers.map(c => [
    c.id, c.name, c.company, c.phone, c.email, c.status, c.memo, (c.created_at||'').slice(0,10)
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
  return [headers.join(','), ...rows].join('\r\n');
}

// 静的ファイル
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
  const type = types[ext] || 'text/plain';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

// サーバー
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // 顧客一覧
  if (pathname === '/api/customers' && method === 'GET') {
    const { status, q } = parsed.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
    if (q) { sql += ' AND (name LIKE ? OR company LIKE ? OR phone LIKE ? OR email LIKE ?)'; const like = `%${q}%`; params.push(like,like,like,like); }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);
    return send(res, 200, rows);
  }

  // 顧客登録
  if (pathname === '/api/customers' && method === 'POST') {
    const body = await readBody(req);
    if (!body.name) return send(res, 400, { error: '名前は必須です' });
    const stmt = db.prepare(`INSERT INTO customers (name,company,phone,email,status,memo) VALUES (?,?,?,?,?,?)`);
    const result = stmt.run(body.name, body.company||'', body.phone||'', body.email||'', body.status||'新規', body.memo||'');
    return send(res, 201, { id: result.lastInsertRowid, message: '登録しました' });
  }

  // 顧客取得
  if (pathname.match(/^\/api\/customers\/(\d+)$/) && method === 'GET') {
    const id = pathname.split('/')[3];
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!row) return send(res, 404, { error: '見つかりません' });
    return send(res, 200, row);
  }

  // 顧客更新
  if (pathname.match(/^\/api\/customers\/(\d+)$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    db.prepare(`UPDATE customers SET name=?,company=?,phone=?,email=?,status=?,memo=?,updated_at=datetime('now','localtime') WHERE id=?`)
      .run(body.name, body.company||'', body.phone||'', body.email||'', body.status||'新規', body.memo||'', id);
    return send(res, 200, { message: '更新しました' });
  }

  // 顧客削除
  if (pathname.match(/^\/api\/customers\/(\d+)$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    return send(res, 200, { message: '削除しました' });
  }

  // 統計
  if (pathname === '/api/stats' && method === 'GET') {
    const total = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
    const byStatus = db.prepare('SELECT status, COUNT(*) as c FROM customers GROUP BY status').all();
    const recent = db.prepare("SELECT COUNT(*) as c FROM customers WHERE created_at >= date('now','-30 days')").get().c;
    return send(res, 200, { total, byStatus, recent });
  }

  // CSVエクスポート
  if (pathname === '/api/export/csv' && method === 'GET') {
    const { status } = parsed.query;
    let sql = 'SELECT * FROM customers';
    const params = [];
    if (status && status !== 'all') { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);
    const csv = generateCSV(rows);
    const filename = encodeURIComponent(`顧客リスト_${new Date().toISOString().slice(0,10)}.csv`);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
    return res.end('﻿' + csv);
  }

  // CSVインポート
  if (pathname === '/api/import/csv' && method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    await new Promise(r => req.on('end', r));
    const buffer = Buffer.concat(chunks);
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) return send(res, 400, { error: 'multipart required' });
    const body = buffer.toString('binary');
    const parts = body.split('--' + boundary);
    let csvBuf = null;
    for (const part of parts) {
      if (part.includes('filename=')) {
        const idx = part.indexOf('\r\n\r\n');
        if (idx !== -1) {
          const raw = part.slice(idx + 4, part.lastIndexOf('\r\n'));
          csvBuf = Buffer.from(raw, 'binary');
        }
      }
    }
    if (!csvBuf) return send(res, 400, { error: 'ファイルが見つかりません' });
    const text = decodeBuffer(csvBuf);
    const rows = parseCSV(text);
    if (rows.length < 2) return send(res, 400, { error: 'データがありません' });
    const headers = rows[0].map(h => h.toLowerCase());
    let count = 0;
    const stmt = db.prepare(`INSERT INTO customers (name,company,phone,email,status,memo) VALUES (?,?,?,?,?,?)`);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const get = (keys) => { for (const k of keys) { const idx = headers.findIndex(h => h.includes(k)); if (idx >= 0 && row[idx]) return row[idx]; } return ''; };
      const name = get(['名前','氏名','name']);
      if (!name) continue;
      stmt.run(name, get(['会社','company']), get(['電話','phone','tel']), get(['メール','email','mail']), get(['ステータス','status']) || '新規', get(['メモ','memo','備考']));
      count++;
    }
    return send(res, 200, { message: `${count}件インポートしました` });
  }

  // 静的ファイル
  if (pathname === '/' || pathname === '/index.html') return serveStatic(res, path.join(__dirname, 'public', 'index.html'));
  if (pathname.startsWith('/')) {
    const fp = path.join(__dirname, 'public', pathname);
    if (fs.existsSync(fp)) return serveStatic(res, fp);
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🗂️  顧客管理システム（CRM）起動中`);
  console.log(`   管理画面: http://localhost:${PORT}\n`);
});
