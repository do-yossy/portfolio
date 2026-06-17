# Fly.ioで無料公開するまでの手順書〜Node.jsアプリを世界に公開しよう〜

**価格：1,980円**
**対象：Node.jsアプリをローカルで動かせた、次は公開したい人**

---

## SECTION 1: 本編コンテンツ

---

### はじめに

「ローカルでは動いてるのに、どうやって外から見せるの？」

これ、わたしが1年くらいずっと悩んでいたことです。せっかく作ったアプリを友達に見せたくても「えっとURLは…localhost:3000です」って言うしかなくて、当然相手には見えない。

Fly.ioに出会ったのは、HerokuがFreeプランを廃止したタイミングでした。代替を探してたくさん試した中で、「これが一番わかりやすかった」のがFly.ioです。

**Fly.ioとは何か？**

Fly.ioは、アプリをインターネット上のサーバーで動かすためのサービスです。無料枠があって、Node.jsのアプリなら月0円で公開できます。コマンドラインで操作するので最初はちょっと怖いですが、この手順書の通りにやれば大丈夫です。

**なぜFly.ioがおすすめか？**

- 無料枠が現実的（256MBメモリのマシンが1台、ずっと無料）
- SQLiteが使える（他のサービスはDBが有料のことが多い）
- コマンドが比較的わかりやすい
- 日本のリージョン（nrt = 東京）があるのでレスポンスが速い

**わたしが最初にやらかした失敗**

- PORTの環境変数を設定し忘れてずっとクラッシュしてた
- SQLiteのファイルがデプロイのたびに消えてた（Volumeを知らなかった）
- .envファイルをそのままアップしようとしてた

同じ失敗をしなくていいように、この手順書に全部まとめました。

---

### Fly.ioの料金について

「無料って言っても、後から請求されたりしない？」

これ、わたしも最初めちゃくちゃ不安でした。正直に説明します。

**無料でできること**

| リソース | 無料枠 |
|----------|--------|
| マシン（shared-cpu-1x、256MB RAM） | 月2,340時間まで（実質1台ずっと無料） |
| ストレージ（Volume） | 3GB |
| 帯域 | 月160GB |
| アプリ数 | 複数OK |

256MBって少ない気がしますが、Expressで作ったシンプルなアプリなら余裕で動きます。

**お金がかかるケース**

- マシンをスペックアップしたとき（1GB RAMにするなど）
- Volume（ストレージ）を3GB以上使ったとき
- 複数台マシンを同時に常時起動したとき

個人の趣味プロジェクトなら、無料枠の範囲で十分です。わたしは3つアプリを動かしていますが、月の請求はずっと$0です。

**クレジットカードは必要**

登録時にクレジットカードが必要です。「無料なのになんで？」と思いますよね。スパム対策と、万が一超過した場合の支払い手段確保のためだそうです。

でも、設定をきちんとすれば請求されません。auto_stop_machines（後で説明します）を有効にしておけば、使っていないときはマシンが自動停止するので安心です。

**趣味プロジェクトの目安：月$0〜$5程度**

---

### Step 1: Fly.ioアカウント作成

1. [https://fly.io](https://fly.io) にアクセス
2. 「Get Started」または「Sign Up」をクリック
3. メールアドレスとパスワードで登録（GitHubアカウントでも登録できます）
4. メール認証を完了させる
5. クレジットカードを登録する

クレジットカード登録画面が出たら、素直に登録してください。登録しないと無料枠も使えません。繰り返しになりますが、無料枠の範囲で使う限り請求されません。

---

### Step 2: flyctlのインストール

flyctlは、コマンドラインからFly.ioを操作するためのツールです。これをインストールして、ターミナルからコマンドを叩けるようにします。

**Macの場合（Homebrewを使用）**

```bash
brew install flyctl
```

**Windowsの場合（PowerShell）**

```powershell
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

PowerShellを管理者権限で開いて実行してください。

**Linuxの場合**

```bash
curl -L https://fly.io/install.sh | sh
```

**インストール確認**

```bash
flyctl version
```

こんな感じのバージョン情報が出ればOKです：

```
flyctl v0.3.xx linux/amd64 Commit: xxxxxxxx BuildDate: 2024-xx-xx
```

**ログイン**

```bash
flyctl auth login
```

ブラウザが開いて、さっき作ったアカウントでログインするよう求められます。ログイン完了後、ターミナルに戻ると「Successfully logged in」と表示されます。

---

### Step 3: アプリの準備

デプロイする前に、Node.jsアプリがFly.io対応になっているか確認します。

**① package.jsonに"start"スクリプトがあるか**

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

`"start": "node index.js"` の部分が重要です。Fly.ioはデプロイ後にこのコマンドでアプリを起動します。

**② PORTを環境変数から受け取っているか**

これが一番ハマるポイントです。ローカルでは `3000` 番ポートで動かしていても、Fly.io上では別のポート番号が割り当てられます。

```javascript
// ❌ これだと動かない
const PORT = 3000;

// ✅ これが正しい
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

`process.env.PORT` を使うことで、Fly.ioが指定したポートで自動的に起動してくれます。

**③ .gitignoreの設定**

プロジェクトのルートに `.gitignore` ファイルを作って、以下を含めてください：

```
node_modules/
.env
*.sqlite
*.db
```

`node_modules` をアップしようとするとデプロイが激重になります。必ず除外してください。

---

### Step 4: fly.tomlの設定

`fly.toml` はFly.ioの設定ファイルです。プロジェクトのルートディレクトリに作成します。

**完全なfly.tomlの例**

```toml
app = "your-app-name"
primary_region = "nrt"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

**各設定の説明**

- `app = "your-app-name"` — アプリの名前。`your-app-name.fly.dev` というURLになります。小文字とハイフンだけ使えます
- `primary_region = "nrt"` — 東京リージョン。日本向けならこれが一番速い
- `internal_port = 3000` — アプリが内部的に使うポート番号。Step 3で設定した番号と合わせる
- `force_https = true` — HTTPSを強制。これはそのままにしておく
- `auto_stop_machines = true` — アクセスがないときマシンを自動停止。無料枠維持のために必須
- `auto_start_machines = true` — アクセスがきたら自動起動。auto_stopとセットで使う
- `min_machines_running = 0` — 常時起動マシン数を0に。0にすることで、使っていないときは完全停止して無料枠に収まる
- `memory = "256mb"` — メモリ256MB。無料枠の最大
- `cpu_kind = "shared"` — 共有CPU。無料枠はこれ

**注意：** `min_machines_running = 0` にすると、しばらく使わないとマシンが止まります。次にアクセスしたとき起動に数秒かかります（コールドスタート）。個人プロジェクトなら許容範囲です。

---

### Step 5: SQLiteの永続化設定（Volumeの作成）

**なぜVolume（ボリューム）が必要か**

Fly.ioはデプロイするたびにアプリのファイルが新しくなります。SQLiteのデータベースファイルも一緒にリセットされてしまいます。「デプロイしたらデータが消えた！」はわたしが最初にやらかした失敗です。

これを防ぐには、データが消えない「ボリューム」という永続ストレージにSQLiteファイルを置く必要があります。

**ボリュームの作成**

```bash
flyctl volumes create myapp_data --region nrt --size 1
```

- `myapp_data` — ボリュームの名前（任意）
- `--region nrt` — 東京リージョン（アプリと同じリージョンにする）
- `--size 1` — 1GB（無料枠3GB以内）

**fly.tomlにマウント設定を追加**

```toml
app = "your-app-name"
primary_region = "nrt"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[mounts]
  source = "myapp_data"
  destination = "/data"

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

`[mounts]` セクションを追加しました。これで `/data` というディレクトリがボリュームになります。

**アプリのコードを修正**

SQLiteのファイルパスを `/data` ディレクトリに変更します。

```javascript
const Database = require('better-sqlite3');

// ❌ これだとデプロイのたびにリセットされる
const db = new Database('./myapp.sqlite');

// ✅ /dataディレクトリに保存する
const dbPath = process.env.DB_PATH || './myapp.sqlite';
const db = new Database(dbPath);
```

そして環境変数でパスを設定します（次のStepで説明）。

---

### Step 6: 環境変数の設定

`.env` ファイルにある秘密の情報（APIキー、DBパスなど）は、`flyctl secrets` コマンドで設定します。絶対に `fly.toml` に直接書かないでください。

**環境変数を設定するコマンド**

```bash
flyctl secrets set DB_PATH=/data/myapp.sqlite
flyctl secrets set SESSION_SECRET=ランダムな文字列
flyctl secrets set OPENAI_API_KEY=sk-xxxxxxxxxxxx
```

複数まとめて設定することもできます：

```bash
flyctl secrets set DB_PATH=/data/myapp.sqlite SESSION_SECRET=abc123 NODE_ENV=production
```

**設定済みの環境変数を確認する**

```bash
flyctl secrets list
```

```
NAME            DIGEST          CREATED AT
DB_PATH         sha256:xxxxxx   2024-01-01T00:00:00Z
SESSION_SECRET  sha256:xxxxxx   2024-01-01T00:00:00Z
```

値そのものは表示されません（セキュリティのため）。設定されているかどうかだけ確認できます。

**削除したい場合**

```bash
flyctl secrets unset SESSION_SECRET
```

---

### Step 7: 初回デプロイ

いよいよデプロイです！

**`flyctl launch` と `flyctl deploy` の違い**

- `flyctl launch` — 初回だけ使う。アプリをFly.ioに登録して、最初のデプロイをする
- `flyctl deploy` — 2回目以降の更新に使う

**初回デプロイ（fly.tomlが既にある場合）**

fly.tomlを自分で作成した場合は、`flyctl launch` ではなく直接 `flyctl deploy` を使います：

```bash
flyctl deploy
```

**初回デプロイ（fly.tomlがまだない場合）**

```bash
flyctl launch
```

対話式で質問されます：

```
? Choose an app name (leave blank to generate one): your-app-name
? Select Organization: personal
? Do you want to tweak these settings before proceeding? No
```

**デプロイ中の出力（こんな感じになります）**

```
==> Building image
--> Building image done
==> Pushing image to fly
--> Pushing image done
==> Creating release
--> release v1 created
==> Monitoring deployment
 1 desired, 1 placed, 0 healthy, 0 unhealthy [health checks: 0 total]
 1 desired, 1 placed, 1 healthy, 0 unhealthy [health checks: 1 total]
--> v1 deployed successfully
```

最後に `deployed successfully` と出ればOKです！

**デプロイしたアプリを開く**

```bash
flyctl open
```

ブラウザが開いて、`https://your-app-name.fly.dev` が表示されます。

---

### Step 8: 独自ドメインの設定（オプション）

`your-app-name.fly.dev` というURLでも十分ですが、独自ドメインを使いたい場合の手順です。

**証明書の追加**

```bash
flyctl certs add yourdomain.com
```

`yourdomain.com` を実際のドメイン名に変えてください。

**DNS設定**

ドメインのDNS設定画面で、CNAMEレコードを追加します：

```
タイプ: CNAME
ホスト: @ または www
値: your-app-name.fly.dev
TTL: 3600
```

ドメイン購入サービス（お名前.com、Xserverなど）の管理画面でこの設定をします。

**証明書の確認**

```bash
flyctl certs show yourdomain.com
```

DNS設定が反映されるまで数分〜数十分かかります。Let's Encryptの証明書が自動で発行されるので、HTTPSが使えるようになります。

---

### Step 9: よくあるエラーと解決法

デプロイ中によく遭遇するエラーと、その対処法をまとめました。

---

**エラー①「Error: failed to fetch an image or build from source」**

```
Error: failed to fetch an image or build from source: error connecting to docker: ...
```

**原因と解決策**

Dockerfileがない、またはビルドに失敗しています。Fly.ioはNode.jsアプリを自動検出してビルドしますが、うまくいかない場合はルートディレクトリに `Dockerfile` を作成します：

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

---

**エラー②「データベースのデータがデプロイのたびに消える」**

エラーメッセージはなく、デプロイ後にDBが空になっている状態。

**原因と解決策**

SQLiteファイルをボリューム外に置いているのが原因です。Step 5の手順でボリュームを作成して、`/data` ディレクトリにSQLiteファイルを移動してください。

確認コマンド：

```bash
flyctl ssh console
ls /data/
```

ボリュームが正しくマウントされていれば `/data/` ディレクトリが存在します。

---

**エラー③「bind: address already in use」**

```
Error: listen EADDRINUSE: address already in use :::3000
```

**原因と解決策**

アプリが3000番ポートを使おうとしていますが、Fly.ioが指定したポートと違います。Step 3の手順で `process.env.PORT` を使うように修正してください。

また、`fly.toml` の `internal_port` がアプリのポート番号と一致しているか確認してください。

---

**エラー④「デプロイ成功なのにアプリがクラッシュしている」**

デプロイが `deployed successfully` で終わったのに、ブラウザで開くとエラーになる。

**ログの確認方法**

```bash
flyctl logs
```

リアルタイムのログが流れます。エラーメッセージを探してください。

```bash
flyctl logs --no-tail
```

過去のログを一覧で表示します。

よくある原因：
- 必要なnpmパッケージがインストールされていない（`dependencies` に書き忘れ）
- 環境変数が設定されていない（`flyctl secrets list` で確認）
- データベースのパスが間違っている

---

**エラー⑤「Error: scale failed」**

```
Error: scale failed: ... insufficient capacity
```

**原因と解決策**

指定したマシンサイズが空いていません。無料枠の `shared-cpu-1x` を使っているか確認してください。

```bash
flyctl scale show
```

```bash
flyctl scale vm shared-cpu-1x --memory 256
```

---

**エラー⑥「環境変数が読み込まれていない」**

アプリのコードで `process.env.MY_KEY` を使っているのに `undefined` になる。

**確認と解決策**

まず設定されているか確認：

```bash
flyctl secrets list
```

設定されていない場合は追加：

```bash
flyctl secrets set MY_KEY=my-value
```

シークレットを設定すると自動的に再デプロイが走ります。それでも解決しない場合は手動でデプロイ：

```bash
flyctl deploy
```

アプリ内でのデバッグ方法（一時的に）：

```javascript
console.log('ENV CHECK:', {
  PORT: process.env.PORT,
  MY_KEY: process.env.MY_KEY ? '設定済み' : '未設定'
});
```

---

### 運用・メンテナンスのコツ

**ログの確認**

問題が起きたらまずログを見る習慣をつけましょう：

```bash
# リアルタイムで流れるログ
flyctl logs

# 過去のログをまとめて見る
flyctl logs --no-tail | head -50
```

**アプリの状態確認**

```bash
flyctl status
```

```
App
  Name     = your-app-name
  Owner    = personal
  Hostname = your-app-name.fly.dev
  Image    = your-app-name:deployment-xxxxxxxx

Machines
ID            PROCESS  VERSION  REGION  STATE    CHECKS             LAST UPDATED
xxxxxxxxxx    app      1        nrt     started  1 total, 1 passing 2024-01-01T00:00:00Z
```

`STATE` が `started` なら動いています。

**アプリの更新（再デプロイ）**

コードを変更したら：

```bash
flyctl deploy
```

これだけです。ダウンタイムなしでデプロイされます。

**マシンを一時停止してコストを下げる**

`auto_stop_machines = true` にしていれば自動停止しますが、手動で停止することもできます：

```bash
# マシンの一覧を確認
flyctl machines list

# 停止
flyctl machines stop <MACHINE_ID>

# 再起動
flyctl machines start <MACHINE_ID>
```

**使わなくなったアプリを削除する**

```bash
flyctl apps destroy your-app-name
```

ボリュームも一緒に削除されます。

---

### さいごに

ここまで読んでくれてありがとうございます。

最初は「コマンドラインって怖い」「英語のエラーが読めない」と思うかもしれません。わたしもそうでした。でも何度かデプロイを繰り返すうちに、「あ、これはポートの設定ミスだな」「これはVolume忘れてるな」と、パターンで読めるようになってきます。

公開したアプリのURLを誰かに送ったとき、「ちゃんと動いてる！」と言ってもらえたときの達成感は格別です。ローカルで動くものと、世界中からアクセスできるものでは、全然違います。

ポートフォリオとして採用担当者に見せる、副業のお客さんにデモを見せる、友達に使ってもらう——URLが1個あるだけで、できることが全然変わります。

ぜひ、最初の1デプロイを成功させてみてください。うまくいくと、次もまた作りたくなります。

---

## SECTION 2: 販売ページ説明文

---

### 販売タイトル（30文字以内）

Fly.ioでNode.jsアプリを無料公開する手順書

---

### キャッチコピー（インパクトのある一文）

「ローカルでは動いてる」を卒業しよう。月0円でNode.jsアプリを世界に公開する、失敗込みの完全手順書。

---

### 販売ページ本文（700〜1000文字）

せっかく作ったアプリ、誰にも見せられていませんか？

「localhost:3000で動いてます」——この一言で何度もどかしい思いをしました。ポートフォリオに載せたい、友達に使ってもらいたい、副業のお客さんにデモを見せたい。そのたびに「公開できない」が壁になっていました。

この手順書は、Fly.ioというサービスを使ってNode.jsアプリを無料公開するまでの全工程を、非エンジニアのわたしが実際に試行錯誤した経験をもとにまとめたものです。

**この手順書でわかること**

- Fly.ioのアカウント作成〜デプロイまでの全ステップ
- 無料枠の正確な内容（何が無料で何が有料か）
- fly.tomlの書き方（実際に動くコード例つき）
- SQLiteのデータが消えないようにするVolume設定
- APIキーなど秘密情報の安全な管理方法
- よくあるエラー6種類とその解決法

**こんな方に向けて書きました**

Node.jsアプリをローカルで動かせた、次は公開したい——でもAWSやGCPは難しそう、Herokuは有料になった、VPSはサーバー設定がわからない、という方です。技術的な前提知識は「ターミナルでコマンドを打てること」だけで大丈夫です。

わたし自身、最初のデプロイに成功するまで3日かかりました。PORTの環境変数を忘れてクラッシュしまくり、SQLiteのデータが消えて途方に暮れ、英語のエラーに何度も挫折しそうになりました。この手順書にはその失敗が全部詰まっています。

同じ回り道をしなくていいように、コマンド・設定ファイルの実例・エラーの対処法を全部まとめました。公開URLが1本あるだけで、できることが変わります。

---

### ハッシュタグ（10個）

```
#Flyio
#Node.js
#個人開発
#Webアプリ公開
#無料デプロイ
#プログラミング初心者
#ポートフォリオ
#副業エンジニア
#SQLite
#個人開発者
```
