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
  school_level TEXT,
  roles TEXT,
  created_at INTEGER NOT NULL
);
-- 既存のDBには、次の2行を1回だけ実行する(school_level: 校種、roles: 担当。どちらも選択式で任意)
-- ALTER TABLE feedback ADD COLUMN school_level TEXT;
-- ALTER TABLE feedback ADD COLUMN roles TEXT;

-- テストのたたき台づくりの、先生の評価(使えそうか・直す時間)。選択式の2項目と種類だけ。作った内容や条件は持たない。10件たまるまで、集計の数字は外に出さない
CREATE TABLE IF NOT EXISTS test_rating (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  usable TEXT NOT NULL,
  fix_minutes TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- テストのたたき台づくり(AI版)の月ごとの回数。作った内容は保存しない。回数とトークン数だけを、会員ごと・暦月(日本時間)ごとに持つ
-- 本番に適用するとき: npx.cmd wrangler d1 execute sakumon --remote --file=schema.sql(冪等)。機能は TESTMAKER_ENABLED="true" になるまでオフ
CREATE TABLE IF NOT EXISTS test_usage (
  customer_id TEXT NOT NULL,
  ym TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  in_tokens INTEGER NOT NULL DEFAULT 0,
  out_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (customer_id, ym)
);
