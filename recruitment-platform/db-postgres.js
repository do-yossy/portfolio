'use strict';

/**
 * PostgreSQL database layer — drop-in async replacement for db.js (SQLite).
 * Requires: npm install pg
 * Set DATABASE_URL env var to activate: postgresql://user:pass@host:5432/dbname
 *
 * All methods return Promises. server.js uses await on all calls
 * when DATABASE_URL is set (see db-factory.js).
 */

const crypto = require('crypto');

let pool;

function getPool() {
  if (!pool) {
    // pg is loaded lazily so the file can be require()'d safely even before install
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000
    });
    pool.on('error', err => console.error('[pg] pool error:', err.message));
  }
  return pool;
}

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// Normalize a row from PostgreSQL to match SQLite output shape expected by server.js
function normalizeJob(row) {
  if (!row) return null;
  return {
    ...row,
    tags:         Array.isArray(row.tags)         ? row.tags         : JSON.parse(row.tags || '[]'),
    faq:          Array.isArray(row.faq)           ? row.faq          : JSON.parse(row.faq  || '[]'),
    target_media: Array.isArray(row.target_media)  ? row.target_media : JSON.parse(row.target_media || '[]'),
    is_published: row.is_published ? 1 : 0,
    created_at:   row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at:   row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    published_at: row.published_at instanceof Date ? row.published_at.toISOString() : (row.published_at || null),
    expires_at:   row.expires_at  instanceof Date ? row.expires_at.toISOString()  : (row.expires_at  || null),
  };
}

function normalizeApplicant(row) {
  if (!row) return null;
  return {
    ...row,
    is_duplicate: row.is_duplicate ? 1 : 0,
    created_at:   row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at:   row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    applied_at:   row.applied_at  instanceof Date ? row.applied_at.toISOString() : row.applied_at,
  };
}

// ── Jobs ──────────────────────────────────────────────────────
const Jobs = {
  async findAll(onlyPublished = false) {
    const sql = onlyPublished
      ? `SELECT * FROM jobs WHERE is_published = TRUE ORDER BY created_at DESC`
      : `SELECT * FROM jobs ORDER BY created_at DESC`;
    const { rows } = await query(sql);
    return rows.map(normalizeJob);
  },

  async findById(id) {
    const { rows } = await query(`SELECT * FROM jobs WHERE id = $1`, [id]);
    return normalizeJob(rows[0] || null);
  },

  async create(data) {
    const id = generateId();
    const { rows } = await query(`
      INSERT INTO jobs
        (id, title, location, salary, job_type, employment_type, description,
         tags, image_url, faq, is_published, target_media, published_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      id,
      data.title, data.location, data.salary,
      data.jobType || data.job_type || '',
      data.employmentType || data.employment_type || '',
      data.description,
      JSON.stringify(data.tags || []),
      data.imageUrl || data.image_url || '',
      JSON.stringify(data.faq || []),
      !!(data.isPublished || data.is_published),
      JSON.stringify(data.targetMedia || data.target_media || []),
      data.publishedAt || data.published_at || null,
      data.expiresAt   || data.expires_at   || null,
    ]);
    return normalizeJob(rows[0]);
  },

  async update(id, data) {
    const fields = [];
    const vals   = [];
    let i = 1;

    const map = {
      title: 'title', location: 'location', salary: 'salary',
      jobType: 'job_type', job_type: 'job_type',
      employmentType: 'employment_type', employment_type: 'employment_type',
      description: 'description', imageUrl: 'image_url', image_url: 'image_url',
      isPublished: 'is_published', is_published: 'is_published',
      targetMedia: 'target_media', target_media: 'target_media',
      publishedAt: 'published_at', expiresAt: 'expires_at',
    };

    for (const [key, col] of Object.entries(map)) {
      if (data[key] === undefined) continue;
      fields.push(`${col} = $${i++}`);
      const v = data[key];
      vals.push(Array.isArray(v)     ? JSON.stringify(v)
              : col === 'is_published' ? !!v
              : v);
    }
    if (data.tags !== undefined) { fields.push(`tags = $${i++}`); vals.push(JSON.stringify(data.tags)); }
    if (data.faq  !== undefined) { fields.push(`faq  = $${i++}`); vals.push(JSON.stringify(data.faq));  }
    if (!fields.length) return Jobs.findById(id);

    vals.push(id);
    const { rows } = await query(
      `UPDATE jobs SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    return normalizeJob(rows[0]);
  },

  async delete(id) {
    await query(`DELETE FROM jobs WHERE id = $1`, [id]);
  },

  async count() {
    const { rows } = await query(`SELECT COUNT(*) AS c FROM jobs WHERE is_published = TRUE`);
    return parseInt(rows[0].c, 10);
  },
};

// ── Applicants ────────────────────────────────────────────────
const Applicants = {
  async findAll({ status, media, search } = {}) {
    const conds = [];
    const vals  = [];
    let i = 1;
    if (status && status !== 'all') { conds.push(`a.status = $${i++}`);          vals.push(status); }
    if (media)                       { conds.push(`a.source_media = $${i++}`);    vals.push(media);  }
    if (search) {
      conds.push(`(a.name ILIKE $${i} OR a.phone ILIKE $${i} OR a.email ILIKE $${i})`);
      vals.push(`%${search}%`); i++;
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await query(`
      SELECT a.*, STRING_AGG(ap.job_title, ', ') AS job_titles
      FROM applicants a
      LEFT JOIN applications ap ON a.id = ap.applicant_id
      ${where}
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `, vals);
    return rows.map(normalizeApplicant);
  },

  async findById(id) {
    const { rows } = await query(`SELECT * FROM applicants WHERE id = $1`, [id]);
    return normalizeApplicant(rows[0] || null);
  },

  async create(data) {
    const { normalizePhone, normalizeEmail } = require('./normalize');
    const id     = generateId();
    const nPhone = normalizePhone(data.phone);
    const nEmail = normalizeEmail(data.email);
    const { rows } = await query(`
      INSERT INTO applicants
        (id, name, phone, email, age, address, source_media, applied_at, status,
         is_duplicate, duplicate_of_id, notes, normalized_phone, normalized_email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      id, data.name, data.phone, data.email,
      data.age ? parseInt(data.age) : null,
      data.address || '',
      data.sourceMedia || data.source_media || 'direct',
      data.appliedAt || data.applied_at || new Date().toISOString(),
      data.status || '新規',
      !!(data.isDuplicate || data.is_duplicate),
      data.duplicateOfId || data.duplicate_of_id || null,
      data.notes || '',
      nPhone, nEmail,
    ]);
    return normalizeApplicant(rows[0]);
  },

  async update(id, data) {
    const allowed = ['status', 'notes', 'is_duplicate', 'duplicate_of_id', 'address', 'age'];
    const fields  = [];
    const vals    = [];
    let i = 1;
    for (const k of allowed) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const v = data[k] !== undefined ? data[k] : data[camel];
      if (v === undefined) continue;
      fields.push(`${k} = $${i++}`);
      vals.push(k === 'is_duplicate' ? !!v : v);
    }
    if (!fields.length) return Applicants.findById(id);
    vals.push(id);
    const { rows } = await query(
      `UPDATE applicants SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    return normalizeApplicant(rows[0]);
  },

  async findDuplicate(nPhone, nEmail) {
    if (nPhone) {
      const { rows } = await query(
        `SELECT id FROM applicants WHERE normalized_phone = $1 AND normalized_phone <> '' LIMIT 1`,
        [nPhone]
      );
      if (rows[0]) return rows[0].id;
    }
    if (nEmail) {
      const { rows } = await query(
        `SELECT id FROM applicants WHERE normalized_email = $1 AND normalized_email <> '' LIMIT 1`,
        [nEmail]
      );
      if (rows[0]) return rows[0].id;
    }
    return null;
  },

  async todayCount() {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await query(
      `SELECT COUNT(*) AS c FROM applicants WHERE created_at >= $1`,
      [today + 'T00:00:00Z']
    );
    return parseInt(rows[0].c, 10);
  },

  async duplicateCount() {
    const { rows } = await query(`SELECT COUNT(*) AS c FROM applicants WHERE is_duplicate = TRUE`);
    return parseInt(rows[0].c, 10);
  },
};

// ── Applications ──────────────────────────────────────────────
const Applications = {
  async create(data) {
    const id = generateId();
    await query(`
      INSERT INTO applications (id, applicant_id, job_id, job_title, source_media, status)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [
      id,
      data.applicantId || data.applicant_id,
      data.jobId       || data.job_id,
      data.jobTitle    || data.job_title || '',
      data.sourceMedia || data.source_media || 'direct',
      '新規',
    ]);
    return id;
  },

  async findByApplicant(applicantId) {
    const { rows } = await query(`
      SELECT ap.*, j.title AS job_title_ref
      FROM applications ap
      LEFT JOIN jobs j ON ap.job_id = j.id
      WHERE ap.applicant_id = $1
      ORDER BY ap.applied_at DESC
    `, [applicantId]);
    return rows;
  },
};

// ── Logs ──────────────────────────────────────────────────────
const Logs = {
  async create(action, status, message, details = '') {
    const id = generateId();
    await query(
      `INSERT INTO logs (id, action, status, message, details) VALUES ($1,$2,$3,$4,$5)`,
      [id, action, status, message, details]
    );
    return id;
  },

  async findAll(limit = 100) {
    const { rows } = await query(
      `SELECT * FROM logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map(r => ({
      ...r,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
  },

  async lastPostTime() {
    const { rows } = await query(
      `SELECT created_at FROM logs WHERE action IN ('kyujinbox_post','stanby_post') AND status = 'success' ORDER BY created_at DESC LIMIT 1`
    );
    if (!rows[0]) return null;
    const v = rows[0].created_at;
    return v instanceof Date ? v.toISOString() : v;
  },
};

// ── Analytics ─────────────────────────────────────────────────
const Analytics = {
  async dailyApplications(days = 30) {
    const rows = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const { rows: r } = await query(
        `SELECT COUNT(*) AS c FROM applicants WHERE created_at >= $1 AND created_at < $2`,
        [dateStr + 'T00:00:00Z', dateStr + 'T23:59:59Z']
      );
      rows.push({ date: dateStr, count: parseInt(r[0].c, 10) });
    }
    return rows;
  },

  async mediaBreakdown() {
    const { rows } = await query(`
      SELECT source_media AS media,
             COUNT(*) AS total,
             SUM(CASE WHEN is_duplicate THEN 1 ELSE 0 END) AS duplicates,
             COUNT(*) - SUM(CASE WHEN is_duplicate THEN 1 ELSE 0 END) AS unique_count
      FROM applicants
      GROUP BY source_media
      ORDER BY total DESC
    `);
    return rows.map(r => ({
      ...r,
      total:       parseInt(r.total, 10),
      duplicates:  parseInt(r.duplicates, 10),
      unique_count: parseInt(r.unique_count, 10),
    }));
  },

  async statusDistribution() {
    const { rows } = await query(`
      SELECT status, COUNT(*) AS count
      FROM applicants
      GROUP BY status
      ORDER BY count DESC
    `);
    return rows.map(r => ({ ...r, count: parseInt(r.count, 10) }));
  },

  async topJobs(limit = 10) {
    const { rows } = await query(`
      SELECT j.id, j.title, j.location, j.job_type,
             j.is_published, COUNT(ap.id) AS app_count
      FROM jobs j
      LEFT JOIN applications ap ON j.id = ap.job_id
      GROUP BY j.id
      ORDER BY app_count DESC
      LIMIT $1
    `, [limit]);
    return rows.map(r => ({
      ...r,
      is_published: r.is_published ? 1 : 0,
      app_count:    parseInt(r.app_count, 10),
    }));
  },

  async weeklySummary() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    monday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(monday);
    lastMonday.setDate(lastMonday.getDate() - 7);

    const { rows: tw } = await query(
      `SELECT COUNT(*) AS c FROM applicants WHERE created_at >= $1`, [monday.toISOString()]
    );
    const { rows: lw } = await query(
      `SELECT COUNT(*) AS c FROM applicants WHERE created_at >= $1 AND created_at < $2`,
      [lastMonday.toISOString(), monday.toISOString()]
    );
    const { rows: dup } = await query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN is_duplicate THEN 1 ELSE 0 END) AS dups FROM applicants`
    );
    const thisWeek = parseInt(tw[0].c, 10);
    const lastWeek = parseInt(lw[0].c, 10);
    const total    = parseInt(dup[0].total, 10);
    const dups     = parseInt(dup[0].dups,  10);
    return {
      thisWeek,
      lastWeek,
      weekOnWeek: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
      dupRate:    total > 0 ? Math.round((dups / total) * 100) : 0,
    };
  },
};

module.exports = { Jobs, Applicants, Applications, Logs, Analytics, generateId };
