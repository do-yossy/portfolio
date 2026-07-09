# 求人ボックス専用システム（kyujinbox-platform）

現行の `recruitment-platform` とは**完全に独立**した、求人ボックス専用の軽量システムです。
別ポート・別DB・別 `.env` で動作し、現システムには一切影響しません。

## できること

- **求人票の取り込み**：既存の求人票PDFを**ZIPにまとめて**アップロード → AIが読み取り、求人ボックス掲載用に自動登録
- **区分の選択**：**通常求人**／**人材紹介求人**を選んで登録・掲載
- **求人ボックスへ自動投稿**：会社（アカウント）ごとに複数同時掲載（現システムと同一エンジン）
- **AI改善ループ**：応募が来ていない求人を検知して改善（Sonnet）
- **月次レポート**：毎月（前月分）を**自動生成**。管理画面やHTML／PDFで確認・配布

## セットアップ

```
cd kyujinbox-platform
copy .env.example .env       # 認証情報・APIキーを設定（Windows。Mac/Linuxは cp）
node server.js               # または restart.bat（別ウィンドウ・別ポートで独立稼働）
```

ブラウザで **http://localhost:3200**（既定ポート。`.env` の `PORT` で変更可）を開きます。

## 使い方

### 1. 求人票を取り込む（ZIP／PDF）
管理画面の「求人票を取り込む」で、
1. 求人票PDFをまとめた**ZIP**を選択
2. **アカウント**と**区分（通常求人／人材紹介求人）**を選ぶ
3. 「取り込む」→ AIがPDFを読み取り、求人ボックス用に登録（公開状態）

> 取り込みには `.env` の `ANTHROPIC_API_KEY`（本物のキー）が必要です。

### 2. 求人ボックスへ投稿
「求人ボックスへ自動投稿」でアカウント・件数を選び「投稿する」。
認証済みの複数アカウントへ順に自動掲載します（`scripts/kyujinbox_poster.py`）。

### 3. 月次レポート（自動）
- サーバー起動時に**前月分が無ければ自動生成**します。
- 確実に毎月生成するには `install-monthly-report.ps1` でタスク登録（毎日9時に前月分を対象に生成）。
- 手動生成：`node scripts/monthly_report.js`（前月分）／管理画面「今すぐ生成」。
- 閲覧・応募の数値は成績取得（`scripts/kyujinbox_metrics.py`）を実行すると反映されます。

### 4. seed（求人データの投入）
`seeds/` に求人ボックス用のseedがあります（空DBスタート）。
```
node seeds/seed-route-haisou-kyujinbox17.js
node seeds/seed-keisagyo-kyujinbox7.js
```

### 5. AI改善ループ
```
node scripts/kyujinbox_autoloop.js --company all --apply
```

## 構成

| パス | 役割 |
|---|---|
| `server.js` | HTTPサーバー（一覧・統計・投稿・取り込み・レポート） |
| `db.js` | SQLite（jobs / job_metrics / logs / reports） |
| `lib/report.js` | 月次レポート生成 |
| `lib/optimizer.js` | AI改善（成績→検知→Sonnet改善→DB反映） |
| `scripts/import_jobs.py` | ZIP内PDFをClaudeで構造化し取り込み |
| `scripts/kyujinbox_poster.py` | 求人ボックスへの自動投稿 |
| `scripts/kyujinbox_metrics.py` | 成績（閲覧・応募）取得 |
| `scripts/kyujinbox_reflect.py` | 改善内容を掲載へ反映 |
| `scripts/monthly_report.js` | 月次レポート自動生成CLI |
| `public/` | 管理画面 |

## 注意（人材紹介求人）
「人材紹介求人」区分は、有料職業紹介事業の許可・法令（職業安定法）に沿ってご利用ください。
本システムは区分の保持と掲載補助のみを行います。
