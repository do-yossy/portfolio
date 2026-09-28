'use strict';
// ミチシルベ DB（node:sqlite）
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

// ── inquiries（お問い合わせ。購入前の質問／購入者からの質問どちらも受け付ける）──
db.exec(`
  CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT DEFAULT '',
    email TEXT NOT NULL,
    category TEXT DEFAULT '',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEW',  -- NEW / DONE
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

// 購入者属性（オンボーディングで選択）。既存DB向けに冪等ALTERで追加
try { db.exec("ALTER TABLE users ADD COLUMN persona TEXT DEFAULT ''"); } catch {}

// ライセンス認証済みかどうか。DEFAULT 1 なので、この列を追加した時点で既にDBにいる
// 購入者（=既存のお客様）は自動的に認証済み扱いになる（締め出さない）。
// 新規登録は Users.create 側で明示的に 0 を渡し、/license でのコード入力を必須にする。
try { db.exec('ALTER TABLE users ADD COLUMN license_active INTEGER DEFAULT 1'); } catch {}

// ── licenses（購入者だけが使えるようにするためのライセンスキー。運営者が発行し、購入者に案内する）──
db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNUSED', -- UNUSED / ACTIVE / REVOKED
    user_id TEXT,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    activated_at TEXT
  );
`);

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
  // licenseActive: 既定は0（未認証）。新規登録は必ずライセンスキーの入力が必要になる。
  // ALTER時にDEFAULT 1で追加された既存行（=既に使っている購入者）だけが最初から1のまま残る。
  create({ email, passwordHash, passwordSalt, displayName, licenseActive = 0 }) {
    const id = generateId();
    db.prepare(`INSERT INTO users (id, email, password_hash, password_salt, display_name, license_active) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, email.toLowerCase().trim(), passwordHash, passwordSalt, displayName || '', licenseActive ? 1 : 0);
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
  setLicenseActive(id, active) {
    db.prepare('UPDATE users SET license_active = ? WHERE id = ?').run(active ? 1 : 0, id);
  },
};

const LICENSE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい 0/O・1/I は除外
function randomLicenseCode() {
  const part = () => Array.from({ length: 4 }, () => LICENSE_CODE_CHARS[crypto.randomInt(LICENSE_CODE_CHARS.length)]).join('');
  return `MICHI-${part()}-${part()}`;
}

const Licenses = {
  // n件のコードを新規発行して、生成したコードの配列を返す（運営者がそのまま購入者に案内する）
  generate(n, note) {
    const stmt = db.prepare('INSERT INTO licenses (id, code, note) VALUES (?, ?, ?)');
    const codes = [];
    for (let i = 0; i < n; i++) {
      const code = randomLicenseCode();
      stmt.run(generateId(), code, note || '');
      codes.push(code);
    }
    return codes;
  },
  findByCode(code) {
    return db.prepare('SELECT * FROM licenses WHERE code = ?').get(String(code || '').toUpperCase().trim());
  },
  all() {
    return db.prepare(`
      SELECT licenses.*, users.email AS user_email
      FROM licenses LEFT JOIN users ON users.id = licenses.user_id
      ORDER BY licenses.created_at DESC
    `).all();
  },
  // UNUSEDのコードを、そのユーザーに割り当てて有効化する
  activate(code, userId) {
    db.prepare(`UPDATE licenses SET status='ACTIVE', user_id=?, activated_at=? WHERE code=?`)
      .run(userId, now(), String(code || '').toUpperCase().trim());
  },
  revoke(id) {
    const row = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
    if (!row) return null;
    db.prepare(`UPDATE licenses SET status='REVOKED' WHERE id=?`).run(id);
    return row;
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

const Inquiries = {
  create({ userId, name, email, category, message }) {
    const id = generateId();
    db.prepare(`INSERT INTO inquiries (id, user_id, name, email, category, message) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, userId || null, name || '', email, category || '', message);
    return id;
  },
  all() {
    return db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all();
  },
  setStatus(id, status) {
    db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, id);
  },
};

module.exports = { db, Users, GateProgress, DayProgress, Prompts, AiRuns, ProductProfile, Inquiries, Licenses, generateId, now };
