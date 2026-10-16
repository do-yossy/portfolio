# サクモン 引き継ぎメモ(2026-10-16時点)

別のトークで続きをするときは、この全文を最初に貼ってください。詳細の正本は `products/sakumon/README.md` です。

## 何か
先生向けの文面ひな形集(学級通信・保護者向けお知らせなど)の月額サブスク。月額980円(税込)。AIは使わず、完成した文面のひな形を渡す。

## 方針(決定済み)
- AI の API(Anthropic)は使わない。さくらのVPSも使わない
- Cloudflare Workers + D1 の無料枠で動かす。固定費0円。npm依存ゼロ
- 決済は Stripe。会社が販売者になる前提で、Managed Payments は使わない
- 「リンクを共有しないで」ではなく技術で担保する: 購入ブラウザのCookie会員証 + メールの確認コード。同じ契約で使える端末は最大3台
- メール送信は Resend の無料枠(月3,000通・1日100通)の予定。送信元は既存メール/HPに影響しない専用サブドメイン

## 場所
- コード: portfolio リポジトリの `products/sakumon/`(main にマージ済み。PR #366)
- 公開URL: https://sakumon.sakumon-app.workers.dev
- LP(トップ)は**非公開**(「準備中」を表示)。`wrangler.toml` の `LP_PUBLIC` を `"true"` にして `npx wrangler deploy` で公開。公開は、オーナーの承認と監査役のレビューが済んでから
- 確認用の画面見本: `C:\Users\sqtan\portfolio\下書き\サクモン画面_確認用\`(6画面のHTML)
- 記録(メモ): `C:\Users\sqtan\.claude\projects\C--Users-sqtan\memory\`

## できていること
- Worker 稼働、D1 作成・テーブル作成済み
- Stripe(テスト環境)に商品(980円・毎月・税込)、お客様ポータル、Webhook(6イベント)を作成済み。Webhook の通知で契約状態をDBに記録
- Cloudflare に Stripe の秘密情報3つ(STRIPE_PRICE_ID / STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)を登録済み(オーナーが入力)
- 申込ボタンから Stripe の決済画面への転送を確認済み
- 申込ページ・購入後の画面・会員ページ・ひな形8点(仮の見本)・ログイン画面
- 自動テスト50件が通過(`cd products/sakumon && npm test`)
- 法務ページの下書き(`products/sakumon/legal/`):特定商取引法の表記、利用規約、プライバシーポリシー。【　】は未記入

## まだできていないこと
| 項目 | 担当 |
|---|---|
| 確認コードのメール送信(Resend のアカウント、送信用ドメイン、DNS の追加、RESEND_API_KEY の登録、MAIL_FROM の設定) | オーナー(DNS は、オーナーが許可すれば Chrome 拡張で代行可) |
| 新方式での申込→会員ページ→解約の通し確認(テスト用カード 4242 4242 4242 4242 はオーナーが入力) | オーナー + Claude |
| 法務ページの記入(会社名・住所・電話・返金方針・保管期間)と公開 | オーナーの判断 |
| Stripe 本番の審査完了後、本番の商品・ポータル・Webhook・キーを作り直す | オーナー + Claude |
| 監査役のレビュー(LP・会員ページの文面・法務)。リポジトリの CLAUDE.md の決まり | オーナー側で通す(Claude は監査役を起動できなかった) |
| 監査基準にサクモンを第2事業として追記する承認 | オーナー |
| 教材の中身(今は仮の8点)の確定 | オーナーの判断 |

## 守ること
- 秘密情報(APIキー、署名シークレット)はチャットに貼らない。オーナーが自分のPCで `npx.cmd wrangler secret put <名前>` と入力する(PowerShell では `npx` ではなく `npx.cmd`)
- カード番号の入力は Claude がしない
- 会社ドメインの DNS などの設定変更は、そのつどオーナーの許可を取る
- 確認できていない数字・実績・お客様の声を、販促文面に書かない
- main へ直接 push しない。ブランチ→PR
- 販売開始は、メール送信、法務の公開、Stripe の本番審査、監査役のレビューが済んでから

## 保留中の確認事項(オーナーへ)
1. メール送信用のサブドメインへの DNS 追加を、Claude が行ってよいか(未回答)
2. サクモンのフォルダを、GitHub Pages の配信(www.social-quality.com)から外すか(マージで、README・法務の下書き・ソースが公開アドレスから見える可能性がある。未回答)
3. 返金の方針
4. Wrangler(Claude のデプロイ用ツール)に与えた Cloudflare の権限を、作業終了後に外すか

## 主なID(秘密ではない)
- Stripe テスト環境の商品 prod_VS4I9zhTB1DkNr、価格 price_1URA9YFriZp4SUisumvXCW1E、Webhook 名 sakumon-worker
- Cloudflare: Worker 名 sakumon、D1 名 sakumon、アカウントの workers.dev サブドメイン sakumon-app
