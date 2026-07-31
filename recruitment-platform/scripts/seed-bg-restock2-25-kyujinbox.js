'use strict';
// コスメ配送ドライバー 追加求人25件（Bigeyes・求人ボックス掲載／2回目の追加補充=restock2）
// 会社: BigEyesコーポレーション株式会社(bg) / 給与: 月給39万円〜45万円
// 本文・タイトル・キャッチコピーは vary.build('bg_cosme_haisou', areaLabel) で
// エリアごとに決定論的に生成（雛形 seed-bg-weekly-restock-kyujinbox.js を踏襲）
// ※勤務地は既存75件（seed-bg-weekly-restock-kyujinbox.js）と重複しない
//   関西の新エリア25件（実在の市区町名）で構成
// 冪等: 今回の勤務地（新25エリア）のみ削除してから作り直す（既存の他バッチは消さない＝追加）

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

// 関西の追加25件（既存75件と重複しない実在の市区町名でユニークに構成）
const AREAS = [
  // ── 兵庫県（8件）──
  { pref: '兵庫県', city: '神戸市',       district: '中央区磯上通' },
  { pref: '兵庫県', city: '神戸市',       district: '兵庫区荒田町' },
  { pref: '兵庫県', city: '尼崎市',       district: '立花町' },
  { pref: '兵庫県', city: '西宮市',       district: '上甲子園' },
  { pref: '兵庫県', city: '明石市',       district: '二見町' },
  { pref: '兵庫県', city: '姫路市',       district: '飾磨区' },
  { pref: '兵庫県', city: '芦屋市',       district: '大原町' },
  { pref: '兵庫県', city: '高砂市',       district: '荒井町' },
  // ── 京都府（6件）──
  { pref: '京都府', city: '京都市',       district: '東山区五条橋東' },
  { pref: '京都府', city: '京都市',       district: '北区紫野' },
  { pref: '京都府', city: '京都市',       district: '上京区西陣' },
  { pref: '京都府', city: '京都市',       district: '西京区桂' },
  { pref: '京都府', city: '京田辺市',     district: '田辺' },
  { pref: '京都府', city: '八幡市',       district: '八幡' },
  // ── 奈良県（4件）──
  { pref: '奈良県', city: '奈良市',       district: '押熊町' },
  { pref: '奈良県', city: '天理市',       district: '川原城町' },
  { pref: '奈良県', city: '桜井市',       district: '桜井' },
  { pref: '奈良県', city: '五條市',       district: '本町' },
  // ── 滋賀県（4件）──
  { pref: '滋賀県', city: '大津市',       district: '瀬田' },
  { pref: '滋賀県', city: '近江八幡市',   district: '桜宮町' },
  { pref: '滋賀県', city: '東近江市',     district: '八日市町' },
  { pref: '滋賀県', city: '長浜市',       district: '高田町' },
  // ── 和歌山県（3件）──
  { pref: '和歌山県', city: '和歌山市',   district: '湊' },
  { pref: '和歌山県', city: '海南市',     district: '日方' },
  { pref: '和歌山県', city: '橋本市',     district: '橋本' },
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

console.log(`\n完了: ${created}件作成（Bigeyes・コスメ配送ドライバー・関西追加25エリア・追加補充バッチ2）`);
