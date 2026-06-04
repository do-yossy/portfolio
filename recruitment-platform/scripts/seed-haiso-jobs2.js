#!/usr/bin/env node
'use strict';
/**
 * 軽貨物宅配ドライバー求人 追加25件 一括登録スクリプト（第2弾）
 * 大阪府南部・東部・北部・大阪市内残エリア
 *
 * 実行方法（recruitment-platform ディレクトリで）:
 *   node --experimental-sqlite scripts/seed-haiso-jobs2.js
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
const TARGET_MEDIA = ['kyujinbox', 'google', 'stanby'];
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
      q: '月収30万円以上は保証されますか？',
      a: '基本給27万円を保証した上で、皆勤手当・配達達成手当が加算されます。入社3か月以内の実績でも月平均32万円以上を達成しているドライバーが多数います。',
    },
  ];
}

const AREAS = [
  // 大阪市内 残エリア
  { area: '此花区・桜島・伝法',    city: '大阪市此花区',    shift: '8:00〜17:00', vol: '65〜90件',  note: '工場・住宅混在エリアで配達効率が良い' },
  { area: '港区・弁天町・市岡',    city: '大阪市港区',     shift: '8:00〜17:00', vol: '65〜90件',  note: 'マンションが多くまとめ配達しやすい' },
  { area: '大正区・泉尾・三軒家',  city: '大阪市大正区',   shift: '8:00〜17:00', vol: '65〜90件',  note: '下町エリアで在宅率が高い' },
  { area: '西淀川区・姫島・歌島',  city: '大阪市西淀川区', shift: '8:00〜17:00', vol: '65〜90件',  note: '一戸建てが多く置き配対応で効率アップ' },
  { area: '住之江区・北加賀屋',    city: '大阪市住之江区', shift: '8:00〜17:00', vol: '70〜100件', note: '新興住宅地でファミリー層が多い' },
  { area: '西成区・玉出・岸里',    city: '大阪市西成区',   shift: '8:30〜17:30', vol: '70〜95件',  note: '住宅密集地でルート習熟後に高件数可能' },
  // 大阪府北部
  { area: '高槻市・富田・芥川',    city: '大阪府高槻市',   shift: '8:00〜17:00', vol: '70〜100件', note: '大規模住宅地で配達先が密集している' },
  { area: '茨木市・総持寺・宇野辺', city: '大阪府茨木市',   shift: '8:00〜17:00', vol: '70〜100件', note: '新興住宅地が多く在宅率が高め' },
  { area: '摂津市・鳥飼・千里丘',  city: '大阪府摂津市',   shift: '8:00〜17:00', vol: '65〜90件',  note: '工場・住宅混在で多様な配達先がある' },
  { area: '箕面市・牧落・桜井',    city: '大阪府箕面市',   shift: '8:00〜17:00', vol: '65〜90件',  note: '閑静な住宅街で駐車環境が良好' },
  { area: '池田市・石橋・川西',    city: '大阪府池田市',   shift: '8:00〜17:00', vol: '60〜85件',  note: '一戸建てが多く落ち着いて配達できる' },
  // 大阪府南部
  { area: '岸和田市・蛸地蔵・春木', city: '大阪府岸和田市', shift: '8:00〜17:00', vol: '70〜100件', note: '住宅地が広がり配達ルートが組みやすい' },
  { area: '貝塚市・水間・近木',    city: '大阪府貝塚市',   shift: '8:00〜17:00', vol: '60〜85件',  note: '郊外住宅地で一戸建て比率が高い' },
  { area: '泉佐野市・日根野・長滝', city: '大阪府泉佐野市', shift: '8:00〜17:00', vol: '65〜90件',  note: '空港周辺の新興住宅地で在宅率高め' },
  { area: '富田林市・金剛・喜志',  city: '大阪府富田林市', shift: '8:00〜17:00', vol: '65〜90件',  note: '丘陵住宅地で一戸建て多く置き配率高め' },
  { area: '河内長野市・三日市',    city: '大阪府河内長野市', shift: '8:00〜17:00', vol: '55〜80件', note: '山手の閑静な住宅街、駐車スペース充実' },
  { area: '大阪狭山市・狭山',      city: '大阪府大阪狭山市', shift: '8:00〜17:00', vol: '55〜80件', note: '計画的な住宅街で整備された道路が多い' },
  // 大阪府東部
  { area: '大東市・野崎・住道',    city: '大阪府大東市',   shift: '8:00〜17:00', vol: '65〜90件',  note: 'マンション・一戸建て均等でバランスよく配達' },
  { area: '柏原市・高井田・国分',  city: '大阪府柏原市',   shift: '8:00〜17:00', vol: '60〜85件',  note: '住宅地が集中しルート効率が良い' },
  { area: '羽曳野市・古市・駒ヶ谷', city: '大阪府羽曳野市', shift: '8:00〜17:00', vol: '65〜90件',  note: '一戸建て中心の住宅地で落ち着いて配達' },
  { area: '藤井寺市・道明寺',      city: '大阪府藤井寺市', shift: '8:00〜17:00', vol: '55〜80件',  note: '小規模だが住宅密集度が高く効率的' },
  { area: '四條畷市・忍ヶ丘',      city: '大阪府四條畷市', shift: '8:00〜17:00', vol: '55〜80件',  note: '丘陵住宅地で在宅率高め' },
  { area: '交野市・星田・私市',    city: '大阪府交野市',   shift: '8:00〜17:00', vol: '55〜80件',  note: '落ち着いた住宅地でストレス少なく配達' },
  { area: '和泉市・岸和田北・春木', city: '大阪府和泉市',   shift: '8:00〜17:00', vol: '65〜90件',  note: '新興住宅地が増加中で若いファミリー層多い' },
  { area: '泉大津市・松ノ浜',      city: '大阪府泉大津市', shift: '8:00〜17:00', vol: '60〜85件',  note: '住宅地が密集し効率的に周回できる' },
];

function makeJob(item) {
  const { area, city, shift, vol, note } = item;
  return {
    title:     `【${area}】軽貨物宅配ドライバー募集（正社員・月収30万円以上）`,
    location:  city,
    salary:    '月給270,000円〜400,000円',
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
基本給 270,000円
＋皆勤手当 10,000円
＋配達達成手当 10,000円〜50,000円（件数連動）
月収実績：平均320,000円〜360,000円

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
  console.log(`\n🚀 軽貨物宅配ドライバー求人（第2弾）${JOBS.length}件 の登録を開始します...\n`);

  const existing       = await Jobs.findAll();
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
