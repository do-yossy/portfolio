#!/usr/bin/env node
'use strict';
/**
 * 製造スタッフ求人（製造・工場・自社サイト用）登録スクリプト
 * 東京都八王子市（八王子駅周辺）
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-factory-hachioji-job.js
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

const TITLE_PREFIX = '製造スタッフ（八王子）';

const JOB = {
  title: '製造スタッフ（八王子）／＜月給25万円〜32万円＞新事業オープニングメンバー募集・未経験歓迎・完全週休2日制（土日休み）★',
  location: '東京都八王子市（八王子駅徒歩圏内）',
  salary: '月給250,000円〜320,000円',
  jobType: '製造・工場',
  employmentType: '正社員',
  catchcopy: `新規事業スタートにつきオープニングメンバー募集！
製造のお仕事、はじめませんか？
月給25万円〜32万円／年収例：入社1年目420万円
未経験歓迎♪マニュアル完備で安心スタート
完全週休2日制（土日休み）・年間休日123日`,
  description: `【お仕事内容】
新規事業スタートにつきオープニングメンバー募集！

需要が拡大する製造事業を新たに立ち上げます。

今回募集するのは、事業のスタートを一緒に支えてくれる製造スタッフです。

商品の製造・検品・梱包を担当するお仕事で、製造工程のサポート業務が中心となります。特別な知識や経験は必要ありません。

マニュアルに沿って作業を進めるため、未経験の方でも安心してスタートできます。

■オープニングメンバーで働くメリット
◎全員が同期スタート
立ち上げメンバーは全員が同時スタートのため、人間関係に馴染みやすく、変な上下関係もありません。

◎キャリアアップのチャンス
新規事業の立ち上げメンバーとして活躍でき、将来的にはリーダーや管理職へのキャリアアップも可能です。

◎新しくてキレイな職場
立ち上げにあわせて整備された、空調完備のクリーンな製造環境で働けます。

■主な業務内容
・製品の製造補助
・商品の検品・品質チェック
・商品の仕分け作業
・梱包・箱詰め作業
・出荷ラベルの貼付
・簡単なデータ入力
・製造ラインのサポート業務

■アピールポイント
・オープニングメンバー募集
・未経験歓迎
・正社員採用
・完全週休二日制（土日休み）
・年間休日123日
・転勤なし
・空調完備の快適な職場環境
・長期安定勤務可能

【給与内訳】
※経験・スキルにより優遇
※昇給年1回
※賞与年2回

＜年収例＞
入社1年目（未経験）年収420万円
入社5年目（経験者）年収600万円

通勤手当支給
家族手当
残業手当

【シフト・勤務時間】
9:00〜18:00（実働8時間／休憩1時間）

平均残業：月20時間程度
※繁忙期でも無理な長時間勤務はありません

【休日・休暇】
完全週休二日制（土日）
年間休日123日
夏季休暇
年次有給休暇
産休・育休制度
介護休暇

【応募資格】
未経験OK

■歓迎条件
・製造・工場業務の経験がある方
・コツコツ作業が得意な方
・ものづくりに興味がある方

【待遇・福利厚生】
■感染症対策
・ソーシャルディスタンス確保
・換気徹底
・マスク着用
・アルコール消毒
■社会保険完備
■昇給・賞与あり（賞与年2回・業績に応じて）
■資格取得支援制度
■残業・深夜手当
■制服貸与
■車通勤OK（条件による）
■有給休暇・特別休暇制度
■交通費支給
■家族手当
■定期健康診断
■育児・介護休業制度

【入社後の流れ】
1週目：社内ルール・安全研修・設備説明
2〜4週目：研修担当によるOJT
5週目以降：担当ラインを独立して担当開始

オープニングメンバーは全員が同時スタート。研修担当が丁寧にサポートするため、工場勤務未経験の方も安心です。

【勤務地】
東京都八王子市（八王子駅徒歩圏内）
転勤なし
国内出張の可能性はありません
屋内原則禁煙（喫煙専用室あり）

【アクセス】
◆JR中央線・横浜線「八王子駅」より徒歩圏内
職場までのアクセスが良好で、通勤しやすい環境が整っています。
車・バイク通勤OK（無料駐車場あり）

【勤務期間】
長期`,
  tags: [
    'オープニングメンバー募集',
    '未経験歓迎',
    '正社員採用',
    '完全週休2日制（土日休み）',
    '年間休日123日',
    '転勤なし',
    '八王子駅徒歩圏内',
    '空調完備',
    '賞与年2回',
    '車・バイク通勤OK',
  ],
  faq: [
    {
      q: '未経験でも応募できますか？',
      a: 'はい、大歓迎です。マニュアルに沿って作業を進めるため、特別な知識や経験は必要ありません。入社後は安全教育と作業研修からスタートし、研修担当が丁寧にサポートします。',
    },
    {
      q: 'オープニングメンバーとはどういうことですか？',
      a: '新規事業として立ち上げる製造事業の第一期メンバーの募集です。全員が同時スタートのため人間関係に馴染みやすく、将来的にはリーダーや管理職へのキャリアアップのチャンスもあります。',
    },
    {
      q: '土日は必ず休めますか？',
      a: 'はい、完全週休二日制（土日休み）です。年間休日は123日で、夏季休暇や年次有給休暇もあります。',
    },
    {
      q: '残業はどのくらいありますか？',
      a: '平均残業は月20時間程度です。繁忙期でも無理な長時間勤務はありません。',
    },
    {
      q: '職場環境はどのような感じですか？',
      a: '空調完備の快適な職場環境です。屋内原則禁煙（喫煙専用室あり）で、クリーンな環境で働けます。',
    },
    {
      q: '車で通勤できますか？',
      a: 'はい、車・バイク通勤OKです（無料駐車場あり）。',
    },
  ],
};

async function main() {
  console.log('\n🚀 製造スタッフ（八王子）求人の登録/更新を開始します...\n');

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
