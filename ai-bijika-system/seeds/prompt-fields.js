'use strict';
// プロンプト本文の【プレースホルダ】ごとの入力方法。購入者の打ち込みを最小限にするため、
// マイ商品・進捗からの自動入力（profile / auto）と選択式（select / multi / compose）を優先する。
// 同じプレースホルダが本文に複数回出てきて意味が異なる場合は配列で出現順に定義する。
// 定義の無いプレースホルダは短い自由入力になる。skip は見出し・AIへの出力指示なので置換しない。
const O = require('../lib/options');

const NONE_YET = 'なし（まだ決まっていない）';
const P = (key, label, fallback) => ({ kind: 'profile', key, label, fallback });
const productName = P('product_name', '商品名');
const target = P('target', 'ターゲット');
const pain = P('pain', '悩み');
const currentProduct = P('product_name', '今作っている商品（この案は除外されます）', NONE_YET);
const paste = (label, placeholder) => ({ kind: 'textarea', label, placeholder });
const SKIP = { kind: 'skip' };
const STUCK_REASONS = ['時間が取れない', '何をすればいいか分からない', 'AIの回答がしっくりこない', '自分の内容に自信が持てない', '作業量が多すぎる'];

module.exports = {
  0: {
    理想の1日の内容: {
      kind: 'compose', label: '理想の1日を書き出してみましょう（すでに叶ったつもりで）', parts: [
        { label: '朝：どこで目覚めていたい？', placeholder: '例：海外リゾートのヴィラで' },
        { label: '朝：誰といたい？', placeholder: '例：家族と' },
        { label: '朝：どんな朝のルーティンを送りたい？', placeholder: '例：お気に入りのコーヒーを飲みながら' },
        { label: '仕事：どんな仕事をしていたい？', placeholder: '例：オンラインで発信や講座をしている' },
        { label: '仕事：どこで働いていたい？', placeholder: '例：自宅のスタジオで、オンラインだから自由に' },
        { label: '仕事：お客様やお付き合いする人はどんな人？', placeholder: '例：人生を楽しみたいと願う人たち' },
        { label: 'プライベート・旅：休日はどう過ごしたい？', placeholder: '例：家族でのんびりドライブ' },
        { label: 'プライベート・旅：どこに行きたい？', placeholder: '例：好きな国・好きな場所へ' },
        { label: 'プライベート・旅：一番幸せを感じる瞬間は？', placeholder: '例：大切な人が楽しそうにしている時' },
        { label: '夜：夜はどう過ごしたい？', placeholder: '例：家族と話す、読書、好きなことをして過ごす' },
        { label: '夜：自分にどんな言葉をかけていたい？', placeholder: '例：今日も楽しかったね、よく頑張ったね' },
        { label: '夜：明日への気持ちは？', placeholder: '例：明日もきっと最高の一日になる' },
      ],
    },
  },
  1: { 理想の1日のストーリー: paste('理想の1日のストーリー', 'No.0でChatGPTが作ってくれたストーリーを貼り付け') },
  2: {
    自己紹介: {
      kind: 'compose', label: '自己紹介', parts: [
        { label: '年代', kind: 'select', options: ['10代', '20代', '30代', '40代', '50代', '60代以上'] },
        { label: '職業', kind: 'select', other: true, options: ['会社員（事務）', '会社員（営業）', '会社員（技術・IT）', '会社員（販売・サービス）', '医療・福祉', '教育', '公務員', '自営業・フリーランス', '主婦・主夫', '学生', 'パート・アルバイト'] },
        { label: '今の仕事の経験年数', kind: 'select', options: ['1年未満', '1〜3年', '3〜5年', '5〜10年', '10年以上'] },
        { label: '得意なこと・趣味', kind: 'text', placeholder: '例：料理、Excel、子育て（任意）' },
      ],
    },
  },
  3: { 経験を貼り付け: paste('経験', 'No.2でAIが整理してくれた経験リストを貼り付け') },
  4: {
    経験: paste('経験', 'No.3で整理した内容を貼り付け（いくつかでOK）'),
    今作っている商品: currentProduct,
  },
  5: {
    '3個の候補': {
      kind: 'compose', label: '商品候補（3つ）', parts: [
        { label: '候補1', kind: 'text', placeholder: 'No.4で出た案から選んで入力' },
        { label: '候補2', kind: 'text' },
        { label: '候補3', kind: 'text' },
      ],
    },
    今作っている商品: currentProduct,
    GATE10での再利用: SKIP,
  },
  6: {
    商品名: productName,
    '商品形式（何の形で提供するか）': P('product_format', '商品形式'),
    ターゲット: target,
    購入者が受け取るもの: { kind: 'multi', label: '購入者が受け取るもの', other: true, options: ['PDF・テキスト', '動画', 'テンプレートファイル', 'プロンプト集', '画像・イラスト素材', '個別サポート・添削'] },
    '商品の目的（学ぶ／使う／作業を代行される、等）': { kind: 'select', label: '商品の目的', options: ['学ぶ', '使う', '作業を代行される'] },
    '将来的な商品展開の予定（あれば）': { kind: 'select', label: '将来の展開', options: ['予定なし', 'シリーズ化したい', '上位商品を作りたい', '未定'] },
    タイプ定義: SKIP, 出力: SKIP,
  },
  7: { 商品名: productName },
  8: { 商品名: productName },
  9: { コンセプトを貼り付け: paste('商品コンセプト', 'No.8で作った設計、または自分で書いたコンセプトを貼り付け') },
  10: { 商品名: productName, ターゲット: target, 悩み: pain },
  11: { 商品名: productName, 章構成を貼り付け: paste('章構成', 'No.10で作った目次を貼り付け') },
  12: {
    商品名: productName,
    章番号: { kind: 'number', label: '章番号' },
    本文を貼り付け: paste('章の本文', 'レビューしたい章の本文を貼り付け'),
  },
  13: { 商品名: productName, 各章の要約を貼り付け: paste('各章の要約', '全章の要約を貼り付け') },
  14: {
    主題: { kind: 'text', label: '主題（何を描くか）', placeholder: '例：ノートパソコンで作業する女性' },
    'スタイル、例:フラットイラスト': { kind: 'select', label: 'スタイル', other: true, options: ['フラットイラスト', '水彩風イラスト', '写真風', '線画', '3Dイラスト', 'ミニマルなアイコン風'] },
    構図: { kind: 'select', label: '構図', other: true, options: ['中央に主題を1つ', '左右に並べて比較', '真上から見下ろす', '顔や手元のアップ', '背景を含む全体像'] },
    色: { kind: 'select', label: '色', other: true, options: ['明るいパステルカラー', '落ち着いたアースカラー', '白黒・モノトーン', '鮮やかなビビッドカラー', '青系で統一', '緑系で統一', 'ピンク系で統一'] },
  },
  15: { ターゲット: target },
  16: { スタンプ名: { kind: 'text', label: 'スタンプ名', placeholder: '例：ゆるねこの毎日あいさつ' }, ターゲット: target },
  17: { 商品名: productName, 販売価格: P('sale_price_label', '販売価格', '未定'), 決済方法: P('payment_method', 'お客様の決済方法', '未定') },
  18: { 商品名: productName, 原稿を貼り付け: paste('販売ページ原稿', 'No.17で作った原稿を貼り付け') },
  19: { 商品: productName, ターゲット: target },
  20: { 商品: productName, ターゲット: target, 悩み: pain },
  21: { 本文: paste('投稿文', '投稿する予定の文章を貼り付け') },
  22: { 本文: paste('変換したいコンテンツ', 'ブログ記事や投稿文を貼り付け') },
  23: { 商品: productName, 経路: P('channel', '集客経路') },
  24: {
    データ: {
      kind: 'compose', label: '数字（分かるものだけでOK）', parts: [
        { label: '期間', kind: 'select', options: ['直近1週間', '直近2週間', '直近1か月'] },
        { label: '投稿の閲覧数', kind: 'number', suffix: '回' },
        { label: '販売ページへのクリック数', kind: 'number', suffix: '回' },
        { label: '販売ページの閲覧数', kind: 'number', suffix: '回' },
        { label: '購入数', kind: 'number', suffix: '件' },
        { label: '売上', kind: 'number', suffix: '円' },
        { label: '気になること', kind: 'text', placeholder: '任意' },
      ],
    },
  },
  25: { 商品名: productName },
  26: {
    商品名: productName,
    作業一覧: { kind: 'multi', label: '繰り返している作業', other: true, options: ['SNS投稿の作成', '画像の作成', '問い合わせへの返信', '入金の確認', '商品の送付', '請求書・領収書の発行', '数字の集計', 'ブログ・noteの更新', '購入者へのフォロー連絡'] },
  },
  27: {
    日数: { kind: 'number', label: '開始から経過した日数', suffix: '日', auto: 'daysSinceStart' },
    DAY番号: { kind: 'number', label: 'チェックリスト上で進んでいるDAY', auto: 'maxDoneDay' },
    PHASE: { kind: 'select', label: '今のPHASE', options: O.PHASES, auto: 'currentPhase' },
    'TYPE、未判定なら「未判定」': P('product_type', '商品タイプ', '未判定'),
    完了リスト: { kind: 'auto', label: '完了したGATE', auto: 'completedGates' },
    '入力済みの内容を貼り付け、または「未入力」': { kind: 'textarea', label: '今日の記入内容（任意）', placeholder: '空欄なら「未入力」として送ります', fallback: '未入力' },
    あれば記入: { kind: 'select', label: '気になっていること', other: true, options: ['特になし', '時間が足りない', '何をすればいいか迷っている', 'AIの回答がしっくりこない', '自信が持てない'] },
    具体的な制作タスク: SKIP, Prompt番号: SKIP, シート名: SKIP, 具体的な条件: SKIP,
  },
  28: {
    現在の実日数: { kind: 'number', label: 'チェックリスト上で進んでいるDAY', auto: 'maxDoneDay' },
    本来いるべき日数: { kind: 'number', label: '予定ではいるはずのDAY（開始からの経過日数）', auto: 'daysSinceStart' },
    完了リスト: { kind: 'auto', label: '完了したGATE', auto: 'completedGates' },
  },
  29: {
    '工程名／GATE番号': { kind: 'select', label: '止まっている工程', options: O.GATE_NAMES, auto: 'nextGateName' },
    試したこと: { kind: 'text', label: '試したこと', placeholder: '例：No.4を2回使ったが候補が決まらない' },
    '自分なりの理由、分からなければ「不明」': { kind: 'select', label: '止まっている理由', other: true, options: ['不明', ...STUCK_REASONS] },
  },
  30: {
    状況: SKIP, 原因分類: SKIP, '原因別・使う資産': SKIP, 出力: SKIP,
    PHASE: { kind: 'select', label: '今のPHASE', options: O.PHASES, auto: 'currentPhase' },
    DAY: [
      { kind: 'number', label: 'チェックリスト上で進んでいるDAY', auto: 'maxDoneDay' },
      { kind: 'number', label: '本来の予定日（開始からの経過日数）', auto: 'daysSinceStart' },
    ],
    '◯日遅れ、または◯週間停滞': { kind: 'select', label: '遅れの程度', options: ['3〜6日遅れ', '7日以上遅れ', '同じ工程で1週間停滞', '同じ工程で2週間以上停滞'] },
    成果物名: { kind: 'text', label: '最後に完了した成果物', placeholder: '例：商品コンセプト1文' },
    工程名: { kind: 'select', label: '止まっている工程', options: O.GATE_NAMES, auto: 'nextGateName' },
    自由記述: [
      { kind: 'select', label: '困っていること', other: true, options: ['時間がない', '何をすればいいか分からない', 'AIから良い回答が出ない', '成果物を作れない', '商品選びに迷っている', '販売ページやSNSで止まっている', '数字が悪くて止まっている', '技術的な操作で止まっている', '複数の作業を同時に進めて混乱している'] },
      { kind: 'text', label: 'これまでに試したこと', placeholder: '任意', fallback: '特になし' },
    ],
    '分/時間': { kind: 'select', label: '今日使える時間', options: ['15分', '30分', '1時間', '2時間', '3時間以上'] },
  },
};
