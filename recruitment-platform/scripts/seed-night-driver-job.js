#!/usr/bin/env node
'use strict';
/**
 * 夜勤配送ドライバー（倉庫業務あり）求人（配送ドライバー・自社サイト用）登録スクリプト
 * 夜勤専属・高収入
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-night-driver-job.js
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

const TITLE_PREFIX = '夜勤配送ドライバー';

const JOB = {
  title: '夜勤配送ドライバー（倉庫業務あり）／＜月給40万円〜44万円＞夜勤専属で高収入・未経験歓迎・完全週休2日制★',
  location: '大阪府大阪市北区茶屋町',
  locations: ["兵庫県尼崎市潮江","兵庫県神戸市東灘区深江北町","京都府京都市伏見区桃山筒井伊賀西町","大阪府大阪市淀川区十三東","大阪府池田市石橋","大阪府茨木市永代町","大阪府高槻市城北町","大阪府守口市大日町","大阪府大阪市城東区古市","大阪府大阪市城東区鴫野西","大阪府東大阪市川俣","大阪府八尾市龍華町","大阪府大阪市東淀川区東淡路","大阪府大阪市北区芝田","大阪府大阪市中央区難波","大阪府堺市北区中百舌鳥町","大阪府堺市堺区戎島町","大阪府堺市西区津久野町","東京都豊島区南池袋","東京都新宿区新宿","東京都千代田区有楽町","東京都墨田区横綱","東京都荒川区南千住"],
  salary: '月給400,000円〜440,000円',
  jobType: '配送ドライバー',
  employmentType: '正社員',
  catchcopy: `夜勤専属×高収入！倉庫管理から配送までお任せ
月給40万円〜44万円／深夜手当・家族手当あり
車両・ガソリン・保険・メンテ費用はすべて会社負担
固定ルート中心で未経験でも安心スタート
完全週休2日制・年間休日120日`,
  description: `【お仕事内容】
事業拡大および物流体制強化に伴い、新たな仲間を募集しています。

現在、多くのお取引先様からご依頼をいただいており、今後さらなる事業成長を見据えて組織体制の強化を進めています。

倉庫内での商品管理や積み込み作業、取引先への配送業務を担当していただくお仕事です。

配送に使用する車両やガソリン代、保険、メンテナンス費用はすべて会社負担。

固定ルート中心のため、未経験の方でも安心してスタートできます。

■主な業務内容
＜倉庫業務＞
・商品の入出庫管理
・仕分け作業
・在庫確認
・出荷準備
・配送商品の積み込み

＜配送業務＞
・取引先への商品の配送
・配送ルートに沿った納品
・配送伝票の確認
・配送完了報告

＜その他業務＞
・車両の日常点検
・簡単な清掃業務
・配送記録の入力

■取扱商品例
・日用品
・雑貨類
・美容関連商品
・小型機器
・各種物流商品

■アピールポイント
・夜勤専属で高収入
・未経験歓迎
・固定ルート中心
・普通免許で応募可能
・車両費用完全会社負担
・研修制度充実
・安定した仕事量
・長距離運転少なめ
・配送未経験スタート多数活躍中

【給与内訳】
昇給・賞与あり（前年度実績あり）
※昇給年1回
※賞与年2回

通勤手当支給
家族手当
深夜手当

【シフト・勤務時間】
22:00〜7:00
実働8時間（休憩1時間）
シフト制

【休日・休暇】
完全週休二日制
年間休日120日
年次有給休暇
長期休暇
夏季休暇
産休・育休制度
介護休暇

【応募資格】
・普通自動車運転免許（AT限定可）
・運転経験3年以上の方
・未経験歓迎
・学歴不問

■こんな方歓迎
・運転が好きな方
・安定した働き方をしたい方
・美容業界に興味がある方
・人と接することが苦にならない方

【待遇・福利厚生】
■社会保険完備
■交通費支給
■賞与年2回（業績に応じて）
■深夜手当
■家族手当
■定期健康診断
■有給休暇制度あり
■育児・介護休業制度あり

【入社後の流れ】
1週目：社内ルール・安全研修・設備説明
2〜4週目：先輩スタッフによるOJT
5週目以降：担当ルートを独立して担当開始

【勤務地】
大阪府大阪市北区茶屋町
転勤なし
国内出張の可能性はありません
屋内原則禁煙（喫煙専用室あり）

【アクセス】
◆阪急「大阪梅田駅」茶屋町口より徒歩5分
◆Osaka Metro御堂筋線「梅田駅」徒歩7分
◆JR「大阪駅」徒歩10分
職場までのアクセスが良好で、通勤しやすい環境が整っています。
車・バイク通勤OK

【勤務期間】
長期`,
  tags: [
    '夜勤専属で高収入',
    '未経験歓迎',
    '固定ルート中心',
    '普通免許OK（AT限定可）',
    '車両費用会社負担',
    '研修制度充実',
    '完全週休2日制',
    '年間休日120日',
    '長距離運転少なめ',
    '車・バイク通勤OK',
  ],
  faq: [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。普通自動車免許（AT限定可・運転経験3年以上）があれば応募可能です。固定ルート中心で研修制度も充実しているため、配送未経験からスタートした方も多数活躍しています。',
    },
    {
      q: '車両や経費の自己負担はありますか？',
      a: 'ありません。配送に使用する車両・ガソリン代・保険・メンテナンス費用はすべて会社負担です。',
    },
    {
      q: '勤務時間を教えてください。',
      a: '22:00〜7:00の夜勤専属で、実働8時間（休憩1時間）のシフト制です。深夜手当があるため、高収入を実現できます。',
    },
    {
      q: '長距離の配送はありますか？',
      a: '長距離運転は少なめで、固定ルート中心の配送です。無理なく働ける環境です。',
    },
    {
      q: 'どのような商品を運びますか？',
      a: '日用品・雑貨類・美容関連商品・小型機器など各種物流商品です。美容業界に興味がある方も歓迎します。',
    },
  ],
};

async function main() {
  console.log('\n🚀 夜勤配送ドライバー求人の登録/更新を開始します...\n');

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
      isPublished:    true,                 // 未公開（プレビュー確認後に公開）
      targetMedia:    ['自社サイト'],
      company:        'sq',
    });
    console.log(`✅ 登録完了: ${JOB.title}`);
  }

  console.log(`\n📋 プレビューURL: http://localhost:3000/preview/jobs/${job.id}`);
  console.log('   求人一覧: http://localhost:3000/preview/jobs');
}

main().catch(e => { console.error('❌ エラー:', e.message); process.exit(1); });
