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
const LANCERS_PROFILE = process.env.LANCERS_PROFILE || 'https://www.lancers.jp/profile/anchan1111';
const jisseki = type => `・最も近い実績デモ：${demoUrl(type)}\n・制作一覧（ポートフォリオ）：${PORTFOLIO_BASE}\n・ランサーズ実績：${LANCERS_PROFILE}`;

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
  // 文字単価 × 文字数（ライティングの記事単価）
  const rate = text.match(/文字単価\s*([0-9.]+)\s*円?/);
  const chars = text.match(/([0-9,]{3,6})\s*文字/);
  if (rate && chars) return Math.round(parseFloat(rate[1]) * parseInt(chars[1].replace(/,/g, '')));
  return 0;
}
function detectType(text) {
  const t = text;
  if (/(脚本|シナリオ|台本|プロット|原作制作|ドラマ脚本|小説|物語の制作)/i.test(t) && !/(ツール|システム|アプリ)/i.test(t)) return 'script';
  if (/(ライティング|記事(の)?(作成|執筆|制作)|SEO記事|ブログ記事|コラム執筆|webライ|文字単価|[0-9０-９]{3,}\s*文字)/i.test(t) && !/(ツール|システム|アプリ)/i.test(t)) return 'writing';
  if (/(ロゴ|バナー|チラシ|フライヤー|サムネ|サムネイル|アイキャッチ|イラスト|似顔絵|名刺|ポスター|画像(加工|編集|作成|制作)|Instagram|インスタ|SNS(運用|投稿|画像))/i.test(t) && !/(ツール|システム|アプリ|開発|プログラム)/i.test(t)) return 'design';
  if (/(動画(編集|制作)|YouTube|ショート動画|リール|TikTok|テロップ|字幕|ムービー)/i.test(t) && !/(ツール|システム|アプリ開発)/i.test(t)) return 'video';
  if (/AI|人工知能|ChatGPT|Claude|自動化ツール|機械学習|LLM/i.test(t.replace(/生成AIの?使用(可否|がOK|可)?/g, ''))) return 'ai';
  if (/LINE|ステップ配信|リッチメニュー/i.test(t)) return 'line';
  if (/ECサイト|ネットショップ|通販サイト|カート機能|決済/i.test(t)) return 'ec';
  if (/予約システム|予約管理|在庫管理|勤怠|管理システム|業務効率化|システム開発|ツール開発/i.test(t)) return 'system';
  if (/ランディングページ|LP制作|\bLP\b/i.test(t)) return 'LP';
  if (/コーポレート|会社\s*サイト|ホームページ|HP制作|採用サイト/i.test(t)) return 'corp';
  if (/(翻訳|ローカライズ|データ入力|データ収集|リサーチ|文字起こし|テープ起こし|ナレーション|音声|アンケート|モニター)/i.test(t)) return 'other';
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
  const est_hours = { LP: 6, corp: 24, writing: 3, script: 10, design: 5, video: 5, other: 6 }[type] || 40;
  const r = score({ budget, channel, template_fit, spec, continuity, competition, deadline, flags, est_hours });
  return { ...r, type, budget, est_hours, template_fit, spec, continuity, competition, deadline };
}

// ── 見積もり ──
const PLAN = { LP: 50000, corp: 120000, ec: 300000, system: 200000, ai: 500000, line: 50000, design: 10000, video: 15000, writing: 8000, script: 50000, other: 30000 };
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
TPL.writing = (d) => `${d.title} を拝見しました。${d.industry || '御社'}のテーマで、SEOを意識した読みやすい記事を執筆できます。

▼実績・スタイル
・ランサーズ実績：${LANCERS_PROFILE}
・ポートフォリオ：${PORTFOLIO_BASE}

▼ご提案
・検索意図に沿った見出し構成（PREP法）で離脱を防止
・指定キーワードを自然に配置し、SEOの土台を確保
・コピペチェック・推敲込みで納品

▼料金・納期：文字単価¥1.5〜／1記事あたり約2〜3日（文字数により調整）
▼強み：修正無制限・オンライン完結・24時間以内返信

ご希望の文字数・キーワード・構成をいただければ、即着手します。よろしくお願いいたします。`;
TPL.design = (d) => `${d.title} を拝見しました。${d.industry || '御社'}のデザイン、ご提示の条件で対応可能です。

▼実績・スタイル
・ポートフォリオ：${PORTFOLIO_BASE}
・ランサーズ実績：${LANCERS_PROFILE}

▼ご提案
・目的とターゲットに合わせたトーン&マナーで作成
・初稿2案 → フィードバック反映で仕上げ
・データ納品（AI/PSD/PNG/JPG など希望形式に対応）

▼料金・納期：¥${(d.amount || 10000).toLocaleString()}（税別）／約3〜5日
▼強み：修正回数無制限・オンライン完結・24時間以内返信

参考イメージや配色のご希望があれば、すぐラフをお出しします。よろしくお願いいたします。`;
TPL.video = (d) => `${d.title} を拝見しました。${d.industry || '御社'}の動画編集、対応可能です。

▼実績・スタイル
・ポートフォリオ：${PORTFOLIO_BASE}
・ランサーズ実績：${LANCERS_PROFILE}

▼ご提案
・テンポ重視のカット＋読みやすいテロップで離脱を防止
・BGM/SE選定、サムネイルもセットで対応可
・指定の尺・テイストに合わせて編集

▼料金・納期：¥${(d.amount || 10000).toLocaleString()}（税別）／約3〜5日
▼強み：修正回数無制限・オンライン完結・24時間以内返信

サンプル尺やテイストのご希望をいただければ、冒頭30秒のテスト編集をお出しします。`;
TPL.other = (d) => `${d.title} を拝見しました。ご提示の内容で対応可能です。

▼実績
・ポートフォリオ：${PORTFOLIO_BASE}
・ランサーズ実績：${LANCERS_PROFILE}

▼ご提案
・要件を整理し、品質基準を明確にして進行
・中間共有を入れて認識ズレを防止
・短納期・修正対応で安心して進められます

▼料金・納期：ご提示条件に合わせて対応（要相談）
▼強み：修正回数無制限・オンライン完結・24時間以内返信

具体的な分量・締切をいただければ、すぐ着手します。よろしくお願いいたします。`;
TPL.script = (d) => `${d.title} を拝見しました。大人向けの人間ドラマ・恋愛など、感情と人間関係をリアルに描くシナリオを得意としています。

▼作風・実績
・ポートフォリオ：${PORTFOLIO_BASE}
・ランサーズ実績：${LANCERS_PROFILE}

▼ご提案
・プロット／箱書きで構成を固めてから執筆し、リライトにも柔軟に対応
・過度な露出に頼らず、心理描写と緊張感で“刺激”と没入感を表現
・オンラインMTで方向性をすり合わせ、トライアルから着実に進めます

▼条件：トライアル対応可／本採用後は話数・尺に合わせて執筆
▼強み：修正対応・オンライン完結・24時間以内返信

トライアルのテーマや主人公像をいただければ、すぐにプロット案をお出しします。よろしくお願いいたします。`;

const DELIVERABLE = {
  web: (d) => `📎 添付する成果物（実績デモ）
下記をそのまま提示してください。
${jisseki(d.type)}
※「ご依頼後、まず構成案（ワイヤー）をお出しします」と添えると親切です。`,
  writing: (d) => `📎 添付する成果物（サンプル記事の構成案）
タイトル案：${String(d.title || 'テーマ').slice(0, 40)} を分かりやすく解説
リード（です・ます調・約150字）：読者の悩み → この記事で分かること → 結論の予告 の順で導入。

■見出し構成（H2/H3）
H2 基礎：そもそも何か／背景
H2 選び方・手順（H3 ポイント3つ）
H2 よくある失敗と対策
H2 まとめ（次の行動を促す）

※指定の文字数・キーワード・構成があれば準拠します。本文サンプルが要る場合は1本書き起こします。`,
  design: (d) => `📎 添付する成果物（デザイン提案・ラフ案）
・コンセプト：${String(d.title || '本件').slice(0, 30)}の目的に合う印象を狙います
・方向性2案：A案=シンプル/視認性重視、B案=インパクト/装飾性重視
・配色案：メイン/アクセント/背景の3色構成（例：紺 × オレンジ × 白）
・レイアウト：主役要素 → キャッチ → 補足 → CTA の優先順位
・書体：見出し=太ゴシック、本文=可読性重視
※ご依頼後、上記をラフ画像に起こして初稿を提出します（修正無制限）。
・参考実績：${PORTFOLIO_BASE} ／ ${LANCERS_PROFILE}`,
  video: (d) => `📎 添付する成果物（編集構成案）
・全体構成：オープニング（フック5秒）→ 本編 → まとめ → CTA
・テロップ方針：要点のみ大きく、色は2色で統一、可読性優先
・テンポ：無音/間延びをカット、ジャンプカットで離脱防止
・サムネ案：主題コピー＋表情カットの2案
・納品形式：MP4（指定の解像度・尺に対応）
※ご依頼後、冒頭30秒のテスト編集を先に提出します。
・参考実績：${PORTFOLIO_BASE} ／ ${LANCERS_PROFILE}`,
  generic: (d) => `📎 添付する成果物（サンプル・進め方）
・対応イメージ：${String(d.title || '本件').slice(0, 30)}を、目的 → 手順 → 品質チェックの順で進めます
・サンプル：ご希望があれば一部を試しに仕上げてお見せします
・品質保証：納品前にセルフチェック、修正は無制限
・参考実績：${PORTFOLIO_BASE} ／ ${LANCERS_PROFILE}`,
  script: (d) => `📎 添付する成果物（脚本サンプル：ログライン＋1シーン）
・ログライン：${String(d.title || '本作').slice(0, 30)}を題材に、「ある選択で人間関係が壊れ、そして変わる」物語を一行で
・構成（3幕）：日常 → 亀裂（事件） → 選択と余韻
・1シーン抜粋（ト書き＋セリフ）
　夜のキッチン。沈黙。
　A「……まだ起きてたんだ」
　B（背を向けたまま）「眠れなくて」
　A「俺さ、ずっと言えなかったんだけど——」
※過度な露出に頼らず心理描写で“刺激”を表現。ご指定のテーマ・トーン・話数に合わせて作成します。`
};
const DELIV_KIND = { writing: 'writing', script: 'script', design: 'design', video: 'video', other: 'generic' };
function proposal(deal = {}) {
  const type = deal.type || 'LP';
  const d = { ...deal, type, demo: jisseki(type) };
  const body = (TPL[type] || TPL.LP)(d);
  const deliv = (DELIVERABLE[DELIV_KIND[type]] || DELIVERABLE.web)(d);
  return `${body}

―――――――――――――――――
${deliv}`;
}

module.exports = { STAGES, STAGE_KEYS, stageProb, mediaFee, score, scoreFromText, quote, proposal, demoUrl, PLAN, OPT };
