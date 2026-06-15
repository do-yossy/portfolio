#!/usr/bin/env node
'use strict';
/**
 * EC配送ドライバー求人 15件（大阪・正社員・月収39万円以上）
 * Google しごと検索専用掲載（targetMedia: ['google']）
 * ※ 既存エリアと重複しない大阪府内エリアで作成
 * 実行: node --experimental-sqlite scripts/seed-ec-haisou-osaka-google.js
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

const COMPANY      = 'sq';
const NOW          = new Date().toISOString();
const TARGET_MEDIA = ['google'];
const JOB_TYPE     = 'ドライバー・配送';
const EMP_TYPE     = '正社員';

const AREAS = [
  { area: '大阪市中央区・難波・心斎橋',     city: '大阪府大阪市', shift: '8:00〜17:00', vol: '60〜85件',  note: '繁華街周辺のマンション密集地。在宅率が高く効率よく配達できます' },
  { area: '大阪市西区・九条・西九条',       city: '大阪府大阪市', shift: '8:00〜17:00', vol: '60〜85件',  note: '住宅とオフィスが混在するエリア。置き配対応も増え再配達が少ない' },
  { area: '大阪市住之江区・南港・北加賀屋', city: '大阪府大阪市', shift: '8:00〜17:00', vol: '55〜80件',  note: '大型マンション群が集中。まとめて効率的に配達できる好エリア' },
  { area: '大阪市平野区・喜連・瓜破',       city: '大阪府大阪市', shift: '8:00〜17:00', vol: '65〜90件',  note: '一戸建て・マンション混在の住宅地。在宅率が高く配達しやすい' },
  { area: '大阪市鶴見区・鶴見・放出',       city: '大阪府大阪市', shift: '8:00〜17:00', vol: '60〜85件',  note: '整備された住宅街で道路が走りやすく、効率的に周回できるエリア' },
  { area: '東大阪市・布施・俊徳道',         city: '大阪府東大阪市', shift: '8:00〜17:00', vol: '70〜95件', note: '住宅密集地でルートが短く件数をこなしやすいエリア' },
  { area: '八尾市・八尾・久宝寺',           city: '大阪府八尾市',   shift: '8:00〜17:00', vol: '65〜90件', note: '一戸建て中心の落ち着いた住宅地。駐車スペースが豊富です' },
  { area: '松原市・松原・天美',             city: '大阪府松原市',   shift: '8:00〜17:00', vol: '60〜85件', note: 'コンパクトな住宅地で効率よく周回できる。在宅率が安定して高い' },
  { area: '羽曳野市・古市・駒ヶ谷',         city: '大阪府羽曳野市', shift: '8:00〜17:00', vol: '55〜80件', note: '閑静な住宅街で駐車しやすく落ち着いて配達できる環境' },
  { area: '藤井寺市・藤井寺・道明寺',       city: '大阪府藤井寺市', shift: '8:00〜17:00', vol: '50〜75件', note: '一戸建て中心のゆとりある住宅地。ルートが組みやすいエリア' },
  { area: '泉大津市・泉大津・北助松',       city: '大阪府泉大津市', shift: '8:00〜17:00', vol: '55〜80件', note: '整備された住宅地で道幅が広く軽バンで走りやすいエリア' },
  { area: '岸和田市・岸和田・蛸地蔵',       city: '大阪府岸和田市', shift: '8:00〜17:00', vol: '60〜85件', note: '住宅地が広がり在宅率が高め。EC需要が伸びているエリア' },
  { area: '貝塚市・貝塚・二色浜',           city: '大阪府貝塚市',   shift: '8:00〜17:00', vol: '50〜75件', note: '一戸建て中心の静かな住宅地。ゆとりをもって配達できます' },
  { area: '和泉市・光明池・いずみ中央',     city: '大阪府和泉市',   shift: '8:00〜17:00', vol: '60〜85件', note: '計画的な住宅団地でルートが明快。新興エリアでEC利用者が多い' },
  { area: '泉佐野市・日根野・羽倉崎',       city: '大阪府泉佐野市', shift: '8:00〜17:00', vol: '55〜80件', note: '住宅地が広がり整備された道路が多く走りやすいエリア' },
];

function makeFaq(area, vol) {
  return [
    {
      q: '普通自動車免許（AT限定）でも働けますか？',
      a: 'はい、AT限定で大丈夫です。軽バン・軽箱バンはすべてAT車です。',
    },
    {
      q: '車は自分で用意しないといけませんか？',
      a: '会社の車両を無料で貸与します。ガソリン代・保険・車検費用もすべて会社負担で自己負担は一切ありません。',
    },
    {
      q: '1日何件くらい配達しますか？',
      a: `${area}エリアは1日${vol}が目安です。慣れてくると午後3〜4時頃には配達完了できます。`,
    },
    {
      q: 'EC配送の経験がなくても大丈夫ですか？',
      a: '入社後、先輩ドライバーが1〜2週間同乗指導します。専用アプリでルート案内があるので土地勘がなくてもすぐ慣れます。',
    },
    {
      q: '月収39万円以上は保証されますか？',
      a: '基本給35万円に加え、皆勤手当・配達達成手当が毎月加算されます。入社3か月以内でも月平均39万円以上を達成しているドライバーが多数います。',
    },
    {
      q: '完全週休2日制とはどういう内容ですか？',
      a: '毎週必ず2日間休みがあります。土日固定やシフト制など希望に合わせて相談可能です。年間休日は120日以上を保証します。',
    },
  ];
}

function makeJob({ area, city, shift, vol, note }) {
  return {
    title:     `【${area}】EC配送ドライバー正社員募集｜月収39万円以上・車両貸与`,
    location:  city,
    salary:    '月給390,000円〜520,000円',
    catchcopy: `EC通販荷物を個人宅へお届け｜${vol}｜車両・経費ゼロ`,
    description: `${city}（${area}）エリアで、AmazonをはじめとするEC通販の荷物を個人宅・マンションへお届けするEC配送ドライバーを正社員で募集します。

【仕事内容】
毎朝、営業所または指定の積み込み場所で荷物を積み込み、専用アプリのルートに沿って担当エリアを配達します。${note}。1日の目安件数は${vol}で、慣れれば午後3〜4時頃には完了できます。

不在時は宅配ボックス・玄関前への置き配対応が増えており、再配達は最小限です。

【こんな方が活躍しています】
・運転が好き、一人で集中して働きたい方
・体を動かしながらしっかり稼ぎたい方
・前職が飲食・製造・建設などで転職を考えている方
・ブランクがあっても再スタートしたい方

【労働時間】
${shift}（実働8時間）※残業は月平均5時間以内

【休日・休暇】
完全週休2日制（希望休制度あり・土日固定も相談可）
年間休日120日以上／有給休暇10日〜（取得率80%以上）

【給与内訳】
基本給 350,000円
＋皆勤手当 15,000円
＋配達達成手当 25,000円〜80,000円（件数連動）
月収実績：平均390,000円〜430,000円

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
      'EC配送',
      '個人宅配送',
      '未経験歓迎',
      '車両貸与',
      '経費ゼロ',
      '完全週休2日',
      '月収39万円以上',
      '正社員',
      '大阪',
    ],
    faq: makeFaq(area, vol),
  };
}

const JOBS = AREAS.map(makeJob);

async function main() {
  console.log(`\n🚀 EC配送ドライバー求人（大阪 Googleしごと検索専用）${JOBS.length}件 の登録を開始します...\n`);

  const existing       = await Jobs.findAll();
  const existingTitles = new Set(existing.map(j => j.title));

  let added = 0, skipped = 0;

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
  if (added > 0) console.log('\n✅ 完了！管理画面 /admin/jobs で確認してください。');
}

main().catch(err => { console.error(err); process.exit(1); });
