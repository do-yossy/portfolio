# 月額SNS自動投稿サービス お試し手順（運営者向け）

決済（Stripe）を設定しなくても、運営者ご自身のアカウントで、本番のサイト（`https://aipro.social-quality.com/service`）を実際に試すための手順です。販売ページは「準備中」のままで、一般の方は申し込めません。

サイトは Fly.io のアプリ `sq-ai-bijika` で動いていて、`https://sq-ai-bijika.fly.dev` でも同じサイトが開きます。SNSの連携やAIアシスタントとの接続は `SERVICE_BASE_URL` に設定したドメインで行うため、**試すときは必ず `https://aipro.social-quality.com` のほうを開いてください**。

- **所要時間の目安**：手順1〜5は15分ほど、手順6（Threadsの連携）はMetaの画面の操作に慣れていれば30分ほどです（画面の表記や手順は、各社の変更により変わることがあります）。
- **前提**：この手順書と同じ変更（テスト利用・設定の確認画面）が `main` に入り、自動デプロイが終わっていること。

---

## 手順1. Fly.io に設定値（シークレット）を登録する

次の値を、Fly.io のアプリ `sq-ai-bijika` のシークレットに登録します。登録すると、アプリが自動で再起動します。

| 名前 | 入れる値 | 説明 |
|---|---|---|
| `ADMIN_PASSWORD` | ご自身で決めた、推測されにくいパスワード | 運営者画面のパスワード。**すでに設定済みなら不要**です |
| `SERVICE_BASE_URL` | `https://aipro.social-quality.com` | サービスのURL（最後に `/` を付けない） |
| `SNS_TOKEN_KEY` | 64桁のランダムな英数字（下の方法で作る） | SNSの連携情報を暗号化する鍵。**一度決めたら変えない** |
| `APP_SECRET` | 64桁のランダムな英数字（別に作る） | 画面の操作の確認用の鍵 |

### ランダムな値の作り方（どちらか）

- **Git Bash**（Git for Windows に付属）：`openssl rand -hex 32`
- **PowerShell**：
  ```powershell
  $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
  ```

`SNS_TOKEN_KEY` と `APP_SECRET` には、別々に作った値を入れてください。

### 登録の方法（どちらか）

- **コマンド**（flyctl が入っている場合）：
  ```
  fly secrets set -a sq-ai-bijika SERVICE_BASE_URL=https://aipro.social-quality.com SNS_TOKEN_KEY=（作った値） APP_SECRET=（作った値）
  ```
  `ADMIN_PASSWORD` が未設定なら、同じコマンドに `ADMIN_PASSWORD=（決めたパスワード）` を足します。
- **Fly.io の管理画面**：Fly.io にログインし、アプリ `sq-ai-bijika` の「Secrets」から1つずつ追加します。

## 手順2. 設定を確認する

1. `https://aipro.social-quality.com/admin/login` を開き、`ADMIN_PASSWORD` でログインします。
2. `https://aipro.social-quality.com/admin/service` を開き、「設定の確認」の表を見ます。
3. 次の4つに ✅ が付いていれば、手順3に進めます：管理画面のパスワード、サービスのURL、トークンの暗号化の鍵、画面の操作の確認用の鍵。

この表は、値そのものは表示せず、設定されているかどうかだけを示します。

## 手順3. お試し用のアカウントを作る

1. `https://aipro.social-quality.com/service/signup` を開きます。
2. メールアドレスと、8文字以上のパスワードで登録します。
3. 登録後は「準備中」のページに戻りますが、アカウントは作られています。

## 手順4. 自分のアカウントに「テスト利用」を付ける

1. `https://aipro.social-quality.com/admin/service` の「テスト利用」の欄に、手順3のメールアドレスを入れます。
2. 「テスト利用を付与」を押します。

テスト利用は、決済をせずに全機能を使える状態です（料金はかかりません）。試し終わったら、同じ画面の「テスト利用を取り消す」で元に戻せます。取り消すと、SNSの連携・AIアシスタントとの接続・APIキーも解除されます。

## 手順5. ログインして、SNSなしで試せることを確かめる

1. `https://aipro.social-quality.com/service/login` でログインし、マイページを開きます。
2. マイページに「テスト利用中」と表示されることを確かめます。
3. SNSを連携しなくても、次のことを試せます。
   - **APIキーの発行**：マイページの「APIキーを発行」を押します。キーはその画面で1度だけ表示されるので、控えてください。
   - **APIの呼び出し**：Git Bash などで次のコマンドを実行し、`{"accounts":[]}` のような応答が返れば成功です（`$KEY` は控えたキー）。
     ```
     curl https://aipro.social-quality.com/api/v1/accounts -H "Authorization: Bearer $KEY"
     ```
   - **AIアシスタントとの接続（MCP）**：MCPのカスタム接続に対応したAIアシスタントのアプリで、接続先URLに `https://aipro.social-quality.com/mcp` を追加します。
     - ログイン画面と「接続を許可しますか？」の画面が出たら、「許可する」を押します。
     - 接続できたら、「契約情報と利用状況を見せて」と頼むと、`get_account_info` が呼ばれます。
     - カスタム接続を使えるプランかどうかは、お使いのアプリでご確認ください。実物のアプリでの接続は、まだ確認できていません。うまくいかない場合は、表示されたエラーの文を教えてください。

## 手順6. Threads を連携して、実際に投稿する

6つのSNSのうち、審査を待たずに試しやすいのがThreadsです。Metaの開発者アプリは「開発モード」のままで、アプリに登録したテスター本人のThreadsアカウントなら連携できます。

> **注意：@michishirube_jp（ミチシルベの公開アカウント）で試すと、テストの投稿はそのまま公開されます。**
> - 公開してよい内容（たとえば、実際に出したいお知らせ）で試してください。
> - または、投稿されたことを確かめたら、すぐにThreadsのアプリで削除してください。
> - フォロワーに見せたくない場合は、テスト専用のThreadsアカウントを用意して、そのアカウントをテスターに登録してください（Threadsのアカウントの作成には、Instagramのアカウントが必要な場合があります）。
> - ツリー（連投）を試すと、複数の投稿が続けて公開されます。

### 6-1. Meta の開発者アプリを作る

1. Meta for Developers（`https://developers.facebook.com/`）にログインし、新しいアプリを作ります。用途（ユースケース）は「Threads APIにアクセス」を選びます。
2. Threads APIの設定で、次を登録します。
   - リダイレクト（コールバック）URL：`https://aipro.social-quality.com/service/oauth/callback/threads`
   - 権限：`threads_basic` と `threads_content_publish`
   - アンインストール・削除のコールバックURLの入力を求められた場合は、仮に `https://aipro.social-quality.com/service` を入れてください。
3. 「アプリの役割」（テスター）に、ご自身のThreadsアカウントを追加します。
4. Threads側で招待を承認します。Threadsの「設定」→「アカウント」→「ウェブサイトのアクセス許可」→「招待」から承認します（表記はアプリのバージョンで異なることがあります）。
5. ThreadsのアプリIDとアプリシークレットを控えます。

### 6-2. Fly.io に登録する

```
fly secrets set -a sq-ai-bijika THREADS_APP_ID=（アプリID） THREADS_APP_SECRET=（アプリシークレット）
```

### 6-3. 連携して投稿する

1. マイページを開き直して、「Threadsを連携」を押します。Threadsの画面で許可すると、マイページに戻り、連携したアカウントが表示されます。
2. 「投稿を作る」を開いて本文を入れ、投稿先にThreadsを選び、3分ほど先の日時で予約します。
3. 時刻になると、自動で投稿されます。スケジューラは30秒ごとに確認しています。
4. 予約の状態は「カレンダー・下書き」で確認できます。「投稿済み」になれば成功です。
5. 失敗した場合は、カレンダーに表示される理由の文を教えてください。

試せることは、ほかにもあります。

- **ツリー（連投）**：投稿の種類で「ツリー」を選ぶと、連投を試せます。
- **下書き**：「下書きに保存」で保存しておき、カレンダーの画面から予約できます。

## 手順7（任意）. AIで投稿文を作る

1. Fly.io のシークレットに `ANTHROPIC_API_KEY`（AnthropicのAPIキー）を登録すると、「投稿を作る」画面に「AIで文章を作る」ボタンが出ます。
2. 画像は `OPENAI_API_KEY` を登録すると使えます。
3. AIの利用料は、生成のたびに運営者に請求されます。
4. 1人1日あたりの回数の上限は、文章30回・画像5回が既定です。動画は既定で無効です。

## 試し終わったら

- `https://aipro.social-quality.com/admin/service` で「テスト利用を取り消す」を押すと、連携やAPIキーを含めて元に戻ります。
- Fly.io に登録した設定値は、そのまま残して問題ありません。販売を始めるときに使います。
- 販売の開始には、別途、次のものが必要です。
  - Stripeの設定
  - 各SNSの審査
  - 法務文書の確認
  - `SERVICE_OPEN=true` の設定

  詳しくは「月額SNS自動投稿サービス_セットアップ手順.md」を参照してください。

## うまくいかないとき

| 症状 | 確認すること |
|---|---|
| 管理画面にログインできない | `ADMIN_PASSWORD` が登録されているか。登録した直後は、再起動が終わるまで1〜2分待つ |
| 「テスト利用を付与」でエラーになる | 手順3のアカウントを作ったか。メールアドレスが合っているか。`ADMIN_PASSWORD` を設定したか |
| 「Threadsを連携」が「準備中」になる | `THREADS_APP_ID`・`THREADS_APP_SECRET`・`SNS_TOKEN_KEY` が登録されているか（管理画面の「設定の確認」） |
| Threadsの画面でエラーになる | Metaの設定のリダイレクトURLが、手順6-1と1文字も違わないか。テスターの招待を承認したか |
| 予約したのに投稿されない | カレンダーに表示される理由の文。予約日時が過去になっていないか |
| AIアシスタントから接続できない | `SERVICE_BASE_URL` が正しいか（管理画面の「設定の確認」に表示される値） |
