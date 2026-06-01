'use strict';
/**
 * Life Tailor 初期データ投入スクリプト
 * 実行方法: cd life-tailor-platform && set DATA_DIR=%cd%\data && node seed.js
 */

// DATA_DIR を自分のディレクトリに設定
const path = require('path');
process.env.DATA_DIR = path.join(__dirname, 'data');

// .env を読み込む
const fs = require('fs');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
}

const { Jobs } = require('../recruitment-platform/db-factory');

const sampleJobs = [
  {
    title: 'ファッションスタイリスト（正社員）',
    location: '東京都渋谷区',
    salary: '月給25万円〜35万円',
    jobType: 'ファッション・アパレル',
    employmentType: '正社員',
    description: `◆仕事内容
個人のライフスタイルに合わせたファッション提案・コーディネートを行うスタイリストです。

【主な業務】
・お客様のヒアリングとスタイリング提案
・ショッピング同行サービスの提供
・オンラインコーディネート相談
・SNS発信・コンテンツ作成補助

◆職場環境
渋谷駅から徒歩5分のオシャレなオフィス。
ファッションが好きな方大歓迎！スキルアップ支援あり。`,
    tags: ['ファッション好き歓迎', 'スキルアップ支援', '正社員', '渋谷'],
    isPublished: true,
    catchcopy: 'あなたのファッションセンスを仕事に！'
  },
  {
    title: 'パーソナルスタイリスト（業務委託）',
    location: '東京都・大阪府（リモート可）',
    salary: '報酬制：1件5,000円〜15,000円',
    jobType: 'ファッション・アパレル',
    employmentType: '業務委託・フリーランス',
    description: `◆仕事内容
オンラインでお客様のスタイリングをサポートするパーソナルスタイリストです。

【主な業務】
・オンラインヒアリング・スタイリング提案
・コーディネート画像作成・送付
・クローゼット整理アドバイス

◆メリット
完全リモート、自分のペースで働けます。
副業・複業として活躍している方も多数在籍。`,
    tags: ['リモート', '副業OK', '業務委託', '自由なペース'],
    isPublished: true,
    catchcopy: '自分のペースでスタイリストとして活躍！'
  },
  {
    title: 'SNSマーケター・コンテンツクリエイター',
    location: '東京都港区（リモート可）',
    salary: '月給28万円〜40万円',
    jobType: 'マーケティング・PR',
    employmentType: '正社員',
    description: `◆仕事内容
Life TailorブランドのSNSマーケティングおよびコンテンツ制作を担当します。

【主な業務】
・Instagram/TikTok/YouTubeのコンテンツ企画・制作
・インフルエンサーとのコラボレーション企画
・ブランドのビジュアルアイデンティティ管理
・データ分析によるコンテンツ改善

◆求める人材
SNS運用経験者、ファッション・ライフスタイルに興味がある方。`,
    tags: ['SNS運用', 'クリエイティブ', 'リモート可', 'ファッション'],
    isPublished: true,
    catchcopy: 'ファッションブランドのSNSを一緒に育てよう'
  },
  {
    title: 'カスタマーサポートスタッフ',
    location: '東京都渋谷区',
    salary: '時給1,400円〜1,700円',
    jobType: 'カスタマーサポート',
    employmentType: 'パート・アルバイト',
    description: `◆仕事内容
オンラインスタイリングサービスのカスタマーサポートです。

【主な業務】
・メール・チャットでのお客様対応
・予約管理・スケジュール調整
・サービスの案内・説明
・クレーム対応（マニュアルあり）

◆環境
未経験でも丁寧な研修あり。週3日〜OK、シフト制で働きやすい環境。`,
    tags: ['週3日OK', '未経験歓迎', 'パート', 'シフト制'],
    isPublished: true,
    catchcopy: 'ファッションが好きな方、一緒に働きませんか？'
  },
  {
    title: 'バックエンドエンジニア（Node.js）',
    location: '東京都渋谷区（フルリモート可）',
    salary: '年収500万円〜750万円',
    jobType: 'IT・エンジニア',
    employmentType: '正社員',
    description: `◆仕事内容
パーソナルスタイリングサービスのプラットフォーム開発を担当します。

【主な業務】
・スタイリングマッチングシステムの開発・改善
・決済システムの開発・保守
・APIの設計・実装
・パフォーマンス改善

◆技術スタック
Node.js / TypeScript / PostgreSQL / AWS / Docker`,
    tags: ['フルリモート', 'Node.js', 'エンジニア', '高年収'],
    isPublished: true,
    catchcopy: 'ファッション×テクノロジーで社会をアップデート'
  },
];

async function seed() {
  console.log('Life Tailor サンプルデータを投入中...');
  for (const job of sampleJobs) {
    const existing = await Jobs.findAll({ search: job.title });
    if (existing.length > 0) {
      console.log(`  スキップ（既存）: ${job.title}`);
      continue;
    }
    await Jobs.create(job);
    console.log(`  追加: ${job.title}`);
  }
  console.log('完了！');
}

seed().catch(console.error);
