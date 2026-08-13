# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

株式会社ソーシャルクオリティの事業リポジトリ。**1つのリポジトリに4種類の異なるもの**が同居している：

1. **静的サイト**（ルートの `*.html`）— GitHub Pages → `www.social-quality.com`
2. **Node製の業務システム**（`sales-platform/` `recruitment-platform/` `kyujinbox-platform/`）— Fly.io またはローカル常駐
3. **Markdownの業務OS**（`営業システム/`）— Claude自身が従う営業オペレーションの手順書＋長期記憶
4. **企画・教材のソース**（`app-requirements/` `career-reset-side-business/` `apps-script/`）

`SETUP.md` が新規PC向けの正式セットアップ手順。ルートの `README.md` は**中身がポートフォリオのHTML**でドキュメントではない（読んでも無意味）。

## 開発コマンド

ルートの `package.json` は空（`{"dependencies": {}}`）。**すべてサブディレクトリで実行する**。

```bash
# 管制塔（営業バックエンド）
cd sales-platform
npm install
cp .env.example .env      # ADMIN_PASSWORD は必須
npm run dev:local         # --watch + --experimental-sqlite + --env-file  → http://localhost:3100/admin
npm test                  # node test.js（依存ゼロのスモークテスト。logic.js のみ検証）
npm run seed              # サンプル案件投入

# 採用システム
cd recruitment-platform
npm install
node --experimental-sqlite server.js    # http://localhost:3000

# 求人ボックス専用（recruitment-platform とは完全独立・別DB別ポート）
cd kyujinbox-platform
node server.js            # http://localhost:3200
node scripts/monthly_report.js   # 前月分の月次レポート

# 静的サイト
npx serve                 # または VS Code の Live Server で index.html を開く
```

単体テストの仕組みは `sales-platform/test.js` にしか無い。`ok(cond, name)` を並べるだけの手書きハーネスなので、テストを足す場合も同じ形式に従う（テストフレームワークは入れない方針）。

## アーキテクチャ上の重要な決まりごと

### 依存ゼロ主義
全サービスが **raw `node:http`**（Express等のフレームワークなし）で書かれ、`server.js` 内で `pathname === '...' && method === '...'` を上から順に判定するルーティング。`dotenv` も使わず `server.js` 冒頭の自作 `loadEnv()` が `.env` を読む（`process.cwd()/.env` を優先、無ければ `__dirname/.env`）。npm依存は `sales-platform` の `googleapis` のみ。**新しいライブラリを足す前に、この方針を崩す価値があるか確認すること。**

### Node 22必須 / `node:sqlite`
DBは標準の `node:sqlite`（`DatabaseSync`）。起動時に `--experimental-sqlite` フラグが要る（package.json のスクリプトに埋まっている）。Node 20以下では起動しない。

### マイグレーションは冪等ALTER
スキーマ変更は `CREATE TABLE IF NOT EXISTS` ＋ `try { db.exec("ALTER TABLE ... ADD COLUMN ...") } catch {}` で行う（例: `sales-platform/db.js:59-62`）。マイグレーションツールは無い。**列を足すときはこのパターンに合わせる**。

### DB差し替え（recruitment-platform のみ）
`db-factory.js` が `DATABASE_URL` の有無で `db-postgres.js` / `db.js`(SQLite) を切り替える。SQLite側の同期メソッドは `Promise.resolve()` でラップされるので、**呼び出し側は常に `await` を付ける**。`sales-platform` は同方式への拡張を想定しているが現状SQLite直結。

### `logic.js` と `営業システム/*.md` の二重管理
`sales-platform/logic.js`（スコアリング・見積・提案文・ステージ定義）は `営業システム/01-案件スコアリング基準.md`・`05-見積もりロジック.md` などの**Markdownルールをコードに移植したもの**。片方だけ直すと乖離する。ロジックを変えるときは両方を更新すること。手数料率などの恒久パラメータは `営業システム/設定.md` が原典。

### `営業システム/学習/` はAIの長期記憶
セッションを跨いで記憶が残らない前提で、応募結果を `応募ログ.jsonl` に蓄積し `集計.js` で分析、`インサイト.md` に蒸留する設計。営業関連の作業をしたら、この学習ループに結果を書き戻すか確認する。運用ルールは `学習/学習プロトコル.md`。

### life-tailor-platform は別テナント
独自のサーバーを持たず、`start.bat` が `DATA_DIR` を切り替えて `../recruitment-platform/server.js` を起動する。**recruitment-platform を変更すると Life Tailor 側にも影響する。**

### 静的HTMLは1ファイル完結
ルートの `*.html`（日本語ファイル名）はCSS/JSをすべてインライン化した単体成果物で、共有アセットもビルドも無い。デモ用ポートフォリオ作品なので、**横断的な共通化はしない**。新規ページを追加したら `sitemap.xml` にも追記する。

### Python連携
求人媒体への投稿・成績取得は Playwright ベースのPythonスクリプト（`*/scripts/*_poster.py` `*_metrics.py`）を Node から `spawn` して呼ぶ。Node側だけ見ても処理が追えない箇所がある。

## デプロイ

**`main` への push が即デプロイ**。GitHub Actions がパスフィルタで振り分ける：

| 変更対象 | ワークフロー | 反映先 |
|---|---|---|
| `sales-platform/**` | `deploy-sales.yml` | Fly.io `sq-sales-tanto20` |
| `recruitment-platform/**` | `deploy.yml` | Fly.io `sq-saiyou`（デプロイ後に自社サイト求人の公開化スクリプトを実行） |
| ルートの `*.html` 等 | GitHub Pages | `www.social-quality.com` |

`kyujinbox-platform` と `life-tailor-platform` は**自動デプロイ対象外**（ローカル常駐。`install-autostart.ps1` でタスク登録）。

`main` を直接壊さないため、大きめの変更はブランチを切ってPRにする。本番DBへの操作は `flyctl ssh console -a <app> -C "node /app/scripts/..."` の形で、冪等なスクリプトとして書く（`seed-jobs.yml` `publish-jobs.yml` が手動実行の例）。

## 制約

- プラットフォームの**自動巡回・自動応募は規約違反のため実装しない**。案件発見はメールアラート → Gmail 経由が前提で、応募の最終送信は人が行う。
- `.claude/` は `.gitignore` 済み。
- ドキュメント・UI・コミットメッセージはすべて日本語。
