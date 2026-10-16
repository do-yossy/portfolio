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

-- ブラウザごとの会員証(Cookie)。DBには値そのものではなくSHA-256を保存する
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_customer ON sessions (customer_id, created_at);

-- 申込完了画面から会員証を受け取れるのは、1回の申込につき最初の1回だけ
CREATE TABLE IF NOT EXISTS claimed_checkouts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
