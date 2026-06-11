#!/usr/bin/env node
'use strict';
/**
 * DM制作ディレクター（進行管理）求人（IT・自社サイト用）登録スクリプト
 * 東京都中野区
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-dm-director-job.js
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

const TITLE_PREFIX = 'DM制作ディレクター';

const JOB = {
  title: 'DM制作ディレクター（進行管理）／＜月給24.2万円〜28万円＞ディレクション未経験OK・完全週休2日制（土日）・年間休日127日★',
  location: '東京都中野区',
  salary: '月給242,000円〜280,000円',
  jobType: 'IT',
  employmentType: '正社員',
  catchcopy: `営業×クリエイティブをつなぐ進行管理のプロへ！
月給24.2万円〜28万円／想定年収360万円〜420万円
ディレクション経験不問・進行管理が得意な方歓迎
完全週休2日制（土日）・年間休日127日
転勤なし・服装自由・時差出勤制度あり`,
  description: `【お仕事内容】
営業とクリエイティブ部門の間に立ち、ダイレクトメール（DM）制作の案件進行管理・ディレクションをメインにお任せします。

顧客や商材の理解を深めながら、案件をスムーズに進行させるための重要なポジションです。

※適性や経験に応じて、業務範囲を徐々に広げていただきます。

■案件相談時の対応
・制作依頼の対応可否判断、要件確認
・見積もり対応、スケジュールの確認・作成（営業と連携）
・受注前の社内打ち合わせ、および必要に応じたクライアントとの商談同席

■案件進行時の対応
・キックオフの実施（社内・クライアント先）
・支給素材データのやり取り、進捗管理
・クリエイティブ部門からのデザイン提出、修正指示に対する質問・回答の取りまとめ
・イレギュラー発生時の状況判断と対応策の提示・調整
（例：修正回数の増加、先方からの戻し遅延、大幅な修正依頼、納期短縮の相談など）

■この仕事の魅力
◎組織の課題解決に直結するやりがい
案件数が増加傾向にあり、今後の成長を見据えた体制強化が急務となっています。あなたのディレクション力でチームの推進力を高め、会社の売上拡大に直接貢献できる非常に重要なポジションです。

◎実践の中で広がる裁量
まずは決まった手順での進行管理からスタートし、慣れてきたらイレギュラー対応や判断・調整もお任せしていきます。将来的にはデザインの品質面にも関わるディレクションへと、実務を通じてステップアップしていける環境です。

◎幅広いビジネス視点が身につく
営業視点とクリエイティブ視点の両方を持ち合わせることで、調整力やプロジェクトマネジメントスキルが飛躍的に向上します。

【給与内訳】
月給 242,000円〜280,000円
※経験・スキルにより優遇
※昇給年1回
※賞与年2回

＜想定年収＞
360万円〜420万円

通勤費支給
役職手当
技術手当
残業手当

【シフト・勤務時間】
9:00〜18:00（実働8時間）
■時差出勤制度あり

【休日・休暇】
≪年間休日127日≫
完全週休2日制（土曜・日曜）
祝日
夏季休暇
年末年始休暇
有給休暇
慶弔休暇
特別休暇
バースデー休暇
産前産後休暇
育児休暇
介護休暇

【応募資格】
■必須要件
・社会人経験（目安1〜2年以上）
・社内外との折衝経験（営業、カスタマーサクセス、販売、企画など）
・基本的なPCスキル（資料作成やデータ入力に抵抗がない方）

■歓迎要件
・広告、印刷、Web業界などでの就業経験（職種不問）
・規模を問わず、プロジェクトの進行管理や納期管理を行った経験
・BtoBでの営業経験、または制作部門や外部パートナーとのやり取りをした経験
・IllustratorやPhotoshopなどのデザインツールの基礎知識

■こんな方にオススメ！
・社内で円滑なコミュニケーションを取りながら進捗管理ができる方
・クライアントのビジネスや商材に対して興味を持ち、深く理解しようとする意欲がある方

※ディレクション経験は不問です。
進行管理が得意な方・挑戦したい方からのご応募を歓迎します！

【待遇・福利厚生】
■社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
■賞与年2回
■昇給年1回
■定年65歳
■時差出勤制度
■退職金制度
■社内公募制度
■ウォーターサーバーあり
■服装自由
■慶弔見舞金制度
■資格取得支援制度
■引越支援制度

【入社後の流れ】
1週目：社内ルール・業務フロー・案件管理ツールの説明
2〜4週目：先輩ディレクターによるOJT（決まった手順での進行管理からスタート）
5週目以降：担当案件を独立して担当開始

【勤務地】
東京都中野区
転居を伴う転勤はありません

【アクセス】
◆JR・地下鉄各線「中野駅」より徒歩圏内
職場までのアクセスが良好で、通勤しやすい環境が整っています。

【勤務期間】
長期`,
  tags: [
    'ディレクション未経験OK',
    '進行管理・ディレクター',
    '完全週休2日制（土日）',
    '年間休日127日',
    '転勤なし',
    '賞与年2回',
    '昇給年1回',
    '時差出勤制度あり',
    '服装自由',
    '退職金制度あり',
  ],
  faq: [
    {
      q: 'ディレクション未経験でも応募できますか？',
      a: 'はい、ディレクション経験は不問です。まずは決まった手順での進行管理からスタートし、慣れてきたらイレギュラー対応や判断・調整もお任せしていきます。進行管理が得意な方・挑戦したい方を歓迎します。',
    },
    {
      q: '必須の応募条件はありますか？',
      a: '社会人経験（目安1〜2年以上）、社内外との折衝経験（営業・カスタマーサクセス・販売・企画など）、基本的なPCスキルが必須要件です。',
    },
    {
      q: 'デザインスキルは必要ですか？',
      a: '必須ではありません。IllustratorやPhotoshopなどデザインツールの基礎知識があれば歓迎しますが、デザイン制作自体はクリエイティブ部門が担当します。',
    },
    {
      q: '土日は必ず休めますか？',
      a: 'はい、完全週休2日制（土日）です。祝日も休みで、年間休日は127日あります。バースデー休暇などの特別休暇もあります。',
    },
    {
      q: 'キャリアアップはできますか？',
      a: 'はい。将来的にはデザインの品質面にも関わるディレクションへと、実務を通じてステップアップしていける環境です。社内公募制度もあります。',
    },
  ],
};

async function main() {
  console.log('\n🚀 DM制作ディレクター求人の登録/更新を開始します...\n');

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
