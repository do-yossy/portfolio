#!/usr/bin/env node
'use strict';
/**
 * タクシー推薦の入口（送迎・専属ドライバー系）を強化するための新規Indeed求人。
 * 2026-09-29、ユーザーとの確認に基づく：
 *   ・過去のタクシー推薦成約19件の分析で、送迎・汎用ドライバー(47%)・役員・専属ドライバー(32%)からの
 *     成約が79%を占め、配送・清掃・製造(21%)はごく少数だった。
 *   ・そのため各社とも「送迎」「専属ドライバー」系を厚くし、配送・軽作業は最小限に絞った。
 *   ・各社の本業に紐づく具体的な業務内容にする（架空の業務は作らない）：
 *       st（Style501）: 伝統ブランド・伝統工芸品のリメイクプロデュース
 *       nl（NOWLIVE）  : 移動販売（ベビーカステラ催事）
 *       am（AMBITION） : 託児所・保育所の経営
 *       sl（スマイルライフ）: 整骨院・治療院・エステサロンの経営
 *   ・小分類に分けて同一内容の量産を避ける（垢BANリスク対策）。
 *   ・target_media=['indeed']。全社14/14/16/16件（st/nl/am/sl）。
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/seed-taxi-funnel-indeed-20260929.js
 */
const path = require('path');
const fs = require('fs');
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
const NOW = new Date().toISOString();

// ── エリアプール（実在地名。generate-kyujinbox-from-performance.jsと同系統だが本バッチ専用に別配列） ──
const AREAS = [
  { area: '梅田',     ward: '大阪市北区',   pref: '大阪府' }, { area: '心斎橋',   ward: '大阪市中央区', pref: '大阪府' },
  { area: '天王寺',   ward: '大阪市天王寺区', pref: '大阪府' }, { area: '難波',     ward: '大阪市浪速区', pref: '大阪府' },
  { area: '西中島',   ward: '大阪市淀川区', pref: '大阪府' }, { area: '都島本通', ward: '大阪市都島区', pref: '大阪府' },
  { area: '蒲生',     ward: '大阪市城東区', pref: '大阪府' }, { area: '昭和町',   ward: '大阪市阿倍野区', pref: '大阪府' },
  { area: '帝塚山東', ward: '大阪市住吉区', pref: '大阪府' }, { area: '平野本町', ward: '大阪市平野区', pref: '大阪府' },
  { area: '南港',     ward: '大阪市住之江区', pref: '大阪府' }, { area: '野田',     ward: '大阪市福島区', pref: '大阪府' },
  { area: '宿院町',   ward: '堺市堺区',     pref: '大阪府' }, { area: '長田',     ward: '東大阪市',     pref: '大阪府' },
  { area: '江坂町',   ward: '吹田市',       pref: '大阪府' }, { area: '曽根東町', ward: '豊中市',       pref: '大阪府' },
  { area: '城北町',   ward: '高槻市',       pref: '大阪府' }, { area: '岡東町',   ward: '枚方市',       pref: '大阪府' },
  { area: '若林町',   ward: '八尾市',       pref: '大阪府' }, { area: '速見町',   ward: '門真市',       pref: '大阪府' },
  { area: '塚口本町', ward: '尼崎市',       pref: '兵庫県' }, { area: '甲子園町', ward: '西宮市',       pref: '兵庫県' },
  { area: '中央',     ward: '伊丹市',       pref: '兵庫県' }, { area: '逆瀬川',   ward: '宝塚市',       pref: '兵庫県' },
  { area: '深草',     ward: '京都市伏見区', pref: '京都府' }, { area: '烏丸',     ward: '京都市中京区', pref: '京都府' },
  { area: '宇治',     ward: '宇治市',       pref: '京都府' }, { area: '長岡',     ward: '長岡京市',     pref: '京都府' },
];
let areaCursor = 0;
function nextArea() {
  const a = AREAS[areaCursor % AREAS.length];
  areaCursor++;
  return { area: a.area, location: `${a.pref}${a.ward}${a.area}` };
}

const COMMON_BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担／研修あり／昇給あり';
const COMMON_QUAL = '普通自動車運転免許（AT限定可）／未経験・ブランク歓迎・学歴不問';

function job({ company, jobType, title, salary, description, tags, catchcopy, imageUrl }) {
  return {
    title, location: undefined, salary, jobType, employmentType: '正社員',
    description, tags, catchcopy, imageUrl, isPublished: true, publishedAt: NOW,
    targetMedia: ['indeed'], company,
  };
}

const JOBS = [];

// ================= style501（st）: 伝統ブランド・伝統工芸品のリメイクプロデュース =================
{
  const SALARY = '月給350,000円〜（経験・能力を考慮）';
  const DRIVER_SALARY = '月給350,000円〜（専属手当含む）';
  const TENJI_SALARY = '月収350,000円以上（こなす件数に応じて給与アップ）';

  const craftsmanDesc = a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、職人の送迎を担当していただきます。工房と展示会場・打ち合わせ先の間を、${a}周辺を中心に安全に送り届けるお仕事です。

【主な業務】
・職人の工房〜展示会場・取引先間の送迎
・車内での道具・作品の取り扱いサポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ 伝統工芸の現場を間近で知ることができる
◆ 決まった職人を担当するため、信頼関係を築きながら働ける
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const buyerDesc = a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、バイヤー・取引先関係者の送迎を担当していただきます。商談・工房見学等の移動を、${a}周辺を中心にサポートします。

【主な業務】
・バイヤー・取引先関係者の送迎
・商談先・工房見学先までの案内サポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ さまざまな業界のバイヤーと接する機会がある
◆ 普通免許（AT限定可）があればOK、未経験歓迎
◆ 丁寧な対応ができれば経験不問

【給与】${SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const boothDesc = a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、展示会場スタッフの送迎を担当していただきます。設営・運営スタッフを、${a}周辺の会場まで送り届けるお仕事です。

【主な業務】
・展示会場スタッフの送迎
・会場での搬入サポート（運転以外の業務も一部あり）
・車両の清掃・日常点検

【この仕事の魅力】
◆ 展示会の現場を裏側から支えるポジション
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const dedicatedDesc = a => `伝統ブランド・伝統工芸品のリメイクプロデュースを手掛ける当社で、専属ドライバーを募集します。決まった担当者（経営陣・主要な職人）の移動を一貫してサポートする、専任性の高いポジションです。

【主な業務】
・担当者の移動全般のサポート（送迎・スケジュール調整含む）
・車両の管理・清掃・日常点検
・訪問先での同行サポート

【この仕事の魅力】
◆ 専属担当のため、業務の裁量・信頼度が高い
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${DRIVER_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const tenjiDesc = a => `決まった展示会場・取引先を回る、展示会配送ドライバーのお仕事です。固定のルートなので、未経験の方でも覚えやすく、安心して始められます。

【給与について】月収35万円以上。こなす件数に応じて給与がアップする仕組みのため、頑張り次第で収入を伸ばせます。

【主な業務】
・決まった展示会場・取引先への荷物・什器の配送
・会場での搬入・荷下ろし
・伝票・記録の確認、車両の日常点検

【応募資格】${COMMON_QUAL}
【待遇・福利厚生】${COMMON_BENEFIT}／賞与あり

※${a}周辺での募集です。まずはお気軽にご応募ください。`;

  const plans = [
    ...Array(3).fill(['職人送迎ドライバー', craftsmanDesc, SALARY]),
    ...Array(3).fill(['バイヤー・関係者送迎ドライバー', buyerDesc, SALARY]),
    ...Array(2).fill(['展示会場スタッフ送迎ドライバー', boothDesc, SALARY]),
    ...Array(1).fill(['専属ドライバー', dedicatedDesc, DRIVER_SALARY]),
    ...Array(5).fill(['展示会配送ドライバー', tenjiDesc, TENJI_SALARY]),
  ];
  for (const [jobType, descFn, salary] of plans) {
    const { area, location } = nextArea();
    JOBS.push({
      title: `【${area}】${jobType}｜正社員・未経験歓迎・普通免許OK`,
      location, salary, jobType, employmentType: '正社員',
      description: descFn(area),
      tags: ['未経験歓迎', '正社員', '普通免許OK', jobType],
      catchcopy: `${jobType}（${area}）｜伝統工芸のリメイクプロデュース企業｜未経験歓迎・普通免許OK`,
      imageUrl: '/images/haisou-fleet.jpg', isPublished: true, publishedAt: NOW,
      targetMedia: ['indeed'], company: 'st',
    });
  }
}

// ================= NOWLIVE（nl）: 移動販売（ベビーカステラ催事） =================
{
  const SALARY = '月給340,000円〜（歩合・インセンティブにより上限なし）';
  const DEDICATED_SALARY = '月給350,000円〜（専属手当含む）';

  const chauffeurDesc = a => `関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の送迎ドライバーです。移動販売車（キッチンカー）や販売スタッフを、拠点から${a}周辺の催事会場まで送り届け、営業中は現場のサポートも行っていただきます。

【この仕事の魅力】
◆ 運転だけでなく、現場での接客サポートも含めた「移動販売を動かす」お仕事
◆ 歩合・インセンティブ制で、頑張り次第で収入に上限がない
◆ 毎週違う場所で働けるので、単調になりがちなドライバー業務とは一味違う

【給与】${SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const returnDesc = a => `関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の車両回送ドライバーです。営業終了後の移動販売車（キッチンカー）を、${a}周辺の会場から拠点倉庫まで回送していただきます。

【主な業務】
・営業終了後の移動販売車の回送
・車両の清掃・日常点検・管理
・拠点での車両引き渡し

【この仕事の魅力】
◆ 日中は別の予定がある方にも合わせやすい勤務時間
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const dedicatedDesc = a => `関西のショッピングモールや商業施設を週替わりで回る移動販売事業で、専属ドライバーを募集します。決まった催事チームを一貫してサポートする、専任性の高いポジションです。

【主な業務】
・担当チームの移動サポート全般（送迎・スケジュール調整含む）
・車両の管理・清掃・日常点検

【この仕事の魅力】
◆ 専属担当のため、業務の裁量・信頼度が高い
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${DEDICATED_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const deliveryDesc = a => `関西のショッピングモールや商業施設を週替わりで回る、ベビーカステラ移動販売の配送ドライバーです。拠点倉庫から${a}周辺の催事会場へ、商品材料・什器・販売用備品を運び、開店前の搬入・設置までを担当していただきます。

【給与】${SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const plans = [
    ...Array(6).fill(['送迎ドライバー', chauffeurDesc, SALARY]),
    ...Array(4).fill(['移動販売車の回送ドライバー', returnDesc, SALARY]),
    ...Array(1).fill(['専属ドライバー', dedicatedDesc, DEDICATED_SALARY]),
    ...Array(3).fill(['配送ドライバー', deliveryDesc, SALARY]),
  ];
  for (const [jobType, descFn, salary] of plans) {
    const { area, location } = nextArea();
    JOBS.push({
      title: `【${area}】移動販売の${jobType}｜月給34万円〜・歩合で上限なし・未経験歓迎・正社員`,
      location, salary, jobType, employmentType: '正社員',
      description: descFn(area),
      tags: ['未経験歓迎', '正社員', '普通免許OK', '移動販売', jobType],
      catchcopy: `移動販売の${jobType}（${area}）｜月給34万円〜・歩合で上限なし｜普通免許OK`,
      imageUrl: '/images/nl-movingsales.png', isPublished: true, publishedAt: NOW,
      targetMedia: ['indeed'], company: 'nl',
    });
  }
}

// ================= AMBITION（am）: 託児所・保育所の経営 =================
{
  const SEND_SALARY = '月収280,000円〜';
  const DEDICATED_SALARY = '月給350,000円〜（専属手当含む）';
  const HAISO_SALARY = '月給360,000円〜（基本給）';

  const morningDesc = a => `託児所・保育所を運営する当社で、園児の登園送迎ドライバーを募集します。${a}周辺のご自宅から園までの送迎バス（乗用車）を運転し、安全な登園をサポートするお仕事です。

【主な業務】
・園児の自宅〜園までの登園送迎
・乗車中の見守り（保育スタッフ同乗あり）
・車両の清掃・日常点検

【この仕事の魅力】
◆ 子どもたちの成長を身近で感じられる仕事
◆ 朝の時間帯中心の勤務でライフスタイルに合わせやすい
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${SEND_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const eveningDesc = a => `託児所・保育所を運営する当社で、園児の降園送迎ドライバーを募集します。園から${a}周辺のご自宅までの送迎バス（乗用車）を運転し、安全な降園をサポートするお仕事です。

【主な業務】
・園〜園児の自宅までの降園送迎
・乗車中の見守り（保育スタッフ同乗あり）
・車両の清掃・日常点検

【この仕事の魅力】
◆ 子どもたちの成長を身近で感じられる仕事
◆ 夕方の時間帯中心の勤務でライフスタイルに合わせやすい
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${SEND_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const dedicatedDesc = a => `託児所・保育所を運営する当社で、専属ドライバーを募集します。決まった園の送迎業務全般を一貫して担当する、専任性の高いポジションです。

【主な業務】
・園児送迎全般のサポート（登園・降園・スケジュール調整含む）
・車両の管理・清掃・日常点検

【この仕事の魅力】
◆ 専属担当のため、業務の裁量・信頼度が高い
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${DEDICATED_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const haisoDesc = a => `託児所・保育所を運営する当社で、配送ドライバーを募集します。園への教材・備品等の配送を、${a}周辺を中心に担当していただきます。

【給与】${HAISO_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const plans = [
    ...Array(7).fill(['登園送迎ドライバー', morningDesc, SEND_SALARY]),
    ...Array(6).fill(['降園送迎ドライバー', eveningDesc, SEND_SALARY]),
    ...Array(1).fill(['専属ドライバー', dedicatedDesc, DEDICATED_SALARY]),
    ...Array(2).fill(['配送ドライバー', haisoDesc, HAISO_SALARY]),
  ];
  for (const [jobType, descFn, salary] of plans) {
    const { area, location } = nextArea();
    JOBS.push({
      title: `【${area}】${jobType}｜正社員・未経験歓迎・普通免許OK`,
      location, salary, jobType, employmentType: '正社員',
      description: descFn(area),
      tags: ['未経験歓迎', '正社員', '普通免許OK', '保育', jobType],
      catchcopy: `${jobType}（${area}）｜託児所・保育所運営｜未経験歓迎・普通免許OK`,
      imageUrl: '/images/haisou-fleet.jpg', isPublished: true, publishedAt: NOW,
      targetMedia: ['indeed'], company: 'am',
    });
  }
}

// ================= スマイルライフ（sl）: 整骨院・治療院・エステサロンの経営 =================
{
  const SEND_SALARY = '月収290,000円〜';
  const DEDICATED_SALARY = '月給350,000円〜（専属手当含む）';
  const HAISO_SALARY = '月給360,000円〜（基本給）';

  const seikotsuDesc = a => `整骨院・治療院・エステサロンを運営する当社で、整骨院への通院送迎ドライバーを募集します。${a}周辺のご自宅と整骨院の間を送迎し、通院が難しい方の来院をサポートするお仕事です。

【主な業務】
・利用者の自宅〜整骨院間の送迎
・乗降時の介助サポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ 利用者の健康を支える、感謝されるお仕事
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${SEND_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const chiryoinDesc = a => `整骨院・治療院・エステサロンを運営する当社で、治療院・エステサロンへの通院送迎ドライバーを募集します。${a}周辺のご自宅と施設の間を送迎し、通院が難しい方の来院をサポートするお仕事です。

【主な業務】
・利用者の自宅〜治療院・エステサロン間の送迎
・乗降時の介助サポート
・車両の清掃・日常点検

【この仕事の魅力】
◆ 利用者の健康・美容を支える、感謝されるお仕事
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${SEND_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const dedicatedDesc = a => `整骨院・治療院・エステサロンを運営する当社で、専属ドライバーを募集します。決まった施設の通院送迎業務全般を一貫して担当する、専任性の高いポジションです。

【主な業務】
・通院送迎全般のサポート（スケジュール調整含む）
・車両の管理・清掃・日常点検

【この仕事の魅力】
◆ 専属担当のため、業務の裁量・信頼度が高い
◆ 普通免許（AT限定可）があればOK、未経験歓迎

【給与】${DEDICATED_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const haisoDesc = a => `整骨院・治療院・エステサロンを運営する当社で、配送ドライバーを募集します。各施設への備品・商材の配送を、${a}周辺を中心に担当していただきます。

【給与】${HAISO_SALARY}
【待遇】${COMMON_BENEFIT}
【応募資格】${COMMON_QUAL}

※${a}周辺での募集です。`;

  const plans = [
    ...Array(6).fill(['整骨院通院送迎ドライバー', seikotsuDesc, SEND_SALARY]),
    ...Array(7).fill(['治療院・エステ通院送迎ドライバー', chiryoinDesc, SEND_SALARY]),
    ...Array(1).fill(['専属ドライバー', dedicatedDesc, DEDICATED_SALARY]),
    ...Array(2).fill(['配送ドライバー', haisoDesc, HAISO_SALARY]),
  ];
  for (const [jobType, descFn, salary] of plans) {
    const { area, location } = nextArea();
    JOBS.push({
      title: `【${area}】${jobType}｜正社員・未経験歓迎・普通免許OK`,
      location, salary, jobType, employmentType: '正社員',
      description: descFn(area),
      tags: ['未経験歓迎', '正社員', '普通免許OK', jobType],
      catchcopy: `${jobType}（${area}）｜整骨院・治療院・エステサロン運営｜未経験歓迎・普通免許OK`,
      imageUrl: '/images/haisou-fleet.jpg', isPublished: true, publishedAt: NOW,
      targetMedia: ['indeed'], company: 'sl',
    });
  }
}

async function main() {
  console.log(`\n=== タクシー推薦強化バッチ（Indeed新規・st14/nl14/am16/sl16=計${JOBS.length}件） ===\n`);
  const existing = await Jobs.findAll();
  let created = 0, skipped = 0;
  for (const j of JOBS) {
    if (existing.some(e => e.company === j.company && e.title === j.title)) {
      console.log(`  スキップ（既存同名）: [${j.company}] ${j.title}`);
      skipped++;
      continue;
    }
    await Jobs.create(j);
    console.log(`  作成: [${j.company}] ${j.jobType} - ${j.title}`);
    created++;
  }
  console.log(`\n完了: 作成${created}件 / スキップ${skipped}件（合計想定${JOBS.length}件）`);
  console.log('※ DB登録のみ。実際のIndeedへの掲載は別途必要です。\n');
}

main().catch(err => { console.error(err); process.exit(1); });
