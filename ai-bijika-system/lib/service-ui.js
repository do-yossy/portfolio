'use strict';
// 月額SNS自動投稿サービスの画面（既存の lib/ui.js のレイアウトとデザインを使う）
const { escapeHtml, icon, layout, crest } = require('./ui');
const core = require('./service-core');
const registry = require('./sns');
// YouTube の、再連携が必要なまま連携を消すまでの日数（マイページの文言をこの定数にそろえる。根拠は lib/sns/scheduler.js）
const { YOUTUBE_REAUTH_DELETE_DAYS } = require('./sns/scheduler');

const yen = (n) => `${Number(n).toLocaleString('ja-JP')}円`;
const nameOf = () => escapeHtml(core.serviceName());

const EXTRA_CSS = `<style>
.svc h1{margin:6px 0 10px}
.svc .price-box{border:1px solid var(--gold);background:var(--gold-soft);border-radius:16px;padding:20px;text-align:center;margin:14px 0}
.svc .price-box b{font-size:34px;letter-spacing:.02em}
.svc .price-box small{display:block;color:var(--muted);margin-top:4px}
.svc .grid2{display:grid;gap:12px;grid-template-columns:1fr}
@media(min-width:600px){.svc .grid2{grid-template-columns:1fr 1fr}}
.svc ul.plain{margin:6px 0 0;padding-left:18px}
.svc table.t{width:100%;border-collapse:collapse;font-size:14px}
.svc table.t th,.svc table.t td{border-bottom:1px solid #e6dfd0;padding:8px 6px;text-align:left;vertical-align:top;word-break:break-word}
.svc .hist{overflow-x:auto}
.svc .hist table{min-width:540px}
.svc .btn-row{display:flex;flex-wrap:wrap;gap:8px}
.svc .btn-row .btn{white-space:nowrap}
.svc table.t th{white-space:nowrap}
.svc table.t.kv th{width:1%;padding-right:14px}
.svc .badge-ok{background:#DCEADF;color:#2F5D3A;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .badge-warn{background:#F8E7C9;color:#7a5200;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .badge-ng{background:#F3D8D4;color:#8a2c1f;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .badge-off{background:#E7E5E0;color:#5b574d;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:700}
.svc .legal-links{font-size:13px;margin:10px 0}.svc .legal-links a{margin-right:14px}
.svc textarea{width:100%;min-height:120px;font:inherit;padding:10px;border:1px solid #d9d0bb;border-radius:12px;box-sizing:border-box}
.svc .acct-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee7d6}
.svc .check{display:flex;gap:8px;align-items:flex-start;margin:6px 0}
.svc form.inline{display:inline}
.svc .small{font-size:12.5px;color:var(--muted)}
.svc nav.svc-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:14px}
.svc .legal-doc table{width:100%;border-collapse:collapse}.svc .legal-doc th,.svc .legal-doc td{border:1px solid #d9d0bb;padding:8px;vertical-align:top;font-size:14px}
</style>`;

// サービスの画面は、ミチシルベ本体とは別の商品として表示する（ヘッダーの名前はサービス名、リンクはサービスのトップ）
function wrap(title, body) {
  return layout(title, `${EXTRA_CSS}<div class="svc">${body}</div>`, { brand: { name: core.serviceName(), href: '/service' } });
}

function legalLinks() {
  return `<div class="legal-links"><a href="/service/legal/terms">利用規約</a><a href="/service/legal/tokushoho">特定商取引法に基づく表記</a><a href="/service/legal/privacy">プライバシーポリシー</a><a href="/service/legal/data-deletion">データ削除の手順</a></div>`;
}

function topNav(user) {
  if (!user) return `<nav class="svc-nav"><a href="/service">サービス紹介</a><span><a href="/service/login">ログイン</a></span></nav>`;
  return `<nav class="svc-nav"><a href="/service/app">マイページ</a><span class="small">${escapeHtml(user.email)} ／ <a href="/service/logout">ログアウト</a></span></nav>`;
}

// ── 販売ページ ──
// ── 表示する文（販売ページ・最終確認画面・マイページで同じ文を使う。規約・特商法表記もこの内容に合わせる）──
const aiLib = () => require('./ai');
// このサービスのAIで作れるもの（画像・動画）を、説明に使う言葉にする。どちらも作れなければ ''
const aiKinds = () => { const av = aiLib().available(); return [av.image && '画像', av.video && '動画'].filter(Boolean).join('・'); };
// 実際に使えるSNS（キーが設定済み かつ 審査済み（SNS_APPROVED）のもの。販売ページ・申込みはこれだけを書く）。
// ログイン後の画面では、テスト利用の利用者の契約（sub）を渡すと、審査前のSNSも含める（連携ボタンと同じ判定）
const liveSns = (sub) => core.liveSns({ sub });
const snsNames = () => { const l = liveSns(); return l.length ? l.map((p) => p.label).join('・') : ''; };
// TikTokの投稿の監査（Audit）を通るまでの制限（LP・最終確認画面・サービスの説明のページで同じ文を使う）
const TT_PRE_AUDIT = '公開範囲は「自分のみ」に限られ、投稿するTikTokアカウントは非公開にする必要があり、投稿できるのはこのサービス全体で24時間に5人まで';
const SNS_RULES = {
  threads: 'Threads：テキスト・画像・動画（カルーセル20件まで。動画は5分まで）。ツリー可。500文字まで（絵文字は1つで2文字以上に数えます。組み合わせの絵文字は10文字を超えることもあります）',
  x: 'X：画像4枚（各5MBまで）または動画1本（140秒まで）を添付可。ツリー可。投稿数は月の上限あり',
  instagram: 'Instagram：プロアカウント（ビジネス／クリエイター）が対象。JPEG画像（カルーセル10件まで。縦横比は4:5〜1.91:1）またはリール動画が必須',
  get tiktok() { return `TikTok：動画1本、または写真（JPEG・35枚まで）が必須。公開範囲は投稿ごとに選択${process.env.TIKTOK_AUDITED === 'true' ? '' : `（このサービスがTikTokの投稿の監査（Audit）を通るまでは、${TT_PRE_AUDIT}です。監査を通った後も、それまでに「自分のみ」で出した投稿は自動では公開されません）`}${aiKinds() ? `。このサービスのAIで作った${aiKinds()}には、TikTokの「AI生成」の表示を自動で付けます（ほかのAIで作ってアップロードしたものには、このサービスは表示を付けません。SNSの決まりで表示が必要な場合は、TikTokのアプリから投稿してください）` : ''}`; },
  facebook: 'Facebook：連携のときに選んだ1つのページに投稿（投稿できるページが2つ以上あると連携できないため、Facebookの画面でページを1つだけ選んでください）。テキスト・画像10枚まで・動画1本',
  get youtube() { return `YouTube：3分以内の動画1本が必須。本文の1行目がタイトル（100文字まで）になり、収まる場合は「#Shorts」を付けます。説明は5,000バイト（日本語でおよそ1,600文字）まで。公開設定と子ども向けかどうかは投稿ごとに選択。1日の投稿数に上限があり（太平洋時間で数えます）、送る時点で上限に達していた場合は、YouTubeの日付が変わった後（日本時間の16時または17時）に自動で投稿します${aiLib().available().video ? '。このサービスのAIで作った動画は、合成した内容として申告します（ほかのAIで作ってアップロードした動画は、このサービスは申告しません。必要な場合は、YouTubeのアプリから投稿してください）' : ''}`; },
};
const snsRulesText = () => liveSns().map((p) => SNS_RULES[p.id]).filter(Boolean).join('。');
function aiLimitsText() {
  const av = aiLib().available(); const l = aiLib().limits(); const m = aiLib().monthlyLimits();
  const parts = [];
  if (av.text) parts.push(`文章 1日${l.text}回・1か月${m.text}回`);
  if (av.image) parts.push(`画像 1日${l.image}回・1か月${m.image}回`);
  if (av.video) parts.push(`動画 1日${l.video}回・1か月${m.video}回`);
  return parts.length ? `AIによる生成の上限は、${parts.join('、')}です（日本時間。自動運用で作る分も含みます）` : '';
}
const xLive = (sub) => liveSns(sub).some((p) => p.id === 'x');
// ツリー（連投）ができる、使えるSNSの名前（ThreadsとXのうち、liveSns に入るもの）。無ければ ''
const treeLive = (sub) => liveSns(sub).filter((p) => p.id === 'threads' || p.id === 'x').map((p) => p.label).join('と');
// かんたん投稿で選べる、使えるSNSの文字数の上限（liveSns に入るSNSだけを書く）。
// かんたん投稿の本文は2,200文字まで（入力欄の上限）なので、それより長く書けるSNSも2,200と書く
function quickLimitText(sub) {
  const ids = liveSns(sub).map((p) => p.id);
  const parts = [];
  if (ids.includes('threads')) parts.push('Threads 500（絵文字は1つで2文字以上に数えます）');
  if (ids.includes('x')) parts.push('X 日本語140文字（重み280）');
  const cap = ['instagram', 'tiktok'].filter((id) => ids.includes(id)).map((id) => (id === 'instagram' ? 'Instagram' : 'TikTok'));
  if (cap.length) parts.push(`${cap.join('・')} 2,200`);
  if (ids.includes('facebook')) parts.push('Facebookページ 2,200（かんたん投稿の上限）');
  return parts.length ? parts.join('／') : '対応SNSは準備中です';
}
function limitsText(maxAccounts = core.LIMITS.maxAccounts) {
  const L = core.LIMITS;
  return `連携できるSNSアカウントは${maxAccounts}件まで、未投稿の予約は${L.maxPending}件まで、同じ日（日本時間）に投稿する予約は${L.maxPerDay}件まで${xLive() ? `、Xへの投稿は日本時間の暦月ごとに${L.xPerMonth}件まで（ツリーは1件ずつ数えます。毎日Xへ自動運用すると、月の上限をほぼ使い切ります）` : ''}です`;
}
const END_TEXT = '契約期間が終わると、SNSの連携情報を削除し、未投稿の予約・下書きと自動運用の設定を取り消し、AIアシスタントとの接続とAPIキーを無効にします（再開するときは、連携をやり直してください）';
const FILE_TEXT = 'アップロード・取り込み・AIで作ったファイルは、画像（JPEG・PNG）が8MBまで、動画（MP4・MOV）が100MBまで、保存できる合計は1人あたり300MBまでです。予約・下書きに使っているファイルは、その投稿が終わるか取り消されるまで保存し、投稿が終わってから2日後以降に自動で削除します。どの投稿にも使わなかったファイルは、作成から1日後以降に自動で削除します。各SNSが取得できるよう、保存している間は、推測できない長いURLで外部から取得できる状態になります';
function trialText(trialDays, price) {
  return `初めてお申し込みの方は、お申込みの完了から${trialDays}日間は無料です（終了日時は、お申込み後にマイページに表示します）。お申込みの際に、お支払い方法（クレジットカード）の登録が必要です。終了日時になると自動で有料の契約に切り替わり、その時点で初回の月額${price}を請求します。終了日時より前に解約すれば、料金はかかりません`;
}

// 紹介の表記（見出し・条件）。マイページの紹介カードで使う文。規約（第4条の2）・特商法表記・登録画面・最終確認画面も、同じ言い方にそろえる
const REFERRAL_HEADLINE = '紹介された人は30日間無料。紹介した人には、条件を満たすと1か月分の利用料金に相当するクレジットが付きます';
const REFERRAL_CONDITIONS = '条件あり：無料期間のあとは自動で課金が始まります／特典は、紹介された人が最初に支払ったあとに付きます／特典には上限があります';
const REFERRAL_RULES = [
  '紹介された人は、紹介のURLから登録した場合に限り、初めてのお申込みのとき30日間無料です（お支払い方法の登録が必要で、無料期間が終わると自動で課金が始まります）。すでに契約したことがある人は対象外です',
  '紹介した人への特典（1か月分の利用料金に相当するクレジット）は、紹介された人が無料期間のあとの最初の有料の請求を支払ったあとに付きます（請求の前に解約した場合は付きません）。紹介した人の契約が続いていないときは付きません。特典は、直接紹介した人の分だけです',
  '特典は、次回以降の請求から自動で差し引くクレジットです（現金への交換・返金はできません）。1人が受けられる特典は、最大{limit}件までです',
  '紹介するときは、紹介特典を受ける立場であることが分かるように、「PR」「紹介特典あり」などと表示してください',
  '「必ず稼げる」「ずっと無料で使える」などの虚偽・誇大な説明、無差別なDM・メール・大量投稿などの迷惑な勧誘はしないでください。各SNSの規約を守ってください',
  '自分自身や、同じ人と判断できる別のメールアドレスの紹介は無効です。上の表示・勧誘のルールに重大な違反があるとき（または、是正を求めても改められないとき）や、不正な紹介と確認したとき、または紹介された人の最初の支払いが返金・チャージバックになったときは、特典の取り消しや利用の停止（特典・無料期間を与えないことを含みます）をすることがあります。取り消すときは理由をお知らせし、取り消す範囲は未使用のクレジットの残高の範囲です（すでに使った分は請求しません）',
];

function landingPage({ user, billingReady, trialDays = 0 }) {
  const price = yen(core.priceYen());
  const av = aiLib().available();
  const names = snsNames();
  const cta = billingReady
    ? `<a class="btn btn-primary btn-block" href="${user ? '/service/checkout' : '/service/signup'}">${user ? '申込みに進む' : '無料でアカウントを作って申し込む'}</a>
       <p class="small center" style="margin-top:8px">アカウント作成は無料です。お支払いは、次の確認画面で内容をご確認いただいたあとに始まります。</p>`
    : `<div class="notice"><div>ただいま準備中です。もうしばらくお待ちください。</div></div>`;
  const feat = (t, d) => `<div class="card"><div class="card-title">${t}</div><p class="small">${d}</p></div>`;
  const aiParts = [av.text && '投稿文', av.image && '画像', av.video && '動画'].filter(Boolean);
  const treeNames = liveSns().filter((p) => p.id === 'threads' || p.id === 'x').map((p) => p.label).join('と');
  const multi = liveSns().length >= 2; // 使えるSNSが1つ以下のときは「複数のSNS」と書かない
  return wrap('SNS自動投稿サービス', `
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">SNS Scheduler</div><h1>${nameOf()}</h1>
      <p class="lead">${multi ? '複数のSNSへの投稿を、1つの画面からまとめて予約できるサービスです。' : 'SNSへの投稿を、日時を決めて予約できるサービスです。'}${names ? `現在の対応SNSは、${escapeHtml(names)}です。` : '対応SNSは準備中です。'}</p></header>
    <div class="price-box"><div>月額</div><b>${price}</b>（税込）<small>自動更新／いつでも解約できます（解約後も、契約期間の終わりまでご利用いただけます）</small>${trialDays ? `<small><b>初めての方は${trialDays}日間無料</b>（お支払い方法の登録が必要です。期間が終わると自動で課金が始まります）</small>` : ''}</div>
    ${cta}
    <h2 style="margin-top:26px">できること</h2>
    <div class="grid2">
      ${feat(multi ? '複数のSNSへ同時投稿' : 'SNSへの予約投稿', `${names ? `${escapeHtml(names)}に対応しています。` : '対応SNSは準備中です。'}${multi ? '同じ内容を、選んだSNSへまとめて投稿・予約できます。SNSごとに本文を変えることもできます。' : '決めた日時に、自動で投稿します。'}`)}
      ${feat('テキスト・画像・動画・ツリー', `複数の画像（カルーセル）、動画${treeNames ? `、${escapeHtml(treeNames)}のツリー（連投）` : ''}に対応しています（SNSごとの条件は下記）。`)}
      ${feat('予約・下書き・カレンダー', '日本時間で最大90日先まで予約できます。下書きに保存して、あとから予約することも。予約はカレンダーで一覧できます。')}
      ${aiParts.length ? feat('AIで投稿づくりから投稿まで', `テーマを入れると、AIが${aiParts.join('・')}を作ります。「自動運用」では、決めた時刻（1日3回まで）にAIが投稿を作り、下書きに入れるか、そのまま予約します。テーマを複数書けば、回ごとに順番に使い、最近の投稿と同じ内容にならないようにします（TikTokは投稿ごとにご本人の確認が必要なため、自動運用の対象外です）。`) : ''}
      ${feat('AIアシスタントや他のツールから操作', 'MCP（AIアシスタントとつなぐための共通の仕組み）に対応したアプリから、ログインと許可の操作で接続できます（使えるかどうかは、アプリ側の対応状況によります）。REST APIとAPIキーもご用意しています。')}
      ${feat('自分のアカウントで、安全に', '各SNSの公式の連携（OAuth）を使います。SNSのパスワードをお預かりすることはありません。一時的なエラーは自動で再試行し、結果はマイページで確認できます。')}
    </div>
    <h2 style="margin-top:26px">ご利用の前にご確認ください</h2>
    <div class="card"><ul class="plain small">
      ${trialDays ? `<li>${trialText(trialDays, price)}。</li>` : ''}
      ${names ? `<li>SNSごとの条件：${escapeHtml(snsRulesText())}。</li>` : ''}
      <li>各SNS側の審査・仕様により、使える機能や公開範囲が制限される場合があります。</li>
      <li>${FILE_TEXT}。</li>
      <li>${limitsText()}。${aiLimitsText() ? `${aiLimitsText()}。` : ''}</li>
      ${aiParts.length ? '<li>AIが作った内容は、誤りや不適切な表現を含む場合があります。投稿の前に、必ずご自身で内容をご確認ください。AIで作ったことの表示が、SNSの規約で求められる場合があります。</li>' : ''}
      <li>投稿できるのは、ご自身で作成・予約・設定した内容だけです。いいね・フォロー・コメント・DMなどの自動操作や、投稿の分析機能はありません。</li>
      <li>SNS側の仕様変更や障害、各SNSの規約による制限で、投稿できない場合があります。投稿の内容と、その結果（SNS側での表示・凍結等）の責任は、ご利用者にあります。</li>
      <li>お支払いが確認できない間は、予約した投稿を実行しません。お支払い後の返金は、法令上必要な場合を除き、いたしません。解約すると、次回の更新が止まります。${END_TEXT}。</li>
    </ul></div>
    <h2 style="margin-top:26px">よくある質問</h2>
    <div class="card"><div class="card-title">解約するには？</div><p class="small">マイページの「解約する」ボタンから、いつでも手続きできます。解約後も、契約期間の終わりまでご利用いただけます。${trialDays ? '無料期間の終了日時より前に解約した場合、料金はかかりません。' : ''}</p></div>
    ${xLive() ? '<div class="card"><div class="card-title">XのAPIを自分で契約する必要はありますか？</div><p class="small">ありません。当サービスが用意した連携を使います（そのため、Xへの投稿には月の上限があります）。</p></div>' : ''}
    <div class="card"><div class="card-title">お支払い方法は？</div><p class="small">クレジットカードです。決済は、決済代行会社（Stripe）の画面で行い、当サービスにはカード番号を保存しません。</p></div>
    <div class="card"><div class="card-title">パスワードを忘れたら？</div><p class="small"><a href="/contact">お問い合わせ</a>からご連絡ください。</p></div>
    ${legalLinks()}
  `);
}

// ── 固定投稿から来た人向けのLP（/service/lp）──
// 価格の比較は、公式サイト（価格・条件は料金ページ、使えるSNSは概要のページ）で確認した、条件をそろえて言える範囲だけ（下書き/_調査_予約投稿ツールの価格.md）。
// 確認日（checked）を更新するときは、料金・年払い・税込・アカウント数・上限・無料体験・使えるSNSをすべて確かめ直す（1つでも確かめられなければ比較をやめる）。
// 他社の名前は出さない（サービスA）。根拠（確認した相手・日付・ページ）は社内の調査記録に残している。
// 「国内の同じ種類のサービスの中でいちばん安いプランの、さらに半額」と読まれないよう、特定の1社の1プランと比べていることが先に分かる語順にする
// （「サービスA（…サービスの1つ）の最安の有料プラン（…・月払い・税込）と比べて、ちょうど半額です（同じプランの年払い…と比べると、半額にはなりません）」）。
// 年払いと比べた結果も、すぐ近くに書く。Threadsの固定投稿（下書き/Threads固定投稿_出品用.md）の1件目も同じ意味の書き方にしている。
// 確認日から COMPARE_VALID_DAYS を過ぎたら、比較を自動で出さない（相手の価格が変わっているおそれがあるため。再確認したら checked を更新する）。
const COMPARE = {
  name: 'サービスA', desc: '国内の、複数のSNSに予約投稿できるサービスの1つ', price: 2200, note: '月払い・税込', annual: 2000,
  checked: '2026-10-14', accounts: 10, posts: '投稿・予約は無制限（Xは月30件）',
  sns: 'Threads・X・Instagram・TikTok・Facebook・YouTube', trial: '7日間',
};
const COMPARE_VALID_DAYS = 45;
function compareActive(priceN, nowMs = Date.now()) {
  const fresh = nowMs - Date.parse(`${COMPARE.checked}T00:00:00+09:00`) <= COMPARE_VALID_DAYS * 86400000;
  return fresh && priceN * 2 <= COMPARE.price && process.env.SERVICE_LP_COMPARE !== 'off';
}
const jpDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${y}年${m}月${d}日`; };

// 固定投稿・Tipsから来た人向けのLP（/service/lp）。暗い配色の1ページで、このページだけのスタイルを持つ（ほかの画面の見た目は変えない）。
// 書く事実（使えるSNS・上限・料金・比較・AI）は、すべて設定と実装から作る（使えないSNSや機能を、使えるように見せない）。
const LP_CSS = `<style>
body{background:#0B141A}
.svc .lp{--lp-bg:#0B141A;--lp-s1:#122029;--lp-s2:#182A35;--lp-line:rgba(234,241,244,.10);--lp-ink:#EAF1F4;--lp-mute:#A7B7C0;--lp-acc:#5EDDC0;--lp-acc-ink:#04221B;--lp-paper:#F5F1EA;--lp-paper-ink:#0E1A22;
  color:var(--lp-ink);margin:0 -4px;font-size:15px;line-height:1.85}
.svc .lp a{color:var(--lp-acc)}
.svc .lp section{margin:0 0 36px}
.svc .lp .tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--lp-acc);border:1px solid rgba(94,221,192,.45);border-radius:6px;padding:1px 10px;margin:0 0 10px}
.svc .lp h1{font-size:30px;line-height:1.35;margin:4px 0 12px;color:#fff;letter-spacing:.02em}
.svc .lp h2{font-size:23px;line-height:1.45;margin:0 0 12px;color:#fff;letter-spacing:.02em}
.svc .lp h3{font-size:16px;margin:0 0 6px;color:#fff}
.svc .lp h1,.svc .lp h2,.svc .lp h3{font-family:var(--f-sans);font-weight:800;letter-spacing:.02em}
.svc .lp h2{display:block}.svc .lp h2::after{content:none;display:none}
.svc .lp .grid>*{min-width:0}
.svc .lp pre{max-width:100%;box-sizing:border-box}
.svc .lp section[id]{scroll-margin-top:calc(72px + env(safe-area-inset-top, 0px))}
.svc nav.svc-nav a{color:#5EDDC0}
.svc nav.svc-nav .small{color:#A7B7C0}
.svc .lp ul.chips{list-style:none;padding:0}
.svc .lp p{margin:0 0 10px}
.svc .lp .mute{color:var(--lp-mute)}
.svc .lp .small{font-size:12.5px;color:var(--lp-mute)}
.svc .lp .card{background:var(--lp-s1);border:1px solid var(--lp-line);border-radius:16px;padding:16px;margin:0 0 12px;box-shadow:none}
.svc .lp .chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.svc .lp .chip{display:inline-flex;align-items:center;gap:7px;background:var(--lp-s2);border:1px solid var(--lp-line);border-radius:999px;padding:5px 12px;font-size:13.5px;font-weight:700;color:var(--lp-ink)}
.svc .lp .chip i{width:9px;height:9px;border-radius:50%;background:var(--lp-acc);display:inline-block}
.svc .lp .price{background:var(--lp-s1);border:1px solid rgba(94,221,192,.35);border-radius:16px;padding:16px;margin:14px 0}
.svc .lp .price .amount{font-size:40px;font-weight:800;color:#fff;letter-spacing:.01em;line-height:1.2}
.svc .lp .price .amount small{font-size:14px;font-weight:600;color:var(--lp-mute);margin-left:4px}
.svc .lp .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}
.svc .lp .stat{background:var(--lp-s1);border:1px solid var(--lp-line);border-radius:12px;padding:10px 8px;text-align:center}
.svc .lp .stat b{display:block;font-size:22px;color:#fff;line-height:1.3}
.svc .lp .stat span{font-size:11.5px;color:var(--lp-mute)}
.svc .lp .btn-lp{display:block;text-align:center;background:var(--lp-acc);color:var(--lp-acc-ink);font-weight:800;border-radius:12px;padding:14px 16px;text-decoration:none;margin:12px 0 4px;min-height:44px;box-sizing:border-box}
.svc .lp .soon{background:var(--lp-s2);border:1px dashed rgba(234,241,244,.3);border-radius:12px;padding:12px;text-align:center;color:var(--lp-ink);margin:12px 0}
.svc .lp ul.dots{margin:6px 0 0;padding-left:20px}.svc .lp ul.dots li{margin:4px 0}
.svc .lp .mock{background:var(--lp-s2);border:1px solid var(--lp-line);border-radius:14px;padding:12px;font-size:12px;color:var(--lp-mute)}
.svc .lp .mock .row{display:flex;gap:8px;align-items:center;margin:0 0 8px}
.svc .lp .mock .bar{height:9px;border-radius:5px;background:rgba(234,241,244,.16);flex:1}
.svc .lp .mock .pill{border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;background:rgba(94,221,192,.16);color:var(--lp-acc)}
.svc .lp .cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.svc .lp .cal div{min-height:34px;border-radius:6px;background:rgba(234,241,244,.06);font-size:10px;padding:3px;color:var(--lp-mute)}
.svc .lp .cal .on{background:rgba(94,221,192,.18);color:var(--lp-acc);font-weight:700}
.svc .lp .grid{display:grid;gap:12px;grid-template-columns:1fr}
@media(min-width:640px){.svc .lp .grid{grid-template-columns:1fr 1fr}.svc .lp h1{font-size:36px}}
.svc .lp pre{background:#071015;border:1px solid var(--lp-line);border-radius:12px;padding:12px;overflow-x:auto;font-size:12px;line-height:1.6;color:#CFE3EA;margin:8px 0 0}
.svc .lp ol.steps{list-style:none;margin:0;padding:0;counter-reset:s}
.svc .lp ol.steps li{counter-increment:s;position:relative;padding:12px 12px 12px 52px;background:var(--lp-s1);border:1px solid var(--lp-line);border-radius:14px;margin:0 0 10px}
.svc .lp ol.steps li::before{content:counter(s);position:absolute;left:12px;top:12px;width:28px;height:28px;border-radius:50%;background:var(--lp-acc);color:var(--lp-acc-ink);font-weight:800;display:grid;place-items:center;font-size:14px}
.svc .lp .paper{background:var(--lp-paper);color:var(--lp-paper-ink);border-radius:18px;padding:20px}
.svc .lp .paper h2,.svc .lp .paper h3{color:var(--lp-paper-ink)}
.svc .lp .paper .small,.svc .lp .paper .mute{color:#4A5862}
.svc .lp .paper a{color:#0B6B57}
.svc .lp .paper .btn-lp{background:#0E1A22;color:#fff}
.svc .lp .paper .soon{background:#fff;color:#0E1A22;border-color:#C9C2B3}
.svc .lp table.t{width:100%;border-collapse:collapse;font-size:13.5px;table-layout:fixed}
.svc .lp table.t th,.svc .lp table.t td{border-bottom:1px solid #DDD5C5;padding:8px 6px;text-align:left;vertical-align:top;word-break:break-word;white-space:normal}
.svc .lp details{background:var(--lp-s1);border:1px solid var(--lp-line);border-radius:12px;padding:12px 14px;margin:0 0 8px}
.svc .lp summary{cursor:pointer;font-weight:700;color:#fff;min-height:24px}
.svc .lp details p{margin:8px 0 0;color:var(--lp-ink);font-size:14px}
.svc .lp .foot{border-top:1px solid var(--lp-line);padding-top:14px;font-size:13px}
.topbar{background:#0B141A}
</style>`;

function lpPage({ user, billingReady, trialDays = 0 }) {
  const priceN = core.priceYen(); const price = yen(priceN);
  const L = core.LIMITS; const live = liveSns(); const names = snsNames(); const av = aiLib().available();
  const multi = live.length >= 2; // 使えるSNSが1つ以下のときは「複数のSNS」と書かない
  const cmp = compareActive(priceN); // 半額以下で、確認日から間もないときだけ比較を出す
  const checked = jpDate(COMPARE.checked);
  // 比べた結果の言い方：ちょうど半額なら「ちょうど半額」、それより安ければ「半額より安い」。年払いと比べた結果も、すぐ近くに書く
  const halfWord = priceN * 2 === COMPARE.price ? 'ちょうど半額です' : '半額より安い金額です';
  const annualNote = priceN * 2 <= COMPARE.annual ? `同じプランの年払い（1か月あたり${yen(COMPARE.annual)}・税込）と比べても半額以下です` : `同じプランの年払い（1か月あたり${yen(COMPARE.annual)}・税込）と比べると、半額にはなりません`;
  // 本当に違う条件だけを書く（無料体験の日数が同じなら、無料体験は書かない）
  const diffs = ['予約の上限', '使えるSNS', `${trialDays}日間` === COMPARE.trial ? '' : '無料体験'].filter(Boolean).join('・');
  // TikTokは、このサービスがTikTokの投稿の監査（Audit）を通るまで制限がある（公開範囲は「自分のみ」・投稿するアカウントは非公開・このサービス全体で24時間に5人まで）
  const ttLimited = live.some((p) => p.id === 'tiktok') && process.env.TIKTOK_AUDITED !== 'true';
  const ttNote = `TikTokは、このサービスがTikTokの投稿の監査（Audit）を通るまで、${TT_PRE_AUDIT}です。`;
  const ours = `未投稿の予約${L.maxPending}件まで、同じ日（日本時間）に投稿する予約${L.maxPerDay}件まで${xLive() ? `、Xは月${L.xPerMonth}件まで` : ''}`;
  const treeNames = live.filter((p) => p.id === 'threads' || p.id === 'x').map((p) => p.label).join('と');
  // 30件プラン（SNS運用代行の人向け）は、Stripeの価格（STRIPE_PRICE_ID_AGENCY）と表示する月額（SERVICE_PRICE_JPY_AGENCY）が設定されているときだけ出す。
  // 上の比較（サービスA）は通常プランだけの比較で、30件プランは混ぜない
  const agencyLp = core.agencyOnLp();
  const agencyPrice = yen(core.priceYen('agency'));
  const agencyMax = L.maxAccountsAgency;
  const cta = (where) => billingReady
    ? `<a class="btn-lp" href="${user ? '/service/checkout' : '/service/signup'}">${user ? '申込みに進む' : 'アカウントを作って申し込む'}</a>
       <p class="small" style="text-align:center">アカウントは無料で作れます。お支払いは、確認画面で内容をご確認いただいたあとに始まります。${trialDays ? `初めての方は${trialDays}日間無料です（お支払い方法の登録が必要。期間が終わると自動で課金が始まります）。` : ''}</p>`
    : `<div class="soon"${where ? ` data-where="${where}"` : ''}>ただいま準備中です。もうしばらくお待ちください。</div>`;
  const th = (t) => `<th>${t}</th>`;
  const snsChips = live.length ? `<ul class="chips" aria-label="使えるSNS">${live.map((p) => `<li class="chip"><i aria-hidden="true"></i>${escapeHtml(p.label)}</li>`).join('')}</ul>` : '<p class="mute">対応SNSは準備中です。</p>';
  // このサービスのAIで作ったものに、AI生成の表示を自動で付けられるSNS（実際に使えるものだけ。TikTokは画像・動画、YouTubeは動画）
  const labelParts = [];
  if (live.some((p) => p.id === 'tiktok') && (av.image || av.video)) labelParts.push(`${[av.image && '画像', av.video && '動画'].filter(Boolean).join('・')}をTikTokに`);
  if (live.some((p) => p.id === 'youtube') && av.video) labelParts.push('動画をYouTubeに');
  const apiBase = String(process.env.SERVICE_BASE_URL || '').replace(/\/+$/, '') || 'https://（サービスのURL）';
  // このサービスのAIで作れるもの（設定で使えるものだけ。使えないものを作れるように読ませない）
  const ownAiKinds = [av.text && '文章', av.image && '画像', av.video && '動画'].filter(Boolean).join('・');
  return wrap(`SNSの予約投稿を月額${price}で`, `${LP_CSS}
    ${topNav(user)}
    <div class="lp">
    <section>
      <span class="tag">SNS予約投稿</span>
      <h1>${multi ? '複数のSNSへの投稿を、まとめて予約。' : 'SNSへの投稿を、まとめて予約。'}</h1>
      <p class="mute">発信を続けたいけれど、毎日その場で投稿する時間がない。そんな方のための、予約投稿のサービスです。投稿をまとめて作っておけば、決めた日時に自動で投稿します。</p>
      ${snsChips}
      ${ttLimited ? `<p class="small">${ttNote}</p>` : ''}
      <div class="price"><div class="small">月額</div><div class="amount">${price}<small>（税込）</small></div><div class="small">自動更新／いつでも解約できます</div>${cmp ? `<p class="small" style="margin:8px 0 0">参考：${COMPARE.name}（${COMPARE.desc}）の最安の有料プラン（${yen(COMPARE.price)}・${COMPARE.note}）と比べて、${halfWord}（${annualNote}）。${diffs}などの条件は異なります（${checked}に${COMPARE.name}の公式サイト（料金と概要のページ）で確認。詳しくは下の「料金の比べ方」）。</p>` : ''}</div>
      <div class="stats">
        <div class="stat"><b>${live.length ? `${live.length}つ` : '準備中'}</b><span>使えるSNS</span></div>
        <div class="stat"><b>90日</b><span>先まで予約できる</span></div>
        <div class="stat"><b>${L.maxAccounts}件</b><span>${agencyLp ? `連携できるアカウント（通常プラン。${agencyMax}件のプランもあります）` : '連携できるアカウント（最大）'}</span></div>
      </div>
      ${cta('hero')}
    </section>

    <section>
      <span class="tag">こんな方に</span>
      <div class="card"><ul class="dots">
        <li>毎日の投稿を、その場で考えて出すのが負担になっている</li>
        ${multi ? '<li>同じお知らせを、いくつものSNSに出すのが手間</li>' : ''}
        <li>投稿文の下書きを、AIに手伝ってもらいたい</li>
      </ul></div>
    </section>

    <section>
      <span class="tag">投稿を作る</span>
      <h2>${multi ? '1回の入力で、複数のSNSへ。' : '投稿をまとめて作って、予約する。'}</h2>
      <p class="mute">本文と画像・動画を用意して、投稿先と日時を選ぶだけです。${multi ? 'SNSごとに本文を変えることもできます。' : ''}複数の画像（カルーセル）、動画${treeNames ? `、${escapeHtml(treeNames)}のツリー（連投）` : ''}にも対応し、下書きに保存して、あとから予約することもできます。</p>
      <div class="mock" aria-hidden="true">
        <div class="row"><span class="pill">投稿先</span><div class="bar"></div></div>
        <div class="row"><span class="pill">本文</span><div class="bar"></div></div>
        <div class="row"><div class="bar" style="flex:.7"></div></div>
        <div class="row"><span class="pill">日時</span><div class="bar" style="flex:.5"></div></div>
      </div>
      <p class="small">画面のイメージです。</p>
    </section>

    <section>
      <span class="tag">カレンダー</span>
      <h2>予約も結果も、ひと目でわかる。</h2>
      <p class="mute">日本時間で最大90日先まで予約できます。予約はカレンダーで一覧でき、投稿の結果（予約中・投稿済み・失敗）はカレンダーとマイページで確認できます。一時的なエラーは自動で再試行し、失敗したときは理由を表示します。</p>
      <div class="mock" aria-hidden="true"><div class="cal">${Array.from({ length: 14 }, (_, i) => `<div class="${[2, 5, 9, 12].includes(i) ? 'on' : ''}">${i + 1}</div>`).join('')}</div></div>
      <p class="small">画面のイメージです。</p>
    </section>

    <section>
      <span class="tag">SNSごとの決まり</span>
      <h2>文字数は入力しながら、条件は保存のときに確かめる。</h2>
      <p class="mute">投稿を作る画面では、本文の文字数を、選んだSNSごとの数え方で表示します。SNSごとの条件（文字数・画像や動画の形式など）は保存するときに確かめ、合わないときは予約せずにお知らせします。</p>
    </section>

    <section id="ai">
      <span class="tag">AI</span>
      <h2>AIと一緒に、投稿をつくる。</h2>
      <div class="grid">
        <div class="card"><h3>ご自身のAIで作る</h3><p class="small">「投稿を作る」画面でテーマを入れてボタンを押すと、指示文をコピーしてから、AIを開きます。文章は ChatGPT・Claude・Gemini で作れます（指示文には、投稿先のSNSの条件（文字数など）を自動で入れます）。画像は ChatGPT・Gemini で作れます。自動で入力されない場合は、貼り付けて送信してください。できた文章は本文に貼り付け、画像は保存して添付します。各AIのご利用条件・料金は、それぞれのサービスに従います。</p></div>
        ${ownAiKinds ? `<div class="card"><h3>このサービスのAIで作る</h3><p class="small">テーマを入れると、AIが${ownAiKinds}を作ります（1日・1か月の回数に上限があります）。</p></div>` : ''}
        <div class="card"><h3>AIアシスタントから操作</h3><p class="small">MCP（AIアシスタントとつなぐための共通の仕組み）に対応したアプリから、ログインと許可の操作で接続できます（使えるかどうかは、アプリ側の対応状況によります）。</p></div>
        <div class="card"><h3>REST APIで連携</h3><p class="small">マイページで発行するAPIキーで、投稿の作成・予約・下書き・取り消しができます。</p>
<pre>curl -X POST ${escapeHtml(apiBase)}/api/v1/posts \\
  -H "Authorization: Bearer （APIキー）" \\
  -H "Content-Type: application/json" \\
  -d '{"category":"text","account_ids":["…"],"text":"…","draft":true}'</pre></div>
      </div>
      <ul class="dots small">
        <li>AIが作った内容は、誤りや不適切な表現を含む場合があります。投稿の前に、必ずご自身で内容をご確認ください。</li>
        <li>${labelParts.length ? `このサービスのAIで作った${labelParts.join('、')}投稿するときは、AI生成の表示を自動で付けます。それ以外のSNSと、ご自身のAIで作った画像・動画には、このサービスはAI生成の表示を付けません。` : 'このサービスは、AI生成の表示を付けません。'}SNSの決まりで表示が必要な場合は、SNSのアプリから表示を付けて投稿してください。</li>
      </ul>
    </section>

    <section>
      <span class="tag">使い方</span>
      <h2>使い方は、5つの手順。</h2>
      <ol class="steps">
        <li><h3>アカウントを作って申し込む</h3><p class="small">お支払いは、確認画面で内容をご確認いただいたあとに始まります。</p></li>
        <li><h3>SNSを連携する</h3><p class="small">${names ? `${escapeHtml(names)}に対応しています。` : '対応SNSは準備中です。'}各SNSの公式の連携（OAuth）を使うため、SNSのパスワードをお預かりすることはありません。</p></li>
        <li><h3>投稿を作る</h3><p class="small">本文と画像・動画を用意します。投稿文は、お使いのAI（ChatGPT・Claude・Gemini）で作ることもできます。${multi ? 'SNSごとに本文を変えたり、下書きに保存したりできます。' : '下書きに保存することもできます。'}</p></li>
        <li><h3>日時を決めて予約する</h3><p class="small">日本時間で最大90日先まで予約できます。決めた日時に自動で投稿します。</p></li>
        <li><h3>結果を確かめる</h3><p class="small">結果はカレンダーとマイページで確認できます。一時的なエラーは自動で再試行します。</p></li>
      </ol>
    </section>

    <section>
      <span class="tag">使えるSNS</span>
      <h2>${live.length ? (multi ? `${live.length}つのSNSに、まとめて投稿。` : `${escapeHtml(live[0].label)}に投稿。`) : '使えるSNSは、準備中です。'}</h2>
      ${live.length ? live.map((p) => `<div class="card"><h3>${escapeHtml(p.label)}</h3><p class="small">${escapeHtml(String(SNS_RULES[p.id] || '').replace(/^[^：]*：/, ''))}</p></div>`).join('') : '<p class="mute">各SNSの準備ができたものから、ここに表示します。</p>'}
      <p class="small">各SNSの審査・仕様により、使える機能や公開範囲が制限される場合があります。</p>
    </section>

    <section>
      <span class="tag">安全</span>
      <h2>アカウントを守るための仕組み。</h2>
      <div class="card"><ul class="dots">
        <li>各SNSの公式の連携（OAuth）を使います。SNSのパスワードをお預かりすることはありません。</li>
        <li>連携に使う情報（トークン）は、暗号化して保存します。マイページから、いつでも連携を解除できます。</li>
        <li>投稿できるのは、ご自身で作成・予約・設定した内容だけです。いいね・フォロー・コメント・DMなどの自動操作はしません。</li>
        <li>お支払いは決済代行会社（Stripe）の画面で行い、当サービスにはカード番号を保存しません。</li>
      </ul></div>
    </section>

    <section class="paper">
      <h2>発信を、続けられる形に。</h2>
      <p class="mute">投稿をまとめて作っておけば、決めた日時に自動で投稿します。</p>
      ${cta('band')}
    </section>

    <section class="paper">
      <span class="tag" style="color:#0B6B57;border-color:#0B6B57">料金</span>
      <h2>${agencyLp ? 'プランは2つ。' : 'プランはひとつだけ。'}</h2>
      ${agencyLp ? '<h3>通常プラン</h3>' : ''}
      <div style="font-size:42px;font-weight:800;line-height:1.2">${price}<small style="font-size:14px;font-weight:600;margin-left:4px">／月（税込）</small></div>
      <p class="small">1か月ごとの自動更新です。いつでも解約でき、解約後も契約期間の終わりまでご利用いただけます。${trialDays ? `初めての方は${trialDays}日間無料です（お支払い方法の登録が必要。期間が終わると自動で課金が始まります）。` : ''}</p>
      <ul class="dots small">
        <li>連携できるSNSアカウントは${L.maxAccounts}件まで</li>
        <li>${ours}</li>
        <li>日本時間で最大90日先まで予約・下書き・カレンダー</li>
        <li>ご自身のAIで投稿文・画像を作る${ownAiKinds ? `／このサービスのAIで${ownAiKinds}を作る（回数の上限あり）` : ''}</li>
        <li>APIキー・AIアシスタント（MCP）との接続</li>
      </ul>
      ${cmp ? `<h3 style="margin-top:16px">料金の比べ方</h3>
      <div style="overflow-x:auto"><table class="t"><colgroup><col style="width:30%"><col><col></colgroup>
        <tr>${th('')}${th('このサービス')}${th(`${COMPARE.name}（${COMPARE.desc}）の最安の有料プラン`)}</tr>
        <tr>${th('月額')}<td>${price}（月払い・税込）</td><td>${yen(COMPARE.price)}（${COMPARE.note}）</td></tr>
        <tr>${th('年払い')}<td>なし（月払いだけ）</td><td>1か月あたり${yen(COMPARE.annual)}（税込。年${yen(COMPARE.annual * 12)}を前払い）</td></tr>
        <tr>${th('使えるSNS')}<td>${names ? escapeHtml(names) : '準備中'}（各SNSの審査が終わるまで、使える機能や公開範囲が限られる場合があります）</td><td>${COMPARE.sns}</td></tr>
        <tr>${th('つなげるアカウント')}<td>${L.maxAccounts}アカウントまで</td><td>${COMPARE.accounts}アカウントまで</td></tr>
        <tr>${th('投稿・予約の上限')}<td>${ours}</td><td>${COMPARE.posts}</td></tr>
        <tr>${th('無料体験')}<td>${trialDays ? `${trialDays}日間（初めての方）` : 'なし'}</td><td>${COMPARE.trial}</td></tr>
      </table></div>
      <p class="small">${COMPARE.name}の価格・条件は、${checked}に同社の公式サイト（料金と概要のページ）で確認したものです（その後、変わっている場合があります）。機能・上限・使えるSNSは、両者で異なります。いちばん安いサービスであることをお約束するものではありません。</p>` : ''}
      ${agencyLp ? `<div style="border-top:1px solid #C9C2B3;margin-top:18px;padding-top:14px" id="agency-plan">
        <h3>${escapeHtml(core.PLAN_LABEL.agency)}</h3>
        <div style="font-size:42px;font-weight:800;line-height:1.2">${agencyPrice}<small style="font-size:14px;font-weight:600;margin-left:4px">／月（税込）</small></div>
        <p class="small">SNSの運用を代行するなど、たくさんのアカウントを扱う方のためのプランです。連携できるSNSアカウントを${agencyMax}件までにした、通常プランの上位のプランです。1か月ごとの自動更新で、いつでも解約できます。</p>
        <ul class="dots small">
          <li>連携できるSNSアカウントは${agencyMax}件まで（通常プランは${L.maxAccounts}件まで）</li>
          <li>${ours}（通常プランと同じです）</li>
          <li>通常プランのそのほかの機能は、すべて同じです</li>
        </ul>
        <p class="small">お申込みの最終確認画面で、プランを選べます。申込みのあとも、マイページから通常プランとの間で変更できます（30件から通常への変更は、次回の更新日からです。連携が${L.maxAccounts}件を超えている間は変更できません）。</p>
        ${billingReady && user ? `<a class="btn-lp" href="/service/checkout?plan=agency">${escapeHtml(core.PLAN_LABEL.agency)}で申込みに進む</a>` : ''}
      </div>` : ''}
      ${cta('pricing')}
    </section>

    <section>
      <span class="tag">ご確認ください</span>
      <h2>ご利用の前にご確認ください</h2>
      <div class="card"><ul class="dots small">
        ${names ? `<li>SNSごとの条件：${escapeHtml(snsRulesText())}。</li>` : ''}
        <li>${limitsText()}。${aiLimitsText() ? `${aiLimitsText()}。` : ''}</li>
        <li>投稿できるのは、ご自身で作成・予約・設定した内容だけです。いいね・フォロー・コメント・DMなどの自動操作や、投稿の分析機能はありません。投稿の内容と、その結果の責任は、ご利用者にあります。</li>
        <li>お支払い後の返金は、法令上必要な場合を除き、いたしません。解約すると、次回の更新が止まります。${END_TEXT}。</li>
      </ul></div>
    </section>

    <section>
      <span class="tag">よくある質問</span>
      <h2>よくある質問</h2>
      <details><summary>どのSNSに投稿できますか？</summary><p>${names ? `現在は、${escapeHtml(names)}に投稿できます。` : '対応SNSは準備中です。'}${ttLimited ? ttNote : ''}各SNSの審査・仕様により、使える機能や公開範囲が制限される場合があります。</p></details>
      ${xLive() ? '' : '<details><summary>Xには投稿できますか？</summary><p>現在、Xへの投稿は提供していません。</p></details>'}
      <details><summary>SNSのパスワードを預ける必要はありますか？</summary><p>ありません。各SNSの公式の連携（OAuth）を使います。</p></details>
      <details><summary>AIは使えますか？</summary><p>ChatGPT・Claude・Gemini など、ご自身のAIで投稿文や画像を作れます（各AIのご利用条件・料金は、それぞれのサービスに従います）。${ownAiKinds ? `このサービスのAIでは、${ownAiKinds}を作れます（回数の上限があります）。` : ''}</p></details>
      <details><summary>解約するには？</summary><p>マイページの「解約する」ボタンから、いつでも手続きできます。解約後も、契約期間の終わりまでご利用いただけます。お支払い後の返金は、法令上必要な場合を除き、いたしません。</p></details>
      <details><summary>お支払い方法は？</summary><p>クレジットカードです。決済代行会社（Stripe）の画面でお支払いいただき、当サービスにはカード番号を保存しません。</p></details>
      <p class="small"><a href="/service">サービスの詳しい説明</a></p>
    </section>

    <div class="foot"><a href="/service/legal/tokushoho">特定商取引法に基づく表記</a></div>
    </div>
  `);
}

// ── ログイン・登録 ──
function authPage(kind, error, next = '', ref = '') {
  const signup = kind === 'signup';
  return wrap(signup ? 'アカウント作成' : 'ログイン', `
    ${topNav(null)}
    <div class="auth"><div class="auth-head">${crest(58)}<h1>${signup ? 'アカウント作成' : 'ログイン'}</h1>
      <p class="lead">${signup ? 'メールアドレスとパスワードを登録します（無料）。' : 'ご契約のアカウントでログインしてください。'}</p></div>
      ${error ? `<div class="notice error" style="margin:0 0 14px"><div>${escapeHtml(error)}</div></div>` : ''}
      <div class="card"><form method="POST" action="/service/${signup ? 'signup' : 'login'}">${next ? `<input type="hidden" name="next" value="${escapeHtml(next)}">` : ''}${signup && ref ? `<input type="hidden" name="ref" value="${escapeHtml(ref)}">` : ''}
        <div class="field"><label class="lbl" for="email">メールアドレス</label><input id="email" type="email" name="email" required autofocus autocomplete="email"></div>
        <div class="field"><label class="lbl" for="password">パスワード${signup ? '（8文字以上）' : ''}</label>
          <input id="password" type="password" name="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}"></div>
        <button class="btn btn-primary btn-block" type="submit">${signup ? 'アカウントを作成' : 'ログイン'}</button>
      </form></div>
      ${signup && ref ? '<div class="notice"><div><b>紹介された人は30日間無料です。</b>紹介のURLから登録しています。紹介のコードが有効な場合、初めてのお申込みのとき30日間無料です。条件あり：お支払い方法の登録が必要で、無料期間が終わると自動で課金が始まります。</div></div>' : ''}
      <p class="muted center">${signup ? 'アカウントをお持ちの方は <a href="/service/login">ログイン</a>' : 'はじめての方は <a href="/service/signup">アカウント作成</a>'}</p>
    </div>
    ${legalLinks()}
  `);
}

// ── 申込みの最終確認 ──
function checkoutPage({ user, csrf, error, trialDays = 0, plan = 'standard', agencyOffered = false, referral = false }) {
  // plan：選んだプラン。30件プランは、agencyOffered（STRIPE_PRICE_ID_AGENCY が設定されている）ときだけ選べる
  const chosen = plan === 'agency' && agencyOffered ? 'agency' : 'standard';
  const price = yen(core.priceYen(chosen));
  const maxAcc = core.maxAccountsFor(chosen);
  const planLabel = escapeHtml(core.PLAN_LABEL[chosen]);
  const names = snsNames();
  const other = chosen === 'agency' ? 'standard' : 'agency';
  const planRow = agencyOffered
    ? `<tr><th>プラン</th><td><b>${planLabel}</b>（連携できるSNSアカウントは${maxAcc}件まで・月額 ${price}）<br><span class="small">${escapeHtml(core.PLAN_LABEL[other])}（連携${core.maxAccountsFor(other)}件まで・月額 ${yen(core.priceYen(other))}）にする場合は、<a href="/service/checkout?plan=${other}">こちら</a>から選び直してください。申込みのあとも、マイページで変更できます（30件から通常への変更は、次回の更新日からです）。</span></td></tr>`
    : '';
  return wrap('お申込みの最終確認', `
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">Confirm</div><h1>お申込みの最終確認</h1>
      <p class="lead">お支払いの前に、内容を必ずご確認ください。</p></header>
    ${error ? `<div class="notice error" style="margin:0 0 14px"><div>${escapeHtml(error)}</div></div>` : ''}
    <div class="card">
      <table class="t kv">
        <tr><th>サービス</th><td>${nameOf()}</td></tr>
        ${planRow}
        <tr><th>料金</th><td><b>月額 ${price}（税込）</b></td></tr>
        ${trialDays ? `<tr><th>無料期間</th><td>${referral ? '<b>紹介された人は30日間無料（条件あり）：</b>' : ''}<b>お申込みの完了から${trialDays}日間は無料</b>です（終了日時は、お申込み後にマイページに表示します）。決済ページで、お支払い方法の登録が必要です。<b>終了日時になると自動で有料の契約に切り替わり、その時点で初回の月額 ${price} を請求します。</b>料金をかけずにやめる場合は、終了日時より前に、マイページの「解約する」から手続きしてください。${referral ? '紹介による無料期間は、初めてのお申込みのときだけです。' : ''}</td></tr>` : ''}
        <tr><th>お支払いの時期</th><td>${trialDays ? `無料期間の終了日時に、初回の ${price} を請求します。` : '決済ページでお支払いが完了した時点で、初回の料金をお支払いいただきます。'}2回目以降は、毎月、契約の更新日に自動で請求します。</td></tr>
        <tr><th>提供の時期</th><td>決済ページでの手続きが完了した直後から、ご利用いただけます。</td></tr>
        <tr><th>契約期間と更新</th><td>1か月ごとの自動更新です。解約しない限り、毎月、同じ日に ${price} が、お支払い方法に請求されます。</td></tr>
        <tr><th>解約の方法</th><td>ログイン後のマイページにある「解約する」ボタンから、いつでも手続きできます。解約すると、次回の更新が止まります。解約後も、${trialDays ? '無料期間または' : ''}すでにお支払いいただいた契約期間の終わりまでは、ご利用いただけます。${END_TEXT}。</td></tr>
        <tr><th>返金</th><td>お支払い済みの料金は、法令上必要な場合を除き、返金いたしません（日割りでの返金もありません）。お支払いが確認できない間は、予約した投稿を実行しません。</td></tr>
        <tr><th>対応SNSと上限</th><td>${names ? `${escapeHtml(names)}。` : '対応SNSは準備中です。'}${limitsText(maxAcc)}。${aiLimitsText() ? `${aiLimitsText()}。` : ''}</td></tr>
        <tr><th>SNSごとの条件</th><td>${names ? `${escapeHtml(snsRulesText())}。` : ''}各SNS側の審査・仕様により、使える機能や公開範囲が制限される場合があります。</td></tr>
        <tr><th>ファイル</th><td>${FILE_TEXT}。</td></tr>
        <tr><th>お支払い方法</th><td>クレジットカード（決済代行：Stripe）。カード情報は当サービスには保存されません。</td></tr>
      </table>
    </div>
    ${legalLinks()}
    <form method="POST" action="/service/checkout" class="card">
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="plan" value="${chosen}">
      <label class="check"><input type="checkbox" name="agree" value="1" required>
        <span class="small"><a href="/service/legal/terms" target="_blank" rel="noopener">利用規約</a>と<a href="/service/legal/tokushoho" target="_blank" rel="noopener">特定商取引法に基づく表記</a>、<a href="/service/legal/privacy" target="_blank" rel="noopener">プライバシーポリシー</a>を読み、上記の内容（${agencyOffered ? `${planLabel}・連携${maxAcc}件まで・` : ''}${trialDays ? `${trialDays}日間の無料期間のあと自動で` : ''}月額 ${price}・自動更新・返金なし）に同意します。</span></label>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:10px">${trialDays ? `同意して無料期間を始める（${trialDays}日後から月額 ${price}）` : `同意して支払いへ進む（月額 ${price}）`}</button>
    </form>
  `);
}

function checkoutResultPage({ user, kind }) {
  if (kind === 'cancel') {
    return wrap('お申込みをキャンセルしました', `${topNav(user)}
      <div class="card"><h2>お支払いは完了していません</h2><p class="small">お申込みの途中でキャンセルされました。料金は請求されていません。</p>
      <a class="btn btn-primary btn-block" href="/service/checkout">申込みをやり直す</a></div>${legalLinks()}`);
  }
  return wrap('お手続き中', `${topNav(user)}
    <div class="card center"><h2 id="t">お支払いを確認しています…</h2>
      <p class="small" id="m">決済が完了すると、自動でご利用いただけるようになります。このまま少しお待ちください。</p>
      <a class="btn btn-primary btn-block hide" id="go" href="/service/app">マイページへ進む</a></div>
    <script>
    (function(){var n=0;function poll(){fetch('/service/api/status',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      if(j.active){document.getElementById('t').textContent='ご契約ありがとうございます';document.getElementById('m').textContent='ご利用の準備ができました。';document.getElementById('go').classList.remove('hide');return;}
      if(++n<40)setTimeout(poll,2000);else{document.getElementById('t').textContent='確認に時間がかかっています';document.getElementById('m').textContent='決済の反映に時間がかかっている可能性があります。しばらくしてから、マイページをご確認ください。お支払いが完了しているのにご利用いただけない場合は、お問い合わせください。';document.getElementById('go').classList.remove('hide');}
    }).catch(function(){if(++n<40)setTimeout(poll,3000)})}poll()})();
    </script>`);
}

const STATUS_LABEL = { test: ['テスト利用中（運営者が付与・料金なし）', 'badge-ok'], active: ['契約中', 'badge-ok'], trialing: ['契約中（お試し）', 'badge-ok'], past_due: ['お支払いの確認が必要', 'badge-ng'], unpaid: ['お支払いの確認が必要', 'badge-ng'], canceled: ['解約済み', 'badge-off'], incomplete: ['お支払い手続き中', 'badge-warn'], incomplete_expired: ['未完了', 'badge-off'], none: ['未契約', 'badge-off'] };
const POST_STATUS = { draft: ['下書き', 'badge-off'], pending: ['予約中', 'badge-warn'], publishing: ['投稿中', 'badge-warn'], posted: ['投稿済み', 'badge-ok'], failed: ['失敗', 'badge-ng'], cancelled: ['取り消し', 'badge-off'] };
// https のURLだけをリンク・画像に使う（SNSから受け取った値を画面に入れるため）
const httpsUrl = (u) => { const s = String(u || ''); try { return new URL(s).protocol === 'https:' ? s : ''; } catch { return ''; } };
// 投稿済みの予約の「Threadsで見る」リンク（保存した投稿へのリンク（permalink）があるときだけ。今は Threads だけが保存する）
function viewOnSnsLink(p, before = '') {
  const href = p.status === 'posted' ? httpsUrl(p.permalink) : '';
  if (!href) return '';
  const label = (registry.get(p.platform) || {}).label || 'SNS';
  return `${before}<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}で見る</a>`;
}
const toLocalInput = (ms) => {
  const d = new Date(ms + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};

// マイページ：上限と、今の利用状況
function usageCard(userId, sub) {
  const st = require('./service-store');
  const nowIso = new Date().toISOString();
  const [mf, mt] = core.jstMonthBounds(nowIso);
  const L = core.LIMITS; const day = aiLib().day(); const av = aiLib().available(); const al = aiLib().limits();
  const rows = [
    ['連携しているSNSアカウント', `${st.SnsAccounts.countForUser(userId)} / ${core.accountLimitFor(userId)}件`],
    ['未投稿の予約', `${st.ScheduledPosts.countPending(userId)} / ${L.maxPending}件`],
    ...(xLive(sub) ? [['今月のXへの投稿（日本時間の暦月・ツリーは1件ずつ）', `${st.ScheduledPosts.countXUnits(userId, mf, mt)} / ${L.xPerMonth}件`]] : []),
    ['同じ日（日本時間）に投稿する予約', `1日${L.maxPerDay}件まで`],
  ];
  const am = aiLib().monthlyLimits();
  const ai3 = (kind, label) => rows.push([`AIの${label}（自動運用を含む）`, `今日 ${st.AiUsage.used(userId, day, kind)} / ${al[kind]}回・今月 ${st.AiUsage.usedMonth(userId, day, kind)} / ${am[kind]}回`]);
  if (av.text) ai3('text', '文章');
  if (av.image) ai3('image', '画像');
  if (av.video) ai3('video', '動画');
  return `<div class="card"><div class="card-title">ご利用の上限と状況</div><table class="t"><colgroup><col style="width:62%"><col></colgroup>${rows.map(([k, v]) => `<tr><th style="white-space:normal;font-weight:600">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table></div>`;
}

// マイページ：AIの自動運用
const MEDIA_LABEL = { none: '文章だけ', image: '文章＋画像', video: '文章＋動画' };
function autoRulesCard({ accounts, activeAccounts, autoRules, csrf, aiAvail, sub }) {
  const aiAuto = require('./ai-auto');
  // TikTokは対象外。YouTubeは動画が必要なため、動画の生成を提供していない間は対象外
  const targets = activeAccounts.filter((a) => a.platform !== 'tiktok' && (a.platform !== 'youtube' || aiAvail.video));
  const hourOpts = (sel, blank) => `${blank ? '<option value="">なし</option>' : ''}${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${h}時</option>`).join('')}`;
  const list = autoRules.map((r) => {
    const acc = accounts.find((a) => a.id === r.account_id);
    const hs = aiAuto.hoursOf(r).map((h) => `${h}時`).join('・');
    const themes = String(r.theme || '').split('\n').map((t) => t.trim()).filter(Boolean);
    return `<div class="acct-row"><span><b>${escapeHtml(acc ? `${(registry.get(acc.platform) || {}).label || acc.platform} ${acc.handle || ''}` : '(解除済み)')}</b> 毎日 ${escapeHtml(hs)} ／ ${escapeHtml(MEDIA_LABEL[aiAuto.mediaOf(r)])} ／ ${r.mode === 'auto' ? 'そのまま投稿' : '下書きに入れる'}
      <br><span class="small">テーマ${themes.length > 1 ? `（${themes.length}つを順番に）` : ''}：${escapeHtml(themes.join(' ／ ').slice(0, 200))}${r.enabled ? '' : '（停止中）'}${r.last_error ? ` ／ 前回のエラー：${escapeHtml(r.last_error)}` : ''}</span></span>
      <span><form class="inline" method="POST" action="/service/app/auto/${escapeHtml(r.id)}/toggle"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">${r.enabled ? '停止' : '再開'}</button></form>
      <form class="inline" method="POST" action="/service/app/auto/${escapeHtml(r.id)}/delete" onsubmit="return confirm('このルールを削除します。')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">削除</button></form></span></div>`;
  }).join('');
  const form = targets.length ? `<form method="POST" action="/service/app/auto" style="margin-top:10px" id="autoForm"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <div class="field"><label class="lbl" for="autoAcc">投稿先</label><select name="account_id" id="autoAcc">${targets.map((a) => `<option value="${escapeHtml(a.id)}" data-platform="${escapeHtml(a.platform)}">${escapeHtml((registry.get(a.platform) || {}).label || a.platform)} ${escapeHtml(a.handle || '')}</option>`).join('')}</select></div>
      <div class="field"><label class="lbl">テーマ（AIへの指示。1行に1つ書くと、回ごとに順番に使います）</label><textarea name="theme" maxlength="2000" required placeholder="例：&#10;30代の働く人向けに、朝の時間の使い方のコツ&#10;経験を商品にするときの最初の一歩&#10;発信を続けるための小さな工夫"></textarea></div>
      <div class="field"><label class="lbl">口調（任意）</label><input type="text" name="tone" maxlength="100" placeholder="例：やさしく丁寧"></div>
      <div class="field"><span class="lbl">作るもの</span><select name="media" id="autoMedia"><option value="none">文章だけ</option>${aiAvail.image ? '<option value="image">文章＋画像</option>' : ''}${aiAvail.video ? '<option value="video">文章＋動画（できるまで数分かかります）</option>' : ''}</select>
        <div class="small">${aiAvail.video ? 'Instagramは画像か動画、YouTubeは動画が必要です。' : 'Instagramは画像が必要です（「文章＋画像」を選んでください）。'}</div></div>
      <div class="field"><span class="lbl">投稿する時刻（日本時間・1日に3回まで）</span><div class="btn-row"><select name="hour1">${hourOpts(9, false)}</select><select name="hour2">${hourOpts(-1, true)}</select><select name="hour3">${hourOpts(-1, true)}</select></div>
        <div class="small">毎日、選んだ時刻を過ぎたあとに1回ずつ作ります。今日の時刻をすでに過ぎている回は、次の時刻から始めます。</div></div>
      <div class="field" id="autoYt" style="display:none"><span class="lbl">YouTubeの設定</span>
        <select name="yt_privacy"><option value="">公開設定を選んでください</option><option value="public">公開</option><option value="unlisted">限定公開</option><option value="private">非公開</option></select>
        <select name="yt_kids"><option value="">子ども向けかどうかを選んでください</option><option value="no">子ども向けではない</option><option value="yes">子ども向け</option></select></div>
      <div class="field"><label class="lbl">運用の方法</label><select name="mode"><option value="draft">下書きに入れる（確認してから投稿・おすすめ）</option><option value="auto">そのまま投稿する（確認なし）</option></select></div>
      <label class="check"><input type="checkbox" name="confirm_auto" value="1"><span>「そのまま投稿する」を選ぶ場合：AIが作った内容を確認せずに投稿されること、その内容の責任を自分で負うことを理解しました</span></label>
      <div class="btn-row" style="margin-top:8px"><button class="btn btn-primary" type="submit">ルールを追加</button></div></form>
      <script>(function(){var a=document.getElementById('autoAcc'),y=document.getElementById('autoYt');function f(){var o=a.options[a.selectedIndex];y.style.display=o&&o.dataset.platform==='youtube'?'block':'none';}a.addEventListener('change',f);f();})();</script>`
    : (() => {
      const autoNames = liveSns(sub).filter((p) => p.id !== 'tiktok' && (p.id !== 'youtube' || aiAvail.video)).map((p) => p.label);
      return autoNames.length ? `<p class="small">自動運用に使えるSNS（${escapeHtml(autoNames.join('・'))}）を先に連携してください。</p>` : '<p class="small">自動運用に使えるSNSは、準備中です。</p>';
    })();
  return `<div class="card" id="autorules"><div class="card-title">AIで自動運用する</div>
      <p class="small">決めた時刻に、AIが投稿文と、必要なら${aiAvail.video ? '画像・動画' : '画像'}を作ります。「下書きに入れる」では、あなたが確認して投稿します。「そのまま投稿する」では、AIが作った内容を確認せずに投稿します。TikTokは、投稿ごとにご本人の確認が必要なため対象外です${aiAvail.video ? '' : '。YouTubeは動画が必要なため、対象外です'}（どちらも「投稿を作る」画面で作って投稿できます）。AIの回数の上限には、自動運用で作る分も含みます。</p>
      ${list}${form}</div>`;
}

// ── マイページ ──
// SNS側の操作（Metaから届いた取り消しの知らせ・削除の求め）や、再連携が必要なまま28日（YOUTUBE_REAUTH_DELETE_DAYS）たったこと（YouTube）で、
// 連携の情報を削除したことの知らせ（lib/meta-deletion.js の Notices。YouTube は lib/sns/scheduler.js）
const REMOVAL_WHY = {
  deletion: (label) => `${label}の側で、本サービスが受け取った情報の削除が求められたため`,
  deauthorize: (label) => `${label}の側で、本サービスへの許可が取り消されたため`,
  expired: (label) => `${label}の連携が「再連携が必要」のまま${YOUTUBE_REAUTH_DELETE_DAYS}日たったため`,
};
function removalNoticesHtml(notices, csrf) {
  return (notices || []).map((n) => {
    const label = escapeHtml((registry.get(n.platform) || {}).label || n.platform);
    const why = (REMOVAL_WHY[n.kind] || REMOVAL_WHY.deauthorize)(label);
    return `<div class="notice warn" style="margin:0 0 14px"><div>${why}、${escapeHtml(core.formatJst(n.created_at))}に、その連携の情報を削除しました（未投稿の予約・下書きと自動運用の設定は取り消し、投稿済みの予約に保存していた投稿のID・リンクも削除しました）。続けて使う場合は、もう一度連携してください。
      <form class="inline" method="POST" action="/service/app/notice/${escapeHtml(n.id)}/dismiss"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">閉じる</button></form></div></div>`;
  }).join('');
}

// マイページ：プランの変更（通常→30件はすぐ。30件→通常は次回の更新日から）
function planChangeHtml({ sub, plan, accounts, agencyOffered, csrf }) {
  if (!sub || !sub.stripe_subscription_id || !['active', 'trialing'].includes(sub.status) || sub.cancel_at_period_end) return '';
  const form = (target, label, confirmText, cls = 'btn') => `<form class="inline" method="POST" action="/service/billing/plan" onsubmit="return confirm('${confirmText}')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="plan" value="${target}"><button class="${cls}" type="submit">${label}</button></form>`;
  if (plan === 'standard') {
    if (!agencyOffered) return '';
    const trialing = sub.status === 'trialing';
    const a = core.LIMITS.maxAccountsAgency; const p = yen(core.priceYen('agency'));
    return `<div class="card-title" style="margin-top:12px">プランの変更</div>
      <p class="small">${escapeHtml(core.PLAN_LABEL.agency)}にすると、連携できるSNSアカウントが${a}件までになります（月額 ${p}・税込）。変更はすぐに反映され、${trialing ? '無料期間中のため日割りはなく、最初の請求から30件プランの月額になります' : '今の契約期間の差額は日割りで計算して、次回の請求に含まれます'}。通常プランに戻すときは、次回の更新日からになります（連携が${core.LIMITS.maxAccounts}件を超えている間は戻せません）。</p>
      <div class="btn-row">${form('agency', '30件プランに変更する', `${core.PLAN_LABEL.agency}（月額 ${p}）にすぐ変更します。${trialing ? '無料期間中のため日割りはなく、最初の請求から30件プランの月額になります' : '日割りの差額が次回の請求に含まれます'}。よろしいですか？`, 'btn btn-primary')}</div>`;
  }
  const n = (accounts || []).length; const std = core.LIMITS.maxAccounts; const sp = yen(core.priceYen('standard'));
  if (sub.pending_plan === 'standard') {
    return `<div class="card-title" style="margin-top:12px">プランの変更</div>
      <p class="small">次回の更新日から、通常プラン（連携${std}件まで・月額 ${sp}）に切り替わります。それまでは30件プランですが、新しく連携できるのは${std}件までです。</p>
      <div class="btn-row">${form('agency', '切り替えの予約を取り消す', '通常プランへの切り替えの予約を取り消します（30件プランのままになります）。よろしいですか？', 'btn btn-ghost')}</div>`;
  }
  return `<div class="card-title" style="margin-top:12px">プランの変更</div>
    <p class="small">通常プラン（連携${std}件まで・月額 ${sp}）に戻すときは、次回の更新日から切り替わります（それまでは30件プランです）。${n > std ? `<b>いま連携しているSNSアカウントが${n}件あるため、${n - std}件以上を解除してから変更してください。</b>` : ''}</p>
    ${n > std ? '' : `<div class="btn-row">${form('standard', '通常プランに変更する（次回の更新日から）', `次回の更新日から通常プラン（月額 ${sp}）に切り替えます。それまでは30件プランです。よろしいですか？`, 'btn btn-ghost')}</div>`}`;
}

// マイページ：紹介カード（紹介機能が働いているときだけ表示する。r は lib/referral.js の infoFor）
function referralCard(r) {
  const st = r.stats;
  return `<div class="card" id="referral"><div class="card-title">友だちを紹介する</div>
    <p><b>${escapeHtml(REFERRAL_HEADLINE)}</b></p>
    <p class="small"><b>${escapeHtml(REFERRAL_CONDITIONS)}（最大${r.max}件まで）。</b></p>
    <p class="small">あなた専用の紹介のURLです。このURLから登録した方は、初めてのお申込みのとき30日間無料になります。登録した方が、無料期間のあとの最初の有料の請求を支払うと、あなたの次回以降の請求から、1か月分の利用料金に相当するクレジットが差し引かれます。</p>
    <p class="small"><code style="word-break:break-all">${escapeHtml(r.url)}</code></p>
    <table class="t kv" style="margin-top:6px">
      <tr><th>紹介のURLから登録した人</th><td>${st.total}人</td></tr>
      <tr><th>特典を付けた</th><td>${st.rewarded}件（上限 ${r.max}件）</td></tr>
    </table>
    <ul class="plain small" style="margin-top:8px">${REFERRAL_RULES.map((t) => `<li>${escapeHtml(t.replace('{limit}', r.max))}。</li>`).join('')}</ul></div>`;
}

function dashboardPage({ user, sub, accounts, posts, csrf, flash, snsReady, portalReady, apiKeys = [], mcpConnections = [], newKey = '', aiAvail = {}, autoRules = [], removalNotices = [], referral = null, agencyOffered = false }) {
  const active = !!sub && ['active', 'trialing', 'test'].includes(sub.status);
  const [stLabel, stClass] = STATUS_LABEL[(sub && sub.status) || 'none'] || STATUS_LABEL.none;
  const accHtml = accounts.length ? accounts.map((a) => {
    const ad = registry.get(a.platform);
    const bad = a.status !== 'active';
    return `<div class="acct-row"><span><b>${escapeHtml(ad ? ad.label : a.platform)}</b> ${escapeHtml(a.handle || '')}
      ${bad ? '<span class="badge-ng">再連携が必要</span>' : ''}${bad && a.platform === 'youtube' ? `<span class="small">（再連携しないまま${YOUTUBE_REAUTH_DELETE_DAYS}日たつと、この連携の情報を削除します）</span>` : ''}</span>
      <span>${bad ? `<a class="btn btn-sm" href="/service/connect/${escapeHtml(a.platform)}">再連携</a> ` : ''}${!bad && active && a.platform === 'threads' ? `<a class="btn btn-sm" href="/service/app/threads/${escapeHtml(a.id)}/recent">最近の投稿</a> ` : ''}
      <form class="inline" method="POST" action="/service/app/account/${escapeHtml(a.id)}/disconnect" onsubmit="return confirm('連携を解除します。未投稿の予約は取り消されます。よろしいですか？')">
        <input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">解除</button></form></span></div>`;
  }).join('') : '<p class="small">まだ連携しているSNSがありません。</p>';
  // 連携ボタンは、審査済み（SNS_APPROVED）のSNSだけ。テスト利用の利用者には、審査前のSNSも「審査前（テスト利用のみ）」と添えて出す
  // （サーバー側でも、core.startConnect で同じ判定をかける）
  const connectBtns = registry.list().map((p) => {
    const mode = snsReady ? core.connectMode(p.id, sub) : '';
    if (!mode) return `<span class="small">${escapeHtml(p.label)}：準備中</span>`;
    return `<a class="btn btn-sm btn-primary" href="/service/connect/${p.id}">${escapeHtml(p.label)}を連携</a>${mode === 'test' ? ' <span class="badge-warn">審査前（テスト利用のみ）</span>' : ''}`;
  }).join(' ');
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  // かんたん投稿では、投稿ごとの設定が必要なYouTubeは選べない（「投稿を作る」画面で設定する）。
  // TikTokのアカウントが2つ以上あるときも、アカウントごとに設定を確かめるため、「投稿を作る」画面から投稿してもらう
  const tiktokCount = activeAccounts.filter((a) => a.platform === 'tiktok').length;
  const quickAccounts = activeAccounts.filter((a) => a.platform !== 'youtube' && !(a.platform === 'tiktok' && tiktokCount > 1));
  const defaultAt = toLocalInput(Date.now() + 60 * 60 * 1000);
  const tiktokAcc = quickAccounts.find((a) => a.platform === 'tiktok');
  const hasTikTok = !!tiktokAcc;
  // 画像・動画が必須のSNS（Instagram・TikTok）のうち、かんたん投稿で選べるものだけ
  const mediaRequired = [['instagram', 'Instagram'], ['tiktok', 'TikTok']].filter(([id]) => quickAccounts.some((a) => a.platform === id)).map(([, label]) => label);
  const compose = active && quickAccounts.length ? `
    <form method="POST" action="/service/app/post" class="card" id="postForm">
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="media_id" id="media_id" value="">
      <div class="card-title">かんたん投稿（1つの画像・動画まで）</div>
      <div class="field"><label class="lbl" for="text">本文（キャプション）</label><textarea id="text" name="text" maxlength="2200" oninput="cnt()"></textarea>
        <div class="small" id="count">0文字</div></div>
      ${aiAvail.text || aiAvail.image ? `<div class="field" style="border:1px dashed #c9bfa6;border-radius:12px;padding:10px"><span class="lbl">AIに作らせる（内容は必ずご自身で確認してから投稿してください）</span>
        <input type="text" id="aiTheme" maxlength="500" placeholder="テーマ・内容（例：朝活のメリットを3つ）">
        <div class="btn-row" style="margin-top:6px">${aiAvail.text ? '<button type="button" class="btn btn-sm" id="aiTextBtn">AIで文章を作る</button>' : ''}${aiAvail.image ? '<button type="button" class="btn btn-sm" id="aiImgBtn">AIで画像を作る</button>' : ''}</div>
        <div class="small" id="aiMsg">1日の生成回数に上限があります。AIが作った画像・動画であることを、SNSの設定で表示する必要がある場合があります。</div></div>` : ''}
      <div class="field"><label class="lbl" for="file">画像・動画${mediaRequired.length ? `（${escapeHtml(mediaRequired.join('・'))}では必須）` : ''}</label>
        <input id="file" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime">
        <div class="small" id="fileStatus">JPEG・PNG（8MBまで）／MP4・MOV（100MBまで）</div>
        <div id="previewBox" style="margin-top:8px"></div></div>
      <div class="field"><span class="lbl">投稿先</span>
        ${quickAccounts.map((a) => `<label class="check"><input type="checkbox" name="account" value="${escapeHtml(a.id)}" data-platform="${escapeHtml(a.platform)}" ${quickAccounts.length === 1 ? 'checked' : ''}><span>${escapeHtml((registry.get(a.platform) || {}).label || a.platform)} ${escapeHtml(a.handle || '')}</span></label>`).join('')}
        ${activeAccounts.some((a) => a.platform === 'youtube') ? '<p class="small">YouTubeへは、公開設定と「子ども向けかどうか」を選ぶ必要があるため、<a href="/service/app/compose">「投稿を作る」</a>から投稿してください。</p>' : ''}
        ${tiktokCount > 1 ? '<p class="small">TikTokのアカウントが2つ以上あるため、TikTokへは、アカウントごとに設定を確かめられる<a href="/service/app/compose">「投稿を作る」</a>から投稿してください。</p>' : ''}</div>
      ${hasTikTok ? `<div class="field" id="tiktokBox" data-account="${escapeHtml(tiktokAcc.id)}" style="display:none;border:1px solid #d9d0bb;border-radius:12px;padding:10px">
        <span class="lbl">TikTokの設定（投稿するアカウント：<b id="ttNick">${escapeHtml(tiktokAcc.handle || 'TikTok')}</b>）</span>
        <label class="lbl" for="tiktok_privacy">公開範囲（必ず選んでください。選べるのは、このアカウントで使えるものだけです）</label>
        <select id="tiktok_privacy" name="tiktok_privacy"><option value="">読み込み中…</option></select>
        <div class="small" id="ttMsg"></div>
        <label class="check"><input type="checkbox" name="tiktok_comment" id="tt_comment" value="1"><span>コメントを許可する</span></label>
        <label class="check"><input type="checkbox" name="tiktok_duet" id="tt_duet" value="1"><span>デュエットを許可する</span></label>
        <label class="check"><input type="checkbox" name="tiktok_stitch" id="tt_stitch" value="1"><span>ステッチを許可する</span></label>
        <label class="check"><input type="checkbox" name="tiktok_commercial_own" value="1"><span>この動画は、自分のブランド・商品・サービスの宣伝を含む</span></label>
        <label class="check"><input type="checkbox" name="tiktok_commercial_paid" id="tt_paid" value="1"><span>この動画は、第三者の商品・ブランドの宣伝（提携・有償）を含む</span></label>
        <p class="small" id="ttPaidNote" style="display:none">提携（有償）の宣伝を投稿するには、公開範囲を「自分のみ」にできません。投稿することで、<a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener">TikTokのブランドコンテンツのポリシー</a>と音楽使用の確認に同意したものとみなされます。</p>
        <p class="small">投稿することで、<a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">TikTokの音楽使用の確認</a>に同意したものとみなされます。${process.env.TIKTOK_AUDITED === 'true' ? '' : `このサービスがTikTokの投稿の監査（Audit）を通るまでは、${TT_PRE_AUDIT}です。`}</p></div>` : ''}
      <div class="field"><label class="lbl" for="at">投稿日時（日本時間）</label><input id="at" type="datetime-local" name="at" value="${defaultAt}" required></div>
      <div class="btn-row"><button class="btn btn-primary" type="submit" name="mode" value="schedule">予約する</button>
        <button class="btn btn-ghost" type="submit" name="mode" value="now" onclick="return confirm('今すぐ投稿します。よろしいですか？')">今すぐ投稿</button></div>
      <p class="small">文字数の上限：${quickLimitText(sub)}。かんたん投稿の入力欄は2,200文字までです（SNSごとの上限のほうが短い場合は、その上限まで）。上の文字数は目安です（絵文字などの数え方は、SNSごとに異なります）。</p>
    </form>
    <script>
    function cnt(){var t=document.getElementById('text').value;document.getElementById('count').textContent=Array.from(t).length+'文字';}
    (function(){
      var f=document.getElementById('file'),st=document.getElementById('fileStatus'),mid=document.getElementById('media_id');
      var csrf=${JSON.stringify(csrf)};
      f.addEventListener('change',function(){
        mid.value='';var file=f.files[0];var pv=document.getElementById('previewBox');pv.innerHTML='';if(!file){st.textContent='';return;}
        var obj=URL.createObjectURL(file);var el=document.createElement(file.type.indexOf('video')===0?'video':'img');el.src=obj;el.style.maxWidth='100%';el.style.maxHeight='220px';el.style.borderRadius='10px';if(el.tagName==='VIDEO'){el.controls=true;el.muted=true;}pv.appendChild(el);
        st.textContent='アップロード中…（'+Math.round(file.size/1048576*10)/10+'MB）';
        fetch('/service/app/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-CSRF':csrf},body:file})
          .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
          .then(function(x){if(x.ok){mid.value=x.j.id;st.textContent='添付しました：'+(x.j.kind==='video'?'動画':'画像')+'（'+Math.round(x.j.size/1048576*10)/10+'MB）';}else{st.textContent=x.j.error||'アップロードに失敗しました。';f.value='';}})
          .catch(function(){st.textContent='アップロードに失敗しました。';f.value='';});
      });
      function aiCall(kind,payload){var m=document.getElementById('aiMsg');m.textContent='生成中…（しばらくお待ちください）';
        return fetch('/service/app/ai/'+kind,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF':csrf},body:JSON.stringify(payload)})
          .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'生成に失敗しました。');return j;});}).catch(function(e){m.textContent=e.message;throw e;});}
      var tb=document.getElementById('aiTextBtn');if(tb)tb.addEventListener('click',function(){var th=document.getElementById('aiTheme').value;
        var pl=document.querySelector('input[name=account]:checked');
        aiCall('text',{theme:th,platform:pl?pl.dataset.platform:''}).then(function(j){document.getElementById('text').value=j.text;cnt();document.getElementById('aiMsg').textContent='文章を入れました。内容をご確認のうえ、必要なら直してください。';}).catch(function(){});});
      var ib=document.getElementById('aiImgBtn');if(ib)ib.addEventListener('click',function(){var th=document.getElementById('aiTheme').value;
        aiCall('image',{prompt:th}).then(function(j){mid.value=j.id;var pv=document.getElementById('previewBox');pv.innerHTML='';var el=document.createElement('img');el.src=j.url;el.style.maxWidth='100%';el.style.maxHeight='220px';el.style.borderRadius='10px';pv.appendChild(el);st.textContent='AIが作った画像を添付しました。';document.getElementById('aiMsg').textContent='画像を添付しました。内容をご確認ください。';}).catch(function(){});});
      var box=document.getElementById('tiktokBox');
      var LABELS={PUBLIC_TO_EVERYONE:'全員に公開',MUTUAL_FOLLOW_FRIENDS:'相互フォローの友達',FOLLOWER_OF_CREATOR:'フォロワー',SELF_ONLY:'自分のみ'};var loaded=false;
      function loadTT(){if(loaded||!box)return;loaded=true;var sel=document.getElementById('tiktok_privacy'),msg=document.getElementById('ttMsg');
        fetch('/service/app/tiktok/creator-info?account='+encodeURIComponent(box.dataset.account),{credentials:'same-origin'}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){
          if(!x.ok){sel.textContent='';var e1=document.createElement('option');e1.value='';e1.textContent='取得できませんでした';sel.appendChild(e1);msg.textContent=x.j.error||'';loaded=false;return;}
          var o=x.j.privacyLevelOptions||[];sel.textContent='';var ph=document.createElement('option');ph.value='';ph.textContent='選択してください';sel.appendChild(ph);
          o.forEach(function(v){var op=document.createElement('option');op.value=v;op.textContent=LABELS[v]||v;sel.appendChild(op);});
          applyPaid();
          if(x.j.nickname)document.getElementById('ttNick').textContent=x.j.nickname;
          [['tt_comment',x.j.commentDisabled],['tt_duet',x.j.duetDisabled],['tt_stitch',x.j.stitchDisabled]].forEach(function(p){var c=document.getElementById(p[0]);if(p[1]){c.checked=false;c.disabled=true;c.parentNode.querySelector('span').textContent+='（このアカウントでは許可できません）';}});
          msg.textContent=(x.j.audited?'':'このサービスがTikTokの投稿の監査（Audit）を通るまでは、公開範囲は「自分のみ」だけを選べます（投稿するアカウントも非公開にしておく必要があります）。')+(x.j.maxVideoPostDurationSec?'投稿できる動画の長さは、最大'+x.j.maxVideoPostDurationSec+'秒です。':'');
        }).catch(function(){sel.textContent='';var e2=document.createElement('option');e2.value='';e2.textContent='取得できませんでした';sel.appendChild(e2);loaded=false;});}
      function applyPaid(){var paid=document.getElementById('tt_paid');if(!paid)return;var sel=document.getElementById('tiktok_privacy'),note=document.getElementById('ttPaidNote');note.style.display=paid.checked?'block':'none';
        Array.prototype.forEach.call(sel.options,function(op){if(op.value==='SELF_ONLY'){op.disabled=paid.checked;if(paid.checked&&sel.value==='SELF_ONLY')sel.value='';}});}
      (function(){var paid=document.getElementById('tt_paid');if(paid)paid.addEventListener('change',applyPaid);})();
      function tt(){if(!box)return;var on=document.querySelector('input[name=account][data-platform=tiktok]:checked');box.style.display=on?'block':'none';if(on)loadTT();}
      document.querySelectorAll('input[name=account]').forEach(function(c){c.addEventListener('change',tt)});tt();
    })();
    </script>` : '';
  const postRows = posts.length ? posts.map((p) => {
    const [l, c] = POST_STATUS[p.status] || [p.status, 'badge-off'];
    const ad = registry.get(p.platform);
    return `<tr><td style="white-space:nowrap">${escapeHtml(core.formatJstShort(p.scheduled_at))}</td><td style="white-space:nowrap">${escapeHtml(ad ? ad.label : '')}<br><span class="small">${escapeHtml(p.handle || '')}</span></td>
      <td>${p.media_id ? '<span class="badge-off">添付あり</span> ' : ''}${escapeHtml(p.text.length > 60 ? `${p.text.slice(0, 60)}…` : p.text)}${p.last_error ? `<br><span class="small">${escapeHtml(p.last_error)}</span>` : ''}</td>
      <td><span class="${c}">${l}</span>${viewOnSnsLink(p, '<br>')}${p.status === 'pending' ? `<br><form class="inline" method="POST" action="/service/app/post/${escapeHtml(p.id)}/cancel"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">取り消し</button></form>` : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="small">予約はまだありません。</td></tr>';
  const renewal = sub && sub.current_period_end ? core.formatJst(sub.current_period_end) : '';
  const plan = core.planOf(sub);
  const planPrice = yen(core.priceYen(plan));
  const planChange = planChangeHtml({ sub, plan, accounts, agencyOffered, csrf });
  const billing = sub && sub.status === 'test' ? `<div class="card"><div class="card-title">ご利用の状態</div><p class="small">状態：<span class="${stClass}">${stLabel}</span><br>運営者が動作確認のために付与したテスト利用です。料金はかかりません。運営者が取り消すと、SNSの連携とAIアシスタントとの接続が解除され、APIキーが無効になり、未投稿の予約・下書きが取り消されます。</p></div>` : sub && sub.stripe_subscription_id ? `
    <div class="card"><div class="card-title">ご契約・お支払い</div>
      <p class="small">状態：<span class="${stClass}">${stLabel}</span>
      ${renewal ? `<br>${sub.status === 'trialing'
        ? (sub.cancel_at_period_end ? `解約手続き済み。無料期間の終了日時 <b>${escapeHtml(renewal)}</b> まで、ご利用いただけます（料金はかかりません）。` : `無料期間の終了日時：<b>${escapeHtml(renewal)}</b>（この日時に、初回の${planPrice}を請求します。料金をかけずにやめる場合は、この日時より前に解約してください）`)
        : (sub.cancel_at_period_end ? `解約手続き済み。<b>${escapeHtml(renewal)}</b> までご利用いただけます（以降は更新されません）。` : `次回の更新日：<b>${escapeHtml(renewal)}</b>（${planPrice}${sub.pending_plan === 'standard' ? `。この日から通常プランの${yen(core.priceYen('standard'))}に切り替わります` : ''}）`)}` : ''}
      <br>プラン：<b>${escapeHtml(core.PLAN_LABEL[plan])}</b>（連携できるSNSアカウントは${core.accountLimitFor(user.id)}件まで・月額 ${planPrice}）${sub.pending_plan === 'standard' ? '<br>次回の更新日から、通常プランに切り替わります（予約中）。' : ''}</p>
      ${planChange}
      <div class="btn-row">
        ${sub.status === 'canceled' ? '<a class="btn btn-primary" href="/service/checkout">再度申し込む</a>' : sub.cancel_at_period_end
          ? `<form class="inline" method="POST" action="/service/billing/resume"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-primary" type="submit">解約を取り消す</button></form>`
          : `<form class="inline" method="POST" action="/service/billing/cancel" onsubmit="return confirm('${sub.status === 'trialing' ? '解約すると、無料期間の終了後に有料の契約へ切り替わりません（料金はかかりません）。無料期間の終了日時まではご利用いただけます。解約しますか？' : '解約すると、次回の更新が止まります。契約期間の終わりまではご利用いただけます。解約しますか？'}')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-ghost" type="submit">解約する</button></form>`}
        ${portalReady ? '<a class="btn btn-ghost" href="/service/billing/portal">支払い方法の変更・請求書</a>' : ''}
      </div></div>` : '';
  const notActive = !active ? `<div class="notice"><div>${!sub || sub.status === 'none' || sub.status === 'canceled' ? 'ご契約が有効ではありません。' : 'お支払いの確認が必要です。'}
      ${!sub || ['none', 'canceled', 'incomplete_expired'].includes(sub.status) ? '<a href="/service/checkout">お申込みはこちら</a>' : '<a href="/service/billing/portal">お支払い方法をご確認ください</a>'}</div></div>` : '';
  return wrap('マイページ', `
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">My Page</div><h1>マイページ</h1></header>
    ${flash ? `<div class="notice ${flash.type === 'error' ? 'error' : ''}" style="margin:0 0 14px"><div>${escapeHtml(flash.text)}</div></div>` : ''}
    ${notActive}
    ${billing}
    ${active ? usageCard(user.id, sub) : ''}
    ${removalNoticesHtml(removalNotices, csrf)}
    ${active && referral ? referralCard(referral) : ''}
    <div class="card"><div class="card-title">連携しているSNS</div>${accHtml}
      <div class="btn-row" style="margin-top:10px">${active ? connectBtns : '<span class="small">ご契約後に連携できます。</span>'}</div></div>
    ${active ? `<div class="card"><div class="card-title">投稿の作成と管理</div><p class="small">ツリー（連投）・複数の画像・SNSごとの本文・下書きは「投稿を作る」から。予約の一覧はカレンダーで確認できます。</p>
      <div class="btn-row"><a class="btn btn-primary" href="/service/app/compose">投稿を作る</a><a class="btn" href="/service/app/calendar">カレンダー・下書き</a></div></div>` : ''}
    ${compose}
    ${active && aiAvail.text ? autoRulesCard({ accounts, activeAccounts, autoRules, csrf, aiAvail, sub }) : ''}
    ${active && !aiAvail.text ? '<div class="card"><div class="card-title">AIで投稿を作る</div><p class="small">「投稿を作る」画面の「ご自身のAIで作る」から、投稿先の条件を入れた指示文をコピーして、ChatGPT・Claude・Gemini を開けます（自動で入力されない場合は、貼り付けて送信します）。できた文章や画像を貼り付けて、予約・投稿してください。AIアシスタント（MCP対応）から、このツールを操作して投稿することもできます（下の「AIアシスタントとの接続」）。</p><div class="btn-row"><a class="btn btn-sm btn-primary" href="/service/app/compose">投稿を作る</a></div></div>' : ''}
    ${active ? `<div class="card" id="apikeys"><div class="card-title">APIキー（外部のツール・AIから投稿するとき）</div>
      ${newKey ? `<div class="notice"><div>新しいAPIキーです。<b>この画面を閉じると二度と表示されません</b>。安全な場所に保存してください。<br><code style="word-break:break-all">${escapeHtml(newKey)}</code></div></div>` : ''}
      ${apiKeys.length ? apiKeys.map((k) => `<div class="acct-row"><span><b>${escapeHtml(k.label || '(名前なし)')}</b> <code>${escapeHtml(k.prefix)}…</code> <span class="small">${k.last_used_at ? `最終利用 ${escapeHtml(k.last_used_at.slice(0, 10))}` : '未使用'}</span></span>
        <form class="inline" method="POST" action="/service/app/apikey/${escapeHtml(k.id)}/revoke" onsubmit="return confirm('このAPIキーを無効にします。よろしいですか？')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">無効にする</button></form></div>`).join('') : '<p class="small">APIキーはまだありません。</p>'}
      <p class="small"><b>APIキーを持っている人は、誰でも、あなたのアカウントで投稿できます。</b>他の人に教えたり、公開の場所に貼ったりしないでください。漏れたおそれがあるときは、すぐに「無効にする」を押してください。</p>
      <form method="POST" action="/service/app/apikey" class="btn-row" style="margin-top:10px"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
        <input type="text" name="label" maxlength="40" placeholder="名前（例：AIアシスタント用）" style="max-width:260px"><button class="btn btn-sm btn-primary" type="submit">APIキーを発行</button></form>
      <div class="card-title" style="margin-top:14px">AIアシスタントとの接続（MCP）</div>
      <p class="small">MCP（AIアシスタントとつなぐための共通の仕組み）に対応したアプリに、接続先URL <code>${escapeHtml((process.env.SERVICE_BASE_URL || '').replace(/\/+$/, ''))}/mcp</code> を追加すると、ログインと許可だけで接続できます（APIキーは不要）。</p>
      ${mcpConnections.length ? mcpConnections.map((c) => `<div class="acct-row"><span><b>${escapeHtml(c.name)}</b> <span class="small">最終接続 ${escapeHtml(String(c.last_at || '').slice(0, 10))}</span></span>
        <form class="inline" method="POST" action="/service/app/connection/${escapeHtml(c.id)}/revoke" onsubmit="return confirm('このアプリの接続を解除します。')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="btn btn-sm btn-ghost" type="submit">解除</button></form></div>`).join('') : '<p class="small">接続中のアプリはありません。</p>'}
      <p class="small">使い方：<code>Authorization: Bearer &lt;APIキー&gt;</code> を付けて <code>/api/v1/…</code> を呼びます（<a href="/service/docs/api">APIの説明</a>）。キーは、あなたのアカウントに連携したSNSにだけ投稿できます。</p></div>` : ''}
    <div class="card"><div class="card-title">予約と投稿の履歴</div>
      <div class="hist"><table class="t"><tr><th>日時</th><th>SNS</th><th>本文</th><th>状態</th></tr>${postRows}</table></div></div>
    ${legalLinks()}
  `);
}

// ── 投稿の作成（ツリー・複数画像・SNSごとの本文・下書き）──
const PLATFORM_LIMITS = {
  threads: { text: 500, media: '画像・動画は任意（20件までのカルーセル。動画は5分まで）。ツリー可。絵文字はバイト数で数えます' },
  x: { text: 280, media: '画像4枚または動画1本は任意。ツリー可。日本語は1文字を2として計算' },
  instagram: { text: 2200, media: '画像（JPEG・10件まで。縦横比4:5〜1.91:1）またはリール動画が必須' },
  tiktok: { text: 2200, media: '動画1本、または写真（JPEG・35枚まで）が必須' },
  facebook: { text: 63206, media: '画像10枚まで、または動画1本は任意' },
  youtube: { text: 5000, media: '動画1本が必須（本文の1行目がタイトル。説明はバイト数で数え、日本語は1文字3バイト）' },
};

function composePage({ user, accounts, csrf, aiAvail = {}, draft = null, sub = null }) {
  const act = accounts.filter((a) => a.status === 'active');
  const labelOf = (a) => `${(registry.get(a.platform) || {}).label || a.platform} ${a.handle || ''}`;
  const accJson = JSON.stringify(act.map((a) => ({ id: a.id, platform: a.platform, label: labelOf(a), limit: (PLATFORM_LIMITS[a.platform] || {}).text || 2200, rule: (PLATFORM_LIMITS[a.platform] || {}).media || '' }))).replace(/</g, '\\u003c');
  const defaultAt = toLocalInput(Date.now() + 60 * 60 * 1000);
  return wrap('投稿を作る', `
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">Compose</div><h1>投稿を作る</h1>
      <p class="small"><a href="/service/app">マイページ</a> ／ <a href="/service/app/calendar">カレンダー・下書き</a></p></header>
    ${draft ? `<div class="notice"><div>下書きを読み込みました。内容${act.some((a) => a.platform === 'tiktok' && a.id === draft.accountId) ? 'と、TikTokの公開範囲などの設定（選び直してください）' : ''}を確かめてから保存してください。保存すると、元の下書きは削除されます。</div></div>` : ''}
    ${act.length ? `<div class="card" id="composer">
      <div class="field"><span class="lbl">投稿の種類</span><div class="btn-row" id="cats">
        <label class="check"><input type="radio" name="cat" value="text" checked><span>テキスト</span></label>
        <label class="check"><input type="radio" name="cat" value="image"><span>画像</span></label>
        <label class="check"><input type="radio" name="cat" value="video"><span>動画</span></label>
        ${treeLive(sub) ? '<label class="check"><input type="radio" name="cat" value="tree"><span>ツリー（連投）</span></label>' : ''}</div></div>
      <div class="field"><span class="lbl">投稿先</span><div id="accs"></div></div>
      <div class="field" style="border:1px dashed #c9bfa6;border-radius:12px;padding:10px"><span class="lbl">AIに作らせる（内容は必ずご自身で確認してください）</span>
        <input type="text" id="aiTheme" maxlength="500" placeholder="テーマ・内容（例：朝活のメリットを3つ）">
        <div class="small" style="margin-top:8px"><b>ご自身のAIで作る</b>（ChatGPT・Claude・Gemini を開きます。各AIのご利用条件・料金は、それぞれのサービスに従います）</div>
        <div class="btn-row" style="margin-top:4px">
          <button type="button" class="btn btn-sm" data-own-ai="chatgpt" data-kind="text">ChatGPTで文章</button>
          <button type="button" class="btn btn-sm" data-own-ai="claude" data-kind="text">Claudeで文章</button>
          <button type="button" class="btn btn-sm" data-own-ai="gemini" data-kind="text">Geminiで文章</button>
          <button type="button" class="btn btn-sm btn-ghost" data-own-ai="chatgpt" data-kind="image">ChatGPTで画像</button>
          <button type="button" class="btn btn-sm btn-ghost" data-own-ai="gemini" data-kind="image">Geminiで画像</button>
        </div>
        <div class="small">指示文（投稿先のSNSの文字数などの条件つき）をコピーしてから開きます。自動で入力されない場合は、貼り付けて送信してください。できた文章は下の「本文」に貼り付け、画像は保存して「画像・動画」から添付します。このサービスでは、ご自身のAIで作った画像・動画に、AI生成の表示を付けません。必要な場合は、SNSのアプリから表示を付けて投稿してください。</div>
        ${aiAvail.text || aiAvail.image || aiAvail.video ? `<div class="small" style="margin-top:8px"><b>このツールのAIで作る</b>（1日・1か月の回数に上限があります）</div>
        <div class="btn-row" style="margin-top:4px">${aiAvail.text ? '<button type="button" class="btn btn-sm" id="aiTextBtn">AIで文章を作る</button>' : ''}${aiAvail.image ? '<button type="button" class="btn btn-sm" id="aiImgBtn">AIで画像を作る</button>' : ''}${aiAvail.video ? '<button type="button" class="btn btn-sm" id="aiVidBtn">AIで動画を作る</button>' : ''}</div>` : ''}
        <div class="small" id="aiMsg"></div></div>
      <div class="field"><label class="lbl" for="mainText">本文</label><textarea id="mainText" maxlength="63206"></textarea><div class="small" id="mainCount"></div></div>
      <label class="check"><input type="checkbox" id="perTarget"><span>SNSごとに本文を変える</span></label>
      <div id="perBox"></div>
      <div class="field" id="mediaField" style="display:none"><span class="lbl">画像・動画</span>
        <input type="file" id="mediaFile" multiple accept="image/jpeg,image/png,video/mp4,video/quicktime">
        <div class="small">JPEG・PNG（8MBまで）／MP4・MOV（100MBまで）。選んだ順に並びます。</div>
        <div id="mediaList" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div></div>
      ${treeLive(sub) ? `<div class="field" id="treeField" style="display:none"><span class="lbl">ツリーの2件目以降（${escapeHtml(treeLive(sub))}だけ。1件目は上の本文です）</span>
        <div id="treeList"></div><button type="button" class="btn btn-sm" id="addCard">＋ 投稿を追加</button></div>` : ''}
      <div class="field" id="ttField" style="display:none;border:1px solid #d9d0bb;border-radius:12px;padding:10px">
        <span class="lbl">TikTokの設定（<b id="ttNick">TikTok</b>）</span>
        <label class="lbl" for="ttPrivacy">公開範囲（必ず選んでください）</label><select id="ttPrivacy"><option value="">読み込み中…</option></select>
        <div class="small" id="ttMsg"></div>
        <label class="check"><input type="checkbox" id="ttComment"><span>コメントを許可する</span></label>
        <label class="check"><input type="checkbox" id="ttDuet"><span>デュエットを許可する（動画のみ）</span></label>
        <label class="check"><input type="checkbox" id="ttStitch"><span>ステッチを許可する（動画のみ）</span></label>
        <label class="check"><input type="checkbox" id="ttOwn"><span>自分のブランド・商品・サービスの宣伝を含む</span></label>
        <label class="check"><input type="checkbox" id="ttPaid"><span>第三者の商品・ブランドの宣伝（提携・有償）を含む（公開範囲を「自分のみ」にできません）</span></label>
        <label class="check"><input type="checkbox" id="ttMusic"><span>写真の投稿に、TikTokが音楽を自動で付ける（写真の投稿のときだけ）</span></label>
        <p class="small">投稿することで、<a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">TikTokの音楽使用の確認</a>${''}に同意したものとみなされます。提携（有償）の宣伝を含む場合は、<a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener">ブランドコンテンツのポリシー</a>にも同意したものとみなされます。</p></div>
      <div class="field" id="ytField" style="display:none"><label class="lbl" for="ytPrivacy">YouTubeの公開設定</label>
        <select id="ytPrivacy"><option value="">選択してください</option><option value="public">公開</option><option value="unlisted">限定公開</option><option value="private">非公開</option></select>
        <label class="lbl" for="ytKids">子ども向けの動画ですか（YouTubeで申告が必要です）</label>
        <select id="ytKids"><option value="">選択してください</option><option value="no">いいえ、子ども向けではない</option><option value="yes">はい、子ども向け</option></select>
        <p class="small">本文の1行目（100文字まで）がタイトルになり、収まる場合は「 #Shorts」を付けます。説明（本文全体）は5,000バイト（日本語でおよそ1,600文字）までです。半角の「&lt;」「&gt;」は、全角の「＜」「＞」に置き換えて送ります。動画は3分以内にしてください。YouTubeの監査が終わるまでは、公開を選んでも「非公開」に制限される場合があります。</p></div>
      <div class="field"><span class="lbl">いつ投稿するか</span>
        <label class="check"><input type="radio" name="when" value="schedule" checked><span>日時を指定して予約</span></label>
        <input id="at" type="datetime-local" value="${defaultAt}" style="max-width:260px">
        <label class="check"><input type="radio" name="when" value="now"><span>今すぐ投稿</span></label>
        <label class="check"><input type="radio" name="when" value="draft"><span>下書きに保存（あとで予約）</span></label></div>
      <div class="btn-row"><button class="btn btn-primary" type="button" id="submitBtn">保存する</button></div>
      <div class="notice" id="result" style="display:none;margin-top:12px"><div id="resultText"></div></div>
    </div>
    <script>
    (function(){
      var ACC=${accJson}, csrf=${JSON.stringify(csrf)}, media=[], cards=[], DRAFT=${JSON.stringify(draft).replace(/</g, '\\u003c')};
      function $(id){return document.getElementById(id);}
      function el(t,attrs,txt){var e=document.createElement(t);for(var k in (attrs||{}))e.setAttribute(k,attrs[k]);if(txt!=null)e.textContent=txt;return e;}
      function cat(){return document.querySelector('input[name=cat]:checked').value;}
      function sel(){return ACC.filter(function(a){var c=document.querySelector('input[data-acc="'+a.id+'"]');return c&&c.checked;});}
      var accs=$('accs');ACC.forEach(function(a){var l=el('label',{'class':'check'});var c=el('input',{type:'checkbox','data-acc':a.id});if(ACC.length===1)c.checked=true;l.appendChild(c);var sp=el('span');sp.appendChild(document.createTextNode(a.label));sp.appendChild(el('br'));sp.appendChild(el('span',{'class':'small'},a.rule));l.appendChild(sp);accs.appendChild(l);c.addEventListener('change',refresh);});
      // Threadsの数え方（サーバーと同じ）：絵文字はUTF-8のバイト数、それ以外は1文字を1
      var SEG=(window.Intl&&Intl.Segmenter)?new Intl.Segmenter('ja',{granularity:'grapheme'}):null,EMO=null;
      try{EMO=new RegExp('\\\\p{RGI_Emoji}','v');}catch(e){try{EMO=new RegExp('\\\\p{Extended_Pictographic}|\\\\p{Regional_Indicator}|\\u20E3','u');}catch(e2){EMO=null;}}
      var EP=null;try{EP=new RegExp('\\\\p{Extended_Pictographic}','u');}catch(e){EP=null;}
      function thLen(t){if(!SEG||!EMO)return Array.from(t).length;var n=0;Array.from(SEG.segment(t)).forEach(function(s){var g=s.segment;n+=(EMO.test(g)||(EP&&EP.test(g)))?new TextEncoder().encode(g).length:1;});return n;}
      function len(t,p){if(p==='threads')return thLen(t);if(p==='youtube')return new TextEncoder().encode(t.replace(/[<>]/g,'＜')).length;if(p!=='x')return Array.from(t).length;var n=0;t=t.replace(/https?:\\/\\/\\S+/g,function(){n+=23;return '';});Array.from(t).forEach(function(ch){var c=ch.codePointAt(0);n+=((c>=0x1100&&c<=0x11ff)||(c>=0x2e80&&c<=0xa4cf)||(c>=0xac00&&c<=0xd7a3)||(c>=0xf900&&c<=0xfaff)||(c>=0xff00&&c<=0xff60)||(c>=0x1f300&&c<=0x1faff))?2:1;});return n;}
      function counts(){var t=$('mainText').value;var s=sel();$('mainCount').textContent=s.length?s.map(function(a){var n=len(t,a.platform);return a.label.split(' ')[0]+' '+n+'/'+a.limit+(n>a.limit?'（超過）':'');}).join('　'):Array.from(t).length+'文字';}
      $('mainText').addEventListener('input',counts);
      function refresh(){var c=cat();$('mediaField').style.display=(c==='image'||c==='video'||c==='tree')?'block':'none';if($('treeField'))$('treeField').style.display=c==='tree'?'block':'none';
        var s=sel();$('ttField').style.display=s.some(function(a){return a.platform==='tiktok';})?'block':'none';$('ytField').style.display=s.some(function(a){return a.platform==='youtube';})?'block':'none';
        if(s.some(function(a){return a.platform==='tiktok';}))loadTT();perBox();counts();}
      document.querySelectorAll('input[name=cat]').forEach(function(r){r.addEventListener('change',refresh);});
      $('perTarget').addEventListener('change',perBox);
      function perBox(){var box=$('perBox');var on=$('perTarget').checked;var keep={};box.querySelectorAll('textarea').forEach(function(t){keep[t.dataset.acc]=t.value;});box.textContent='';if(!on)return;
        sel().forEach(function(a){var f=el('div',{'class':'field'});f.appendChild(el('label',{'class':'lbl'},a.label+' の本文'));var t=el('textarea',{'data-acc':a.id});t.value=keep[a.id]!=null?keep[a.id]:$('mainText').value;f.appendChild(t);box.appendChild(f);});}
      function upload(file,done){return fetch('/service/app/media',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-CSRF':csrf},body:file}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'アップロードに失敗しました。');return j;});});}
      function thumb(item,onRemove){var w=el('div',{style:'position:relative;width:96px'});var src=item.url||'';var m=item.kind==='video'?el('video',{muted:'',style:'width:96px;height:96px;object-fit:cover;border-radius:8px;background:#ddd'}):el('img',{style:'width:96px;height:96px;object-fit:cover;border-radius:8px;background:#ddd',alt:''});if(src)m.src=src;w.appendChild(m);var b=el('button',{type:'button','class':'btn btn-sm btn-ghost',style:'position:absolute;top:2px;right:2px;padding:0 6px'},'×');b.addEventListener('click',onRemove);w.appendChild(b);return w;}
      function drawMedia(){var l=$('mediaList');l.textContent='';media.forEach(function(it,i){l.appendChild(thumb(it,function(){media.splice(i,1);drawMedia();}));});}
      $('mediaFile').addEventListener('change',function(){var files=Array.from(this.files);this.value='';var chain=Promise.resolve();files.forEach(function(f){chain=chain.then(function(){return upload(f).then(function(j){media.push({id:j.id,kind:j.kind,url:URL.createObjectURL(f)});drawMedia();});});});chain.catch(function(e){alert(e.message);});});
      function drawCards(){var l=$('treeList');if(!l)return;l.textContent='';cards.forEach(function(c,i){var f=el('div',{'class':'field',style:'border-left:3px solid #c9bfa6;padding-left:10px'});f.appendChild(el('span',{'class':'lbl'},(i+2)+'件目'));var t=el('textarea');t.value=c.text;t.addEventListener('input',function(){c.text=t.value;});f.appendChild(t);
        var row=el('div',{'class':'btn-row'});var fi=el('input',{type:'file',accept:'image/jpeg,image/png,video/mp4,video/quicktime'});fi.addEventListener('change',function(){var file=fi.files[0];if(!file)return;upload(file).then(function(j){c.media=[{id:j.id,kind:j.kind,url:URL.createObjectURL(file)}];drawCards();}).catch(function(e){alert(e.message);});});row.appendChild(fi);
        var rm=el('button',{type:'button','class':'btn btn-sm btn-ghost'},'削除');rm.addEventListener('click',function(){cards.splice(i,1);drawCards();});row.appendChild(rm);f.appendChild(row);
        var ml=el('div',{style:'display:flex;gap:8px;margin-top:6px'});(c.media||[]).forEach(function(it){ml.appendChild(thumb(it,function(){c.media=[];drawCards();}));});f.appendChild(ml);l.appendChild(f);});}
      if($('addCard'))$('addCard').addEventListener('click',function(){if(cards.length>=24)return alert('ツリーは25件までです。');cards.push({text:'',media:[]});drawCards();});
      // TikTokの設定欄は、選ばれているTikTokのアカウント（下書きを開いたときは、その下書きのアカウント）の情報で埋める。選び直したら取り直す
      var ttFor=null,LABELS={PUBLIC_TO_EVERYONE:'全員に公開',MUTUAL_FOLLOW_FRIENDS:'相互フォローの友達',FOLLOWER_OF_CREATOR:'フォロワー',SELF_ONLY:'自分のみ'};
      function loadTT(){var a=sel().filter(function(x){return x.platform==='tiktok';})[0];if(!a||ttFor===a.id)return;ttFor=a.id;var s=$('ttPrivacy');
        s.textContent='';s.appendChild(el('option',{value:''},'読み込み中…'));$('ttNick').textContent='TikTok';$('ttMsg').textContent='';['ttComment','ttDuet','ttStitch'].forEach(function(id){$(id).disabled=false;$(id).checked=false;});
        fetch('/service/app/tiktok/creator-info?account='+encodeURIComponent(a.id),{credentials:'same-origin'}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error);return j;});}).then(function(j){if(ttFor!==a.id)return;s.textContent='';s.appendChild(el('option',{value:''},'選択してください'));(j.privacyLevelOptions||[]).forEach(function(v){s.appendChild(el('option',{value:v},LABELS[v]||v));});applyPaid();if(j.nickname)$('ttNick').textContent=j.nickname;
          [['ttComment',j.commentDisabled],['ttDuet',j.duetDisabled],['ttStitch',j.stitchDisabled]].forEach(function(p){if(p[1]){$(p[0]).checked=false;$(p[0]).disabled=true;}});$('ttMsg').textContent=(j.audited?'':'このサービスがTikTokの投稿の監査（Audit）を通るまでは、公開範囲は「自分のみ」だけを選べます（投稿するアカウントも非公開にしておく必要があります）。')+(j.maxVideoPostDurationSec?'動画は最大'+j.maxVideoPostDurationSec+'秒です。':'');})
          .catch(function(e){if(ttFor!==a.id)return;ttFor=null;s.textContent='';s.appendChild(el('option',{value:''},'取得できませんでした'));$('ttMsg').textContent=e.message||'';});}
      // 第三者の宣伝（有償）を含むときは、「自分のみ」を選べなくする（選択肢を取り直したときも、もう一度反映する）
      function applyPaid(){var s=$('ttPrivacy');Array.prototype.forEach.call(s.options,function(o){if(o.value==='SELF_ONLY'){o.disabled=$('ttPaid').checked;if($('ttPaid').checked&&s.value==='SELF_ONLY')s.value='';}});}
      $('ttPaid').addEventListener('change',applyPaid);
      function aiCall(kind,payload){$('aiMsg').textContent='生成中…';return fetch('/service/app/ai/'+kind,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF':csrf},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'生成に失敗しました。');return j;});}).catch(function(e){$('aiMsg').textContent=e.message;throw e;});}
      if($('aiTextBtn'))$('aiTextBtn').addEventListener('click',function(){var s=sel();aiCall('text',{theme:$('aiTheme').value,platform:s.length?s[0].platform:''}).then(function(j){$('mainText').value=j.text;counts();perBox();$('aiMsg').textContent='文章を入れました。内容をご確認ください。';}).catch(function(){});});
      // ご自身のAIで作る：投稿先の条件を入れた指示文を作り、コピーしてから、そのAIを開く
      var LIMIT_NOTE={threads:'Threadsは500文字まで',x:'Xは日本語で140文字程度まで（全角は2文字として数えるため短く）',instagram:'Instagramはキャプション2,200文字まで（改行とハッシュタグを使う）',tiktok:'TikTokは短いタイトル向け',facebook:'Facebookページ向け',youtube:'YouTubeショートは1行目がタイトル（100文字まで）。説明は5,000バイト（日本語でおよそ1,600文字）まで'};
      function ownPrompt(kind){var th=$('aiTheme').value.trim();var s=sel();var plats=s.map(function(a){return LIMIT_NOTE[a.platform]||a.label;});
        if(kind==='image')return 'SNSに投稿する画像を1枚作ってください。\\nテーマ：'+th+'\\n条件：正方形。文字やロゴは入れない。実在の人物・他社の商標・著作物に似せない。';
        return 'SNSにそのまま投稿できる日本語の投稿文を1本書いてください。前置きや説明は書かず、投稿文だけを出力してください。\\nテーマ：'+th+(plats.length?'\\n投稿先の条件：'+plats.join('／'):'')+'\\n守ること：事実として確認できない数字・実績・お客様の声・効果の断定は書かない。誇大な表現や、他者を傷つける表現を使わない。';}
      var OWN_URL={chatgpt:function(q){return 'https://chatgpt.com/?q='+encodeURIComponent(q);},claude:function(q){return 'https://claude.ai/new?q='+encodeURIComponent(q);},gemini:function(){return 'https://gemini.google.com/app';}};
      var OWN_NAME={chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini'};
      document.querySelectorAll('[data-own-ai]').forEach(function(b){b.addEventListener('click',function(){
        if(!$('aiTheme').value.trim())return show(false,'先に「テーマ・内容」を入力してください。');
        var ai=b.dataset.ownAi,q=ownPrompt(b.dataset.kind);
        // 新しいタブにフォーカスが移るとコピーに失敗しやすいため、先にコピーを始めてからタブを開く（同じクリックの中なので、ポップアップは止められない）
        var copying=(navigator.clipboard&&navigator.clipboard.writeText)?navigator.clipboard.writeText(q):Promise.reject();
        // noopener を指定すると戻り値が null になるため、開いたあとで opener を切る
        var w=window.open(OWN_URL[ai](q),'_blank');if(w){try{w.opener=null;}catch(e){}}
        var done=function(ok){$('aiMsg').textContent=(w?OWN_NAME[ai]+'を開きました。':'新しいタブを開けませんでした（ブラウザがポップアップを止めている可能性があります）。'+OWN_NAME[ai]+'を開いてください。')+(ok?'指示文をコピーしました。自動で入力されない場合は、貼り付けて送信してください。':'次の指示文をコピーして貼り付けてください：');
          var old=document.getElementById('ownPromptBox');if(old)old.remove();
          if(!ok){var ta=document.createElement('textarea');ta.id='ownPromptBox';ta.readOnly=true;ta.value=q;ta.style.minHeight='100px';$('aiMsg').parentNode.appendChild(ta);ta.select();}};
        copying.then(function(){done(true);},function(){done(false);});
      });});
      // 動画は数分かかるため、作り始めたら数秒ごとに状態を確かめ、できあがったら添付する
      if($('aiVidBtn'))$('aiVidBtn').addEventListener('click',function(){if(!$('aiTheme').value.trim())return show(false,'先に「テーマ・内容」を入力してください。');var btn=$('aiVidBtn');btn.disabled=true;
        aiCall('video',{prompt:$('aiTheme').value}).then(function(j){var started=Date.now();$('aiMsg').textContent='動画を作っています（数分かかります。このページを開いたままお待ちください）…';
          (function poll(){fetch('/service/app/ai/jobs/'+encodeURIComponent(j.job_id),{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(x){
            if(x.status==='done'){btn.disabled=false;media.push({id:x.media_id,kind:'video',url:x.url});document.querySelector('input[name=cat][value=video]').checked=true;refresh();drawMedia();$('aiMsg').textContent='動画を添付しました。内容をご確認ください。';return;}
            if(x.status==='failed'){btn.disabled=false;$('aiMsg').textContent=x.error||'動画を作れませんでした。';return;}
            $('aiMsg').textContent='動画を作っています…（'+Math.round((Date.now()-started)/1000)+'秒）';setTimeout(poll,5000);
          }).catch(function(){setTimeout(poll,10000);});})();
        }).catch(function(){btn.disabled=false;});});
      if($('aiImgBtn'))$('aiImgBtn').addEventListener('click',function(){aiCall('image',{prompt:$('aiTheme').value}).then(function(j){media.push({id:j.id,kind:'image',url:j.url});if(cat()==='text')document.querySelector('input[name=cat][value=image]').checked=true;refresh();drawMedia();$('aiMsg').textContent='画像を添付しました。内容をご確認ください。';}).catch(function(){});});
      function show(ok,msg){var r=$('result');r.style.display='block';r.className='notice'+(ok?'':' error');$('resultText').textContent=msg;}
      $('submitBtn').addEventListener('click',function(){var s=sel();if(!s.length)return show(false,'投稿先を選んでください。');var c=cat();var when=document.querySelector('input[name=when]:checked').value;
        var body={category:c,account_ids:s.map(function(a){return a.id;}),text:$('mainText').value,media_ids:media.map(function(m){return m.id;}),options:{}};
        if($('perTarget').checked){body.captions={};document.querySelectorAll('#perBox textarea').forEach(function(t){body.captions[t.dataset.acc]=t.value;});}
        if(c==='tree')body.tree=cards.map(function(x){return {text:x.text,media_ids:(x.media||[]).map(function(m){return m.id;})};});
        s.forEach(function(a){if(a.platform==='tiktok')body.options[a.id]={privacy_level:$('ttPrivacy').value,disable_comment:!$('ttComment').checked,disable_duet:!$('ttDuet').checked,disable_stitch:!$('ttStitch').checked,commercial_own:$('ttOwn').checked,commercial_paid:$('ttPaid').checked,auto_add_music:$('ttMusic').checked};
          if(a.platform==='youtube')body.options[a.id]={privacy:$('ytPrivacy').value,made_for_kids:$('ytKids').value==='yes'};});
        if(s.filter(function(a){return a.platform==='tiktok';}).length>1)return show(false,'TikTokは、1回に1つのアカウントだけ選んでください（アカウントごとに設定を確かめるため）。');
        if(s.some(function(a){return a.platform==='youtube';})&&!$('ytPrivacy').value)return show(false,'YouTubeの公開設定を選んでください。');
        if(s.some(function(a){return a.platform==='youtube';})&&!$('ytKids').value)return show(false,'YouTubeの「子ども向けかどうか」を選んでください。');
        if(when==='now'){if(!confirm('今すぐ投稿します。よろしいですか？'))return;body.now=true;}else if(when==='draft'){body.draft=true;}else{if(!$('at').value)return show(false,'日時を指定してください。');body.scheduled_at=$('at').value+':00+09:00';}
        if(DRAFT)body.replace_draft=DRAFT.id;
        $('submitBtn').disabled=true;fetch('/service/app/posts',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF':csrf},body:JSON.stringify(body)})
          .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});}).then(function(x){$('submitBtn').disabled=false;if(!x.ok)return show(false,x.j.error||'保存できませんでした。');
            show(true,(when==='draft'?'下書きに保存しました（':when==='now'?'投稿の準備ができました。まもなく投稿されます（':'予約しました（')+x.j.posts.length+'件）。カレンダーで確認できます。');DRAFT=null;media=[];cards=[];drawMedia();drawCards();$('mainText').value='';perBox();counts();})
          .catch(function(){$('submitBtn').disabled=false;show(false,'通信に失敗しました。');});});
      // 下書きを読み込む（投稿先・種類・本文・添付・ツリー。TikTokの設定は選び直してもらう）
      if(DRAFT){ACC.forEach(function(a){var c=document.querySelector('input[data-acc="'+a.id+'"]');if(c)c.checked=(a.id===DRAFT.accountId);});
        var cr=document.querySelector('input[name=cat][value="'+DRAFT.category+'"]');if(cr)cr.checked=true;
        $('mainText').value=DRAFT.text;media=DRAFT.media.slice();cards=DRAFT.tree.map(function(c){return {text:c.text,media:c.media};});drawMedia();drawCards();
        if(DRAFT.category==='tree'&&!$('treeField'))show(false,'この下書きはツリー（連投）ですが、今はツリーを使えません。このまま保存すると、2件目以降は消えます。'+(DRAFT.media.length?'1件目に画像・動画があるため、保存する前に、投稿の種類（画像・動画）を選び直してください。':''));}
      refresh();
    })();
    </script>` : '<div class="card"><p class="small">先にマイページでSNSを連携してください。</p></div>'}
    ${legalLinks()}
  `);
}

// ── カレンダーと下書き ──
function calendarPage({ user, month, posts, drafts, csrf, flash }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startDow = first.getUTCDay();
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const byDay = {};
  for (const p of posts) {
    const d = new Date(Date.parse(p.scheduled_at) + 9 * 3600 * 1000);
    (byDay[d.getUTCDate()] = byDay[d.getUTCDate()] || []).push({ p, hm: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` });
  }
  const todayJst = new Date(Date.now() + 9 * 3600 * 1000);
  const isToday = (d) => todayJst.getUTCFullYear() === y && todayJst.getUTCMonth() + 1 === m && todayJst.getUTCDate() === d;
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="cal-cell cal-empty"></div>';
  for (let d = 1; d <= days; d++) {
    const items = (byDay[d] || []).map(({ p, hm }) => {
      const [l, c] = POST_STATUS[p.status] || [p.status, 'badge-off'];
      const ad = registry.get(p.platform);
      const snippet = String(p.text || '').slice(0, 24);
      return `<div class="cal-item" title="${escapeHtml(p.text || '')}"><span class="${c}" style="font-size:10px;padding:0 6px">${escapeHtml(l)}</span> ${hm} <b>${escapeHtml(ad ? ad.label : '')}</b><br><span class="small">${escapeHtml(snippet)}${p.text && p.text.length > 24 ? '…' : ''}</span>${viewOnSnsLink(p, '<br>')}${p.last_error && (p.status === 'failed' || p.status === 'pending') ? `<br><span class="small" style="color:#8a2c1f">${escapeHtml(String(p.last_error).slice(0, 120))}</span>` : ''}
        ${p.status === 'pending' ? `<form class="inline" method="POST" action="/service/app/post/${escapeHtml(p.id)}/cancel" onsubmit="return confirm('この予約を取り消します。')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="back" value="calendar"><button class="linkbtn" type="submit">取り消す</button></form>` : ''}</div>`;
    }).join('');
    cells += `<div class="cal-cell${isToday(d) ? ' cal-today' : ''}"><div class="cal-day">${d}</div>${items}</div>`;
  }
  const draftRows = drafts.length ? drafts.map((p) => {
    const ad = registry.get(p.platform);
    let tree = []; try { tree = JSON.parse(p.tree || '[]'); } catch { tree = []; }
    let mids = []; try { mids = JSON.parse(p.media_ids || '[]'); } catch { mids = []; }
    return `<div class="acct-row" style="align-items:flex-start;flex-wrap:wrap"><span style="flex:1;min-width:220px"><b>${escapeHtml(ad ? ad.label : '(解除済み)')}</b> ${escapeHtml(p.handle || '')}
        ${tree.length ? `<span class="badge-off">ツリー${tree.length + 1}件</span>` : ''}${mids.length ? `<span class="badge-off">添付${mids.length}件</span>` : ''}<br><span class="small">${escapeHtml(String(p.text || '').slice(0, 120))}</span></span>
      <span>${p.platform === 'tiktok' ? `<a class="btn btn-sm btn-primary" href="/service/app/compose?draft=${escapeHtml(p.id)}">内容と設定を確かめて投稿する</a>` : `<form class="inline" method="POST" action="/service/app/post/${escapeHtml(p.id)}/publish"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
        <input type="datetime-local" name="at" value="${toLocalInput(Date.now() + 3600 * 1000)}" style="max-width:200px"> <button class="btn btn-sm btn-primary" type="submit" name="mode" value="schedule">予約する</button>
        <button class="btn btn-sm" type="submit" name="mode" value="now" onclick="return confirm('今すぐ投稿します。よろしいですか？')">今すぐ投稿</button></form>`}
      <form class="inline" method="POST" action="/service/app/post/${escapeHtml(p.id)}/cancel" onsubmit="return confirm('この下書きを削除します。')"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="back" value="calendar"><button class="btn btn-sm btn-ghost" type="submit">削除</button></form></span></div>`;
  }).join('') : '<p class="small">下書きはありません。</p>';
  return wrap('カレンダー', `
    <style>.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.cal-h{font-size:12px;text-align:center;color:var(--muted)}
    .cal-cell{min-height:84px;border:1px solid #e6dfd0;border-radius:8px;padding:4px;font-size:11.5px;overflow:hidden}.cal-empty{border:none}.cal-today{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
    .cal-day{font-weight:700;font-size:12px}.cal-item{margin-top:4px;line-height:1.35;word-break:break-word}.linkbtn{background:none;border:none;color:inherit;text-decoration:underline;font-size:11px;padding:0;cursor:pointer}
    @media(max-width:600px){.cal{grid-template-columns:1fr}.cal-h,.cal-empty{display:none}.cal-cell{min-height:0}}</style>
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">Calendar</div><h1>カレンダー・下書き</h1>
      <p class="small"><a href="/service/app">マイページ</a> ／ <a class="btn btn-sm btn-primary" href="/service/app/compose">投稿を作る</a></p></header>
    ${flash ? `<div class="notice ${flash.type === 'error' ? 'error' : ''}" style="margin:0 0 14px"><div>${escapeHtml(flash.text)}</div></div>` : ''}
    <div class="card"><div class="btn-row" style="justify-content:space-between;align-items:center"><a href="/service/app/calendar?m=${prev}">← 前の月</a><b>${y}年${m}月</b><a href="/service/app/calendar?m=${next}">次の月 →</a></div>
      <div class="cal" style="margin-top:10px">${['日', '月', '火', '水', '木', '金', '土'].map((w) => `<div class="cal-h">${w}</div>`).join('')}${cells}</div>
      <p class="small">時刻は日本時間です。</p></div>
    <div class="card" id="drafts"><div class="card-title">下書き（${drafts.length}件）</div>${draftRows}</div>
    ${legalLinks()}
  `);
}

// ── Threadsの最近の投稿（連携した本人だけ。開くたびにThreadsから取得し、保存しない）──
// media_type の値は公式のリファレンス（Threads Media）による。カルーセルの子の中身は取得していない（lib/sns/threads.js の listRecent）
const THREADS_MEDIA_TYPE = { TEXT_POST: 'テキスト', IMAGE: '画像', VIDEO: '動画', CAROUSEL_ALBUM: 'カルーセル（複数の画像・動画）', AUDIO: '音声', REPOST_FACADE: '再投稿' };
function threadsRecentMedia(t) {
  const media = 'style="max-width:100%;max-height:420px;border-radius:10px;display:block;margin-top:8px"';
  if (t.mediaType === 'VIDEO' && t.mediaUrl) {
    return `<video controls preload="metadata" playsinline ${t.thumbnailUrl ? `poster="${escapeHtml(t.thumbnailUrl)}"` : ''} src="${escapeHtml(t.mediaUrl)}" ${media}></video>`;
  }
  const img = t.mediaType === 'VIDEO' ? t.thumbnailUrl : (t.mediaType === 'IMAGE' || t.mediaType === 'CAROUSEL_ALBUM' ? t.mediaUrl : '');
  const imgHtml = img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(t.mediaType === 'VIDEO' ? '動画のサムネイル' : '投稿の画像')}" loading="lazy" referrerpolicy="no-referrer" ${media}>` : '';
  if (t.mediaType === 'CAROUSEL_ALBUM') return `${imgHtml}<p class="small">カルーセルの画像・動画は、すべてをこの画面には出していません。「Threadsで見る」から、Threadsでご覧ください。</p>`;
  if (t.mediaType === 'AUDIO' || t.mediaType === 'REPOST_FACADE') return `${imgHtml}<p class="small">この種類の投稿の中身は、この画面には出していません。「Threadsで見る」から、Threadsでご覧ください。</p>`;
  if ((t.mediaType === 'IMAGE' || t.mediaType === 'VIDEO') && !img) return '<p class="small">画像・動画を取得できませんでした。「Threadsで見る」から、Threadsでご覧ください。</p>';
  if (t.mediaType === 'VIDEO') return `${imgHtml}<p class="small">動画を取得できなかったため、サムネイルを表示しています。動画は「Threadsで見る」から、Threadsでご覧ください。</p>`;
  return imgHtml;
}
function threadsRecentPage({ user, account, items = [], error = '' }) {
  const handle = account ? escapeHtml(account.handle || '') : '';
  const list = items.length ? items.map((t, i) => {
    const kind = THREADS_MEDIA_TYPE[t.mediaType] || t.mediaType || '投稿';
    const when = t.timestamp && !Number.isNaN(Date.parse(t.timestamp)) ? core.formatJst(t.timestamp) : '';
    const snippet = t.text.length > 40 ? `${t.text.slice(0, 40)}…` : t.text;
    return `<details class="th-post"${i === 0 ? ' open' : ''}><summary><span class="badge-off">${escapeHtml(kind)}</span> <span class="small">${escapeHtml(when)}</span> ${escapeHtml(snippet || '（本文なし）')}</summary>
      <div class="th-body">
        <table class="t kv"><tr><th>投稿日時</th><td>${when ? `${escapeHtml(when)}（日本時間）` : '不明'}</td></tr><tr><th>種類</th><td>${escapeHtml(kind)}</td></tr></table>
        ${t.text ? `<div class="th-text">${escapeHtml(t.text)}</div>` : '<p class="small">本文はありません。</p>'}
        ${threadsRecentMedia(t)}
        <p>${t.permalink ? `<a class="btn btn-sm" href="${escapeHtml(t.permalink)}" target="_blank" rel="noopener noreferrer">Threadsで見る</a>` : '<span class="small">Threadsがこの投稿へのリンクを返さなかったため、リンクはありません。</span>'}</p>
      </div></details>`;
  }).join('') : (error ? '' : '<p class="small">Threadsの投稿はまだありません。</p>');
  return wrap('Threadsの最近の投稿', `
    <style>.svc .th-post{border-bottom:1px solid #eee7d6;padding:8px 0}.svc .th-post summary{cursor:pointer;line-height:1.6}.svc .th-body{padding:8px 0 4px}.svc .th-text{white-space:pre-wrap;word-break:break-word;margin:10px 0}</style>
    ${topNav(user)}
    <header class="page-head"><div class="eyebrow">Threads</div><h1>Threadsの最近の投稿</h1>
      <p class="small"><a href="/service/app">マイページ</a> ／ <a href="/service/app/calendar">カレンダー・下書き</a></p></header>
    ${error ? `<div class="notice error" style="margin:0 0 14px"><div>${escapeHtml(error)}</div></div>` : ''}
    ${account ? `<div class="card"><div class="card-title">Threads ${handle} の最近の投稿</div>
      <p class="small">連携したご本人だけが見られます。この一覧は、開くたびにThreadsから取得して表示するだけで、本サービスには保存しません。投稿を選ぶと、本文・画像・動画を表示します（新しい順に最大20件）。</p>
      ${list}</div>` : ''}
    ${legalLinks()}
  `);
}

function legalPage(title, html, user) {
  return wrap(title, `${topNav(user)}<div class="legal-doc">${html}</div><p class="small"><a href="/service">サービス紹介に戻る</a></p>`);
}

// ── データ削除の手順（ログイン不要。各SNSのアプリの「ユーザーデータ削除の手順のURL」に登録できる）──
// 内容は、プライバシーポリシーの5と、実際の動き（SnsAccounts.remove・lib/meta-deletion.js）に合わせること。
// 各SNSの設定画面の名前（どのメニューから許可を外すか）は、公式で確かめられていないため書いていない（実物で確かめてから足す）
const contactHtml = () => {
  const mail = core.contactEmail();
  return `<a href="/contact">お問い合わせフォーム</a>${mail ? `（またはメール：<a href="mailto:${escapeHtml(mail)}">${escapeHtml(mail)}</a>）` : ''}`;
};
const NOT_DELETED_HTML = `<ul>
  <li>SNS上に公開された投稿そのものは、本サービスでの解除や削除の求めでは削除されません。SNS上の投稿は、各SNSで削除してください。</li>
  <li>利用者が本サービスで作成した投稿の本文・日時などの投稿の情報（SNSでの投稿のIDとリンクを除きます）と、同意の記録は、本サービスのアカウントの情報として残ります（プライバシーポリシーの6）。</li>
  <li>Metaから届いた削除の求め・取り消しの知らせを受け付けた記録（確認コード、SNSの種類、求めの種類、受け付けた日時、処理の状態、削除した連携の件数）と、SNS側の操作などで連携の情報を削除したことをマイページでお知らせするための記録（本サービスのアカウント、SNSの種類、削除の理由、削除した日時、お知らせを閉じた日時）は、処理の状況の確認とお問い合わせへの対応のために保存します。これらの記録には、SNSのIDなど、SNSのアカウントを特定できる情報は含みません（プライバシーポリシーの5）。</li>
</ul>`;
const deletionLookupForm = (code = '') => `<form method="GET" action="/service/meta/deletion" class="btn-row" style="margin:8px 0">
  <input type="text" name="code" maxlength="64" value="${escapeHtml(code)}" placeholder="確認コード" aria-label="確認コード" style="max-width:320px">
  <button class="btn btn-sm btn-primary" type="submit">状況を確かめる</button></form>`;

function dataDeletionPage({ user }) {
  return wrap('データ削除の手順', `${topNav(user)}<div class="legal-doc">
    <h1>データ削除の手順</h1>
    <p>「${nameOf()}」（以下「本サービス」）が、各SNSとの連携で受け取った情報（SNSのID・ユーザー名・ページ名・連携に使うトークン、本サービスから投稿した投稿のID・投稿へのリンクなど）を削除する方法です。受け取る情報と、その使い方は、<a href="/service/legal/privacy">プライバシーポリシー</a>の2-2と5をご覧ください。</p>

    <h2>1. マイページで連携を解除する</h2>
    <ol><li>本サービスにログインし、<a href="/service/app">マイページ</a>を開きます。</li><li>「連携しているSNS」の欄で、削除したいSNSのアカウントの「解除」を押します。</li></ol>
    <p>解除すると、直ちに次のことを行います。</p>
    <ul>
      <li>その連携の情報（SNSのID・ユーザー名・ページ名・トークンなど）を削除します。</li>
      <li>そのアカウントへの未投稿の予約・下書きと、自動運用の設定を取り消します。</li>
      <li>投稿済みの予約に保存していた、SNSでの投稿のIDと、投稿へのリンクを削除します。</li>
    </ul>
    <p>本サービスでの解除は、本サービスが保存している情報を削除するものです。YouTubeの連携は、あわせてGoogleに、本サービスへの許可の取り消しを送ります（Googleでの取り消しに失敗した場合も、本サービスの情報は削除します）。ほかのSNSの側で本サービスに与えた許可を外すには、2の方法で取り消してください。なお、本サービスの契約が終了したときも、同じように連携の情報を削除します。</p>

    <h2>2. 各SNSの設定画面から取り消す</h2>
    <p>各SNSのアカウントの設定画面（アプリやウェブサイトへの許可を管理する画面）から、本サービスへの許可を取り消せます。YouTubeは、Googleのセキュリティの設定のページ（<a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener">https://security.google.com/settings/security/permissions</a>）から取り消せます。取り消したときの本サービスでの扱いは、次のとおりです。</p>
    <ul>
      <li><b>Threads・Instagram・Facebook</b>：Metaから取り消しの知らせが本サービスに届いたときに、直ちに1と同じ削除を行います。</li>
      <li><b>TikTok・YouTube</b>：本サービスには、SNS側での取り消しの知らせを受け取る仕組みがありません。取り消したあとは投稿できなくなります。TikTokの情報は、マイページで解除するか、契約が終わるまで残ります。YouTubeは、本サービスが1日1回、連携のトークンを更新して、連携がまだ有効かをGoogleに確かめます（投稿の前にも更新します）。Googleの側で取り消されたことなどにより、トークンを更新できないことを検知すると、マイページに「再連携が必要」と表示し、そのまま${YOUTUBE_REAUTH_DELETE_DAYS}日たつと、1と同じように連携の情報を削除し、マイページでお知らせします（Googleの側で取り消してから30日以内に削除できるよう、この日数にしています）。早く削除したい場合は、1の方法で解除してください。</li>
      <li>SNS側で取り消したあとも、マイページに連携が残っている場合は、マイページで解除するか、4の方法でご連絡ください。</li>
    </ul>

    <h2>3. Metaから届く削除の求め（Threads・Instagram・Facebook）</h2>
    <p>Metaの設定画面から、本サービスが受け取った情報の削除を求めると、Metaから本サービスに削除の求めが届きます。本サービスは、これを受け取ると、直ちにそのSNSアカウントについて1と同じ削除を行います（そのアカウントを本サービスで連携しているすべての利用者の分）。あわせて、確認コードと、処理の状況を確かめられるページのURLをMetaに返します。</p>
    <p>状況のページ（/service/meta/deletion?code=確認コード）では、ログインせずに、その求めの処理の状況を確かめられます。該当する連携が無かった場合（すでに解除済みの場合など）は、削除したとは表示せず、該当する連携が見つからなかったことを表示します。確認コードをお持ちの場合は、ここに入力して確かめることもできます。</p>
    ${deletionLookupForm()}

    <h2>4. お問い合わせ</h2>
    <p>上の方法で削除できない場合や、本サービスのアカウントそのもの、投稿の本文などの削除を求める場合は、${contactHtml()}からご連絡ください。本人確認のうえ、速やかに対応します。</p>

    <h2>削除されないもの</h2>
    ${NOT_DELETED_HTML}
  </div>${legalLinks()}<p class="small"><a href="/service">サービス紹介に戻る</a></p>`);
}

// ── Metaから届いた削除の求めの、処理の状況（ログイン不要。確認コードで開く）──
// 誰でも開けるため、利用者やSNSアカウントを特定できる情報（ID・ユーザー名・メールアドレス・消した件数）は出さない
// （該当する連携があって削除したかどうかだけを示す。消すものが無かったときに「削除しました」と書かないため）
const DELETION_KIND = { deletion: 'データ削除の求め（Metaから）', deauthorize: '連携の取り消しの知らせ（Metaから）' };
const DELETION_STATUS = { completed: '完了（削除しました）' };
function metaDeletionStatusPage({ request, code = '', user }) {
  if (!request) {
    return wrap('削除の状況', `${topNav(user)}<div class="legal-doc"><h1>削除の状況</h1>
      <p>${code ? 'この確認コードの求めは見つかりませんでした。確認コード（半角の英数字32文字）を、もう一度お確かめください。' : '確認コードを入力してください。'}</p>
      ${deletionLookupForm(code)}
      <p>ご不明な点は、${contactHtml()}から、確認コードを添えてご連絡ください。削除の方法は「<a href="/service/legal/data-deletion">データ削除の手順</a>」をご覧ください。</p>
    </div>${legalLinks()}`);
  }
  const label = escapeHtml((registry.get(request.platform) || {}).label || request.platform);
  const done = request.status === 'completed';
  // 該当する連携が無かった（消した件数が0）ときは「削除しました」と書かない（すでに解除済みの場合などを含む）
  const statusText = done && !request.found ? '受付済み（該当する連携は見つかりませんでした）' : (DELETION_STATUS[request.status] || '処理中');
  return wrap('削除の状況', `${topNav(user)}<div class="legal-doc"><h1>削除の状況</h1>
    <table class="t kv">
      <tr><th>確認コード</th><td><code>${escapeHtml(request.code)}</code></td></tr>
      <tr><th>SNS</th><td>${label}</td></tr>
      <tr><th>求めの種類</th><td>${escapeHtml(DELETION_KIND[request.kind] || request.kind)}</td></tr>
      <tr><th>受け付けた日時</th><td>${escapeHtml(core.formatJst(request.created_at))}（日本時間）</td></tr>
      <tr><th>状態</th><td>${escapeHtml(statusText)}</td></tr>
    </table>
    ${!done ? '<p>削除の処理中です。時間をおいて、このページをもう一度開いてください。</p>'
    : request.found ? '<p>このSNSアカウントについて、本サービスが保存していた連携の情報（SNSのID・ユーザー名・ページ名・連携に使うトークン）と、投稿済みの予約に保存していたSNSでの投稿のID・投稿へのリンクを削除し、未投稿の予約・下書きと自動運用の設定を取り消しました。そのアカウントを本サービスで連携していたすべての利用者の分が対象です。</p>'
    : '<p>受け付けました。該当する連携は見つかりませんでした（すでに解除済みの場合を含みます）。本サービスのマイページに、このSNSアカウントの連携が残っている場合は、マイページで解除するか、確認コードを添えてお問い合わせください。</p>'}
    <h2>削除されないもの</h2>
    ${NOT_DELETED_HTML}
    <p>ご不明な点は、${contactHtml()}から、確認コードを添えてご連絡ください。削除のほかの方法は「<a href="/service/legal/data-deletion">データ削除の手順</a>」をご覧ください。</p>
  </div>${legalLinks()}`);
}

// 30件プランの設定の確認（価格IDの中身は表示しない）。表示する月額と、Stripeで作る価格の金額の一致は、画面からは確かめられないため、運営者が確かめる
function agencyNote(env) {
  const idSet = !!String(env.STRIPE_PRICE_ID_AGENCY || '').trim();
  const priceSet = Number(env.SERVICE_PRICE_JPY_AGENCY) > 0;
  const shown = Number(env.SERVICE_PRICE_JPY_AGENCY || 3300);
  const stdSame = idSet && env.STRIPE_PRICE_ID_AGENCY === env.STRIPE_PRICE_ID ? '。通常プランと同じ価格IDになっています（別の価格IDを設定してください）' : '';
  if (!idSet) return `未設定（30件プランは、画面に出さず、申込みも断ります）。使う場合は、Stripeで月額${yen(shown)}の価格を作り、そのIDを設定する`;
  return `設定済み。画面に表示する月額：${yen(shown)}${priceSet ? '（SERVICE_PRICE_JPY_AGENCY）' : '（未設定のため既定の3,300円。販売ページには、SERVICE_PRICE_JPY_AGENCY を設定するまで30件プランを出しません）'}。連携の上限：${envNum(env.SERVICE_MAX_ACCOUNTS_AGENCY, 30)}件。Stripeの価格の金額が、画面に表示する月額と同じかを、Stripeのダッシュボードで確かめる（違うと、表示と請求額が食い違います）${stdSame}`;
}
const envNum = (v, d) => { const n = parseInt(v || '', 10); return Number.isFinite(n) && n > 0 ? n : d; };

// 運営用：設定の確認（値は表示せず、設定されているかだけを示す）
function settingsChecklist(env = process.env) {
  const has = (...ks) => ks.every((k) => !!env[k]);
  const base = String(env.SERVICE_BASE_URL || '');
  // 審査済みのSNS（SNS_APPROVED）：一般の利用者に出すSNSと、入れたのにキーが無いもの・知らない id を示す
  const approved = [...core.approvedSns(env)];
  const liveLabels = core.liveSns({ env }).map((p) => p.label);
  const noKey = approved.filter((id) => registry.get(id) && !registry.get(id).isConfigured(env)).map((id) => registry.get(id).label);
  const unknownIds = approved.filter((id) => !registry.get(id));
  const approvedNote = [
    approved.length ? `設定値：${approved.join(',')}。一般の利用者に出すSNS：${liveLabels.length ? liveLabels.join('・') : 'なし'}` : '未設定（一般の利用者には、どのSNSも「準備中」と表示します）',
    noKey.length ? `キーが未設定のため出していないSNS：${noKey.join('・')}` : '',
    unknownIds.length ? `知らない id（綴りを確かめる）：${unknownIds.join(',')}` : '',
    '各SNSの審査（MetaのApp Reviewなど）を通ったSNSの id だけを、カンマ区切りで設定する（threads・instagram・facebook・tiktok・youtube・x。例：threads,instagram）。入っていないSNSは、一般の利用者には「準備中」と表示し、テスト利用の利用者だけが連携できる。1つも無い間は販売を開始しません。TikTokの投稿の監査（Audit）は、別に TIKTOK_AUDITED で示す',
  ].filter(Boolean).join('。');
  const legalLeft = core.legalPlaceholders().length;
  const legalFinalNote = env.LEGAL_FINAL === 'true' && legalLeft
    ? '設定されていますが、未記入の【】が残っているため、草案の表示のままです'
    : '運営者（必要に応じて弁護士などの専門家）が3つの文書の内容を確かめてから設定する。設定すると、販売の開始（SERVICE_OPEN）の前でも、規約・特商法表記・プライバシーポリシーの「（案）」と草案の注意書きを外す（各SNSの審査に、確定版の文書を見せるため）。【】が残っている間は外れません';
  return [
    ['管理画面のパスワード（ADMIN_PASSWORD）', !!env.ADMIN_PASSWORD && env.ADMIN_PASSWORD !== 'changeme', '必須。未設定だと既定の弱いパスワードになり、テスト利用の付与もできません'],
    ['サービスのURL（SERVICE_BASE_URL）', /^https:\/\//.test(base), base ? `設定値：${base}` : '例：https://michishirube-post.fly.dev。SNS連携・画像の投稿・AIアシスタントとの接続に必要'],
    ['トークンの暗号化の鍵（SNS_TOKEN_KEY）', !!require('./crypto-box').keyFromEnv(env), env.SNS_TOKEN_KEY && !require('./crypto-box').keyFromEnv(env) ? '形式が正しくありません。64桁の16進数（0〜9とa〜f）にしてください' : 'SNS連携に必要。64桁の16進数（0〜9とa〜f）。一度決めたら変えない'],
    ['画面の操作の確認用の鍵（APP_SECRET）', has('APP_SECRET'), '未設定だと再起動のたびに、開いていた画面の操作が失敗する'],
    ['Threads（THREADS_APP_ID・THREADS_APP_SECRET）', has('THREADS_APP_ID', 'THREADS_APP_SECRET'), ''],
    ['X（X_CLIENT_ID・X_CLIENT_SECRET）', has('X_CLIENT_ID', 'X_CLIENT_SECRET'), ''],
    ['Instagram（INSTAGRAM_APP_ID・INSTAGRAM_APP_SECRET）', has('INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'), ''],
    ['TikTok（TIKTOK_CLIENT_KEY・TIKTOK_CLIENT_SECRET）', has('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'), ''],
    ['Facebook（FACEBOOK_APP_ID・FACEBOOK_APP_SECRET）', has('FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'), ''],
    ['YouTube（GOOGLE_CLIENT_ID・GOOGLE_CLIENT_SECRET）', has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'), ''],
    ['審査済みのSNS（SNS_APPROVED）', liveLabels.length > 0, approvedNote],
    ['AIの文章（ANTHROPIC_API_KEY）', has('ANTHROPIC_API_KEY'), '任意'],
    ['AIの画像（OPENAI_API_KEY）', has('OPENAI_API_KEY'), '任意'],
    ['AIの動画（GEMINI_API_KEY・AI_DAILY_VIDEO）', aiLib().available().video, '当面は提供しない（設定しない）。提供するときは規約・プライバシーポリシーの改定が必要'],
    ['Stripe（STRIPE_SECRET_KEY・STRIPE_WEBHOOK_SECRET・STRIPE_PRICE_ID）', has('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID'), '販売に必要（テスト利用だけなら不要）'],
    ['30件プラン（STRIPE_PRICE_ID_AGENCY・SERVICE_PRICE_JPY_AGENCY）', has('STRIPE_PRICE_ID_AGENCY'), agencyNote(env)],
    ['紹介機能（REFERRAL_ENABLED・REFERRAL_MAX_REWARDS）', require('./referral').enabled(env), require('./referral').enabled(env) ? `働いている（1人あたり最大${require('./referral').maxRewards(env)}件の特典）。販売前の条件（上限の決定・連鎖販売取引に当たらないかの弁護士確認と審査ログへの記録）が済んでいることを確かめる。有効にするときは、規約・特商法表記の改定日と TERMS_VERSION を更新する` : `止まっている（紹介コードの発行・表示、登録画面の案内、紹介された人の30日無料、特典の付与のすべてが止まっています）。理由：${require('./referral').disabledReason(env)}。なお、法務ページ（規約・特商法表記）には紹介の記載が常に表示されます。有効にするまでは「提供していない間は適用されない」と読める記載になっています`],
    ['問い合わせ先（SERVICE_CONTACT_EMAIL）', has('SERVICE_CONTACT_EMAIL'), '販売に必要'],
    ['代表者の氏名（SERVICE_REPRESENTATIVE）', has('SERVICE_REPRESENTATIVE'), 'プライバシーポリシーの事業者情報に表示する（販売前に設定）'],
    ['法務文書の未記入の箇所（【】）', core.legalPlaceholders().length === 0, core.legalPlaceholders().length ? `残っている箇所：${core.legalPlaceholders().join('、')}` : '規約・特商法表記・プライバシーポリシーに、未記入の【】はありません'],
    ['法務文書の確定（LEGAL_FINAL=true）', env.LEGAL_FINAL === 'true' && legalLeft === 0, legalFinalNote],
    ['販売の開始（SERVICE_OPEN=true）', env.SERVICE_OPEN === 'true', '各SNSの審査・テスト・法務文書の確認（【】の箇所をすべて埋める）が済んでから設定する。【】が残っている間と、審査済みのSNS（SNS_APPROVED）が1つも無い間は、設定しても販売を開始しません'],
  ];
}

function adminServicePage({ subs, stats, postStats, message, consents = [], consentEmail = '' }) {
  const rows = subs.map((s) => `<tr><td>${escapeHtml(s.email || '')}</td><td>${escapeHtml(s.status)}</td><td>${escapeHtml(s.current_period_end || '')}</td><td>${s.cancel_at_period_end ? '解約予定' : ''}</td><td>${escapeHtml(s.created_at)}</td></tr>`).join('');
  const checks = settingsChecklist().map(([name, ok, note]) => `<tr><td>${ok ? '✅' : '—'}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(note)}</td></tr>`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>月額サービス（運営）</title>
<style>body{font-family:sans-serif;max-width:920px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:14px}.msg{padding:10px;border:1px solid #9c9;background:#efe;margin:10px 0}.err{border-color:#c99;background:#fee}input[type=email]{padding:6px;width:260px;max-width:100%}</style></head><body>
<h1>月額SNS自動投稿サービス（運営用）</h1><p><a href="/admin/inquiries">お問い合わせ</a>${process.env.SERVICE_ONLY === 'true' ? '' : ' ／ <a href="/admin/licenses">ライセンス</a>'} ／ <a href="/service">サービスのページ</a></p>
${message ? `<div class="msg${message.ok ? '' : ' err'}">${escapeHtml(message.text)}</div>` : ''}
<h2>設定の確認</h2><p>値は表示しません。設定されているかだけを示します。設定は Fly.io のシークレットで行い、設定すると自動で再起動します。</p>
<table><tr><th></th><th>項目</th><th>メモ</th></tr>${checks}</table>
<h2>テスト利用（動作確認用・料金なし）</h2>
<p>決済をせずに、指定したアカウントで全機能を試せるようにします。先に <a href="/service/signup">/service/signup</a> でアカウントを作ってから、そのメールアドレスを入れてください。取り消すと、そのアカウントのSNSの連携・AIアシスタントとの接続・APIキーは解除されます。</p>
<form method="POST" action="/admin/service/test-grant" style="margin:6px 0"><input type="email" name="email" required placeholder="メールアドレス"> <button type="submit">テスト利用を付与</button></form>
<form method="POST" action="/admin/service/test-revoke" style="margin:6px 0" onsubmit="return confirm('テスト利用を取り消します。SNSの連携なども解除されます。')"><input type="email" name="email" required placeholder="メールアドレス"> <button type="submit">テスト利用を取り消す</button></form>
<h2>同意の記録</h2>
<p>申込み時の規約等への同意、自動運用の「そのまま投稿する」への同意、AIアシスタントとの接続の許可を、追記だけで記録しています（変更・削除はできません）。同意した時点の文書の本文の控えも保存しています。</p>
<form method="GET" action="/admin/service" style="margin:6px 0"><input type="email" name="consent_email" value="${escapeHtml(consentEmail)}" placeholder="メールアドレスで絞り込む"> <button type="submit">絞り込む</button> <a href="/admin/service/consents.csv${consentEmail ? `?email=${encodeURIComponent(consentEmail)}` : ''}">CSVでダウンロード</a></form>
<table><tr><th>日時(UTC)</th><th>メール</th><th>種類</th><th>規約の版・控え</th><th>内容</th><th>IP</th></tr>${consents.map((c) => `<tr><td>${escapeHtml(c.created_at)}</td><td>${escapeHtml(c.email)}</td><td>${escapeHtml(({ checkout: '申込み', auto_full: '完全自動', mcp_connect: 'AIアシスタント接続' })[c.kind] || c.kind)}</td>
  <td>${escapeHtml(c.terms_version)}${Object.entries(c.docs).map(([f, h]) => `<br><a href="/admin/service/legal-snapshot/${escapeHtml(h)}">${escapeHtml(f.replace(/^サービス|_案\.md$/g, ''))}</a>`).join('')}</td>
  <td><code style="font-size:12px">${escapeHtml(JSON.stringify(c.detail))}</code></td><td>${escapeHtml(c.ip)}</td></tr>`).join('') || '<tr><td colspan="6">記録はまだありません</td></tr>'}</table>
<h2>契約の状況</h2><p>${stats.map((r) => `${escapeHtml(r.status)}: ${r.n}件`).join(' ／ ') || '契約はまだありません'}</p>
<h2>予約の状況</h2><p>${postStats.map((r) => `${escapeHtml(r.status)}: ${r.n}件`).join(' ／ ') || '予約はまだありません'}</p>
<h2>契約者一覧</h2><table><tr><th>メール</th><th>状態</th><th>次回更新日(UTC)</th><th>解約</th><th>登録日</th></tr>${rows}</table>
<p>※ 請求・返金などの詳しい情報は、Stripeのダッシュボードで確認してください。状態が test のものは、運営者が付与したテスト利用です。</p></body></html>`;
}

function apiDocsPage(user, baseUrl) {
  const b = escapeHtml(baseUrl || 'https://（サービスのURL）');
  const code = (t) => `<pre style="background:#f4f4f6;padding:12px;border-radius:8px;overflow:auto;font-size:13px">${escapeHtml(t)}</pre>`;
  // AIの生成は、運営者が設定したものだけを載せる
  const aiAv = aiLib().available();
  const aiNames = [aiAv.text && '文章', aiAv.image && '画像', aiAv.video && '動画'].filter(Boolean).join('・');
  const aiApi = [aiAv.text && '<li><code>POST /api/v1/ai/text</code>：AIで投稿文を作る</li>', aiAv.image && '<li><code>POST /api/v1/ai/image</code>：AIで画像を作る</li>', aiAv.video && '<li><code>POST /api/v1/ai/video</code>：AIで動画を作る（<code>GET /api/v1/ai/jobs/{id}</code> で完了を確認）</li>'].filter(Boolean).join('');
  return wrap('APIの説明', `${topNav(user)}<div class="legal-doc"><h1>APIの説明</h1>
    <p>マイページで発行したAPIキーを、<code>Authorization: Bearer &lt;APIキー&gt;</code> として付けてください。1分あたり60回までです。投稿の条件（文字数・画像の形式・1日の上限など）は、画面からの投稿と同じです。</p>
    <h2>連携しているSNSの一覧</h2>${code(`curl ${baseUrl || '$URL'}/api/v1/accounts -H "Authorization: Bearer $KEY"`)}
    <h2>画像・動画のアップロード</h2><p>ファイルをそのまま本文に送ります。戻り値の <code>id</code> を投稿の <code>media_ids</code> に指定します。</p>${code(`curl -X POST ${baseUrl || '$URL'}/api/v1/media -H "Authorization: Bearer $KEY" --data-binary @photo.jpg`)}
    <h2>投稿の作成</h2><p><code>category</code>：text／image／video／tree。<code>now:true</code> で即時、<code>scheduled_at</code>（ISO 8601）で予約、<code>draft:true</code> で下書きになります。SNSごとに本文を変えるときは <code>captions</code> にアカウントIDごとの本文を指定します。</p>
    ${code(`curl -X POST ${baseUrl || '$URL'}/api/v1/posts -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
  "category": "tree",
  "text": "1件目",
  "tree": [{"text": "2件目"}, {"text": "3件目"}],
  "account_ids": ["<アカウントID>"],
  "scheduled_at": "2026-12-01T09:00:00+09:00"
}'`)}
    <h3>SNSごとの設定（<code>options</code>）</h3>
    <p>アカウントIDごとに指定します。<b>TikTokへは、APIからは下書き（<code>draft:true</code>）にだけできます</b>（TikTokの決まりにより、投稿は、利用者ご本人がサービスのカレンダーから下書きを「投稿を作る」画面で開き、内容と設定を確かめて選び直してから行います。<code>POST /api/v1/posts/{id}/publish</code> では予約にできません）。<b>TikTokは、公開範囲（<code>privacy_level</code>）を必ず利用者ご本人が選んでください</b>（選べる値はアカウントごとに異なります。このサービスがTikTokの投稿の監査（Audit）を通るまでは <code>SELF_ONLY</code>（自分のみ）だけです）。あわせて、商用コンテンツの開示（<code>commercial_own</code>：自分の宣伝を含む、<code>commercial_paid</code>：第三者の宣伝を含む）と、コメント等の可否（<code>disable_comment</code>・<code>disable_duet</code>・<code>disable_stitch</code>。true で禁止）、写真の投稿に音楽を自動で付けるか（<code>auto_add_music</code>。初期値は付けない）を指定します。TikTokへの投稿は、TikTokの音楽使用の確認（および、第三者の宣伝を含む場合はブランドコンテンツのポリシー）に同意したものとみなされます。YouTubeは、公開設定（<code>privacy</code>：public／unlisted／private）と、子ども向けかどうか（<code>made_for_kids</code>：true／false）を、必ず利用者に確認して指定してください（下書き以外は必須です。指定がないと予約できません）。YouTubeへのアップロードには、1日（太平洋時間）の上限（利用者ごと・サービス全体）があり、上限に達した日時には予約できません。送る時点で上限に達していた場合は、YouTubeの日付が変わった後に自動で投稿します。${aiKinds() ? `このサービスのAI（<code>/api/v1/ai/…</code> や画面の「このツールのAIで作る」）で作った${aiKinds()}にだけ、TikTokの「AI生成」の表示（<code>is_aigc</code>）${aiLib().available().video ? 'とYouTubeの合成コンテンツの申告（<code>containsSyntheticMedia</code>）' : ''}を自動で付けます。ほかの方法で作ってアップロードした画像・動画には、このサービスはAI生成の表示を付けません` : 'アップロードした画像・動画には、このサービスはAI生成の表示を付けません'}（SNSの決まりで表示が必要な場合は、SNSのアプリから投稿してください）。</p>
    ${code(`"options": {
  "<TikTokのアカウントID>": { "privacy_level": "<利用者が選んだ公開範囲>", "disable_comment": false, "disable_duet": true, "disable_stitch": true, "commercial_own": false, "commercial_paid": false, "auto_add_music": false },
  "<YouTubeのアカウントID>": { "privacy": "unlisted", "made_for_kids": false }
}`)}
    <h2>AIアシスタントから使う</h2>
    <p><b>MCP</b>：MCP（AIアシスタントとつなぐための共通の仕組み）に対応したアプリに、接続先URL <code>${b}/mcp</code> を追加してください。ログインして「許可する」を押すと接続できます（APIキー不要。使えるかどうかは、アプリ側の対応状況によります）。使えるツール：アカウントの一覧・契約と利用状況・投稿の作成（即時・予約・下書き）・一覧・下書きの予約化・取り消し・アップロード用URLの発行・URLからの取り込み${aiNames ? `・AIによる${aiNames}の生成` : ''}。</p>
    <p><b>Agent Skill（Claude Code）</b>：次の1行で導入できます。APIキーを環境変数 <code>SNS_SCHEDULER_API_KEY</code>、URLを <code>SNS_SCHEDULER_URL</code> に設定してください。</p>
    ${code(`mkdir -p ~/.claude/skills/sns-scheduler && curl -fsSL ${baseUrl || '$URL'}/service/docs/skill.md -o ~/.claude/skills/sns-scheduler/SKILL.md`)}
    <h2>そのほか</h2><ul><li><code>POST /api/v1/media/upload-url</code>：アップロード用の一時URL（15分・1回）を発行</li><li><code>POST /api/v1/media/import</code>：URLから画像・動画を取り込む（<code>{"url":"https://…"}</code>。https のURLだけ。Googleドライブの共有リンクは「リンクを知っている全員」が閲覧できる設定で、ウイルス確認の画面が出ない大きさのファイルに限ります）</li>${aiApi}${aiAv.text ? `<li><code>GET/POST /api/v1/auto-rules</code>：AIの自動運用ルール（<code>{"account_id","theme"（1行に1つで順番に使う）,"media":"none|image${aiAv.video ? '|video' : ''}","hours":[9,21],"mode":"draft|auto","options":{"privacy","made_for_kids"}（YouTubeのみ）}</code>。<code>mode:"auto"</code> は <code>confirm_auto:true</code> が必要。TikTokは対象外）。<code>PATCH /api/v1/auto-rules/{id}</code>（<code>{"enabled":false}</code>）で停止、<code>DELETE</code> で削除</li>` : ''}<li><code>GET /api/v1/posts?status=draft</code>：投稿の一覧</li><li><code>GET /api/v1/posts/{id}</code>：投稿の確認</li><li><code>POST /api/v1/posts/{id}/publish</code>：下書きを予約／投稿にする（<code>{"now":true}</code> または <code>{"scheduled_at":"…"}</code>）</li><li><code>DELETE /api/v1/posts/{id}</code>：予約・下書きの取り消し</li></ul>
    </div>`);
}

module.exports = { compareActive, lpPage, settingsChecklist, composePage, calendarPage, threadsRecentPage, apiDocsPage, landingPage, authPage, checkoutPage, checkoutResultPage, dashboardPage, legalPage, dataDeletionPage, metaDeletionStatusPage, adminServicePage };
