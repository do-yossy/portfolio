# ai-bijika-system

「AI商品化実践システム」購入者向けWebアプリ（MVP・依存ゼロ）。

## これは何か

これまで docx/xlsx の束として提供していた「AI商品化実践システム」（90日間・GATE1〜10・AIプロンプト29本）を、
購入者がブラウザだけで進捗管理とプロンプト実行までできるWebアプリにした最初のバージョンです。

## 設計方針

- **依存ゼロ**：`node:http` / `node:sqlite` / `node:crypto` のみ。npm install 不要。
- **AI利用料は購入者負担**：購入者自身のAPIキー（OpenAI/Anthropic）をブラウザに保存し、実行のたびにサーバーへ中継するだけ。
  **キーはディスク・DB・ログのいずれにも保存しない**（`lib/aiproxy.js`）。中継先は既知のAPIエンドポイントに限定し、オープンプロキシ化を防いでいる。
- 他サービス（sales-platform 等）と同じ規約に合わせ、`node:sqlite`・自作 `loadEnv()`・素の `http` ルーティングを採用。

## 起動

```bash
cd ai-bijika-system
cp .env.example .env
npm start          # --experimental-sqlite --env-file=.env
# http://localhost:3300
```

## 現状の範囲と未対応事項

実装済み：
- アカウント作成/ログイン、購入者属性の選択（ビジネス初心者・AI初心者など4種。GATEごとのヒントと、AIへの説明の詳しさが変わる）
- マイ商品（商品名・形式・タイプ・ターゲット・集客経路・価格帯）。登録内容は各プロンプトに自動入力される
- お客様からの代金の受け取り方：購入者が自分の商品を売るときに、お客様（購入者の商品を買う人）に代金を支払ってもらうための設定。
  販売価格、お支払い方法（銀行振込・カード決済・PayPal・販売プラットフォーム・その他、複数選択可）、振込先口座・振込期限、各決済ページのURL
- プロンプト入力の選択式化（`seeds/prompt-fields.js` に29本すべての入力方法を定義。自動入力・チップ選択・プルダウンを優先し、貼り付けが必要な項目だけ自由入力）
- ロードマップ（GATE1〜10を5段階で図示、現在地と使うプロンプトの順番を表示）、商品ラインナップ（商品1→商品2→シリーズ）
- アイデア出し系プロンプト（No.3/16/25）で「今作っている商品と同じ案」「AI副業・AI商品化そのものを教える案」を除外するよう指示
- お客様へ送る「お支払い方法のご案内」文の自動作成（口座番号やURLはAIに送るプロンプトには含めない）
- DAY1〜90チェックリスト、ChatGPTで開く（押した時点でプロンプトを自動コピー。スマホのChatGPTアプリはURLからの自動入力に対応していないため、貼り付けで渡せるようにしている）／コピー、購入者のAPIキーでの実行（キーは保存しない）、PWA

デザイン：「Midnight & Champagne」（深い紺・シャンパンゴールド・アイボリー）。見出しは Shippori Mincho B1、英字・数字は Cormorant Garamond を
Google Fonts から読み込む（リポジトリ内の他ページと同じ方式。npm依存は増やしていない）。デザイントークン・共通レイアウト・アイコン・紋章・地紋は `lib/ui.js` に集約。
画面の見た目は `下書き/アプリイメージ/` の画面遷移図とBefore/After比較を参照。

`seeds/prompts.js` はマスタデータで、起動のたびにDBへ同期される（本文を直せば本番にも反映される）。

**未対応・今後の課題**：
- 決済・購入者証明との連携（誰が「購入者」かの認証は今はメール登録のみ）
- パスワードリセット・メール確認
- レート制限（`/api/run-prompt` の連打対策）
- 自動テスト
- GATEの順番はUI上の案内のみで、システム上の強制はしていない
- GATE2・GATE7が参照する「市場検証・収益モデルガイド」「販売開始チェックリスト」はアプリ未収録（画面上でその旨を表示）

## 本番デプロイ（Fly.io）

`fly.toml` と `.github/workflows/deploy-ai-bijika.yml` により、`ai-bijika-system/**` を `main` にpushするたびに
Fly.ioアプリ `sq-ai-bijika`（<https://sq-ai-bijika.fly.dev>）へ自動デプロイされる（sales-platform / recruitment-platform と同じ仕組み）。

初回セットアップ（アプリ作成・ボリューム作成）は完了済み。新しい環境に作り直す場合の手順は以下：

```bash
flyctl apps create sq-ai-bijika
flyctl volumes create ai_bijika_data --app sq-ai-bijika --region nrt --size 1
# GitHub リポジトリの Secrets に FLY_API_TOKEN が未設定であれば追加
#（sales-platform/recruitment-platform で既に設定済みなら流用可能）
```

### 独自ドメイン

`https://sq-ai-bijika.fly.dev` に加えて、`social-quality.com` のサブドメイン **`https://aipro.social-quality.com`** でも
アクセスできる（設定済み）。`social-quality.com` のDNSはCloudflareで管理している。

別のサブドメインを追加・変更する場合は、`flyctl` が使える環境で以下を実行する：

```bash
# 1. 証明書の発行をリクエストする（追加すべきDNSレコード=A/AAAAの値が表示される）
flyctl certs create <サブドメイン>.social-quality.com --app sq-ai-bijika

# 2. 表示されたA/AAAAレコードをCloudflareのDNS設定に追加する
#    プロキシ状態は必ず「DNSのみ」（灰色の雲）にする。
#    「プロキシ済み」（オレンジの雲）のままだとFly.io側の証明書検証が失敗する。

# 3. 証明書の発行状況を確認する（Issuedになるまで数分程度）
flyctl certs check <サブドメイン>.social-quality.com --app sq-ai-bijika
```

使わなくなったサブドメインの証明書は `flyctl certs remove <サブドメイン>.social-quality.com --app sq-ai-bijika` で削除できる。
