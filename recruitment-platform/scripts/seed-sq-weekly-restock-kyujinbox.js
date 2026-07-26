'use strict';
// ルート配送ドライバー（企業配送）求人75件・1週間分追加バッチ（求人ボックス掲載）
// 関西の新規エリア（大阪市は飽和のため回避／神戸・尼崎・西宮・京都・奈良・滋賀・和歌山ほか）で構成。
// 各件ユニークな実在の市区町名。給与は「月給42万円〜62万円」。
// 冪等: 今回の勤務地のみ削除してから作り直す（他バッチは消さない）。
// 雛形: seed-route-haisou-kyujinbox17.js の AREASループ＋INSERT構造を踏襲。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

// 本ファイルは scripts/ 配下のため、__dirname から '..','data' を挟んで data/recruitment.db を解決する。
const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const HAISOU_IMAGE = '/images/ec-haisou-koujikyuu.jpg';
const SALARY_INCOME = '月給42万円〜62万円';
const SALARY_DETAIL = '月給420,000円〜620,000円（歩合・各種手当込み）';

// 本バッチ: 関西の新規エリア75件（大阪市以外・各件ユニークな実在の市区町名）。
const AREAS = [
  // 兵庫県・神戸市（各区の未使用町名）
  { pref: '兵庫県', city: '神戸市中央区', district: '三宮町',   client: '食品・飲料メーカー' },
  { pref: '兵庫県', city: '神戸市中央区', district: '元町通',   client: '工場・倉庫向け資材' },
  { pref: '兵庫県', city: '神戸市兵庫区', district: '荒田町',   client: '企業・商業施設向け日用品' },
  { pref: '兵庫県', city: '神戸市兵庫区', district: '大開通',   client: '食品・日用品卸売' },
  { pref: '兵庫県', city: '神戸市長田区', district: '大橋町',   client: '食品・工業用品メーカー' },
  { pref: '兵庫県', city: '神戸市長田区', district: '苅藻通',   client: '医療機器・事業所向け用品' },
  { pref: '兵庫県', city: '神戸市須磨区', district: '板宿町',   client: '工場・物流センター向け' },
  { pref: '兵庫県', city: '神戸市須磨区', district: '妙法寺',   client: '食品・工業資材メーカー' },
  { pref: '兵庫県', city: '神戸市垂水区', district: '舞子台',   client: '食品・飲料メーカー' },
  { pref: '兵庫県', city: '神戸市垂水区', district: '名谷町',   client: '工場・倉庫向け資材' },
  { pref: '兵庫県', city: '神戸市西区',   district: '糀台',     client: '企業・商業施設向け日用品' },
  { pref: '兵庫県', city: '神戸市西区',   district: '玉津町',   client: '食品・日用品卸売' },
  { pref: '兵庫県', city: '神戸市北区',   district: '鈴蘭台',   client: '食品・工業用品メーカー' },
  { pref: '兵庫県', city: '神戸市北区',   district: '藤原台',   client: '医療機器・事業所向け用品' },
  { pref: '兵庫県', city: '神戸市東灘区', district: '岡本',     client: '工場・物流センター向け' },
  { pref: '兵庫県', city: '神戸市東灘区', district: '御影',     client: '食品・工業資材メーカー' },
  { pref: '兵庫県', city: '神戸市灘区',   district: '六甲道',   client: '食品・飲料メーカー' },
  { pref: '兵庫県', city: '神戸市灘区',   district: '水道筋',   client: '工場・倉庫向け資材' },
  // 兵庫県・その他市
  { pref: '兵庫県', city: '尼崎市', district: '潮江',       client: '企業・商業施設向け日用品' },
  { pref: '兵庫県', city: '尼崎市', district: '武庫之荘',   client: '食品・日用品卸売' },
  { pref: '兵庫県', city: '尼崎市', district: '塚口本町',   client: '食品・工業用品メーカー' },
  { pref: '兵庫県', city: '西宮市', district: '甲子園町',   client: '医療機器・事業所向け用品' },
  { pref: '兵庫県', city: '西宮市', district: '鳴尾町',     client: '工場・物流センター向け' },
  { pref: '兵庫県', city: '西宮市', district: '甲東園',     client: '食品・工業資材メーカー' },
  { pref: '兵庫県', city: '明石市', district: '大久保町',   client: '食品・飲料メーカー' },
  { pref: '兵庫県', city: '明石市', district: '魚住町',     client: '工場・倉庫向け資材' },
  { pref: '兵庫県', city: '姫路市', district: '飾磨区細江', client: '企業・商業施設向け日用品' },
  { pref: '兵庫県', city: '姫路市', district: '広畑区東新町', client: '食品・日用品卸売' },
  { pref: '兵庫県', city: '宝塚市', district: '中筋',       client: '食品・工業用品メーカー' },
  { pref: '兵庫県', city: '宝塚市', district: '逆瀬川',     client: '医療機器・事業所向け用品' },
  { pref: '兵庫県', city: '川西市', district: '火打',       client: '工場・物流センター向け' },
  { pref: '兵庫県', city: '川西市', district: '多田院',     client: '食品・工業資材メーカー' },
  { pref: '兵庫県', city: '伊丹市', district: '昆陽',       client: '食品・飲料メーカー' },
  { pref: '兵庫県', city: '伊丹市', district: '千僧',       client: '工場・倉庫向け資材' },
  { pref: '兵庫県', city: '加古川市', district: '尾上町',   client: '企業・商業施設向け日用品' },
  { pref: '兵庫県', city: '三田市', district: 'けやき台',   client: '食品・日用品卸売' },
  // 京都府・京都市（各区の未使用町名）
  { pref: '京都府', city: '京都市中京区', district: '壬生',   client: '食品・工業用品メーカー' },
  { pref: '京都府', city: '京都市中京区', district: '西ノ京', client: '医療機器・事業所向け用品' },
  { pref: '京都府', city: '京都市下京区', district: '中堂寺', client: '工場・物流センター向け' },
  { pref: '京都府', city: '京都市下京区', district: '西七条', client: '食品・工業資材メーカー' },
  { pref: '京都府', city: '京都市南区',   district: '東九条', client: '食品・飲料メーカー' },
  { pref: '京都府', city: '京都市南区',   district: '吉祥院', client: '工場・倉庫向け資材' },
  { pref: '京都府', city: '京都市伏見区', district: '深草',   client: '企業・商業施設向け日用品' },
  { pref: '京都府', city: '京都市伏見区', district: '桃山町', client: '食品・日用品卸売' },
  { pref: '京都府', city: '京都市山科区', district: '椥辻',   client: '食品・工業用品メーカー' },
  { pref: '京都府', city: '京都市山科区', district: '勧修寺', client: '医療機器・事業所向け用品' },
  { pref: '京都府', city: '京都市右京区', district: '太秦',   client: '工場・物流センター向け' },
  { pref: '京都府', city: '京都市右京区', district: '西院',   client: '食品・工業資材メーカー' },
  { pref: '京都府', city: '京都市左京区', district: '一乗寺', client: '食品・飲料メーカー' },
  { pref: '京都府', city: '京都市左京区', district: '北白川', client: '工場・倉庫向け資材' },
  // 京都府・その他市
  { pref: '京都府', city: '宇治市',   district: '小倉町',   client: '企業・商業施設向け日用品' },
  { pref: '京都府', city: '宇治市',   district: '槇島町',   client: '食品・日用品卸売' },
  { pref: '京都府', city: '亀岡市',   district: '篠町',     client: '食品・工業用品メーカー' },
  { pref: '京都府', city: '城陽市',   district: '寺田',     client: '医療機器・事業所向け用品' },
  { pref: '京都府', city: '向日市',   district: '寺戸町',   client: '工場・物流センター向け' },
  { pref: '京都府', city: '長岡京市', district: '神足',     client: '食品・工業資材メーカー' },
  // 奈良県
  { pref: '奈良県', city: '奈良市',     district: '学園北',     client: '食品・飲料メーカー' },
  { pref: '奈良県', city: '奈良市',     district: '西大寺本町', client: '工場・倉庫向け資材' },
  { pref: '奈良県', city: '橿原市',     district: '八木町',     client: '企業・商業施設向け日用品' },
  { pref: '奈良県', city: '大和郡山市', district: '小泉町',     client: '食品・日用品卸売' },
  { pref: '奈良県', city: '生駒市',     district: '東生駒',     client: '食品・工業用品メーカー' },
  { pref: '奈良県', city: '香芝市',     district: '五位堂',     client: '医療機器・事業所向け用品' },
  // 滋賀県
  { pref: '滋賀県', city: '大津市', district: '石山寺',   client: '工場・物流センター向け' },
  { pref: '滋賀県', city: '大津市', district: '堅田',     client: '食品・工業資材メーカー' },
  { pref: '滋賀県', city: '草津市', district: '野路町',   client: '食品・飲料メーカー' },
  { pref: '滋賀県', city: '彦根市', district: '平田町',   client: '工場・倉庫向け資材' },
  { pref: '滋賀県', city: '守山市', district: '播磨田町', client: '企業・商業施設向け日用品' },
  { pref: '滋賀県', city: '栗東市', district: '手原',     client: '食品・日用品卸売' },
  // 和歌山県
  { pref: '和歌山県', city: '和歌山市', district: '黒田',   client: '食品・工業用品メーカー' },
  { pref: '和歌山県', city: '和歌山市', district: '秋葉町', client: '医療機器・事業所向け用品' },
  { pref: '和歌山県', city: '岩出市',   district: '根来',   client: '工場・物流センター向け' },
  // 大阪府（大阪市は回避・未使用の市区町名に限る）
  { pref: '大阪府', city: '堺市中区',   district: '深井沢町', client: '食品・工業資材メーカー' },
  { pref: '大阪府', city: '東大阪市', district: '長田',     client: '食品・飲料メーカー' },
  { pref: '大阪府', city: '豊中市',   district: '岡町',     client: '工場・倉庫向け資材' },
  { pref: '大阪府', city: '吹田市',   district: '江坂町',   client: '企業・商業施設向け日用品' },
];

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='ルート配送ドライバー（企業配送）' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存の同一勤務地バッチを削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,'sq',?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const id = crypto.randomBytes(10).toString('hex');
  const title = `【${areaLabel}】ルート配送ドライバー正社員募集｜${SALARY_INCOME}・法人固定ルート・未経験歓迎`;
  const catchcopy = `${SALARY_INCOME}／固定ルートで安心！${j.client}の商品を担当エリアにお届け。日勤メイン・1日20〜40件・取引先固定で効率よく高収入を実現。年齢不問・ブランクOK・幅広い世代が活躍中。`;
  const description = `■お仕事内容
法人・事業所への固定ルート配送がメインのお仕事です。${j.client}の商品を、担当エリアの企業・施設へ定期的にお届けします。
軽バン・小型トラック（社用車）を使って、毎日決まったルートで配送する安心のお仕事です。

■主な業務
・${j.client}の商品を法人・事業所へ定期配送
・出発前の車両点検・荷積み（荷積み補助あり）
・納品・荷降ろし（荷降ろし補助あり）
・受け取りサイン・引き取り業務
・配達記録の入力・管理

※固定ルート・固定取引先で安心して働けます
※1日の配達件数：20〜40件（法人向けのため個人宅より件数少なめ）
※荷物はやや重めですが、荷積み・荷降ろし補助あり
※日勤メイン（8:00〜17:00）
※ナビ使用のため土地感不要
※個人宅配送と異なり、不在による再配達がほぼなし

■アピールポイント
◎${SALARY_INCOME}の高収入
業界最高水準の報酬体系。法人配送ならではの効率的な配達で高収入を実現。

◎固定ルート・固定取引先で安心
毎日同じルート・同じ取引先への配送なので、慣れれば効率が上がり収入もアップ。

◎日勤メインで生活リズムが整う
基本は8:00〜17:00の日勤。プライベートの時間を確保できます。

◎車両・ガソリン・保険・メンテ費用はすべて会社負担
マイカー不要。コストは一切かかりません。

◎未経験歓迎・充実の研修
先輩スタッフが同行して丁寧に指導。1〜2週間で独り立ちできます。

◎幅広い世代が活躍・ブランクOK
年齢不問。20代〜60代まで幅広い世代が活躍中。ブランクのある方も歓迎です。

◎応募後は最短当日〜翌営業日にご連絡
お待たせせずスピーディーに選考を進めます。まずはお気軽にご応募ください。

【給与】
${SALARY_DETAIL}

【シフト・勤務時間】
日勤メイン（8:00〜17:00）
実働8時間・シフト制（希望休あり）

【休日・休暇】
完全週休2日制
年間休日120日以上
有給休暇・慶弔休暇

【応募資格】
普通自動車運転免許（AT限定可）
年齢・学歴・経験不問（未経験・ブランクのある方も歓迎）

【待遇・福利厚生】
社会保険完備（健康・厚生年金・雇用・労災）
車両・燃料・保険費用すべて会社負担
ユニフォーム支給
研修制度あり
昇給年1回
賞与年2回

【入社後の流れ】
1週目：社内研修・配達ルール説明
2〜3週目：先輩スタッフ同行OJT
4週目以降：担当ルートを独立して配送

転勤なし
車通勤可能（駐車場あり）
【勤務期間】長期`;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', 'AT限定OK',
    '車両費用会社負担', '日勤メイン', '固定ルート', '年齢不問',
    'ブランクOK', '幅広い世代活躍',
  ]);
  const rewarding = `固定ルートで法人配送する安心のお仕事。${SALARY_INCOME}の高収入で、慣れれば配達効率がどんどん上がります。年齢不問・ブランクOKで、幅広い世代が活躍しています。${j.client}の商品を担当エリアにお届けする、やりがいのある仕事です。`;
  const worktime = '日勤メイン（8:00〜17:00）　実働8時間・シフト制　完全週休2日　年間休日120日以上';
  const transport = `${j.pref}${j.city}${j.district}エリア。車通勤OK・無料駐車場完備。社用車（軽バン・小型トラック）を貸与するため、マイカー不要です。`;
  const howToApply = [
    '【応募後のご案内】',
    '',
    'ご応募確認後、採用受付代行担当者よりお電話にてご連絡いたします。',
    '',
    'また、ご経験・ご希望条件等を踏まえ、ご本人の同意をいただいた上で、関連求人や提携企業求人をご案内させていただく場合がございます。',
  ].join('\n');

  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, 'ルート配送ドライバー（企業配送）', '正社員',
    description, tags, catchcopy, HAISOU_IMAGE,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now,
    rewarding, worktime, transport, howToApply,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 60)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（ルート配送ドライバー（企業配送）・1週間分追加バッチ・関西新規エリア75件）`);
