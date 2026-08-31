/**
 * LIFE CHOICE ── 検索流入用ページの生成
 *
 * data/ から静的HTMLを生成する。JSでの描画に頼らず内容をHTMLに焼き込むのは、
 * 検索エンジンにJS実行なしで読ませるため（アプリ側の app/*.html とは方針が違う）。
 *
 *   guide/index.html        ハブ
 *   guide/item-{id}.html    品目ページ 38件「買う・中古・借りるどれが安いか」
 *   guide/start-{id}.html   活動ページ 20件「始めるのにいくらかかるか」
 *
 * 中身は全て data/ の実データと lib/ の計算結果。文章は組み立てるが数値は作らない。
 * 実行：node AI収益化/lifechoice/tools/build-guide.mjs
 *
 * @file tools/build-guide.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareWays, rentBreakEven, rentalTotal, search } from '../lib/integrated-search.js';
import { newPriceSource } from '../utils/format.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'guide');
const json = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const products = json('products.json');
const activitySets = json('activity-sets.json');
const freeItems = json('free-items.json');
const data = { products, activitySets, freeItems };

/** 収益力の高い分野。ハブページで先に出す */
const PRIORITY = ['photography', 'ceremony', 'cycling', 'video', 'beauty', 'travel'];

const yen = n => (n === null || n === undefined) ? '—' : Math.round(n).toLocaleString('ja-JP') + '円';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ═══════════════════════════════════════════
 * 共通の外枠
 * ═══════════════════════════════════════════ */
function layout({ title, description, h1, lead, body, breadcrumb }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="theme-color" content="#2563eb">
<link rel="stylesheet" href="../styles/tokens.css">
<link rel="stylesheet" href="../styles/base.css">
<link rel="stylesheet" href="../styles/components.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🧭%3C/text%3E%3C/svg%3E">
<style>
  .g-lead { font-size: var(--fs-md); color: var(--sub); margin-bottom: var(--sp-5); }
  .g-verdict { font-size: clamp(19px,4.4vw,24px); font-weight: 800; line-height: var(--lh-tight); }
  .g-crumb { font-size: var(--fs-sm); color: var(--sub); margin-bottom: var(--sp-3); }
  .g-crumb a { color: var(--sub); }
  .g-h1 { font-size: clamp(21px,5vw,28px); font-weight: 800; line-height: var(--lh-tight); margin-bottom: var(--sp-3); }
  .g-h2 { font-size: var(--fs-lg); font-weight: 800; margin: var(--sp-6) 0 var(--sp-3); }
  .g-win { background: var(--ok-bg); font-weight: 700; }
  .g-grid { display: grid; gap: var(--sp-3); }
  @media (min-width:600px){ .g-grid--2 { grid-template-columns: 1fr 1fr; } }
  .g-card-link { display:block; text-decoration:none; color:inherit; }
</style>
</head>
<body data-service="buy-check">

<header class="lc-header">
  <div class="lc-header__inner">
    <a class="lc-header__back" href="../index.html" aria-label="ホームへ">‹</a>
    <span class="lc-header__brand">LIFE CHOICE</span>
  </div>
</header>

<main class="lc-wrap lc-main">
  <p class="g-crumb">${breadcrumb}</p>
  <h1 class="g-h1">${h1}</h1>
  ${lead ? `<p class="g-lead">${lead}</p>` : ''}
  ${body}

  <div class="lc-card" style="margin-top:var(--sp-6)">
    <h2 class="g-h2" style="margin-top:0">自分の条件で計算する</h2>
    <p style="margin-bottom:var(--sp-3)">このページの数字は代表的な使い方を前提にした目安です。
    使う回数や年数を入れると、あなたの条件で計算し直せます。</p>
    <a class="lc-btn" href="../app/buy-check.html">買う前チェックで計算する</a>
    <a class="lc-btn lc-btn--ghost" href="../app/search.html" style="margin-top:var(--sp-3)">やりたいことから探す</a>
  </div>
</main>

<footer class="lc-wrap" style="padding-bottom:var(--sp-8)">
  <p class="lc-sub" style="font-size:var(--fs-xs);border-top:1px solid var(--line);padding-top:var(--sp-4)">
    価格は調査時点の目安です。最新の価格は各販売店・レンタル事業者のページでご確認ください。<br>
    中古価格は相場からの推定で、実際の出品価格ではありません。<br>
    <a href="../index.html">LIFE CHOICE</a>
  </p>
</footer>
</body>
</html>
`;
}

/* ═══════════════════════════════════════════
 * 品目ページ
 * ═══════════════════════════════════════════ */
const USE_STEPS = [1, 3, 5, 10, 20, 50];

function itemPage(p) {
  const src = newPriceSource(p);
  const srcLabel = src === '実測' ? '実勢価格を確認済み' : '市場の中位帯からの推定';
  const be = rentBreakEven(p, 1);

  // 使用回数ごとの比較表。1年で使い切る前提で計算する
  const rows = USE_STEPS.map(n => {
    const ws = compareWays(p, n, 1, []);
    const best = ws[0];
    const get = k => { const w = ws.find(x => x.kind === k); return w ? w.cost : null; };
    return { n, buy: get('buy'), used: get('used'), rent: get('rent'), best: best ? best.kind : null };
  });

  const cell = (v, kind, row) =>
    `<td class="num${row.best === kind ? ' g-win' : ''}">${yen(v)}</td>`;

  // 結論の文章。分岐点の有無で言い方を変える
  let verdict;
  if (!p.rentalPrice) {
    verdict = `${esc(p.name)}にレンタルの選択肢は見つかっていません。中古で買うのがいちばん安く済みます。`;
  } else if (be === Infinity) {
    verdict = `${esc(p.name)}は、<b>何回使っても借りるほうが安く</b>済みます。買う必要はありません。`;
  } else if (be === 0) {
    verdict = `${esc(p.name)}は、<b>1回だけの使用でも中古で買うほうが安く</b>済みます。`;
  } else {
    verdict = `${esc(p.name)}は、<b>${be}回までなら借りるほうが安く</b>、それ以上使うなら買ったほうが安くなります。`;
  }

  const relatedSets = activitySets.filter(s => s.items.some(i => i.productId === p.id));

  const body = `
<div class="lc-card" style="background:var(--accent-bg);border-color:var(--accent)">
  <p class="g-verdict">${verdict}</p>
</div>

<h2 class="g-h2">価格</h2>
<div class="lc-card lc-scroll-x">
  <table class="lc-table">
    <tr><th>手段</th><th style="text-align:right">金額</th><th>備考</th></tr>
    <tr><td>新品で買う</td><td class="num">${yen(p.newPrice)}</td><td>${esc(srcLabel)}</td></tr>
    ${p.usedPrice ? `<tr><td>中古で買う</td><td class="num">${yen(p.usedPrice)}</td>
      <td>新品の${Math.round(p.usedPriceRate * 100)}%（相場からの推定）</td></tr>` : ''}
    ${p.rentalPrice ? `<tr><td>借りる</td><td class="num">${yen(p.rentalPrice)}</td>
      <td>1${esc(p.rentalUnit)}あたり${p.source === '実測' && p.sourceNote ? '／' + esc(p.sourceNote) : ''}</td></tr>` : ''}
  </table>
</div>

<h2 class="g-h2">使う回数で答えが変わる</h2>
<p style="margin-bottom:var(--sp-3)">1年のうちに使う回数ごとの総額です。緑が最も安い選択肢。</p>
<div class="lc-card lc-scroll-x">
  <table class="lc-table">
    <tr><th>使う回数</th><th style="text-align:right">新品</th>
        <th style="text-align:right">中古</th><th style="text-align:right">借りる</th></tr>
    ${rows.map(r => `<tr>
      <td>${r.n}回</td>${cell(r.buy, 'buy', r)}${cell(r.used, 'used', r)}${cell(r.rent, 'rent', r)}
    </tr>`).join('')}
  </table>
</div>

${p.estimatedResaleRate ? `
<h2 class="g-h2">売る前提なら実質負担はもっと下がる</h2>
<div class="lc-card">
  <p>買った物は使い終わったあとに売れます。売却額を引いた実質の負担はこちらです。</p>
  <table class="lc-table" style="margin-top:var(--sp-3)">
    <tr><td>新品で買って売る</td><td class="num">${yen(p.newPrice - Math.round(p.newPrice * p.estimatedResaleRate))}</td></tr>
    ${p.usedPrice ? `<tr><td>中古で買って売る</td>
      <td class="num">${yen(p.usedPrice - Math.round(p.newPrice * (p.usedEstimatedResaleRate || 0)))}</td></tr>` : ''}
    ${p.rentalPrice ? `<tr><td>借りる（手元に残らない）</td><td class="num">${yen(rentalTotal(p, 1, 1))}〜</td></tr>` : ''}
  </table>
  <p class="lc-sub" style="margin-top:var(--sp-3)">売却額は相場からの推定です。実際に売る手間はかかります。</p>
</div>` : ''}

${relatedSets.length ? `
<h2 class="g-h2">${esc(p.name)}が必要になる場面</h2>
<div class="g-grid g-grid--2">
  ${relatedSets.map(s => `
    <a class="lc-card lc-card--tap g-card-link" href="start-${esc(s.id)}.html" style="margin-top:0">
      <div style="font-weight:700">${esc(s.shortName || s.name)}</div>
      <div class="lc-sub">必要なもの${s.items.length}点の費用を見る</div>
    </a>`).join('')}
</div>` : ''}`;

  return layout({
    title: `${p.name}は買う・中古・借りるどれが安い？損益分岐点｜LIFE CHOICE`,
    description: `${p.name}を買う場合${yen(p.newPrice)}、中古なら${yen(p.usedPrice)}` +
      (p.rentalPrice ? `、借りると1${p.rentalUnit}${yen(p.rentalPrice)}。` : '。') +
      `何回使えば買ったほうが得かを実際の価格から計算しました。`,
    breadcrumb: `<a href="../index.html">LIFE CHOICE</a> ＞ <a href="index.html">買う前に比べる</a> ＞ ${esc(p.name)}`,
    h1: `${esc(p.name)}は買う・中古・借りるのどれが安い？`,
    lead: `${esc(p.category)}／${esc(srcLabel)}。使う回数ごとに総額を比べました。`,
    body
  });
}

/* ═══════════════════════════════════════════
 * 活動ページ
 * ═══════════════════════════════════════════ */
const BUDGETS = [10000, 30000, 50000, 100000];

function activityPage(set) {
  const r = search(set.name, data, { years: 1 });
  // 「キャンプを始めたいに必要な2点」のような不自然な連結を避けるため、
  // 文中では shortName（「キャンプ」）を使う
  const short = set.shortName || set.name;
  if (!r.found) return null;

  const budgetRows = BUDGETS.map(b => {
    const s = search(set.name, data, { years: 1, budget: b });
    return { budget: b, plan: s.plan };
  });

  const body = `
<div class="lc-card" style="background:var(--accent-bg);border-color:var(--accent)">
  <p class="g-verdict">全部新品でそろえると ${yen(r.buyAll)}。<br>
  買う・中古・借りるを使い分ければ <span style="color:var(--ok)">${yen(r.bestAll)}</span> で始められます。</p>
  <p class="lc-sub" style="margin-top:var(--sp-2)">差額 ${yen(r.totalSaving)}／1年で通算${r.uses}回使う前提</p>
</div>

<h2 class="g-h2">必要なものと、いちばん安い買い方</h2>
<div class="lc-card lc-scroll-x">
  <table class="lc-table">
    <tr><th>品目</th><th>安い手段</th><th style="text-align:right">金額</th><th style="text-align:right">新品なら</th></tr>
    ${r.rows.map(x => `<tr>
      <td>${x.essential ? '<span class="lc-tag lc-tag--accent">必須</span> ' : ''}<a href="item-${esc(x.product.id)}.html">${esc(x.product.name)}</a></td>
      <td><b>${esc(x.best.label)}</b></td>
      <td class="num g-win">${yen(x.best.cost)}</td>
      <td class="num">${yen(x.buyCost)}</td>
    </tr>`).join('')}
  </table>
</div>
${r.selection === 'any' ? '<p class="lc-sub">この分野は必要なものだけ選べます。合計は全部そろえた場合です。</p>' : ''}

<h2 class="g-h2">予算別にどこまでそろうか</h2>
<div class="lc-card lc-scroll-x">
  <table class="lc-table">
    <tr><th>予算</th><th>始められるか</th><th>内容</th></tr>
    ${budgetRows.map(({ budget, plan }) => `<tr>
      <td>${yen(budget)}</td>
      <td>${plan.feasible
        ? '<span class="lc-tag lc-tag--ok">始められる</span>'
        : `<span class="lc-tag lc-tag--bad">あと${yen(plan.shortage)}</span>`}</td>
      <td>${plan.feasible
        ? esc(plan.included.map(x => x.product.name + '（' + x.best.label + '）').join('、'))
        : '必須の品目だけで' + yen(plan.essentialTotal) + 'かかります'}</td>
    </tr>`).join('')}
  </table>
</div>

<h2 class="g-h2">品目ごとに詳しく</h2>
<div class="g-grid g-grid--2">
  ${r.rows.map(x => `
    <a class="lc-card lc-card--tap g-card-link" href="item-${esc(x.product.id)}.html" style="margin-top:0">
      <div style="font-weight:700">${esc(x.product.name)}</div>
      <div class="lc-sub">${x.rentBreakEvenUses === Infinity ? '何回使っても借りるほうが安い'
        : x.rentBreakEvenUses >= 1 ? x.rentBreakEvenUses + '回までなら借りるほうが安い'
        : '1回でも中古のほうが安い'}</div>
    </a>`).join('')}
</div>`;

  return layout({
    title: `${short}に必要なものと費用｜全部そろえるといくら？｜LIFE CHOICE`,
    description: `${short}に必要な${r.rows.length}点を全部新品でそろえると${yen(r.buyAll)}。` +
      `中古やレンタルを使い分ければ${yen(r.bestAll)}で始められます。予算別の内訳も掲載。`,
    breadcrumb: `<a href="../index.html">LIFE CHOICE</a> ＞ <a href="index.html">買う前に比べる</a> ＞ ${esc(short)}`,
    h1: `${esc(short)}に必要なものと費用`,
    lead: `${esc(short)}に必要な${r.rows.length}点それぞれについて、買う・中古・借りるを比べました。`,
    body
  });
}

/* ═══════════════════════════════════════════
 * ハブページ
 * ═══════════════════════════════════════════ */
function hubPage() {
  const ordered = [
    ...PRIORITY.map(id => activitySets.find(s => s.id === id)).filter(Boolean),
    ...activitySets.filter(s => !PRIORITY.includes(s.id))
  ];
  const withCost = ordered.map(s => {
    const r = search(s.name, data, { years: 1 });
    return { set: s, r };
  }).filter(x => x.r.found);

  const body = `
<h2 class="g-h2" style="margin-top:0">やりたいことから調べる</h2>
<div class="g-grid g-grid--2">
  ${withCost.map(({ set, r }) => `
    <a class="lc-card lc-card--tap g-card-link" href="start-${esc(set.id)}.html" style="margin-top:0">
      <div style="font-weight:700">${esc(set.shortName || set.name)}</div>
      <div class="lc-sub">新品なら${yen(r.buyAll)} → 最安${yen(r.bestAll)}</div>
    </a>`).join('')}
</div>

<h2 class="g-h2">品目から調べる</h2>
<div class="lc-card lc-scroll-x">
  <table class="lc-table">
    <tr><th>品目</th><th style="text-align:right">新品</th><th style="text-align:right">中古</th><th>結論</th></tr>
    ${[...products].sort((a, b) => (b.newPrice || 0) - (a.newPrice || 0)).map(p => {
      const be = rentBreakEven(p, 1);
      return `<tr>
        <td><a href="item-${esc(p.id)}.html">${esc(p.name)}</a></td>
        <td class="num">${yen(p.newPrice)}</td>
        <td class="num">${yen(p.usedPrice)}</td>
        <td class="lc-sub">${be === null ? 'レンタルなし'
          : be === Infinity ? '借りるほうが安い'
          : be === 0 ? '中古のほうが安い' : be + '回で逆転'}</td>
      </tr>`;
    }).join('')}
  </table>
</div>`;

  return layout({
    title: `買う・中古・借りるを比べる｜${products.length}品目の損益分岐点｜LIFE CHOICE`,
    description: `${products.length}品目について、買う・中古・借りるのどれが安いかを実際の価格から計算。` +
      `${activitySets.length}の分野別に、始めるのに必要な費用もまとめています。`,
    breadcrumb: `<a href="../index.html">LIFE CHOICE</a> ＞ 買う前に比べる`,
    h1: '買う・中古・借りる、どれが安い？',
    lead: `${products.length}品目・${activitySets.length}分野について、実際の価格から損益分岐点を計算しました。`,
    body
  });
}

/* ═══════════════════════════════════════════
 * 生成
 * ═══════════════════════════════════════════ */
fs.mkdirSync(OUT, { recursive: true });

const written = [];
const write = (name, html) => { fs.writeFileSync(path.join(OUT, name), html); written.push(name); };

write('index.html', hubPage());
products.forEach(p => write(`item-${p.id}.html`, itemPage(p)));
activitySets.forEach(s => { const h = activityPage(s); if (h) write(`start-${s.id}.html`, h); });

// sitemap に貼るための断片。公開先が決まってから index に取り込む
const BASE = 'https://www.social-quality.com/lifechoice/guide/';
fs.writeFileSync(path.join(OUT, 'sitemap-fragment.xml'),
  written.map(f => `  <url>\n    <loc>${BASE}${f}</loc>\n    <changefreq>monthly</changefreq>\n  </url>`).join('\n') + '\n');

const bytes = written.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(written.length + 'ページを生成しました（' + Math.round(bytes / 1024) + 'KB）');
console.log('  ハブ 1／品目 ' + products.length + '／分野 ' + (written.length - 1 - products.length));
console.log('  出力先 guide/');
console.log('  sitemap-fragment.xml も出力（公開先が決まってから sitemap.xml に取り込む）');
