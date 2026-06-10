'use strict';
/**
 * データ層（SQLite / node:sqlite）。recruitment-platform と同方式。
 * DATABASE_URL を設定すれば将来 Postgres へ差し替え可能（db-factory 方式）。
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.SALES_DB_PATH || path.join(DATA_DIR, 'sales.db');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '(無題)',
    client TEXT DEFAULT '',
    industry TEXT DEFAULT '',
    email TEXT DEFAULT '',
    source TEXT NOT NULL DEFAULT 'lancers',   -- lancers/crowdworks/cwtech/lp
    type TEXT DEFAULT 'LP',                    -- LP/corp/ec/system/ai/line
    stage TEXT NOT NULL DEFAULT 'lead',        -- lead/applied/meeting/build/qa/deliver/won/lost
    amount INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    priority TEXT DEFAULT '',
    pred_win_rate INTEGER DEFAULT 0,
    est_hours INTEGER DEFAULT 0,
    profit_rate INTEGER DEFAULT 0,
    maintenance INTEGER DEFAULT 0,
    template TEXT DEFAULT '',
    proposal TEXT DEFAULT '',
    next_action TEXT DEFAULT '',
    link TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    raw TEXT DEFAULT '',
    ref TEXT DEFAULT '',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    won_at TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
`);

// 既存DBに ref（案件No）列を追加（無ければ）
try { db.exec("ALTER TABLE deals ADD COLUMN ref TEXT DEFAULT ''"); } catch { /* 既に存在 */ }

const generateId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const COLS = ['title','client','industry','email','source','type','stage','amount','score','priority',
  'pred_win_rate','est_hours','profit_rate','maintenance','template','proposal','next_action','link','notes','raw','ref','won_at'];

const Deals = {
  findAll({ stage, source } = {}) {
    const conds = [], vals = [];
    if (stage) { conds.push('stage = ?'); vals.push(stage); }
    if (source) { conds.push('source = ?'); vals.push(source); }
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    return db.prepare(`SELECT * FROM deals${where} ORDER BY score DESC, created_at DESC`).all(...vals);
  },
  findById(id) { return db.prepare('SELECT * FROM deals WHERE id = ?').get(id); },
  create(data) {
    const id = data.id || generateId();
    const ts = now();
    const row = { stage: 'lead', source: 'lancers', type: 'LP', title: '(無題)', ...data };
    if (row.stage === 'won' && !row.won_at) row.won_at = ts.slice(0, 7) + '-01';
    const cols = COLS.filter(c => row[c] !== undefined);
    const placeholders = cols.map(() => '?').join(',');
    db.prepare(`INSERT INTO deals (id, ${cols.join(',')}, created_at, updated_at) VALUES (?, ${placeholders}, ?, ?)`)
      .run(id, ...cols.map(c => row[c]), ts, ts);
    return Deals.findById(id);
  },
  update(id, data) {
    const cur = Deals.findById(id);
    if (!cur) return null;
    const fields = [], vals = [];
    for (const c of COLS) if (data[c] !== undefined) { fields.push(`${c} = ?`); vals.push(data[c]); }
    if (data.stage === 'won' && cur.stage !== 'won' && data.won_at === undefined) {
      fields.push('won_at = ?'); vals.push(now().slice(0, 7) + '-01');
    }
    if (!fields.length) return cur;
    fields.push('updated_at = ?'); vals.push(now(), id);
    db.prepare(`UPDATE deals SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return Deals.findById(id);
  },
  remove(id) { db.prepare('DELETE FROM deals WHERE id = ?').run(id); }
};

const Logs = {
  create(action, status, message, details = '') {
    db.prepare('INSERT INTO logs (id, action, status, message, details, created_at) VALUES (?,?,?,?,?,?)')
      .run(generateId(), action, status, message, typeof details === 'string' ? details : JSON.stringify(details), now());
  },
  findAll(limit = 100) { return db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?').all(limit); }
};

module.exports = { db, Deals, Logs, generateId, now };
