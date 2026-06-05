# 架電リスト共有スプレッドシート（Google Sheets）連携 セットアップ

架電リストを 1 つの Google スプレッドシートで継続管理するための連携設定です。

## ワークフロー（イメージ）

```
各媒体のCSV/Excel ──[⬆ CSV/Excel取込（重複チェック付き）]──▶ DB
                                                              │
                                          [📤 スプレッドシートへ反映]
                                                              ▼
                                          Google スプレッドシート（会社ごとタブ）
                                          ・新規分だけ追記（既存行・記入済みの結果は保持）
                                          ・架電回数 / 対応状況 はプルダウン
                                                              │
                                              （ここで架電作業・記入）
                                                              │
                                          [📥 スプレッドシートから取込]
                                                              ▼
                                          DB（対応状況・架電回数・メモを更新）
```

- **反映（push）**: 重複チェック済みの応募者のうち、まだシートに無い人だけを各社タブに**追記**します。すでに記入済みの行は触りません（＝更新し続けられる）。
- **取込（pull）**: シート各タブを ID で突合し、対応状況・架電回数・メモを DB に反映します。

> 行の突合は各行の先頭にある **ID 列**で行います。ID 列は削除・編集しないでください。

---

## セットアップ手順

### 1. Google Cloud でサービスアカウントを作成

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（既存でも可）
2. 「APIとサービス」→「ライブラリ」で **Google Sheets API** を有効化
3. 「APIとサービス」→「認証情報」→「認証情報を作成」→「サービスアカウント」
4. 作成後、そのサービスアカウントの「キー」→「鍵を追加」→「新しい鍵を作成」→ **JSON** を選択してダウンロード

### 2. スプレッドシートを用意して共有

1. 新規 Google スプレッドシートを作成
2. URL の `/d/` と `/edit` の間が **スプレッドシートID** です
   `https://docs.google.com/spreadsheets/d/`**`ここがID`**`/edit`
3. スプレッドシートを開き「共有」から、**サービスアカウントのメールアドレス**
   （`xxxx@xxxx.iam.gserviceaccount.com`）を **編集者**として追加

### 3. 環境変数を設定（`.env`）

```bash
# サービスアカウント鍵(JSON)。以下のいずれかの形式で指定:
#   (a) JSON文字列をそのまま1行で  GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
#   (b) base64エンコードした文字列  GOOGLE_SERVICE_ACCOUNT_JSON=eyJ0eXBlIjoi...
#   (c) ダウンロードしたJSONファイルへのパス  GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/key.json
GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json

# スプレッドシートID
GOOGLE_SHEET_ID=1AbC...XyZ
```

base64 にする場合（改行を含む鍵を1行で安全に持たせたいとき）:

```bash
base64 -w0 service-account.json   # この出力を GOOGLE_SERVICE_ACCOUNT_JSON に貼る
```

### 4. サーバーを再起動

```bash
node --experimental-sqlite server.js
```

架電リストページのヘッダーに **「📤 スプレッドシートへ反映」「📥 スプレッドシートから取込」「🔗 シートを開く」** が機能するようになります。

---

## タブ構成と列

会社ごとに 1 タブ（**SQ / BG / PE / LT**）。各タブの列は以下:

| 列 | 内容 | 備考 |
|----|------|------|
| A | ID | 突合キー。編集・削除しない |
| B | 媒体 | |
| C–O | 名前〜応募日 | 応募者の基本情報 |
| P | 架電回数 | **プルダウン 1〜10** |
| Q | 対応状況 | **プルダウン**（新規/架電済(不通)/対応中/対応終了/断られた/辞退/重複） |
| R | 最終架電日 | |
| S | 重複 | |
| T | メモ | |

---

## トラブルシューティング

- **「アクセストークン取得に失敗」** → サービスアカウント鍵の `private_key` が正しく入っているか、`GOOGLE_SERVICE_ACCOUNT_JSON` の形式（JSON/base64/パス）を確認。
- **「Sheets API エラー (403)」** → スプレッドシートをサービスアカウントのメールに**編集者**で共有しているか確認。Sheets API が有効か確認。
- **「Sheets API エラー (404)」** → `GOOGLE_SHEET_ID` が正しいか確認。
- ボタンを押すと「未設定です」と出る → `.env` の 2 変数を設定してサーバーを再起動。
