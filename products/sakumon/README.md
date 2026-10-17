# サクモン(Cloudflare Workers 版)

先生向け文面ひな形集の月額サブスク(980円・税込)。AI API は使わない。サーバーは借りず、Cloudflare Workers + D1 の無料枠で動かす。

- 決済: Stripe Checkout(月額プラン)
- 契約状態: Stripe Webhook → D1(`members` テーブル)
- 会員ページ: `/m`。購入したブラウザに渡す会員証(HttpOnly Cookie)で本人確認する。URLに秘密は含まない。契約が `active` / `trialing` の間だけ教材が見える
- 会員証は1回の申込につき最初の1回だけ受け取れる。同じ契約で使える端末は最大3台(古いものから失効)
- 別の端末・Cookie消去後は、`/login` からメールの確認コード(6桁・10分有効・5回まで・60秒に1通・1時間5通まで)でログイン。コードはハッシュで保存
- 解約・支払方法変更: Stripe お客様ポータル(会員ページのリンクから)
- 依存ゼロ(npm パッケージなし)。署名検証は Web Crypto で自前実装

## 現在の状態

- 公開 URL: https://sakumon.sakumon-app.workers.dev (Cloudflare Workers 無料枠。アカウントの workers.dev サブドメインを `sakumon-app` に変更済み)
- **LP(トップページ)は非公開。** `wrangler.toml` の `LP_PUBLIC = "false"` の間、トップは「準備中」を表示する。オーナーの承認と監査役のレビューが済んだら `"true"` にして `npx wrangler deploy`(`/subscribe` `/login` `/m` は直接URLで動く)
- D1 データベース `sakumon` 作成済み・`schema.sql` 適用済み(`wrangler.toml` に database_id 記載)
- **確認コードのメールは、まだ送れない。** `RESEND_API_KEY`(秘密)と `MAIL_FROM`(変数)が未設定。下の「メール送信の設定」を参照
- **Stripe は未接続。** `/subscribe`(申込)は、Secrets が未登録の間は失敗する
- 確認済み: `npm test`(署名検証、契約→支払失敗→回復→解約、イベント再送、到着順の前後、アクセス制御。D1 は node:sqlite で代用)、デプロイ後のトップ 200 / 署名なし Webhook 400
- **未確認**: 本物の Stripe との通し(テストモード)、お客様ポータルへの遷移

## 残りの手順

代表がやること(キー類はチャットに貼らず、自分の PC で入力する):
1. Stripe(テストモード)で商品「サクモン 月額プラン」(980円・月次・税込)を作成し、お客様ポータルを有効化
2. 次のコマンドで登録(値は入力時に表示されない)
```bash
cd products/sakumon
npx wrangler secret put STRIPE_SECRET_KEY   # まず sk_test_...
npx wrangler secret put STRIPE_PRICE_ID     # price_...
```

私がやること:
3. `https://sakumon.sakumon-app.workers.dev/stripe/webhook` を Stripe に登録(イベント6種: checkout.session.completed / customer.subscription.created・updated・deleted / invoice.paid / invoice.payment_failed)
4. 表示された署名シークレットを `npx wrangler secret put STRIPE_WEBHOOK_SECRET`
5. テストモードで 申込 → 会員ページ → 解約 → 閲覧不可 まで通す → 本番キーに切替(Stripe の審査完了後)

コードを変えたら `npx wrangler deploy` で反映する(`npm test` を先に通す)。

## メール送信の設定(確認コード用・無料枠)

Resend の無料プラン(月3,000通・1日100通)を使う。送信元は、既存のメール・HPに影響しないよう、専用のサブドメインにする。
1. Resend のアカウントを作り、ドメイン(例: `mail.social-quality.com`)を追加する。表示されるDNSレコードを、Cloudflare の DNS に追加する
2. Resend で API キー(送信権限)を作り、`npx.cmd wrangler secret put RESEND_API_KEY` で登録する
3. `wrangler.toml` の `[vars]` に `MAIL_FROM = "サクモン <login@mail.social-quality.com>"` を追加して `npx wrangler deploy`
4. `/login` から、契約中のアドレスで確認コードが届くか試す

## 販売前に必要なもの

- 法務ページ3点(特定商取引法の表記・利用規約・プライバシーポリシー)は、`src/legal.js` に実装済みで、**非公開**。会社名・代表者・所在地は会社公式サイト(`index.html`)から転記済み。`src/company.js` の空欄(電話番号の表示、返金の方針、保管期間、制定日、管轄裁判所)をオーナーが決めて埋めるまで、`wrangler.toml` の `LEGAL_PUBLIC = "true"` にしても404のまま(公開されない仕組み)。公開前に専門家の確認を推奨。下書きの元文は [`legal/`](legal/)
- 教材の中身(`src/content.js` は仮の見本8点。代表の承認後に差し替える)
- 販促文面の監査(監査基準へのサクモン追記の承認後)
- Stripe の審査完了(本番の決済に必要)

## 既知の制約

- ログインはメールではなく「専用URL」方式。URLを失くした人の再発行手段が無い(Stripe の領収書メールからは辿れない)。必要なら Stripe のメール連携か、メール送信を足す
- 無料枠(1日10万リクエスト)を超えるとその日は止まる
