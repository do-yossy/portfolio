#!/usr/bin/env node
'use strict';
/**
 * 【Indeed掲載専用】新規Indeedアカウント3社（五方 gp／JANDO jd／プアKY pk）の最初の掲載セットを作成する。
 * 2026-10-10、ユーザー提供の情報に基づく：
 *   JANDO … ラーメン店「醤道」のFC本部事業。FC加盟店への食材・麺・スープの配送、本店と店舗の間の運搬・送迎、
 *            イベント・催事への運搬・送迎、スタッフの送迎。勤務地は関西。
 *   五方   … 超熟成製法「五方」の熟成魚など食品の通販。商品の配送、仕入れ先・市場への運搬・送迎、催事・イベントへの運搬・送迎。勤務地は関西。
 *   プアKY … 兵庫県加古川市の運送業。企業専属便・定期便・軽貨物、送迎ドライバー、専属ドライバー。勤務地は関西。
 *   共通 … 正社員。配送は月収27万円、それ以外は月給35万円以上（年収500万円以上）。休み希望シフト制・完全週休2日制。
 *          日勤・夜勤などの時間選択固定制。夜間・深夜・早朝の勤務あり。会社の車を使用。
 *
 * 方針（これまでの分析）：送迎系を中心に（約60%）、専属1件、配送は少数、夜間系あり、倉庫・軽作業は出さない。
 * 既存アカウント（st/nl/am/sl/yp）と同じエリアが重ならないよう、地名（駅名等）を分けて使う。
 * 冪等：会社×職種ごとに、既にある件数を引いた不足分だけ作成する。
 *
 * 掲載前に必ず確認すること（私の仮置き）:
 *   ・勤務時間帯（日勤 6:00〜15:00／10:00〜19:00／14:00〜23:00、夜間 22:00〜翌7:00、早朝 4:00〜13:00）
 *   ・「年収500万円以上可能」（月給35万円の12か月分は420万円。賞与などで届く実態があること）
 *   ・各社の送迎・運搬の実際の内容、深夜手当（深夜帯は別途支給と記載）
 *
 * 使い方（recruitment-platform フォルダで）:
 *   node --experimental-sqlite scripts/seed-indeed-new-accounts-20261010.js           // ドライラン
 *   node --experimental-sqlite scripts/seed-indeed-new-accounts-20261010.js --apply   // 実際に作成
 *   ※ --refresh を付けると、作成済みの求人の本文・キャッチコピー・勤務時間欄を、現在の文面に更新します（タイトル・エリアは変更しません）。
 *   ※ 以前の版（軽貨物ドライバーを含む）を既に実行済みの場合は、--apply --prune を付けると、プアKYの軽貨物ドライバー求人と、計画件数を超えている求人（超過分）を削除します。
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

const { DatabaseSync } = require('node:sqlite');
const { Jobs } = require('../db-factory');
const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'recruitment.db') : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);
const APPLY = process.argv.includes('--apply');
const PRUNE = process.argv.includes('--prune');
const REFRESH = process.argv.includes('--refresh');

const BENEFIT = '各種社会保険完備／交通費支給／車両・燃料は会社負担（会社の車を使用）／研修あり／昇給あり';
const DAY_HOURS = '6:00〜15:00／10:00〜19:00／14:00〜23:00';
const NIGHT_HOURS = '22:00〜翌7:00';
const EARLY_HOURS = '4:00〜13:00';
const SAL35 = '月給350,000円〜（年収500万円以上可能）';
const SAL35_NIGHT = '月給350,000円〜（年収500万円以上可能／深夜手当別途支給）';
const SAL27 = '月収270,000円〜';

// 種別ごとの定義：label=職種名、salary、hours（'day'|'night'|'early'）、duty=主な業務、point=★2行目、closing=締めの文
const COMPANIES = {
  jd: {
    // サイトで確認：ラーメン店「醤道（じゃんどう）」のFC本部事業。のれん分け加盟店の募集、開業・メニュー導入の支援。本店は東京・大田区千鳥（2003年3月開店）。
    biz: 'ラーメン店「醤道（じゃんどう）」のFC本部事業を手掛け、のれん分け加盟店の募集や、ラーメン店の開業・メニュー導入の支援を行う当社',
    nightReason: 'ラーメン店の営業時間に合わせた、夜間の送迎・運搬があるため、夜間の時間帯のシフトを設けています。',
    image: '/images/haisou-fleet.jpg',
    types: [
      { n: 3, label: 'スタッフ送迎ドライバー', salary: SAL35, hours: 'day', intro: '本店・加盟店のスタッフの出退勤や、店舗間の移動を、送迎でサポートします。', duty: ['本店・加盟店のスタッフの送迎', '送迎スケジュールの確認'], point: '店舗スタッフを運ぶ、人を運ぶお仕事', closing: '現場のスタッフを支える、頼りにされるお仕事です。' },
      { n: 3, label: '店舗間送迎ドライバー', salary: SAL35, hours: 'day', intro: '本店と加盟店の間の運搬・送迎（スタッフ・備品・食材の移動）を担当します。', duty: ['本店〜加盟店間のスタッフ・備品・食材の運搬・送迎', '運行ルートの確認'], point: '本店と店舗をつなぐ、移動を支えるお仕事', closing: 'のれん分け加盟店の運営を、移動の面から支える大切な役割です。' },
      { n: 2, label: '催事・イベント送迎ドライバー', salary: SAL35, hours: 'day', intro: 'イベント・催事への運搬・送迎（スタッフ・商品・備品）を担当します。', duty: ['イベント・催事会場へのスタッフ・商品・備品の運搬・送迎', '会場での簡単なサポート'], point: 'イベント・催事の現場を、移動から支えるお仕事', closing: 'さまざまな会場へ行ける、変化のあるお仕事です。' },
      { n: 2, label: '夜間送迎ドライバー', salary: SAL35_NIGHT, hours: 'night', intro: 'ラーメン店の営業時間に合わせた、夜間のスタッフの送迎・運搬を担当します。', duty: ['夜間のスタッフの送迎', '夜間の店舗間の運搬（備品・食材など）'], point: '夜の時間帯に、落ち着いて働けるお仕事', closing: '夜の時間帯を活かして、安定して働けるお仕事です。' },
      { n: 1, label: '専属ドライバー', salary: SAL35, hours: 'day', intro: '決まった担当者の移動を、一貫してサポートする専任のポジションです。', duty: ['担当者の移動全般のサポート', '訪問先・店舗への送迎'], point: '専属担当として、信頼される専任のポジション', closing: '専任性が高く、長く働ける仕事です。' },
      { n: 2, label: '配送ドライバー', salary: SAL27, hours: 'day', intro: 'のれん分け加盟店への、食材・麺・スープの配送を担当します。', duty: ['のれん分け加盟店への食材・麺・スープの配送', '荷物の積み込み・荷下ろし'], point: 'ラーメン店の味を支える、食材の配送のお仕事', closing: '決まったルートを中心に運行します。' },
    ],
    areas: [
      ['関目', '大阪市城東区', '大阪府'], ['野江', '大阪市城東区', '大阪府'], ['蒲生', '大阪市城東区', '大阪府'],
      ['住道', '大東市', '大阪府'], ['野崎', '大東市', '大阪府'], ['大日', '守口市', '大阪府'], ['守口', '守口市', '大阪府'],
      ['香里園', '寝屋川市', '大阪府'], ['萱島', '寝屋川市', '大阪府'], ['河内小阪', '東大阪市', '大阪府'], ['布施', '東大阪市', '大阪府'],
      ['放出', '大阪市鶴見区', '大阪府'], ['天神橋筋六丁目', '大阪市北区', '大阪府'],
    ],
  },
  gp: {
    biz: '「超熟成製法 五方（GOHOU）」の熟成魚など、食品の通販を手掛ける当社',
    image: '/images/haisou-fleet.jpg',
    types: [
      { n: 4, label: '仕入れ・市場送迎ドライバー', salary: SAL35, hours: 'day', intro: '仕入れ先・市場への運搬・送迎（スタッフ・商品）を担当します。', duty: ['仕入れ先・市場への商品の運搬・送迎', '荷物の積み込み・荷下ろし'], point: '食品の仕入れを、移動から支えるお仕事', closing: '食を支える現場に、直接関われるお仕事です。' },
      { n: 3, label: '催事・イベント送迎ドライバー', salary: SAL35, hours: 'day', intro: '催事・イベントへの運搬・送迎（スタッフ・商品・備品）を担当します。', duty: ['催事・イベント会場へのスタッフ・商品・備品の運搬・送迎', '会場での簡単なサポート'], point: '催事・イベントの現場を、移動から支えるお仕事', closing: 'さまざまな会場へ行ける、変化のあるお仕事です。' },
      { n: 2, label: '早朝・夜間送迎ドライバー', salary: SAL35_NIGHT, hours: 'early', intro: '早朝・夜間の時間帯の、仕入れ先・市場への運搬・送迎を担当します。', duty: ['早朝・夜間の仕入れ先・市場への運搬・送迎', '商品の積み込み・荷下ろし'], point: '早朝・夜の時間帯に、落ち着いて働けるお仕事', closing: '時間帯を活かして、安定して働けるお仕事です。' },
      { n: 1, label: '専属ドライバー', salary: SAL35, hours: 'day', intro: '決まった担当者の移動を、一貫してサポートする専任のポジションです。', duty: ['担当者の移動全般のサポート', '仕入れ先・訪問先への送迎'], point: '専属担当として、信頼される専任のポジション', closing: '専任性が高く、長く働ける仕事です。' },
      { n: 2, label: '配送ドライバー', salary: SAL27, hours: 'day', intro: '商品（熟成魚など食品）の配送を担当します。', duty: ['商品の配送', '荷物の積み込み・荷下ろし'], point: '食品を、お客様へ届けるお仕事', closing: '決まったルートを中心に運行します。' },
    ],
    areas: [
      ['天満', '大阪市北区', '大阪府'], ['扇町', '大阪市北区', '大阪府'], ['谷町四丁目', '大阪市中央区', '大阪府'], ['心斎橋', '大阪市中央区', '大阪府'],
      ['上本町', '大阪市天王寺区', '大阪府'], ['玉造', '大阪市天王寺区', '大阪府'], ['九条', '大阪市西区', '大阪府'], ['堀江', '大阪市西区', '大阪府'],
      ['野田', '大阪市福島区', '大阪府'], ['福島', '大阪市福島区', '大阪府'], ['桜ノ宮', '大阪市都島区', '大阪府'], ['西本町', '大阪市西区', '大阪府'],
    ],
  },
  pk: {
    // サイト（puaky.co.jp）で確認できた事業：兵庫県加古川市を拠点とした運送業。定期便・企業専属便・スポット・チャーター便、
    // 緊急配送、家具・家電の配送、単身者向け引っ越し、深夜配送。24時間対応・年中無休。
    biz: '兵庫県加古川市を拠点に、企業向けの定期便・企業専属便、スポット・チャーター便、緊急配送、家具・家電の配送、深夜配送など、24時間・年中無休で運送業を営む当社',
    nightReason: '当社は24時間・年中無休で運行しており、深夜配送もあるため、夜間の時間帯のシフトを設けています。',
    image: '/images/haisou-fleet.jpg',
    // 送迎系を約60%・専属1件・配送系は少数（他社と同じ割合）。軽貨物はユーザー指示（2026-10-10）で出さない。
    types: [
      { n: 3, label: '送迎ドライバー', salary: SAL35, hours: 'day', intro: '運送の現場を支える、スタッフ・関係者の送迎を担当します。', duty: ['スタッフ・関係者の送迎', '送迎スケジュールの確認'], point: '運送の現場を、人の移動から支えるお仕事', closing: '送迎が中心で、人と接するのが苦にならない方なら安心です。' },
      { n: 3, label: 'スタッフ送迎ドライバー', salary: SAL35, hours: 'day', intro: '24時間運行の体制に合わせた、乗務員・スタッフの出退勤や、拠点間の移動を送迎でサポートします。', duty: ['乗務員・スタッフの出退勤の送迎', '拠点間の移動のサポート'], point: '24時間の運行を支える、スタッフを運ぶお仕事', closing: '運行体制を、移動の面から支える、頼りにされるお仕事です。' },
      { n: 2, label: '企業送迎ドライバー', salary: SAL35, hours: 'day', intro: '企業向けの運送（企業専属便・定期便など）の取引先企業の、従業員・関係者の送迎を担当します。', duty: ['取引先企業の従業員・関係者の送迎', '運行スケジュールの確認'], point: '企業の移動を支える、信頼されるお仕事', closing: '決まった取引先を中心に、落ち着いて運行します。' },
      { n: 2, label: '夜間送迎ドライバー', salary: SAL35_NIGHT, hours: 'night', intro: '深夜配送もある24時間運行の体制の中で、夜間の時間帯の、乗務員・スタッフの送迎を担当します。', duty: ['夜間の乗務員・スタッフの送迎', '夜間の運行スケジュールの確認'], point: '夜の時間帯に、落ち着いて働けるお仕事', closing: '夜の時間帯を活かして、安定して働けるお仕事です。' },
      { n: 1, label: '専属ドライバー', salary: SAL35, hours: 'day', intro: '決まった担当者の移動を、一貫してサポートする専任のポジションです。', duty: ['担当者の移動全般のサポート', '訪問先への送迎'], point: '専属担当として、信頼される専任のポジション', closing: '専任性が高く、長く働ける仕事です。' },
      { n: 1, label: '企業専属便ドライバー', salary: SAL27, hours: 'day', intro: '決まった企業の荷物を、専属で運ぶ「企業専属便」を担当します。', duty: ['決まった企業の荷物の専属配送', '荷物の積み込み・荷下ろし'], point: '決まった取引先を担当する、専任のお仕事', closing: '決まったルート・取引先を中心に運行します。' },
      { n: 1, label: '定期便ドライバー', salary: SAL27, hours: 'day', intro: '決まったルートを定期的に運行する「定期便」を担当します。', duty: ['定期ルートの配送', '荷物の積み込み・荷下ろし'], point: '決まったルートを走る、覚えやすいお仕事', closing: '決まったルートを中心に運行します。' },
    ],
    areas: [
      ['西宮北口', '西宮市', '兵庫県'], ['伊丹', '伊丹市', '兵庫県'], ['川西能勢口', '川西市', '兵庫県'], ['宝塚', '宝塚市', '兵庫県'],
      ['加古川', '加古川市', '兵庫県'], ['明石', '明石市', '兵庫県'], ['姫路', '姫路市', '兵庫県'], ['尼崎', '尼崎市', '兵庫県'],
      ['神戸元町', '神戸市中央区', '兵庫県'], ['京都駅', '京都市下京区', '京都府'], ['十条', '京都市南区', '京都府'], ['東寺', '京都市南区', '京都府'], ['西大路', '京都市下京区', '京都府'],
    ],
  },
};

function hoursText(h) {
  if (h === 'night') return `勤務時間：${NIGHT_HOURS}（実働8時間・休憩1時間）／固定時間制`;
  if (h === 'early') return `勤務時間：早朝（${EARLY_HOURS}）または夜間（${NIGHT_HOURS}）から選択（実働8時間・休憩1時間）／固定時間制`;
  return `勤務時間：時間選択制（${DAY_HOURS}から選択）・実働8時間・休憩1時間／固定時間制`;
}
function describe(co, t, area) {
  const night = t.hours !== 'day';
  const nightNote = night ? `\n\nなぜ夜間・早朝の勤務があるの？\n\n${co.nightReason || '業務の都合上、夜間・早朝の運行があるため、その時間帯のシフトを設けています。'}\nシフト制で、休憩もしっかり取れます（夜通しの無理な長時間勤務ではありません）。` : '';
  return `★経験者優遇／普通免許（AT限定可）で応募OK
${night ? '★深夜手当（22:00〜翌5:00）を別途支給\n' : ''}★${t.point}
★各種社会保険完備・車両燃料は会社負担（会社の車を使用）・研修あり

仕事内容

${co.biz}で、${t.label}を募集します。${t.intro}
入社後は研修で、安全運転・運行ルートの管理・応対マナーをしっかり学べます。${nightNote}

▼主な業務
${t.duty.map(d => `    •    ${d}`).join('\n')}
    •    車両の清掃・日常点検

${t.closing}

▼勤務条件
    •    勤務地：${area}周辺
    •    ${hoursText(t.hours)}
    •    休み希望シフト制／完全週休2日制${night ? '\n    •    ※18歳未満の方は応募できません' : ''}
【給与】${t.salary}
【待遇】${BENEFIT}

▼応募資格
    •    普通自動車運転免許（AT限定可）
    •    運転・送迎・配送業務のご経験がある方（経験者優遇）${night ? '\n    •    夜間・早朝の勤務が可能な方（18歳以上）' : ''}
    •    安全運転を心がけられる方

※${area}周辺での募集です。`;
}
const salaryLabel = s => { const m = s.match(/^(月給|月収)(\d{1,3}),(\d{3})円/); return m ? `${m[1]}${Math.round((+m[2] * 1000 + +m[3]) / 10000)}万円〜` : s; };

async function main() {
  console.log(`\n=== 新規Indeedアカウント3社 最初の掲載セット${APPLY ? '（--apply・実際に作成）' : '（DRY-RUN）'} ===\n`);
  let created = 0;
  for (const [coId, co] of Object.entries(COMPANIES)) {
    let ai = 0;
    console.log(`[${coId}]`);
    for (const t of co.types) {
      const have = db.prepare(`SELECT COUNT(*) n FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`).get(coId, t.label).n;
      if (have > t.n) {
        const extra = db.prepare(`SELECT id, title FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%' ORDER BY id DESC LIMIT ?`).all(coId, t.label, have - t.n);
        console.log(`  ⚠ ${t.label}: 既存${have}件が計画${t.n}件を超過（${PRUNE && APPLY ? '超過分を削除します' : '--apply --prune で超過分を削除'}）`);
        for (const r of extra) { console.log(`    対象: ${r.title}`); if (PRUNE && APPLY) await Jobs.delete(r.id); }
      }
      if (REFRESH) {
        const existing = db.prepare(`SELECT id, title FROM jobs WHERE company = ? AND job_type = ? AND target_media LIKE '%indeed%'`).all(coId, t.label);
        for (const r of existing) {
          const area = (r.title.match(/^【(.+?)】/) || [])[1];
          if (!area) continue;
          const night = t.hours !== 'day';
          console.log(`  更新: ${r.title}`);
          if (APPLY) await Jobs.update(r.id, { description: describe(co, t, area), worktimeHoliday: `${hoursText(t.hours).replace('勤務時間：', '')}\n休み希望シフト制／完全週休2日制`, tags: ['経験者優遇', '正社員', '普通免許OK', ...(night ? ['深夜手当あり'] : []), t.label] });
        }
      }
      for (let k = have; k < t.n; k++) {
        const [area, ward, pref] = co.areas[ai % co.areas.length]; ai++;
        const night = t.hours !== 'day';
        const job = {
          title: `【${area}】${t.label}｜正社員・${night ? '深夜手当あり・' : ''}経験者優遇・${salaryLabel(t.salary)}`,
          location: `${pref}${ward}${area}`,
          salary: t.salary,
          jobType: t.label,
          employmentType: '正社員',
          description: describe(co, t, area),
          catchcopy: `${t.label}（${area}）｜${night ? '深夜手当あり・' : ''}経験者優遇・${salaryLabel(t.salary)}`,
          worktimeHoliday: `${hoursText(t.hours).replace('勤務時間：', '')}\n休み希望シフト制／完全週休2日制`,
          tags: ['経験者優遇', '正社員', '普通免許OK', ...(night ? ['深夜手当あり'] : []), t.label],
          imageUrl: co.image, isPublished: true, publishedAt: new Date().toISOString(), targetMedia: ['indeed'], company: coId,
        };
        console.log(`  作成: ${job.title}`);
        if (APPLY) await Jobs.create(job);
        created++;
      }
    }
  }
  // 以前の版で作成済みの、現在のセットに無い職種（プアKYの軽貨物ドライバー）を検出・削除
  const stale = db.prepare(`SELECT id, title FROM jobs WHERE company = 'pk' AND job_type = '軽貨物ドライバー' AND target_media LIKE '%indeed%'`).all();
  if (stale.length) {
    console.log(`\n[pk] 以前の版で作成済みの「軽貨物ドライバー」: ${stale.length}件${PRUNE && APPLY ? '（削除します）' : '（--apply --prune で削除）'}`);
    for (const r of stale) { console.log(`  対象: ${r.title}`); if (PRUNE && APPLY) await Jobs.delete(r.id); }
  }
  console.log(`\n合計: ${created}件${APPLY ? 'を作成しました' : 'を作成予定（DRY-RUN）'}`);
  if (!APPLY) console.log('→ 反映するには --apply を付けて再実行してください。');
  console.log('※ DB登録のみ。Indeedへの実際の掲載は別途必要です。勤務時間・年収・深夜手当は、実際の条件と照合してください。');
}
main().catch(err => { console.error(err); process.exit(1); });
