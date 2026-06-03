# 採用運用管理システム v2 — 実装指示書

作成日: 2026-06-03  
対象ブランチ: `claude/auth-mail-indeed-api`

---

## 0. 前提確認（現状 Excel の読み取り結果）

現在の Excel（SV1）は以下4シートで構成：

| シート | 媒体フォーマット | 主要列 |
|--------|----------------|--------|
| Sheet1 | engage / スタンバイ 形式 | 架電回数・氏名・電話番号・応募日・求人名 |
| engage | Indeed(engage経由) 形式 | 名前・電話番号・ステータス・架電回数・応募日 |
| indeed | Indeed ダウンロードCSV | 氏名・電話番号・選考ステータス・選考コメント |
| 求人ボックス | 空（参考用） | ― |

架電状態は「架電回数（数字 or ー）」＋「コメント列（→辞退 / →再TEL / 人柄× 等）」で管理。

---

## 1. システム全体設計

### 1-1. 運用主体（4社）

| 社名 | 短縮ID |
|------|--------|
| SocialQuality | SQ |
| Bigeyes | BG |
| ピープル | PE |
| lifeTaylor | LT |

### 1-2. 求人媒体（4媒体）

| 媒体名 | ID | CSVフォーマット |
|--------|----|----------------|
| Indeed | indeed | 氏名（姓/名）・電話番号・選考ステータス・選考コメント |
| 求人ボックス | kyujinbox | 名前・電話番号・メール・ステータス・応募日 |
| スタンバイ | stanby | engage/スタンバイ CSV（架電回数・姓・名・電話番号・応募日） |
| Googleしごと検索 | google | 自サイト応募フォーム経由（DB直接） |

### 1-3. アーキテクチャ方針

- **既存の `recruitment-platform/server.js` に統合**（新規ルートを追加）
- SQLite DBに4テーブル追加
- 管理画面に「運用ダッシュボード」セクションを新設
- 公開求人サイト（/jobs）は変更なし

---

## 2. DBスキーマ追加（4テーブル）

### 2-1. `companies`（会社マスタ）

```sql
CREATE TABLE companies (
  id        TEXT PRIMARY KEY,   -- 'SQ' / 'BG' / 'PE' / 'LT'
  name      TEXT NOT NULL,      -- '株式会社SocialQuality' 等
  short_name TEXT NOT NULL,     -- 'SQ' 等
  created_at TEXT NOT NULL
);
```

初期データ: SQ / BG / PE / LT の4件を自動挿入。

### 2-2. `media_posts`（媒体掲載日報）

```sql
CREATE TABLE media_posts (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL,        -- FK: companies.id
  media        TEXT NOT NULL,        -- 'indeed'/'kyujinbox'/'stanby'/'google'
  job_title    TEXT NOT NULL,
  post_date    TEXT,                 -- 掲載開始日
  expire_date  TEXT,                 -- 掲載終了日
  status       TEXT DEFAULT '掲載中', -- '掲載中'/'停止'/'審査中'
  applicant_count INTEGER DEFAULT 0,
  cost         INTEGER DEFAULT 0,   -- 掲載費（円）
  notes        TEXT DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

### 2-3. `call_applicants`（架電管理応募者）

```sql
CREATE TABLE call_applicants (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL,     -- FK: companies.id
  media           TEXT NOT NULL,     -- 'indeed'/'kyujinbox'/'stanby'/'google'
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,    -- 重複チェック用
  email           TEXT DEFAULT '',
  normalized_email TEXT DEFAULT '',
  age             INTEGER,
  address         TEXT DEFAULT '',
  job_title       TEXT DEFAULT '',   -- 応募求人名
  applied_at      TEXT,              -- 応募日
  applied_month   TEXT,              -- 'YYYY-MM'（月別フィルター用）
  call_status     TEXT DEFAULT '新規', 
    -- '新規' / '架電済(不通)' / '対応中' / '対応終了' / '辞退' / '断られた' / '重複'
  call_count      INTEGER DEFAULT 0, -- 0〜10
  call_memo       TEXT DEFAULT '',   -- 架電メモ（自由記述）
  is_duplicate    INTEGER DEFAULT 0, -- 重複フラグ
  duplicate_of_id TEXT DEFAULT '',   -- 重複元ID
  is_archived     INTEGER DEFAULT 0, -- アーカイブ（過去応募者）
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

### 2-4. `call_logs`（架電履歴）

```sql
CREATE TABLE call_logs (
  id              TEXT PRIMARY KEY,
  applicant_id    TEXT NOT NULL,  -- FK: call_applicants.id
  called_at       TEXT NOT NULL,  -- 架電日時
  call_count      INTEGER,        -- 何回目か
  status_before   TEXT,           -- 変更前ステータス
  status_after    TEXT,           -- 変更後ステータス
  memo            TEXT DEFAULT '',
  operator        TEXT DEFAULT '' -- 架電者（オプション）
);
```

---

## 3. 画面設計（3タブ＋架電スプレッドシート）

### 3-1. トップページ `/admin/ops`

ヘッダーに **3つのタブ** を配置:

```
[ 掲載管理 ] [ 新規応募者 ] [ 過去応募者 ]
```

---

### Tab A: 掲載管理 `/admin/ops?tab=posts`

#### 表示内容

**① 本日の掲載サマリー（上部）**
```
媒体別 × 会社別 の掲載中件数マトリックス
        SQ   BG   PE   LT   合計
Indeed   3    2    1    0     6
求人ボックス 2    1    2    1     6
スタンバイ  1    0    1    0     2
Google   5    5    5    5    20
合計     11    8    9    6    34
```

**② 掲載一覧テーブル**
- 会社・媒体・求人タイトル・掲載開始日・期限・ステータス・応募数・費用・メモ
- フィルター: 会社 / 媒体 / ステータス
- 「＋追加」ボタン：新規掲載登録フォーム（モーダル）

**③ 掲載操作**
- 既存求人ボックス25件・Googleしごと検索25件の掲載情報を自動連携
- 媒体ごとの「公開数 / 審査待ち / 停止中」カード表示

---

### Tab B: 新規応募者 `/admin/ops?tab=new`

#### 表示内容

**① 全体サマリーカード（上部4枚）**
```
[本日の新規応募] [今週の新規応募] [今日の架電予定] [架電完了数]
     12件              47件            23件         18件
```

**② 会社別 × 媒体別 新規応募表**
```
        Indeed  求人ボックス  スタンバイ  Google  合計（新規）
SQ         3        2          1        5      11
BG         2        1          0        3       6
PE         4        2          2        4      12
LT         1        0          1        2       4
合計       10        5          4       14      33
```

**③ 今日架電を行う一覧**
- call_status = '新規' の応募者リスト（会社・媒体・名前・電話番号・応募日）
- 「架電開始」ボタン → 架電スプレッドシートへ遷移

**④ CSVインポートボタン（媒体別）**
- `[Indeed CSV取込]` `[求人ボックスCSV取込]` `[スタンバイCSV取込]`
- 会社選択 → ファイル選択 → 重複チェック結果表示 → 取込確定

---

### Tab C: 過去応募者 `/admin/ops?tab=past`

#### フィルターバー
```
会社: [全て▼]  媒体: [全て▼]  対応状況: [全て▼]  応募月: [全て▼]  [検索]
```

#### 対応状況別リスト（アコーディオン or タブで切り替え）

| セクション | call_status 値 | 色 |
|-----------|---------------|----|
| 再架電リスト | '架電済(不通)' | 黄 |
| 架電中・対応中 | '対応中' | 青 |
| 対応終了 | '対応終了' | 緑 |
| 断られた | '断られた' | 灰 |
| 辞退 | '辞退' | 灰 |
| 重複 | '重複' | 薄灰 |

#### 各リストの列

名前 / 電話番号 / 会社 / 媒体 / 応募日 / 架電回数 / 最終架電日 / メモ / [操作]

#### 操作ボタン
- `[架電ステータス変更]` → ドロップダウン
- `[メモ編集]`
- `[詳細]`

---

### 3-2. 架電スプレッドシート `/admin/calls`

現行 Excel の代替となる Webベースの架電管理画面。

#### 構成

**上部タブ（会社別）**
```
[ SQ ] [ BG ] [ PE ] [ LT ]
```

**各会社タブ内のサブタブ（媒体別）**
```
[ Indeed ] [ 求人ボックス ] [ スタンバイ ] [ Google ]
```

#### 応募者テーブル（各媒体タブ内）

| # | 名前 | 電話番号 | 年齢 | 応募日 | 求人名 | 架電回数 | 対応状況 | メモ | 更新日 |
|---|------|----------|------|--------|--------|----------|----------|------|--------|

**架電回数セレクター**: ドロップダウン `[0▼]` → 0〜10回から選択

**対応状況セレクター**: ドロップダウン
```
新規
架電済(不通)
対応中
対応終了（採用確定・採用見送り）
断られた（辞退・不採用）
辞退（求職者側からキャンセル）
重複
```

**メモ欄**: インライン編集（クリックで編集モード）

**行のカラー**:
- 新規: 白
- 架電済(不通): 薄黄
- 対応中: 薄青
- 対応終了: 薄緑
- 断られた/辞退: 薄灰

#### 上部アクション

```
[CSVインポート]  [CSV出力]  [重複チェック実行]
```

**重複チェック**: 電話番号（正規化後）またはメールで既存応募者と照合。  
重複時: `is_duplicate=1` にして対応状況を「重複」にする。既存応募者の情報欄にリンクを表示。

---

## 4. CSV インポート仕様

### 4-1. 共通フロー

```
1. 会社選択（SQ/BG/PE/LT）
2. 媒体選択（Indeed/求人ボックス/スタンバイ）
3. ファイル選択（.csv）
4. エンコーディング自動判定（UTF-8 BOM → UTF-8 → Shift-JIS）
5. カラムマッピング（媒体別）
6. 重複チェック（normalized_phone OR normalized_email）
7. プレビュー表示（新規N件 / 重複M件 / スキップK件）
8. 取込確定ボタン
9. 結果トースト表示
```

### 4-2. 媒体別カラムマッピング

**Indeed CSV** (ダウンロード形式)
```
氏名（姓） + 氏名（名） → name
電話番号 → phone
メールアドレス → email
応募日 → applied_at
応募求人-職種名 → job_title
選考ステータス → (参考)
選考コメント → call_memo
```

**Indeed (engage経由) CSV**
```
名前 → name
電話番号（+81形式対応） → phone
メールアドレス → email
日付 → applied_at
職種名 → job_title
```

**求人ボックス CSV**
```
名前 → name
電話番号 → phone
メールアドレス → email
ステータス → (参考)
日付 → applied_at
```

**スタンバイ CSV** (engage形式と同一)
```
架電回数 → call_count（既存データがある場合）
氏名（姓）+ 氏名（名） → name
電話番号 → phone
応募日 → applied_at
```

---

## 5. API エンドポイント一覧

### 掲載管理
- `GET  /api/ops/posts` — 掲載一覧（クエリ: company, media, status）
- `POST /api/ops/posts` — 掲載追加
- `PUT  /api/ops/posts/:id` — 掲載更新
- `DELETE /api/ops/posts/:id` — 掲載削除

### 応募者（架電管理）
- `GET  /api/ops/calls` — 応募者一覧（クエリ: company, media, status, month, page）
- `PUT  /api/ops/calls/:id` — ステータス・架電回数・メモ更新
- `POST /api/ops/calls/import` — CSVインポート（multipart）
- `GET  /api/ops/calls/export` — CSV出力（クエリ: company, media, status）
- `GET  /api/ops/stats` — サマリー統計（タブB用）

### 重複チェック
- `POST /api/ops/check-dup` — 電話/メールで重複確認

---

## 6. 実装順序

### Phase 1（DB＋骨格）
1. DB マイグレーション（4テーブル追加 + 初期データ）
2. `/admin/ops` ルーティングと3タブ骨格HTML
3. `/admin/calls` ルーティングと会社タブ骨格HTML

### Phase 2（掲載管理タブ）
4. `media_posts` CRUD API
5. 掲載一覧・追加・編集UI
6. 既存求人ボックス/Google求人との連携表示

### Phase 3（CSV インポート）
7. Indeed / 求人ボックス / スタンバイ 各CSVマッピング
8. 重複チェックロジック（call_applicants テーブル用）
9. インポートUI（プレビュー → 確定）

### Phase 4（架電スプレッドシート）
10. 架電一覧テーブル（会社タブ × 媒体サブタブ）
11. 架電回数セレクター・対応状況セレクター（インライン更新）
12. メモインライン編集
13. 架電ログ記録（call_logs）

### Phase 5（新規応募者タブ・過去応募者タブ）
14. サマリー統計API
15. 新規応募者ダッシュボードUI
16. 過去応募者フィルター付きリストUI

### Phase 6（CSV出力）
17. 会社別・媒体別・ステータス別 CSV エクスポート
18. 既存 `/api/export/csv` との統合

---

## 7. 確認事項（実装前に教えてください）

1. **ログイン**: 現状と同じ1つのパスワードで全社共通でよいか？  
   　→ 社ごとにアカウントを分けるか？

2. **掲載費**: `media_posts.cost` は入力するか、不要か？

3. **架電者識別**: 誰が架電したかを記録する必要があるか？

4. **スタンバイCSV**: engage形式と同一フォーマットでよいか？  
   　（添付の Sheet1 がスタンバイ/engage形式と判断）

5. **「今日架電を行う数」の定義**: call_status = '新規' の全件か、  
   　それとも応募日から何日以内など条件があるか？

6. **既存 `applicants` テーブルとの統合**: 現在の `/admin/applicants` と  
   　新しい `call_applicants` は別管理でよいか？（別テーブルで並行運用推奨）

---

## 8. 技術スタック（変更なし）

- Node.js v22 + `--experimental-sqlite`
- SQLite（`data/recruitment.db`）
- サーバー: `recruitment-platform/server.js`（モノリス）
- フロント: サーバーサイドレンダリング（テンプレートHTML）
- CSS: 既存 `public/styles.css` を拡張

---

*この指示書の確認事項（セクション7）への回答後、Phase 1から順に実装を開始します。*
