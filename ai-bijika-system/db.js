'use strict';
// AI商品化実践システム DB（node:sqlite）
// 買い切りの購入者向けアプリ。AI利用料は購入者自身のAPIキーで負担する方針のため、
// APIキーは一切このDBに保存しない（lib/aiproxy.js を参照）。
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'ai-bijika.db');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

const generateId = () => crypto.randomBytes(10).toString('hex');
const now = () => new Date().toISOString();

// ── users ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

// ── gate_progress（GATE1〜10、購入者ごと）──
db.exec(`
  CREATE TABLE IF NOT EXISTS gate_progress (
    user_id TEXT NOT NULL,
    gate_no INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING / GREEN / YELLOW / RED
    note TEXT DEFAULT '',
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (user_id, gate_no)
  );
`);

// ── day_progress（DAY1〜90、購入者ごと）──
db.exec(`
  CREATE TABLE IF NOT EXISTS day_progress (
    user_id TEXT NOT NULL,
    day_no INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (user_id, day_no)
  );
`);

// ── prompts（マスタデータ、購入者共通・読み取り専用）──
db.exec(`
  CREATE TABLE IF NOT EXISTS prompts (
    no INTEGER PRIMARY KEY,
    phase TEXT NOT NULL,
    title TEXT NOT NULL,
    timing TEXT DEFAULT '',
    body TEXT NOT NULL,
    note TEXT DEFAULT ''
  );
`);

// ── ai_runs（購入者がAIに実行させた結果の履歴。APIキーは含めない）──
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    prompt_no INTEGER,
    provider TEXT NOT NULL,
    input_text TEXT NOT NULL,
    output_text TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

// 購入者属性（オンボーディングで選択）。既存DB向けに冪等ALTERで追加
try { db.exec("ALTER TABLE users ADD COLUMN persona TEXT DEFAULT ''"); } catch {}

// ── product_profile（購入者が作っている商品の基本情報＋お客様からの代金の受け取り方。1購入者1件）──
db.exec(`
  CREATE TABLE IF NOT EXISTS product_profile (
    user_id TEXT PRIMARY KEY,
    product_name TEXT DEFAULT '',
    product_format TEXT DEFAULT '',
    product_type TEXT DEFAULT '',
    target TEXT DEFAULT '',
    pain TEXT DEFAULT '',
    channel TEXT DEFAULT '',
    price_band TEXT DEFAULT '',
    payment_method TEXT DEFAULT '',
    bank_name TEXT DEFAULT '',
    bank_branch TEXT DEFAULT '',
    account_type TEXT DEFAULT '',
    account_number TEXT DEFAULT '',
    account_holder TEXT DEFAULT '',
    transfer_note TEXT DEFAULT '',
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

// お客様（購入者の商品を買う人）からの代金の受け取りに関する追加項目。既存DB向けに冪等ALTERで追加
for (const col of ['sale_price', 'pay_deadline', 'pay_url_card', 'pay_url_paypal', 'pay_url_platform', 'pay_other_note']) {
  try { db.exec(`ALTER TABLE product_profile ADD COLUMN ${col} TEXT DEFAULT ''`); } catch {}
}

const PROFILE_FIELDS = [
  'product_name', 'product_format', 'product_type', 'target', 'pain', 'channel', 'price_band',
  'sale_price', 'payment_method', 'bank_name', 'bank_branch', 'account_type', 'account_number', 'account_holder',
  'transfer_note', 'pay_deadline', 'pay_url_card', 'pay_url_paypal', 'pay_url_platform', 'pay_other_note',
];

const Users = {
  create({ email, passwordHash, passwordSalt, displayName }) {
    const id = generateId();
    db.prepare(`INSERT INTO users (id, email, password_hash, password_salt, display_name) VALUES (?, ?, ?, ?, ?)`)
      .run(id, email.toLowerCase().trim(), passwordHash, passwordSalt, displayName || '');
    return id;
  },
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  },
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  setPersona(id, persona) {
    db.prepare('UPDATE users SET persona = ? WHERE id = ?').run(persona, id);
  },
};

const ProductProfile = {
  FIELDS: PROFILE_FIELDS,
  get(userId) {
    const row = db.prepare('SELECT * FROM product_profile WHERE user_id = ?').get(userId);
    if (row) return row;
    return Object.fromEntries([['user_id', userId], ...PROFILE_FIELDS.map((f) => [f, ''])]);
  },
  // values に含まれるキーだけを更新する（部分更新）
  update(userId, values) {
    const cur = ProductProfile.get(userId);
    const next = { ...cur };
    for (const f of PROFILE_FIELDS) if (f in values) next[f] = values[f];
    const cols = PROFILE_FIELDS.join(', ');
    const qs = PROFILE_FIELDS.map(() => '?').join(', ');
    const upd = PROFILE_FIELDS.map((f) => `${f}=excluded.${f}`).join(', ');
    db.prepare(`
      INSERT INTO product_profile (user_id, ${cols}, updated_at) VALUES (?, ${qs}, ?)
      ON CONFLICT(user_id) DO UPDATE SET ${upd}, updated_at=excluded.updated_at
    `).run(userId, ...PROFILE_FIELDS.map((f) => next[f] || ''), now());
  },
};

const GateProgress = {
  listForUser(userId) {
    const rows = db.prepare('SELECT * FROM gate_progress WHERE user_id = ? ORDER BY gate_no').all(userId);
    const byGate = new Map(rows.map(r => [r.gate_no, r]));
    const out = [];
    for (let g = 1; g <= 10; g++) {
      out.push(byGate.get(g) || { user_id: userId, gate_no: g, status: 'PENDING', note: '' });
    }
    return out;
  },
  upsert(userId, gateNo, status, note) {
    db.prepare(`
      INSERT INTO gate_progress (user_id, gate_no, status, note, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, gate_no) DO UPDATE SET status=excluded.status, note=excluded.note, updated_at=excluded.updated_at
    `).run(userId, gateNo, status, note || '', now());
  },
};

const DayProgress = {
  listForUser(userId) {
    const rows = db.prepare('SELECT * FROM day_progress WHERE user_id = ?').all(userId);
    const done = new Set(rows.filter(r => r.done).map(r => r.day_no));
    return done;
  },
  setDone(userId, dayNo, done) {
    db.prepare(`
      INSERT INTO day_progress (user_id, day_no, done, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, day_no) DO UPDATE SET done=excluded.done, updated_at=excluded.updated_at
    `).run(userId, dayNo, done ? 1 : 0, now());
  },
};

const Prompts = {
  all() {
    return db.prepare('SELECT * FROM prompts ORDER BY no').all();
  },
  get(no) {
    return db.prepare('SELECT * FROM prompts WHERE no = ?').get(no);
  },
  // マスタデータなので起動のたびに seeds/prompts.js の内容へ同期する（本文の修正を本番DBにも反映させるため）
  sync(list) {
    const stmt = db.prepare(`
      INSERT INTO prompts (no, phase, title, timing, body, note) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(no) DO UPDATE SET phase=excluded.phase, title=excluded.title, timing=excluded.timing,
        body=excluded.body, note=excluded.note
    `);
    for (const p of list) stmt.run(p.no, p.phase, p.title, p.timing || '', p.body, p.note || '');
  },
};

const AiRuns = {
  create({ userId, promptNo, provider, inputText, outputText }) {
    const id = generateId();
    db.prepare(`INSERT INTO ai_runs (id, user_id, prompt_no, provider, input_text, output_text) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, userId, promptNo || null, provider, inputText, outputText);
    return id;
  },
  listForUser(userId, limit) {
    return db.prepare('SELECT * FROM ai_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit || 50);
  },
};

module.exports = { db, Users, GateProgress, DayProgress, Prompts, AiRuns, ProductProfile, generateId, now };
