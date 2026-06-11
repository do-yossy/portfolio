#!/usr/bin/env node
'use strict';
/**
 * ITエンジニア（システム開発）求人（IT・自社サイト用）登録スクリプト
 * 大阪府大阪市北区（梅田駅周辺）
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-it-engineer-umeda-job.js
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

const TITLE_PREFIX = 'ITエンジニア（システム開発）';

const JOB = {
  title: 'ITエンジニア（システム開発）／＜月給30万円〜50万円＞未経験・第二新卒歓迎・完全週休2日制（土日）・梅田駅すぐ★',
  location: '大阪府大阪市北区（梅田駅徒歩5分以内）',
  salary: '月給300,000円〜500,000円',
  jobType: 'IT',
  employmentType: '正社員',
  catchcopy: `スキルアップしながら稼げるITエンジニア募集！
月給30万円〜50万円／想定年収420万円〜700万円
未経験・第二新卒歓迎♪研修制度あり
完全週休2日制（土日）・年間休日120日以上
梅田駅 徒歩5分以内・リモートワーク制度あり`,
  description: `【お仕事内容】
Webシステム・業務システムの設計・開発・テスト・保守をお任せします。

既存システムのバグ修正・機能追加からスタートし、経験を積みながら新規開発案件も担当していただきます。

チームで協力しながら進めるため、未経験・経験が浅い方でも安心してスタートできます。

■主な業務内容
・Webアプリケーションの設計・開発
・業務システムのプログラミング・テスト
・既存システムの改修・バグ修正
・クライアント要件のヒアリング・仕様書作成
・コードレビュー・技術ドキュメント作成

■使用技術（一例）
・言語：Java / PHP / Python / JavaScript（React・Vue.js）
・DB：MySQL / PostgreSQL
・インフラ：AWS / Azure
・管理：Git / GitHub / GitLab

※入社時のスキルに合わせて担当案件・技術を調整します。
※特定の技術スタックの経験がなくても、学習意欲があれば問題ありません。

■アピールポイント
・未経験・第二新卒歓迎
・充実した研修制度（入社後3ヶ月の教育プログラム）
・スキルに応じた案件アサイン
・資格取得支援制度あり
・リモートワーク制度あり
・梅田駅から徒歩5分以内でアクセス抜群
・服装自由

【給与内訳】
※経験・スキルにより優遇
※昇給年1回
※賞与年2回

＜想定年収＞
420万円〜700万円

技術手当
役職手当
残業手当
資格手当（取得した資格に応じて支給）
交通費支給

【シフト・勤務時間】
9:00〜18:00（実働8時間／休憩1時間）
※フレックスタイム制あり（コアタイム：10:00〜15:00）
※リモートワーク制度あり（週2〜3日を目安）

平均残業：月20時間程度

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
・基本的なPCスキル（入力・操作に抵抗がない方）
・論理的な思考が得意な方
・チームでの作業が好きな方

■歓迎条件
・プログラミング経験がある方（学習経験・独学でも可）
・IT系の学校・スクール卒業の方
・ITパスポート・基本情報技術者などの資格保有者

■こんな方に向いています
・ITで社会に貢献したい方
・技術を身につけてキャリアアップしたい方
・安定した環境でじっくり成長したい方

【待遇・福利厚生】
■社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
■昇給・賞与あり（賞与年2回）
■資格取得支援制度（受験費用会社負担・合格報奨金あり）
■フレックスタイム制
■リモートワーク制度
■服装自由
■書籍購入補助制度
■交通費支給
■定期健康診断
■育児・介護休業制度

【入社後の流れ】
1〜3ヶ月目：プログラミング研修・社内システム学習・開発環境構築
4〜6ヶ月目：既存案件のバグ修正・軽微な改修からスタート（メンター制度あり）
7ヶ月目以降：スキルに応じた案件を担当

【勤務地】
大阪府大阪市北区（梅田駅徒歩5分以内）
転勤なし
屋内原則禁煙

【アクセス】
◆JR「大阪駅」より徒歩5分以内
◆阪急・阪神「大阪梅田駅」より徒歩5分以内
◆Osaka Metro各線「梅田駅」より徒歩5分以内
アクセス抜群・通勤しやすい環境が整っています。

【勤務期間】
長期`,
  tags: [
    '未経験・第二新卒歓迎',
    '梅田駅徒歩5分',
    '研修制度充実',
    '完全週休2日制（土日）',
    '年間休日120日以上',
    'リモートワーク制度あり',
    'フレックスタイム制',
    '賞与年2回',
    '資格取得支援',
    '服装自由',
  ],
  faq: [
    {
      q: 'プログラミング未経験でも応募できますか？',
      a: 'はい、大歓迎です。入社後3ヶ月間の研修プログラムを用意しており、基礎から丁寧に学べます。学習意欲があれば、スクール卒業・独学経験のある方も多数活躍しています。',
    },
    {
      q: 'どのような技術が身につきますか？',
      a: 'Java・PHP・Python・JavaScriptなどの言語、MySQL・PostgreSQLなどのDB、AWSなどのクラウド技術を案件を通じて習得できます。スキルに応じた案件をアサインするため、無理なくステップアップできます。',
    },
    {
      q: 'リモートワークは可能ですか？',
      a: 'はい、週2〜3日を目安にリモートワークが可能です。また、フレックスタイム制（コアタイム10:00〜15:00）により、柔軟な働き方ができます。',
    },
    {
      q: '資格取得のサポートはありますか？',
      a: 'はい、資格取得支援制度があります。受験費用の会社負担と合格報奨金があり、ITパスポート・基本情報技術者・AWS認定資格などの取得をサポートします。',
    },
    {
      q: '残業はどのくらいありますか？',
      a: '平均残業は月20時間程度です。フレックスタイム制もあるため、プライベートの時間を確保しやすい環境です。',
    },
  ],
};

async function main() {
  console.log('\n🚀 ITエンジニア（システム開発）求人の登録/更新を開始します...\n');

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
