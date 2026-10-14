---
name: sns-scheduler
description: 連携済みのSNS（Threads・X・Instagram・TikTok・Facebookページ・YouTube）へ、投稿の作成・予約・下書き保存・取り消し・状態確認を行う。「SNSに投稿して」「明日9時に予約して」「下書きにして」などの依頼で使う。
---

# SNS自動投稿（API）

利用者の月額SNS自動投稿サービスのREST APIを使って、SNSへ投稿・予約する。

## 準備

- APIキーは、サービスのマイページで発行したものを環境変数 `SNS_SCHEDULER_API_KEY` に入れておく。
- サービスのURLは、環境変数 `SNS_SCHEDULER_URL` に入れておく（例：`https://example.com`）。
- どちらかが未設定なら、作業を止めて利用者に設定を頼む。

## 基本の流れ

1. 投稿先を確認する：`curl -s "$SNS_SCHEDULER_URL/api/v1/accounts" -H "Authorization: Bearer $SNS_SCHEDULER_API_KEY"`
2. 画像・動画がある場合はアップロードし、返ってきた `id` を控える：
   `curl -s -X POST "$SNS_SCHEDULER_URL/api/v1/media" -H "Authorization: Bearer $SNS_SCHEDULER_API_KEY" --data-binary @ファイル`
3. 投稿を作る（`POST /api/v1/posts`、JSON）。
   - `category`：`text`／`image`／`video`／`tree`（ツリー＝連投。Threads・Xのみ）
   - `account_ids`：投稿先のアカウントID（複数可）
   - `text`：本文。SNSごとに変える場合は `captions`（アカウントID → 本文）
   - `media_ids`：添付する画像・動画のID
   - `tree`：ツリーの2件目以降 `[{"text": "...", "media_ids": []}]`
   - いつ投稿するか：`"now": true`（即時）／`"scheduled_at": "2026-12-01T09:00:00+09:00"`（予約）／`"draft": true`（下書き）
   - `options`：SNSごとの設定。**アカウントIDごと**に指定する（TikTokとYouTubeは必須。ほかのSNSは不要）
     ```json
     "options": {
       "<TikTokのアカウントID>": {
         "privacy_level": "<利用者が選んだ公開範囲>",
         "disable_comment": false,
         "disable_duet": true,
         "disable_stitch": true,
         "commercial_own": false,
         "commercial_paid": false,
         "auto_add_music": false
       },
       "<YouTubeのアカウントID>": { "privacy": "unlisted", "made_for_kids": false }
     }
     ```
     - TikTok：`privacy_level` は `PUBLIC_TO_EVERYONE`／`MUTUAL_FOLLOW_FRIENDS`／`FOLLOWER_OF_CREATOR`／`SELF_ONLY` のうち、そのアカウントで使えるもの。`disable_comment`・`disable_duet`・`disable_stitch` は **true で「禁止」**、false で「許可」。`commercial_own` は自分の宣伝を含むか、`commercial_paid` は第三者の宣伝（提携・有償）を含むか（true のとき `SELF_ONLY` は使えない）。`auto_add_music` は写真の投稿に音楽を自動で付けるか。
     - YouTube：`privacy` は `public`／`unlisted`／`private`、`made_for_kids` は子ども向けかどうか（true／false）。どちらも必須（下書き以外）。
4. 結果を確認する：`GET /api/v1/posts?status=pending`、`GET /api/v1/posts/{id}`

その他：下書きの予約化 `POST /api/v1/posts/{id}/publish`（`{"now":true}` または `{"scheduled_at":"..."}`）、取り消し `DELETE /api/v1/posts/{id}`。

## 守ること

- **はじめは下書き（`draft: true`）で作り、利用者に内容を見せて了承を得てから予約・投稿する。** 利用者が「そのまま投稿して」と明示した場合だけ、即時・予約にする。
- 確認できていない数字・実績・お客様の声を本文に書かない。誇大な表現や、他者を傷つける表現を使わない。
- 画像・動画は、利用者が権利を持っているものだけを使う。
- 各SNSの条件：Threads 500文字（絵文字はUTF-8のバイト数で数える）・カルーセル20件・動画5分まで・ツリー可／X 日本語140文字程度・画像4枚（各5MB）または動画1本（140秒）・ツリー可・月の上限あり／Instagram プロアカウントのみ・画像はJPEG（縦横比4:5〜1.91:1）・カルーセル10件・本文2,200文字／TikTok 動画1本または写真（JPEG・35枚）／Facebook 連携時に選んだ1つのページへ投稿・画像10枚または動画1本／YouTube 3分以内の動画1本（本文の1行目がタイトル。説明は5,000バイト＝日本語でおよそ1,600文字まで。1日の上限あり。送る時点で上限なら翌日に自動で回る）。AIで作った画像・動画には、TikTok・YouTubeのAI生成の表示・申告が自動で付く。
- **TikTokへは、APIからは下書き（`draft: true`）にだけできる。** 投稿は、利用者がサービスのカレンダーから下書きを「投稿を作る」画面で開き、TikTokの設定を選び直してから行う（APIの `publish` では予約にできない）。下書きを作るときも、必ず利用者に次を確認してから `options` に入れる（あなたが勝手に決めない）：公開範囲（`privacy_level`。選べる値はアカウントごとに違う。サービスのアプリの審査が終わるまでは `SELF_ONLY` だけ）、コメント・デュエット・ステッチを許可するか、商用コンテンツの開示（自分の宣伝を含むか＝`commercial_own`、第三者の宣伝を含むか＝`commercial_paid`）。あわせて、TikTokの音楽使用の確認（第三者の宣伝を含む場合はブランドコンテンツのポリシーも）に同意したものとみなされることを利用者に伝える。
- **YouTubeへ投稿するときは、公開設定（`privacy`：public／unlisted／private）と、子ども向けかどうか（`made_for_kids`）を利用者に確認する**（あなたが勝手に決めない）。指定がないと予約できない。
- APIがエラーを返したら、`error` の文をそのまま利用者に伝え、勝手に条件を変えて再送しない。
- 投稿されたか分からない（タイムアウトなど）ときは、再送せず、SNSで確認するよう利用者に伝える（二重投稿を防ぐ）。
