// 法務ページ(特定商取引法の表記・利用規約・プライバシーポリシー)に載せる会社情報。
// 会社名・代表者・所在地は、会社の公式サイト(リポジトリ直下の index.html「会社概要」)から転記した。公開前にオーナーが確認すること。
// 空欄(''のまま)の項目があると、法務ページは公開されない(wrangler.toml の LEGAL_PUBLIC を "true" にしても404のまま)。
export const COMPANY = {
  sellerName: '株式会社Social Quality',
  representative: '安藤 嘉啓',
  address: '大阪府大阪市浪速区大国2丁目5-11-9F',
  contactUrl: 'https://www.social-quality.com/お問い合わせ.html', // お問い合わせフォーム(メールアドレスが決まったら contactEmail も足す)
  contactEmail: '', // 任意

  // ↓ オーナーが決めて記入する(推測で埋めない)
  phone: '', // 電話番号。載せない場合は「請求があれば遅滞なく開示します」等の書き方になる。要確認(専門家に相談を推奨)
  refundPolicy: '', // 返金の方針。例: 「デジタルコンテンツの性質上、お支払い済みの料金は返金しません」など
  retentionPeriod: '', // 契約情報の保管期間。例: 「解約から◯年」
  enactedDate: '', // 規約・ポリシーの制定日。例: 「2026年10月◯日」
  jurisdiction: '', // 管轄裁判所。例: 「大阪地方裁判所」(要確認)
};

// 公開に必須の項目(名前は、画面の【未記入】の表示にも使う)
export const REQUIRED = {
  sellerName: '会社名',
  representative: '運営責任者',
  address: '所在地',
  contactUrl: '問い合わせ窓口',
  phone: '電話番号の表示',
  refundPolicy: '返金の方針',
  retentionPeriod: '保管期間',
  enactedDate: '制定日',
  jurisdiction: '管轄裁判所',
};

export const legalMissing = (c = COMPANY) => Object.keys(REQUIRED).filter((k) => !String(c[k] ?? '').trim());
