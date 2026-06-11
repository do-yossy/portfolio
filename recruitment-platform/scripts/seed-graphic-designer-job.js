#!/usr/bin/env node
'use strict';
/**
 * グラフィックデザイナー（AD兼務）求人（IT・自社サイト用）登録スクリプト
 * 東京都新宿区
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-graphic-designer-dm-solutions.js
 *
 * ※ 同タイトル（先頭一致）の求人が既にある場合は内容を更新します
 * ※ 掲載先=自社サイト・未公開で登録します（/preview/jobs で確認後に公開してください）
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs } = require('../db-factory');

const TITLE_PREFIX = 'グラフィックデザイナー（AD兼務）';

const JOB = {
  title: 'グラフィックデザイナー（AD兼務）／＜月給30万円〜36.7万円＞年間休日127日・完全週休2日制（土日）・転勤なし★',
  location: '東京都新宿区',
  salary: '月給300,000円〜367,000円（固定残業代含む）',
  jobType: 'IT',
  employmentType: '正社員',
  catchcopy: `アートディレクション×グラフィックデザインのプロへ！
月給30万円〜36.7万円／初年度年収450万円〜600万円
完全週休2日制（土日）・年間休日127日
新宿駅 徒歩圏内・転勤なし
直案件多数・多彩な業界に携われる`,
  description: `【お仕事内容】
アートディレクション・グラフィックデザイン（チラシ・カタログ・パンフレット・パッケージ・その他広告全般）に伴う企画・制作をお任せします。

営業担当やディレクターからの依頼案件にデザインで応えるのがミッションです。
自身で企画・デザイン制作することがメインですが、チームや協力会社と共に制作を仕上げることもあるため、ディレクションを担当する場合もあります。

クライアント先は、代理店を介さず直接広告主からの依頼がほとんどで、学校（大学・高校・専門学校）、金融、不動産、IT、医療、旅行、人材業界など多方面にわたります。

また、自社開発のサービスもあるため、ロゴやパッケージデザインもお任せする場合があります。

■自社サービス
DM印刷発送サービス・物流アウトソーシング・通販専門店・D2Cブランドなど、複数の自社開発サービスを展開しています。

■デザインツール
・Illustrator
・Photoshop
・Figma

■制作環境
・Mac

【給与内訳】
月給 300,000円〜367,000円
※経験や能力に応じて決定いたします。
※上記金額には固定残業代（58,000円〜71,000円、30時間相当分）を含みます。
※固定残業時間超過分は、別途追加支給いたします。

＜初年度想定年収＞
450万円〜600万円

交通費支給（上限5万円/月）
役職手当
技術手当
残業手当

【シフト・勤務時間】
9:00〜18:00
■時差出勤制度あり（8時〜11時で30分単位で出勤時間を指定可能）
月平均残業 18.2時間

【休日・休暇】
完全週休2日制（土曜・日曜）
祝日
年間休日127日
夏季休暇
年末年始休暇
有給休暇（入社後4ヶ月〜半年で10日間付与）
慶弔休暇
特別休暇
バースデー休暇（勤続1年以上の社員対象）
産前産後休暇
育児休暇（取得率：男性70%、女性100%／復職率：男性100%、女性約90%）
介護休暇

【応募資格】
＜必須要件＞
・アートディレクション経験がある方
・企画からのグラフィックデザインおよびWebデザイン経験がある方

＜歓迎要件＞
・後輩・部下の教育経験がある方

＜求める人物像＞
・ディレクション力が高い方
・クライアント目線で課題抽出をし、課題解決できる企画案を作れる方
・デザインに対して強い興味があり、学習意欲が高い方
・案件の企画・進行管理から制作まで全て責任を持って進められる方

【待遇・福利厚生】
■社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
■昇給年1回（5月）
■賞与年2回（6月・12月／昨年度実績3ヶ月分）
■定年65歳
■退職金制度
■カムバック制度（アルムナイ制度）
■社内公募制度
■社員持株会制度
■社員紹介制度（紹介者・入社者にそれぞれ5万円ずつ支給）
■時差出勤制度
■慶弔見舞金制度
■部活支援制度（フットサル・バドミントン・ゴルフなど）
■資格取得支援制度（受験費用会社負担／報奨金最大10万円あり）
■引越支援制度（一定基準クリアで限度額30万円までを支援）
■服装自由（部署による）
■ウォーターサーバーあり
■団体定期保険制度（会社負担）
■社割あり（日用品・アパレル用品など）

【入社後の流れ】
3ヶ月間の試用期間あり（待遇・給与に変更はありません）
社内ルール・業務フロー説明後、先輩メンバーによるOJTでキャッチアップ

【勤務地】
東京都新宿区
転居を伴う転勤はありません

【アクセス】
◆JR・私鉄・地下鉄各線「新宿駅」より徒歩圏内
職場までのアクセスが良好で、通勤しやすい環境が整っています。

【勤務期間】
長期（定年65歳）`,
  tags: [
    'グラフィックデザイナー',
    'アートディレクター',
    '年間休日127日',
    '完全週休2日制（土日）',
    '転勤なし',
    '新宿駅徒歩圏内',
    '賞与年2回',
    '時差出勤制度あり',
    '資格取得支援',
    '退職金制度あり',
  ],
  faq: [
    {
      q: '必須スキルは何ですか？',
      a: 'アートディレクション経験と、企画からのグラフィックデザインおよびWebデザイン経験の両方が必須です。使用ツールはIllustrator・Photoshop・Figmaで、制作環境はMacです。',
    },
    {
      q: '残業はどのくらいありますか？',
      a: '月平均18.2時間です。時差出勤制度（8時〜11時で30分単位）もあるため、柔軟な働き方が可能です。固定残業代（30時間相当分）を超えた場合は別途追加支給されます。',
    },
    {
      q: '休日はどのくらいありますか？',
      a: '年間休日127日です。完全週休2日制（土日）・祝日のほか、バースデー休暇や有給休暇（入社後4〜6ヶ月で10日間付与）など充実した休暇制度があります。',
    },
    {
      q: 'どのような案件を担当しますか？',
      a: '代理店を介さず直接広告主からの依頼が中心です。学校・金融・不動産・IT・医療・旅行・人材業界など多方面のクライアントを担当します。自社サービスのロゴやパッケージデザインをお任せする場合もあります。',
    },
    {
      q: 'キャリアアップの機会はありますか？',
      a: '社内公募制度があり、希望するポジションにチャレンジできます。資格取得支援制度（受験費用会社負担・報奨金最大10万円）もあり、スキルアップを会社が支援します。',
    },
  ],
};

async function main() {
  console.log('\n🚀 グラフィックデザイナー（AD兼務）求人の登録/更新を開始します...\n');

  const existing = (await Jobs.findAll()).find(j => j.title.startsWith(TITLE_PREFIX) && (j.target_media || '').includes('自社サイト'));

  let job;
  if (existing) {
    job = await Jobs.update(existing.id, {
      title:          JOB.title,
      location:       JOB.location,
      salary:         JOB.salary,
      jobType:        JOB.jobType,
      employmentType: JOB.employmentType,
      description:    JOB.description,
      tags:           JOB.tags,
      catchcopy:      JOB.catchcopy,
      faq:            JOB.faq,
    });
    console.log(`🔄 既存求人を更新しました: ${JOB.title}`);
  } else {
    job = await Jobs.create({
      title:          JOB.title,
      location:       JOB.location,
      salary:         JOB.salary,
      jobType:        JOB.jobType,
      employmentType: JOB.employmentType,
      description:    JOB.description,
      tags:           JOB.tags,
      catchcopy:      JOB.catchcopy,
      imageUrl:       '',
      faq:            JOB.faq,
      isPublished:    false,                 // 未公開（プレビュー確認後に公開）
      targetMedia:    ['自社サイト'],
      company:        'sq',
    });
    console.log(`✅ 登録完了: ${JOB.title}`);
  }

  console.log(`\n📋 プレビューURL: http://localhost:3000/preview/jobs/${job.id}`);
  console.log('   求人一覧: http://localhost:3000/preview/jobs');
}

main().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
