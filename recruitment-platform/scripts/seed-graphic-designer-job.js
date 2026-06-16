#!/usr/bin/env node
'use strict';
/**
 * グラフィックデザイナー求人（IT・自社サイト用）登録スクリプト
 * 東京都新宿区
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-graphic-designer-job.js
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

const TITLE_PREFIX = 'グラフィックデザイナー';

const JOB = {
  title: 'グラフィックデザイナー（AD兼務）／＜月給30万円〜37万円＞完全週休2日制（土日）・年間休日120日以上・転勤なし★',
  location: '東京都新宿区',
  locations: ["東京都昭島市田中町","東京都立川市柴崎町","東京都府中本町","東京都武蔵野市","東京都杉並区","東京都中野区中野","東京都世田谷区松原","東京都目黒区上目黒","東京都渋谷区","東京都新宿区","東京都豊島区南池袋","東京都千代田区飯田橋","東京都北区","東京都板橋区成増"],
  salary: '月給300,000円〜370,000円',
  jobType: 'IT',
  employmentType: '正社員',
  catchcopy: `アートディレクション×グラフィックデザインのプロへ！
月給30万円〜37万円／想定年収450万円〜600万円
完全週休2日制（土日）・年間休日120日以上
新宿駅 徒歩圏内・転勤なし
直案件多数・多彩な業界のデザインに携われる`,
  description: `【お仕事内容】
チラシ・カタログ・パンフレット・パッケージ・その他広告全般のグラフィックデザインと、それに伴う企画・制作をお任せします。

営業担当やディレクターからの依頼案件にデザインで応えるのがミッションです。

自身で企画・デザイン制作することがメインですが、チームや協力会社と共に制作を仕上げることもあるため、アートディレクションを担当する場合もあります。

クライアントは、代理店を介さず直接広告主からの依頼がほとんどで、学校・金融・不動産・IT・医療・旅行・人材業界など多方面にわたります。

自社開発サービスのロゴやパッケージデザインをお任せする場合もあります。

■主な業務内容
・広告全般のグラフィックデザイン制作
・企画立案・デザインコンセプト設計
・アートディレクション（協力会社・チームの進行管理）
・自社サービスのロゴ・パッケージデザイン

■デザインツール
・Illustrator
・Photoshop
・Figma

■制作環境
・Mac

■アピールポイント
・直案件中心でクライアントと近い距離で仕事ができる
・企画から制作まで一貫して担当できる
・多彩な業界のデザインに携われる
・完全週休2日制（土日）
・年間休日120日以上
・転勤なし

【給与内訳】
※経験・スキルにより優遇
※昇給年1回
※賞与年2回

＜想定年収＞
450万円〜600万円

残業手当
役職手当
技術手当
交通費支給

【シフト・勤務時間】
9:00〜18:00（実働8時間／休憩1時間）
■時差出勤制度あり（出勤時間を柔軟に調整可能）

平均残業：月20時間程度
※無理な長時間勤務はありません

【休日・休暇】
完全週休二日制（土日）
祝日
年間休日120日以上
夏季休暇
年末年始休暇
年次有給休暇
慶弔休暇
産休・育休制度
介護休暇

【応募資格】
■必須条件
・グラフィックデザインの実務経験がある方

■歓迎条件
・アートディレクション経験がある方
・企画からのデザイン制作経験がある方
・Webデザインの経験がある方
・後輩・部下の教育経験がある方

■こんな方に向いています
・クライアント目線で課題を見つけ、解決できる企画を作れる方
・デザインへの興味が強く、学習意欲が高い方
・案件の企画から制作まで責任を持って進められる方

【待遇・福利厚生】
■感染症対策
・ソーシャルディスタンス確保
・換気徹底
・マスク着用
・アルコール消毒
■社会保険完備
■昇給・賞与あり（賞与年2回）
■資格取得支援制度
■残業手当
■時差出勤制度
■服装自由
■有給休暇・特別休暇制度
■交通費支給
■定期健康診断
■育児・介護休業制度

【入社後の流れ】
1週目：社内ルール・業務フロー・制作環境の説明
2〜4週目：先輩デザイナーによるOJT
5週目以降：担当案件を独立して担当開始

【勤務地】
東京都新宿区
転勤なし
屋内原則禁煙

【アクセス】
◆JR・私鉄・地下鉄各線「新宿駅」より徒歩圏内
職場までのアクセスが良好で、通勤しやすい環境が整っています。

【勤務期間】
長期`,
  tags: [
    'グラフィックデザイナー',
    'アートディレクション',
    '完全週休2日制（土日）',
    '年間休日120日以上',
    '転勤なし',
    '新宿駅徒歩圏内',
    '賞与年2回',
    '昇給年1回',
    '時差出勤制度あり',
    '服装自由',
  ],
  faq: [
    {
      q: '応募に必要なスキルはありますか？',
      a: 'グラフィックデザインの実務経験が必須です。アートディレクションや企画からの制作経験、Webデザイン経験があれば歓迎します。使用ツールはIllustrator・Photoshop・Figmaで、制作環境はMacです。',
    },
    {
      q: '残業はどのくらいありますか？',
      a: '平均残業は月20時間程度です。時差出勤制度もあるため、柔軟な働き方が可能です。',
    },
    {
      q: '土日は必ず休めますか？',
      a: 'はい、完全週休二日制（土日）です。祝日も休みで、年間休日は120日以上あります。',
    },
    {
      q: 'どのような案件を担当しますか？',
      a: '代理店を介さない直案件が中心です。学校・金融・不動産・IT・医療・旅行・人材業界など多方面のクライアントのチラシ・カタログ・パンフレット・パッケージなどを担当します。',
    },
    {
      q: '企画から関わることはできますか？',
      a: 'はい。自身で企画・デザイン制作することがメインのポジションです。案件によってはアートディレクションとしてチームや協力会社の進行管理もお任せします。',
    },
  ],
};

async function main() {
  console.log('\n🚀 グラフィックデザイナー求人の登録/更新を開始します...\n');

  const existing = (await Jobs.findAll()).find(j => j.title.startsWith(TITLE_PREFIX) && (j.target_media || '').includes('自社サイト'));

  let job;
  if (existing) {
    job = await Jobs.update(existing.id, {
      title:          JOB.title,
      location:       JOB.location,
      locations: JOB.locations,
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
      locations: JOB.locations,
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
