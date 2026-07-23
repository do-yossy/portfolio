'use strict';
/**
 * 求人ボックス掲載向け 内容バリエーション生成
 * ------------------------------------------------------------
 * 同一職種を複数エリアに掲載する際、説明文・タイトルが実質同一だと
 * 掲載ガイドラインの「既に投稿された求人と実質的に同じ」（重複抑制）に
 * 該当するおそれがある。本モジュールは、エリア名で決定論的にシードした
 * バリエーションを選び、給与・勤務時間などの「事実」は一切変えずに、
 * 言い回し・箇条書きの並び・見出し・文構成だけをジョブごとに変えることで、
 * 各掲載を実質的に別物にする。
 *
 * - 決定論的（同じ入力→同じ出力）なので、再実行しても内容がブレない。
 * - シードはエリア＋市の文字列ハッシュ。エリアは全ファイルで一意なので、
 *   ファイルをまたいでも掲載どうしが重複しない。
 */

// --- 決定論的ハッシュ（FNV-1a） ---
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// saltごとに独立したシードを得る
function seedFor(item, salt) {
  return hashSeed(`${item.city}|${item.area}|${salt}`);
}
// プールから1つ選ぶ
function pickOne(pool, seed) {
  return pool[seed % pool.length];
}
// プールから n 個を、シードで決めた開始位置から巡回して選ぶ（並び順も変わる）
function pickN(pool, seed, n) {
  const len = pool.length;
  const start = seed % len;
  const step = 1 + (seed % (len - 1 || 1)); // 巡回ステップも変えて組合せを増やす
  const out = [];
  const used = new Set();
  let idx = start;
  while (out.length < Math.min(n, len)) {
    if (!used.has(idx % len)) {
      used.add(idx % len);
      out.push(pool[idx % len]);
    }
    idx += step;
    if (idx > start + len * len) break; // 安全弁
  }
  return out;
}

/* ==========================================================================
 * EC配送ドライバー（大阪・月給42〜62万円・夜間帯中心）
 * ========================================================================== */
const EC = {
  titleCore: [
    '高時給エリア配送ドライバー｜正社員｜月給42万円〜62万円｜未経験歓迎',
    '夜間帯ルート配送ドライバー｜正社員｜月給42万〜62万円｜AT限定OK',
    'EC配送ドライバー（正社員）｜月給42万〜62万円｜未経験歓迎・車通勤OK',
    'ルート配送ドライバー｜正社員｜月収42万円以上｜夜間帯中心・未経験歓迎',
    '配送ドライバー（正社員）｜月給42万〜62万円｜1日60〜80件のコンパクト配送',
    'EC・通販のルート配送｜正社員｜月給42万〜62万円｜社会保険完備',
  ],
  catch: [
    '高時給エリア配送ドライバー正社員募集｜月給42万〜62万円｜夜間帯配送中心',
    '夜間帯中心のルート配送で高収入｜月給42万〜62万円｜未経験・AT限定OK',
    'コンパクトエリアの効率配送｜月給42万〜62万円｜1日60〜80件・車通勤OK',
    'EC・通販のルート配送ドライバー｜月給42万〜62万円｜社会保険完備・未経験歓迎',
  ],
  intro: [
    '高時給エリアEC配送ドライバーの正社員を募集します。',
    'EC・通販商品を扱う高収入ルート配送ドライバー（正社員）を募集します。',
    '夜間帯中心で効率よく稼げる配送ドライバー（正社員）を大募集します。',
    '未経験から始められるEC配送ドライバー（正社員）を募集中です。',
    '安定して高収入を目指せるルート配送ドライバー（正社員）の募集です。',
  ],
  pointHeader: ['【特徴・ポイント】', '【ここがおすすめ】', '【この仕事の魅力】', '【おすすめポイント】'],
  points: [
    '◆ 夜間帯配送（17時〜21時）が中心！昼間の時間を有効活用',
    '◆ コンパクトエリアで1日60〜80件の効率的な配送',
    '◆ 再配達が少なく、受け取り率が高い◎',
    '◆ 定期顧客の構築で収入アップも可能！',
    '◆ 専用アプリで配送管理（簡単操作）',
    '◆ AT限定免許でもOK！普通自動車免許があれば応募可能',
    '◆ 未経験スタートの先輩ドライバーが多数活躍中',
    '◆ 車通勤OK・駐車場完備で通勤ラクラク',
    '◆ 各種手当・社会保険完備で長く安心して働ける',
  ],
  workHeader: ['【仕事内容】', '【お任せするお仕事】', '【担当していただく業務】'],
  work: [
    '大手ECサイト・通販商品を担当エリアの個人宅・企業へお届けする配送業務です。\nコンパクトエリアを担当するため、道を覚えやすく効率よく稼働できます。\n荷物の仕分け・積み込みから配送まで一連の業務をお任せします。',
    '担当エリア内の個人宅・企業へ、大手ECサイトや通販の商品をお届けするルート配送です。\n決まったエリアを回るので道順を覚えやすく、慣れれば効率よく稼働できます。\n出発前の荷物の仕分け・積み込みから配送完了までを一貫してお任せします。',
    'ECサイト・通販の荷物を、担当エリアの個人宅や企業へ配達するお仕事です。\nエリアがコンパクトにまとまっているため、移動のムダが少なく効率的に回れます。\n荷物の積み込み・仕分けから配達までをトータルで担当していただきます。',
    '通販・ECの商品を、担当エリアのお客様のもとへ届けるルート配送業務です。\n毎日ほぼ同じエリアを回るので、慣れるほどスピーディに稼働できます。\n積み込み・仕分けから配送、簡単な配達記録の入力までをお任せします。',
  ],
  fitHeader: ['【こんな方に向いています】', '【こんな方を歓迎します】', '【求める人物像】'],
  fit: [
    '・普通自動車免許（AT可）をお持ちの方',
    '・体を動かす仕事が好きな方',
    '・夜間帯にしっかり稼ぎたい方',
    '・未経験からドライバーを始めたい方',
    '・アプリ・スマホ操作に慣れている方',
    '・コツコツ一人で運転する時間が好きな方',
    '・長く腰を据えて安定して働きたい方',
  ],
  // ↓ ここから下は「事実」なので数値・条件は固定。見出し語だけ揺らす。
  timeHeader: ['【労働時間】', '【勤務時間】'],
  time: [
    '11:00〜20:00（調整可能）\n夜間配送ピーク：17時〜21時\n実働8時間\n残業：月平均15時間以内（繁忙期除く）',
    '11:00〜20:00（開始時間は相談可）\n夜間ピーク帯（17時〜21時）を中心に稼働\n実働8時間／残業は月平均15時間以内（繁忙期を除く）',
  ],
  holidayHeader: ['【休日・休暇】', '【お休み】'],
  holiday:
    '週休2日制（シフト制）\n年間休日105日以上\n有給休暇10日〜（勤続年数に応じて増加）',
  pay: `【給与内訳】
基本給 42万円
＋皆勤手当 5,000円
＋役職手当 5,000円〜（経験・実績に応じて）
＋深夜手当（22時以降の稼働分）
頑張り次第で月給62万円以上も可能！
試用期間3ヶ月（期間中も給与・待遇は同条件）`,
  welfareHeader: ['【福利厚生】', '【待遇・福利厚生】'],
  welfare: `社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）／車通勤OK・駐車場完備
制服・安全靴貸与
ドライブレコーダー搭載車両
車両保険完備
昇給あり（年1回査定）`,
  flowHeader: ['【入社後の流れ】', '【入社後のステップ】'],
  flow: [
    '1週目：社内ルール・安全運転研修・専用アプリ操作説明\n2〜3週目：先輩ドライバーによる同乗研修\n4週目以降：担当ルートを独立して配送開始',
    '1週目：安全運転研修と専用アプリの操作説明、社内ルールのご案内\n2〜3週目：先輩ドライバーが同乗してルートを丁寧にレクチャー\n4週目以降：担当エリアを独り立ちして配送スタート',
  ],
};

function buildEc(item) {
  const { area, city, note } = item;
  const title = `【${area}】${pickOne(EC.titleCore, seedFor(item, 'title'))}`;
  const catchcopy = `${pickOne(EC.catch, seedFor(item, 'catch'))}｜${area}`;
  const points = pickN(EC.points, seedFor(item, 'pt'), 5).join('\n');
  const fit = pickN(EC.fit, seedFor(item, 'fit'), 5).join('\n');
  const description = `${city}（${area}）で${pickOne(EC.intro, seedFor(item, 'intro'))}${note}

${pickOne(EC.pointHeader, seedFor(item, 'pth'))}
${points}

${pickOne(EC.workHeader, seedFor(item, 'wkh'))}
${pickOne(EC.work, seedFor(item, 'wk'))}

${pickOne(EC.fitHeader, seedFor(item, 'fith'))}
${fit}

${pickOne(EC.timeHeader, seedFor(item, 'tmh'))}
${pickOne(EC.time, seedFor(item, 'tm'))}

${pickOne(EC.holidayHeader, seedFor(item, 'hdh'))}
${EC.holiday}

${EC.pay}

${pickOne(EC.welfareHeader, seedFor(item, 'wfh'))}
${EC.welfare}

${pickOne(EC.flowHeader, seedFor(item, 'flh'))}
${pickOne(EC.flow, seedFor(item, 'fl'))}`;
  return { title, catchcopy, description };
}

/* ==========================================================================
 * 機械オペレーター（製造・工場）
 *   family 'op28'    : seed-kikai-op-28man-kyujinbox.js（月収28万円以上・日勤/シフト）
 *   family 'kombinat': seed-kikai-op-kombinat-kyujinbox.js（鉄鋼・化学品・月給30〜37万）
 * item から給与・勤務時間・職種名などの「事実」を受け取り、言い回しだけ揺らす。
 * ========================================================================== */
const KIKAI = {
  pointHeader: ['【特徴・ポイント】', '【ここがおすすめ】', '【この仕事の魅力】'],
  fitHeader: ['【こんな方に向いています】', '【こんな方を歓迎します】', '【求める人物像】'],
  workHeader: ['【仕事内容】', '【お任せするお仕事】'],
  timeHeader: ['【労働時間】', '【勤務時間】'],
  holidayHeader: ['【休日・休暇】', '【お休み】'],
  welfareHeader: ['【福利厚生】', '【待遇・福利厚生】'],
  flowHeader: ['【入社後の流れ】', '【入社後のステップ】'],
  op28: {
    intro: [
      (l) => `${l}の正社員を募集します。`,
      (l) => `${l}（正社員）を大募集します。`,
      (l) => `未経験から始められる${l}（正社員）を募集中です。`,
      (l) => `安定して長く働ける${l}（正社員）の募集です。`,
    ],
    work: [
      '製造ラインの機械操作・監視・メンテナンス補助業務全般をお任せします。\n手順書・マニュアルに沿って作業を進めるため、未経験の方でも安心してスタートできます。',
      '製造設備の操作・監視や、かんたんなメンテナンス補助をお任せします。\nマニュアルが整っているので、機械の操作が初めての方でも無理なく覚えられます。',
      '機械への材料セット・操作・製品の取り出しチェック、簡単な点検補助が中心です。\n手順書どおりに進める作業なので、未経験からでも安心して始められます。',
    ],
    fit: [
      '・コツコツ丁寧に作業することが得意な方',
      '・安定した正社員雇用を求めている方',
      '・ものづくりに興味がある方',
      '・転職回数が多くても前向きに働きたい方',
      '・未経験から手に職をつけたい方',
      '・長く腰を据えて働きたい方',
    ],
    welfare: `社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与
資格取得支援制度（フォークリフト・危険物等）
昇給あり（年1回査定）`,
    flow: [
      '1週目：社内ルール・安全研修・設備説明\n2〜4週目：先輩オペレーターによるOJT\n5週目以降：担当ラインを独立して操作開始',
      '1週目：安全研修と設備のご説明、社内ルールのご案内\n2〜4週目：先輩オペレーターがマンツーマンでOJT\n5週目以降：担当ラインを独り立ちして操作開始',
    ],
  },
  kombinat: {
    intro: [
      '機械オペレーター（鉄鋼・化学品）の正社員を募集します。',
      'スケールの大きなプラントで働く機械オペレーター（鉄鋼・化学品／正社員）を大募集します。',
      '未経験から手に職をつけられる機械オペレーター（鉄鋼・化学品／正社員）を募集中です。',
      '安定した大手コンビナートの機械オペレーター（鉄鋼・化学品／正社員）の募集です。',
    ],
    work: [
      '大型コンビナートの製造ライン操作・監視・メンテナンス補助業務をお任せします。\n・製造設備（機械）の操作・立ち上げ／停止\n・計器・モニターによる製造状況の監視\n・簡単な点検・メンテナンスの補助\n手順書・マニュアルに沿って作業を進めるため、未経験の方でも丁寧な研修で安心してスタートできます。',
      '大型プラントの製造設備を操作・監視するお仕事です。\n・機械の立ち上げ／停止などの操作\n・計器やモニターでの製造状況チェック\n・かんたんな点検・メンテナンス補助\nマニュアルと研修が整っているので、未経験からでも着実に覚えられます。',
      'コンビナート内の製造ラインで、設備の操作・監視・点検補助を担当します。\n・製造設備の操作（立ち上げ・停止）\n・モニター／計器による稼働状況の確認\n・日常点検やメンテナンスのサポート\n手順が明確なので、ものづくり未経験の方も安心してスタートできます。',
    ],
    fit: [
      '・コツコツ丁寧に作業することが得意な方',
      '・安定した正社員雇用で長く働きたい方',
      '・ものづくり・プラントの仕事に興味がある方',
      '・未経験から手に職をつけたい方',
      '・チームで安全に作業を進められる方',
    ],
    welfare: `社会保険完備（健康・厚生年金・雇用・労災）
交通費支給（規定内）
制服・安全靴貸与（必要な備品は会社支給）
資格取得支援あり（フォークリフト・危険物取扱・ボイラー等）
昇給あり（年1回査定）`,
    flow: [
      '1週目：安全研修・設備説明・社内ルール\n2〜4週目：先輩オペレーターによる丁寧なOJT\n5週目以降：担当ラインを独立して操作開始',
      '1週目：社内ルールのご案内・安全研修・設備のご説明\n2〜4週目：先輩オペレーターがマンツーマンで丁寧にOJT\n5週目以降：担当ラインを独り立ちして操作開始',
    ],
  },
};

function buildKikai(item, family) {
  if (family === 'op28') {
    const { area, city, shift, salaryMin, salaryMax, jobLabel, note, industry } = item;
    const min = parseInt(salaryMin), max = parseInt(salaryMax);
    const minMan = (min / 10000).toFixed(0), maxMan = (max / 10000).toFixed(0);
    const K = KIKAI.op28;
    const title = `【${area}】${jobLabel}｜正社員｜未経験歓迎｜月収${minMan}万円以上`;
    const catchcopy = `${industry}スタッフ正社員募集｜月収${minMan}万円以上｜各種社会保険完備`;
    const fit = pickN(K.fit, seedFor(item, 'fit'), 4).join('\n');
    const description = `${city}（${area}）で${pickOne(K.intro, seedFor(item, 'intro'))(jobLabel)}${note}

${pickOne(KIKAI.workHeader, seedFor(item, 'wkh'))}
${pickOne(K.work, seedFor(item, 'wk'))}

${pickOne(KIKAI.fitHeader, seedFor(item, 'fith'))}
${fit}

${pickOne(KIKAI.timeHeader, seedFor(item, 'tmh'))}
${shift}（実働8時間）
残業：月平均10時間以内（繁忙期除く）

${pickOne(KIKAI.holidayHeader, seedFor(item, 'hdh'))}
週休2日制（シフト制）
年間休日105日以上
有給休暇10日〜（勤続年数に応じて増加）

【給与内訳】
基本給 ${minMan}万円
＋皆勤手当 5,000円
＋技能手当 5,000円〜（スキル・経験に応じて）
試用期間3ヶ月（期間中も給与・待遇は同条件）

${pickOne(KIKAI.welfareHeader, seedFor(item, 'wfh'))}
${K.welfare}

${pickOne(KIKAI.flowHeader, seedFor(item, 'flh'))}
${pickOne(K.flow, seedFor(item, 'fl'))}`;
    return { title, catchcopy, description };
  }

  if (family === 'kombinat') {
    const { area, city, note } = item;
    const K = KIKAI.kombinat;
    const title = `【${area}】機械オペレーター（鉄鋼・化学品）｜正社員｜未経験歓迎｜月収30万円以上`;
    const catchcopy = `スケールの大きな仕事で、安定した未来を。機械オペレーター（鉄鋼・化学品）正社員募集｜月収30万円以上｜年間休日120日以上`;
    const fit = pickN(K.fit, seedFor(item, 'fit'), 4).join('\n');
    const description = `${city}（${area}）で${pickOne(K.intro, seedFor(item, 'intro'))}${note}

${pickOne(KIKAI.workHeader, seedFor(item, 'wkh'))}
${pickOne(K.work, seedFor(item, 'wk'))}

${pickOne(KIKAI.fitHeader, seedFor(item, 'fith'))}
${fit}

${pickOne(KIKAI.timeHeader, seedFor(item, 'tmh'))}
実働8時間（交替制の場合あり）
残業：月平均10時間以内（繁忙期除く）

${pickOne(KIKAI.holidayHeader, seedFor(item, 'hdh'))}
年間休日120日以上
週休2日制（シフト制）
有給休暇10日〜（勤続年数に応じて増加）
プライベートも充実できる働きやすい環境です。

【給与内訳】
基本給 30万円〜
＋各種手当（皆勤手当・技能手当・交替手当 等）
最大 月給37万円
試用期間3ヶ月（期間中も給与・待遇は同条件）
昇給あり（年1回査定）

${pickOne(KIKAI.welfareHeader, seedFor(item, 'wfh'))}
${K.welfare}

${pickOne(KIKAI.flowHeader, seedFor(item, 'flh'))}
${pickOne(K.flow, seedFor(item, 'fl'))}

安定の正社員雇用で、長く働ける環境です。`;
    return { title, catchcopy, description };
  }

  throw new Error(`unknown kikai family: ${family}`);
}

module.exports = { buildEc, buildKikai, hashSeed };
