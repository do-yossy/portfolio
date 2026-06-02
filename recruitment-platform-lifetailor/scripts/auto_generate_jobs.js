'use strict';

/**
 * 軽貨物・軽配送求人 自動生成スクリプト
 * 毎日実行してエリア×職種の組み合わせで求人を自動作成
 *
 * 使い方: node scripts/auto_generate_jobs.js
 */

const { Jobs } = require('../db-factory');

const JOB_TYPES = [
  { title: '軽貨物ドライバー', type: '軽貨物' },
  { title: '軽配送ドライバー', type: '軽配送' },
  { title: '宅配ドライバー',   type: '宅配' },
  { title: '配送スタッフ',     type: '配送' },
  { title: 'ラストワンマイル配送ドライバー', type: 'ラストワンマイル' },
];

const AREAS_OSAKA = [
  '大阪市北区', '大阪市中央区', '大阪市天王寺区', '大阪市浪速区', '大阪市西区',
  '大阪市港区', '大阪市大正区', '大阪市住之江区', '大阪市住吉区', '大阪市東住吉区',
  '大阪市平野区', '大阪市西成区', '大阪市淀川区', '大阪市東淀川区', '大阪市西淀川区',
  '大阪市此花区', '大阪市鶴見区', '大阪市城東区', '大阪市旭区', '大阪市都島区',
  '大阪市福島区', '大阪市阿倍野区',
  '堺市', '豊中市', '吹田市', '高槻市', '東大阪市', '八尾市', '寝屋川市', '枚方市',
  '茨木市', '摂津市', '門真市', '守口市', '大東市', '四條畷市', '松原市', '富田林市',
  '和泉市', '岸和田市', '泉大津市',
];

const AREAS_HYOGO = [
  '尼崎市', '西宮市', '芦屋市', '伊丹市', '宝塚市', '川西市',
  '神戸市東灘区', '神戸市灘区', '神戸市中央区', '神戸市兵庫区', '神戸市長田区',
];

const ALL_AREAS = [...AREAS_OSAKA, ...AREAS_HYOGO];

// 求人説明文テンプレート（バリエーションで重複を避ける）
const DESCRIPTION_TEMPLATES = [
  (area, jobType) => `【${area}エリア】${jobType}として活躍しませんか？

■ 仕事内容
${area}を中心に軽自動車を使った配送業務をお任せします。
個人宅・企業への荷物のお届けがメインです。
ルート配送なので覚えやすく、未経験の方も安心してスタートできます。

■ 勤務地
${area}およびその周辺エリア

■ 給与
月給25万円〜35万円（経験・スキルにより優遇）
※歩合給あり・頑張りが収入に直結します

■ 勤務時間
8:00〜18:00（実働8時間）
シフト制・週5日勤務

■ 待遇・福利厚生
・社会保険完備
・交通費支給
・車両貸与あり
・未経験歓迎
・普通自動車免許（AT限定可）

■ こんな方を歓迎します
・体を動かす仕事がしたい方
・稼ぎたい方
・地域に貢献したい方`,

  (area, jobType) => `【急募・${area}】${jobType}募集中！

◆ お仕事内容
${area}エリアでの軽自動車による配送業務です。
主に個人宅への宅配がメインとなります。
1日40〜80件程度のお届け、ルートはスマホナビで案内します。

◆ 勤務場所
${area}（最寄り駅・営業所より出発）

◆ 給与・報酬
月収28万円〜40万円可能
経験者優遇・歩合制で青天井

◆ 勤務時間
早番 7:00〜17:00
遅番 10:00〜20:00
※希望シフト考慮します

◆ 必要資格
普通自動車免許（AT可）

◆ 福利厚生
社保完備／車両貸与／燃料費支給／昇給あり`,

  (area, jobType) => `${area}で${jobType}を募集しています

【仕事内容】
${area}エリアを担当していただく配送ドライバーを募集しています。
軽自動車で個人宅・マンション・企業への荷物配達をお任せします。
未経験の方も丁寧に研修しますので安心してください。

【給与】
月給25万円〜（試用期間3ヶ月：月給22万円）
経験・能力により応相談

【勤務時間】
9:00〜19:00（休憩1時間含む）
週休2日制

【応募資格】
・普通自動車免許をお持ちの方（AT限定可）
・未経験歓迎
・18歳以上

【会社の特徴】
安定した取引先を持つ配送会社です。
社員の定着率が高く、長く働ける環境を整えています。`,
];

function getDescriptionTemplate(index) {
  return DESCRIPTION_TEMPLATES[index % DESCRIPTION_TEMPLATES.length];
}

// 全組み合わせリストを生成
function generateAllCombinations() {
  const combinations = [];
  for (const area of ALL_AREAS) {
    for (const job of JOB_TYPES) {
      combinations.push({ area, job });
    }
  }
  return combinations;
}

// 今日の日付ベースでどの組み合わせを使うか決定（サイクル）
function getTodayCombinations(count) {
  const combinations = generateAllCombinations();
  const today = new Date();
  const dayIndex = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
  const startIndex = (dayIndex * count) % combinations.length;

  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(combinations[(startIndex + i) % combinations.length]);
  }
  return result;
}

// 30日後の日付を取得
function getExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

async function main() {
  const args = process.argv.slice(2);
  const kyujinboxCount = parseInt(args[0]) || 25;
  const stanbyCount    = parseInt(args[1]) || 16;
  const totalCount = Math.max(kyujinboxCount, stanbyCount);

  console.log(`[auto_generate] 本日の求人生成を開始します`);
  console.log(`[auto_generate] 求人ボックス: ${kyujinboxCount}件 / スタンバイ: ${stanbyCount}件`);

  // 30日以上前の求人を削除
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 30);

  try {
    const allJobs = await Jobs.findAll(false);
    let deletedCount = 0;
    for (const job of allJobs) {
      const createdAt = new Date(job.created_at);
      if (createdAt < expiredDate) {
        await Jobs.delete(job.id);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      console.log(`[auto_generate] ${deletedCount}件の期限切れ求人を削除しました`);
    }
  } catch (e) {
    console.error('[auto_generate] 削除エラー:', e.message);
  }

  // 今日の求人を生成
  const todayCombinations = getTodayCombinations(totalCount);
  let created = 0;

  for (let i = 0; i < todayCombinations.length; i++) {
    const { area, job } = todayCombinations[i];
    const templateFn = getDescriptionTemplate(i);
    const description = templateFn(area, job.title);

    const targetMedia = [];
    if (i < kyujinboxCount) targetMedia.push('求人ボックス');
    if (i < stanbyCount)    targetMedia.push('スタンバイ');

    try {
      await Jobs.create({
        title:          `${area}｜${job.title}｜正社員`,
        location:       area,
        salary:         '月給25万円〜40万円',
        employmentType: '正社員',
        description,
        tags:           `軽貨物,軽配送,ドライバー,${area}`,
        targetMedia:    JSON.stringify(targetMedia),
        isPublished:    true,
        expiresAt:      getExpiry(),
      });
      created++;
      console.log(`[auto_generate] ✅ 作成: ${area}｜${job.title}`);
    } catch (e) {
      console.error(`[auto_generate] ❌ 失敗: ${area}｜${job.title}:`, e.message);
    }
  }

  console.log(`[auto_generate] 完了: ${created}件作成`);
}

main().catch(console.error);
