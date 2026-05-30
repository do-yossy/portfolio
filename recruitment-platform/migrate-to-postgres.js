#!/usr/bin/env node
'use strict';
/**
 * One-time migration: SQLite → PostgreSQL
 *
 * Prerequisites:
 *   1. npm install pg
 *   2. Set DATABASE_URL=postgresql://user:pass@host:5432/dbname
 *   3. Run schema.sql first: psql $DATABASE_URL -f schema.sql
 *
 * Usage:
 *   node migrate-to-postgres.js
 */

const { DatabaseSync } = require('node:sqlite');
const { Pool }         = require('pg');
const path             = require('path');

const DB_PATH = path.join(__dirname, 'data', 'recruitment.db');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL is not set');
  process.exit(1);
}

const sqlite = new DatabaseSync(DB_PATH);
const pool   = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Starting migration...\n');

    // ── Jobs ──
    const jobs = sqlite.prepare('SELECT * FROM jobs').all();
    console.log(`Migrating ${jobs.length} jobs...`);
    for (const j of jobs) {
      await client.query(`
        INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,
          tags,image_url,faq,is_published,target_media,published_at,expires_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO NOTHING
      `, [
        j.id, j.title, j.location, j.salary, j.job_type, j.employment_type, j.description,
        j.tags || '[]', j.image_url || '', j.faq || '[]',
        j.is_published === 1,
        j.target_media || '[]',
        j.published_at || null, j.expires_at || null,
        j.created_at, j.updated_at,
      ]);
    }
    console.log(`  ✅ ${jobs.length} jobs migrated`);

    // ── Applicants ──
    const applicants = sqlite.prepare('SELECT * FROM applicants').all();
    console.log(`Migrating ${applicants.length} applicants...`);
    for (const a of applicants) {
      await client.query(`
        INSERT INTO applicants (id,name,phone,email,age,address,source_media,applied_at,status,
          is_duplicate,duplicate_of_id,notes,normalized_phone,normalized_email,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO NOTHING
      `, [
        a.id, a.name, a.phone, a.email,
        a.age || null, a.address || '', a.source_media,
        a.applied_at, a.status,
        a.is_duplicate === 1,
        a.duplicate_of_id || null, a.notes || '',
        a.normalized_phone || '', a.normalized_email || '',
        a.created_at, a.updated_at,
      ]);
    }
    console.log(`  ✅ ${applicants.length} applicants migrated`);

    // ── Applications ──
    const apps = sqlite.prepare('SELECT * FROM applications').all();
    console.log(`Migrating ${apps.length} applications...`);
    for (const ap of apps) {
      await client.query(`
        INSERT INTO applications (id,applicant_id,job_id,job_title,applied_at,source_media,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [ap.id, ap.applicant_id, ap.job_id, ap.job_title || '', ap.applied_at, ap.source_media, ap.status]);
    }
    console.log(`  ✅ ${apps.length} applications migrated`);

    // ── Logs ──
    const logs = sqlite.prepare('SELECT * FROM logs').all();
    console.log(`Migrating ${logs.length} logs...`);
    for (const l of logs) {
      await client.query(`
        INSERT INTO logs (id,action,status,message,details,created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO NOTHING
      `, [l.id, l.action, l.status, l.message, l.details || '', l.created_at]);
    }
    console.log(`  ✅ ${logs.length} logs migrated`);

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

migrate().catch(() => process.exit(1));
