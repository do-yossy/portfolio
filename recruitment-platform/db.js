'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// DATA_DIR 環境変数で上書き可能（複数インスタンス対応）
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'recruitment.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS applicants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    age INTEGER DEFAULT NULL,
    address TEXT DEFAULT '',
    source_media TEXT NOT NULL DEFAULT 'direct',
    applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    status TEXT DEFAULT '新規',
    is_duplicate INTEGER DEFAULT 0,
    duplicate_of_id TEXT DEFAULT NULL,
    notes TEXT DEFAULT '',
    normalized_phone TEXT DEFAULT '',
    normalized_email TEXT DEFAULT '',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    applicant_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    job_title TEXT DEFAULT '',
    applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    source_media TEXT NOT NULL DEFAULT 'direct',
    status TEXT DEFAULT '新規',
    FOREIGN KEY (applicant_id) REFERENCES applicants(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

// Migration: add columns added after initial schema
try { db.exec('ALTER TABLE jobs ADD COLUMN catchcopy TEXT DEFAULT ""'); } catch {}

// Migration: add company column
try { db.exec(`ALTER TABLE jobs ADD COLUMN company TEXT NOT NULL DEFAULT 'sq'`); } catch {}
try { db.exec(`ALTER TABLE applicants ADD COLUMN company TEXT NOT NULL DEFAULT 'sq'`); } catch {}

function now() {
  return new Date().toISOString();
}

// --- Jobs ---
const Jobs = {
  findAll({ onlyPublished = false, company = null } = {}) {
    if (onlyPublished) {
      if (company !== null && company !== 'all') {
        return db.prepare(`SELECT * FROM jobs WHERE is_published = 1 AND company = ? ORDER BY created_at DESC`).all(company);
      }
      return db.prepare(`SELECT * FROM jobs WHERE is_published = 1 ORDER BY created_at DESC`).all();
    }
    if (company !== null && company !== 'all') {
      return db.prepare(`SELECT * FROM jobs WHERE company = ? ORDER BY created_at DESC`).all(company);
    }
    return db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`).all();
  },
  findById(id) {
    return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  },
  create(data) {
    const id = generateId();
    const ts = now();
    db.prepare(`
      INSERT INTO jobs (id, title, location, salary, job_type, employment_type, description, tags, catchcopy, image_url, faq, is_published, target_media, published_at, expires_at, company, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.title, data.location, data.salary,
      data.jobType || data.job_type || '',
      data.employmentType || data.employment_type || '',
      data.description,
      JSON.stringify(data.tags || []),
      data.catchcopy || '',
      data.imageUrl || data.image_url || '',
      JSON.stringify(data.faq || []),
      data.isPublished || data.is_published ? 1 : 0,
      JSON.stringify(data.targetMedia || data.target_media || []),
      data.publishedAt || data.published_at || null,
      data.expiresAt || data.expires_at || null,
      data.company || 'sq',
      ts, ts
    );
    return Jobs.findById(id);
  },
  update(id, data) {
    const ts = now();

    // Auto-set published_at and expires_at (30 days) on first publish
    const isPublishing = data.isPublished === true || data.is_published === 1 || data.is_published === true;
    if (isPublishing) {
      const existing = db.prepare(`SELECT published_at, expires_at FROM jobs WHERE id = ?`).get(id);
      if (existing && !existing.published_at && data.publishedAt === undefined && data.published_at === undefined) {
        data = { ...data, publishedAt: ts };
      }
      if (existing && !existing.expires_at && data.expiresAt === undefined && data.expires_at === undefined) {
        data = { ...data, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
      }
    }

    const fields = [];
    const vals = [];
    const map = {
      title: 'title', location: 'location', salary: 'salary',
      jobType: 'job_type', job_type: 'job_type',
      employmentType: 'employment_type', employment_type: 'employment_type',
      description: 'description', catchcopy: 'catchcopy',
      imageUrl: 'image_url', image_url: 'image_url',
      isPublished: 'is_published', is_published: 'is_published',
      targetMedia: 'target_media', target_media: 'target_media',
      publishedAt: 'published_at', expiresAt: 'expires_at'
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) {
        fields.push(`${col} = ?`);
        const v = data[key];
        vals.push(Array.isArray(v) ? JSON.stringify(v) : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
      }
    }
    if (data.tags !== undefined) {
      fields.push('tags = ?');
      vals.push(JSON.stringify(data.tags));
    }
    if (data.faq !== undefined) {
      fields.push('faq = ?');
      vals.push(JSON.stringify(data.faq));
    }
    if (data.company !== undefined) {
      fields.push('company = COALESCE(?, company)');
      vals.push(data.company || null);
    }
    if (fields.length === 0) return Jobs.findById(id);
    fields.push('updated_at = ?');
    vals.push(ts, id);
    db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return Jobs.findById(id);
  },
  delete(id) {
    db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
  },
  count({ company = null } = {}) {
    if (company && company !== 'all') {
      return db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE is_published = 1 AND company = ?`).get(company).c;
    }
    return db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE is_published = 1`).get().c;
  },
  expireOld() {
    const ts = now();
    const result = db.prepare(`
      UPDATE jobs SET is_published = 0, updated_at = ?
      WHERE is_published = 1 AND expires_at IS NOT NULL AND expires_at < ?
    `).run(ts, ts);
    return result.changes;
  },
  todayCountByMedia(media) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT * FROM jobs WHERE is_published = 1
      AND (published_at >= ? OR (published_at IS NULL AND updated_at >= ?))
    `).all(today + 'T00:00:00Z', today + 'T00:00:00Z');
    return rows.filter(j => JSON.parse(j.target_media || '[]').includes(media)).length;
  },
  indeedNeedsRepost(days = 3) {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(`SELECT * FROM jobs WHERE is_published = 1`).all();
    return rows.filter(j => {
      if (!JSON.parse(j.target_media || '[]').includes('Indeed')) return false;
      const postedAt = j.published_at || j.created_at;
      return !postedAt || postedAt < threshold;
    });
  },
};

// --- Applicants ---
const Applicants = {
  findAll({ status, media, search, company = null } = {}) {
    let q = `SELECT a.*, GROUP_CONCAT(ap.job_title, ', ') as job_titles FROM applicants a LEFT JOIN applications ap ON a.id = ap.applicant_id`;
    const conds = [];
    const vals = [];
    if (status && status !== 'all') { conds.push(`a.status = ?`); vals.push(status); }
    if (media) { conds.push(`a.source_media = ?`); vals.push(media); }
    if (search) { conds.push(`(a.name LIKE ? OR a.phone LIKE ? OR a.email LIKE ?)`); vals.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (company !== null && company !== 'all') { conds.push(`a.company = ?`); vals.push(company); }
    if (conds.length) q += ' WHERE ' + conds.join(' AND ');
    q += ' GROUP BY a.id ORDER BY a.created_at DESC';
    return db.prepare(q).all(...vals);
  },
  findById(id) {
    return db.prepare(`SELECT * FROM applicants WHERE id = ?`).get(id);
  },
  create(data) {
    const { normalizePhone, normalizeEmail } = require('./normalize');
    const id = generateId();
    const ts = now();
    const nPhone = normalizePhone(data.phone);
    const nEmail = normalizeEmail(data.email);
    db.prepare(`
      INSERT INTO applicants (id, name, phone, email, age, address, source_media, applied_at, status, is_duplicate, duplicate_of_id, notes, normalized_phone, normalized_email, company, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name, data.phone, data.email,
      data.age ? parseInt(data.age) : null,
      data.address || '',
      data.sourceMedia || data.source_media || 'direct',
      data.appliedAt || data.applied_at || ts,
      data.status || '新規',
      data.isDuplicate || data.is_duplicate ? 1 : 0,
      data.duplicateOfId || data.duplicate_of_id || null,
      data.notes || '',
      nPhone, nEmail,
      data.company || 'sq',
      ts, ts
    );
    return Applicants.findById(id);
  },
  update(id, data) {
    const ts = now();
    const allowed = ['status', 'notes', 'is_duplicate', 'duplicate_of_id', 'address', 'age'];
    const fields = [];
    const vals = [];
    for (const k of allowed) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const v = data[k] !== undefined ? data[k] : data[camel];
      if (v !== undefined) {
        fields.push(`${k} = ?`);
        vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
      }
    }
    if (!fields.length) return Applicants.findById(id);
    fields.push('updated_at = ?');
    vals.push(ts, id);
    db.prepare(`UPDATE applicants SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return Applicants.findById(id);
  },
  findDuplicate(nPhone, nEmail) {
    if (nPhone) {
      const r = db.prepare(`SELECT id FROM applicants WHERE normalized_phone = ? AND normalized_phone != '' LIMIT 1`).get(nPhone);
      if (r) return r.id;
    }
    if (nEmail) {
      const r = db.prepare(`SELECT id FROM applicants WHERE normalized_email = ? AND normalized_email != '' LIMIT 1`).get(nEmail);
      if (r) return r.id;
    }
    return null;
  },
  todayCount({ company = null } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    if (company && company !== 'all') {
      return db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE created_at >= ? AND company = ?`).get(today + 'T00:00:00Z', company).c;
    }
    return db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE created_at >= ?`).get(today + 'T00:00:00Z').c;
  },
  duplicateCount({ company = null } = {}) {
    if (company && company !== 'all') {
      return db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE is_duplicate = 1 AND company = ?`).get(company).c;
    }
    return db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE is_duplicate = 1`).get().c;
  }
};

// --- Applications ---
const Applications = {
  create(data) {
    const id = generateId();
    const ts = now();
    db.prepare(`
      INSERT INTO applications (id, applicant_id, job_id, job_title, applied_at, source_media, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.applicantId || data.applicant_id,
      data.jobId || data.job_id,
      data.jobTitle || data.job_title || '',
      ts, data.sourceMedia || data.source_media || 'direct',
      '新規'
    );
    return id;
  },
  findByApplicant(applicantId) {
    return db.prepare(`
      SELECT ap.*, j.title as job_title_ref FROM applications ap
      LEFT JOIN jobs j ON ap.job_id = j.id
      WHERE ap.applicant_id = ?
      ORDER BY ap.applied_at DESC
    `).all(applicantId);
  }
};

// --- Logs ---
const Logs = {
  create(action, status, message, details = '') {
    const id = generateId();
    db.prepare(`
      INSERT INTO logs (id, action, status, message, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, action, status, message, details, now());
    return id;
  },
  findAll(limit = 100) {
    return db.prepare(`SELECT * FROM logs ORDER BY created_at DESC LIMIT ?`).all(limit);
  },
  lastPostTime() {
    const r = db.prepare(`SELECT created_at FROM logs WHERE action = 'kyujinbox_post' AND status = 'success' ORDER BY created_at DESC LIMIT 1`).get();
    return r ? r.created_at : null;
  }
};

// ── Analytics ────────────────────────────────────────────────
const Analytics = {
  // Application count per day for last N days
  dailyApplications(days = 30) {
    const rows = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const r = db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE created_at >= ? AND created_at < ?`)
        .get(dateStr + 'T00:00:00Z', dateStr + 'T23:59:59Z');
      rows.push({ date: dateStr, count: r.c });
    }
    return rows;
  },

  // Applicants by media with dup count
  mediaBreakdown() {
    return db.prepare(`
      SELECT source_media as media,
             COUNT(*) as total,
             SUM(is_duplicate) as duplicates,
             COUNT(*) - SUM(is_duplicate) as unique_count
      FROM applicants
      GROUP BY source_media
      ORDER BY total DESC
    `).all();
  },

  // Status distribution
  statusDistribution() {
    return db.prepare(`
      SELECT status, COUNT(*) as count
      FROM applicants
      GROUP BY status
      ORDER BY count DESC
    `).all();
  },

  // Top jobs by application count
  topJobs(limit = 10) {
    return db.prepare(`
      SELECT j.id, j.title, j.location, j.job_type, j.is_published,
             COUNT(ap.id) as app_count
      FROM jobs j
      LEFT JOIN applications ap ON j.id = ap.job_id
      GROUP BY j.id
      ORDER BY app_count DESC
      LIMIT ?
    `).all(limit);
  },

  // Weekly summary (this week vs last week)
  weeklySummary() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    monday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(monday);
    lastMonday.setDate(lastMonday.getDate() - 7);

    const thisWeek = db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE created_at >= ?`).get(monday.toISOString()).c;
    const lastWeek = db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE created_at >= ? AND created_at < ?`).get(lastMonday.toISOString(), monday.toISOString()).c;
    const dupRate = (() => {
      const r = db.prepare(`SELECT COUNT(*) as total, SUM(is_duplicate) as dups FROM applicants`).get();
      return r.total > 0 ? Math.round((r.dups / r.total) * 100) : 0;
    })();
    return { thisWeek, lastWeek, weekOnWeek: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null, dupRate };
  }
};

module.exports = { db, Jobs, Applicants, Applications, Logs, Analytics, generateId };
