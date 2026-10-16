# サクモン(Cloudflare Workers 版)

先生向け教材テンプレート集の月額サブスク(980円・税込)。AI API は使わない。
**このリポジトリで唯一 Cloudflare Workers 専用**(他サービスは `node:http` + `node:sqlite`)。依存ゼロ・ビルドなしは同じ。

## 状態
- 実装とローカルテストまで。**デプロイ・Stripe 接続は未実施**。
- 教材(`src/content.js`)は**仮のサンプル**。中身が決まったら差し替える。
- 対外公開前に監査役の審査が必要。

## 仕組み
1. 先生が Stripe の Payment Link で申し込む(成功後の移動先: `https://<Workers URL>/welcome?session_id={CHECKOUT_SESSION_ID}`)
2. Stripe が `/stripe/webhook` に通知 → 署名検証 → D1 に契約状態を記録
3. `/welcome` が Stripe API で決済完了を確認し、署名付きCookie(30日)を発行
4. `/materials` は「Cookieが有効 かつ D1上で active/trialing」のときだけ教材を表示
5. `/portal` は Stripe のお客様ポータル(解約・支払方法変更)へ

## 既知の制限
- 別端末・Cookie消失後の再ログインは未実装(メール確認の仕組みが必要)。当面は Stripe のポータル経由か問い合わせ対応。
- Webhook の反映が遅れると、決済直後は「確認中」表示になる(再読み込みで解消)。

## テスト
```
node --experimental-sqlite test.js   # Node 22。依存なし
```

## デプロイ手順(未実施・要承認)
1. `wrangler d1 create sakumon` → `wrangler.toml` の `database_id` を設定
2. `wrangler d1 execute sakumon --remote --file=schema.sql`
3. `wrangler secret put` で `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` / `SESSION_SECRET`
4. `PAYMENT_LINK_URL`(Payment Link のURL、秘密ではない)を `wrangler.toml` の `[vars]` に設定
5. `wrangler deploy` → 出た URL を Stripe の Webhook と Payment Link の成功後URLに登録
