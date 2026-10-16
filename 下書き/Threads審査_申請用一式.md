# Threads審査（Meta App Review）申請用一式 — SNSまとめて予約

- ステータス：下書き（審査前）
- 作成日：2026-10-15
- 対象：Threads のユースケース「Access the Threads API」で、次の3つの権限の Advanced Access を申請する
  - threads_basic・threads_content_publish・threads_manage_replies（コードが求めるのはこの3つだけ。lib/sns/threads.js:12）
- 使い方：英語の文は、申請画面にそのまま貼る想定。【】はオーナーが埋める。【オーナーが確認】は、調査で確かめられていない項目。
- 前提：reviewer・監査役の審査をまだ通していない。公式の要件は、2026-10-15 の調査（出典は各節と末尾）にあるものだけを書いた。調査に無いことは書いていない。

---

## 0. 先に決めること

| 項目 | 内容 |
|---|---|
| 本番のURL | 本番は sq-ai-bijika（https://post.social-quality.com）。この一式のURLは、すべてこれで書いた。michishirube-post（fly.sns.toml にある専用アプリ）は使わない（お試し手順の手順0で削除する）。管理画面（/admin/service）の「設定の確認」に出る SERVICE_BASE_URL の値と、Meta に登録するすべてのURLを、1文字も違わず同じにする。お試し手順の手順0で別のアドレスにした場合は、この一式のURLをすべて読み替える |
| Meta 側のアプリの表示名 | 【オーナーが確認】（Meta の商標・ロゴを含めない） |
| Threads の自動運用（AIの「そのまま投稿する」） | 今の作りでは、Threads も「AIで自動運用する」の対象で、「そのまま投稿する（確認なし）」を選べる（lib/service-ui.js の自動運用の欄。除外は TikTok だけ）。このため、3章の英文は「本人が作って予約した内容だけ」と書かず、この機能も正直に書いた。審査の前に、Threads の自動運用を「下書きに入れる」だけにするかを決める。【オーナーが確認】（参考：Meta の Developer Policies 1.7「本人の代わりに投稿する前に同意を得る。内容を前もって埋めない。提案した内容は、共有の前に本人が編集できるようにする」。これは Facebook の調査で挙がったもので、Threads の調査には出ていない） |

---

## 1. 申請の前の確認（チェックリスト）

### 1-1. Meta 側（オーナー）

- [ ] **ビジネス確認（Business Verification）を最初に始める**。Advanced Access にはビジネス確認が要る。アプリの「設定」→「ベーシック」→「認証（Verification）」から株式会社Social Quality のビジネスポートフォリオにつなぎ、続きはビジネスマネージャで行う。完了できるのは、ビジネスの管理者だけ。必要な書類と日数は未確認。【オーナーが確認】
- [ ] **Threads 用のアプリIDとシークレットを使う**。アプリIDとシークレットは2組できる。「Threads app ID」「Threads app secret」を THREADS_APP_ID・THREADS_APP_SECRET に入れる（メインのアプリIDでは連携できない）。
- [ ] **権限は3つだけにする**。「Use cases」→ Threads で threads_content_publish と threads_manage_replies を「Add」する（threads_basic は必須で外せない）。threads_read_replies・threads_manage_insights・threads_delete などは足さない（足すと、その使い方も審査で見せる必要が出る）。
- [ ] **Threads Tester を追加して、承認する**。「App roles」→「Roles」→「Add People」で、役割「Threads Tester」（ふつうの「Testers」とは別の役割）を選び、自分の Threads アカウントを招待する。招待された人は、Threads の「アカウントの設定」→「Website permissions」から承認する。テスターにしてよいのは、従業員か、テスターとしての取り決めがある人だけ。お客様は不可。
- [ ] **申請する日から30日以内に、権限ごとに1回以上、呼び出しを成功させる**（アプリからでも Graph API Explorer からでもよい）。このサービスでは、連携（/me）で threads_basic、投稿で threads_content_publish、ツリーの2件目で threads_manage_replies を使う。本番で、連携 → テキストの投稿 → 画像の投稿 → ツリー を1回ずつ成功させる。本物の Threads API とつなぐのは、これが初めて。
- [ ] **承認されるまで、アプリをライブ（Live）にしない**。公式：ライブのアプリが求められるのは、審査で承認された権限だけ。このため、承認の前にライブにすると、テスターも含めて連携できなくなると考えられる（調査の結論・未確認）。また、開発モードで作ったデータは、ライブにすると役割の無い人にも見えるようになる（Threads のテストの投稿に当てはまるかは未確認）。
- [ ] 「設定」→「ベーシック」と、Threads のユースケースの「Settings」を埋める（2章）。
- [ ] 審査用のサービスのアカウント（メールとパスワード）を作り、/admin/service で「テスト利用」を付ける。審査の期間中は止めない。審査担当者がアプリに入れないと、申請全体が却下される。
- [ ] 権限ごとの画面録画を撮る（4章）。
- [ ] 権限ごとの「使う理由」（3章）と、審査担当者向けの案内（6章）を貼る。
- [ ] Data Handling Questions に答える（7章）。
- [ ] 「Submit for Review」を押し、Platform Onboarding Terms に同意する。結果は通常1週間以内（公式の目安）。
- [ ] **承認の後**：左メニューの「Publish」でライブにする → 本番の SNS_APPROVED に threads を足す → アプリの役割の無いアカウントで、連携から投稿までを確かめる。ライブにした後は、毎年 Data Use Checkup でデータの扱いの質問に答える。

### 1-2. 本番の準備（オーナー・開発）

- [ ] 開発の変更が本番に出ている：審査済みの判定（SNS_APPROVED）、法務文書の確定（LEGAL_FINAL）、Meta の受け口（Deauthorize・Data Deletion）と削除の状況のページ、データ削除の手順のページ、「Threadsの最近の投稿」、「Threadsで見る」。main への push はそのまま本番に出るので、PRで入れる。
- [ ] fly secrets：THREADS_APP_ID・THREADS_APP_SECRET を登録する。**SNS_APPROVED には threads を入れない**（審査中）。SERVICE_OPEN は入れない。これで、テスト利用の利用者（審査用のアカウント・自分）にだけ「Threadsを連携」が「審査前（テスト利用のみ）」の表示つきで出る。
- [ ] **受け口の確認（LEGAL_FINAL=true と申請より前に、必ず行う）**。手順はセットアップ手順の2-2の8。マイページで「解除」を押さずに、テスターの Threads の「Website permissions」からアプリを外し、`fly logs -a sq-ai-bijika` のログとマイページで、次のどれになったかを見分ける。
  - (a) 成功：マイページから Threads の連携が消え、「Threadsの側で、本サービスへの許可が取り消されたため…削除しました」の知らせが出る。ログに `[meta]` の行は出ない。
  - (b) 署名が合わない：ログに `[meta] threads deauthorize bad signature` が出て、連携が残る。メインのアプリのシークレットで署名されている可能性がある。今のコードは THREADS_APP_SECRET でしか確かめないため、コードの変更が要る（開発に依頼する）。
  - (c) IDが合わない：ログに `[meta] 該当する連携が見つかりませんでした threads deauthorize （確認コード）` が出て、連携が残る。届いた user_id が、保存したID（/me の id・トークンの応答の user_id）と違う。今のコードは届いた user_id を残さないため、原因を調べるには、届いた中身を一時的に確かめる仕組みを開発の作業として入れる必要がある（今は無い）。
  - `[meta]` の行が出ず、連携も残る：知らせが届いていない。URLの登録、開発が本番に出ているか、THREADS_APP_SECRET の登録（未登録だと 503 を返し、ログは出ない）を確かめる（セットアップ手順の2-2の8）。
  - この3点（URLの登録・本番に出ているか・THREADS_APP_SECRET）がすべて合っていても届かない場合は、待った時間と操作の内容（いつ、どのアカウントで、どの画面からアプリを外したか）を添えて、開発に相談する（Meta が Threads で取り消しの知らせを送るかは未確認）。そのうえで、プライバシーポリシーの5の2項の Threads の記載（「Metaから取り消しの知らせが本サービスに届いたときに、直ちに…削除を行います」）を見直すかどうかを、オーナーと開発で決める。**それまでは LEGAL_FINAL=true にせず、申請もしない。**
  - **(a)になるまで、LEGAL_FINAL=true にせず、申請しない**（プライバシーポリシーの5は「Metaから知らせが届いたら直ちに削除する」と約束しているため）。(b)・(c) のときは、開発で直して本番に出してから、やり直す。どのシークレットで署名されるか、user_id がどのIDかは、Threads に限った公式の説明が見つかっていない（未確認）。
  - Instagram・Facebook を後から使う場合も、SNS_APPROVED に入れる前に、同じ手順で(a)になることを確かめる（セットアップ手順の2-2の8の6、2-3-1の8・2-3-4の7。シークレットは INSTAGRAM_APP_SECRET・FACEBOOK_APP_SECRET、ログのSNS名は instagram・facebook）。
- [ ] SERVICE_CONTACT_EMAIL・SERVICE_REPRESENTATIVE を登録し、法務文書の残りの【】（OpenAI・TikTok の契約の相手方）を埋める。受け口の確認が(a)になってから LEGAL_FINAL=true にし、/service/legal/privacy・/service/legal/terms に「（案）」も【】も残っていないことを確かめる（【】が1つでも残っていると「（案）」は外れない）。
- [ ] 審査担当者が、日本国外から本番とログインの画面に入れるか（地域での遮断の有無）。【オーナーが確認】
- [ ] アプリアイコン：今の public/icon-512.png は 512×512 で、ミチシルベの図柄。このまま使うか、サービス専用の 1024×1024 を作るか。【オーナーが確認】

---

## 2. アプリの管理画面に入れる値

| 場所 | 項目 | 入れる値 | 注意 |
|---|---|---|---|
| 設定 → ベーシック | App Icon | 1024×1024（512〜1024px、5MB未満、JPEG・GIF・PNG） | Meta の商標・ロゴ、「Facebook」「FB」の文字を使わない |
| 設定 → ベーシック | Privacy Policy URL | https://post.social-quality.com/service/legal/privacy | 誰でも開けて、地域で遮断しないURLにする（Platform Terms 4.a）。Meta の許可の画面で、利用者に示される |
| 設定 → ベーシック | Terms of Service URL | https://post.social-quality.com/service/legal/terms | ライブにするのに必須 |
| 設定 → ベーシック | User Data Deletion | 削除の手順のURL：https://post.social-quality.com/service/legal/data-deletion | 「手順のURL」か「コールバックのURL」のどちらかを登録する（公式のFAQ）。この欄でどちらを選べるか、表記は画面で確かめる。【オーナーが確認】 |
| 設定 → ベーシック | Category | 【オーナーが確認】 | アプリを正確に表すものを選ぶ |
| 設定 → ベーシック | App Purpose | Clients | アプリの役割を持たない一般の人が使うため |
| 設定 → ベーシック | Primary Contact（連絡先のメール） | 【オーナーが確認】 | 審査の結果がこのアドレスに届く。受け取れるアドレスにする |
| 設定 → ベーシック | 認証（Verification） | 株式会社Social Quality のビジネスポートフォリオ | 1-1 のビジネス確認 |
| Use cases → Threads → Settings | Client OAuth Settings（有効なOAuthリダイレクトURI） | https://post.social-quality.com/service/oauth/callback/threads | 登録した後の一覧で、末尾に「/」が付いていないか確かめる |
| Use cases → Threads → Settings | Deauthorize callback URL | https://post.social-quality.com/service/meta/threads/deauthorize | 受け口が本番に出てから登録する。管理画面での表記は未確認・実物で確かめる |
| Use cases → Threads → Settings | Data Deletion Requests URL | https://post.social-quality.com/service/meta/threads/data-deletion | 同上。返す JSON は {url, confirmation_code}。url は削除の状況のページ（/service/meta/deletion?code=…）。該当する連携が無かったとき（すでに解除済みなど）は、状況のページの状態が「受付済み（該当する連携は見つかりませんでした）」になり、「削除しました」とは出ない |
| App Review → Complete App Settings | （ベーシックと同じ項目） | 上の値 | 申請の画面で、ベーシックの値を確かめるか、ここで埋める |
| App Review → Complete App Verification | Meta のログインでアプリに入れるか | No（の見込み） | 本サービスへのログインはメールとパスワードで、Threads のログインは連携のためだけに使う。【オーナーが確認】 |
| App Review → Complete App Verification | Platform Settings と、入り方の説明 | 6章の英文 | アプリが使えるプラットフォーム（ウェブサイトなど）を確かめる。Website の値（例：https://post.social-quality.com/service）は【オーナーが確認】 |

本番の環境変数（fly secrets）

| 名前 | 値 | 注意 |
|---|---|---|
| THREADS_APP_ID・THREADS_APP_SECRET | Threads app ID・Threads app secret | メインのアプリIDではないほう |
| SNS_APPROVED | 審査中は threads を入れない。承認とライブ化の後に threads を足す（カンマ区切り） | 入れると、一般の利用者にも「使えるSNS」として出る |
| LEGAL_FINAL | true | 受け口の確認（1-2）が(a)になってから入れる（3点が合っていても知らせが届かないときは、開発に相談し、プライバシーポリシーの見直しを決めるまで入れない）。【】が残っていなければ、法務文書の「（案）」と草案の注意書きが外れる |
| SERVICE_CONTACT_EMAIL・SERVICE_REPRESENTATIVE | 公開してよい問い合わせ先・代表者の氏名 | 法務文書の【メールアドレス】【代表者の氏名】に入る |
| SERVICE_BASE_URL | https://post.social-quality.com | リダイレクトURIの元になる。Meta に登録した値と完全に同じにする |

---

## 3. 権限ごとの「使う理由」（英語）

公式の手引きは、権限ごとに別々の説明を求めている（使い回しは不可）。次の4つの問いに答える形で書いた：その権限が利用者の何に役立つか／なぜ要るか／受け取るデータをどう使うか／無いとアプリがどう困るか。

### 3-1. threads_basic

> Our web app helps individual creators and small businesses in Japan schedule posts to their own Threads profile. We use threads_basic to identify the user's connected Threads account, to let the user view their own recent posts, and as the base permission for the calls we make on the user's behalf when publishing the posts they scheduled.
>
> 1. Identifying the connected account. When a user connects Threads, we call /me to get their Threads user ID and username. The username is shown on the user's dashboard ("My Page") as "Threads @username", so the user can confirm which profile is connected and choose it as a destination when creating a post. The user ID is used to address that profile when we publish, and to match deauthorization and data deletion requests from Meta to the right connection.
> 2. Viewing their own recent posts. On the Threads row of My Page, the user can open "Recent Threads posts". We then retrieve a list of the user's own Threads posts and show the text, images and videos, so the user can check what is already on their profile before scheduling new content. This list is fetched only when the user opens it, is shown only to the user who connected the account, and is not saved on our servers.
>
> We do not show this data to other users and do not use it for advertising or analytics. Without threads_basic, users could not see which Threads account is connected or review their own posts in our app, and we could not identify the profile to publish to.

### 3-2. threads_content_publish

> Publishing to the user's own Threads profile is the main purpose of our app. In the "Create post" screen, the user writes the text, optionally attaches images or a video (a carousel of up to 20 items is supported), selects their connected Threads account, and either chooses "Post now" or sets a date and time. At that time our server uses threads_content_publish to create the media container and publish it to the user's own profile. The post then shows as "Published" in the user's calendar, with a "View on Threads" link to the published post.
>
> We publish only posts that the user has set up in our app for their own connected account. If the user turns on our optional AI writing feature, the AI drafts posts from a theme and schedule that the user configures; the user chooses whether these drafts are saved for review first or scheduled automatically, and automatic scheduling requires the user to tick a separate confirmation checkbox. Users can also create the same scheduled posts through a personal API key or an AI assistant that they connect to their own account.
>
> We never post to an account that the user has not connected themselves, and the app does not perform automated likes, follows, comments or direct messages. Without threads_content_publish the app could not publish anything to Threads, which is the core feature users sign up for.

### 3-3. threads_manage_replies

> We request threads_manage_replies for a single feature: publishing a multi-post thread (called "ツリー（連投）" in our Japanese UI). A user can prepare a series of posts — for example a three-part explanation — where each post has its own text and can include images or a video. When the series is published, our app publishes the first post with threads_content_publish and then publishes each following post as the user's own reply to the post just before it (using reply_to_id), so the series appears as one connected thread on the user's profile.
>
> Every reply we create is a reply to a post that our app has just published for the same user, as part of the series that user prepared. We do not reply to other people's posts, we do not hide or unhide replies, and we do not change who can reply. Without this permission, users could only publish single posts and could not publish a connected series of their own posts.

メモ（申請画面には貼らない）

- threads_manage_replies が、自分の投稿への返信（ツリー）に必須かどうかは、公式の記述が食い違っている（Get Started は「返信のエンドポイントへの POST に必要」、Create Replies のページは権限の条件を別に書いている）。必須でなければ、この権限を申請しないことで、審査の対象を1つ減らせる。【オーナーが確認】
- 3-1 の「最近の投稿」と、3-2 の「Threadsで見る」は、今回の開発で作るもの。録画の前に、本番の画面で文言と動きを確かめる。

---

## 4. 画面録画の台本

### 4-1. 撮影の条件（3本すべて）

- 解像度は 1080p 以上。画面の幅は 1440 以下に下げて撮る。
- できるだけマウスで操作する（カーソルを大きくすると見やすい）。キーボードの操作は映らないと伝わらない。
- 音声は入れない（審査担当者は聞かない）。
- アプリの画面（全画面か、ブラウザのウィンドウだけ）を撮る。
- **ログアウトした状態から撮り始める**。サービス自体のログイン（メールとパスワード）も、Threads のログインと許可の画面も、すべて映す。
- 画面は日本語だけなので、**英語の字幕**を付け、ボタンの意味を説明する（下の台本の英文を使う）。
- 権限ごとに1本ずつ撮り、申請画面で、その権限の欄にアップロードする。録画が無い権限は承認されない。
- 長さ・ファイルの形式・大きさの決まりは、公式の文書に書かれていない。
- 使うアカウント：サービスは審査用のアカウント（テスト利用つき）。Threads は Threads Tester にした自分のアカウント。
- 2本目以降も、連携の流れ（許可の画面）から映す。前の録画で連携した場合は、マイページで「解除」し、Threads の「Website permissions」からもアプリを外してから撮る。外した後に、許可の画面が毎回出るかは未確認。実物で確かめる。この順で外すと、取り消しの知らせが届いたときには連携がもう無いため、ログに `[meta] 該当する連携が見つかりませんでした` が出る。これは想定どおりで、問題ない（受け口の確認（1-2）とは別のこと）。

### 4-2. 共通の冒頭（3本とも、この流れから始める）

| # | 画面での操作 | 英語の字幕 |
|---|---|---|
| 1 | ログアウトした状態で、本番のログインの画面（/service/login）を開く | Starting logged out. This is the login page of our web app. The UI is in Japanese; captions explain each step. |
| 2 | 「メールアドレス」「パスワード」に審査用アカウントを入れ、「ログイン」を押す | "メールアドレス" = Email, "パスワード" = Password, "ログイン" = Log in. This is our own account system (not Meta login). |
| 3 | マイページが開く | This is "マイページ" (My Page), the user's dashboard. |
| 4 | 「連携しているSNS」の欄の「Threadsを連携」を押す（横に「審査前（テスト利用のみ）」と出ている） | In "連携しているSNS" (Connected accounts), click "Threadsを連携" = "Connect Threads". The label "審査前（テスト利用のみ）" means "Before review – test users only". |
| 5 | Threads のログインの画面が出たら、Threads Tester のアカウントでログインする | Log in to Threads. |
| 6 | Threads の許可の画面：求める権限が並んでいるところを止めて映し、許可する | Threads authorization screen. Our app requests threads_basic, threads_content_publish and threads_manage_replies. The user approves. |
| 7 | マイページに戻り、「連携しているSNS」に「Threads @ユーザー名」が出ているところを映す | Back on My Page. The connected profile is now listed as "Threads @username". |

### 4-3. threads_basic（冒頭の 1〜7 のあと）

| # | 画面での操作 | 英語の字幕 |
|---|---|---|
| 8 | 冒頭の 7 の画面で、ユーザー名を指して止める | threads_basic: we read the user's Threads user ID and username to show which account is connected. |
| 9 | Threads の連携の行の「最近の投稿」を押す | Click "最近の投稿" = "Recent posts" on the Threads row. |
| 10 | 見出し「Threadsの最近の投稿」の一覧を映す | "Threadsの最近の投稿" = "Recent Threads posts". This list of the user's own posts is retrieved from the Threads API. |
| 11 | 画像つきの投稿・動画つきの投稿を開き、本文・画像・動画を見せる | Viewing post details: text, images and video. |
| 12 | 一覧の画面のまま止める | This list is visible only to the user who connected the account. It is not stored on our server. |

撮る前に：Threads Tester のアカウントに、本文だけ・画像つき・動画つきの投稿が1件ずつあるとよい。1件を開いたときの見え方は、実装された画面で確かめる。

### 4-4. threads_content_publish（冒頭の 1〜7 のあと）

| # | 画面での操作 | 英語の字幕 |
|---|---|---|
| 8 | マイページの「投稿を作る」を押す | Click "投稿を作る" = "Create post". |
| 9 | 「投稿の種類」で「画像」を選ぶ | "投稿の種類" = Post type. "画像" = Image. |
| 10 | 「投稿先」で Threads のアカウントを選ぶ | "投稿先" = Destination. Select the connected Threads account. |
| 11 | 「本文」に文を入れる | "本文" = Post text. |
| 12 | 「画像・動画」から画像を添付する | "画像・動画" = Images / videos. Attach an image. |
| 13 | 「いつ投稿するか」で「日時を指定して予約」を選び、数分後の日時を入れて「保存する」を押す | "いつ投稿するか" = When to post. "日時を指定して予約" = Schedule for a date and time. "保存する" = Save. |
| 14 | 「カレンダー・下書き」を開き、「予約中」になっているところを映す | "カレンダー・下書き" = Calendar & drafts. Status "予約中" = Scheduled. |
| 15 | 予約の時刻を過ぎたら再読み込みし、「投稿済み」と「Threadsで見る」を映す | Status "投稿済み" = Published. The post was published with threads_content_publish. "Threadsで見る" = View on Threads. |
| 16 | 「Threadsで見る」を押し、Threads 上の同じ投稿を映す | The same post on the user's Threads profile. |
| 17 | スマホの Threads のアプリで、同じ投稿が出ているところを映す（画面の録画をつなぐ） | The same post in the Threads app. |

注意：公式の録画の要件は「このアプリと、Threads のネイティブアプリの両方で結果を見せる」。ウェブ版の Threads だけで足りるかは未確認なので、スマホの Threads のアプリの画面も入れる。待ち時間は編集で切ってよい（切った箇所には字幕で「a few minutes later」と入れる）。

### 4-5. threads_manage_replies（冒頭の 1〜7 のあと）

| # | 画面での操作 | 英語の字幕 |
|---|---|---|
| 8 | 「投稿を作る」を押し、「投稿の種類」で「ツリー（連投）」を選ぶ | "ツリー（連投）" = Thread (a series of the user's own posts). |
| 9 | 「投稿先」で Threads を選び、「本文」に1件目の文を入れる | Post 1 text. |
| 10 | 「ツリーの2件目以降」で「＋ 投稿を追加」を押し、2件目の文を入れ、画像を添付する | "ツリーの2件目以降" = Posts 2 and later. "＋ 投稿を追加" = Add post. Post 2: text and an image. |
| 11 | 「いつ投稿するか」で「今すぐ投稿」を選び、「保存する」を押す | "今すぐ投稿" = Post now. "保存する" = Save. |
| 12 | ブラウザの確認の画面「今すぐ投稿します。よろしいですか？」が出たら、止めて映し、OK を押す | A confirmation dialog appears: "今すぐ投稿します。よろしいですか？" = "Post now – are you sure?" Click OK. |
| 13 | 「カレンダー・下書き」で「投稿済み」になったところを映す | Published. |
| 14 | Threads（スマホのアプリ）で、2件目が1件目への本人の返信としてつながっているところを映す | Post 2 was published as the user's own reply to post 1, using threads_manage_replies. We only reply to the user's own posts in the series. |

### 4-6. （任意）削除の仕組みを見せる場合

必須の録画ではない（調査の録画の要点では任意の扱い）。撮る場合は、受け口の確認（1-2）が(a)になってから、次の流れで撮る。

- 削除の状況のページ（確認コードつき）は、この録画では見せられない。アプリを外したときに届くのは取り消しの知らせ（Deauthorize）で、その応答は `{"received": true}` だけで確認コードが無い。運営者が確認コードを見る画面も無い。
- マイページで先に「解除」を押さない（押すと、消すものが無くなり、知らせも出ない）。

| # | 画面での操作 | 英語の字幕 |
|---|---|---|
| 1 | ログアウトした状態で、https://post.social-quality.com/service/legal/data-deletion を開き、1〜4の見出しと「削除されないもの」を映す | Our public "データ削除の手順" (Data deletion instructions) page, available without logging in. It explains how to disconnect in My Page, how to remove our app in Threads settings, how deletion requests from Meta are handled, and how to contact us. |
| 2 | ログインし、マイページの「連携しているSNS」に「Threads @ユーザー名」が出ているところを映す | The user's Threads account is connected. |
| 3 | Threads の「Website permissions」で、このアプリを外す | In Threads, the user removes our app under "Website permissions". |
| 4 | マイページを再読み込みし、Threads の連携が消え、「Threadsの側で、本サービスへの許可が取り消されたため、…その連携の情報を削除しました」で始まる知らせが出ているところを映す | Meta notified our app that the user removed it. We deleted the stored connection data (user ID, username and token), cancelled the user's unpublished scheduled posts for this account, and removed stored post IDs and links. My Page shows a notice explaining this. |

知らせが出るまでの時間は確かめていない。待ち時間は編集で切ってよい（切った箇所には字幕で「a few minutes later」と入れる）。

---

## 5. 日本語の画面の英訳の対応表

| 画面の日本語 | 英訳 |
|---|---|
| ログイン | Log in |
| メールアドレス | Email |
| パスワード | Password |
| マイページ | My Page (dashboard) |
| 連携しているSNS | Connected accounts |
| Threadsを連携 | Connect Threads |
| 審査前（テスト利用のみ） | Before review – test users only |
| 解除 | Disconnect |
| 再連携 | Reconnect |
| 再連携が必要 | Reconnection required |
| 最近の投稿 | Recent posts |
| Threadsの最近の投稿 | Recent Threads posts |
| 投稿を作る | Create post |
| 投稿の種類 | Post type |
| テキスト／画像／動画 | Text / Image / Video |
| ツリー（連投） | Thread (a series of the user's own posts) |
| 投稿先 | Destination |
| 本文 | Post text |
| SNSごとに本文を変える | Use different text for each network |
| 画像・動画 | Images / videos |
| ツリーの2件目以降 | Posts 2 and later in the thread |
| ＋ 投稿を追加 | + Add post |
| いつ投稿するか | When to post |
| 日時を指定して予約 | Schedule for a date and time |
| 今すぐ投稿 | Post now |
| 下書きに保存（あとで予約） | Save as draft (schedule later) |
| 保存する | Save |
| 今すぐ投稿します。よろしいですか？（「今すぐ投稿」で「保存する」を押したときの、ブラウザの確認の画面） | Post now – are you sure? (browser confirmation dialog; click OK) |
| 連携を解除します。未投稿の予約は取り消されます。よろしいですか？（「解除」を押したときの、ブラウザの確認の画面） | Disconnect? Unpublished scheduled posts will be cancelled. (browser confirmation dialog; click OK) |
| 予約する | Schedule |
| かんたん投稿 | Quick post |
| カレンダー・下書き | Calendar & drafts |
| 予約と投稿の履歴 | Scheduled and past posts |
| 予約中 | Scheduled |
| 投稿中 | Publishing |
| 投稿済み | Published |
| 失敗 | Failed |
| 取り消し | Cancelled / Cancel |
| 下書き | Draft |
| Threadsで見る | View on Threads |
| AIで自動運用する | AI auto-posting rules |
| 下書きに入れる（確認してから投稿・おすすめ） | Save to drafts (review before posting – recommended) |
| そのまま投稿する（確認なし） | Post automatically (no review) |
| データ削除の手順 | Data deletion instructions |
| 利用規約／プライバシーポリシー | Terms of Service / Privacy Policy |

「最近の投稿」「Threadsの最近の投稿」「Threadsで見る」は今回の開発で入る文言。録画の前に、本番の画面の表記と合っているか確かめる。

---

## 6. 審査担当者向けの案内（英語。App Verification の「入り方の説明」の欄に貼る）

日本語の要約：URLは0章の本番のURLで埋めた（別のアドレスにした場合は読み替える）。審査用アカウントと問い合わせ先は【】を埋める。審査担当者は、Threads には自分のテストアカウントで入る。オーナー個人の Meta・Threads のログイン情報は書かない（公式が禁じている）。「今すぐ投稿」は、保存の数秒後にサーバーが投稿を始める（そのとき別の投稿を処理中なら、30秒ごとに動く予約の処理で投稿する）。画像・動画は、Threads 側の処理を待ってから公開する。このため、保存した直後のカレンダーでは「予約中」か「投稿中」と出ることがあるので、待ってから再読み込みしてもらう（Steps の6・7）。「今すぐ投稿」で「保存する」を押したときと、「解除」を押したときは、ブラウザの確認の画面（日本語）が出て、OK を押さないと進まないため、その文の英訳と「OK を押す」ことを Steps の5・7・8に書いた（4-5 の台本と5章の対応表も同じ）。

> **How to access and test our app**
>
> Our app is a web app for scheduling posts to the user's own social media accounts. The UI is in Japanese only; the screen recordings include English captions, and the Japanese labels used below are followed by their English meaning.
>
> **Test account for our app** (our own email/password login – not a Meta login):
> - Login page: https://post.social-quality.com/service/login
> - Email: 【審査用アカウントのメールアドレス】
> - Password: 【審査用アカウントのパスワード】
>
> This account has test access enabled, so no payment is required. While our app is under review, the Threads connection is shown only to test accounts like this one.
> To connect Threads, please use your own Threads test account.
>
> **Steps**
> 1. Open the login page, enter the email and password above, and click "ログイン" (Log in).
> 2. On "マイページ" (My Page), in the "連携しているSNS" (Connected accounts) box, click "Threadsを連携" (Connect Threads). It is labeled "審査前（テスト利用のみ）" (Before review – test users only).
> 3. Log in to Threads and approve the requested permissions. You will return to My Page, where "Threads @your_username" is now listed in the same box. [threads_basic]
> 4. On the Threads row, click "最近の投稿" (Recent posts) to see a list of your own Threads posts, and open a post to see its text, images or video. [threads_basic]
> 5. Click "投稿を作る" (Create post). Choose "画像" (Image) under "投稿の種類" (Post type), select your Threads account under "投稿先" (Destination), enter text in "本文" (Post text), and attach an image under "画像・動画" (Images / videos). Under "いつ投稿するか" (When to post), choose "今すぐ投稿" (Post now) or "日時を指定して予約" (Schedule for a date and time), then click "保存する" (Save). If you chose "今すぐ投稿" (Post now), a browser confirmation dialog "今すぐ投稿します。よろしいですか？" (Post now – are you sure?) appears; click OK. [threads_content_publish]
> 6. Open "カレンダー・下書き" (Calendar & drafts). Publishing is not instant: with "今すぐ投稿" (Post now), our server starts publishing a few seconds after you save (if it is busy, our scheduler, which runs every 30 seconds, picks the post up), and posts with images or video take longer because Threads processes the media first. Right after saving, the status may still be "予約中" (Scheduled) or "投稿中" (Publishing). Please wait a moment and reload the page to see the status change. When the status is "投稿済み" (Published), click "Threadsで見る" (View on Threads) to open the post on Threads.
> 7. Create another post and choose "ツリー（連投）" (Thread – a series of your own posts) under "投稿の種類". Click "＋ 投稿を追加" (+ Add post) to add a second post with text and an image, choose "今すぐ投稿" (Post now), and click "保存する" (Save). A browser confirmation dialog "今すぐ投稿します。よろしいですか？" (Post now – are you sure?) appears; click OK. As in step 6, wait a moment and reload "カレンダー・下書き" until the status is "投稿済み" (Published). On Threads, the second post appears as your own reply to the first post. [threads_manage_replies]
> 8. To disconnect, click "解除" (Disconnect) on the Threads row in My Page. A browser confirmation dialog "連携を解除します。未投稿の予約は取り消されます。よろしいですか？" (Disconnect? Unpublished scheduled posts will be cancelled.) appears; click OK.
>
> Privacy Policy: https://post.social-quality.com/service/legal/privacy
> Data deletion instructions: https://post.social-quality.com/service/legal/data-deletion
> Contact: 【問い合わせ先のメールアドレス】

---

## 7. Data Handling Questions（データの扱いの質問）の回答案

### 7-1. 公式で分かっていること

- Advanced Access が要るアプリは、審査の中でデータの扱いの質問に答える。ビジネス確認が承認されていると、申請の流れの中で表示されることがある。回答はその場で評価される（最大30秒）。
- ライブにした後は、毎年の Data Use Checkup の中で、同じ質問に答える。
- 目的は、Meta から受け取った個人データが、安全に、Platform Terms と Developer Policies に沿って処理・移転されることを確かめること。
- 公式は、社内の法務・ポリシー・プライバシーの専門家に相談して答えることを勧めている。

### 7-2. 未確認のこと

- **質問の項目と文面は、調査で取得できていない**（questions-preview のページは開いていない）。申請の前に https://developers.facebook.com/docs/development/release/data-handling-questions/questions-preview を開き、下の材料を、実際の質問に当てはめて答える。【オーナーが確認】
- 下の材料で足りない項目は、すべて【オーナーが確認】として扱う。推測で答えない。

### 7-3. 回答の材料（このサービスの事実。コードとプライバシーポリシー 2-2・4・4-3・4-4・5 から）

| 観点 | 事実（日本語） | 英語の文案 |
|---|---|---|
| Meta から受け取るデータ（Threads） | ThreadsのユーザーID、ユーザー名、トークン、本サービスから投稿した投稿のIDと、投稿へのリンク。「最近の投稿」の中身は表示するだけで保存しない | We receive the Threads user ID, username and access token of the connecting user, plus the IDs and permalinks of posts our app publishes for that user. Recent posts shown in the "Recent Threads posts" view are fetched on demand and are not stored. |
| 使う目的 | 投稿先の表示と選択、予約した投稿の実行、投稿の結果の表示、トークンの更新、取り消し・削除の求めへの対応。広告・自社のマーケティング・分析には使わず、販売しない | We use this data only to show the connected account, publish the posts the user scheduled, show the results, keep the connection active, and handle deauthorization and deletion requests. We do not use it for advertising, our own marketing or analytics, and we do not sell it. |
| 保存する場所・委託先 | Fly.io（米国の事業者。サーバーは日本の東京リージョン）のサーバーとデータベース | Data is stored in our database hosted by Fly.io, Inc. (a US company), with servers in the Tokyo, Japan region. |
| ほかの事業者への提供 | 決済（Stripe）・AIの生成（Anthropic・OpenAI）には、Meta から受け取ったデータを送らない。利用者が自分でAPIキーを発行するか、AIアシスタントの接続を認めた場合だけ、利用者の指示で、そのアプリにアカウント名・投稿のID・投稿へのリンクなどを返す | We do not send Platform Data to our payment provider (Stripe) or to our AI providers (Anthropic, OpenAI). Only if a user creates a personal API key or connects an AI assistant to their own account do we return that user's data, such as the account name, post IDs and post links, to that tool, at the user's direction. |
| 安全の措置 | トークンは AES-256-GCM で暗号化して保存。パスワードは scrypt でハッシュ化。通信は https。運営者の画面はパスワードで保護 | Access tokens are encrypted at rest with AES-256-GCM. User passwords are hashed with scrypt. All traffic uses HTTPS, and the admin console is password-protected. |
| 利用者ごとの分離 | データは利用者のアカウントごとに分けて扱い、ほかの利用者には見せない | Data is kept per user account and is never shown to other users. |
| 削除 | マイページの解除、Meta からの取り消し・削除の求めで、直ちに連携の情報を消し、未投稿の予約を取り消し、投稿済みの予約の投稿IDとリンクを消す。データ削除の求めには、確認コードと削除の状況のページを返す。該当する連携が無かったとき（すでに解除済みなど）は、状況のページに「削除しました」とは出さず、見つからなかったと出す | When a user disconnects in our app, or when Meta sends a deauthorization or data deletion request, we immediately delete the stored connection data, cancel unpublished scheduled posts, and remove stored post IDs and permalinks. Data deletion requests from Meta receive a confirmation code and a status page. If no matching connection is found (for example, because the user had already disconnected), the status page says so instead of reporting a deletion. |
| 削除の求めの記録 | Meta から届いた求めごとに、確認コード・SNSの種類・求めの種類・受け付けた日時・状態・消した件数を残す（状況の確認と問い合わせへの対応のため）。届いた user_id と signed_request の中身（ハッシュにしたものを含む）は残さない。連携を消したことをマイページで知らせるための記録（本サービスのアカウント・SNSの種類・理由・日時）も残す。保存期間は決まっていない | For each deauthorization or data deletion request from Meta, we keep a record of the confirmation code, the platform, the request type, the date and time received, the status and the number of connections removed, so that the status can be checked and inquiries can be answered. This record does not include the Threads user ID or any other content of the signed request, including hashed values. We also keep a notice record on the affected user's account in our app (platform, reason and date) so that we can tell the user on My Page that the connection was removed. |
| 外国への移転・公的機関からの求め・責任者など | — | 【オーナーが確認】（質問の項目を確かめてから答える） |

注意：7-3 の「削除」と「削除の求めの記録」の行は、今回の開発（Meta の受け口と、解除のときに投稿IDとリンクを消す処理）が本番に出ていて、受け口の確認（1-2）が(a)になっていることが前提。それまでは答えに使わない。「削除の求めの記録」の保存期間は決まっていないため、英文には書いていない。期間を聞かれたら、オーナーが決めてから答える。【オーナーが確認】

---

## 8. 調査で分かっていないこと（申請の前に確かめる）

- 管理画面での名前：公式の今の文書では「Deauthorize callback URL」「Data Deletion Requests URL」。ログインした画面での表記（日本語を含む）は見ていない。
- signed_request：どのシークレットで署名されるか、user_id がどのIDか。Threads に限った公式の説明は見つかっていない。1-2 の受け口の確認（セットアップ手順の2-2の8）で、(a)（成功）・(b)（bad signature：コードの変更が要る）・(c)（該当なし：届いた中身を確かめる仕組みを開発で入れる必要がある）を見分ける。(a)になるまで LEGAL_FINAL=true にせず、申請しない。URLの登録・本番への反映・THREADS_APP_SECRET の3点が合っていても知らせが届かない場合は、開発に相談し、プライバシーポリシーの5の2項の Threads の記載を見直すかを決めるまで、LEGAL_FINAL=true にしない（1-2）。
- Meta が Threads で、アプリを外したときに取り消しの知らせ（Deauthorize）を送るか。送るまでの時間。
- Threads の利用者が、どの画面からデータの削除を求めるか。公式の文書は Facebook の「アプリとウェブサイト」からの手順しか書いていない。
- threads_manage_replies が、自分の投稿への返信に必須か（3章のメモ）。
- アプリの目的が「Clients」のとき、Tech Provider の手続きが要るか（ログインした画面で確かめていない）。
- 日本語だけの画面とプライバシーポリシーでも、英語の字幕を付ければ受け入れられるか（公式は「できれば英語に、無理なら字幕と説明を」とだけ書いている）。
- 開発モードで Threads Tester が投稿した内容が、ライブにする前から一般に見えるか。
- 日本の株式会社のビジネス確認に要る書類と日数。審査の期間は、公式の目安「通常1週間以内」しか分からない。
- 本物の Threads API とは、まだ一度もつないでいない（テストは模擬の通信だけ）。

---

## 出典

- Threads の権限（Allowed Usage・Use Case Description・Screencast Requirements）：https://developers.facebook.com/docs/permissions/threads
- 申請の手引き（Step 1〜6、Screen Recordings、30日以内の呼び出し、個人の資格情報を書かない、ライブにする時期）：https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide
- 画面録画の手引き（ログアウトから撮る、ログインの流れ、1080・1440、マウス、音声なし、字幕）：https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings
- App Review の構成（App Verification・Permissions Review・ビジネス確認・Data Handling Questions・App Settings）：https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/content
- アプリに入れないと申請全体が却下：https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review
- Data Handling Questions：https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/data-handling-questions （質問の一覧 questions-preview は未取得）
- ビジネス確認：https://developers.facebook.com/documentation/development/release/business-verification
- Threads の始め方（2組のアプリID、Threads Tester、権限の付与は90日）：https://developers.facebook.com/documentation/threads/get-started
- Threads のアプリの作り方（ユースケースの Settings、公開に要るもの、Publish）：https://developers.facebook.com/documentation/threads/get-started/create-an-app
- リダイレクトURIの末尾のスラッシュ：https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions
- 設定 → ベーシック（アイコン・プライバシーポリシー・利用規約・データ削除のURL）：https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings
- データ削除のコールバック（signed_request、{url, confirmation_code}、状況のページ、FAQ）：https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback
- アプリのモード（ライブにする前後）：https://developers.facebook.com/documentation/development/build-and-test/app-modes
- アプリの役割（テスターの条件）：https://developers.facebook.com/documentation/development/build-and-test/app-roles
- Platform Terms（3.d.i・4.a〜4.c・5.b。2026年2月3日更新）：https://developers.facebook.com/terms/dfc_platform_terms/
- Developer Policies（1.7。Facebook の調査で参照）：https://developers.facebook.com/devpolicy/
- 社内：下書き/_リスク一覧_SNSまとめて予約.md（1位：審査前でも販売できる、4位：取り消し・削除の仕組み）
