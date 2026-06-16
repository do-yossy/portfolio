#!/usr/bin/env node
'use strict';
/**
 * 宅配便配送ドライバー求人（配送ドライバー・自社サイト用）登録スクリプト
 * オープニングメンバー募集・正社員
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-takuhai-driver-job.js
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

const TITLE_PREFIX = '宅配便配送ドライバー';

const JOB = {
  title: '宅配便配送ドライバー／＜月給42万円〜77万円＞オープニングメンバー募集・未経験歓迎・完全週休2日制★',
  location: '大阪府大阪市北区茶屋町',
  locations: ["兵庫県尼崎市潮江","兵庫県神戸市東灘区深江北町","京都府京都市伏見区桃山筒井伊賀西町","大阪府大阪市淀川区十三東","大阪府池田市石橋","大阪府茨木市永代町","大阪府高槻市城北町","大阪府守口市大日町","大阪府大阪市城東区古市","大阪府大阪市城東区鴫野西","大阪府東大阪市川俣","大阪府八尾市龍華町","大阪府大阪市東淀川区東淡路","大阪府大阪市北区芝田","大阪府大阪市中央区難波","大阪府堺市北区中百舌鳥町","大阪府堺市堺区戎島町","大阪府堺市西区津久野町","東京都豊島区南池袋","東京都新宿区新宿","東京都千代田区有楽町","東京都墨田区横綱","東京都荒川区南千住"],
  salary: '月給42万円〜77万円',
  jobType: '配送ドライバー',
  employmentType: '正社員',
  catchcopy: `新規事業スタートにつきオープニングメンバー募集！
月給42万円〜77万円／想定年収650万円〜920万円
車両費・経費はすべて会社負担、初期費用ゼロ
未経験歓迎♪研修制度あり
完全週休2日制・年間休日120日以上`,
  description: `【お仕事内容】
新規事業スタートにつきオープニングメンバー募集！

物流業界で需要が拡大する宅配便配送事業を新たに立ち上げます。

今回募集するのは、事業のスタートを一緒に支えてくれる正社員ドライバーです。

軽貨物業界では業務委託が多く、

「車両を自分で用意する」
「ガソリン代が自己負担」
「保険料や車検代も自分持ち」
「収入が安定しない」

といった不安がありますが、当社は正社員採用のため安心して働けます。

■当社で働くメリット
◎車両費・経費は会社負担
・配送車両貸与
・ガソリン代会社負担
・車両保険会社負担
・車検・メンテナンス会社負担
仕事を始めるための初期費用は一切ありません。

◎安定した正社員雇用
毎月固定給があるため、配送量に左右されず安定した収入を確保できます。

◎未経験歓迎
普通自動車免許（AT限定可）があれば応募可能です。
研修制度があるため配送未経験でも安心してスタートできます。

◎オープニング募集
新規事業の立ち上げメンバーとして活躍できます。
将来的にはリーダーや管理職へのキャリアアップも可能です。

■仕事内容
大手宅配会社様の荷物を個人宅や企業へお届けするお仕事です。

【主な業務】
・荷物の積み込み
・担当エリアでの配送
・配送完了データの入力
・車両の日常点検

配送エリアは近距離中心です。

■アピールポイント
■ 月給30万円以上の安定収入
業界水準より少し高めの給与設定で、安定して働けます。

■ 未経験歓迎
特別な経験は不要。研修制度も整っているため安心です。

■ 長距離少なめ
近距離中心の配送で無理なく働けます。

■ 完全週休2日制
年間休日120日以上でプライベートも充実できます。

【給与内訳】
想定年収650万円〜920万円
※経験・スキルを考慮の上決定します。

賞与年2回
残業代全額支給
各種手当あり
繁忙期手当あり

【シフト・勤務時間】
9:00〜18:00（実働8時間／休憩1時間）

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
    'オープニングメンバー募集',
    '未経験歓迎',
    '月給42万円以上',
    '車両貸与・経費会社負担',
    '完全週休2日制',
    '年間休日120日以上',
    '賞与年2回',
    '残業代全額支給',
    '研修制度あり',
    '転勤なし',
  ],
  faq: [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。普通自動車免許（AT限定可）があれば応募可能で、研修制度があるため配送未経験でも安心してスタートできます。',
    },
    {
      q: '車両や経費の自己負担はありますか？',
      a: 'ありません。配送車両は会社が貸与し、ガソリン代・車両保険・車検・メンテナンス費用もすべて会社負担です。初期費用は一切かかりません。',
    },
    {
      q: '業務委託ですか？正社員ですか？',
      a: '正社員採用です。毎月固定給があるため、配送量に左右されず安定した収入を確保できます。',
    },
    {
      q: '長距離の配送はありますか？',
      a: '配送エリアは近距離中心です。無理なく働ける環境です。',
    },
    {
      q: 'キャリアアップはできますか？',
      a: '新規事業の立ち上げメンバーとして活躍でき、将来的にはリーダーや管理職へのキャリアアップも可能です。',
    },
  ],
};

async function main() {
  console.log('\n🚀 宅配便配送ドライバー求人の登録/更新を開始します...\n');

  const existing = (await Jobs.findAll()).find(j => j.title.startsWith(TITLE_PREFIX));

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
