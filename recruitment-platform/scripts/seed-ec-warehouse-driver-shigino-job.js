#!/usr/bin/env node
'use strict';
/**
 * EC倉庫配送ドライバー求人（配送ドライバー・自社サイト用）登録スクリプト
 * 大阪府大阪市城東区（鴫野駅周辺）
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-ec-warehouse-driver-shigino-job.js
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

const TITLE_PREFIX = 'EC倉庫配送ドライバー';

const JOB = {
  title: 'EC倉庫配送ドライバー／＜月収41万円以上＞未経験歓迎・車両費用完全会社負担・完全週休2日制・鴫野駅すぐ★',
  location: '大阪府大阪市城東区（鴫野駅徒歩圏内）',
  salary: '月収410,000円以上',
  jobType: '配送ドライバー',
  employmentType: '正社員',
  catchcopy: `EC通販の需要拡大につきドライバー募集！
月収41万円以上／各種手当・賞与あり
車両・ガソリン・保険・メンテ費用はすべて会社負担
未経験歓迎♪研修制度あり
完全週休2日制・年間休日120日・鴫野駅徒歩圏内`,
  description: `【お仕事内容】
EC通販の需要拡大に伴い、配送ドライバーを募集しています。

大手EC倉庫から出発し、個人宅・マンション・企業への荷物をお届けするお仕事です。

軽貨物業界では業務委託が多く、車両費・ガソリン代・保険料が自己負担になるケースがありますが、当社は正社員採用のため安定した環境で働けます。

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

■主な業務内容
・EC倉庫での荷物の積み込み
・担当エリアへの配送（個人宅・マンション・企業）
・配送伝票の確認・配送完了報告
・車両の日常点検・清掃

配送エリアは近距離中心です。
長距離運転は少なく、無理なく働ける環境です。

■アピールポイント
・月収41万円以上
・車両費用完全会社負担
・正社員採用
・未経験歓迎
・研修制度あり
・固定ルート中心
・長距離少なめ
・鴫野駅から徒歩圏内

【給与内訳】
※経験・スキルにより優遇
※昇給年1回
※賞与年2回

各種手当あり
繁忙期手当あり
残業代全額支給
交通費支給

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
普通自動車運転免許取得後3年以上（AT限定可）

・運転が好きな方歓迎
・安定した働き方をしたい方歓迎
・EC・物流業界に興味がある方歓迎

【待遇・福利厚生】
■感染症対策
・ソーシャルディスタンス確保
・換気徹底
・マスク着用
・アルコール消毒
■社会保険完備
■昇給・賞与あり
■残業代全額支給
■繁忙期手当あり
■制服貸与
■車通勤OK（条件による）
■有給休暇・特別休暇制度
■交通費支給
■健康診断費用補助

【入社後の流れ】
1週目：社内ルール・安全研修・設備説明
2〜4週目：先輩スタッフによるOJT
5週目以降：担当ルートを独立して担当開始

【勤務地】
大阪府大阪市城東区（鴫野駅徒歩圏内）
転勤なし
国内出張の可能性はありません
屋内原則禁煙（喫煙専用室あり）

【アクセス】
◆JR学研都市線「鴫野駅」より徒歩圏内
◆Osaka Metro今里筋線「鴫野駅」より徒歩圏内
職場までのアクセスが良好で、通勤しやすい環境が整っています。
車・バイク通勤OK（規定あり）

【勤務期間】
長期`,
  tags: [
    '月収41万円以上',
    '車両費用会社負担',
    '未経験歓迎',
    '正社員採用',
    '完全週休2日制',
    '年間休日120日',
    '残業代全額支給',
    '鴫野駅徒歩圏内',
    '長距離少なめ',
    '研修制度あり',
  ],
  faq: [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。普通自動車免許（AT限定可・取得後3年以上）があれば応募可能です。研修制度があるため配送未経験からスタートした方も多数活躍しています。',
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
      a: '配送エリアは近距離中心です。EC倉庫から出発し、担当エリアへの配送がメインのため、無理なく働ける環境です。',
    },
    {
      q: '土日は休めますか？',
      a: 'はい、完全週休二日制です。年間休日は120日で、夏季休暇・年末年始休暇など充実した休暇制度があります。',
    },
  ],
};

async function main() {
  console.log('\n🚀 EC倉庫配送ドライバー求人の登録/更新を開始します...\n');

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
