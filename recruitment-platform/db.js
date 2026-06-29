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

// Migration: add kyujinbox required fields
try { db.exec('ALTER TABLE jobs ADD COLUMN rewarding TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE jobs ADD COLUMN worktime_holiday TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE jobs ADD COLUMN transportation TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE jobs ADD COLUMN how_to_apply TEXT DEFAULT ""'); } catch {}

// Migration: is_archived フラグ（重複チェック用に保持するが出力対象外）
try { db.exec('ALTER TABLE applicants ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0'); } catch {}

// Migration: is_imported フラグ（CSV/Excel等で取り込んだ過去データ。本日の新規応募に含めない）
try { db.exec('ALTER TABLE applicants ADD COLUMN is_imported INTEGER NOT NULL DEFAULT 0'); } catch {}

// Migration v2: 架電運用管理カラム
try { db.exec(`ALTER TABLE applicants ADD COLUMN media TEXT DEFAULT ''`); } catch {}            // 'indeed'/'kyujinbox'/'stanby'/'google'
try { db.exec('ALTER TABLE applicants ADD COLUMN call_count INTEGER DEFAULT 0'); } catch {}     // 架電回数 0〜10
try { db.exec(`ALTER TABLE applicants ADD COLUMN applied_month TEXT DEFAULT ''`); } catch {}    // 'YYYY-MM'
try { db.exec(`ALTER TABLE applicants ADD COLUMN last_called_at TEXT DEFAULT ''`); } catch {}   // 最終架電日

// Migration v3: CSV詳細カラム（求人ボックス・Indeed 両フォーマット対応）
try { db.exec(`ALTER TABLE applicants ADD COLUMN gender TEXT DEFAULT ''`); } catch {}           // 性別
try { db.exec(`ALTER TABLE applicants ADD COLUMN birth_date TEXT DEFAULT ''`); } catch {}       // 生年月日
try { db.exec(`ALTER TABLE applicants ADD COLUMN current_job TEXT DEFAULT ''`); } catch {}      // 現在の職業
try { db.exec(`ALTER TABLE applicants ADD COLUMN job_title TEXT DEFAULT ''`); } catch {}        // 求人タイトル
try { db.exec(`ALTER TABLE applicants ADD COLUMN experience TEXT DEFAULT ''`); } catch {}       // 関連のある経験
try { db.exec(`ALTER TABLE applicants ADD COLUMN education TEXT DEFAULT ''`); } catch {}        // 学歴
try { db.exec(`ALTER TABLE applicants ADD COLUMN work_location TEXT DEFAULT ''`); } catch {}    // 勤務地

// Migration v2: 既存応募者の applied_month / media をバックフィル
try {
  db.exec(`UPDATE applicants SET applied_month = substr(applied_at, 1, 7) WHERE (applied_month IS NULL OR applied_month = '') AND applied_at IS NOT NULL AND applied_at != ''`);
  // source_media から media 推定（Indeed/求人ボックス/スタンバイ/Google/direct→google）
  db.exec(`UPDATE applicants SET media = 'indeed'    WHERE (media IS NULL OR media = '') AND (source_media LIKE '%ndeed%')`);
  db.exec(`UPDATE applicants SET media = 'kyujinbox' WHERE (media IS NULL OR media = '') AND (source_media LIKE '%求人ボックス%' OR source_media LIKE '%kyujinbox%')`);
  db.exec(`UPDATE applicants SET media = 'stanby'    WHERE (media IS NULL OR media = '') AND (source_media LIKE '%スタンバイ%' OR source_media LIKE '%stanby%' OR source_media LIKE '%engage%')`);
  db.exec(`UPDATE applicants SET media = 'google'    WHERE (media IS NULL OR media = '') AND (source_media = 'direct' OR source_media LIKE '%oogle%' OR source_media LIKE '%しごと%')`);
} catch {}

// Migration v4: returning_from_id column for re-applicants (previously archived as 不通)
try { db.exec("ALTER TABLE applicants ADD COLUMN returning_from_id TEXT DEFAULT NULL"); } catch {}
// Migration v5: furigana column (読み仮名) for call list / spreadsheet sync
try { db.exec("ALTER TABLE applicants ADD COLUMN furigana TEXT DEFAULT ''"); } catch {}
// Migrate old status values to simplified statuses
db.exec("UPDATE applicants SET status='不通' WHERE status='架電済(不通)'");
db.exec("UPDATE applicants SET status='終了' WHERE status IN ('対応終了','断られた','辞退')");
// Remove '重複' status (it was redundant with is_duplicate=1)
db.exec("UPDATE applicants SET status='新規' WHERE status='重複'");

// Migration v6: 架電リストには「新規」のみ残す。
// 既存の新規以外（不通・対応中・終了 等）は過去応募（is_archived=1）へ移動。
// 以後は Ops.updateCall が 新規以外を自動アーカイブするため冪等。
try {
  db.exec("UPDATE applicants SET is_archived=1 WHERE is_archived=0 AND status IS NOT NULL AND status != '' AND status != '新規'");
} catch {}

// Migration v7: kyujinbox posted tracking
try { db.exec("ALTER TABLE jobs ADD COLUMN kyujinbox_posted_at TEXT DEFAULT NULL"); } catch {}

// Migration v8: multiple locations per job (JSON array)
try { db.exec("ALTER TABLE jobs ADD COLUMN locations TEXT DEFAULT '[]'"); } catch {}

// Migration v2: 媒体掲載日報テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS media_posts (
    id           TEXT PRIMARY KEY,
    company_id   TEXT NOT NULL,
    media        TEXT NOT NULL,
    job_title    TEXT NOT NULL,
    post_date    TEXT DEFAULT '',
    expire_date  TEXT DEFAULT '',
    status       TEXT DEFAULT '掲載中',
    applicant_count INTEGER DEFAULT 0,
    notes        TEXT DEFAULT '',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
`);

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
      INSERT INTO jobs (id, title, location, salary, job_type, employment_type, description, tags, catchcopy, image_url, faq, is_published, target_media, published_at, expires_at, company, rewarding, worktime_holiday, transportation, how_to_apply, locations, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.rewarding || '',
      data.worktimeHoliday || data.worktime_holiday || '',
      data.transportation || '',
      data.howToApply || data.how_to_apply || '',
      JSON.stringify(data.locations || []),
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
      publishedAt: 'published_at', expiresAt: 'expires_at',
      rewarding: 'rewarding',
      worktimeHoliday: 'worktime_holiday', worktime_holiday: 'worktime_holiday',
      transportation: 'transportation',
      howToApply: 'how_to_apply', how_to_apply: 'how_to_apply',
      kyujinbox_posted_at: 'kyujinbox_posted_at',
      locations: 'locations',
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
  // Googleしごと検索掲載から7日経過した求人の target_media から 'google' を除外
  expireGoogleJobs(days = 7) {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const ts = now();
    const rows = db.prepare(`SELECT id, target_media FROM jobs WHERE is_published = 1`).all();
    let count = 0;
    for (const row of rows) {
      const media = JSON.parse(row.target_media || '[]');
      if (!media.includes('google')) continue;
      // published_at が threshold より古い行を取得
      const job = db.prepare(`SELECT published_at FROM jobs WHERE id = ?`).get(row.id);
      if (!job || !job.published_at || job.published_at > threshold) continue;
      const newMedia = JSON.stringify(media.filter(m => m !== 'google'));
      db.prepare(`UPDATE jobs SET target_media = ?, updated_at = ? WHERE id = ?`).run(newMedia, ts, row.id);
      count++;
    }
    return count;
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
    // 通常は応募日未指定なら現在時刻。ただし取込(allowEmptyDate)では空のまま保持し、
    // 「本日の新規応募」に誤カウントされないようにする。
    const appliedAt = data.appliedAt || data.applied_at || (data.allowEmptyDate ? '' : ts);
    const appliedMonth = (appliedAt || '').slice(0, 7); // 'YYYY-MM'
    // media が未指定の場合は sourceMedia から自動判定（マイグレーションと同じロジック）
    let media = data.media || '';
    if (!media) {
      const sm = (data.sourceMedia || data.source_media || '').toLowerCase();
      if      (sm.includes('indeed'))                                   media = 'indeed';
      else if (sm.includes('求人ボックス') || sm.includes('kyujinbox')) media = 'kyujinbox';
      else if (sm.includes('スタンバイ')  || sm.includes('stanby'))    media = 'stanby';
      else if (sm.includes('engage'))                                   media = 'engage';
      else /* direct / google / しごと / 未設定 → Googleしごと検索経由 */ media = 'google';
    }
    db.prepare(`
      INSERT INTO applicants (id, name, furigana, phone, email, age, address, source_media, applied_at, status, is_duplicate, duplicate_of_id, returning_from_id, notes, normalized_phone, normalized_email, company, media, call_count, applied_month, last_called_at, gender, birth_date, current_job, job_title, experience, education, work_location, is_archived, is_imported, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name, data.furigana || '',  data.phone, data.email,
      data.age ? parseInt(data.age) : null,
      data.address || '',
      data.sourceMedia || data.source_media || 'direct',
      appliedAt,
      data.status || '新規',
      data.isDuplicate || data.is_duplicate ? 1 : 0,
      data.duplicateOfId || data.duplicate_of_id || null,
      data.returningFromId || data.returning_from_id || null,
      data.notes || '',
      nPhone, nEmail,
      data.company || 'sq',
      media,
      parseInt(data.callCount || data.call_count || 0),
      appliedMonth,
      data.lastCalledAt || data.last_called_at || '',
      data.gender || '',
      data.birthDate || data.birth_date || '',
      data.currentJob || data.current_job || '',
      data.jobTitle || data.job_title || '',
      data.experience || '',
      data.education || '',
      data.workLocation || data.work_location || '',
      data.isArchived || data.is_archived ? 1 : 0,
      data.isImported || data.is_imported ? 1 : 0,
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
  // Returns {id, isReturning} or null.
  // 過去応募（is_archived=1）の中で、
  //   - 不通       → isReturning=true（再応募扱い／前回応募情報を表示）
  //   - 対応中・終了 → isReturning=false（重複判定）
  // を返す。電話番号・メールのいずれかが一致するレコードを全件集めて判定する。
  findDuplicateInfo(nPhone, nEmail) {
    const rows = [];
    const seen = new Set();
    const collect = (list) => {
      for (const r of list) { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } }
    };
    if (nPhone) {
      collect(db.prepare(`SELECT id, is_archived, status, created_at FROM applicants WHERE normalized_phone = ? AND normalized_phone != ''`).all(nPhone));
    }
    if (nEmail) {
      collect(db.prepare(`SELECT id, is_archived, status, created_at FROM applicants WHERE normalized_email = ? AND normalized_email != ''`).all(nEmail));
    }
    if (!rows.length) return null;
    // ① アーカイブ済みの「不通」を最優先 → 再応募（前回応募情報を表示）
    const returning = rows
      .filter(r => r.is_archived === 1 && r.status === '不通')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
    if (returning) return { id: returning.id, isReturning: true };
    // ② それ以外（対応中・終了・通常応募）は重複判定。最新レコードを参照元にする。
    rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { id: rows[0].id, isReturning: false };
  },
  // 架電結果の反映用: 電話番号 or メールで既存応募者を検索（会社を優先一致）。
  // 重複レコードより「元データ（is_duplicate=0）」を優先して返す。
  findByContact(nPhone, nEmail, company = null) {
    const pick = (rows) => {
      if (!rows.length) return null;
      if (company) {
        const sameCo = rows.find(r => r.company === company && !r.is_duplicate)
                    || rows.find(r => r.company === company);
        if (sameCo) return sameCo;
      }
      return rows.find(r => !r.is_duplicate) || rows[0];
    };
    if (nPhone) {
      const rows = db.prepare(`SELECT * FROM applicants WHERE normalized_phone = ? AND normalized_phone != ''`).all(nPhone);
      const hit = pick(rows);
      if (hit) return hit;
    }
    if (nEmail) {
      const rows = db.prepare(`SELECT * FROM applicants WHERE normalized_email = ? AND normalized_email != ''`).all(nEmail);
      const hit = pick(rows);
      if (hit) return hit;
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

// ── 運用管理マスタ定数 ────────────────────────────────────────
const COMPANIES = [
  { id: 'sq', name: '株式会社SocialQuality', short: 'SQ', label: 'Social Quality' },
  { id: 'bg', name: '株式会社Bigeyes',       short: 'BG', label: 'Bigeyes' },
  { id: 'pe', name: '合同会社ピープル',        short: 'PE', label: 'ピープル' },
  { id: 'lt', name: '株式会社lifeTaylor',     short: 'LT', label: 'Life Tailor' },
  { id: 'nc', name: '合同会社ニクール',        short: 'NC', label: 'ニクール' },
  { id: 'nx', name: 'ネクサス株式会社',        short: 'NX', label: 'ネクサス' },
];
const MEDIA = [
  { id: 'indeed',   name: 'Indeed' },
  { id: 'kyujinbox', name: '求人ボックス' },
  { id: 'stanby',   name: 'スタンバイ' },
  { id: 'google',   name: 'Googleしごと検索' },
  { id: 'engage',   name: 'engage' },
  { id: 'seniorjob', name: 'シニアジョブ' },
];
// 架電対応状況
const CALL_STATUSES = ['新規', '不通', '対応中', '終了'];
// 「今日架電を行う」対象ステータス（終了系を除く）
const ACTIVE_CALL_STATUSES = ['新規', '不通', '対応中'];

// ── 架電運用：Applicants 拡張メソッド ──────────────────────────
const Ops = {
  // 架電状況の更新（架電回数・ステータス・メモ）
  // skipAutoArchive=true の場合、ステータスに応じた is_archived 自動切替を行わない
  // （スプレッドシート取込時に応募者を架電リストに残したい場合に使用）
  updateCall(id, { callCount, status, notes, skipAutoArchive = false } = {}) {
    const ts = now();
    const fields = [];
    const vals = [];
    if (callCount !== undefined) { fields.push('call_count = ?'); vals.push(parseInt(callCount) || 0); }
    if (status !== undefined)    { fields.push('status = ?');     vals.push(status); }
    if (notes !== undefined)     { fields.push('notes = ?');      vals.push(notes); }
    if (callCount !== undefined && (parseInt(callCount) || 0) > 0) {
      fields.push('last_called_at = ?'); vals.push(ts);
    }
    // 新規以外（不通・対応中・終了）は過去応募へ自動アーカイブ。
    // 新規に戻した場合は架電リストへ復帰（skipAutoArchive時は変更しない）。
    // → 架電リストには「新規」のみが残り、それ以外は過去応募タブで対応状況別に表示される。
    if (status !== undefined && !skipAutoArchive) {
      fields.push('is_archived = ?');
      vals.push(status === '新規' ? 0 : 1);
    }
    if (!fields.length) return Applicants.findById(id);
    fields.push('updated_at = ?');
    vals.push(ts, id);
    db.prepare(`UPDATE applicants SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return Applicants.findById(id);
  },

  // 重複としてマーク（is_duplicate・duplicate_of_id・status を一括設定）
  markDuplicate(id, originalId = null) {
    db.prepare(`UPDATE applicants SET is_duplicate = 1, duplicate_of_id = ?, status = '重複', updated_at = ? WHERE id = ?`)
      .run(originalId, now(), id);
    return Applicants.findById(id);
  },

  // 既存レコードを「本日の新着（新規応募に計上）」へ昇格。
  //   取込済み(is_imported=1)やアーカイブを解除し、応募日を本日に設定する。
  promoteToNew(id, appliedAt) {
    db.prepare(`UPDATE applicants SET is_imported = 0, is_archived = 0, is_duplicate = 0, duplicate_of_id = NULL, applied_at = ?, applied_month = ?, updated_at = ? WHERE id = ?`)
      .run(appliedAt, (appliedAt || '').slice(0, 7), now(), id);
    return Applicants.findById(id);
  },

  // 既存レコードの空フィールドのみを補完（生年月日・フリガナ等）
  fillMissingFields(id, fields) {
    const FILLABLE = ['furigana', 'birth_date', 'age', 'address', 'gender', 'education', 'experience', 'current_job', 'job_title'];
    const parts = [];
    const vals = [];
    for (const col of FILLABLE) {
      const jsKey = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const val = fields[jsKey] ?? fields[col];
      if (val == null || val === '') continue;
      parts.push(`${col} = CASE WHEN (${col} IS NULL OR ${col} = '') THEN ? ELSE ${col} END`);
      vals.push(String(val));
    }
    if (!parts.length) return 0;
    vals.push(now(), id);
    return db.prepare(`UPDATE applicants SET ${parts.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals).changes;
  },

  // 会社×媒体でフィルタした応募者一覧
  listCalls({ company, media, status, month, archived, search, excludeDuplicate } = {}) {
    const conds = [];
    const vals = [];
    if (company && company !== 'all') { conds.push('company = ?'); vals.push(company); }
    if (media && media !== 'all')     { conds.push('media = ?');   vals.push(media); }
    if (status && status !== 'all')   { conds.push('status = ?');  vals.push(status); }
    if (month && month !== 'all')     { conds.push('applied_month = ?'); vals.push(month); }
    if (archived === true)  conds.push('is_archived = 1');
    if (archived === false) conds.push('is_archived = 0');
    if (excludeDuplicate)   conds.push('is_duplicate = 0');
    if (search) {
      conds.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR address LIKE ? OR job_title LIKE ?)');
      vals.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    let q = 'SELECT * FROM applicants';
    if (conds.length) q += ' WHERE ' + conds.join(' AND ');
    q += ' ORDER BY applied_at DESC, created_at DESC';
    return db.prepare(q).all(...vals);
  },

  // 会社×媒体クロス集計（新規応募者タブ・掲載管理タブ用）
  crossTab({ activeOnly = false, todayOnly = false } = {}) {
    // 過去応募者（is_archived=1）のみ除外。CSV取込データも含めて集計する。
    const conds = ['is_archived = 0'];
    const vals = [];
    if (activeOnly) conds.push(`status IN (${ACTIVE_CALL_STATUSES.map(() => '?').join(',')})`), vals.push(...ACTIVE_CALL_STATUSES);
    if (todayOnly) { conds.push('applied_at >= ?'); vals.push(new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)); } // JST基準
    let q = 'SELECT company, media, COUNT(*) as c FROM applicants';
    if (conds.length) q += ' WHERE ' + conds.join(' AND ');
    q += ' GROUP BY company, media';
    const rows = db.prepare(q).all(...vals);
    // {company: {media: count}}
    const table = {};
    for (const c of COMPANIES) { table[c.id] = {}; for (const m of MEDIA) table[c.id][m.id] = 0; }
    for (const r of rows) {
      if (table[r.company] && r.media) table[r.company][r.media] = r.c;
    }
    return table;
  },

  // 「今日架電を行う」対象件数（会社別）
  todayCallTargets() {
    const rows = db.prepare(`
      SELECT company, COUNT(*) as c FROM applicants
      WHERE is_archived = 0 AND status IN (${ACTIVE_CALL_STATUSES.map(() => '?').join(',')})
      GROUP BY company
    `).all(...ACTIVE_CALL_STATUSES);
    const out = {};
    for (const c of COMPANIES) out[c.id] = 0;
    let total = 0;
    for (const r of rows) { if (out[r.company] !== undefined) out[r.company] = r.c; total += r.c; }
    return { byCompany: out, total };
  },

  // 応募月の一覧（過去応募者タブのフィルター用）
  appliedMonths() {
    return db.prepare(`SELECT DISTINCT applied_month FROM applicants WHERE applied_month != '' ORDER BY applied_month DESC`)
      .all().map(r => r.applied_month);
  },
};

// ── 媒体掲載日報 ────────────────────────────────────────────
const MediaPosts = {
  findAll({ company, media, status } = {}) {
    const conds = [];
    const vals = [];
    if (company && company !== 'all') { conds.push('company_id = ?'); vals.push(company); }
    if (media && media !== 'all')     { conds.push('media = ?');      vals.push(media); }
    if (status && status !== 'all')   { conds.push('status = ?');     vals.push(status); }
    let q = 'SELECT * FROM media_posts';
    if (conds.length) q += ' WHERE ' + conds.join(' AND ');
    q += ' ORDER BY post_date DESC, created_at DESC';
    return db.prepare(q).all(...vals);
  },
  findById(id) {
    return db.prepare('SELECT * FROM media_posts WHERE id = ?').get(id);
  },
  create(data) {
    const id = generateId();
    const ts = now();
    db.prepare(`
      INSERT INTO media_posts (id, company_id, media, job_title, post_date, expire_date, status, applicant_count, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.company_id || data.company || 'sq', data.media || 'indeed',
      data.job_title || data.jobTitle || '',
      data.post_date || data.postDate || '',
      data.expire_date || data.expireDate || '',
      data.status || '掲載中',
      parseInt(data.applicant_count || data.applicantCount || 0),
      data.notes || '', ts, ts
    );
    return MediaPosts.findById(id);
  },
  update(id, data) {
    const ts = now();
    const allowed = ['company_id', 'media', 'job_title', 'post_date', 'expire_date', 'status', 'applicant_count', 'notes'];
    const fields = [];
    const vals = [];
    for (const k of allowed) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const v = data[k] !== undefined ? data[k] : data[camel];
      if (v !== undefined) { fields.push(`${k} = ?`); vals.push(v); }
    }
    if (!fields.length) return MediaPosts.findById(id);
    fields.push('updated_at = ?');
    vals.push(ts, id);
    db.prepare(`UPDATE media_posts SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return MediaPosts.findById(id);
  },
  remove(id) {
    db.prepare('DELETE FROM media_posts WHERE id = ?').run(id);
  },
  // 会社×媒体の掲載中件数クロス集計
  // jobs テーブルの is_published=1 かつ target_media に含まれる媒体を集計する
  crossTab() {
    const table = {};
    for (const c of COMPANIES) { table[c.id] = {}; for (const m of MEDIA) table[c.id][m.id] = 0; }
    // target_media には名前（"求人ボックス"）またはID（"kyujinbox"）が入る場合があるため両方対応
    const nameToId = {};
    for (const m of MEDIA) { nameToId[m.name] = m.id; nameToId[m.id] = m.id; }
    const jobs = db.prepare(`SELECT company, target_media FROM jobs WHERE is_published = 1`).all();
    for (const job of jobs) {
      let mediaList = [];
      try { mediaList = JSON.parse(job.target_media || '[]'); } catch {}
      for (const mediaVal of mediaList) {
        const mediaId = nameToId[mediaVal] || mediaVal;
        if (table[job.company] && table[job.company][mediaId] !== undefined) {
          table[job.company][mediaId]++;
        }
      }
    }
    return table;
  },
};

module.exports = {
  db, Jobs, Applicants, Applications, Logs, Analytics, generateId,
  Ops, MediaPosts, COMPANIES, MEDIA, CALL_STATUSES, ACTIVE_CALL_STATUSES,
  findDuplicateInfo: (nPhone, nEmail) => Applicants.findDuplicateInfo(nPhone, nEmail),
};
