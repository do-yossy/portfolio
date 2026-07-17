# Cloudflare Pages で「求人フィード」を無料公開する手順

求人ページと求人ボックス向けXMLフィードを、**静的ファイル**として Cloudflare Pages で公開します。
サーバー・SSH不要、無料、HTTPS自動、`social-quality.com` が既にCloudflareにあるので**カスタムドメインも簡単**です。
応募者データ・管理画面は一切含まれません（求人ページとフィードだけを書き出し）。

---

## STEP 1. ローカルで静的ファイルを書き出す
`recruitment-platform` フォルダで（Windowsのコマンドプロンプト）:
```
set SITE_URL=https://jobs.social-quality.com
node scripts/export-static-site.js
```
→ `dist` フォルダができます（中に `jobs/`・`feed/`・`images/` など）。

## STEP 2. Cloudflare Pages にアップする
1. Cloudflare にログイン → 左メニュー **Compute（Workers & Pages）** → **Create** → **Pages** タブ
2. **「Upload assets（アセットをアップロード）」** を選ぶ
3. プロジェクト名（例：`recruitment-jobs`）を入力
4. できた **`dist` フォルダの中身をドラッグ&ドロップ**（またはフォルダ選択）
5. **Deploy** → `https://recruitment-jobs.pages.dev` のようなURLで公開されます

## STEP 3. 独自サブドメインを割り当てる（jobs.social-quality.com）
1. 作ったPagesプロジェクト → **Custom domains（カスタムドメイン）** → **Set up a custom domain**
2. `jobs.social-quality.com` と入力 → **Continue**
3. 同じCloudflare内なので **DNSとHTTPSは自動設定**されます（Aレコードを手で足す必要なし）

→ 数分で `https://jobs.social-quality.com/jobs` や `https://jobs.social-quality.com/feed/kyujinbox-sq.xml` が見えるようになります。

## STEP 4. 求人ボックスに登録
求人ボックスの問い合わせで「サイト連携（クロール）／XML連携で掲載したい」を申請し、
フィードURLを登録：
- SQ：`https://jobs.social-quality.com/feed/kyujinbox-sq.xml`
- BG：`https://jobs.social-quality.com/feed/kyujinbox-bg.xml`
- ST：`https://jobs.social-quality.com/feed/kyujinbox-st.xml`
- 全社：`https://jobs.social-quality.com/feed/kyujinbox.xml`

---

## 求人を更新したくなったら
1. ローカルで再書き出し：
   ```
   set SITE_URL=https://jobs.social-quality.com
   node scripts/export-static-site.js
   ```
2. Pagesプロジェクト → **Create deployment / Upload** で `dist` を再アップ（上書き）

## メモ
- 静的なので**リアルタイム更新ではない**（更新は書き出し→再アップ）。フィードは頻繁更新不要なので実用上OK。
- 応募は求人ボックス側の応募動線を使う想定（静的ページの応募フォームは動作しません）。
- 管理画面・応募者データは `dist` に含まれないので、公開しても安全です。
