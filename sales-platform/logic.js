'use strict';
/**
 * 営業ロジック（営業システムの 01/02/05 をサーバーへ移植）。
 *  - scoreFromText : 募集本文からの一次スコアリング（AIが見つけた案件の自動評価）
 *  - score         : 構造化入力のスコアリング
 *  - quote         : 見積もり（プラン＋オプション＋手数料＋利益率）
 *  - proposal      : 提案文生成（タイプ別テンプレ＋ポートフォリオ自動リンク）
 *  - STAGES        : パイプライン定義（着地確率つき）
 */

const PORTFOLIO_BASE = process.env.PORTFOLIO_BASE || 'https://do-yossy.github.io/portfolio/';
const DEMO = {
  LP: 'カフェLP.html', corp: '法律事務所コーポレートサイト.html', ec: 'ECサイト.html',
  system: '予約管理ツール.html', ai: 'AI添削ツール.html', line: 'LINE公式アカウント構築.html'
};
const demoUrl = type => PORTFOLIO_BASE + encodeURIComponent(DEMO[type] || DEMO.LP);

const STAGES = [
  { key: 'lead',    label: '候補',     prob: .10, who: 'AI 選定' },
  { key: 'applied', label: '応募',     prob: .25, who: '人 が送信' },
  { key: 'meeting', label: '打合せ',   prob: .50, who: 'AI チャット' },
  { key: 'build',   label: '着手',     prob: .90, who: 'AI 制作' },
  { key: 'qa',      label: 'チェック', prob: .95, who: '人 が確認' },
  { key: 'deliver', label: '納品',     prob: .99, who: '人 が送信' },
  { key: 'won',     label: '受注/完了', prob: 1,  who: '売上計上' }
];
const STAGE_KEYS = STAGES.map(s => s.key);
const stageProb = k => (STAGES.find(s => s.key === k) || {}).prob || 0;

// ── 手数料 ──
function mediaFee(amount, channel) {
  if (channel === 'lancers') return Math.round(amount * 0.165);
  if (channel === 'crowdworks' || channel === 'cw') {
    let f = Math.min(amount, 100000) * 0.20;
    if (amount > 100000) f += Math.min(amount - 100000, 100000) * 0.10;
    if (amount > 200000) f += (amount - 200000) * 0.05;
    return Math.round(f);
  }
  return 0; // cwtech / lp(self-media) / direct
}

// ── スコアリング（構造化） ──
function budgetPts(b) { return b >= 250000 ? 25 : b >= 120000 ? 18 : b >= 50000 ? 10 : 3; }
function score(input = {}) {
  const budget = +input.budget || 0;
  const hours = Math.max(+input.est_hours || 10, 1);
  const channel = input.channel || input.source || 'lancers';
  const map = {
    template: { direct: 20, partial: 12, new: 4 },
    spec: { clear: 20, partial: 10, vague: 2 },
    continuity: { high: 15, mid: 8, single: 3 },
    competition: { low: 10, mid: 5, high: 2 },
    deadline: { near: 10, mid: 6, far: 3 }
  };
  let total = budgetPts(budget)
    + (map.template[input.template_fit] ?? 12)
    + (map.spec[input.spec] ?? 10)
    + (map.continuity[input.continuity] ?? 8)
    + (map.competition[input.competition] ?? 5)
    + (map.deadline[input.deadline] ?? 6);
  const flags = input.flags || [];
  const penalties = { rev: 15, undef: 15, over: 15, short: 20 };
  let penalty = 0, reject = false;
  for (const f of flags) {
    if (f === 'lowprice' || f === 'risk') reject = true;
    else penalty += penalties[f] || 0;
  }
  total = Math.max(0, Math.min(100, total - penalty));
  const net = budget - mediaFee(budget, channel);
  const wage = net / hours;
  let priority, decision, apply;
  if (reject) { priority = '見送り'; apply = false; decision = '除外フラグ該当'; }
  else if (total >= 75) { priority = 'S'; apply = true; decision = '即応募'; }
  else if (total >= 55) { priority = 'A'; apply = true; decision = '応募（テンプレ流用前提）'; }
  else if (total >= 40) { priority = 'B'; apply = false; decision = '不足情報をヒアリング後に再判定'; }
  else { priority = '見送り'; apply = false; decision = 'スコア不足'; }
  if (apply && wage < 4000) decision += '／実効時給¥4,000未満:要スコープ調整';
  return {
    score: total, priority, apply,
    pred_win_rate: Math.max(5, Math.min(85, Math.round(total * 0.8))),
    eff_wage: Math.round(wage), net_fee: mediaFee(budget, channel), decision
  };
}

// ── 募集本文からの一次スコアリング（ヒューリスティック） ──
function detectBudget(text) {
  const man = text.match(/([0-9０-９]{1,4})\s*万/);
  if (man) return parseInt(man[1].replace(/[０-９]/g, d => '0123456789'['０１２３４５６７８９'.indexOf(d)])) * 10000;
  const yen = text.match(/([0-9,]{3,})\s*円/);
  if (yen) return parseInt(yen[1].replace(/,/g, ''));
  return 0;
}
function detectType(text) {
  const t = text;
  if (/AI|人工知能|ChatGPT|Claude|自動化ツール/i.test(t)) return 'ai';
  if (/LINE|ステップ配信|リッチメニュー/i.test(t)) return 'line';
  if (/ECサイト|ネットショップ|通販サイト|カート機能|決済/i.test(t)) return 'ec';
  if (/予約システム|予約管理|在庫管理|勤怠|管理システム|業務効率化|システム開発|ツール開発/i.test(t)) return 'system';
  if (/ランディングページ|LP制作|\bLP\b/i.test(t)) return 'LP';
  if (/コーポレート|会社\s*サイト|ホームページ|HP制作|採用サイト/i.test(t)) return 'corp';
  return 'LP';
}
function scoreFromText(text = '', extra = {}) {
  const t = String(text);
  const budget = +extra.budget || detectBudget(t) || 0;
  const type = extra.type || detectType(t);
  const channel = extra.source || extra.channel || 'lancers';
  const flags = [];
  if (/修正\s*無制限|無制限\s*修正|何度でも/.test(t)) flags.push('rev');
  if (budget > 0 && budget < 8000) flags.push('lowprice');
  if (/丸投げ|お任せ|仕様未定|要相談のみ/.test(t)) flags.push('undef');
  if (/(即日|今日中|24時間以内|大至急)/.test(t)) flags.push('short');
  const spec = /(参考|https?:\/\/|ページ数|機能|要件)/.test(t) ? (t.length > 200 ? 'clear' : 'partial') : 'vague';
  const template_fit = DEMO[type] ? 'partial' : 'new';
  const continuity = /(継続|長期|保守|運用|複数)/.test(t) ? 'high' : 'single';
  const competition = (() => { const m = t.match(/提案\s*([0-9]+)\s*件/); return m ? (+m[1] > 15 ? 'high' : +m[1] > 5 ? 'mid' : 'low') : 'mid'; })();
  const deadline = /(急ぎ|至急|今週|今月中)/.test(t) ? 'near' : 'mid';
  const est_hours = type === 'LP' ? 6 : type === 'corp' ? 24 : 40;
  const r = score({ budget, channel, template_fit, spec, continuity, competition, deadline, flags, est_hours });
  return { ...r, type, budget, est_hours, template_fit, spec, continuity, competition, deadline };
}

// ── 見積もり ──
const PLAN = { LP: 50000, corp: 120000, ec: 300000, system: 200000, ai: 500000, line: 50000 };
const OPT = { addpage: 15000, cms: 40000, reserve: 25000, seo: 15000, logo: 25000, server: 8000, writing: 8000, banner: 4000 };
function quote(input = {}) {
  const type = input.type || 'LP';
  let base = PLAN[type] || 50000;
  if (input.pages > 10 || input.cms) base = Math.max(base, PLAN.corp + (input.cms ? 0 : 0));
  let opt = (+input.addpages || 0) * OPT.addpage + (+input.writing_pages || 0) * OPT.writing + (+input.banners || 0) * OPT.banner;
  for (const k of (input.options || [])) opt += OPT[k] || 0;
  let subtotal = base + opt;
  const total = input.rush ? Math.round(subtotal * 1.2) : subtotal;
  const channel = input.channel || input.source || 'lancers';
  const fee = mediaFee(total, channel);
  const net = total - fee;
  const hours = Math.max(+input.est_hours || 10, 1);
  const cost = +input.cost || 0;
  return {
    base, options: opt, rush: input.rush ? total - subtotal : 0, total,
    fee, net, channel, eff_wage: Math.round(net / hours),
    profit_rate: Math.round(((net - cost) / total) * 100),
    maintenance_suggest: { LP: 10000, corp: 20000, ec: 20000, system: 20000, ai: 40000, line: 10000 }[type] || 10000
  };
}

// ── 提案文 ──
const TPL = {
  LP: (d) => `${d.title} を拝見しました。${d.industry || '御社'}向けのLP、ご提示の納期内で対応可能です。

▼実績（同系統のLP）
${d.demo}

▼ご提案
・${d.goal || '集客'}達成のため、ファーストビューで強みを訴求
・問い合わせ導線をスマホ最適化
・表示速度・SEOの基本対策

▼料金・納期：¥${(d.amount || 50000).toLocaleString()}（税別）／約1週間
▼強み：修正回数無制限・オンライン完結・24時間以内返信

まず参考サイトをご共有頂ければ、構成案をお出しします。よろしくお願いいたします。`,
  corp: (d) => `${d.title} を拝見しました。信頼感が成果に直結する${d.industry || '御社'}のサイト、得意領域です。

▼実績（コーポレート/士業サイト）
${d.demo}

▼ご提案
・会社概要・実績・問い合わせの3導線を明確化
・スマホ最適化＋表示速度対策でSEOの土台を確保

▼料金・納期：¥${(d.amount || 120000).toLocaleString()}（税別）／約2週間　※追加ページ¥15,000〜
▼強み：修正無制限・オンライン完結・24h返信

ページ構成のたたき台をすぐお出しできます。よろしくお願いいたします。`,
  system: (d) => `${d.title} を拝見しました。${d.industry || '御社'}向けの業務システム、実装経験があります。

▼実績
${d.demo}

▼ご提案
・核となる機能を優先実装、段階リリースで先行納品
・CSV出力など運用負荷を下げる自動化

▼料金・納期：¥${(d.amount || 200000).toLocaleString()}（税別）／要件確定後に確定見積もり
▼強み：修正無制限・保守プラン（¥10,000〜/月）で納品後も安心

要件の優先順位だけ伺えれば、MoSCoWで整理してお見積もりします。`,
  ai: (d) => `${d.title} を拝見しました。Claude API等を用いた自動化ツール、開発可能です。

▼実績（AI文章添削ツール／AI面接ツール）
${d.demo}

▼ご提案
・スコアリング＋改善提案の自動生成
・既存業務フローへの組み込み、PoC→本実装の2段階

▼料金・納期：¥${(d.amount || 500000).toLocaleString()}（税別）／要相談
▼強み：修正無制限・運用設計まで伴走

実現したい出力イメージを1例頂ければ、精度の見立てをお返しします。`
};
TPL.ec = TPL.system; TPL.line = TPL.LP;
function proposal(deal = {}) {
  const type = deal.type || 'LP';
  const d = { ...deal, demo: deal.link || demoUrl(type) };
  return (TPL[type] || TPL.LP)(d);
}

module.exports = { STAGES, STAGE_KEYS, stageProb, mediaFee, score, scoreFromText, quote, proposal, demoUrl, PLAN, OPT };
