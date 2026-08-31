/**
 * Phase 3 コンポーネントテスト
 *
 * ・全モジュールが読み込めるか
 * ・各コンポーネントが妥当なHTMLを返すか
 * ・utils が既存6HTMLと同じ結果を返すか（回帰）
 * ・エスケープが効いているか
 *
 * 実行：node AI収益化/lifechoice/tests/components-phase3.js
 */
import { yen, priceRange, hhmm, duration, distance, percent, stars, travelMinutes } from '../utils/format.js';
import { esc, cx } from '../utils/dom.js';
import { DEFAULT_PREFERENCE } from '../utils/storage.js';
import { SERVICES, GROUPS, getService, servicesInGroup, navItems } from '../lib/services.js';
import { StaticDataProvider, ScrapingDataProvider } from '../lib/data-provider.js';
import { Header, BottomNavigation } from '../components/layout.js';
import { Filter, SearchBox, LocationSelector, TransportSelector } from '../components/filter.js';
import { ResultCard, Score, StarScore, Meter, PriceComparison, EmptyState, DemoBadge, DemoBanner, ResultSummary } from '../components/result.js';
import { ShareBox, Cta, Disclaimer } from '../components/footer.js';

let pass = 0, fail = 0;
const fails = [];
const check = (name, actual, expected) => {
  const ok = actual === expected;
  if (ok) pass++; else { fail++; fails.push(name + '\n     期待: ' + expected + '\n     実際: ' + actual); }
};
const truthy = (name, v) => { if (v) pass++; else { fail++; fails.push(name + ' → 偽'); } };
const contains = (name, hay, needle) => {
  if (String(hay).includes(needle)) pass++;
  else { fail++; fails.push(name + ' に "' + needle + '" が含まれない'); }
};

console.log('═══ Phase 3 コンポーネントテスト ═══\n');

/* ── utils/format：既存6HTMLの実装と同じ結果を返すか ── */
console.log('utils/format（既存実装との一致）');
check('yen(89800)', yen(89800), '¥89,800');
check('yen(0)', yen(0), '¥0');
check('hhmm(17.5)', hhmm(17.5), '17:30');
check('hhmm(23.5)', hhmm(23.5), '23:30');
check('hhmm(24)  日跨ぎ', hhmm(24), '00:00');
check('hhmm(25.5) 日跨ぎ', hhmm(25.5), '01:30');
check('priceRange(0,0)', priceRange(0, 0), '無料');
check('priceRange(500,1800)', priceRange(500, 1800), '¥500〜¥1,800');
check('priceRange(0,99999) 上限なし', priceRange(0, 99999), '¥0〜');
check('duration(150)', duration(150), '2時間30分');
check('duration(45)', duration(45), '45分');
check('duration(120)', duration(120), '2時間');
check('distance(0.4)', distance(0.4), '400m');
check('distance(1.5)', distance(1.5), '1.5km');
check('percent(0.5)', percent(0.5), '50%');
check('stars(3)', stars(3), '★★★☆☆');
check('travelMinutes(1.2,walk)', travelMinutes(1.2, 'walk'), 15);
check('travelMinutes(1.2,bike)', travelMinutes(1.2, 'bike'), 5);
console.log('  → ' + (fail ? fail + '件 不一致' : '全件一致') + '\n');

/* ── utils/dom：エスケープ ── */
const b4 = fail;
console.log('utils/dom（XSS対策）');
check('esc(<script>)', esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
check('esc(引用符)', esc('a"b\'c'), 'a&quot;b&#39;c');
check('esc(null)', esc(null), '');
check('cx', cx('a', false, 'b', null, 'c'), 'a b c');
console.log('  → ' + (fail > b4 ? (fail - b4) + '件 不一致' : '全件一致') + '\n');

/* ── lib/services ── */
const b5 = fail;
console.log('lib/services');
check('6機能が定義されている', SERVICES.length, 6);
check('グループは3つ', GROUPS.length, 3);
check('買い物グループ', servicesInGroup('buy').length, 2);
check('今すぐグループ', servicesInGroup('now').length, 2);
check('発見グループ', servicesInGroup('discover').length, 2);
check('ナビは4項目（ホーム含む）', navItems().length, 4);
truthy('getService(buy-check)', getService('buy-check'));
check('架空データを持つ機能', SERVICES.filter(s => s.hasDemoData).map(s => s.id).join(','), 'today-deals,free-items');
truthy('全機能にid/name/path', SERVICES.every(s => s.id && s.name && s.path && s.icon));
console.log('  → ' + (fail > b5 ? (fail - b5) + '件 不一致' : '全件一致') + '\n');

/* ── components：妥当なHTMLを返すか ── */
const b6 = fail;
console.log('components（出力の妥当性）');
const h = Header({ serviceId: 'buy-check' });
contains('Header にサービス名', h, '買う前チェック');
contains('Header にブランド名', h, 'LIFE CHOICE');
contains('Header に戻る導線', h, 'index.html');

const nav = BottomNavigation('buy-check');
contains('Nav に現在地マーク', nav, 'aria-current="page"');
check('Nav の項目数', (nav.match(/lc-nav__item/g) || []).length, 4);

const f = Filter({ name: 'budget', label: '予算', value: 2000, options: [{ value: 1000, label: '〜1,000円' }, { value: 2000, label: '〜2,000円' }] });
contains('Filter に選択状態', f, 'checked');
check('Filter の選択肢数', (f.match(/<input/g) || []).length, 2);

contains('SearchBox にプレースホルダ', SearchBox(), 'キャンプ');
contains('LocationSelector に現在地ボタン', LocationSelector(), 'lc-geo');
contains('TransportSelector に徒歩', TransportSelector(), '徒歩');

const card = ResultCard({ title: '映画館', price: '¥1,300〜¥2,000', tags: [{ label: '予約不要', variant: 'ok' }], why: '座って完結' });
contains('ResultCard にタイトル', card, '映画館');
contains('ResultCard にタグ', card, 'lc-tag--ok');
truthy('ResultCard はDEMO印なし', !card.includes('lc-demo'));

const demoCard = ResultCard({ title: 'ホールケーキ', isDemo: true });
contains('isDemo:true でDEMO印が出る', demoCard, 'lc-demo');

contains('DemoBadge', DemoBadge(), 'DEMO');
contains('DemoBanner', DemoBanner(), 'サンプル');
contains('Score', Score({ value: 88, label: 'ソロ度' }), '88');
contains('StarScore', StarScore(3, '持ち帰り'), '★★★☆☆');
contains('Meter 幅計算', Meter({ label: '一人入りやすさ', value: 4 }), 'width:80%');
contains('PriceComparison', PriceComparison({ a: { label: '買う', value: 32000 }, b: { label: '借りる', value: 4700 } }), '¥32,000');
contains('EmptyState', EmptyState(), '見つかりませんでした');
contains('ResultSummary', ResultSummary('<b>19件</b>'), '19件');

const share = ShareBox('テスト結果です');
contains('ShareBox にコピーボタン', share, 'lc-share-copy');
contains('ShareBox にX投稿', share, 'twitter.com/intent');

const ctaOn = Cta({ links: [{ label: 'Amazonで探す', url: 'https://example.com' }] });
contains('Cta にsponsored属性', ctaOn, 'rel="noopener sponsored"');
const ctaOff = Cta({ links: [] });
contains('Cta 未設定時は無効化', ctaOff, 'aria-disabled="true"');

const dis = Disclaimer({ hasDemoData: true });
contains('Disclaimer に法務リンク', dis, 'legal.html');
contains('Disclaimer にデモ警告', dis, 'サンプル');
console.log('  → ' + (fail > b6 ? (fail - b6) + '件 不一致' : '全件一致') + '\n');

/* ── XSS：データ由来の文字列が無害化されるか ── */
const b7 = fail;
console.log('XSS対策（データに悪意ある文字列が入った場合）');
const evil = ResultCard({ title: '<img src=x onerror=alert(1)>', why: '<script>bad()</script>' });
truthy('タイトルがエスケープされる', !evil.includes('<img src=x'));
truthy('本文がエスケープされる', !evil.includes('<script>bad()'));
contains('エスケープ後の実体参照', evil, '&lt;img');
console.log('  → ' + (fail > b7 ? (fail - b7) + '件 不一致' : '全件一致') + '\n');

/* ── DataProvider ── */
const b8 = fail;
console.log('lib/data-provider');
truthy('StaticDataProvider に全メソッド',
  ['getProducts', 'getRentals', 'getStores', 'getDeals', 'getFreeItems', 'meta']
    .every(m => typeof StaticDataProvider[m] === 'function'));
check('meta().isLive', StaticDataProvider.meta().isLive, false);
const sc = await ScrapingDataProvider.getProducts().then(() => 'resolved').catch(e => e.message);
truthy('ScrapingDataProvider は意図的に未実装', sc.includes('意図的に未実装'));
truthy('  規約確認を促すメッセージを含む', sc.includes('利用規約'));
console.log('  → ' + (fail > b8 ? (fail - b8) + '件 不一致' : '全件一致') + '\n');

/* ── storage の既定値 ── */
const b9 = fail;
console.log('utils/storage');
check('既定の予算', DEFAULT_PREFERENCE.budget, 3000);
check('既定の移動手段', DEFAULT_PREFERENCE.transportation, 'walk');
truthy('versionを持つ（移行用）', !!DEFAULT_PREFERENCE.version);
console.log('  → ' + (fail > b9 ? (fail - b9) + '件 不一致' : '全件一致') + '\n');

console.log('═'.repeat(46));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  ✓ 共通コンポーネントは正しく動作しています');
}
