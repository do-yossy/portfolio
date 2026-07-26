'use strict';
// コスメ配送ドライバー 追加求人75件（Bigeyes・求人ボックス掲載／1週間分の追加補充=weekly restock）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給39万円〜45万円
// 本文・タイトル・キャッチコピーは vary.build('bg_cosme_haisou', areaLabel) で
// エリアごとに決定論的に生成（雛形 seed-cosme-haisou-bigeyes-kyujinbox.js を踏襲）
// ※勤務地は「大阪市」を避け、関西の新エリア（大阪市以外の実在市区町名）で構成
// 冪等: 今回の勤務地のみ削除してから作り直す（既存の他バッチは消さない）

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
// このファイルは scripts/ 配下のため、lib は同階層の './lib/...' で解決する
const vary = require('./lib/kyujinbox-vary-bgst');

// このファイルは scripts/ 配下のため、data は一つ上の '..','data' を挟んで解決する
const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

const COMPANY = 'bg';
const IMAGE_URL = '/images/cosme-haisou.jpg';
const JOB_TYPE = 'コスメ配送ドライバー';
const TITLE_TAIL = '未経験歓迎★コスメ業界を支えるルート配送★月給39万円以上★会社車両完備';
const SALARY_DETAIL = '月給390,000円〜450,000円';

// 関西の新エリア75件（大阪市は使用せず、実在の市区町名でユニークに構成）
const AREAS = [
  // ── 兵庫県（28件）──
  { pref: '兵庫県', city: '神戸市',     district: '中央区三宮町' },
  { pref: '兵庫県', city: '神戸市',     district: '中央区元町通' },
  { pref: '兵庫県', city: '神戸市',     district: '兵庫区新開地' },
  { pref: '兵庫県', city: '神戸市',     district: '長田区二葉町' },
  { pref: '兵庫県', city: '神戸市',     district: '須磨区板宿町' },
  { pref: '兵庫県', city: '神戸市',     district: '垂水区名谷町' },
  { pref: '兵庫県', city: '神戸市',     district: '西区糀台' },
  { pref: '兵庫県', city: '神戸市',     district: '北区藤原台中町' },
  { pref: '兵庫県', city: '神戸市',     district: '東灘区岡本' },
  { pref: '兵庫県', city: '神戸市',     district: '灘区六甲道' },
  { pref: '兵庫県', city: '尼崎市',     district: '武庫之荘' },
  { pref: '兵庫県', city: '尼崎市',     district: '塚口本町' },
  { pref: '兵庫県', city: '西宮市',     district: '甲子園' },
  { pref: '兵庫県', city: '西宮市',     district: '甲東園' },
  { pref: '兵庫県', city: '明石市',     district: '大久保町' },
  { pref: '兵庫県', city: '明石市',     district: '魚住町' },
  { pref: '兵庫県', city: '姫路市',     district: '白浜町' },
  { pref: '兵庫県', city: '姫路市',     district: '花田町' },
  { pref: '兵庫県', city: '宝塚市',     district: '逆瀬川' },
  { pref: '兵庫県', city: '宝塚市',     district: '売布' },
  { pref: '兵庫県', city: '川西市',     district: '火打' },
  { pref: '兵庫県', city: '川西市',     district: '平野' },
  { pref: '兵庫県', city: '伊丹市',     district: '昆陽' },
  { pref: '兵庫県', city: '伊丹市',     district: '鴻池' },
  { pref: '兵庫県', city: '加古川市',   district: '加古川町' },
  { pref: '兵庫県', city: '加古川市',   district: '別府町' },
  { pref: '兵庫県', city: '三田市',     district: '三輪' },
  { pref: '兵庫県', city: '三田市',     district: 'フラワータウン' },
  // ── 京都府（20件）──
  { pref: '京都府', city: '京都市',     district: '中京区壬生' },
  { pref: '京都府', city: '京都市',     district: '中京区西ノ京' },
  { pref: '京都府', city: '京都市',     district: '下京区四条' },
  { pref: '京都府', city: '京都市',     district: '下京区七条' },
  { pref: '京都府', city: '京都市',     district: '南区東九条' },
  { pref: '京都府', city: '京都市',     district: '南区吉祥院' },
  { pref: '京都府', city: '京都市',     district: '伏見区深草' },
  { pref: '京都府', city: '京都市',     district: '伏見区桃山町' },
  { pref: '京都府', city: '京都市',     district: '山科区椥辻' },
  { pref: '京都府', city: '京都市',     district: '山科区勧修寺' },
  { pref: '京都府', city: '京都市',     district: '右京区太秦' },
  { pref: '京都府', city: '京都市',     district: '右京区嵯峨' },
  { pref: '京都府', city: '京都市',     district: '左京区一乗寺' },
  { pref: '京都府', city: '京都市',     district: '左京区北白川' },
  { pref: '京都府', city: '宇治市',     district: '小倉町' },
  { pref: '京都府', city: '宇治市',     district: '槇島町' },
  { pref: '京都府', city: '亀岡市',     district: '篠町' },
  { pref: '京都府', city: '城陽市',     district: '寺田' },
  { pref: '京都府', city: '向日市',     district: '寺戸町' },
  { pref: '京都府', city: '長岡京市',   district: '神足' },
  // ── 奈良県（10件）──
  { pref: '奈良県', city: '奈良市',     district: '西大寺' },
  { pref: '奈良県', city: '奈良市',     district: '学園前' },
  { pref: '奈良県', city: '奈良市',     district: '富雄' },
  { pref: '奈良県', city: '橿原市',     district: '八木町' },
  { pref: '奈良県', city: '橿原市',     district: '今井町' },
  { pref: '奈良県', city: '大和郡山市', district: '筒井町' },
  { pref: '奈良県', city: '大和郡山市', district: '小泉町' },
  { pref: '奈良県', city: '生駒市',     district: '東生駒' },
  { pref: '奈良県', city: '生駒市',     district: '俵口町' },
  { pref: '奈良県', city: '香芝市',     district: '五位堂' },
  // ── 滋賀県（10件）──
  { pref: '滋賀県', city: '大津市',     district: 'におの浜' },
  { pref: '滋賀県', city: '大津市',     district: '石山' },
  { pref: '滋賀県', city: '大津市',     district: '堅田' },
  { pref: '滋賀県', city: '草津市',     district: '野路' },
  { pref: '滋賀県', city: '草津市',     district: '南草津' },
  { pref: '滋賀県', city: '彦根市',     district: '銀座町' },
  { pref: '滋賀県', city: '彦根市',     district: '高宮町' },
  { pref: '滋賀県', city: '守山市',     district: '勝部' },
  { pref: '滋賀県', city: '栗東市',     district: '綣' },
  { pref: '滋賀県', city: '栗東市',     district: '手原' },
  // ── 和歌山県（4件）──
  { pref: '和歌山県', city: '和歌山市', district: '本町' },
  { pref: '和歌山県', city: '和歌山市', district: '美園町' },
  { pref: '和歌山県', city: '和歌山市', district: '手平' },
  { pref: '和歌山県', city: '岩出市',   district: '岡田' },
  // ── 大阪府（大阪市以外・3件）──
  { pref: '大阪府', city: '堺市',       district: '北区中百舌鳥町' },
  { pref: '大阪府', city: '豊中市',     district: '蛍池' },
  { pref: '大阪府', city: '吹田市',     district: '江坂町' },
];

// ── 求人ボックス下書き 5148-4590-0001 の正式全文（都内近郊→関西近郊のみ置換）──
const DESCRIPTION = `事業拡大および生産体制強化に伴い、関西エリアで新たな仲間を募集しています。

現在、多くのお取引先様からご依頼をいただいており、今後さらなる事業成長を見据えて組織体制の強化を進めています。

サロン・ドラッグストア・化粧品取扱店へ、コスメ商品のルート配送を行うお仕事です。

当社は、化粧品・コスメ商品の販売・卸・流通を手掛けており、業界を支える物流体制を整えています。

配送に使用する車両やガソリン代、保険、メンテナンス費用はすべて会社負担。
個人負担なく安心してスタートできます。

配送エリアは関西近郊が中心で、固定ルート配送が多く、未経験の方でもすぐに業務に慣れることができます。

主な業務内容

■ コスメ商品のルート配送
サロンやドラッグストアへの商品配送
スキンケア・メイク用品などの納品
取引先店舗へのルート配送
荷物の積み込み、荷下ろし

■ 配送サポート業務
配送伝票の確認
納品時の簡単な受け渡し対応
配送完了報告
車両の簡易チェック

取扱商品例

スキンケア用品（化粧水・乳液・美容液）
メイク用品（ファンデーション・口紅・アイシャドウ）
美容小物・関連アクセサリー
サロン専売化粧品
消耗品コスメ など`;

const REWARDING = `日勤専属で生活リズムが安定
固定ルート中心で未経験でも始めやすい
車両・ガソリン代など完全会社負担
コスメ業界を支える安定企業
配送業未経験スタート多数
研修制度ありで安心スタート`;

const QUALIFICATIONS = `普通自動車運転免許（AT限定可）
運転経験3年以上の方
未経験歓迎
学歴不問

【こんな方歓迎】
運転が好きな方
美容業界に興味がある方
人と接することが苦にならない方`;

const WORKTIME = `シフト制（実働8時間／休憩1時間）

10:00～19:00
完全週休二日制

年次有給休暇
長期休暇
産休・育休制度
夏季休暇
介護休暇
年間休日120日`;

const TRANSPORTATION = `車通勤可能
転勤なし`;

const BENEFIT = `昇給・賞与あり（前年度実績あり）昇給年１回、賞与年２回
通勤手当支給
家族手当
深夜手当
月給 ￥390,000 ～ ￥450,000

社会保険完備
交通費支給
定期健康診断
有給休暇制度あり`;

const HOW_TO_APPLY = `【応募後のご案内】

ご応募確認後、採用受付代行担当者よりお電話にてご連絡いたします。

また、ご経験・ご希望条件等を踏まえ、ご本人の同意をいただいた上で、関連求人や提携企業求人をご案内させていただく場合がございます。`;

const now = new Date().toISOString();
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const locations = AREAS.map(a => `${a.pref}${a.city}${a.district}`);
const placeholders = locations.map(() => '?').join(',');
const del = db.prepare(
  `DELETE FROM jobs WHERE job_type='${JOB_TYPE}' AND target_media LIKE '%求人ボックス%' AND location IN (${placeholders})`
).run(...locations);
if (del.changes > 0) console.log(`既存コスメ配送ドライバー（今回エリア分）を削除: ${del.changes}件`);

const stmt = db.prepare(`
  INSERT INTO jobs (id,title,location,salary,job_type,employment_type,description,tags,catchcopy,image_url,is_published,target_media,published_at,expires_at,created_at,updated_at,company,rewarding,worktime_holiday,transportation,how_to_apply,qualifications,benefit)
  VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)
`);

let created = 0;
for (let i = 0; i < AREAS.length; i++) {
  const j = AREAS[i];
  const areaLabel = `${j.city}・${j.district}`;
  const _v = vary.build('bg_cosme_haisou', areaLabel);
  const id = crypto.randomBytes(10).toString('hex');
  const title = _v.title;
  const catchcopy = _v.catchcopy;

  const tags = JSON.stringify([
    '未経験OK', '高収入', '正社員', '普通免許OK',
    '会社車両完備', '完全週休2日', '固定ルート', '日勤専属',
    '車両費用会社負担', '賞与年2回',
  ]);

  stmt.run(
    id, title, `${j.pref}${j.city}${j.district}`, SALARY_DETAIL, JOB_TYPE, '正社員',
    _v.description, tags, catchcopy, IMAGE_URL,
    JSON.stringify(['求人ボックス']),
    now, expires, now, now, COMPANY,
    REWARDING, WORKTIME, TRANSPORTATION, HOW_TO_APPLY, QUALIFICATIONS, BENEFIT,
  );

  console.log(`✓ [${i + 1}/${AREAS.length}] ${title.slice(0, 55)}`);
  created++;
}

console.log(`\n完了: ${created}件作成（Bigeyes・コスメ配送ドライバー・関西新エリア75件・追加補充バッチ）`);
