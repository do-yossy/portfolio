/**
 * Phase 6 テスト（統合検索・共通Recommendation Engine）
 *
 * ・自由入力から予算と活動を正しく読み取れるか
 * ・買う／中古／借りる／もらう の比較が①②と食い違わないか（回帰）
 * ・サンプルデータ（無料品）を「最安」として推奨していないか（厳守事項11）
 * ・おすすめが利用者の条件・時間・履歴で変わるか
 *
 * 実行：node AI収益化/lifechoice/tests/search-phase6.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseQuery, matchActivity, compareWays, rentalTotal, rentBreakEven, search, suggestActivities }
  from '../lib/integrated-search.js';
import { recommend, notificationCandidates } from '../lib/recommendation.js';
import { evaluateBuyCheck } from '../lib/buy-check.js';
import { SERVICES, getService } from '../lib/services.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const products = json('products.json');
const stores = json('stores.json');
const deals = json('deals.json');
const freeItems = json('free-items.json');
const activitySets = json('activity-sets.json');
const data = { products, stores, deals, freeItems, activitySets };

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
const close = b => console.log('  → ' + (fail > b ? (fail - b) + '件 失敗' : '全件OK') + '\n');

console.log('═══ Phase 6 テスト（統合検索・おすすめ）═══\n');

/* ═══ 1. 予算の読み取り ═══ */
let b = section('1. 文章から予算を読み取る');
[
  ['3万円くらいでキャンプを始めたい', 30000],
  ['3万でキャンプ', 30000],
  ['30000円でキャンプ', 30000],
  ['1.5万円で釣り', 15000],
  ['10万円のカメラ', 100000],
  ['5,000円で映画', 5000],
  ['予算50000 ゴルフ', 50000],
  ['ゴルフを始めたい', null],
  ['', null]
].forEach(([q, expected]) => check('「' + q + '」の予算', parseQuery(q).budget, expected));
check('空文字でも落ちない', parseQuery('').tokens.length, 0);
check('nullでも落ちない', parseQuery(null).budget, null);
close(b);

/* ═══ 2. 活動の照合 ═══ */
b = section('2. やりたいことを活動セットに結びつける');

// 20セットすべて、自分のキーワード全部で引けること
activitySets.forEach(set => {
  set.keywords.forEach(kw => {
    const m = matchActivity(kw, activitySets, products);
    truthy(set.id + ' は "' + kw + '" で引ける', m.products.length > 0);
  });
});
check('活動セットは20件', activitySets.length, 20);

// 具体的なキーワードが優先されること
check('「ソロキャンプ」はキャンプ', matchActivity('ソロキャンプに行きたい', activitySets, products).set.id, 'camping');
check('「スノーボード」はスキー', matchActivity('スノーボード', activitySets, products).set.id, 'ski');

// 活動に該当しなければ品目名で拾う
const direct = matchActivity('プロジェクターが欲しい', activitySets, products);
truthy('品目名でも拾える', direct.products.length > 0);

// 何にも当たらなければ候補を出す
const none = search('あいうえお', data);
falsy('無関係な入力は found=false', none.found);
truthy('候補を出す', none.suggestions.length > 0);
check('候補は実在の活動', none.suggestions.every(s => activitySets.some(a => a.id === s.id)), true);
close(b);

/* ═══ 3. ①買う前チェックとの整合（回帰）═══ */
b = section('3. レンタル計算が①買う前チェックと一致する');

products.filter(p => p.rentalPrice && p.newPrice).forEach(p => {
  [[1, 1], [3, 3], [8, 5], [24, 3]].forEach(([freq, years]) => {
    const uses = freq * years;
    const mine = rentalTotal(p, uses, years);
    const r = evaluateBuyCheck({ product: p, price: p.newPrice, freq, years, need: 1 });
    const theirs = r.options.find(o => o.kind === 'rent');
    if (!theirs) { pass++; return; }
    check(p.id + ' 年' + freq + '回×' + years + '年 のレンタル総額', mine, theirs.total);
  });
});
close(b);

/* ═══ 4. 手段の比較 ═══ */
b = section('4. 買う／中古／借りる／もらう の比較');

const camp = products.find(p => p.id === 'camping-set');
const ways = compareWays(camp, 3, 1, freeItems);
check('キャンプ一式の「買う」は新品価格', ways.find(w => w.kind === 'buy').cost, camp.newPrice);
check('キャンプ一式の「中古」は新品×中古率',
  ways.find(w => w.kind === 'used').cost, Math.round(camp.newPrice * camp.usedPriceRate));
check('キャンプ一式の「借りる」は回数×単価', ways.find(w => w.kind === 'rent').cost, camp.rentalPrice * 3);
truthy('安い順に並んでいる', ways.every((w, i) => i === 0 || ways[i - 1].cost <= w.cost));

// 損益分岐
products.filter(p => p.rentalPrice && p.newPrice).forEach(p => {
  const n = rentBreakEven(p, 1);
  truthy(p.id + ' の分岐点は0以上の整数', Number.isInteger(n) && n >= 0);
  if (n >= 1) {
    const target = p.usedPriceRate ? Math.round(p.newPrice * p.usedPriceRate) : p.newPrice;
    truthy(p.id + ' 分岐点ちょうどでは借りるほうが安い', rentalTotal(p, n, 1) <= target);
    truthy(p.id + ' 分岐点+1回では借りるほうが高い', rentalTotal(p, n + 1, 1) > target);
  }
});
check('レンタルが無い品目は分岐点なし', rentBreakEven(products.find(p => !p.rentalPrice) || { }, 1), null);
close(b);

/* ═══ 5. 厳守事項11：サンプルデータを推奨にしない ═══ */
b = section('5. サンプルの無料品を「最安」として推奨していない');

const babyResult = search('出産の準備', data);
truthy('出産の準備がヒットする', babyResult.found);
babyResult.rows.forEach(r => {
  falsy(r.product.name + ' の最安がサンプル由来ではない', r.best && r.best.isDemo);
  falsy(r.product.name + ' の比較表にサンプルが混ざっていない', r.ways.some(w => w.isDemo));
});
truthy('「もらえる可能性」は別枠で保持している', babyResult.freeChanceCount > 0);
truthy('プランの合計が0円になっていない', babyResult.plan.total > 0);
babyResult.plan.included.forEach(x =>
  falsy(x.product.name + ' はサンプルを使っていない', x.best.isDemo));

// 全活動を通して確認
activitySets.forEach(set => {
  const r = search(set.keywords[0], data);
  if (!r.found) { fail++; fails.push(set.id + ' が引けない'); return; }
  const bad = r.rows.filter(x => x.best && x.best.isDemo);
  if (bad.length) { fail++; fails.push(set.id + ' がサンプルを最安にしている: ' + bad.map(x => x.product.name).join(',')); }
  else pass++;
});
close(b);

/* ═══ 6. 合計と節約額の整合 ═══ */
b = section('6. 合計金額の計算が破綻していない');

activitySets.forEach(set => {
  const r = search(set.name, data);
  if (!r.found) return;
  truthy(set.id + '：節約額が負にならない', r.totalSaving >= 0);
  truthy(set.id + '：最安合計 ≦ 新品合計', r.bestAll <= r.buyAll);
  check(set.id + '：節約額 = 新品合計 − 最安合計', r.totalSaving, r.buyAll - r.bestAll);
  const planSum = r.plan.included.reduce((s, x) => s + x.best.cost, 0);
  check(set.id + '：プラン合計が明細と一致', r.plan.total, r.plan.feasible ? planSum : 0);
  if (r.budget !== null && r.plan.feasible) {
    truthy(set.id + '：プランが予算に収まっている', r.plan.total <= r.budget);
  }
});
close(b);

/* ═══ 7. 予算に足りない場合の扱い ═══ */
b = section('7. 予算が足りないときに任意の品目で埋めない');

const tight = search('3万円くらいでキャンプを始めたい', data);
check('予算を読み取っている', tight.budget, 30000);
falsy('必須が入らないので実行不可', tight.plan.feasible);
check('不足額を出している', tight.plan.shortage > 0, true);
check('任意の品目で予算を埋めていない', tight.plan.included.length, 0);
truthy('不足額 = 必須合計 − 予算', tight.plan.shortage === tight.plan.essentialTotal - tight.budget);

const rich = search('20万円でキャンプを始めたい', data);
truthy('予算が足りれば実行可能', rich.plan.feasible);
truthy('必須が全部入る', rich.plan.included.filter(x => x.essential).length === rich.rows.filter(x => x.essential).length);

const noBudget = search('キャンプを始めたい', data);
check('予算が無ければ null', noBudget.budget, null);
truthy('予算が無くてもプランは作る', noBudget.plan.feasible && noBudget.plan.included.length > 0);
close(b);

/* ═══ 8. 期間で答えが変わる ═══ */
b = section('8. 続ける期間を変えると答えが変わる');

check('キャンプは「全部そろえる」型', search('キャンプ', data).selection, 'all');
check('大掃除は「この中から選ぶ」型', search('大掃除', data).selection, 'any');
check('楽器は「この中から選ぶ」型', search('楽器', data).selection, 'any');
truthy('選ぶ型でもプランは作れる', search('大掃除', data).plan.feasible);

const y1 = search('DIYをしたい', data, { years: 1 });
const y5 = search('DIYをしたい', data, { years: 5 });
truthy('1年と5年で使用回数が違う', y1.uses !== y5.uses);
const changed = y1.rows.filter((r, i) => r.best.kind !== y5.rows[i].best.kind).length;
truthy('期間で最安の手段が変わる品目がある（' + changed + '件）', changed > 0);
close(b);

/* ═══ 9. 共通Recommendation Engine ═══ */
b = section('9. おすすめが条件・時間・履歴で変わる');

const P = { budget: 3000, transportation: 'walk', soloPreference: 5, conversationPreference: 5, reservationPreference: 4 };
const ctx = (over) => ({ pref: P, hasPref: true, nowHour: 13, history: [], data, ...over });

const unset = recommend({ ...ctx({ pref: {}, hasPref: false }) });
check('未設定なら設定が最上位', unset[0].serviceId, 'settings');
check('既定は3件', unset.length, 3);

const evening = recommend(ctx({ nowHour: 18 }));
const morning = recommend(ctx({ nowHour: 8 }));
check('夕方は「いまから何する？」が最上位', evening[0].serviceId, 'now-what');
truthy('朝と夕方で並びが変わる', evening[0].serviceId !== morning[0].serviceId);

const afterBuy = recommend(ctx({ history: [{ service: 'buy-check' }] }));
check('①の直後は②を勧める', afterBuy[0].serviceId, 'unnecessary-buy');

// 実データ由来の提案が、サンプル由来より上に来ること（厳守事項11）
const all = recommend(ctx({ nowHour: 18 }), 6);
const firstDemo = all.findIndex(r => r.isDemo);
const lastReal = all.map(r => r.isDemo).lastIndexOf(false);
truthy('サンプル由来の提案は実データより下', firstDemo === -1 || firstDemo > lastReal);
all.forEach(r => {
  truthy(r.serviceId + ' は実在の機能', r.serviceId === 'settings' || !!getService(r.serviceId));
  truthy(r.serviceId + ' に理由がある', r.reason && r.reason.length > 5);
  truthy(r.serviceId + ' に遷移先がある', !!r.href);
});

// 決定的であること（同じ入力なら同じ出力）
const a1 = recommend(ctx({ nowHour: 15 })), a2 = recommend(ctx({ nowHour: 15 }));
check('同じ入力なら同じ結果', JSON.stringify(a1), JSON.stringify(a2));

// 条件が理由に反映されること
contains('理由に利用者の予算が出る', evening.map(r => r.reason).join(''), '3,000');
close(b);

/* ═══ 10. 通知候補（Phase 9 の土台）═══ */
b = section('10. 通知候補');

const nc = notificationCandidates({ pref: P, nowHour: 18, data });
truthy('候補が出る', nc.length > 0);
truthy('スコア順', nc.every((c, i) => i === 0 || nc[i - 1].score >= c.score));
nc.forEach(c => {
  truthy('候補にURLがある', !!c.url);
  truthy('候補に期限がある', !!c.expiresAt);
  truthy('サンプル由来であることを保持している', typeof c.isDemo === 'boolean');
});
check('現状の候補はすべてサンプル由来（データがサンプルのため）', nc.every(c => c.isDemo), true);
[9, 15, 20, 23].forEach(h => {
  const list = notificationCandidates({ pref: P, nowHour: h, data }).filter(c => c.type === 'deal');
  truthy(h + '時：締切を過ぎた案件が混ざっていない',
    list.every(c => deals.find(d => d.id === c.context.dealId).deadlineHour > h));
  truthy(h + '時：4時間より先の案件は通知しない',
    list.every(c => deals.find(d => d.id === c.context.dealId).deadlineHour - h <= 4));
});
const cheap = notificationCandidates({ pref: { budget: 500 }, nowHour: 12, data }).filter(c => c.type === 'deal');
truthy('予算を超える案件は通知しない', cheap.every(c => {
  const d = deals.find(x => x.id === c.context.dealId);
  return d.salePrice <= 500;
}));
close(b);

/* ═══ 11. データの健全性 ═══ */
b = section('11. 活動セットのデータ');

const ids = new Set();
activitySets.forEach(s => {
  falsy('idが重複していない: ' + s.id, ids.has(s.id));
  ids.add(s.id);
  truthy(s.id + ' に名前がある', !!s.name);
  truthy(s.id + ' にキーワードがある', s.keywords.length > 0);
  truthy(s.id + ' に品目がある', s.items.length > 0);
  truthy(s.id + ' の使用回数が正', s.typicalUsesPerYear > 0);
  s.items.forEach(i => {
    truthy(s.id + ' の ' + i.productId + ' が実在する', products.some(p => p.id === i.productId));
    truthy(s.id + ' の優先度が正', i.priority >= 1);
    truthy(s.id + ' の essential が真偽値', typeof i.essential === 'boolean');
  });
  truthy(s.id + ' の selection が正しい値', s.selection === 'all' || s.selection === 'any');
  if (s.selection === 'all') {
    truthy(s.id + '（全部そろえる型）に必須の品目がある', s.items.some(i => i.essential));
  } else {
    // 大掃除・楽器・自転車は「この中から選ぶ」ので必須が無くて正しい
    falsy(s.id + '（選ぶ型）に必須の品目は無い', s.items.some(i => i.essential));
  }
});
// 全品目がどこかの活動に含まれるか
const covered = new Set(activitySets.flatMap(s => s.items.map(i => i.productId)));
check('全38品目が活動セットに収録されている', covered.size, products.length);
// キーワードの重複（照合が曖昧になる）
const kw = {};
activitySets.forEach(s => s.keywords.forEach(k => { (kw[k] = kw[k] || []).push(s.id); }));
check('キーワードが重複していない', Object.values(kw).filter(v => v.length > 1).length, 0);
close(b);

/* ═══ 12. ページの結線 ═══ */
b = section('12. ページの結線');

const searchPage = fs.readFileSync(path.join(ROOT, 'app', 'search.html'), 'utf8');
contains('検索ページが統合検索を使っている', searchPage, "from '../lib/integrated-search.js'");
contains('検索ページに条件バーがある', searchPage, 'PreferenceBar()');
contains('検索ページがサンプルの注意を出す', searchPage, '実在の出品ではありません');
contains('検索ページが期間を変えられる', searchPage, "name: 'years'");

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
contains('トップが検索ページへ送る', index, "app/search.html?q=");
contains('トップがRecommendation Engineを使う', index, 'recommend(');
notContains('「準備中」のalertが残っていない', index, 'Phase 6 で実装予定');
notContains('統合検索が準備中のままになっていない', index, '統合検索は準備中');

// import が全て解決するか
for (const rel of ['index.html', 'app/search.html']) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const dir = path.dirname(path.join(ROOT, rel));
  const re = /import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    const target = path.resolve(dir, m[2]);
    if (!fs.existsSync(target)) { fail++; fails.push(rel + ' → ' + m[2] + ' が無い'); continue; }
    const mod = await import('file://' + target.replace(/\\/g, '/'));
    m[1].split(',').map(x => x.trim()).filter(Boolean).forEach(n => {
      if (n in mod) pass++; else { fail++; fails.push(rel + ' が ' + m[2] + ' から未定義の ' + n + ' を import'); }
    });
  }
}
// データ取得口
const dp = fs.readFileSync(path.join(ROOT, 'lib', 'data-provider.js'), 'utf8');
contains('StaticDataProvider に活動セットの取得口がある', dp, 'getActivitySets');
truthy('activity-sets.json が存在する', fs.existsSync(path.join(ROOT, 'data', 'activity-sets.json')));
close(b);

console.log('═'.repeat(48));
console.log('  成功 ' + pass + ' / 失敗 ' + fail);
if (fails.length) {
  console.log('\n【失敗の詳細】');
  fails.slice(0, 30).forEach(f => console.log('  ✗ ' + f));
  if (fails.length > 30) console.log('  … ほか ' + (fails.length - 30) + '件');
  process.exit(1);
} else {
  console.log('  ✓ 統合検索とおすすめは正しく動作しています');
}
