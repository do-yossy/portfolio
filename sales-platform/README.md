# sales-platform（営業バックエンド・本格システム）

案件パイプライン × 売上100万 × 学習を**サーバー＋DBで完結**させる業務アプリ。
`recruitment-platform` と同方式（raw Node / node:sqlite / Docker / Fly.io）。静的版の管制塔(`事業ダッシュボード.html`)を、永続DB・複数端末・API・LP問い合わせ受付まで備えた本格版にしたもの。

## できること（AI と 人 の線引き）
| 工程 | 担当 | 実装 |
|---|---|---|
| 案件のスコアリング | AI | `/api/ingest`（募集文を自動採点→候補化）/ Claudeが採点して `/api/deals` にPOST |
| 提案文・見積もり | AI | `/api/deals/:id/proposal`・`/api/quote` |
| パイプライン管理 | 一元 | 管制塔(`/admin`)：ステージ別カンバン＋売上100万の進捗・加重予測 |
| LP問い合わせ受付 | 自動 | `/api/contact`（CORS・認証不要）→ インバウンド案件としてDB登録＋通知 |
| 応募の送信 / 最終チェック / 納品送信 | 人 | 規約＆到達性により人が実施（不変） |

## 構成
```
server.js     ルーティング・認証(セッション)・通知・静的配信・LP受付(CORS)
db.js         SQLite(node:sqlite)。deals / logs。DATABASE_URLでPostgres拡張可
logic.js      スコアリング(01)/見積(05)/提案(02)/ステージ定義 をサーバー移植
public/       admin.html（管制塔・API連携SPA）, login.html
seed.js       サンプル投入   test.js  スモークテスト
Dockerfile / fly.toml / .env.example
```

## ローカル起動
```bash
cd sales-platform
ADMIN_PASSWORD=好きなパス npm start     # http://localhost:3100/admin
npm run seed     # サンプル投入（任意）
npm test         # ロジックのスモークテスト
```
`/admin` にアクセス→ログイン（ADMIN_PASSWORD）→ カンバンで管理。上部の取込欄に募集文を貼ると一次スコアリングして候補化。

## API
| メソッド | パス | 用途 | 認証 |
|---|---|---|---|
| GET | `/api/metrics` | KPI（目標100万・加重予測・受注率…） | 要 |
| GET/POST | `/api/deals` | 一覧 / 追加（`raw`があれば自動採点） | 要 |
| PATCH/DELETE | `/api/deals/:id` | 更新 / 削除 | 要 |
| POST | `/api/deals/:id/advance` | ステージを次へ | 要 |
| GET | `/api/deals/:id/proposal` | 提案文生成 | 要 |
| POST | `/api/ingest` | 募集文を採点して候補化（複数可） | 要 |
| POST | `/api/quote` | 見積もり計算 | 要 |
| POST | `/api/contact` | **LP問い合わせ受付（公開・CORS）** | 不要 |

## LP（自社メディア）との連携
公開後、`お問い合わせ.html` の送信先をこのバックエンドに向けると、問い合わせが直接DB＋管制塔に入ります：
```js
fetch('https://<your-fly-app>.fly.dev/api/contact', {method:'POST',
  headers:{'Content-Type':'application/json'}, body: JSON.stringify(formData)})
```

## 「案件を見つける」仕組み
- 推奨：求人アラートメール → Gmail → （Claudeが読取・採点）→ `/api/ingest` or `/api/deals` にPOST。
- 募集文の貼り付け取込（管制塔の取込欄 / `/api/ingest`）も即利用可。
- 静的コックピット向け：`node scripts/build-queue.js`（`data/inbox.json`→`data/queue.json`）。`scripts/append-log.js` で学習ログ書き戻し。フロー全体は `../営業システム/10-メールアラート運用フロー.md`。
- ※ プラットフォームの自動巡回・自動応募は規約違反のため非対応（サーバーでも行わない）。サーバー側Gmail自動取込（Gmail API/IMAP）は拡張ポイント。

## デプロイ（Fly.io）
```bash
fly launch --no-deploy           # 既存 fly.toml を利用
fly volumes create sales_data --size 1
fly secrets set ADMIN_PASSWORD=*** SLACK_WEBHOOK_URL=***
fly deploy
```
SQLiteは `/app/data`(volume)に永続化。規模拡大時は `DATABASE_URL` でPostgresへ。

## 正直な制約
- 自動応募・プラットフォーム自動巡回は不可（規約＆BANリスク）。
- 本AI実行環境は外部ネット遮断のため、案件発見は「メール→Gmail」経由が前提。
