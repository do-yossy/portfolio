-- PostgreSQL schema for recruitment-platform
-- Run: psql $DATABASE_URL -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(10), 'hex'),
  title           TEXT        NOT NULL,
  location        TEXT        NOT NULL,
  salary          TEXT        NOT NULL,
  job_type        TEXT        NOT NULL,
  employment_type TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  tags            JSONB       NOT NULL DEFAULT '[]',
  image_url       TEXT        NOT NULL DEFAULT '',
  faq             JSONB       NOT NULL DEFAULT '[]',
  is_published    BOOLEAN     NOT NULL DEFAULT FALSE,
  target_media    JSONB       NOT NULL DEFAULT '[]',
  published_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applicants (
  id               TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(10), 'hex'),
  name             TEXT        NOT NULL,
  phone            TEXT        NOT NULL,
  email            TEXT        NOT NULL,
  age              INTEGER,
  address          TEXT        NOT NULL DEFAULT '',
  source_media     TEXT        NOT NULL DEFAULT 'direct',
  applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT        NOT NULL DEFAULT '新規',
  is_duplicate     BOOLEAN     NOT NULL DEFAULT FALSE,
  duplicate_of_id  TEXT,
  notes            TEXT        NOT NULL DEFAULT '',
  normalized_phone TEXT        NOT NULL DEFAULT '',
  normalized_email TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id           TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(10), 'hex'),
  applicant_id TEXT        NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  job_id       TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_title    TEXT        NOT NULL DEFAULT '',
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_media TEXT        NOT NULL DEFAULT 'direct',
  status       TEXT        NOT NULL DEFAULT '新規'
);

CREATE TABLE IF NOT EXISTS logs (
  id         TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(10), 'hex'),
  action     TEXT        NOT NULL,
  status     TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  details    TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_published    ON jobs(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
CREATE INDEX IF NOT EXISTS idx_applicants_phone  ON applicants(normalized_phone) WHERE normalized_phone <> '';
CREATE INDEX IF NOT EXISTS idx_applicants_email  ON applicants(normalized_email) WHERE normalized_email <> '';
CREATE INDEX IF NOT EXISTS idx_applicants_media  ON applicants(source_media);
CREATE INDEX IF NOT EXISTS idx_applicants_date   ON applicants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_app  ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_job  ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_logs_action       ON logs(action, created_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_updated_at       ON jobs;
DROP TRIGGER IF EXISTS trg_applicants_updated_at ON applicants;
CREATE TRIGGER trg_jobs_updated_at       BEFORE UPDATE ON jobs       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_applicants_updated_at BEFORE UPDATE ON applicants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
