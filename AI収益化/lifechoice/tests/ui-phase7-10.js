/**
 * Phase 7・9・10 のテスト
 *
 * Phase 7  設定の拡充（関心分野・履歴・書き出し）
 * Phase 9  締切のあるものの表示（プッシュ通知は使わない）
 * Phase 10 狭い画面での破綻を防ぐ
 *
 * 実行：node AI収益化/lifechoice/tests/ui-phase7-10.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadPreference, savePreference, clearPreference, DEFAULT_PREFERENCE,
  pushHistory, loadHistory, clearHistory, exportData, importData
} from '../utils/storage.js';
import { recommend, notificationCandidates } from '../lib/recommendation.js';
import { NoticeBar, CountBadge, countByService } from '../components/notice.js';
import { MultiFilter } from '../components/filter.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const data = {
  products: json('products.json'), stores: json('stores.json'), deals: json('deals.json'),
  freeItems: json('free-items.json'), activitySets: json('activity-sets.json')
};

let pass = 0, fail = 0;
const fails = [];
const check = (name, a, e) => { if (a === e) pass++; else { fail++; fails.push(name + '\n     期待: ' + e + '\n     実際: ' + a); } };
const truthy = (name, v) => { if (v) pass++; else { fail++; fails.push(name + ' → 偽'); } };
const falsy = (name, v) => { if (!v) pass++; else { fail++; fails.push(name + ' → 真であってはならない'); } };
const contains = (name, hay, needle) => {
  if (String(hay).includes(needle)) pass++; else { fail++; fails.push(name + ' に "' + needle + '" が無い'); }
};
const notContains = (name, hay, needle) => {
  if (!String(hay).includes(needle)) pass++; else { fail++; fails.push(name + ' に "' + needle + '" が残っている'); }
};
const section = t => { console.log('── ' + t); return fail; };
const close = b => console.log('  → ' + (fail > b ? (fail - b) + '件 失敗' : '全件OK') + '\n');

console.log('═══ Phase 7・9・10 テスト ═══\n');

/* ═══════════ Phase 7 ═══════════ */
let b = section('1. 設定：関心のある分野');

clearPreference();
const saved = savePreference({ preferredCategories: ['camping', 'photography'] });
check('関心分野が保存される', saved.preferredCategories.join(','), 'camping,photography');
check('再読込しても残る', loadPreference().preferredCategories.length, 2);

const withInterest = recommend({
  pref: { ...DEFAULT_PREFERENCE, preferredCategories: ['camping', 'photography'] },
  hasPref: true, nowHour: 13, history: [], data
});
const without = recommend({
  pref: { ...DEFAULT_PREFERENCE, preferredCategories: [] },
  hasPref: true, nowHour: 13, history: [], data
});
truthy('関心分野があると統合検索が候補に入る', withInterest.some(r => r.serviceId === 'search'));
falsy('関心分野が無ければ入らない', without.some(r => r.serviceId === 'search'));
const s = withInterest.find(r => r.serviceId === 'search');
contains('理由に選んだ分野名が出る', s.reason, 'キャンプ');
contains('理由にもう1つの分野名も出る', s.reason, 'カメラ・写真');
truthy('実在の分野だけを参照している',
  ['camping', 'photography'].every(id => data.activitySets.some(a => a.id === id)));

// 存在しないIDを入れても壊れないこと
const bogus = recommend({
  pref: { ...DEFAULT_PREFERENCE, preferredCategories: ['nonexistent'] },
  hasPref: true, nowHour: 13, history: [], data
});
falsy('存在しない分野は無視される', bogus.some(r => r.serviceId === 'search'));
close(b);

b = section('2. 設定：履歴');

clearHistory();
check('初期は空', loadHistory().length, 0);
pushHistory({ service: 'buy-check', productId: 'camping-set' });
pushHistory({ service: 'search', query: 'キャンプ' });
check('新しい順に積まれる', loadHistory()[0].service, 'search');
check('2件ある', loadHistory().length, 2);
truthy('時刻が入る', typeof loadHistory()[0].at === 'number');
clearHistory();
check('消せる', loadHistory().length, 0);
close(b);

b = section('3. 設定：書き出しと読み込み');

clearPreference(); clearHistory();
savePreference({ budget: 5000, transportation: 'bike', soloPreference: 5, preferredCategories: ['ski'] });
pushHistory({ service: 'solo-map', count: 12 });
const dump = exportData();
const parsed = JSON.parse(dump);
check('種別が入る', parsed.kind, 'lifechoice-backup');
truthy('書き出し日が入る', !!parsed.exportedAt);
check('設定が入る', parsed.preference.budget, 5000);
check('履歴が入る', parsed.history.length, 1);

clearPreference(); clearHistory();
check('消去できている', loadPreference().budget, DEFAULT_PREFERENCE.budget);
const r1 = importData(dump);
truthy('読み込める', r1.ok);
check('予算が戻る', loadPreference().budget, 5000);
check('移動手段が戻る', loadPreference().transportation, 'bike');
check('関心分野が戻る', loadPreference().preferredCategories.join(','), 'ski');
check('履歴も戻る', loadHistory().length, 1);

// 壊れた入力・別形式を弾けること
falsy('壊れた文字列は弾く', importData('あいうえお').ok);
falsy('別形式のJSONは弾く', importData('{"kind":"other"}').ok);
falsy('設定が無いものは弾く', importData('{"kind":"lifechoice-backup"}').ok);
falsy('空文字は弾く', importData('').ok);
contains('弾いた理由を返す', importData('あいうえお').message, '読み取れませんでした');

// 余計なキーを持ち込ませないこと
clearPreference();
importData(JSON.stringify({ kind: 'lifechoice-backup', preference: { budget: 2000, evil: 'x' } }));
falsy('未知のキーは取り込まない', 'evil' in loadPreference());
check('既知のキーは取り込む', loadPreference().budget, 2000);
close(b);

b = section('4. 設定画面の結線');

const st = fs.readFileSync(path.join(ROOT, 'app', 'settings.html'), 'utf8');
contains('関心分野を選べる', st, 'MultiFilter(');
contains('関心分野を保存する', st, "pickAll('interests')");
contains('履歴を表示する', st, 'loadHistory()');
contains('履歴を消せる', st, 'clearHistory(');
contains('書き出せる', st, 'exportData()');
contains('読み込める', st, 'importData(');
contains('端末内保存であることを明記', st, 'サーバーには送信されません');
contains('エリアが未対応な理由を説明している', st, '個別店舗の座標を持っていない');

// MultiFilter が複数選択になっているか
const mf = MultiFilter({ name: 't', label: 'テスト', values: ['b'],
  options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
contains('checkboxである', mf, 'type="checkbox"');
contains('選択状態が反映される', mf, 'value="b" checked');
notContains('ラジオではない', mf, 'type="radio"');
close(b);

/* ═══════════ Phase 9 ═══════════ */
b = section('5. 締切のあるものの表示');

const notices = notificationCandidates({ pref: { budget: 3000 }, nowHour: 18, data });
truthy('候補が出る', notices.length > 0);

const bar = NoticeBar(notices);
contains('件数を出す', bar, 'まもなく終わるもの');
contains('遷移先がある', bar, 'href=');
// 現状のデータは全てサンプルなので、必ずその旨を出すこと（厳守事項11）
contains('サンプルであることを明示', bar, '実在の店舗・出品ではありません');
contains('DEMO印がある', bar, 'lc-demo');
contains('サンプル用の見た目になる', bar, 'lc-notice--demo');

check('候補が無ければ何も出さない', NoticeBar([]), '');
check('nullでも落ちない', NoticeBar(null), '');
check('件数は最大3件', (NoticeBar(notices).match(/<li>/g) || []).length, 3);

// 機能ごとの件数
const counts = countByService(notices);
truthy('今日だけ安いの件数が出る', counts['today-deals'] && counts['today-deals'].count > 0);
truthy('サンプル由来として数える', counts['today-deals'].isDemo);
check('0件ならバッジを出さない', CountBadge(0), '');
contains('件数バッジが出る', CountBadge(3, true), '3');
contains('サンプルのバッジは色を変える', CountBadge(3, true), 'lc-badge--demo');
notContains('実データのバッジは通常色', CountBadge(3, false), 'lc-badge--demo');

// トップページへの結線
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
contains('トップが締切表示を使う', idx, 'NoticeBar(');
contains('トップが件数バッジを使う', idx, 'CountBadge(');
contains('差し込み先がある', idx, 'id="notice"');
// プッシュ通知は使わない方針
notContains('プッシュ通知を使っていない', idx, 'Notification');
notContains('ServiceWorkerを登録していない', idx, 'serviceWorker');
close(b);

/* ═══════════ Phase 10 ═══════════ */
b = section('6. 狭い画面での破綻を防ぐ');

const css = ['tokens', 'base', 'components']
  .map(f => fs.readFileSync(path.join(ROOT, 'styles', f + '.css'), 'utf8')).join('\n');

contains('狭い画面用の指定がある', css, '@media (max-width: 400px)');
contains('長い名称が折り返る', css, 'overflow-wrap: anywhere');
contains('金額は折り返さない', css, '.lc-table .num { white-space: nowrap; }');
contains('本文が横に溢れない', css, 'html, body { overflow-x: hidden; }');
contains('表だけ横スクロールできる', css, '.lc-scroll-x { overflow-x: auto;');
contains('タップ領域の最小値がある', css, '--tap:');

// 固定幅の要素が狭い画面で縮むこと
['.lc-meter__label', '.lc-bar__label'].forEach(sel => {
  const narrow = css.split('@media (max-width: 400px)')[1] || '';
  contains(sel + ' が狭い画面で縮む', narrow, sel);
});

// 4列以上の表は必ず横スクロール枠の中にあること
const pages = [];
['app', 'guide'].forEach(d => fs.readdirSync(path.join(ROOT, d))
  .filter(f => f.endsWith('.html')).forEach(f => pages.push(path.join(d, f))));
pages.push('index.html');

let outside = 0;
pages.forEach(p => {
  const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
  [...src.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].forEach(t => {
    const cols = Math.max(0, ...[...t[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map(row => (row[1].match(/<t[hd]/g) || []).length));
    if (cols < 4) return;
    const before = src.slice(Math.max(0, t.index - 220), t.index);
    if (!before.includes('lc-scroll-x')) { outside++; fails.push(p + ' の' + cols + '列の表が横スクロール枠の外'); fail++; }
    else pass++;
  });
});
truthy('4列以上の表はすべて横スクロール枠の中（' + (outside ? outside + '件 違反' : '違反なし') + '）', outside === 0);

// 画面幅に依存しない単位を使っているか
pages.forEach(p => {
  const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const fixed = [...src.matchAll(/style="[^"]*width:\s*(\d{3,})px/g)];
  falsy(p + ' に固定幅の直書きが無い', fixed.length > 0);
});

// すべてのページが viewport を宣言しているか
pages.forEach(p => {
  const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
  contains(p + ' に viewport 指定', src, 'name="viewport"');
});
close(b);

console.log('═'.repeat(48));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.slice(0, 20).forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  ✓ 設定・お知らせ・狭い画面の対応は正しく動作しています');
}
