-- 契約状態。Stripe の Webhook が書き込む。
CREATE TABLE IF NOT EXISTS subscriptions (
  customer_id TEXT PRIMARY KEY,
  email       TEXT,
  status      TEXT NOT NULL,          -- active / trialing / past_due / canceled など
  updated_at  INTEGER NOT NULL        -- 最後に反映した Stripe イベントの created(秒)
);
