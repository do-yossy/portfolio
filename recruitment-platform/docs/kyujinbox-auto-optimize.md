# 求人ボックス 自動改善ループ

応募が来ていない求人をAIが検知し、改善案（Sonnet）を作って反映する仕組みです。
SQ・Bigeyes 両方に対応します。

## 全体像

```
① 成績取得         求人ボックス管理画面から 求人ごとの「閲覧数・応募数・ステータス」を自動取得
   (Python/Playwright)          ↓  logs/kyujinbox_metrics.json に保存 → DBの job_metrics へ
② 低調求人の検知    公開中で応募0の求人を、閲覧数と掲載日数から診断
   (lib/optimizer)   ・閲覧も少ない → 「露出不足」   ・閲覧はあるが応募0 → 「中身の問題」
③ AIで改善案生成    Claude(Sonnet)がタイトル/本文/タグ/やりがいを改善（事実は変えない）
④ 反映             --apply でDB＝自社サイトへ即反映。求人ボックス掲載への反映は掲載更新で行う
```

## 使い方（CLI・スケジュール実行向け）

`recruitment-platform` フォルダで：

```
# ドライラン（検知＋改善案の提示のみ・DBは変更しない）
node scripts/kyujinbox_autoloop.js --company all

# 適用（改善をDB＝自社サイトへ反映）
node scripts/kyujinbox_autoloop.js --company all --apply

# 会社/件数を指定
node scripts/kyujinbox_autoloop.js --company bg --apply --limit 10
```

Windowsのタスクスケジューラで毎晩実行すれば、自動で回ります。

## 前提（.env の設定）

1. **会社別の求人ボックス認証**（既設定）
   `KYUJINBOX_EMAIL_SQ / _PASSWORD_SQ / _GROUP_ID_SQ`、`..._BG` など
2. **Claude APIキー**（改善案の生成に必須）
   `ANTHROPIC_API_KEY=sk-ant-...`（本物のキー。未設定だと③が動きません）
   ※ 使用モデルは既定 `claude-sonnet-5`（品質重視）。`OPTIMIZER_MODEL` で変更可。

## 検知のしきい値（環境変数で調整可）

| 変数 | 既定 | 意味 |
|---|---|---|
| `OPT_MIN_AGE_DAYS` | 3 | 掲載後この日数未満は判定しない（審査中・直後を除外） |
| `OPT_VIEW_FLOOR` | 30 | 閲覧がこれ未満＝「露出不足」、以上で応募0＝「中身の問題」 |
| `OPT_COOLDOWN_DAYS` | 5 | 一度改善した求人を再度触るまでの間隔 |
| `OPT_MAX_COUNT` | 3 | 1求人あたりの改善回数の上限 |

## 安全のためのガードレール

- **公開中の求人のみ**判定（審査中・下書きは対象外）
- **掲載直後は判定しない**（`OPT_MIN_AGE_DAYS`）
- **クールダウン**と**改善回数の上限**で同じ求人を触りすぎない
- **事実は変更しない**（職種・勤務地・給与レンジ・雇用形態は保持。誇張/虚偽は生成しない）
- 既定は**ドライラン**。`--apply` を付けたときだけDBを変更

## 求人ボックス掲載への反映（--push）

`--apply` は**自社サイト（DB）に即反映**します。さらに **`--push`** を付けると、改善内容を
**求人ボックスの既存掲載（求人番号で特定）に直接反映**します（`scripts/kyujinbox_reflect.py`）。

実掲載を書き換えるため、安全のため段階的に：

```
# ① 初回は必ず「可視ブラウザ＋保存しない」で確認（入力結果をスクショ保存）
set HEADLESS=0
node scripts/kyujinbox_autoloop.js --company sq --apply --push --limit 3
#   → logs/reflect_<番号>_filled.png で反映内容を目視確認

# ② 問題なければ実際に保存（掲載更新）
node scripts/kyujinbox_autoloop.js --company sq --apply --push --push-save --limit 3

# ③ 無人運用（全社・保存まで）
node scripts/kyujinbox_autoloop.js --company all --apply --push --push-save
```

- `--push`：反映を有効化（既定はドライラン＝入力＋スクショのみ・**保存しない**）
- `--push-save`：実際に保存（掲載更新）する
- `HEADLESS=0`：ブラウザを表示（初回の目視確認用）
- 反映対象は「今回改善を適用し、求人番号が紐付いている求人」のみ。既存掲載を**その場で編集**するため、重複掲載は発生しません。

## 新規求人を実績で先回り最適化（学習ループ・--enrich）

既存の「応募0を直す（後追い）」だけでなく、**掲載中求人の応募実績から勝ちパターンを学習し、
新規掲載する求人（毎日の25件など）を投稿前に最適化**します。

学習する内容（`lib/insights.js`）:
- **職種別の応募状況**（どの職種・条件に応募が集まっているか）
- **応募につながっているタグ/キーワード**（応募あり群 vs なし群の出現率の差）
- **応募者の傾向**（年代・経験・前職）

これを踏まえ、新規求人のタイトル・キャッチ・本文・タグを実績に寄せて最適化します
（**事実＝職種・勤務地・給与レンジ・雇用形態は保持**）。

```
# 単体で実行（ブラウザ不要・API＋DBのみ・軽量）
#   直近1日に作成した未最適化の求人ボックス向け求人が対象
node scripts/kyujinbox_enrich_new.js --company all --apply --limit 25

# ドライラン（改善案の提示のみ）
node scripts/kyujinbox_enrich_new.js --company sq

# 対象日数を広げる（例: 直近3日）
node scripts/kyujinbox_enrich_new.js --company sq --apply --days 3
```

autoloop に **`--enrich`** を付けると、1コマンドで
「成績取得 → 既存の応募0改善 → 新規求人の実績反映」まで一気通貫で回せます:

```
node scripts/kyujinbox_autoloop.js --company all --apply --enrich
```

**運用フロー（毎日）**: ①seedで新規25件を作成 → ②`--enrich`で実績反映 → ③自動投稿。
これで、日々の新規求人が「前日までの応募実績」を踏まえた内容で掲載され続けます。

> enrich は**成績が溜まってから**効果が出ます（応募実績が無いうちはスキップ）。
> まず数日 autoloop で成績を溜め、応募が付き始めたら enrich が学習を反映し始めます。

## コスト目安（品質重視・Sonnet）

- 改善案の生成だけがAPI課金（成績取得・検知は無料）。1求人あたり約$0.02〜0.03。
- 1アカウント/日40件改善で約$0.8〜1.2、Batch(夜間一括)適用で約半額。
- 新規25件の enrich は1回で約$0.5〜0.65（Batchで約半額）。
- SQ＋Bigeyesの2アカウントでも、件数を絞れば月数千円規模で運用可能。
