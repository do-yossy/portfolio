'use strict';
// 選択式入力の選択肢（マイ商品・プロンプト入力で共通利用）
module.exports = {
  PRODUCT_FORMATS: ['PDF教材・マニュアル', 'テンプレート（Excel・Notion・Canva等）', '動画講座', 'AIプロンプト集', 'LINEスタンプ', '画像・イラスト素材', 'チェックリスト・ワークシート', '個別サポート付き講座'],
  PRODUCT_TYPES: ['未判定', 'TYPE A 知識・ノウハウ型', 'TYPE B テンプレート・素材型', 'TYPE C 講座・カリキュラム型', 'TYPE D AI・自動化・ツール活用型', 'TYPE A＋E（シリーズ展開前提）', 'TYPE B＋E（シリーズ展開前提）', 'TYPE C＋E（シリーズ展開前提）', 'TYPE D＋E（シリーズ展開前提）'],
  TARGETS: ['子育て中の親', '働く女性', '会社員（20〜30代）', '会社員（40〜50代）', '主婦・主夫', '学生', 'シニア世代', '個人事業主・フリーランス', '小さなお店の経営者', '副業を始めたい人', '転職・キャリアに悩む人', '趣味を深めたい人'],
  CHANNELS: ['Instagram', 'X（旧Twitter）', 'Threads', 'TikTok', 'YouTube', 'ブログ', 'note', 'LINE公式アカウント', '知人の紹介'],
  PRICE_BANDS: ['無料（リスト集め）', '〜1,000円', '1,000〜3,000円', '3,000〜10,000円', '10,000〜30,000円', '30,000円以上', '未定'],
  PAYMENT_METHODS: ['銀行振込', 'クレジットカード（Stripe等の決済サービス）', 'PayPal', '販売プラットフォームの決済（note・Brain・BASE・STORES等）', 'その他', '未定'],
  ACCOUNT_TYPES: ['普通', '当座', '貯蓄'],
  BANKS: ['ゆうちょ銀行', '三菱UFJ銀行', '三井住友銀行', 'みずほ銀行', 'りそな銀行', '楽天銀行', 'PayPay銀行', '住信SBIネット銀行', 'ソニー銀行', 'auじぶん銀行', 'GMOあおぞらネット銀行'],
  GATE_NAMES: ['GATE1 商品選定', 'GATE2 市場検証', 'GATE3 商品コンセプト', 'GATE4 商品構成', 'GATE5 商品完成', 'GATE6 販売ページ', 'GATE7 販売導線', 'GATE8 SNS・販売', 'GATE9 KPI・改善', 'GATE10 商品2'],
  PHASES: ['PHASE0（準備）', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'PHASE5', 'PHASE6', 'PHASE7', 'PHASE8'],
};
