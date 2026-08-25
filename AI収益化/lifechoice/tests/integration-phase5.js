/**
 * Phase 5 統合テスト
 *
 * このフェーズの目的はただ1つ。
 *   「大阪・ひとり・3,000円」を1回設定すれば、
 *    ③いまから何する？ ④今日だけ安い ⑤ソロマップ ⑥無料品レーダー が
 *    同時にパーソナライズされる。
 * これが本当に成立しているかを、実データ・実ロジックを通して検証する。
 *
 * 実行：node AI収益化/lifechoice/tests/integration-phase5.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toFilters, fromFilters, describe, snapBudget, AFFECTED_SERVICES } from '../lib/preference-sync.js';
import { loadPreference, savePreference, clearPreference, DEFAULT_PREFERENCE } from '../utils/storage.js';
import { PreferenceBar, PreferenceBarTop, noticeInherited } from '../components/preference-bar.js';
import { afterBuyCheck, afterBreakEven, afterNowWhat, afterTodayDeals, afterSoloMap, afterFreeItems, CrossLinkCard } from '../lib/cross-link.js';
import { SERVICES, getService } from '../lib/services.js';
import { findNowWhat } from '../lib/time-calculation.js';
import { rankDeals } from '../lib/deal-ranking.js';
import { rankSolo, FEAR_OPTIONS } from '../lib/solo-score.js';
import { findFreeItems } from '../lib/distance.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const fails = [];
const check = (name, actual, expected) => {
  if (actual === expected) pass++;
  else { fail++; fails.push(name + '\n     期待: ' + expected + '\n     実際: ' + actual); }
};
const truthy = (name, v) => { if (v) pass++; else { fail++; fails.push(name + ' → 偽'); } };
const falsy = (name, v) => { if (!v) pass++; else { fail++; fails.push(name + ' → 真であってはならない'); } };
const contains = (name, hay, needle) => {
  if (String(hay).includes(needle)) pass++;
  else { fail++; fails.push(name + ' に "' + needle + '" が無い'); }
};
const notContains = (name, hay, needle) => {
  if (!String(hay).includes(needle)) pass++;
  else { fail++; fails.push(name + ' に "' + needle + '" が残っている'); }
};
const section = t => { console.log('── ' + t); return fail; };
const closeSection = b => console.log('  → ' + (fail > b ? (fail - b) + '件 失敗' : '全件OK') + '\n');

console.log('═══ Phase 5 統合テスト ═══\n');

/* ══════════════════════════════════════════════════════
 * 1. 本構想の中核：1回の設定が4機能に同時に効く
 * ══════════════════════════════════════════════════════ */
let b = section('1. 「大阪・ひとり・3,000円」を1回設定する');

clearPreference();
const saved = savePreference({
  location: { areaName: '大阪市' },
  budget: 3000,
  transportation: 'walk',
  soloPreference: 5,          // ひとり
  conversationPreference: 5,  // 話しかけられたくない
  reservationPreference: 4    // 予約は避けたい
});

check('保存された予算', saved.budget, 3000);
check('保存されたエリア', saved.location.areaName, '大阪市');
check('1行表現', describe(saved), '大阪市 ／ ひとり ／ 〜3,000円 ／ 徒歩');
truthy('updatedAt が入る', !!saved.updatedAt);
closeSection(b);

b = section('2. その1回が ③④⑤⑥ の初期条件に反映される');

const f3 = toFilters('now-what', saved);
const f4 = toFilters('today-deals', saved);
const f5 = toFilters('solo-map', saved);
const f6 = toFilters('free-items', saved);

check('③ 予算', f3.budget, 3000);
check('③ 人数 = ひとり', f3.who, 'solo');
check('③ 気分 = 静かに', f3.mood, 'quiet');
check('③ 移動手段', f3.transportation, 'walk');
check('④ 予算', f4.budget, 3000);
check('⑤ 予算', f5.budget, 3000);
check('⑤ 避けたいこと = 会話（最も強い忌避）', f5.fear, 'talk');
check('⑥ 移動手段', f6.transportation, 'walk');
truthy('⑤のfearはFEAR_OPTIONSに実在する値', FEAR_OPTIONS.some(o => o.value === f5.fear));
closeSection(b);

b = section('3. 設定を変えると4機能の初期条件も同時に変わる');

const other = savePreference({ budget: 1000, transportation: 'bike', soloPreference: 1, conversationPreference: 1, reservationPreference: 1 });
const g3 = toFilters('now-what', other);
check('③ 予算が追随', g3.budget, 1000);
check('③ 人数が「2人以上」へ', g3.who, 'multi');
check('③ 気分が「話したい」へ', g3.mood, 'talk');
check('④ 予算が追随', toFilters('today-deals', other).budget, 1000);
check('⑤ 忌避が「特にない」へ', toFilters('solo-map', other).fear, 'none');
check('⑥ 移動手段が追随', toFilters('free-items', other).transportation, 'bike');
closeSection(b);

/* ══════════════════════════════════════════════════════
 * 4. 実データを通した End-to-End：設定によって結果件数が変わるか
 *    （初期条件だけ変わって結果が同じなら、パーソナライズできていない）
 * ══════════════════════════════════════════════════════ */
b = section('4. 実データを通すと、設定によって結果が実際に変わる');

// fetch はNodeで相対パスを解決できないため、テストではJSONを直接読む
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const stores = json('stores.json');
const openStores = stores.filter(s => s.openingTime !== null);
const deals = json('deals.json');
const freeItems = json('free-items.json');

const prefA = { ...DEFAULT_PREFERENCE, budget: 3000, transportation: 'walk', soloPreference: 5, conversationPreference: 5, reservationPreference: 4 };
const prefB = { ...DEFAULT_PREFERENCE, budget: 1000, transportation: 'car', soloPreference: 1, conversationPreference: 1, reservationPreference: 1 };
const A = { 3: toFilters('now-what', prefA), 4: toFilters('today-deals', prefA), 5: toFilters('solo-map', prefA), 6: toFilters('free-items', prefA) };
const B = { 3: toFilters('now-what', prefB), 4: toFilters('today-deals', prefB), 5: toFilters('solo-map', prefB), 6: toFilters('free-items', prefB) };

const now3A = findNowWhat(openStores, { now: 14, until: 18, budget: A[3].budget, who: A[3].who, mood: A[3].mood, body: 'any' });
const now3B = findNowWhat(openStores, { now: 14, until: 18, budget: B[3].budget, who: B[3].who, mood: B[3].mood, body: 'any' });
truthy('③ どちらの条件でも結果が出る', now3A.length > 0 && now3B.length > 0);
truthy('③ 条件が違えば並び or 件数が変わる',
  now3A.length !== now3B.length || now3A[0].store.id !== now3B[0].store.id);

const d4A = rankDeals(deals, { budget: snapBudget(A[4].budget, [1000, 3000, 6000, 99999]), category: 'all', nowHour: 14 });
const d4B = rankDeals(deals, { budget: snapBudget(B[4].budget, [1000, 3000, 6000, 99999]), category: 'all', nowHour: 14 });
truthy('④ 予算3,000円のほうが1,000円より多く出る', d4A.length > d4B.length);

const s5A = rankSolo(stores, { fear: A[5].fear, budget: snapBudget(A[5].budget, [0, 1000, 2000, 4000]), maxStayMinutes: 120 });
const s5B = rankSolo(stores, { fear: B[5].fear, budget: snapBudget(B[5].budget, [0, 1000, 2000, 4000]), maxStayMinutes: 120 });
truthy('⑤ どちらの条件でも結果が出る', s5A.length > 0 && s5B.length > 0);
// 5項目すべて満点の業態（公園・図書館など6件）は、どの条件でも同点100になる。
// これはデータが正直である結果なので、上位の入れ替わりではなく
// 「大多数の点数と順位が動くこと」で、条件が効いていることを検証する。
// 予算は揃えて、避けたいことだけを変えて比べる（件数が変わると比較にならない）
const s5C = rankSolo(stores, { fear: B[5].fear, budget: snapBudget(A[5].budget, [0, 1000, 2000, 4000]), maxStayMinutes: 120 });
check('⑤ 予算が同じなら件数も同じ', s5C.length, s5A.length);
const moved = s5A.filter((x, i) => s5C[i].store.id !== x.store.id).length;
const rescored = s5A.filter(x => x.score !== s5C.find(y => y.store.id === x.store.id).score).length;
truthy('⑤ 避けたいことを変えると過半数の順位が動く（' + moved + '/' + s5A.length + '件）', moved > s5A.length * 0.4);
truthy('⑤ 避けたいことを変えると大半の点数が変わる（' + rescored + '/' + s5A.length + '件）', rescored > s5A.length * 0.7);
truthy('⑤ 重み3倍の項目に「重視」印が付く', s5A[0].breakdown.filter(x => x.weighted).length === 1);
check('⑤ 特に避けたいことが無ければ印は付かない', s5C[0].breakdown.filter(x => x.weighted).length, 0);
contains('⑤ 同率であることを画面で明示している', fs.readFileSync(path.join(ROOT, 'app', 'solo-map.html'), 'utf8'), '同率です');

const i6A = findFreeItems(freeItems, { maxDistanceKm: 1.5, maxSize: 2, pickupEnd: 'today', transportation: A[6].transportation });
const i6B = findFreeItems(freeItems, { maxDistanceKm: 1.5, maxSize: 2, pickupEnd: 'today', transportation: B[6].transportation });
truthy('⑥ 徒歩と車で持ち帰りおすすめ度が変わる',
  i6A.length > 0 && i6B.length > 0 && i6A.some((r, i) => r.carry.stars !== i6B[i].carry.stars));
closeSection(b);

/* ══════════════════════════════════════════════════════
 * 5. 書き戻し：機能側で操作すると設定が育つ
 * ══════════════════════════════════════════════════════ */
b = section('5. 機能側の操作が設定へ書き戻される');

clearPreference();
savePreference({ budget: 3000, soloPreference: 3, conversationPreference: 3 });
fromFilters('now-what', { budget: 5000, transportation: 'bike', who: 'solo', mood: 'quiet' });
const after = loadPreference();
check('③の操作で予算が更新される', after.budget, 5000);
check('③の操作で移動手段が更新される', after.transportation, 'bike');
check('③の「ひとり」が soloPreference に入る', after.soloPreference, 5);
check('③の「静かに」が conversationPreference に入る', after.conversationPreference, 5);

fromFilters('solo-map', { budget: 2000, fear: 'book' });
const after2 = loadPreference();
check('⑤の操作で予算が更新される', after2.budget, 2000);
check('⑤の「予約が要る」が reservationPreference に入る', after2.reservationPreference, 5);
check('⑤の操作でも③の設定は保持される', after2.soloPreference, 5);

const before3 = loadPreference().budget;
fromFilters('today-deals', { budget: 99999 });   // 「上限なし」は予算として保存しない
check('「上限なし(99999)」は保存しない', loadPreference().budget, before3);
closeSection(b);

b = section('6. 往復変換が壊れない（toFilters → fromFilters → toFilters）');

clearPreference();
const orig = savePreference({ budget: 2000, transportation: 'train', soloPreference: 5, conversationPreference: 5, reservationPreference: 2 });
const round1 = toFilters('now-what', orig);
fromFilters('now-what', round1);
const round2 = toFilters('now-what', loadPreference());
check('予算が往復して変わらない', round2.budget, round1.budget);
check('人数が往復して変わらない', round2.who, round1.who);
check('気分が往復して変わらない', round2.mood, round1.mood);
check('移動手段が往復して変わらない', round2.transportation, round1.transportation);
closeSection(b);

/* ══════════════════════════════════════════════════════
 * 7. snapBudget：機能ごとに予算の刻みが違っても破綻しない
 * ══════════════════════════════════════════════════════ */
b = section('7. 予算の刻みが機能ごとに違っても選択肢に必ず着地する');

const OPT5 = [0, 1000, 2000, 4000];        // ⑤ソロマップ
const OPT4 = [1000, 3000, 6000, 99999];    // ④今日だけ安い
check('3,000円 → ⑤では2,000円へ（上限は超えない）', snapBudget(3000, OPT5), 2000);
check('4,000円 → ⑤では4,000円のまま', snapBudget(4000, OPT5), 4000);
check('5,000円 → ⑤では4,000円へ', snapBudget(5000, OPT5), 4000);
check('500円 → 該当なしなら最小値', snapBudget(500, OPT5), 0);
check('3,000円 → ④では3,000円のまま', snapBudget(3000, OPT4), 3000);
check('500円 → ④では最小の1,000円', snapBudget(500, OPT4), 1000);
check('元の配列を破壊しない', OPT5.join(','), '0,1000,2000,4000');
[OPT4, OPT5, [0, 1000, 2000, 3000, 5000, 99999]].forEach((opts, i) => {
  [0, 999, 1000, 2500, 3000, 7000, 99999].forEach(v => {
    truthy('刻み' + i + ' 予算' + v + ' は必ず選択肢の中に着地する', opts.includes(snapBudget(v, opts)));
  });
});
closeSection(b);

/* ══════════════════════════════════════════════════════
 * 8. PreferenceBar / 回遊カード
 * ══════════════════════════════════════════════════════ */
b = section('8. PreferenceBar と回遊導線');

clearPreference();
const barNew = PreferenceBar();
contains('未設定時は誘い文句を出す', barNew, '6機能すべてに反映されます');
contains('未設定時のボタンは「設定する」', barNew, '設定する');

savePreference({ location: { areaName: '大阪市' }, budget: 3000, soloPreference: 5 });
const barSet = PreferenceBar();
contains('設定済みなら条件を表示する', barSet, '大阪市');
contains('設定済みなら「あなたの条件」', barSet, 'あなたの条件');
contains('設定画面へのリンクがある', barSet, '../app/settings.html');
contains('トップ用はパスが1階層違う', PreferenceBarTop(), 'href="app/settings.html"');
notContains('トップ用に ../ が残っていない', PreferenceBarTop(), '"../app/settings.html"');

check('引き継ぎ通知（空なら出さない）', noticeInherited('now-what', {}), '');
contains('引き継ぎ通知に項目名が出る', noticeInherited('now-what', { budget: 3000, who: 'solo' }), '予算・人数');

// 回遊：6機能すべてから次の行き先が示せるか
const links = [
  ['①rent', afterBuyCheck('rent', 'テント')],
  ['①stop', afterBuyCheck('stop', 'テント')],
  ['②', afterBreakEven()],
  ['③(0件)', afterNowWhat({ total: 0, noBooking: 0 }, 'solo')],
  ['③(ひとり)', afterNowWhat({ total: 5, noBooking: 3 }, 'solo')],
  ['③(複数)', afterNowWhat({ total: 5, noBooking: 3 }, 'multi')],
  ['④(0件)', afterTodayDeals(0)],
  ['④(あり)', afterTodayDeals(3)],
  ['⑤', afterSoloMap()],
  ['⑥(0件)', afterFreeItems(0)],
  ['⑥(あり)', afterFreeItems(3)]
];
links.forEach(([name, cl]) => {
  truthy(name + ' の回遊先が存在する', !!cl);
  if (!cl) return;
  truthy(name + ' の遷移先が実在の機能', !!getService(cl.serviceId));
  check(name + ' のリンク先がservices定義と一致', cl.href, getService(cl.serviceId).path);
  contains(name + ' のカードHTML', CrossLinkCard(cl), 'href="' + cl.href + '"');
});
check('①buy は回遊させない（買うのが最適なら誘導しない）', afterBuyCheck('buy', 'テント'), null);
check('①used も回遊させない', afterBuyCheck('used', 'テント'), null);
check('回遊先が無ければ空文字を返す', CrossLinkCard(null), '');
closeSection(b);

/* ══════════════════════════════════════════════════════
 * 9. 全ページの結線確認（静的検査）
 * ══════════════════════════════════════════════════════ */
b = section('9. 全ページに設定連携が結線されている');

const PAGES = ['buy-check', 'unnecessary-buy', 'now-what', 'today-deals', 'solo-map', 'free-items'];
const readPage = f => fs.readFileSync(path.join(ROOT, 'app', f + '.html'), 'utf8');

PAGES.forEach(id => {
  const s = readPage(id);
  contains(id + '：PreferenceBar の差し込み先がある', s, 'id="prefbar"');
  contains(id + '：PreferenceBar を描画している', s, "html('#prefbar', PreferenceBar())");
  contains(id + '：回遊カードを出している', s, 'CrossLinkCard(');
  notContains(id + '：未定義の pref を参照していない', s, 'pref.');
  notContains(id + '：設定画面の壊れたリンクが無い', s, 'settings.htm"');
});

// 条件を引き継ぐ4機能は toFilters を通しているか
['now-what', 'today-deals', 'solo-map', 'free-items'].forEach(id => {
  const s = readPage(id);
  contains(id + '：toFilters で初期値を作っている', s, "toFilters('" + id + "')");
  contains(id + '：fromFilters で書き戻している', s, "fromFilters('" + id + "'");
  contains(id + '：引き継ぎを利用者に伝えている', s, 'noticeInherited');
  notContains(id + '：savePreference の直接呼び出しが残っていない', s, 'savePreference(');
});

// トップページ
const top = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
contains('index：PreferenceBarTop を使っている', top, 'PreferenceBarTop()');
contains('index：差し込み先がある', top, 'id="prefbar"');

// 設定画面
const st = fs.readFileSync(path.join(ROOT, 'app', 'settings.html'), 'utf8');
contains('settings：保存できる', st, 'savePreference(');
contains('settings：リセットできる', st, 'clearPreference(');
contains('settings：どの機能に効くかを示している', st, 'AFFECTED_SERVICES');
contains('settings：端末内保存であることを明記', st, 'サーバーには送信されません');
closeSection(b);

/* ══════════════════════════════════════════════════════
 * 10. import が全て解決するか（壊れたパス・未エクスポートの検出）
 * ══════════════════════════════════════════════════════ */
b = section('10. 全ページの import が解決する');

const allPages = ['index.html', 'app/settings.html', ...PAGES.map(p => 'app/' + p + '.html')];
for (const rel of allPages) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const dir = path.dirname(path.join(ROOT, rel));
  const re = /import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    const names = m[1].split(',').map(x => x.trim()).filter(Boolean);
    const target = path.resolve(dir, m[2]);
    if (!fs.existsSync(target)) { fail++; fails.push(rel + ' → ' + m[2] + ' が存在しない'); continue; }
    let mod;
    try { mod = await import('file://' + target.replace(/\\/g, '/')); }
    catch (e) { fail++; fails.push(rel + ' → ' + m[2] + ' の読み込みに失敗: ' + e.message); continue; }
    names.forEach(n => {
      if (n in mod) pass++;
      else { fail++; fails.push(rel + ' が ' + m[2] + ' から未定義の ' + n + ' を import している'); }
    });
  }
}
closeSection(b);

/* ══════════════════════════════════════════════════════
 * 11. 厳守事項の確認
 * ══════════════════════════════════════════════════════ */
b = section('11. 厳守事項の確認');

// 事項11：架空データの明示が消えていないか
['today-deals', 'free-items'].forEach(id => {
  contains(id + '：DEMO表示（事項11）が維持されている', readPage(id), 'DemoBanner(');
});
// 事項12：秘密情報の直書きが無いか
allPages.forEach(rel => {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  falsy(rel + '：APIキーらしき文字列が無い（事項12）', /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9]{12,}/i.test(s));
});
// 事項5：同じ計算をページにコピーしていないか
PAGES.forEach(id => {
  falsy(id + '：スコア計算をページに書いていない（事項5）', /const\s+score\s*=\s*.*\*\s*0\.\d/.test(readPage(id)));
});
// 事項13：既存プロトタイプを壊していないか
truthy('demo/ の6ファイルが残っている（事項13）',
  fs.readdirSync(path.join(ROOT, '..', 'demo')).filter(f => f.endsWith('.html')).length >= 6);
// AFFECTED_SERVICES が実在の機能を指しているか
Object.entries(AFFECTED_SERVICES).forEach(([k, ids]) => {
  ids.forEach(id => truthy('AFFECTED_SERVICES.' + k + ' の ' + id + ' は実在する', SERVICES.some(s => s.id === id)));
});
closeSection(b);

console.log('═'.repeat(48));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  ✓ 1回の設定が6機能へ正しく共有されています');
}
