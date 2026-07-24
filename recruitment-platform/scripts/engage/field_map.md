# engage（エンゲージ）求人作成フォーム フィールドマップ

engage_poster.py が参照する、engage求人作成フォームの主要フィールド対応表。
（`engage_form_dump.py` / DevToolsダンプで取得した実DOM構造にもとづく）

- フォームURL: `https://en-gage.net/company/job/regist/form/?PK=<企業PK>`
- 一時保存(下書き)API: `/company/api_new/update_temp_work`
- 保存ボタン: 「入力内容を保存」

## 主要フィールド（name属性 → 意味）

| name | 種別 | 意味 | 当社ジョブの対応 |
|---|---|---|---|
| `employment_status` | radio | 雇用形態 1=中途正社員 2=中途契約 3=新卒正社員 5=アルバイト 6=業務委託 | 1（正社員） |
| `official_occupation_name` | text | 職種名（必須） | job.jobType |
| `occupation_name` | text | 求人タイトル（キャッチ） | job.catchcopy or title |
| `work_contents` | textarea | 仕事内容 | job.description |
| `business_content` | textarea | 事業内容 | （会社情報・任意） |
| `work_office[0]` | select | 勤務地 都道府県（大阪府=37 東京都=23） | location先頭の都道府県 |
| `municipalities[0]` | textarea | 市区町村 | location の市区町村 |
| `other_address[0]` | textarea | 詳細住所 | location の残り |
| `work_office_station[0]` | text | 最寄駅 | （任意） |
| `work_office_division[0]` | radio | 1=国内(勤務地指定あり) | 1 |
| `work_division` | radio | 1=フルタイム 2=パート 3=その他 | 1 |
| `access` | textarea | アクセス | （任意） |
| `salary_type_selected` | radio | 給与形態 1=月給 3=日給 4=時給 5=年俸 6=完全成果報酬 | 1（月給） |
| `salary_amount_from_1_2` / `salary_amount_to_1_2` | text | 月給 下限/上限 | job.salary をパース |
| `salary_note` | textarea | 給与補足 | （任意） |
| `office_hour_style` | radio | 1=固定時間制 2=シフト 3=フレックス … | 1 |
| `office_hours` | textarea | 勤務時間（自由記述） | job.worktime_holiday |
| `holiday_type` | select | 休日制度 20=完全週休2日制 30=週休2日制 … | 本文から推定 |
| `annual_holiday` | text | 年間休日数 | 本文から推定（任意） |
| `holiday` | textarea | 休日・休暇 | job.holiday / worktime_holiday |
| `treatment` | textarea | 待遇・福利厚生 | job.benefit |
| `qualification` | textarea | 応募資格 | job.qualifications |
| `educational_status` | select | 学歴 90=学歴不問 | 90 |
| `occupation_experience` | radio | 1=未経験OK 2=経験者のみ | タグに応じて |
| `recruitment_bg` | textarea | 募集背景 | （任意） |
| `selection_process_contents_01` | textarea | 選考プロセス1 | job.how_to_apply |
| `selection_process_note` | textarea | 選考補足 | （任意） |
| `submitCheck` | checkbox | 掲載ガイドライン同意（既定でON） | ONのまま |

## 都道府県 name=value（work_office[0]）

北海道=11 青森=12 岩手=13 宮城=14 秋田=15 山形=16 福島=17 東京都=23 神奈川県=24
千葉県=22 埼玉県=21 茨城県=18 栃木県=19 群馬県=20 富山県=26 石川県=27 福井県=28
新潟県=25 山梨県=29 長野県=30 愛知県=33 静岡県=32 岐阜県=31 三重県=34 大阪府=37
京都府=36 兵庫県=38 滋賀県=35 奈良県=39 和歌山県=40 広島県=44 岡山県=43 鳥取県=41
島根県=42 山口県=45 徳島県=46 香川県=47 愛媛県=48 高知県=49 福岡県=50 熊本県=53
佐賀県=51 長崎県=52 大分県=54 宮崎県=55 鹿児島県=56 沖縄県=57

## 備考

- engageは自動操作ブラウザのログインを弾く（bot検知）ため、投稿本体は
  **実Chromeプロファイル（persistent context / channel=chrome）** を使い、
  一度手動ログインしたセッションを再利用する。
- 安全のため、初期実装は **一時保存（下書き）** まで。内容をengage上で確認してから公開する運用。
