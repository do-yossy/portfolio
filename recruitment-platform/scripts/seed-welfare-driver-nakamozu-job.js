#!/usr/bin/env node
'use strict';
/**
 * 福祉施設送迎ドライバー求人（送迎ドライバー・自社サイト用）登録スクリプト
 * 大阪府堺市北区中百舌鳥町
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-welfare-driver-nakamozu-job.js
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

const TITLE_PREFIX = '福祉施設送迎ドライバー';

const JOB = {
  title: '福祉施設送迎ドライバー／＜月給39万円〜44万円＞固定ルート中心・未経験歓迎・日勤シフト・完全週休2日制（シフト制）★',
  location: '大阪府堺市北区中百舌鳥町',
  salary: '月給390,000円〜440,000円',
  jobType: '送迎ドライバー',
  employmentType: '正社員',
  catchcopy: `福祉施設の送迎を支える、やりがいのあるドライバー職！
月給39万円〜44万円／昇給年1回・賞与年2回
固定ルート中心で土地勘がなくても安心
未経験歓迎♪同乗研修あり
日勤シフト・完全週休2日制（シフト制）`,
  description: `【お仕事内容】
福祉サービスをご利用される方の移動を支える送迎ドライバーを募集しています。

利用者様の自宅と施設の間を安全に送迎することを中心とした仕事です。

決まったルートでの運行が基本となるため、未経験の方でも業務を覚えやすく、安定した働き方が可能です。

■主な業務内容
・利用者様の送迎（自宅と施設間）
・乗降時の補助対応
・固定ルートでの送迎運行
・車両の点検および清掃
・送迎スケジュールの確認と調整
・施設スタッフとの情報共有

■業務の特徴
◎固定ルートで覚えやすい
運行ルートが固定されているため、土地勘がなくても徐々に慣れていける業務です。

◎体力的な負担が少なめ
長距離運転はなく、待機時間や休憩時間も確保されています。時間管理も一定のため生活リズムが安定しやすい環境です。

◎利用者様との関わり
日常的な挨拶や安全確認が中心で、特別な介護資格は不要です。

■アピールポイント
・月給39万円〜44万円
・固定ルート中心で未経験でも安心
・日勤シフト
・完全週休2日制（シフト制）
・同乗研修あり
・待機時間が多く体力的な負担が少なめ
・車通勤可能

【給与内訳】
※経験・能力を考慮のうえ決定
昇給年1回
賞与年2回（6月・12月）
家族手当（実績・状況に応じて支給）
皆勤手当（実績・状況に応じて支給）
深夜手当（実績・状況に応じて支給）
交通費支給

【シフト・勤務時間】
5:00〜20:00の間で実働8時間のシフト制（休憩1時間）

無理のない運行スケジュールを組んでおり、安全確保のため適宜小休憩も可能です。

【休日・休暇】
完全週休2日制（シフト制）
※シフトは毎月15日までに提出

有給休暇あり
長期休暇取得相談可

【応募資格】
普通自動車運転免許（取得後3年以上）
※経験不問

■こんな方歓迎
・安全運転を意識できる方
・人との基本的なコミュニケーションが取れる方
・安定した環境でじっくり働きたい方
・福祉・医療分野に興味のある方

【待遇・福利厚生】
■社会保険完備
■昇給年1回・賞与年2回
■退職金制度あり
■交通費支給
■資格取得手当
■雇用延長制度あり
■車通勤可能

【入社後の流れ】
入社後は同乗研修を実施し、ルート確認や安全運転のポイントを実務を通して習得します。
段階的に業務を覚えていくため、ドライバー経験がない方でも安心してスタートできます。

【勤務地】
大阪府堺市北区中百舌鳥町
転勤なし
国内出張の可能性はありません

【アクセス】
◆Osaka Metro御堂筋線「なかもず駅」より徒歩圏内
◆南海高野線「中百舌鳥駅」より徒歩圏内
車通勤可能

【勤務期間】
長期`,
  tags: [
    '月給39万円〜44万円',
    '固定ルート中心',
    '未経験歓迎',
    '日勤シフト',
    '完全週休2日制（シフト制）',
    '賞与年2回',
    '退職金制度あり',
    '車通勤可能',
    '同乗研修あり',
    'なかもず駅徒歩圏内',
  ],
  faq: [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。普通自動車免許（取得後3年以上）があれば応募可能です。入社後は同乗研修を実施し、ルート確認や安全運転のポイントを丁寧にサポートします。',
    },
    {
      q: '固定ルートとはどういう意味ですか？',
      a: '毎日同じエリア・同じ利用者様を担当するルートでの運行が基本です。土地勘がなくても徐々に慣れていけるため、未経験の方も覚えやすい環境です。',
    },
    {
      q: '介護の資格や経験は必要ですか？',
      a: '不要です。業務は送迎と乗降時の補助が中心で、特別な介護資格は必要ありません。利用者様との関わりは日常的な挨拶や安全確認が中心です。',
    },
    {
      q: 'シフトはどのように決まりますか？',
      a: '毎月15日までに翌月のシフトを提出いただきます。5:00〜20:00の間で実働8時間のシフトとなります。プライベートの予定も調整しやすい環境です。',
    },
    {
      q: '体力的にきつくないですか？',
      a: '待機時間が多く、体力的な負担は少なめです。長距離運転はなく、無理のない配車計画で休憩時間もしっかり確保されています。',
    },
    {
      q: '車通勤はできますか？',
      a: 'はい、車通勤可能です。交通費も支給されます。',
    },
  ],
};

async function main() {
  console.log('\n🚀 福祉施設送迎ドライバー求人の登録/更新を開始します...\n');

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
      isPublished:    false,
      targetMedia:    ['自社サイト'],
      company:        'sq',
    });
    console.log(`✅ 登録完了: ${JOB.title}`);
  }

  console.log(`\n📋 プレビューURL: http://localhost:3000/preview/jobs/${job.id}`);
  console.log('   求人一覧: http://localhost:3000/preview/jobs');
}

main().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
