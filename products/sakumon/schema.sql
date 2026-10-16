CREATE TABLE IF NOT EXISTS members (
  customer_id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  email TEXT,
  subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'incomplete',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
