'use strict';
// 軽貨物ドライバー求人 50件一括登録スクリプト
// 使用方法: node --experimental-sqlite seed-delivery-jobs.js
// ※既存の全求人(applications含む)を削除してから登録します

const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const db = new DatabaseSync('data/recruitment.db');

function generateId() {
  return crypto.randomBytes(10).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function expiresAt(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ── 既存求人・応募を全削除 ──
console.log('既存求人・応募データを削除中...');
db.prepare('DELETE FROM applications').run();
db.prepare('DELETE FROM jobs').run();
console.log('削除完了\n');

// ── 共通定数 ──
const SALARY = '月収41万円〜71万円';
const JOB_TYPE = '軽貨物ドライバー';
const EMP_TYPE = '正社員';
const HOW_TO_APPLY = '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。面接は1回のみ・WEB面接も対応しております。';

const CATCHCOPIES = [
  '月収71万円を目指せる！普通免許1枚で始める軽貨物ドライバー',
  '未経験でも平均月収40万円超え！がんばり次第で月収70万超も',
  '自分のペースで自由に稼ぐ！軽配送ドライバー大募集',
  '高収入・自由・一人作業！軽貨物配送で人生を変えよう',
  'ブランクOK・未経験OK！月収41万〜71万円の軽配送ドライバー',
  '人間関係ゼロで稼ぐ！正社員軽貨物ドライバー急募',
  '車に乗るだけで高収入！軽自動車1台で月収41万〜71万円',
  '転職・副業に最適！軽配送で月収41万〜71万円を実現しよう',
];

const TAG_SETS = [
  ['未経験OK', '高収入', '正社員', 'AT限定OK'],
  ['軽貨物', 'ドライバー', '月収41万〜', '自由な働き方'],
  ['普通免許OK', '未経験歓迎', '高収入', 'フレックス'],
  ['正社員', '稼げる仕事', 'ドライバー', '週休2日'],
  ['高収入', '軽貨物', '未経験OK', 'インセンティブ'],
  ['配送ドライバー', '月収71万円可', '自由出勤', '普通免許'],
  ['未経験OK', '高時給', '軽配送', 'ブランクOK'],
  ['正社員', '高収入', '一人作業', 'キャリアUP'],
];

const REWARDING_LIST = [
  'がんばった分だけ収入に直結する仕事。自分のペースで働ける自由さと高収入が魅力です。未経験でも3ヶ月で月収50万超えた方も多数います。',
  '一人で集中して働ける環境。効率よく配送を終えた充実感と、稼ぎが目に見えて増えるやりがいがあります。人間関係のストレスがありません。',
  'エリアのルートを覚えるにつれて効率が上がり、収入も自然と増えていきます。自分の成長が数字に直結する、刺激的な仕事です。',
  '人間関係のストレスゼロ。黙々と作業できる方にとっては最高の職場環境。月収も安定して高水準を維持できます。',
  '配達先のお客様から直接「ありがとう」をもらえる場面も多く、仕事の充実感を感じられます。高収入と感謝の両方が得られます。',
  '自分でコントロールできる仕事量と収入。努力が即時に反映される正社員スタイルが人気の秘訣。月収71万円も現実の目標です。',
];

const WORKTIME_LIST = [
  'シフト制（8:00〜19:00の間で実働8時間）　週休2日　年間休日120日以上　夏季・年末年始休暇あり',
  '自由シフト制（6:00〜21:00の間で実働6〜10時間）　週2〜6日から選択可　年間休日120日以上',
  '9:00〜18:00 または早番8:00〜17:00（シフト制）　完全週休2日　年間休日125日',
  '7:00〜20:00の間で実働8時間（シフト制）　週休2日（希望休可）　年間休日118日',
  'フレックスタイム制（コアタイム9:00〜15:00）　完全週休2日制　年間休日120日以上　有給消化率80%超',
];

function makeDescription(area, variant) {
  const v = variant % 6;
  if (v === 0) {
    return `■従業員から喜ばれる理由
◎月収70万円以上稼げる配送ドライバー！
◎弊社の平均給与はなんと月40万円！！※業界最高水準！！
◎普通自動車免許（AT）があればOK！
◎未経験者が9割以上！丁寧な研修で安心！

【仕事内容】
軽自動車を使って、${area}エリア内の住宅・マンション・企業へ商品をお届けします。

【主な業務】
・軽自動車への荷物積み込み（重量物なし、軽い荷物が中心）
・指定された住所への配達（1日40〜80件）
・配達完了報告（スマホアプリで簡単入力）
・不在時の再配達・不在票投函

【仕事の流れ】
8:00 出勤・荷物積み込み
9:00 配送開始
13:00〜14:00 昼休憩（自由）
15:00 配送再開
19:00 配送終了、報告後退勤

【求める人材】
★普通自動車運転免許（AT限定可）のみ必須
★学歴不問
★未経験OK
★ブランクOK`;
  }
  if (v === 1) {
    return `【仕事内容】
${area}エリアの住宅街・マンションへ荷物をお届けする軽配送ドライバーのお仕事です。
軽い荷物中心なので体への負担が少なく、長く続けられます。

【主な業務】
・配達センターで荷物を積み込み（重量5kg以下が中心）
・住宅地・マンション・戸建てへ配達（1日40〜70件）
・配達状況のスマホアプリ入力
・不在票の投函・翌日再配達対応

【職場環境】
${area}の住宅街は道が整っており、初心者ドライバーにも安心の環境です。
経験豊富なメンバーがサポートしますので、未経験でも安心してスタートできます。

【こんな方に最適】
・AT限定免許でOK！
・体力に自信がなくても大丈夫
・マイペースに収入を増やしたい方
・転職・副業を考えている方
・主婦・主夫・学生・シニアの方も歓迎`;
  }
  if (v === 2) {
    return `【大注目！】Eコマース需要急増で${area}エリアの配送案件が急増中！

【仕事内容】
軽自動車で荷物を届ける、シンプルで高収入なお仕事。
配送件数が多いため、効率よく動けば収入もしっかりアップします。

【主な業務】
・倉庫・センターでの荷物積み込み
・${area}エリア内への配送（1日40〜90件）
・配達完了の入力作業（専用アプリ）
・不在時の対応（不在票・再配達）

【職場の特徴】
・AIナビ・ルート最適化ツールを活用
・常に安定した配送量があるので収入が安定
・チームで助け合う文化
・スキルアップ研修あり（月2回）

【必要な条件】
・普通自動車免許（AT限定可）
・スマートフォンが使える方
・誠実に業務に取り組める方
・副業・WワークOK`;
  }
  if (v === 3) {
    return `【キャリアアップも目指せる軽貨物ドライバー募集】

${area}エリアの軽貨物配送ドライバーとして活躍していただきます。
ドライバー → エリアマネージャー → 統括へのキャリアパスが整っています。

【仕事内容】
・軽自動車を使った住宅・企業への配送（1日40〜80件）
・配達完了の報告（スマートフォンアプリ使用）
・ルートの把握・効率化
・（将来）後輩ドライバーの指導・管理

【キャリアイメージ】
入社〜6ヶ月：現場配達で稼ぐ（月収41万〜）
6ヶ月〜2年：サブリーダーとして後輩指導（月収50万〜）
2年〜：エリアマネージャー昇格（月収60万〜）
統括：現場稼働週1回・固定費会社負担（月収71万〜）

【応募条件】
・普通免許保有者（AT限定OK）
・未経験OK！研修制度充実
・向上心のある方歓迎`;
  }
  if (v === 4) {
    return `【自分のペースで稼ぎたい方必見】${area}エリア 軽貨物ドライバー募集

一人でコツコツ取り組める方に最適なお仕事です。
人間関係のストレスなし・自由な働き方で高収入を実現！

【仕事内容】
・軽自動車を使った住宅・マンションへの配送
・1日の配達件数：40〜75件（自分のペースで調整可能）
・配達状況の報告（専用アプリ）
・翌日分の事前確認

【職場環境】
${area}の閑静な住宅街を中心に配達。
人間関係のストレスがなく、精神的にも楽な職場環境です。
体が動く限り長く続けられる、安定した仕事です。

【こんな方歓迎】
・人間関係を気にせず働きたい方
・自分の裁量で仕事をしたい方
・前職で人間関係に疲れた方
・普通免許（AT限定可）をお持ちの方`;
  }
  // v === 5
  return `【安定収入×高収入】${area}エリア 軽貨物配送ドライバー募集

毎日安定した配送量があるため、収入が安定しています。
大手ECサイトの荷物を中心に、繁忙期・閑散期の差が少ない安定案件です。

【仕事内容】
・軽自動車での荷物配送（住宅・企業・コンビニ等）
・1日あたり40〜80件の配達
・不在者への連絡・再配達対応
・配達完了報告（スマホアプリ）

【待遇・福利厚生】
・服装自由・車内禁煙
・時短勤務制度あり
・試用期間なし（即本採用）
・雇用保険・労災保険加入

【応募条件】
・安定した高収入を希望する方
・長期で働ける方
・普通自動車免許（AT限定OK）をお持ちの方
・未経験・第二新卒・シニアの方歓迎`;
}

// ── 求人ボックス 25件（主に関東・東海・九州） ──
const kyujinboxJobs = [
  { location: '東京都墨田区',         area: '墨田区（錦糸町・両国）',       transport: 'JR錦糸町駅より徒歩10分。車・バイク通勤OK（駐車場完備）' },
  { location: '東京都江東区',         area: '江東区（亀戸・門前仲町）',      transport: 'JR亀戸駅より徒歩8分。各駅からアクセス良好。駐車場完備' },
  { location: '東京都葛飾区',         area: '葛飾区（金町・亀有）',          transport: 'JR金町駅より徒歩12分。車通勤OK・駐車場あり' },
  { location: '東京都足立区',         area: '足立区（北千住・西新井）',      transport: 'JR北千住駅より徒歩15分または東武線西新井駅より5分。駐車場完備' },
  { location: '東京都荒川区',         area: '荒川区（日暮里・三河島）',      transport: 'JR日暮里駅より徒歩10分。電車・車通勤いずれも可' },
  { location: '東京都板橋区',         area: '板橋区（大山・志村）',          transport: '都営三田線板橋区役所前駅より徒歩7分。車通勤OK（無料駐車場あり）' },
  { location: '東京都練馬区',         area: '練馬区（石神井・光が丘）',      transport: '西武池袋線石神井公園駅より徒歩12分。車通勤歓迎・駐車場あり' },
  { location: '東京都中野区',         area: '中野区（中野・新井薬師）',      transport: 'JR中野駅より徒歩15分。西武新宿線新井薬師前駅より10分' },
  { location: '東京都杉並区',         area: '杉並区（高円寺・阿佐ヶ谷）',   transport: 'JR高円寺駅より徒歩13分。中央線沿線・車通勤OK' },
  { location: '東京都世田谷区',       area: '世田谷区（三軒茶屋・下北沢）', transport: '東急田園都市線三軒茶屋駅より徒歩15分。車・バイク通勤OK' },
  { location: '神奈川県横浜市神奈川区', area: '横浜・神奈川区（東神奈川）', transport: 'JR東神奈川駅より徒歩10分。横浜駅からもアクセス可。駐車場完備' },
  { location: '神奈川県横浜市港北区', area: '横浜・港北区（新横浜・綱島）',  transport: 'JR新横浜駅より徒歩15分。東急東横線綱島駅より12分。駐車場あり' },
  { location: '神奈川県川崎市川崎区', area: '川崎区（川崎・浜川崎）',        transport: 'JR川崎駅より徒歩20分または京急線八丁畷駅より10分。無料駐車場完備' },
  { location: '神奈川県相模原市中央区', area: '相模原市中央区（相模原・矢部）', transport: 'JR横浜線矢部駅より徒歩10分。車通勤OK・無料駐車場あり' },
  { location: '埼玉県さいたま市大宮区', area: '大宮区（大宮・北大宮）',      transport: 'JR大宮駅より徒歩20分またはバス10分。車通勤歓迎・駐車場完備' },
  { location: '埼玉県川口市',         area: '川口市（川口・西川口）',        transport: 'JR川口駅より徒歩18分またはバス利用。車通勤OK・駐車場無料' },
  { location: '埼玉県越谷市',         area: '越谷市（越谷・蒲生）',          transport: '東武スカイツリーライン蒲生駅より徒歩12分。車・バイク通勤OK' },
  { location: '千葉県千葉市中央区',   area: '千葉市中央区（千葉・本千葉）', transport: 'JR千葉駅より徒歩20分またはバス10分。車通勤OK・無料駐車場あり' },
  { location: '千葉県市川市',         area: '市川市（市川・本八幡）',        transport: 'JR本八幡駅より徒歩15分または都営新宿線本八幡駅より12分。駐車場完備' },
  { location: '千葉県船橋市',         area: '船橋市（船橋・西船橋）',        transport: 'JR船橋駅より徒歩20分またはバス利用。車通勤歓迎・無料駐車場完備' },
  { location: '愛知県名古屋市中区',   area: '名古屋市中区（栄・大須）',     transport: '地下鉄栄駅より徒歩15分。車通勤OK・近隣駐車場を会社負担で提供' },
  { location: '愛知県名古屋市中村区', area: '名古屋市中村区（名古屋・則武）', transport: 'JR名古屋駅より徒歩20分または地下鉄中村公園駅より10分。駐車場完備' },
  { location: '福岡県福岡市博多区',   area: '福岡市博多区（博多・吉塚）',   transport: 'JR博多駅より徒歩20分またはバス10分。車通勤OK・無料駐車場あり' },
  { location: '福岡県北九州市小倉北区', area: '北九州市小倉北区（小倉・砂津）', transport: 'JR小倉駅より徒歩20分またはモノレール旦過駅より10分。駐車場完備' },
  { location: '兵庫県神戸市中央区',   area: '神戸市中央区（三宮・元町）',   transport: 'JR三ノ宮駅より徒歩20分またはバス利用。車通勤OK・駐車場あり' },
];

// ── Googleしごと検索 25件（全国各地） ──
const googleJobs = [
  { location: '大阪府大阪市西区',     area: '大阪市西区（西区・阿波座）',   transport: '地下鉄四つ橋線西梅田駅より徒歩15分。車通勤OK・無料駐車場完備' },
  { location: '大阪府大阪市港区',     area: '大阪市港区（弁天町・朝潮橋）', transport: '地下鉄中央線弁天町駅より徒歩12分。環状線弁天町駅も利用可。駐車場あり' },
  { location: '大阪府大阪市住吉区',   area: '大阪市住吉区（住吉・帝塚山）', transport: '南海高野線帝塚山駅より徒歩15分。車通勤歓迎・無料駐車場あり' },
  { location: '大阪府堺市堺区',       area: '堺市堺区（堺・大小路）',        transport: '南海本線堺駅より徒歩18分またはバス10分。車通勤OK・駐車場完備' },
  { location: '大阪府東大阪市',       area: '東大阪市（布施・八戸ノ里）',   transport: '近鉄奈良線八戸ノ里駅より徒歩10分。車通勤OK・無料駐車場完備' },
  { location: '京都府京都市伏見区',   area: '京都市伏見区（伏見・向島）',   transport: '京阪宇治線向島駅より徒歩15分。車通勤歓迎・無料駐車場完備' },
  { location: '京都府京都市山科区',   area: '京都市山科区（山科・椥辻）',   transport: '地下鉄東西線椥辻駅より徒歩12分。車通勤OK・駐車場あり' },
  { location: '奈良県奈良市',         area: '奈良市（奈良・大和西大寺）',   transport: '近鉄奈良線大和西大寺駅より徒歩15分。車通勤OK・無料駐車場完備' },
  { location: '滋賀県大津市',         area: '大津市（大津・膳所）',          transport: 'JR琵琶湖線膳所駅より徒歩15分。車通勤歓迎・駐車場完備。名神高速ICそば' },
  { location: '愛知県名古屋市南区',   area: '名古屋市南区（笠寺・道徳）',   transport: 'JR東海道本線笠寺駅より徒歩12分。車・バイク通勤OK・駐車場完備' },
  { location: '愛知県豊橋市',         area: '豊橋市（豊橋・二川）',          transport: 'JR東海道本線二川駅より徒歩20分。車通勤歓迎・無料駐車場完備' },
  { location: '静岡県静岡市葵区',     area: '静岡市葵区（静岡・安倍川）',   transport: 'JR東海道本線静岡駅よりバス20分または車で15分。無料駐車場あり' },
  { location: '静岡県浜松市中区',     area: '浜松市中区（浜松・高塚）',      transport: 'JR東海道本線高塚駅より徒歩15分。車通勤OK・無料駐車場完備' },
  { location: '北海道札幌市中央区',   area: '札幌市中央区（大通・円山）',   transport: '地下鉄南北線中島公園駅より徒歩15分。車通勤OK・駐車場完備' },
  { location: '北海道札幌市豊平区',   area: '札幌市豊平区（平岸・澄川）',   transport: '地下鉄南北線平岸駅より徒歩10分。車通勤歓迎・無料駐車場あり' },
  { location: '宮城県仙台市青葉区',   area: '仙台市青葉区（仙台・中山）',   transport: 'JR仙山線北仙台駅より徒歩20分またはバス利用。車通勤OK・駐車場完備' },
  { location: '広島県広島市中区',     area: '広島市中区（広島・宇品）',      transport: 'JR広島駅よりバス20分または路面電車利用。車通勤OK・無料駐車場完備' },
  { location: '岡山県岡山市北区',     area: '岡山市北区（岡山・大元）',      transport: 'JR山陽本線大元駅より徒歩15分。車通勤歓迎・無料駐車場完備' },
  { location: '新潟県新潟市中央区',   area: '新潟市中央区（新潟・白山）',   transport: 'JR信越本線白山駅より徒歩15分。車通勤OK・無料駐車場完備' },
  { location: '長野県長野市',         area: '長野市（長野・北長野）',        transport: 'JR信越本線北長野駅より徒歩20分。車通勤歓迎・無料駐車場完備。高速IC近く' },
  { location: '石川県金沢市',         area: '金沢市（金沢・野々市）',        transport: 'JR北陸本線金沢駅よりバス25分または車で15分。無料駐車場完備' },
  { location: '熊本県熊本市中央区',   area: '熊本市中央区（熊本・水前寺）', transport: 'JR豊肥本線水前寺駅より徒歩15分。車通勤OK・無料駐車場完備' },
  { location: '鹿児島県鹿児島市',     area: '鹿児島市（鹿児島・武岡）',      transport: 'JR鹿児島本線鹿児島駅よりバス20分または車で15分。無料駐車場完備' },
  { location: '沖縄県那覇市',         area: '那覇市（那覇・小禄）',          transport: 'ゆいレール小禄駅より徒歩15分。車通勤歓迎・無料駐車場完備' },
  { location: '福岡県福岡市東区',     area: '福岡市東区（香椎・箱崎）',      transport: 'JR香椎線香椎駅より徒歩15分。車・バイク通勤OK・無料駐車場完備' },
];

function insertJob(locationData, variant, targetMedia) {
  const id = generateId();
  const ts = now();
  const exp = expiresAt(30);

  const areaShort = locationData.area.split('（')[0].replace('大阪府', '大阪・').replace('東京都', '東京・').replace('神奈川県横浜市', '横浜・').replace('神奈川県川崎市', '川崎・').replace('神奈川県相模原市', '相模原・').replace('埼玉県', '埼玉・').replace('千葉県', '千葉・').replace('愛知県名古屋市', '名古屋・').replace('愛知県', '愛知・').replace('福岡県福岡市', '福岡・').replace('福岡県北九州市', '北九州・').replace('兵庫県神戸市', '神戸・').replace('京都府京都市', '京都・').replace('奈良県', '').replace('滋賀県', '').replace('静岡県', '').replace('北海道', '').replace('宮城県', '').replace('広島県', '').replace('岡山県', '').replace('新潟県', '').replace('長野県', '').replace('石川県', '').replace('熊本県', '').replace('鹿児島県', '').replace('沖縄県', '');

  const title = `軽貨物ドライバー（正社員）${areaShort}`;
  const catchcopy = CATCHCOPIES[variant % CATCHCOPIES.length];
  const tags = TAG_SETS[variant % TAG_SETS.length];
  const rewarding = REWARDING_LIST[variant % REWARDING_LIST.length];
  const worktime = WORKTIME_LIST[variant % WORKTIME_LIST.length];
  const desc = makeDescription(locationData.area, variant);

  db.prepare(`
    INSERT INTO jobs (
      id, title, location, salary, job_type, employment_type,
      description, tags, catchcopy, image_url, faq,
      is_published, target_media, published_at, expires_at,
      company, rewarding, worktime_holiday, transportation, how_to_apply,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    title,
    locationData.location,
    SALARY,
    JOB_TYPE,
    EMP_TYPE,
    desc,
    JSON.stringify(tags),
    catchcopy,
    '',
    '[]',
    1,
    JSON.stringify([targetMedia]),
    ts,
    exp,
    'sq',
    rewarding,
    worktime,
    locationData.transport,
    HOW_TO_APPLY,
    ts,
    ts
  );

  console.log(`✅ [${targetMedia}] ${title} (${locationData.location})`);
}

// ── 求人ボックス 25件を挿入 ──
console.log('=== 求人ボックス 25件 ===');
kyujinboxJobs.forEach((loc, i) => {
  insertJob(loc, i, '求人ボックス');
});

// ── Googleしごと検索 25件を挿入 ──
console.log('\n=== Googleしごと検索 25件 ===');
googleJobs.forEach((loc, i) => {
  insertJob(loc, i, 'Googleしごと検索');
});

// ── 結果確認 ──
const total = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
const kyujinboxCount = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE target_media LIKE '%求人ボックス%'").get().c;
const googleCount = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE target_media LIKE '%Googleしごと検索%'").get().c;

console.log(`\n✅ 登録完了！`);
console.log(`   合計: ${total}件`);
console.log(`   求人ボックス: ${kyujinboxCount}件`);
console.log(`   Googleしごと検索: ${googleCount}件`);

db.close();
