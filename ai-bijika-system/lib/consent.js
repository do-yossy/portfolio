'use strict';
// 同意の記録（あとから何かあったときの証拠）。追記だけで、更新・削除の機能は持たない。
// 記録するもの：だれが・いつ・何に同意したか、規約等の版とその時点の本文の控え（ハッシュで照合できる）、表示していた条件、IPアドレス、ブラウザの情報。
const crypto = require('crypto');
const { db, generateId, now } = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS consent_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    terms_version TEXT NOT NULL DEFAULT '',
    docs TEXT NOT NULL DEFAULT '{}',
    detail TEXT NOT NULL DEFAULT '{}',
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_consent_email ON consent_logs(email);
  CREATE TABLE IF NOT EXISTS legal_snapshots (
    hash TEXT PRIMARY KEY,
    file TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const KINDS = {
  checkout: '申込み（利用規約・特定商取引法に基づく表記・プライバシーポリシー・最終確認画面の内容に同意）',
  auto_full: '自動運用の「そのまま投稿する」（AIが作った内容を確認せずに投稿されることに同意）',
  mcp_connect: 'AIアシスタント（MCP）との接続を許可',
};

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const ipOf = (req) => String((req && (req.headers['fly-client-ip'] || (req.socket && req.socket.remoteAddress))) || '').slice(0, 64);

// 文書の本文を控えとして保存し、ハッシュを返す（同じ本文は1回だけ保存する）
function snapshot(file, text) {
  const hash = sha256(text);
  db.prepare('INSERT OR IGNORE INTO legal_snapshots (hash, file, text, created_at) VALUES (?,?,?,?)').run(hash, file, text, now());
  return hash;
}

// 同意を1件記録する。docs は { ファイル名: 本文 }（その時点で利用者に示した本文）
function record({ userId, email, kind, termsVersion = '', docs = {}, detail = {}, req }) {
  const hashes = {};
  for (const [file, text] of Object.entries(docs)) hashes[file] = snapshot(file, text);
  const id = generateId();
  db.prepare(`INSERT INTO consent_logs (id, user_id, email, kind, terms_version, docs, detail, ip, user_agent, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, userId, String(email || ''), kind, termsVersion, JSON.stringify(hashes), JSON.stringify(detail || {}),
    ipOf(req), String((req && req.headers['user-agent']) || '').slice(0, 300), now());
  return id;
}

function list({ email = '', limit = 50 } = {}) {
  const rows = email
    ? db.prepare('SELECT * FROM consent_logs WHERE email = ? ORDER BY created_at DESC LIMIT ?').all(String(email).trim().toLowerCase(), limit)
    : db.prepare('SELECT * FROM consent_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows.map((r) => ({ ...r, docs: JSON.parse(r.docs || '{}'), detail: JSON.parse(r.detail || '{}') }));
}
function forUser(userId) { return db.prepare('SELECT * FROM consent_logs WHERE user_id = ? ORDER BY created_at').all(userId); }
function getSnapshot(hash) { return db.prepare('SELECT * FROM legal_snapshots WHERE hash = ?').get(String(hash || '')) || null; }

// CSV（運営者が保存・提出するため）
function toCsv(rows) {
  const q = (v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`;
  const head = ['日時(UTC)', 'メールアドレス', 'ユーザーID', '種類', '規約の版', '文書のハッシュ', '内容', 'IPアドレス', 'ブラウザ'];
  const lines = rows.map((r) => [r.created_at, r.email, r.user_id, KINDS[r.kind] || r.kind, r.terms_version, JSON.stringify(r.docs), JSON.stringify(r.detail), r.ip, r.user_agent].map(q).join(','));
  return `﻿${head.map(q).join(',')}\n${lines.join('\n')}\n`;
}

module.exports = { record, list, forUser, getSnapshot, toCsv, KINDS, sha256 };
