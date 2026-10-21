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

-- メールの確認コード(ログイン用)。メールアドレスごとに1行、コードはハッシュで保存
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  sent_in_window INTEGER NOT NULL DEFAULT 0
);

-- 運営が発行する、1回限りの入り直しのリンク(メールのログインが未設定のあいだの復旧手段)。トークンはSHA-256で保存する
CREATE TABLE IF NOT EXISTS recovery_links (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 会員からのご意見・アンケート。個人を特定する情報(メールなど)は持たず、会員の識別子(customer_id)だけを持つ。連投を防ぐために使う
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  template_id TEXT,
  want TEXT,
  trouble TEXT,
  comment TEXT,
  created_at INTEGER NOT NULL
);
