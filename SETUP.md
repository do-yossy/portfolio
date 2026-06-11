# 開発環境セットアップ（新しいPC用）

新しいPCでこのプロジェクトの開発を再開するための手順書です。
**上から順にやればOK**。Windows / Mac 両対応で書いています。

> このページはGitHubのリポジトリトップ（`do-yossy/portfolio`）からいつでも読めます。
> 新PCでは、まずスマホ等でこのページを開きながら進めると楽です。

---

## このプロジェクトの中身（全体像）

| フォルダ / ファイル | 何か | 公開先 |
|---|---|---|
| ルートの `*.html`（`index.html` など） | 会社サイト・ポートフォリオ（静的サイト） | GitHub Pages（`www.social-quality.com`） |
| `sales-platform/` | **管制塔**（営業バックエンド・Node製） | Fly.io（`sq-sales-tanto20`） |
| `recruitment-platform/` | 採用システム（Node製） | Fly.io |

ポイント：**`main` ブランチに push すると、GitHub Actions が自動でFly.ioへデプロイ**します（手動デプロイ作業は不要）。

---

## 1. 必要なソフトを入れる（4つ）

### ① Git（コードを取得・保存する道具）
- **Windows**: <https://git-scm.com/download/win> からインストーラを実行（全部「次へ」でOK）。または PowerShell で `winget install Git.Git`
- **Mac**: ターミナルで `xcode-select --install` を実行。または `brew install git`

### ② Node.js 22 LTS（管制塔を動かす土台）★バージョン重要
このプロジェクトは **Node.js 22以上**が必要です（古いと管制塔が起動しません）。
- **Windows / Mac 共通**: <https://nodejs.org/> を開き、**「LTS」**（推奨版）をダウンロードしてインストール
- 確認: ターミナル（Macは「ターミナル」、Windowsは「PowerShell」）で
  ```bash
  node -v
  ```
  → `v22.x.x` 以上ならOK（`v20`以下なら入れ直し）

### ③ VS Code（コードを書くエディタ）
- <https://code.visualstudio.com/> からインストール
- おすすめ拡張機能（VS Code内の拡張機能アイコンから検索して追加）:
  - **Live Server**（静的サイトをワンクリックでプレビュー）
  - **Japanese Language Pack**（メニュー日本語化）

### ④ Claude Code（AI開発アシスタント＝普段のやり取り相手）
普段の開発・修正は Claude Code（私）に頼むのが一番早いです。新PCでも使えるように：
- **一番かんたん**: ブラウザで <https://claude.ai/code> を開く（インストール不要）
- **ターミナルで使う場合**: `npm install -g @anthropic-ai/claude-code` → `claude` で起動
- VS Code内で使う拡張機能版もあります

---

## 2. プロジェクトを取得する（クローン）

ターミナル（PowerShell / ターミナル）で、保存したい場所に移動してから：

```bash
git clone https://github.com/do-yossy/portfolio.git
cd portfolio
```

### GitHubへのサインイン（保存＝pushに必要）
コードを書き換えてGitHubへ保存（push）するにはサインインが必要です。**一番かんたんなのはVS Code**：
1. VS Codeで `portfolio` フォルダを開く（ファイル → フォルダーを開く）
2. 左下の人型アイコン → **「GitHubでサインイン」** をクリックして認証
3. 以降、VS Code上でコミット・pushができます

> ※ コマンド派なら GitHub CLI（<https://cli.github.com/>）を入れて `gh auth login` でもOK。

---

## 3. 会社サイト（静的サイト）を見る

`index.html` など、ルートのHTMLは**そのままブラウザで開くだけ**でも見られます。
おすすめは VS Code の **Live Server**：
1. VS Codeで `index.html` を開く
2. 右クリック →「Open with Live Server」
3. ブラウザで自動表示（保存すると自動リロード）

> Live Serverを使わない場合、ターミナルで `npx serve` を実行 → 表示されたURLを開く。

---

## 4. 管制塔（sales-platform）をローカルで動かす

```bash
cd sales-platform
npm install            # 必要な部品を取得（初回のみ・少し時間がかかる）
cp .env.example .env   # 設定ファイルを作成（Windowsは: copy .env.example .env）
```

作成された **`.env`** をVS Codeで開き、最低限ここだけ設定：
- `ADMIN_PASSWORD=` … 管制塔ログイン用。ローカルなので好きな文字列でOK
- （AI生成も試すなら）`ANTHROPIC_API_KEY=` にClaudeのAPIキーを入れる。無くても起動します（その場合は無料テンプレで下書き生成）

起動：

```bash
npm run dev:local
```

ブラウザで **<http://localhost:3100/admin>** を開く → `.env` に設定したパスワードでログイン。
（`dev:local` はファイルを保存するたびに自動で再起動します）

> **うまく動かない時**
> - `node -v` が v22未満 → Node.jsを入れ直す（手順①②）
> - `.env` を作ったか確認（`ADMIN_PASSWORD` が必須）
> - ポート3100が使用中なら `.env` の `PORT` を `3101` 等に変更

---

## 5. 変更をネットに反映する（デプロイ）

このプロジェクトは **push＝自動デプロイ**です。普段の流れ：

```bash
git add -A
git commit -m "変更内容のメモ"
git push
```

`main` に入ると GitHub Actions が動き、数分でFly.io（管制塔）／GitHub Pages（サイト）へ反映されます。

> ⚠ いきなり `main` を壊さないため、大きめの変更は**ブランチを切ってからPR**が安全です。
> 普段はこの作業も Claude Code（私）に頼めば、ブランチ作成→commit→push→PR作成まで自動でやります。

---

## 6.（任意）採用システム（recruitment-platform）も動かす

基本は管制塔と同じ流れです：

```bash
cd recruitment-platform
npm install
node --experimental-sqlite server.js
```

> 一部のスクレイピング機能は Python + Playwright が必要ですが、画面の確認だけなら上記で起動できます。

---

## 困ったときチェックリスト

- [ ] `node -v` が **v22以上** か
- [ ] `git clone` でフォルダが取得できたか
- [ ] 管制塔は `sales-platform` の中で `npm install` 済みか
- [ ] `.env` を作って `ADMIN_PASSWORD` を設定したか
- [ ] 起動コマンドは `npm run dev:local`、URLは `http://localhost:3100/admin` か

それでも詰まったら、**エラー文をそのままClaude Codeに貼って**ください。原因と直し方を一緒に進めます。
