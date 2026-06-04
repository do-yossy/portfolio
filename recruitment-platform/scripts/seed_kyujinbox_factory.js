'use strict';

// 求人ボックス向け：倉庫作業・検品・機械オペレーターの正社員求人を各エリア1件ずつ作成
// 条件: 月給27〜38万円（ランダム）/ 日勤 / 完全週休二日制 / 未経験可
// 応募が集まりやすいシンプルな軽作業系の職種にしている（自動車系は避ける）
const { db, Jobs } = require('../db');

// 旧バッチ（製造・工場スタッフ）が残っていれば削除して作り直す
const OLD_PATTERN = '%製造・工場スタッフ｜正社員｜未経験歓迎｜日勤・土日休み%';

// 職種テンプレート（倉庫・検品・機械オペレーター）
const ROLES = {
  warehouse: {
    jobType: '倉庫内軽作業',
    titleRole: '倉庫内軽作業（ピッキング・仕分け）',
    work: `・棚から指定の商品を集めるピッキング
・商品の仕分け・棚入れ
・出荷前の梱包・ラベル貼り
ハンディ端末を使った簡単な作業が中心で、重量物はほとんどありません。`,
    appeal: 'もくもく作業が好きな方にぴったり。覚えることが少なく、初日から活躍できます。',
    reward: '商品をピッキング・仕分けするシンプルな軽作業。立ち仕事ですが重い荷物は少なく、体への負担が軽めです。',
  },
  inspection: {
    jobType: '検品・検査',
    titleRole: '検品・検査スタッフ',
    work: `・完成した製品にキズや汚れがないかの目視チェック
・サイズや数量の確認
・問題のある製品の取り分け
座り作業・立ち作業どちらもあり、細かい作業が好きな方に向いています。`,
    appeal: '丁寧にコツコツ取り組める方を歓迎。空調完備の快適な環境で一年中働きやすいです。',
    reward: '製品の状態を目視でチェックするシンプルな検品作業。きれいな環境で座り作業中心の職場もあります。',
  },
  operator: {
    jobType: '機械オペレーター',
    titleRole: '機械オペレーター',
    work: `・機械に材料をセットしてボタンを操作
・加工された製品の取り出し・チェック
・かんたんな機械のメンテナンス
操作はマニュアル化されているので、機械を触るのが初めての方でも安心です。`,
    appeal: '機械が作業してくれるので体力に自信がなくてもOK。手に職をつけたい方にもおすすめです。',
    reward: '機械の操作・監視がメインのお仕事。一度覚えれば安定して働け、スキルも身につきます。',
  },
};

// エリアごとの設定（職種・給与）
const AREAS = [
  { loc: '宮城県黒川郡',   salary: [28, 34], role: 'warehouse' },
  { loc: '愛知県大府市',   salary: [29, 36], role: 'inspection' },
  { loc: '愛知県刈谷市',   salary: [29, 37], role: 'operator' },
  { loc: '愛知県豊田市',   salary: [30, 38], role: 'warehouse' },
  { loc: '三重県いなべ市', salary: [28, 35], role: 'inspection' },
  { loc: '愛知県田原市',   salary: [29, 37], role: 'operator' },
  { loc: '千葉県浦安市',   salary: [27, 33], role: 'warehouse' },
  { loc: '群馬県太田市',   salary: [28, 36], role: 'inspection' },
  { loc: '岩手県北上市',   salary: [28, 34], role: 'operator' },
  { loc: '神奈川県相模原市', salary: [29, 37], role: 'warehouse' },
];

function buildDescription(a, r) {
  return `${a.loc}のきれいな倉庫・工場での${r.titleRole}のお仕事です。${r.appeal}

【仕事内容】
${r.work}

【未経験者が活躍中】
スタッフの約8割が未経験スタート。先輩が一から丁寧に教えるので、ブランクのある方や初めての方でも安心してスタートできます。

【正社員で安定】
・賞与年2回 / 昇給年1回
・各種社会保険完備
・交通費支給 / 制服貸与
・長期で安定して働けます

【働きやすさ】
・日勤のみでプライベートも充実
・完全週休2日制（土日）で予定が立てやすい
・空調完備で一年中快適

【こんな方を歓迎】
・コツコツ取り組むのが得意な方
・安定した正社員を目指す方
・未経験から手に職をつけたい方`;
}

(function main() {
  // 旧バッチを削除
  const old = db.prepare(`SELECT id FROM jobs WHERE title LIKE ?`).all(OLD_PATTERN);
  for (const o of old) Jobs.delete(o.id);
  if (old.length) console.log(`旧「製造・工場スタッフ」求人 ${old.length} 件を削除しました。\n`);

  let created = 0;
  for (const a of AREAS) {
    const r = ROLES[a.role];
    const title = `【${a.loc}】${r.titleRole}｜正社員｜未経験歓迎｜日勤・土日休み`;
    const salaryStr = `月給${a.salary[0]}万円〜${a.salary[1]}万円（各種手当込・試用期間3ヶ月／同条件）`;
    const catchcopy = `未経験OK／日勤のみ／完全週休2日／月給${a.salary[0]}万円〜${a.salary[1]}万円`;
    const ts = new Date().toISOString();
    Jobs.create({
      title,
      location: a.loc,
      salary: salaryStr,
      jobType: r.jobType,
      employmentType: '正社員',
      description: buildDescription(a, r),
      tags: [r.jobType, '正社員', '日勤', '完全週休2日', '未経験歓迎', '軽作業'],
      catchcopy,
      isPublished: true,
      publishedAt: ts,
      targetMedia: ['求人ボックス'],
      company: 'sq',
      rewarding: r.reward,
      worktimeHoliday: '日勤のみ（8:00〜17:00 など）／完全週休2日制（土日）／年間休日120日以上／GW・夏季・年末年始の長期休暇あり／有給休暇',
      transportation: '規定により支給',
      howToApply: 'ウェブフォームまたはお電話からご応募ください。書類選考後、面接（1回）を実施します。お気軽にご応募ください。',
    });
    created++;
    console.log(`✓ ${title}  (${salaryStr})`);
  }
  console.log(`\n求人ボックス向け 倉庫・検品・機械オペレーター 正社員求人を ${created} 件作成しました。`);
})();
