/**
 * LIFE CHOICE ── ① 買う前チェックの判定
 *
 * 既存 demo/買う前チェック.html の計算式をそのまま純関数化したもの。
 * UIから完全に分離してあるので、テストで結果を固定できる。
 *
 *   実質購入負担 = 新品価格 − 想定売却価格
 *   実質中古負担 = 中古価格 − 想定売却価格（中古で買った物は売値がさらに落ちる）
 *   レンタル総額 = レンタル単価 × 使用回数（月額課金の品目は借りる月数で計算）
 *   1回あたり負担 = 総コスト ÷ 使用回数
 *
 * @file lib/buy-check.js
 */

/**
 * @typedef {Object} BuyCheckInput
 * @property {import('../types/models.js').Product} product
 * @property {number} price      新品価格（ユーザー入力。未入力なら product.newPrice）
 * @property {number} freq       年間使用回数
 * @property {number} years      使用年数
 * @property {0|1|2} need        0=なんとなく欲しい 1=あると便利 2=今すぐ必要
 *
 * @typedef {Object} BuyCheckOption
 * @property {'buy'|'used'|'rent'} kind
 * @property {string} label
 * @property {number} total      支払額
 * @property {number} net        実質負担（売却分を引いた額）
 * @property {number} perUse     1回あたり負担
 *
 * @typedef {Object} BuyCheckResult
 * @property {'buy'|'used'|'rent'|'stop'} verdict
 * @property {string} verdictLabel
 * @property {string} verdictReason
 * @property {number} uses            通算使用回数
 * @property {number} saveAmount      節約できる額
 * @property {string} saveCaption
 * @property {BuyCheckOption[]} options   net昇順
 * @property {string[]} reasons          判定根拠
 */

const KIND_LABEL = { buy: '新品を買う', used: '中古を買う', rent: 'レンタルする', stop: '今は見送る' };

/**
 * @param {BuyCheckInput} input
 * @returns {BuyCheckResult}
 */
export function evaluateBuyCheck(input) {
  const { product: p, freq, years, need } = input;
  const price = input.price || p.newPrice || 0;
  const uses = freq * years;

  const usedPrice = price * (p.usedPriceRate || 0);
  const resale = price * (p.estimatedResaleRate || 0);           // 新品を売るとき
  const usedResale = price * (p.usedEstimatedResaleRate || 0);   // 中古で買った物を売るとき

  // 月額課金の品目は「使用回数」ではなく「借りている月数」で決まる
  const rentTotal = p.rentalUnit === '回'
    ? p.rentalPrice * uses
    : p.rentalPrice * Math.min(years * 12, Math.ceil(uses / 2));

  const options = [
    { kind: 'buy',  label: KIND_LABEL.buy,  total: price,     net: price - resale },
    { kind: 'used', label: KIND_LABEL.used, total: usedPrice, net: usedPrice - usedResale },
    { kind: 'rent', label: KIND_LABEL.rent, total: rentTotal, net: rentTotal }
  ].map(o => ({ ...o, perUse: uses > 0 ? o.net / uses : o.net }))
   .sort((a, b) => a.net - b.net);

  const best = options[0];
  const worst = options[options.length - 1];

  // 「なんとなく欲しい」かつ通算3回以下なら見送りを推奨
  const isStop = need === 0 && uses <= 3;
  const verdict = isStop ? 'stop' : best.kind;

  return {
    verdict,
    verdictLabel: KIND_LABEL[verdict],
    verdictReason: isStop
      ? `年${freq}回 × ${years}年 ＝ 通算${uses}回。必要になってからで間に合います`
      : `通算${uses}回使う前提だと、これが最も安く済みます`,
    uses,
    saveAmount: isStop ? price : (worst.net - best.net),
    saveCaption: isStop ? '買わなければ使わずに済む金額' : '最も高い選択肢との差額',
    options,
    reasons: buildReasons(p, freq, years, uses, need)
  };
}

function buildReasons(p, freq, years, uses, need) {
  const r = [];
  r.push(`通算の使用回数は<b>${uses}回</b>（年${freq}回 × ${years}年）`);
  if (freq <= 3) r.push('年' + freq + '回は<b>使用頻度が低い</b>部類。所有すると保管場所のコストもかかります');
  if (freq >= 24) r.push('使用頻度が高いので、<b>所有したほうが1回あたりの負担が下がります</b>');
  if (p.usedPriceRate) {
    r.push(`この品目の中古相場は新品の<b>約${Math.round(p.usedPriceRate * 100)}%</b>。` +
           `売却時は購入額の約${Math.round((p.estimatedResaleRate || 0) * 100)}%が戻る想定`);
  }
  if (p.source === '実測' && p.sourceNote) {
    r.push(`レンタル料の根拠：<b>${p.sourceNote}</b>（実勢価格を確認済み）`);
  } else {
    r.push('レンタル料は同カテゴリの水準からの<b>推定値</b>です。実際の見積もりで確認してください');
  }
  if (p.lifespanYears && years > p.lifespanYears) {
    r.push(`想定使用年数が一般的な寿命（約${p.lifespanYears}年）を超えています。<b>買い替えが発生する前提</b>で考えてください`);
  }
  if (need === 0) r.push('「なんとなく欲しい」段階です。<b>1週間置いてまだ欲しければ</b>買う、で間に合います');
  if (need === 2) r.push('今すぐ必要とのことなので、<b>入手までの時間</b>も考慮してください（レンタルは配送に数日かかります）');
  return r;
}

/** シェア用の1行テキスト */
export function buildShareText(product, result, freq, years, formatYen) {
  return `${product.name}を買おうか迷ったので調べたら、年${freq}回×${years}年なら` +
         `「${result.verdictLabel}」が${formatYen(result.saveAmount)}お得という判定でした。#買う前チェック`;
}
