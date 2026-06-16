#!/usr/bin/env node
'use strict';
/**
 * ロケ同行ドライバー求人（送迎ドライバー・自社サイト用）登録スクリプト
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-loke-driver-job.js
 *
 * ※ 同タイトルの求人が既にある場合はスキップします
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

const JOB = {
  title: 'ロケ同行ドライバー／＜月給39万円〜45万円＞未経験歓迎・完全週休2日制・年間休日120日以上★',
  location: '大阪府大阪市北区茶屋町',
  locations: ["兵庫県尼崎市潮江","兵庫県神戸市東灘区深江北町","京都府京都市伏見区桃山筒井伊賀西町","大阪府大阪市淀川区十三東","大阪府池田市石橋","大阪府茨木市永代町","大阪府高槻市城北町","大阪府守口市大日町","大阪府大阪市城東区古市","大阪府大阪市城東区鴫野西","大阪府東大阪市川俣","大阪府八尾市龍華町","大阪府大阪市東淀川区東淡路","大阪府大阪市北区芝田","大阪府大阪市中央区難波","大阪府堺市北区中百舌鳥町","大阪府堺市堺区戎島町","大阪府堺市西区津久野町","東京都豊島区南池袋","東京都新宿区新宿","東京都千代田区有楽町","東京都墨田区横綱","東京都荒川区南千住"],
  salary: '月給39万円〜45万円',
  jobType: '送迎ドライバー',
  employmentType: '正社員',
  catchcopy: `ロケ現場を支える「ロケ同行ドライバー」大募集！
月給39万円〜45万円／想定年収550万円〜600万円
未経験歓迎♪研修制度あり
完全週休2日制・年間休日120日以上
映像・SNS・エンタメ業界に興味がある方歓迎！`,
  description: `【お仕事内容】
テレビ・広告・SNS・YouTubeなどの撮影現場に同行し、スタッフや出演者の送迎、機材運搬を担当する「ロケ同行ドライバー」のお仕事です。

撮影スケジュールに合わせて現場移動をサポートし、円滑なロケ進行を支えていただきます。
運転だけでなく、簡単な現場サポートも行うため、チームで働くことが好きな方に向いています。

■主な業務
・撮影スタッフ・出演者の送迎
（事務所・駅・空港・ロケ地など）
・撮影機材や備品の積み込み・運搬
・ロケ現場での簡単なサポート業務
・車両管理
（洗車・清掃・日常点検・給油）
・送迎スケジュールの確認・調整

※長距離運転は多くありません
※待機時間あり
※撮影内容に関する守秘義務があります

■アピールポイント
■ 月給35万円以上の安定収入
業界水準より少し高めの給与設定で、安定して働けます。

■ 未経験歓迎
ドライバー経験がなくても、研修制度があるため安心してスタート可能です。

■ ロケ現場に関われる仕事
映像・SNS・エンタメ業界に興味がある方歓迎。

■ 待機時間あり
スケジュールによって待機時間もあり、体力的な負担は少なめです。

■ 完全週休2日制
年間休日120日以上でプライベートも充実できます。

【給与内訳】
想定年収550万円〜600万円
※経験・スキルを考慮の上決定します。

賞与年2回
残業代全額支給
各種手当あり
繁忙期手当あり

【シフト・勤務時間】
9:00-18:00もしくは22:00-7:00
日勤夜勤希望制
8時間勤務のシフト制

【休日・休暇】
完全週休二日制
年間休日120日
年次有給休暇
長期休暇
夏季休暇
年末年始休暇
産休・育休制度
介護休暇
慶弔休暇

【応募資格】
普通自動車運転免許取得後3年以上

運転が好きな方歓迎
人と接することが好きな方歓迎

【待遇・福利厚生】
■感染症対策
・ソーシャルディスタンス確保
・換気徹底
・マスク着用
・アルコール消毒
■昇給・賞与あり
■資格取得支援制度
■残業・深夜手当
■制服貸与
■車通勤OK（条件による）
■有給休暇・特別休暇制度
■引越し費用補助
■交通費支給
■健康診断費用補助
■予防接種補助

【入社後の流れ】
1週目：社内ルール・安全研修・設備説明
2〜4週目：先輩スタッフによるOJT
5週目以降：担当ラインを独立して担当開始

【勤務地】
大阪府大阪市北区茶屋町
転勤なし

【アクセス】
◆阪急「大阪梅田駅」茶屋町口より徒歩5分
◆Osaka Metro御堂筋線「梅田駅」徒歩7分
◆JR「大阪駅」徒歩10分
車通勤可能（規定あり）

【勤務期間】
長期`,
  tags: [
    '未経験歓迎',
    '月給39万円以上',
    '完全週休2日制',
    '年間休日120日以上',
    '賞与年2回',
    '残業代全額支給',
    '研修制度あり',
    '車通勤OK',
    '転勤なし',
    'エンタメ業界',
  ],
  faq: [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。ドライバー経験がなくても研修制度があるため、安心してスタートできます。',
    },
    {
      q: '長距離運転はありますか？',
      a: '長距離運転は多くありません。撮影スケジュールに合わせた現場移動が中心で、待機時間もあるため体力的な負担は少なめです。',
    },
    {
      q: '勤務時間は選べますか？',
      a: '9:00-18:00（日勤）もしくは22:00-7:00（夜勤）の希望制です。8時間勤務のシフト制で、完全週休二日制です。',
    },
    {
      q: '応募に必要な資格はありますか？',
      a: '普通自動車運転免許の取得後3年以上が条件です。それ以外の特別な資格は不要です。',
    },
  ],
};

async function main() {
  console.log('\n🚀 ロケ同行ドライバー求人の登録/更新を開始します...\n');

  // タイトルの先頭部分で既存求人を検索（再実行時は内容を最新版に更新する）
  const existing = (await Jobs.findAll()).find(j => j.title.startsWith('ロケ同行ドライバー'));

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
