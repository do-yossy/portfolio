# WordPress 追加ページ（下書き制作物）

人材紹介事業に加えて「飲食店総合プロデュース事業」を掲載するための、追加ページの仮制作物です。
配色はダーク＋ゴールド（現行サイト／参考サイト monolith-gr.com に準拠）。

対象サイト: https://savior-corporation.com/

## ファイル
| ファイル | 用途 | 状態 |
|---|---|---|
| `トップページ_仮.html` | トップページの仮版（プレビュー用フルHTML）。SERVICE欄を2事業に更新 | 仮（要確認） |
| `サービス詳細_仮.html` | サービス詳細ページ（プレビュー用フルHTML）。人材紹介＋飲食プロデュースを掲載 | 飲食は資料反映済／人材は仮 |
| `content-top.html` | 上記トップの**WordPress貼り付け用コンテンツ断片**（style＋本文） | 貼り付け／API共用 |
| `content-service.html` | 上記サービス詳細の**貼り付け用コンテンツ断片** | 貼り付け／API共用 |
| `create-wp-drafts.py` | REST APIで2ページを**下書き投入**するスクリプト（認証は環境変数） | 実行可 |

## 内容ソース
- 飲食店総合プロデュース事業：ご提供の資料（`restaurant_total_produce_1.pptx`）の内容を全面反映
- 人材紹介事業：現行サイトの実文が取得できないため**仮の下書き**。実際の説明文をいただき次第差し替え
- ロゴ「SAVIOR」／実績数値／写真：仮置き

## WordPressへの反映方法（2通り）

### A. 貼り付け方式（今すぐ可能・推奨）
1. 作業前に**バックアップ**を取得
2. WordPress管理画面 → 固定ページ → 新規追加
3. タイトルを入力（例：「サービス詳細」）
4. **「カスタムHTML」ブロック**を追加し、対象HTMLの `<body>` 内を貼り付け
   （※テーマの全幅／余白なしテンプレートを選ぶと崩れにくい）
5. ステータスを**「下書き」**のまま保存 → プレビューで確認
6. 問題なければ公開

### B. API方式（`create-wp-drafts.py` を実行）
サイトに到達できるネットワーク（ご自身のPC等）で実行すれば、下書きを自動投入できます。
```bash
export WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"   # 新規発行したアプリパスワード
export WP_USER="editor"
export WP_SITE="https://savior-corporation.com"
python3 create-wp-drafts.py
```
- まず認証・到達確認 → その後 `wp-json/wp/v2/pages` へ `status=draft` で2ページ作成
- Python3標準ライブラリのみ（追加インストール不要）／秘密情報はスクリプトに含めない

> ⚠️ 現在の**Claude作業環境**は外部サイトへの通信がポリシー遮断されており、この環境からの直接実行は不可。
> Claudeに実行させたい場合は、環境のネットワークポリシーで `savior-corporation.com` を許可した新規セッションが必要です
> （参考: https://code.claude.com/docs/en/claude-code-on-the-web ）。

> ⚠️ チャットで共有されたアプリケーションパスワードは失効（取り消し）を推奨。API方式で進める際は新規発行してください。
