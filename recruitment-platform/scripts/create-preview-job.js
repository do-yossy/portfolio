#!/usr/bin/env node
'use strict';
/**
 * 新デザイン確認用の求人を「未公開」状態で新規作成する
 * （未公開のため求人一覧・Googleしごと検索には出ない。プレビューURLでのみ確認可能）
 * 実行: node --experimental-sqlite scripts/create-preview-job.js
 */

const path = require('path');
const fs   = require('fs');

(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs } = require('../db-factory');

async function main() {
  const job = await Jobs.create({
    title:          '物流業界特化のキャリアアドバイザー◆未経験歓迎・月給30万円〜／梅田◆',
    location:       '大阪府大阪市北区',
    salary:         '月給300,000円〜',
    jobType:        'カウンセラー/アドバイザー',
    employmentType: '正社員',
    catchcopy:      '平均昇給率20％超！頑張りは給与にスピード反映♪',
    description: `ブライダル・アパレル・販売職など
異業種からの転職者多数活躍中◎

物流業界特化型の人材サービス企業で
企業とドライバーをつなぐ
両面型キャリアアドバイザー大募集！

＊未経験OK／研修・サポート体制あり
＊年休124日／土日祝休み

★CA平均年収：545万円（23年度）

【仕事内容】
物流業界で働きたい求職者と、ドライバーを採用したい企業の双方を担当する両面型キャリアアドバイザーです。
・求職者との面談、キャリアカウンセリング
・求人企業への提案、条件ヒアリング
・面接日程の調整、入社までのフォロー

【こんな方に向いています】
・人と話すことが好きな方
・接客・販売経験を活かしてキャリアアップしたい方
・成果がきちんと評価される環境で働きたい方

【労働時間】
9:00〜18:00（実働8時間）
残業：月平均15時間以内

【休日・休暇】
完全週休2日制（土日祝休み）
年間休日124日
夏季・年末年始休暇あり

【給与・待遇】
月給30万円〜＋インセンティブ
平均昇給率20％超
社会保険完備
交通費全額支給`,
    tags: [
      '未経験歓迎',
      '月給30万円〜',
      '土日祝休み',
      '年間休日124日',
      '研修制度あり',
      'インセンティブあり',
    ],
    faq: [
      { q: '未経験でも応募できますか？', a: 'はい、大歓迎です。入社後の研修とOJTで人材業界の基礎から丁寧に学べます。異業種出身の先輩が多数活躍しています。' },
      { q: '営業経験がなくても大丈夫ですか？', a: '問題ありません。接客・販売などお客様と接する経験があれば十分に活かせます。' },
      { q: '給与はどのように上がりますか？', a: '年2回の査定で、成果に応じてスピード昇給します。平均昇給率は20％超です。' },
    ],
    imageUrl:    '',
    isPublished: false,            // 未公開（プレビューのみ）
    publishedAt: null,
    targetMedia: [],               // 未反映（公開時に google を設定）
    company:     'sq',
  });

  console.log('\n✅ 未公開の求人を作成しました（求人一覧・Googleには出ません）');
  console.log(`\n   求人ID: ${job.id}`);
  console.log(`\n   プレビューURL:`);
  console.log(`   http://localhost:3000/preview/jobs/${job.id}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
