'use strict';
// 求人ボックス専用システム DB（node:sqlite）
// 現システム(recruitment-platform)の求人まわりの仕様をそのまま引き写し、
// 求人ボックスの投稿・成績・AI改善・月次レポートに必要なテーブルだけを持つ軽量版。
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'recruitment.db');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

const generateId = () => crypto.randomBytes(10).toString('hex');
const now = () => new Date().toISOString();

// ── jobs（現システムと同一カラム構成）──
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    salary TEXT NOT NULL,
    job_type TEXT NOT NULL,
    employment_type TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    catchcopy TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    faq TEXT DEFAULT '[]',
    is_published INTEGER DEFAULT 0,
    target_media TEXT DEFAULT '[]',
    published_at TEXT DEFAULT NULL,
    expires_at TEXT DEFAULT NULL,
    company TEXT NOT NULL DEFAULT 'sq',
    rewarding TEXT DEFAULT '',
    worktime_holiday TEXT DEFAULT '',
    transportation TEXT DEFAULT '',
    how_to_apply TEXT DEFAULT '',
    qualifications TEXT DEFAULT '',
    benefit TEXT DEFAULT '',
    locations TEXT DEFAULT '[]',
    kyujinbox_job_number TEXT DEFAULT '',
    kyujinbox_posted_at TEXT DEFAULT NULL,
    optimize_count INTEGER DEFAULT 0,
    last_optimized_at TEXT DEFAULT '',
    job_kind TEXT DEFAULT 'normal',        -- 'normal'=通常求人 / 'agency'=人材紹介求人
    source_file TEXT DEFAULT '',           -- 取り込み元PDFファイル名
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);
// 旧DBからの移行用（列が無ければ追加）
for (const [col, def] of [
  ['qualifications', "TEXT DEFAULT ''"], ['benefit', "TEXT DEFAULT ''"],
  ['locations', "TEXT DEFAULT '[]'"], ['kyujinbox_job_number', "TEXT DEFAULT ''"],
  ['kyujinbox_posted_at', 'TEXT DEFAULT NULL'], ['optimize_count', 'INTEGER DEFAULT 0'],
  ['last_optimized_at', "TEXT DEFAULT ''"], ['faq', "TEXT DEFAULT '[]'"],
  ['job_kind', "TEXT DEFAULT 'normal'"], ['source_file', "TEXT DEFAULT ''"],
]) { try { db.exec(`ALTER TABLE jobs ADD COLUMN ${col} ${def}`); } catch {} }

// ── job_metrics（成績スナップショット・optimizer/insightsが使用）──
db.exec(`
  CREATE TABLE IF NOT EXISTS job_metrics (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL DEFAULT 'sq',
    job_number TEXT NOT NULL DEFAULT '',
    job_id TEXT DEFAULT NULL,
    title TEXT DEFAULT '',
    location TEXT DEFAULT '',
    status TEXT DEFAULT '',
    views INTEGER DEFAULT 0,
    applies INTEGER DEFAULT 0,
    collected_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_metrics_co_num ON job_metrics(company, job_number)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_metrics_job ON job_metrics(job_id)`);

// ── logs（投稿・改善・レポート生成の記録）──
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

// ── reports（月次レポート）──
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    period TEXT NOT NULL,            -- 'YYYY-MM'
    company TEXT NOT NULL DEFAULT 'all',
    html TEXT DEFAULT '',
    summary TEXT DEFAULT '',         -- JSON（集計値）
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_period_co ON reports(period, company)`);

// ── 会社マスタ（求人ボックスのアカウント＝会社）──
// 一旦SQ（Social Quality）のみ。他社を使う場合は下に行を追加すれば各画面に反映される。
const COMPANIES = [
  { id: 'sq', name: '株式会社SocialQuality', short: 'SQ', label: 'Social Quality' },
  // { id: 'bg', name: 'BigEyesコーポレーション株式会社', short: 'BG', label: 'Bigeyes' },
  // { id: 'pe', name: '合同会社ピープル',        short: 'PE', label: 'ピープル' },
  // { id: 'lt', name: '株式会社lifeTaylor',     short: 'LT', label: 'Life Tailor' },
  // { id: 'nc', name: '合同会社ニクール',        short: 'NC', label: 'ニクール' },
  // { id: 'nx', name: 'ネクサス株式会社',        short: 'NX', label: 'ネクサス' },
];
const MEDIA = [{ id: 'kyujinbox', name: '求人ボックス' }];

const Jobs = {
  findAll({ onlyPublished = false, company = null } = {}) {
    if (onlyPublished) {
      if (company !== null && company !== 'all')
        return db.prepare(`SELECT * FROM jobs WHERE is_published=1 AND company=? ORDER BY created_at DESC`).all(company);
      return db.prepare(`SELECT * FROM jobs WHERE is_published=1 ORDER BY created_at DESC`).all();
    }
    if (company !== null && company !== 'all')
      return db.prepare(`SELECT * FROM jobs WHERE company=? ORDER BY created_at DESC`).all(company);
    return db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`).all();
  },
  findById(id) { return db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id); },
  create(data) {
    const id = generateId(); const ts = now();
    db.prepare(`INSERT INTO jobs
      (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,faq,is_published,target_media,published_at,expires_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit,locations,job_kind,source_file,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, data.title, data.location, data.salary,
      data.jobType || data.job_type || '', data.employmentType || data.employment_type || '',
      data.description, JSON.stringify(data.tags || []), data.catchcopy || '',
      data.imageUrl || data.image_url || '', JSON.stringify(data.faq || []),
      (data.isPublished || data.is_published) ? 1 : 0,
      JSON.stringify(data.targetMedia || data.target_media || []),
      data.publishedAt || data.published_at || null, data.expiresAt || data.expires_at || null,
      data.company || 'sq', data.rewarding || '',
      data.worktimeHoliday || data.worktime_holiday || '', data.transportation || '',
      data.howToApply || data.how_to_apply || '', data.qualifications || '', data.benefit || '',
      JSON.stringify(data.locations || []),
      data.jobKind || data.job_kind || 'normal', data.sourceFile || data.source_file || '',
      ts, ts);
    return Jobs.findById(id);
  },
  update(id, data) {
    const ts = now();
    const map = {
      title: 'title', location: 'location', salary: 'salary',
      jobType: 'job_type', job_type: 'job_type',
      employmentType: 'employment_type', employment_type: 'employment_type',
      description: 'description', catchcopy: 'catchcopy',
      imageUrl: 'image_url', image_url: 'image_url',
      isPublished: 'is_published', is_published: 'is_published',
      targetMedia: 'target_media', target_media: 'target_media',
      publishedAt: 'published_at', expiresAt: 'expires_at',
      rewarding: 'rewarding',
      worktimeHoliday: 'worktime_holiday', worktime_holiday: 'worktime_holiday',
      transportation: 'transportation', howToApply: 'how_to_apply', how_to_apply: 'how_to_apply',
      qualifications: 'qualifications', benefit: 'benefit',
      kyujinbox_posted_at: 'kyujinbox_posted_at', kyujinbox_job_number: 'kyujinbox_job_number',
      locations: 'locations', jobKind: 'job_kind', job_kind: 'job_kind',
      sourceFile: 'source_file', source_file: 'source_file',
    };
    const fields = [], vals = [];
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) {
        fields.push(`${col}=?`);
        const v = data[key];
        vals.push(Array.isArray(v) ? JSON.stringify(v) : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
      }
    }
    if (data.tags !== undefined) { fields.push('tags=?'); vals.push(JSON.stringify(data.tags)); }
    if (data.company !== undefined) { fields.push('company=COALESCE(?,company)'); vals.push(data.company || null); }
    if (fields.length === 0) return Jobs.findById(id);
    fields.push('updated_at=?'); vals.push(ts, id);
    db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id=?`).run(...vals);
    return Jobs.findById(id);
  },
  delete(id) { db.prepare(`DELETE FROM jobs WHERE id=?`).run(id); },
};

const Logs = {
  create(action, status, message = '', details = '') {
    const id = generateId();
    db.prepare(`INSERT INTO logs (id,action,status,message,details,created_at) VALUES (?,?,?,?,?,?)`)
      .run(id, action, status, message, details, now());
    return id;
  },
  findAll(limit = 100) { return db.prepare(`SELECT * FROM logs ORDER BY created_at DESC LIMIT ?`).all(limit); },
  lastPostTime() {
    const r = db.prepare(`SELECT created_at FROM logs WHERE action='kyujinbox_post' AND status='success' ORDER BY created_at DESC LIMIT 1`).get();
    return r ? r.created_at : null;
  },
};

const Reports = {
  upsert(period, company, html, summaryObj) {
    const existing = db.prepare(`SELECT id FROM reports WHERE period=? AND company=?`).get(period, company);
    const summary = JSON.stringify(summaryObj || {});
    if (existing) {
      db.prepare(`UPDATE reports SET html=?, summary=?, created_at=? WHERE id=?`).run(html, summary, now(), existing.id);
      return existing.id;
    }
    const id = generateId();
    db.prepare(`INSERT INTO reports (id,period,company,html,summary,created_at) VALUES (?,?,?,?,?,?)`)
      .run(id, period, company, html, summary, now());
    return id;
  },
  get(period, company = 'all') { return db.prepare(`SELECT * FROM reports WHERE period=? AND company=?`).get(period, company); },
  latest() { return db.prepare(`SELECT * FROM reports ORDER BY period DESC, created_at DESC LIMIT 1`).get(); },
  list(limit = 24) { return db.prepare(`SELECT id,period,company,summary,created_at FROM reports ORDER BY period DESC LIMIT ?`).all(limit); },
  has(period, company = 'all') { return !!db.prepare(`SELECT 1 FROM reports WHERE period=? AND company=?`).get(period, company); },
  delete(period, company = 'all') { return db.prepare(`DELETE FROM reports WHERE period=? AND company=?`).run(period, company).changes; },
};

module.exports = { db, generateId, now, Jobs, Logs, Reports, COMPANIES, MEDIA, DATA_DIR, DB_PATH };
