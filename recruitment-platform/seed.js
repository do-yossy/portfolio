'use strict';

const { Jobs, Applicants, Applications } = require('./db');

const sampleJobs = [
  {
    title: '介護職員（正社員）東京・新宿',
    location: '東京都新宿区',
    salary: '月給22万円〜26万円',
    jobType: '介護・福祉',
    employmentType: '正社員',
    description: `◆仕事内容
特別養護老人ホームでの介護業務全般をお任せします。

【主な業務】
・日常生活の介護（食事・入浴・排泄介助）
・レクリエーションの企画・実施
・利用者様のご家族との連絡調整
・ケアプランの作成補助

◆職場環境
新宿駅から徒歩8分。明るくアットホームな職場です。
資格取得支援制度あり、未経験者歓迎。`,
    tags: ['未経験OK', '資格取得支援', '正社員', '駅近'],
    isPublished: true
  },
  {
    title: '介護職員（パート）大阪・梅田',
    location: '大阪府大阪市北区',
    salary: '時給1,200円〜1,400円',
    jobType: '介護・福祉',
    employmentType: 'パート・アルバイト',
    description: `◆仕事内容
デイサービスでの介護補助業務です。

【主な業務】
・利用者様の送迎補助
・食事・入浴介助
・レクリエーション補助

◆こんな方歓迎
週2〜OKの扶養内勤務も可能です。介護初心者の方も丁寧に研修します。`,
    tags: ['週2〜OK', '扶養内OK', '未経験歓迎', 'パート'],
    isPublished: true
  },
  {
    title: '営業職（法人営業）東京・渋谷',
    location: '東京都渋谷区',
    salary: '月給28万円〜45万円（インセンティブ別）',
    jobType: '営業',
    employmentType: '正社員',
    description: `◆仕事内容
IT関連サービスの法人向け新規・既存営業をお任せします。

【主な業務】
・新規顧客への提案営業（テレアポ〜クロージングまで）
・既存顧客のフォロー・アップセル
・営業資料作成・プレゼン

◆求める人物像
明るく積極的な方。営業経験1年以上歓迎（未経験でも熱意ある方歓迎）。`,
    tags: ['インセンティブあり', '営業経験歓迎', '土日祝休み', 'フレックス'],
    isPublished: true
  },
  {
    title: '営業職（個人向け）大阪・難波',
    location: '大阪府大阪市中央区',
    salary: '月給25万円〜40万円',
    jobType: '営業',
    employmentType: '正社員',
    description: `◆仕事内容
住宅リフォームの個人向け営業です。反響営業がメインなので飛び込み不要。

【特徴】
・完全反響型（問合せ対応から成約まで）
・専任アドバイザーが手厚くサポート
・月収40万円以上の実績者多数`,
    tags: ['反響営業', '飛び込みなし', '高収入可', '研修充実'],
    isPublished: true
  },
  {
    title: 'Webエンジニア（フロントエンド）東京・渋谷',
    location: '東京都渋谷区',
    salary: '月給35万円〜55万円',
    jobType: 'エンジニア',
    employmentType: '正社員',
    description: `◆仕事内容
自社SaaSプロダクトのフロントエンド開発をお任せします。

【技術スタック】
・React / TypeScript / Next.js
・GraphQL / REST API
・AWS / Docker

◆こんな環境
リモートワーク可（週3回〜）、フレックスタイム制。
エンジニアが働きやすい環境を整備しています。`,
    tags: ['リモートOK', 'React', 'TypeScript', 'フレックス'],
    isPublished: true
  },
  {
    title: 'Webエンジニア（バックエンド）大阪・本町',
    location: '大阪府大阪市中央区',
    salary: '月給32万円〜50万円',
    jobType: 'エンジニア',
    employmentType: '正社員',
    description: `◆仕事内容
EC・予約システムのバックエンド開発をご担当いただきます。

【技術スタック】
・Python（Django/FastAPI）/ Node.js
・PostgreSQL / Redis
・Docker / AWS

◆勤務環境
梅田より徒歩10分。服装自由、裁量労働制あり。`,
    tags: ['Python', 'Node.js', 'PostgreSQL', '服装自由'],
    isPublished: true
  },
  {
    title: '事務スタッフ（一般事務）東京・池袋',
    location: '東京都豊島区',
    salary: '時給1,300円〜1,600円',
    jobType: '事務・管理',
    employmentType: 'パート・アルバイト',
    description: `◆仕事内容
一般事務全般をお任せします。

【主な業務】
・データ入力・書類作成
・電話・メール対応
・来客対応

◆特徴
・残業ほぼなし（定時退社率90%以上）
・Excelスキルがあれば即戦力`,
    tags: ['残業少なめ', '定時退社', 'Excel使用', '駅近'],
    isPublished: true
  },
  {
    title: '事務スタッフ（経理補助）大阪・天王寺',
    location: '大阪府大阪市阿倍野区',
    salary: '月給20万円〜24万円',
    jobType: '事務・管理',
    employmentType: '正社員',
    description: `◆仕事内容
経理補助業務全般をお任せします。

【主な業務】
・伝票処理・仕訳
・請求書発行・管理
・月次決算補助

◆求める方
簿記3級以上、会計ソフト使用経験者歓迎。`,
    tags: ['簿記歓迎', '経理経験者', '土日祝休み', '賞与あり'],
    isPublished: true
  },
  {
    title: '看護師（外来・病棟）東京・品川',
    location: '東京都品川区',
    salary: '月給35万円〜42万円',
    jobType: '医療・看護',
    employmentType: '正社員',
    description: `◆仕事内容
総合病院での看護業務全般です。

【病棟】
・内科・外科・整形外科混合病棟
・2交代制または3交代制選択可

◆特徴
・看護師1人あたりの患者数が少ない
・最新医療機器完備、学習支援あり`,
    tags: ['看護師資格必須', '2交代OK', '院内研修充実', '駐車場あり'],
    isPublished: true
  },
  {
    title: '調理師・キッチンスタッフ 大阪・心斎橋',
    location: '大阪府大阪市中央区',
    salary: '月給23万円〜30万円',
    jobType: '飲食・サービス',
    employmentType: '正社員',
    description: `◆仕事内容
人気イタリアンレストランの調理業務です。

【業務内容】
・仕込み・調理全般
・盛り付け・プレート管理
・在庫管理

◆職場
心斎橋駅徒歩3分。オーナーシェフのもと本格的な技術が身につきます。`,
    tags: ['調理師資格歓迎', '本格イタリアン', '技術が身につく', '正社員登用'],
    isPublished: true
  }
];

const sampleApplicants = [
  { name: '山田 太郎', phone: '090-1111-2222', email: 'taro@example.com', age: 28, address: '東京都新宿区', sourceMedia: 'Indeed', status: '架電済' },
  { name: '鈴木 花子', phone: '080-3333-4444', email: 'hanako@example.com', age: 34, address: '大阪府大阪市', sourceMedia: '求人ボックス', status: '面談済' },
  { name: '田中 次郎', phone: '070-5555-6666', email: 'jiro@example.com', age: 22, address: '東京都渋谷区', sourceMedia: 'スタンバイ', status: '新規' },
  { name: '佐藤 三郎', phone: '090-7777-8888', email: 'saburo@example.com', age: 45, address: '大阪府堺市', sourceMedia: 'direct', status: '未対応' },
  { name: '高橋 美咲', phone: '080-9999-0000', email: 'misaki@example.com', age: 31, address: '東京都品川区', sourceMedia: 'Indeed', status: '新規' },
];

console.log('🌱 シードデータを投入します...');

let jobsInserted = 0;
for (const j of sampleJobs) {
  try {
    Jobs.create(j);
    jobsInserted++;
  } catch (e) {
    // Skip if duplicate key issue
    console.warn(`  スキップ: ${j.title}`);
  }
}
console.log(`  ✅ 求人: ${jobsInserted}件`);

let appInserted = 0;
for (const a of sampleApplicants) {
  try {
    Applicants.create(a);
    appInserted++;
  } catch (e) {
    console.warn(`  スキップ: ${a.name}`);
  }
}
console.log(`  ✅ 応募者: ${appInserted}件`);

console.log('\n✅ シード完了！');
console.log('   node server.js でサーバーを起動してください');
