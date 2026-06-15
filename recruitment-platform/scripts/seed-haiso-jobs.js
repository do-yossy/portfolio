#!/usr/bin/env node
'use strict';
/**
 * 軽貨物宅配ドライバー求人 25件 一括登録スクリプト
 * Amazon・楽天等ECサイト荷物の個人宅配送（大阪全域・正社員）
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-haiso-jobs.js
 *
 * ※ 既に同タイトルの求人が存在する場合はスキップします
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

const COMPANY      = 'sq';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['kyujinbox', 'google'];
const JOB_TYPE     = 'ドライバー・配送';
const EMP_TYPE     = '正社員';

function makeFaq(area) {
  return [
    {
      q: '普通自動車免許（AT限定）でも働けますか？',
      a: 'はい、AT限定でも大丈夫です。軽バン・軽箱バンはAT車です。',
    },
    {
      q: '車は自分で用意しないといけませんか？',
      a: '会社の車両を無料で貸与します。ガソリン代・保険・車検費用もすべて会社負担で、自己負担は一切ありません。',
    },
    {
      q: '1日何件くらい配達しますか？',
      a: `${area}エリアは1日60〜100件が目安です。慣れてくると午後3〜4時頃には配達完了できます。`,
    },
    {
      q: '宅配の経験がなくても大丈夫ですか？',
      a: '入社後、先輩ドライバーが1〜2週間同乗指導します。スマートフォンの専用アプリで地図とルートを確認できるので、土地勘がなくてもすぐ慣れます。',
    },
    {
      q: '完全週休2日制とはどういう内容ですか？',
      a: '毎週必ず2日間休みがあります。土日固定やシフト制など希望に合わせて相談可能です。年間休日は120日以上を保証します。',
    },
    {
      q: '月収35万円以上は保証されますか？',
      a: '基本給35万円を保証した上で、皆勤手当・配達達成手当が加算されます。入社3か月以内の実績でも月平均38万円以上を達成しているドライバーが多数います。',
    },
  ];
}

// エリアごとの差分となる勤務時間・件数・特記事項
const AREAS = [
  // 大阪市内
  { area: '北区・天満・中崎町',  city: '大阪市北区',    shift: '8:00〜17:00', vol: '70〜100件', note: '梅田・天満エリアのマンション多数' },
  { area: '中央区・心斎橋・難波', city: '大阪市中央区',   shift: '9:00〜18:00', vol: '60〜90件',  note: '繁華街周辺の高層マンション配送あり' },
  { area: '淀川区・十三・新大阪', city: '大阪市淀川区',   shift: '8:00〜17:00', vol: '70〜100件', note: '新大阪駅周辺のオフィス・マンション混在' },
  { area: '西区・靭・本町',      city: '大阪市西区',    shift: '8:30〜17:30', vol: '65〜95件',  note: 'ビジネス街と住宅街が混在するエリア' },
  { area: '天王寺区・阿倍野',    city: '大阪市天王寺区', shift: '8:00〜17:00', vol: '70〜100件', note: 'あべのハルカス周辺の高層住宅も担当' },
  { area: '住吉区・我孫子・長居', city: '大阪市住吉区',   shift: '8:00〜17:00', vol: '70〜100件', note: '一戸建て中心で駐車しやすいルート' },
  { area: '平野区・喜連・加美',   city: '大阪市平野区',   shift: '7:30〜16:30', vol: '80〜110件', note: '住宅密集地で件数多め、ルート習熟で高収入' },
  { area: '東住吉区・針中野',    city: '大阪市東住吉区', shift: '8:00〜17:00', vol: '70〜100件', note: '閑静な住宅街中心で落ち着いて配達できる' },
  { area: '城東区・鴫野・蒲生',   city: '大阪市城東区',   shift: '8:00〜17:00', vol: '70〜100件', note: 'ファミリー層多く在宅率が高いエリア' },
  { area: '鶴見区・放出・横堤',   city: '大阪市鶴見区',   shift: '8:00〜17:00', vol: '65〜95件',  note: '新興住宅地でマンション・一戸建て混在' },
  { area: '旭区・関目・千林',     city: '大阪市旭区',    shift: '8:00〜17:00', vol: '70〜100件', note: '下町エリアで顔なじみのお客様が多い' },
  { area: '東成区・今里・玉津',   city: '大阪市東成区',   shift: '8:00〜17:00', vol: '65〜90件',  note: '商店街周辺の住宅密集地' },
  { area: '生野区・巽・田島',     city: '大阪市生野区',   shift: '8:00〜17:00', vol: '70〜100件', note: '一戸建てが多くまとめ配達しやすい' },
  { area: '浪速区・難波・恵美須', city: '大阪市浪速区',   shift: '9:00〜18:00', vol: '60〜85件',  note: '繁華街周辺エリア、夕方在宅率高め' },
  { area: '福島区・野田・海老江', city: '大阪市福島区',   shift: '8:30〜17:30', vol: '65〜95件',  note: 'マンションが多く効率よく周回できる' },
  // 大阪府内 各市
  { area: '堺市堺区・大小路',    city: '大阪府堺市堺区',  shift: '8:00〜17:00', vol: '70〜100件', note: '一戸建て住宅が多く配達効率が高い' },
  { area: '堺市北区・中区',      city: '大阪府堺市北区',  shift: '8:00〜17:00', vol: '70〜100件', note: '新興住宅地で若いファミリー層が多い' },
  { area: '東大阪市・布施・八戸ノ里', city: '大阪府東大阪市', shift: '8:00〜17:00', vol: '75〜105件', note: '住宅密集地でルートを覚えれば高件数こなせる' },
  { area: '豊中市・蛍池・少路',   city: '大阪府豊中市',   shift: '8:00〜17:00', vol: '70〜100件', note: '閑静な住宅街で駐車環境が整っている' },
  { area: '吹田市・江坂・千里丘', city: '大阪府吹田市',   shift: '8:00〜17:00', vol: '70〜100件', note: 'マンション・一戸建て均等で配達しやすい' },
  { area: '枚方市・牧野・樟葉',   city: '大阪府枚方市',   shift: '8:00〜17:00', vol: '70〜100件', note: '郊外住宅地で駐車しやすくストレス少ない' },
  { area: '八尾市・近鉄八尾周辺', city: '大阪府八尾市',   shift: '8:00〜17:00', vol: '70〜100件', note: '一戸建て比率が高く置き配対応で効率アップ' },
  { area: '守口市・大日・西三荘', city: '大阪府守口市',   shift: '8:00〜17:00', vol: '70〜100件', note: '大阪市隣接エリアで配達先が密集している' },
  { area: '寝屋川市・香里園周辺', city: '大阪府寝屋川市', shift: '8:00〜17:00', vol: '70〜100件', note: '昔ながらの住宅地で在宅率が高い' },
  { area: '松原市・藤井寺市方面', city: '大阪府松原市',   shift: '8:00〜17:00', vol: '65〜95件',  note: '郊外住宅地で一戸建て多く置き配率が高め' },
];

function makeJob(item) {
  const { area, city, shift, vol, note } = item;
  return {
    title:     `【${area}】軽貨物宅配ドライバー募集（正社員・月収35万円以上）`,
    location:  city,
    salary:    '月給350,000円〜500,000円',
    catchcopy: `Amazon・楽天等ECサイト荷物を個人宅へ｜${vol}｜車両貸与・経費ゼロ`,
    description: `${city}（${area}）エリアで、AmazonをはじめとするECサイトや通販会社の荷物を個人宅・マンションへお届けする軽貨物宅配ドライバーを正社員で募集します。

【仕事内容】
毎朝、営業所または指定の積み込み場所で荷物を積み込み、専用アプリに表示されるルートに沿って担当エリアを巡回します。${note}。1日の配達件数は${vol}が目安で、慣れれば午後3〜4時頃には配達完了できます。

配達した荷物は全て記録するので、指示通りに動けば問題なし。不在時は玄関前・宅配ボックスへの置き配対応も増えており、再配達は最小限です。

【こんな方が活躍しています】
・運転が好き、一人で黙々と作業したい方
・体を動かしながら稼ぎたい方
・前職が飲食・製造・建設などで転職を考えている方
・ブランクがあり再就職したい方

【労働時間】
${shift}（実働8時間）※残業は月平均5時間以内

【休日・休暇】
完全週休2日制（希望休制度あり・土日固定も相談可）
年間休日120日以上／有給休暇10日〜（取得率80%以上）

【給与内訳】
基本給 350,000円
＋皆勤手当 10,000円
＋配達達成手当 10,000円〜50,000円（件数連動）
月収実績：平均380,000円〜430,000円

【入社後の流れ】
1〜2日目：社内研修（会社ルール・アプリ操作・荷物の扱い方）
3日目〜2週間：先輩ドライバーが同乗して実地指導
3週目〜：担当エリアを一人で独立配達スタート

【車両・経費について】
・軽バン／軽箱バンを無償で貸与（会社名義）
・ガソリン代、保険料、車検費用、駐車場代：すべて会社負担
・自己負担ゼロで、手取りがそのまま残ります`,
    tags: [
      '普通自動車免許AT可',
      '軽貨物宅配',
      '個人宅配送',
      'Amazon配送',
      '未経験歓迎',
      '車両貸与',
      '経費ゼロ',
      '完全週休2日',
    ],
    faq: makeFaq(area),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 軽貨物宅配ドライバー求人 ${JOBS.length}件 の登録を開始します...\n`);

  const existing      = await Jobs.findAll();
  const existingTitles = new Set(existing.map(j => j.title));

  let added   = 0;
  let skipped = 0;

  for (const job of JOBS) {
    if (existingTitles.has(job.title)) {
      console.log(`  ⏭️  スキップ（既存）: ${job.title}`);
      skipped++;
      continue;
    }

    try {
      await Jobs.create({
        title:          job.title,
        location:       job.location,
        salary:         job.salary,
        jobType:        JOB_TYPE,
        employmentType: EMP_TYPE,
        description:    job.description,
        tags:           job.tags,
        catchcopy:      job.catchcopy,
        imageUrl:       '',
        faq:            job.faq,
        isPublished:    true,
        publishedAt:    NOW,
        targetMedia:    TARGET_MEDIA,
        company:        COMPANY,
      });
      console.log(`  ✅ 登録完了: ${job.title}`);
      added++;
    } catch (err) {
      console.error(`  ❌ 登録失敗: ${job.title}\n     ${err.message}`);
    }
  }

  console.log(`\n📊 結果: 登録 ${added}件 / スキップ ${skipped}件 / 合計 ${JOBS.length}件`);
  if (added > 0) {
    console.log('\n✅ 完了！管理画面 /admin/jobs で確認してください。');
    console.log('   各求人の /jobs/:id ページに Google Jobs 用 JSON-LD が自動出力されます。');
  }
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
