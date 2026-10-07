'use strict';
// ミチシルベ｜購入者向けWebアプリ（旧称：AI商品化実践システム）
// - 購入者アカウント（メール+パスワード）、購入者属性に合わせた進め方、90日/GATE進捗の保存
// - マイ商品（商品の基本情報・お客様からの代金の受け取り方）を一度登録すると、各プロンプトに自動入力される
// - AIプロンプト実行は購入者自身のAPIキーを都度受け取って中継するのみ。
//   キーはサーバー側に保存しない（lib/aiproxy.js を参照）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const STATIC_FILES = {
  '/manifest.json': { file: 'manifest.json', type: 'application/manifest+json; charset=utf-8' },
  '/sw.js': { file: 'sw.js', type: 'application/javascript; charset=utf-8' },
  '/icon-192.png': { file: 'icon-192.png', type: 'image/png' },
  '/icon-512.png': { file: 'icon-512.png', type: 'image/png' },
  '/icon-192-maskable.png': { file: 'icon-192-maskable.png', type: 'image/png' },
  '/icon-512-maskable.png': { file: 'icon-512-maskable.png', type: 'image/png' },
};
// 使い方ガイド（/guide）に載せる実際の画面キャプチャ。public/guide/ にあるものを自動で配信対象にする
for (const f of fs.readdirSync(path.join(PUBLIC_DIR, 'guide'))) {
  STATIC_FILES[`/guide/${f}`] = { file: `guide/${f}`, type: 'image/png' };
}

// ── .env 読み込み（自作。dotenv 等の依存は使わない）──
function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  });
}
(function loadEnv() {
  const own = fs.existsSync(path.join(process.cwd(), '.env')) ? path.join(process.cwd(), '.env') : path.join(APP_DIR, '.env');
  loadEnvFile(own);
})();

const { Users, GateProgress, DayProgress, Prompts, AiRuns, ProductProfile, Inquiries, AllowedEmails } = require('./db');
const auth = require('./lib/auth');
const { runPrompt, PROVIDERS } = require('./lib/aiproxy');
const postmesh = require('./lib/postmesh');
const { escapeHtml, jsonForScript, icon, layout, crest, guilloche, roman, pad2, initial } = require('./lib/ui');
const { PERSONAS, tipsFor, prepStepsFor } = require('./lib/personas');
const { planFields, fieldHtml, CLIENT_JS } = require('./lib/prompt-form');
const O = require('./lib/options');
const promptSeeds = require('./seeds/prompts');
const promptFields = require('./seeds/prompt-fields');
const gateDefs = require('./seeds/gates');

Prompts.sync(promptSeeds);

const PORT = parseInt(process.env.PORT || '3300', 10);
const STATUS_LABEL = { PENDING: '未着手', GREEN: '合格', YELLOW: '要修正', RED: 'やり直し' };
const TROUBLE_PROMPTS = [27, 30, 28, 29];

// お問い合わせの管理画面（/admin/inquiries）用の簡易パスワード認証。購入者アカウントとは別系統。
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
if (ADMIN_PASSWORD === 'changeme') console.warn('[warn] ADMIN_PASSWORD 未設定。本番では必ず設定してください（/admin/inquiries が誰でも見られる状態です）。');

const adminSessions = new Set();
function isAdminAuthed(req) {
  const sid = auth.parseCookies(req).get('admin_sid');
  return !!(sid && adminSessions.has(sid));
}
function adminSessionCookie(sid) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `admin_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`;
}

// ── 有料ツール（/tools/shukyaku・/tools/kanyu）用の簡易パスワード認証 ──
// ミチシルベの購入者アカウントとは別系統。Tips等で購入後、/contact経由で本人確認した
// 上でパスワードを案内する運用を想定（admin認証と同じ、依存ゼロの方式）。
function makeToolGate(envName, cookieName) {
  const password = process.env[envName] || '';
  if (!password) console.warn(`[warn] ${envName} 未設定。本番では必ず設定してください（${cookieName}のツールが誰でも使える状態です）。`);
  const sessions = new Set();
  return {
    isAuthed(req) {
      const sid = auth.parseCookies(req).get(cookieName);
      return !!(sid && sessions.has(sid));
    },
    tryLogin(input) {
      if (!password || input !== password) return null;
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.add(sid);
      return sid;
    },
    cookie(sid) {
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      return `${cookieName}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`; // 30日
    },
  };
}
const shukyakuGate = makeToolGate('SHUKYAKU_TOOL_PASSWORD', 'shukyaku_sid');
const kanyuGate = makeToolGate('KANYU_TOOL_PASSWORD', 'kanyu_sid');
const jidoutoukouGate = makeToolGate('JIDOUTOUKOU_TOOL_PASSWORD', 'jidoutoukou_sid');

// ── 有料ツール「かんたん版」（/tools/shukyaku-kantan・/tools/kanyu-kantan）用。
// 購入者自身のAPIキー入力を不要にする代わりに、運営者自身のAIプロバイダAPIキーを
// サーバー側で使う。購入者ごとに使用量を分けられないため、1日あたりの生成回数を
// ツールごとに上限で区切り、運営者の費用負担に歯止めをかける（下記 makeDailyLimiter）。
const shukyakuKantanGate = makeToolGate('SHUKYAKU_KANTAN_TOOL_PASSWORD', 'shukyaku_kantan_sid');
const kanyuKantanGate = makeToolGate('KANYU_KANTAN_TOOL_PASSWORD', 'kanyu_kantan_sid');

const SHARED_AI_PROVIDER = process.env.SHARED_AI_PROVIDER || 'openai';
const SHARED_AI_API_KEY = process.env.SHARED_AI_API_KEY || '';
if (!SHARED_AI_API_KEY) console.warn('[warn] SHARED_AI_API_KEY 未設定。かんたん版ツール（APIキー不要版）は利用できません。');

// 日付（UTC）が変わるとカウントをリセットする、依存ゼロの簡易レート制限。
// プロセス再起動でもリセットされる（永続化しない）。購入者ごとではなく、
// ツール全体で1日の合計生成回数を制限する設計。
function makeDailyLimiter(envName, defaultLimit) {
  const limit = parseInt(process.env[envName] || '', 10) || defaultLimit;
  let day = '';
  let count = 0;
  const rollIfNeeded = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; count = 0; }
  };
  return {
    limit,
    // 予約：呼び出し前に枠を1つ確保する。falseなら上限到達（APIは呼ばない）
    tryConsume() {
      rollIfNeeded();
      if (count >= limit) return false;
      count += 1;
      return true;
    },
    // 返却：実際には費用が発生しなかった（失敗・エラー）場合に枠を戻す
    refund() {
      rollIfNeeded();
      if (count > 0) count -= 1;
    },
  };
}
const shukyakuKantanLimiter = makeDailyLimiter('SHUKYAKU_KANTAN_DAILY_LIMIT', 30);
const kanyuKantanLimiter = makeDailyLimiter('KANYU_KANTAN_DAILY_LIMIT', 30);

const splitList = (v) => String(v || '').split('、').filter(Boolean);
const yen = (v) => `${Number(v).toLocaleString('ja-JP')}円`;

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function redirect(res, location, extraHeaders) {
  res.writeHead(302, { Location: location, ...(extraHeaders || {}) });
  res.end();
}

// フォームの同名キー（チェックボックス等）は配列で返す
function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/json')) {
        try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
        return;
      }
      const out = {};
      for (const [k, v] of new URLSearchParams(data)) {
        if (k in out) out[k] = [].concat(out[k], v);
        else out[k] = v;
      }
      resolve(out);
    });
    req.on('error', () => resolve({}));
  });
}

// ── 進捗の集計（ダッシュボード・プロンプト自動入力で共通利用）──
function progressOf(user) {
  const gates = GateProgress.listForUser(user.id);
  const doneDays = DayProgress.listForUser(user.id);
  const nextGate = gates.find((g) => g.status !== 'GREEN') || null;
  const nextDef = nextGate ? gateDefs.find((d) => d.no === nextGate.gate_no) : null;
  const greens = gates.filter((g) => g.status === 'GREEN');
  const started = Date.parse(user.created_at || '') || Date.now();
  return {
    gates, doneDays, nextGate, nextDef,
    greenCount: greens.length,
    auto: {
      daysSinceStart: Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1),
      maxDoneDay: doneDays.size ? Math.max(...doneDays) : '',
      completedGates: greens.length
        ? greens.map((g) => `GATE${g.gate_no} ${gateDefs.find((d) => d.no === g.gate_no).name}`).join('、')
        : 'まだなし',
      currentPhase: nextDef ? gateDefs.PHASE_OF_GATE[nextDef.no] : 'PHASE8',
      nextGateName: nextDef ? `GATE${nextDef.no} ${nextDef.name}` : '',
    },
  };
}

function reviewNosOf(def) {
  return new Set([...def.usePrompt.matchAll(/No\.(\d+)/g)].map((m) => parseInt(m[1], 10)));
}

// 今のGATEの手順の中で、このプロンプトの次にやることを決める（最後ならGATE判定へ）
function nextStepFor(pg, no) {
  const def = pg.nextDef;
  if (!def || !def.steps.includes(no)) return null;
  const i = def.steps.indexOf(no);
  return i < def.steps.length - 1 ? { type: 'prompt', no: def.steps[i + 1] } : { type: 'gate', gateNo: def.no, gateName: def.name };
}

// ── ページ: トップ（未ログイン）──
function homePage() {
  const feats = [
    ['今やることが、ひと目でわかる', 'ロードマップ上に現在地と「次に開くプロンプト」を表示します。迷ったら上から順に開くだけです。'],
    ['選ぶだけで、プロンプトが完成', '商品名や決済方法は一度登録すれば自動で入ります。ほとんどの項目はタップで選べます。'],
    ['あなたのレベルに合わせて案内', 'ビジネス初心者・AI初心者など、選んだ属性に合わせてヒントとAIへの頼み方が変わります。'],
    ['いつものChatGPTで、そのまま', 'APIキーは不要です。ワンタップでプロンプトをコピーして、ChatGPTを開けます。'],
  ];
  const journey = gateDefs.STAGES.map((st, i) => {
    const g = st.gates;
    const range = g.length > 1 ? `GATE ${g[0]}–${g[g.length - 1]}` : `GATE ${g[0]}`;
    return `<li><span class="rn">${roman(i + 1)}</span><div><b>${escapeHtml(st.title)}</b><small>${escapeHtml(st.sub)}・${range}</small></div></li>`;
  }).join('');
  return layout('ようこそ', `
    <section class="landing-hero lux">
      ${guilloche(420, 560, { lines: 22 })}
      <div class="hero-in">
        ${crest(60)}
        <div class="eyebrow">Your First Product, 90 Days</div>
        <h1>あなたの経験を、<br><em>売れる商品</em>に。</h1>
        <p>経験を商品にして、実際に売る。10のGATEに沿って一つずつ進むだけで、90日後にはそれができるようになっています。AIは、その道のりを助ける相棒です。</p>
        <div class="btn-row" style="margin-top:24px">
          <a class="btn btn-gold" href="/signup">はじめる</a>
          <a class="btn btn-outline-light" href="/login">ログイン</a>
        </div>
      </div>
    </section>
    <section>
      <h2><span class="sec-no">01</span>このアプリでできること</h2>
      <div class="card"><ol class="feat-list">${feats.map(([t, d], i) => `<li><span class="fn">${pad2(i + 1)}</span><div><b>${t}</b><p>${d}</p></div></li>`).join('')}</ol></div>
    </section>
    <section>
      <h2><span class="sec-no">02</span>90日の道のり</h2>
      <p class="muted" style="margin:0 0 14px">1日30分を目安にしたペースです。まとまった時間を取れる方は、前のめりにどんどん進めてもらって構いません。</p>
      <div class="card"><ol class="journey">${journey}</ol></div>
    </section>
    <section class="cta-card lux">
      ${guilloche(420, 300, { lines: 16, opacity: 0.18 })}
      <div class="hero-in">
        <div class="eyebrow c">Begin</div>
        <h3>今日から、ひとつめの商品づくりを。</h3>
        <a class="btn btn-gold btn-block" href="/signup">アカウントを作成</a>
        <a class="btn btn-quiet btn-block" style="color:rgba(246,239,224,.72);margin-top:4px" href="/login">アカウントをお持ちの方はログイン</a>
      </div>
    </section>
    <footer class="foot">${crest(30)}<div class="fname">ミチシルベ</div><div class="ftag">Your First Product, 90 Days</div>
      <div style="margin-top:10px"><a href="/contact">お問い合わせ</a></div></footer>
  `);
}

// ── ページ: 自己紹介文ジェネレーター（公開・ログイン不要の無料ツール）──
// SNS等での最初のきっかけとして無料で渡す「ツールそのもの」。テキストのプロンプトを
// コピーしてもらうのではなく、ここで直接AIに実行させて結果を返す（APIキーは購入者
// 〔この場合は閲覧者〕自身のものを毎回受け取り、保存しない。/api/run-promptと同じ方式）。
function jikoshoukaiToolPage() {
  const providers = Object.keys(PROVIDERS);
  return layout('自己紹介文ジェネレーター', `
    <section class="landing-hero lux" style="padding-bottom:22px">
      ${crest(50)}
      <div class="eyebrow">無料ツール・登録不要</div>
      <h1>自己紹介文<br><em>ジェネレーター</em></h1>
      <p>いくつか入力するだけで、AIがSNS用の自己紹介文を作ります。ログインは不要です。</p>
    </section>
    <section>
      <div class="card">
        <div class="field">
          <label class="lbl">どちらに近いですか？</label>
          <div class="chips">
            <label class="chip"><input type="radio" name="mode" value="normal" checked><span>副業・経験を発信したい方</span></label>
            <label class="chip"><input type="radio" name="mode" value="mlm"><span>ネットワークビジネスをしている方</span></label>
          </div>
        </div>
        <div class="field"><label class="lbl" id="labelA" for="fieldA">経験・得意なこと</label>
          <textarea id="fieldA" rows="2" placeholder="例：10年間、子育てをしながらパート事務をしてきました"></textarea></div>
        <div class="field"><label class="lbl" id="labelB" for="fieldB">伝えたい相手</label>
          <input id="fieldB" type="text" placeholder="例：これから副業を始めたい方"></div>
        <div class="field" id="fieldCRow"><label class="lbl" for="fieldC">大切にしていること</label>
          <input id="fieldC" type="text" placeholder="例：誠実に、相手の立場で考えること"></div>

        <details class="fold" style="margin-top:12px">
          <summary>${icon('lock', 18)}AIで生成する（APIキーが必要）</summary>
          <div style="margin-top:12px">
            <div class="notice info">APIキーはこのブラウザにのみ保存され、実行のたびにサーバーへ中継されるだけで保存されません。利用料はご自身のOpenAI／Anthropicのご契約に基づき発生します。</div>
            <div class="field" style="margin-top:12px"><label class="lbl" for="provider">プロバイダ</label>
              <select id="provider">${providers.map((pv) => `<option value="${pv}">${pv}</option>`).join('')}</select></div>
            <div class="field"><label class="lbl" for="apiKey">APIキー</label><input id="apiKey" type="password" placeholder="sk-... / このブラウザにのみ保存" autocomplete="off"></div>
            <button id="runBtn" type="button" class="btn btn-primary btn-block">自己紹介文を作る</button>
            <div id="result" style="margin-top:14px;white-space:pre-wrap;font-size:13.5px"></div>
          </div>
        </details>
      </div>
      <p class="muted center" style="margin-top:14px">生成された文章はそのまま使わず、事実と異なる部分が無いかご自身でご確認ください。もっと詳しく相談したい方は<a href="/contact">お問い合わせ</a>へ。</p>
    </section>
    <script>
      const KEY_STORE = 'ai-bijika:apiKey:';
      const providerSel = document.getElementById('provider');
      const keyInput = document.getElementById('apiKey');
      function loadKey() { try { keyInput.value = localStorage.getItem(KEY_STORE + providerSel.value) || ''; } catch (e) {} }
      providerSel.addEventListener('change', loadKey);
      loadKey();

      const LABELS = {
        normal: { a: '経験・得意なこと', b: '伝えたい相手', showC: true },
        mlm: { a: '自分の経験・大切にしていること', b: '扱っている商品・サービスの分野', showC: false },
      };
      function applyMode() {
        const mode = document.querySelector('input[name=mode]:checked').value;
        const L = LABELS[mode];
        document.getElementById('labelA').textContent = L.a;
        document.getElementById('labelB').textContent = L.b;
        document.getElementById('fieldCRow').style.display = L.showC ? '' : 'none';
      }
      document.querySelectorAll('input[name=mode]').forEach((el) => el.addEventListener('change', applyMode));
      applyMode();

      document.getElementById('runBtn').addEventListener('click', async () => {
        const mode = document.querySelector('input[name=mode]:checked').value;
        const provider = providerSel.value;
        const apiKey = keyInput.value.trim();
        const fieldA = document.getElementById('fieldA').value.trim();
        const fieldB = document.getElementById('fieldB').value.trim();
        const fieldC = document.getElementById('fieldC').value.trim();
        const resultEl = document.getElementById('result');
        if (!apiKey) { resultEl.textContent = 'APIキーを入力してください。'; return; }
        if (!fieldA || !fieldB) { resultEl.textContent = '必要な項目を入力してください。'; return; }
        try { localStorage.setItem(KEY_STORE + provider, apiKey); } catch (e) {}
        resultEl.textContent = '作成中…';
        try {
          const resp = await fetch('/api/tools/jikoshoukai', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ mode, provider, apiKey, fieldA, fieldB, fieldC })
          });
          const data = await resp.json();
          resultEl.textContent = resp.ok ? data.output : ('エラー: ' + data.error);
        } catch (e) {
          resultEl.textContent = '通信エラーが発生しました。';
        }
      });
    </script>
  `);
}

// ── 有料ツール：集客・接客ツール（980円、/tools/shukyaku）・ダウンライン拡大ツール（1,480円、/tools/kanyu）──
// いずれも docs/TipsMLM集客接客プロンプト案.md・docs/TipsMLMダウンライン拡大プロンプト案.md の
// 承認済みプロンプト文面をそのままモード定義として使う（文面の新規創作はしていない）。
const SHUKYAKU_MODES = [
  { key: 'sns', label: 'SNS投稿文', fields: [
      { id: 'a', label: '商品・サービス' },
      { id: 'b', label: '伝えたい魅力・体験' },
      { id: 'c', label: '投稿する媒体（Instagram・LINE公式等）' },
    ], build: (v) => `あなたはSNSマーケティングの専門家です。以下の情報をもとに、売り込み色を抑えた商品紹介の投稿文を3パターン作ってください。断定的な効果・効能の表現は使わないでください。新しい会員・ビジネスパートナーの募集を目的とした内容は含めないでください。\n\n【商品・サービス】：${v.a}\n【伝えたい魅力・体験】：${v.b}\n【投稿する媒体（Instagram・LINE公式等）】：${v.c}` },
  { key: 'follow', label: 'お客様へのフォローアップ文', fields: [
      { id: 'a', label: '商品' },
      { id: 'b', label: '購入・前回の連絡からの期間' },
      { id: 'c', label: '伝えたい一言' },
    ], build: (v) => `あなたは誠実な接客を大切にするスタッフです。以下の情報をもとに、お客様に送るフォローアップメッセージを作ってください。売り込み感を出さず、相手の状況を尋ねる姿勢を大切にしてください。新しい会員・ビジネスパートナーの募集を目的とした内容は含めないでください。\n\n【商品】：${v.a}\n【購入・前回の連絡からの期間】：${v.b}\n【伝えたい一言】：${v.c}` },
  { key: 'decline', label: 'お断りへの返信文', fields: [
      { id: 'a', label: '断られた内容・状況' },
    ], build: (v) => `あなたは誠実な接客対応ができるスタッフです。以下の状況で、お客様（または知人）からお断りの返事があった場合の、丁寧で押し付けがましくない返信文を作ってください。再度の勧誘や説得は含めないでください。\n\n【断られた内容・状況】：${v.a}` },
  { key: 'profile', label: '自己紹介文・プロフィール文', fields: [
      { id: 'a', label: '自分の経験・大切にしていること' },
      { id: 'b', label: '扱っている商品・サービスの分野' },
    ], build: (v) => `あなたはプロのコピーライターです。以下の情報をもとに、SNSのプロフィール欄に使える自己紹介文を作ってください。資格・肩書きを誇張せず、誠実な印象になるようにしてください。新しい会員・ビジネスパートナーの募集を目的とした内容は含めないでください。\n\n【自分の経験・大切にしていること】：${v.a}\n【扱っている商品・サービスの分野】：${v.b}` },
  { key: 'event', label: 'イベント・体験会の案内文', fields: [
      { id: 'a', label: 'イベント内容' },
      { id: 'b', label: '日時・場所' },
      { id: 'c', label: '参加してほしい人' },
    ], build: (v) => `あなたはイベント運営のアシスタントです。以下の情報をもとに、商品の体験会・交流会の案内文を作ってください。参加を強制するような表現や、過度な期待を抱かせる表現は避けてください。新しい会員・ビジネスパートナーの募集を目的とした案内文は作成しないでください。\n\n【イベント内容】：${v.a}\n【日時・場所】：${v.b}\n【参加してほしい人】：${v.c}` },
];
const KANYU_MODES = [
  { key: 'approach', label: '最初の声かけ文（法令上の開示義務に対応）', fields: [
      { id: 'a', label: '自分の名前' },
      { id: 'b', label: '取り扱う商品・サービス' },
      { id: 'c', label: '相手との関係性' },
    ], build: (v) => `あなたは法令を守って誠実にビジネスを紹介するアシスタントです。以下の情報をもとに、ネットワークビジネス（連鎖販売取引）への参加を誘う最初の声かけ文を作ってください。必ず文章の冒頭で、①自分の名前、②これがネットワークビジネス（連鎖販売取引）の勧誘であること、③取り扱う商品・サービスの名称、の3点を明確に伝えてください。これらを隠したり、後回しにしたりしないでください。断定的な収入の表現（必ず稼げる、誰でも成功する等）は使わないでください。\n\n【自分の名前】：${v.a}\n【取り扱う商品・サービス】：${v.b}\n【相手との関係性】：${v.c}` },
  { key: 'briefing', label: '説明会・説明の機会への案内文', fields: [
      { id: 'a', label: '説明会の形式（オンライン・対面等）' },
      { id: 'b', label: '日時・場所' },
      { id: 'c', label: '当日説明する内容' },
    ], build: (v) => `あなたは誠実にビジネス説明の機会を案内するアシスタントです。以下の情報をもとに、ネットワークビジネスの説明会・説明の機会に誘う案内文を作ってください。参加を強制するような表現は避け、興味がある場合のみの任意参加であることを明記してください。\n\n【説明会の形式（オンライン・対面等）】：${v.a}\n【日時・場所】：${v.b}\n【当日説明する内容】：${v.c}` },
  { key: 'faq', label: 'よくある質問への回答文', fields: [
      { id: 'a', label: 'よくある質問' },
      { id: 'b', label: '実際に伝えたい答えの要点' },
    ], build: (v) => `あなたは誠実にビジネスについて説明するアシスタントです。以下の質問に対して、断定的な収入の保証や誇張を避け、正直に答える回答文を作ってください。\n\n【よくある質問】：${v.a}\n【実際に伝えたい答えの要点】：${v.b}` },
  { key: 'coolingoff', label: 'クーリング・オフ・契約内容の説明文（法令遵守のための必須案内）', fields: [
      { id: 'a', label: '扱う商品・サービス' },
      { id: 'b', label: '入会にかかる費用' },
    ], build: (v) => `あなたは法令を守って契約内容を説明するアシスタントです。ネットワークビジネスへの入会を決めた方に対して、特定商取引法で定められたクーリング・オフ制度（契約から一定期間内は無条件で契約を解除できる権利）があることを、分かりやすく、隠さずに説明する文章を作ってください。\n\n【扱う商品・サービス】：${v.a}\n【入会にかかる費用】：${v.b}` },
  { key: 'checkin', label: '検討中の方へのフォローアップ文', fields: [
      { id: 'a', label: '相手の検討状況' },
    ], build: (v) => `あなたは誠実にフォローアップするアシスタントです。以下の情報をもとに、説明を聞いた後、まだ検討中の方への確認・フォローアップメッセージを作ってください。急かすような表現、繰り返しの強い勧誘は避けてください。\n\n【相手の検討状況】：${v.a}` },
];

// 副業初心者向け無料ツール。docs/Tips低価格商品案.md（300円）の3プロンプトと同一（意図的に無料公開に転用）
const FUKUGYOU_MODES = [
  { key: 'sns', label: 'SNS用の短い自己紹介文', fields: [
      { id: 'a', label: '経験・得意なこと' },
      { id: 'b', label: '伝えたい相手' },
      { id: 'c', label: '大切にしていること' },
    ], build: (v) => `あなたはプロのコピーライターです。以下の情報をもとに、SNSのプロフィール欄に使える100字程度の自己紹介文を3パターン作ってください。\n\n【経験・得意なこと】：${v.a}\n【伝えたい相手】：${v.b}\n【大切にしていること】：${v.c}` },
  { key: 'meet', label: '初対面の人にも伝わる自己紹介文', fields: [
      { id: 'a', label: '経験・得意なこと' },
      { id: 'b', label: '具体的なエピソード' },
      { id: 'c', label: '今取り組んでいること' },
    ], build: (v) => `あなたはプロのライターです。以下の情報をもとに、初めて会う人にも伝わるような300字程度の自己紹介文を作ってください。経験の具体的なエピソードを1つ盛り込んでください。\n\n【経験・得意なこと】：${v.a}\n【具体的なエピソード】：${v.b}\n【今取り組んでいること】：${v.c}` },
  { key: 'pitch', label: '商品・サービス紹介の書き出し文', fields: [
      { id: 'a', label: '商品・サービス' },
      { id: 'b', label: '対象者' },
      { id: 'c', label: '解決できる悩み' },
    ], build: (v) => `あなたはプロのセールスライターです。以下の情報をもとに、商品・サービスの紹介文の書き出し部分（最初の2〜3文）を3パターン作ってください。読んだ人が『自分に関係がある』と感じる書き出しにしてください。\n\n【商品・サービス】：${v.a}\n【対象者】：${v.b}\n【解決できる悩み】：${v.c}` },
];

function toolLoginPage(title, loginPath, error) {
  return layout(title, `
    <div class="auth">
      <div class="auth-head">${crest(50)}<div class="eyebrow c">Members</div><h1>${escapeHtml(title)}</h1>
        <p class="lead">購入時にご案内したパスワードを入力してください。</p></div>
      ${error ? `<div class="notice error" style="margin:0 0 14px">${icon('flag', 16)}<div>${escapeHtml(error)}</div></div>` : ''}
      <div class="card">
        <form method="POST" action="${loginPath}">
          <div class="field"><label class="lbl" for="password">パスワード</label>
            <input id="password" type="password" name="password" required autofocus></div>
          <button class="btn btn-primary btn-block" type="submit" style="margin-top:4px">入る</button>
        </form>
      </div>
      <p class="muted center">パスワードが分からない方は<a href="/contact">お問い合わせ</a>ください。</p>
    </div>
  `);
}

function multiModeToolPage(title, eyebrow, modes, apiPath) {
  const modeOptions = modes.map((m) => `<option value="${m.key}">${escapeHtml(m.label)}</option>`).join('');
  const fieldsJson = JSON.stringify(modes.map((m) => ({ key: m.key, label: m.label, fields: m.fields })));
  return layout(title, `
    <section class="landing-hero lux" style="padding-bottom:22px">
      ${crest(50)}
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>場面を選んで入力すると、AIがそのまま使える文章を作ります。</p>
    </section>
    <section>
      <div class="card">
        <div class="field"><label class="lbl" for="modeSel">場面を選ぶ</label>
          <select id="modeSel">${modeOptions}</select></div>
        <div id="fieldsArea"></div>

        <details class="fold" style="margin-top:12px">
          <summary>${icon('lock', 18)}AIで生成する（APIキーが必要）</summary>
          <div style="margin-top:12px">
            <div class="notice info">APIキーはこのブラウザにのみ保存され、実行のたびにサーバーへ中継されるだけで保存されません。利用料はご自身のOpenAI／Anthropicのご契約に基づき発生します。</div>
            <div class="field" style="margin-top:12px"><label class="lbl" for="provider">プロバイダ</label>
              <select id="provider">${Object.keys(PROVIDERS).map((pv) => `<option value="${pv}">${pv}</option>`).join('')}</select></div>
            <div class="field"><label class="lbl" for="apiKey">APIキー</label><input id="apiKey" type="password" placeholder="sk-... / このブラウザにのみ保存" autocomplete="off"></div>
            <button id="runBtn" type="button" class="btn btn-primary btn-block">文章を作る</button>
            <div id="result" style="margin-top:14px;white-space:pre-wrap;font-size:13.5px"></div>
          </div>
        </details>
      </div>
      <p class="muted center" style="margin-top:14px">生成された文章はそのまま使わず、事実と異なる部分が無いかご自身でご確認ください。</p>
    </section>
    <script>
      const MODES = ${fieldsJson};
      const modeSel = document.getElementById('modeSel');
      const fieldsArea = document.getElementById('fieldsArea');
      function renderFields() {
        const m = MODES.find((x) => x.key === modeSel.value);
        fieldsArea.innerHTML = m.fields.map((f, i) =>
          '<div class="field"><label class="lbl" for="f_' + f.id + '">' + f.label.replace(/</g, '&lt;') + '</label>' +
          '<textarea id="f_' + f.id + '" rows="2"></textarea></div>'
        ).join('');
      }
      modeSel.addEventListener('change', renderFields);
      renderFields();

      const KEY_STORE = 'ai-bijika:apiKey:';
      const providerSel = document.getElementById('provider');
      const keyInput = document.getElementById('apiKey');
      function loadKey() { try { keyInput.value = localStorage.getItem(KEY_STORE + providerSel.value) || ''; } catch (e) {} }
      providerSel.addEventListener('change', loadKey);
      loadKey();

      document.getElementById('runBtn').addEventListener('click', async () => {
        const mode = modeSel.value;
        const m = MODES.find((x) => x.key === mode);
        const provider = providerSel.value;
        const apiKey = keyInput.value.trim();
        const resultEl = document.getElementById('result');
        const values = {};
        for (const f of m.fields) values[f.id] = document.getElementById('f_' + f.id).value.trim();
        if (!apiKey) { resultEl.textContent = 'APIキーを入力してください。'; return; }
        if (m.fields.some((f) => !values[f.id])) { resultEl.textContent = '必要な項目を入力してください。'; return; }
        try { localStorage.setItem(KEY_STORE + provider, apiKey); } catch (e) {}
        resultEl.textContent = '作成中…';
        try {
          const resp = await fetch('${apiPath}', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ mode, provider, apiKey, values })
          });
          const data = await resp.json();
          resultEl.textContent = resp.ok ? data.output : ('エラー: ' + data.error);
        } catch (e) {
          resultEl.textContent = '通信エラーが発生しました。';
        }
      });
    </script>
  `, { noNav: true });
}

// multiModeToolPage()の「かんたん版」。購入者のAPIキー入力欄を持たず、サーバー側の
// 共有APIキー（SHARED_AI_API_KEY）で生成する。APIキーの用意・入力が不要な代わりに、
// 1日の生成回数に上限がある（limitLabelで画面に明記する）。
function multiModeToolPageNoKey(title, eyebrow, modes, apiPath, limitLabel) {
  const modeOptions = modes.map((m) => `<option value="${m.key}">${escapeHtml(m.label)}</option>`).join('');
  const fieldsJson = JSON.stringify(modes.map((m) => ({ key: m.key, label: m.label, fields: m.fields })));
  return layout(title, `
    <section class="landing-hero lux" style="padding-bottom:22px">
      ${crest(50)}
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>場面を選んで入力すると、AIがそのまま使える文章を作ります。APIキーの入力は不要です。</p>
    </section>
    <section>
      <div class="card">
        <div class="field"><label class="lbl" for="modeSel">場面を選ぶ</label>
          <select id="modeSel">${modeOptions}</select></div>
        <div id="fieldsArea"></div>
        <div class="notice info" style="margin-top:12px">${escapeHtml(limitLabel)}</div>
        <button id="runBtn" type="button" class="btn btn-primary btn-block" style="margin-top:12px">文章を作る</button>
        <div id="result" style="margin-top:14px;white-space:pre-wrap;font-size:13.5px"></div>
      </div>
      <p class="muted center" style="margin-top:14px">生成された文章はそのまま使わず、事実と異なる部分が無いかご自身でご確認ください。</p>
    </section>
    <script>
      const MODES = ${fieldsJson};
      const modeSel = document.getElementById('modeSel');
      const fieldsArea = document.getElementById('fieldsArea');
      function renderFields() {
        const m = MODES.find((x) => x.key === modeSel.value);
        fieldsArea.innerHTML = m.fields.map((f, i) =>
          '<div class="field"><label class="lbl" for="f_' + f.id + '">' + f.label.replace(/</g, '&lt;') + '</label>' +
          '<textarea id="f_' + f.id + '" rows="2"></textarea></div>'
        ).join('');
      }
      modeSel.addEventListener('change', renderFields);
      renderFields();

      document.getElementById('runBtn').addEventListener('click', async () => {
        const mode = modeSel.value;
        const m = MODES.find((x) => x.key === mode);
        const resultEl = document.getElementById('result');
        const values = {};
        for (const f of m.fields) values[f.id] = document.getElementById('f_' + f.id).value.trim();
        if (m.fields.some((f) => !values[f.id])) { resultEl.textContent = '必要な項目を入力してください。'; return; }
        resultEl.textContent = '作成中…';
        try {
          const resp = await fetch('${apiPath}', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ mode, values })
          });
          const data = await resp.json();
          resultEl.textContent = resp.ok ? data.output : ('エラー: ' + data.error);
        } catch (e) {
          resultEl.textContent = '通信エラーが発生しました。';
        }
      });
    </script>
  `, { noNav: true });
}

// ── ページ: サインアップ／ログイン ──
function authForm(kind, error) {
  const isSignup = kind === 'signup';
  return layout(isSignup ? 'アカウント作成' : 'ログイン', `
    <div class="auth">
      <div class="auth-head">
        ${crest(58)}
        <div class="eyebrow c">${isSignup ? 'Create Account' : 'Welcome Back'}</div>
        <h1>${isSignup ? 'アカウント作成' : 'ログイン'}</h1>
        <p class="lead">${isSignup ? '購入時のメールアドレスで登録してください。' : 'おかえりなさい。続きから進めましょう。'}</p>
      </div>
      ${error ? `<div class="notice error" style="margin:0 0 14px">${icon('flag', 16)}<div>${escapeHtml(error)}</div></div>` : ''}
      <div class="card">
        <form method="POST" action="${isSignup ? '/signup' : '/login'}">
          <div class="field"><label class="lbl" for="email">メールアドレス</label><input id="email" type="email" name="email" required autofocus autocomplete="email"></div>
          <div class="field"><label class="lbl" for="password">パスワード${isSignup ? '（8文字以上）' : ''}</label>
            <input id="password" type="password" name="password" required minlength="8" autocomplete="${isSignup ? 'new-password' : 'current-password'}"></div>
          <button class="btn btn-primary btn-block" type="submit" style="margin-top:4px">${isSignup ? 'アカウントを作成して始める' : 'ログイン'}</button>
        </form>
      </div>
      <p class="muted center">${isSignup ? 'すでにアカウントをお持ちの方は <a href="/login">ログイン</a>'
        : 'はじめての方は <a href="/signup">アカウント作成</a>'}</p>
    </div>
  `);
}

// ── ページ: お問い合わせ（ログイン前後どちらからでも使える）──
function contactPage(user, { sent, error, values } = {}) {
  const v = values || {};
  return layout('お問い合わせ', `
    <header class="page-head"><div class="eyebrow">Contact</div><h1>お問い合わせ</h1>
      <p class="lead">使い方やお支払いについてのご質問、不具合のご報告など、お気軽にお送りください。</p></header>
    ${sent ? `
      <div class="card lux acct">
        ${guilloche(420, 220, { lines: 12, opacity: 0.18 })}
        <div class="hero-in" style="text-align:center;padding:8px 0">
          <div style="margin-bottom:10px">${icon('check', 30)}</div>
          <h2 style="margin:0 0 8px">お問い合わせを受け付けました</h2>
          <p class="muted" style="color:rgba(243,238,228,.72)">内容を確認のうえ、ご入力いただいたメールアドレスへご連絡いたします。</p>
        </div>
      </div>
      <a class="btn btn-ghost btn-block" href="${user ? '/dashboard' : '/'}" style="margin-top:16px">${user ? 'ホームに戻る' : 'トップに戻る'}</a>
    ` : `
      ${error ? `<div class="notice error" style="margin:0 0 14px">${icon('flag', 16)}<div>${escapeHtml(error)}</div></div>` : ''}
      <form method="POST" action="/api/contact">
        <div class="card">
          <div class="field"><label class="lbl" for="name">お名前（任意）</label>
            <input id="name" type="text" name="name" value="${escapeHtml(v.name || '')}" maxlength="60" autocomplete="name"></div>
          <div class="field"><label class="lbl" for="email">メールアドレス</label>
            <input id="email" type="email" name="email" required maxlength="200" value="${escapeHtml(v.email || (user ? user.email : ''))}" autocomplete="email"></div>
          <div class="field"><label class="lbl">お問い合わせの種類</label>${chipsInput('category', O.CONTACT_CATEGORIES, v.category || '')}</div>
          <div class="field"><label class="lbl" for="message">お問い合わせ内容</label>
            <textarea id="message" name="message" required maxlength="2000" rows="7" placeholder="できるだけ詳しくお書きください">${escapeHtml(v.message || '')}</textarea></div>
        </div>
        <div class="sticky-actions">
          <button class="btn btn-primary btn-block" type="submit">送信する</button>
        </div>
      </form>
    `}
  `, { user, active: 'contact', noNav: !user });
}

// 購入時のメールアドレスが許可リスト（allowed_emails）に登録済みなら、自動的に認証済みにする。
// 未認証ユーザーがページを開くたびに呼ぶ（＝そのメールアドレス本人がアクセスした時点で消費される）。
function tryAutoActivateByEmail(user) {
  if (!user || user.license_active) return;
  const allowed = AllowedEmails.findByEmail(user.email);
  if (!allowed || allowed.status !== 'UNUSED') return;
  AllowedEmails.activate(user.email, user.id);
  Users.setLicenseActive(user.id, true);
  user.license_active = 1;
  // 体験版（期間・範囲限定）として登録されていた場合、そのままユーザーに引き継ぐ
  if (allowed.trial_expires_days || allowed.trial_gates) {
    const days = parseInt(allowed.trial_expires_days, 10);
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : '';
    Users.setTrial(user.id, { expiresAt, gates: allowed.trial_gates || '' });
    user.license_expires_at = expiresAt;
    user.license_gates = allowed.trial_gates || '';
  }
}

// 体験版の期限切れ判定。license_expires_at が空（無期限）なら常にfalse
function isLicenseExpired(user) {
  return !!(user.license_expires_at && new Date(user.license_expires_at).getTime() < Date.now());
}
// このユーザーがアクセスできるGATE番号の集合。null = 無制限（通常の購入者は全員これ）
function userAllowedGates(user) {
  if (!user.license_gates) return null;
  const set = new Set(String(user.license_gates).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0));
  return set.size ? set : null;
}
function isGateAllowed(user, gateNo) {
  const allowed = userAllowedGates(user);
  return !allowed || allowed.has(gateNo);
}
// プロンプト番号が属するGATE番号（steps・extra配列から逆引き）。該当GATEが無ければnull
function gateNoOfPrompt(promptNo) {
  const n = parseInt(promptNo, 10);
  const d = gateDefs.find((g) => g.steps.includes(n) || (g.extra || []).includes(n));
  return d ? d.no : null;
}
// 体験版でアクセス対象外のGATEを開こうとしたときの案内ページ
function trialLockedPage(user, gateNo) {
  const d = gateDefs.find((x) => x.no === gateNo);
  return layout('体験版の対象外です', `
    <header class="page-head"><div class="eyebrow">License</div><h1>このGATEは体験版の対象外です</h1></header>
    <div class="notice gold">${icon('bulb', 16)}<div>GATE${gateNo}「${escapeHtml(d ? d.name : '')}」は、本編（ミチシルベ）でご利用いただけます。気になる方はお気軽にお問い合わせください。</div></div>
    <a class="btn btn-primary btn-block" href="/dashboard" style="margin-top:14px">ダッシュボードに戻る</a>
    <a class="btn btn-block" href="/contact" style="margin-top:8px">お問い合わせ</a>
  `, { user, active: 'dashboard' });
}

// ── ページ: ライセンス状態（購入者だけが使えるようにする認証。購入時のメールアドレスで自動判定）──
function licensePage(user) {
  if (user.license_active && isLicenseExpired(user)) {
    const until = user.license_expires_at ? new Date(user.license_expires_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '';
    return layout('体験版の期間が終了しました', `
      <header class="page-head"><div class="eyebrow">License</div><h1>体験版の期間が終了しました</h1></header>
      <div class="notice gold">${icon('bulb', 16)}<div>体験版のご利用期間（${escapeHtml(until)}まで）が終了しました。続けてご利用になりたい方、本編にご興味がある方は、お気軽にお問い合わせください。</div></div>
      <a class="btn btn-primary btn-block" href="/contact" style="margin-top:14px">お問い合わせ</a>
    `, { user, noNav: true, active: 'account' });
  }
  if (user.license_active) {
    return layout('ライセンス', `
      <header class="page-head"><div class="eyebrow">License</div><h1>ライセンス認証済みです</h1></header>
      <div class="notice info">${icon('check', 16)}<div>このアカウントは認証済みです。すべての機能をお使いいただけます。</div></div>
      <a class="btn btn-primary btn-block" href="/dashboard" style="margin-top:14px">ホームへ進む</a>
    `, { user, noNav: true, active: 'account' });
  }
  return layout('ご利用にはメールアドレスの確認が必要です', `
    <header class="page-head"><div class="eyebrow">License</div><h1>まだご利用いただけません</h1>
      <p class="lead">ミチシルベは購入者専用のアプリです。ご購入時にお伝えいただいたメールアドレス（${escapeHtml(user.email)}）が運営者による確認を終えると、自動的にすべての機能が使えるようになります。入力していただくコードなどはありません。</p></header>
    <div class="notice gold">${icon('bulb', 16)}<div>お時間が経ってもこの画面のままの場合は、<a href="/contact">お問い合わせ</a>からご連絡ください。</div></div>
  `, { user, noNav: true, active: 'account' });
}

// ── ページ: オンボーディング（購入者属性の選択）──
const PERSONA_ICON = { both_beginner: 'sprout', ai_beginner: 'briefcase', biz_beginner: 'chip', experienced: 'compass' };

function onboardingPage(user, isChange) {
  const cur = user.persona || '';
  const cards = Object.entries(PERSONAS).map(([key, p]) => `
    <label><input type="radio" name="persona" value="${key}" ${cur === key ? 'checked' : ''} required>
      <div class="pc"><span class="pi">${icon(PERSONA_ICON[key] || 'user', 24)}</span><span class="tx"><b>${escapeHtml(p.label)}</b><small>${escapeHtml(p.desc)}</small></span><span class="mark"></span></div></label>`).join('');
  return layout('あなたについて', `
    <header class="page-head">
      <div class="eyebrow">${isChange ? 'Your Profile' : 'Get Started'}</div>
      <h1>いちばん近いものを選んでください</h1>
      <p class="lead">選んだ内容に合わせて、ヒントの出し方と、AIへの頼み方（説明の詳しさ）を調整します。あとからいつでも変更できます。</p>
    </header>
    <form method="POST" action="/api/persona">
      <input type="hidden" name="change" value="${isChange ? '1' : ''}">
      <div class="pick">${cards}</div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:20px">${isChange ? '変更を保存する' : 'はじめる'} ${icon('arrow', 18)}</button>
    </form>
  `, { user, noNav: !isChange, active: 'account' });
}

// ── ページ: ダッシュボード ──
function greeting() {
  const h = new Date(Date.now() + 9 * 3600e3).getUTCHours(); // 日本時間
  if (h >= 5 && h < 11) return 'おはようございます';
  if (h >= 11 && h < 18) return 'こんにちは';
  return 'こんばんは';
}

function heroHtml(pg, titles, profile) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const off = C * (1 - pg.greenCount / 10);
  const ring = `<div class="ring"><svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
      <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4E5BF"/><stop offset=".5" stop-color="#D6B878"/><stop offset="1" stop-color="#A9854A"/></linearGradient></defs>
      <circle cx="52" cy="52" r="${R}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="6"/>
      <circle cx="52" cy="52" r="36" fill="none" stroke="rgba(217,191,140,.22)" stroke-width="1"/>
      ${pg.greenCount > 0 ? `<circle class="prog" cx="52" cy="52" r="${R}" fill="none" stroke="url(#ringGrad)" stroke-width="6" stroke-linecap="round" style="--c:${C.toFixed(1)};--off:${off.toFixed(1)}"/>` : ''}
    </svg><div class="num"><div><b>${pg.greenCount}</b><span>of 10 Gates</span></div></div></div>`;
  const dayPct = Math.round((pg.doneDays.size / 90) * 100);
  const daybar = `<div class="daybar"><div class="track"><div class="fill" style="width:${dayPct}%"></div></div>
    <div class="meta"><span>90日チェックリスト</span><span><b>${pg.doneDays.size}</b> / 90 日</span></div></div>`;
  const stepRow = (href, label, first, i) => `<li><a class="${first ? 'first' : ''}" href="${href}"><span class="n">${i}</span><span class="t">${label}</span>${first ? '<span class="start">Start</span>' : ''}${icon('chevron', 16)}</a></li>`;
  if (!pg.nextDef) {
    return `<section class="hero lux">${guilloche(420, 360)}<div class="hero-in">
      <div class="hero-top">${ring}<div class="hero-next"><div class="eyebrow">Complete</div>
        <div class="gate"><span class="gno">ALL GATES</span><span class="gname">全GATE合格</span></div>
        <p class="why">お疲れさまでした。No.25で商品のシリーズ展開を考えてみましょう。</p></div></div>
      <ol class="hero-steps">${stepRow('/prompts/25', `No.25　${escapeHtml(titles[25] || '')}`, true, 1)}</ol>
      ${daybar}</div></section>`;
  }
  const d = pg.nextDef;
  const rows = d.steps.map((n, i) => stepRow(`/prompts/${n}`, `No.${n}　${escapeHtml(titles[n] || '')}`, i === 0, i + 1));
  const payReady = !!profile.payment_method;
  if (d.setupLink && (!payReady || !d.steps.length)) {
    rows.push(stepRow(d.setupLink.href, escapeHtml(payReady ? 'お客様からの代金の受け取り方を確認する' : d.setupLink.text), !d.steps.length, rows.length + 1));
  }
  return `<section class="hero lux">${guilloche(420, 380)}<div class="hero-in">
    <div class="hero-top">${ring}<div class="hero-next"><div class="eyebrow">Next Gate · ${escapeHtml(d.phase)}</div>
      <div class="gate"><span class="gno">GATE ${pad2(d.no)}</span><span class="gname">${escapeHtml(d.name)}</span></div>
      <p class="why">${d.steps.length ? '上から順にプロンプトを開いて進めましょう。' : 'このGATEは購入時の資料を見ながら進めます。'}</p></div></div>
    <ol class="hero-steps">${rows.join('')}</ol>
    ${daybar}
  </div></section>`;
}

function roadmapHtml(pg, persona, titles, openNo, profile, allowedGates) {
  const byNo = new Map(pg.gates.map((g) => [g.gate_no, g]));
  const nextNo = pg.nextGate ? pg.nextGate.gate_no : null;
  const stages = gateDefs.STAGES.map((st, si) => {
    const nodes = st.gates.map((no) => {
      const d = gateDefs.find((x) => x.no === no);
      if (allowedGates && !allowedGates.has(no)) {
        return `<li class="node locked" id="gate-${no}">
          <span class="dot">${icon('lock', 16)}</span>
          <details class="node-card">
            <summary><span class="t"><span class="gno">GATE ${pad2(no)}</span><b>${escapeHtml(d.name)}</b>
              <small>${escapeHtml(d.phase)}</small></span><span class="badge">体験版では未収録</span>${icon('chevron', 18, 'chev')}</summary>
            <div class="node-body">
              <div class="notice gold">${icon('bulb', 16)}<div>このGATEは体験版には含まれていません。本編（ミチシルベ）でご利用いただけます。</div></div>
            </div>
          </details>
        </li>`;
      }
      const g = byNo.get(no);
      const isLast = si === gateDefs.STAGES.length - 1 && no === st.gates[st.gates.length - 1];
      const cls = ['node', g.status === 'GREEN' ? 'done' : '', g.status === 'YELLOW' ? 'st-y' : '', g.status === 'RED' ? 'st-r' : '',
        no === nextNo ? 'current' : '', isLast ? 'last' : ''].filter(Boolean).join(' ');
      const reviews = reviewNosOf(d);
      const stepLi = [...d.steps, ...(d.extra || [])].map((n) => `<li><a href="/prompts/${n}"><span class="no">No.${n}</span>
        <span class="nm">${escapeHtml(titles[n] || '')}${reviews.has(n) ? '<span class="tag">GATE判定</span>' : ''}${(d.extra || []).includes(n) ? '<span class="tag">必要な人だけ</span>' : ''}</span>${icon('chevron', 16)}</a></li>`).join('');
      const ext = d.external ? `<li><div class="ext">${icon('lock', 16)}「${escapeHtml(d.external)}」はアプリ未収録です。購入時にお渡しした資料をご覧ください。</div></li>` : '';
      const setup = d.setupLink ? `<li><a href="${d.setupLink.href}"><span class="no">${icon('bank', 15)}</span><span class="nm">${escapeHtml(d.setupLink.text)}<span class="tag">${profile.payment_method ? '設定済み' : '未設定'}</span></span>${icon('chevron', 16)}</a></li>` : '';
      const tips = tipsFor(persona, no).map((t) => `<div class="tip">${icon('bulb', 18)}<div><b>${escapeHtml(t.tag)}</b>${escapeHtml(t.text)}</div></div>`).join('');
      const seg = ['GREEN', 'YELLOW', 'RED', 'PENDING'].map((s) => `<button type="submit" name="status" value="${s}" class="s-${s} ${g.status === s ? 'on' : ''}">${STATUS_LABEL[s]}</button>`).join('');
      const open = no === nextNo || no === openNo;
      return `<li class="${cls}" id="gate-${no}">
        <span class="dot">${g.status === 'GREEN' ? icon('check', 18) : no}</span>
        <details class="node-card" ${open ? 'open' : ''}>
          <summary><span class="t"><span class="gno">GATE ${pad2(no)}${no === nextNo ? '<span class="now-tag">Now</span>' : ''}</span><b>${escapeHtml(d.name)}</b>
            <small>${escapeHtml(d.phase)}</small></span><span class="badge st-${g.status}">${STATUS_LABEL[g.status]}</span>${icon('chevron', 18, 'chev')}</summary>
          <div class="node-body">
            <ul class="steps">${stepLi}${setup}${ext}</ul>
            ${tips}
            <form class="status-form" method="POST" action="/api/gate/${no}">
              <div class="lbl">GATE判定の結果を記録</div>
              <div class="seg">${seg}</div>
              <div class="seg-help">${d.selfJudge
                ? 'このGATEのプロンプト（または資料）の内容を読んで、ご自身で判断して記録してください。目安：大きな指摘がなければ合格／直すべき点があれば要修正／大きく見直しが必要ならやり直し。AIは「GREEN」等の判定そのものは出しません。'
                : '「GATE判定」のプロンプトでAIが出した判定（GREEN＝合格／YELLOW＝要修正／RED＝やり直し）をそのまま記録してください。'}</div>
            </form>
          </div>
        </details>
      </li>`;
    }).join('');
    return `<li class="stage"><div class="stage-head"><span class="roman">${roman(si + 1)}</span><b>${escapeHtml(st.title)}</b><span class="ph">${escapeHtml(st.sub.replace('PHASE', 'Phase '))}</span></div><ol class="roadmap">${nodes}</ol></li>`;
  }).join('');
  return `<ol class="roadmap">${stages}</ol>`;
}

function lineupHtml(pg, profile) {
  const st = (no) => pg.gates.find((g) => g.gate_no === no).status === 'GREEN';
  const p1State = st(8) ? '販売中' : st(5) ? '販売準備中' : st(1) ? '制作中' : '選定中';
  const p2State = st(10) ? '企画確定' : st(9) ? '企画中' : 'これから';
  const card = (no, name, state, meta, active, locked) => `<div class="lu-card ${active ? 'active' : ''} ${locked ? 'locked' : ''}">
      <div class="lu-head"><span class="lu-no">${no}</span><span class="lu-state">${locked ? icon('lock', 12) : ''}${escapeHtml(state)}</span></div>
      <div class="lu-name">${escapeHtml(name)}</div><div class="lu-meta">${escapeHtml(meta)}</div></div>`;
  const arrow = `<div class="lu-arrow">${icon('arrow', 20)}</div>`;
  return `<div class="lineup">
    ${card('Product 01', profile.product_name || '（未定）', p1State, [profile.product_format, profile.price_band].filter(Boolean).join('・') || 'GATE1〜9', true, false)}
    ${arrow}
    ${card('Product 02', '商品1の学びを活かした商品', p2State, 'GATE10・No.5を再利用', st(9), !st(9))}
    ${arrow}
    ${card('Series', 'シリーズ・上位商品', st(10) ? '検討中' : 'これから', 'No.25でシリーズ化', st(10), !st(10))}
  </div>`;
}

function dashboardPage(user, openNo) {
  const pg = progressOf(user);
  const titles = Object.fromEntries(Prompts.all().map((p) => [p.no, p.title]));
  const profile = ProductProfile.get(user.id);
  const persona = PERSONAS[user.persona];
  const prep = prepStepsFor(user.persona);
  const prepHtml = prep.length && pg.greenCount === 0 ? `
    <div class="card prep">
      <div class="card-title">${icon('flag', 18)}はじめに（準備）</div>
      <p class="muted">「${escapeHtml(persona.label)}」の方は、GATE1の前にこれだけ済ませておくとスムーズです。</p>
      <ul>${prep.map((s, i) => `<li><input type="checkbox" data-prep="${i}" aria-label="完了"><div>${s.href
        ? `<a href="${s.href}" ${s.external ? 'target="_blank" rel="noopener"' : ''}>${escapeHtml(s.text)}</a>` : escapeHtml(s.text)}</div></li>`).join('')}</ul>
    </div>
    <script>
      document.querySelectorAll('input[data-prep]').forEach(function(cb){
        var k = 'ai-bijika:prep:' + cb.dataset.prep;
        try { cb.checked = localStorage.getItem(k) === '1'; } catch (e) {}
        cb.addEventListener('change', function(){ try { localStorage.setItem(k, cb.checked ? '1' : '0'); } catch (e) {} });
      });
    </script>` : '';
  const profileNudge = profile.product_name ? '' : `
    <a class="card nudge" href="/product"><span class="ni">${icon('box', 22)}</span>
      <span class="tx"><b>マイ商品を登録しましょう</b><span class="muted">商品名・ターゲット・お支払い方法などが、各プロンプトに自動で入るようになります。</span></span>${icon('chevron', 18, 'chev')}</a>`;

  return layout('ホーム', `
    <header class="page-head">
      <div class="eyebrow">Dashboard</div>
      <h1>${greeting()}</h1>
      <div class="sub"><span>開始から<b>${pg.auto.daysSinceStart}</b>日目</span><a class="pill-link" href="/onboarding?change=1">${icon('user', 13)}${escapeHtml(persona.label)}</a><a class="pill-link" href="/guide">${icon('bulb', 13)}使い方ガイド</a></div>
    </header>
    ${heroHtml(pg, titles, profile)}
    ${prepHtml}
    ${profileNudge}
    <h2>${icon('map', 20)}ロードマップ</h2>
    <p class="muted">各GATEをタップすると、使うプロンプトと進め方のヒントが開きます。順番は強制ではありませんが、上から進めるのがおすすめです。</p>
    ${roadmapHtml(pg, user.persona, titles, openNo, profile, userAllowedGates(user))}
    <h2>${icon('box', 20)}商品ラインナップ</h2>
    <p class="muted">1つめの商品を売り始めたら、その学びを次の商品へつなげます。</p>
    ${lineupHtml(pg, profile)}
    <h2>${icon('check', 20)}90日チェックリスト</h2>
    <details class="card fold">
      <summary><span>完了した日をタップして記録（${pg.doneDays.size} / 90）</span>${icon('chevron', 18, 'chev')}</summary>
      ${dayGrid(pg.doneDays)}
    </details>
  `, { user, active: 'home' });
}

function dayGrid(doneDays) {
  let html = '<div class="day-grid">';
  for (let d = 1; d <= 90; d++) {
    const on = doneDays.has(d);
    html += `<label class="daycell${on ? ' done' : ''}"><input type="checkbox" data-day="${d}" ${on ? 'checked' : ''}>DAY${d}</label>`;
  }
  html += `</div><p class="muted" style="margin-top:10px">タップすると自動で保存されます。</p>
  <script>
    document.querySelectorAll('input[data-day]').forEach(function(cb){
      cb.addEventListener('change', function(){
        cb.closest('.daycell').classList.toggle('done', cb.checked);
        fetch('/api/day/' + cb.dataset.day, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ done: cb.checked }) });
      });
    });
  </script>`;
  return html;
}

// ── ページ: 使い方ガイド（初心者向け・「押すと何が起きるか」を明示）──
function guidePage(user, { welcome } = {}) {
  const step = (label, desc) => `<p style="margin:0 0 16px"><b>${label}</b><br><span class="muted">${desc}</span></p>`;
  const shot = (file, alt) => `<img src="/guide/${file}" alt="${escapeHtml(alt)}" style="width:100%;border-radius:12px;box-shadow:0 1px 2px rgba(14,26,34,.08),0 0 0 1px var(--line);margin:2px 0 16px;display:block">`;
  return layout('使い方ガイド', `
    <header class="page-head">
      <div class="eyebrow">Guide</div>
      <h1>${welcome ? 'はじめに、使い方を確認しましょう' : '使い方ガイド'}</h1>
      <p class="lead">実際の画面と一緒に、ボタンを押すと何が起きるかをまとめました。迷ったら、いつでもこのページに戻ってきてください。</p>
    </header>

    <div class="card">
      <div class="card-title">${icon('home', 18)}画面下の4つのタブ</div>
      ${shot('tabbar.png', '画面下のタブ：ホーム・プロンプト・マイ商品・アカウント')}
      ${step('ホーム', '今の進み具合と、次にやることが分かる場所です。迷ったら、まずここを開いてください。')}
      ${step('プロンプト', 'AIに頼むときの文章（プロンプト）の一覧です。')}
      ${step('マイ商品', '商品の情報と、お客様からの代金の受け取り方を登録する場所です。')}
      ${step('アカウント', '属性の変更・お問い合わせ・ログアウトができます。')}
    </div>

    <div class="card">
      <div class="card-title">${icon('external', 18)}プロンプト画面のボタン</div>
      ${shot('copy-open.png', '「コピー」ボタンと「ChatGPTで開く」ボタン')}
      ${step('「コピー」を押すと', '完成したプロンプトの文章がコピーされます。ChatGPTの入力欄に貼り付けて使います。')}
      ${step('「ChatGPTで開く」を押すと', 'コピーと同時に、ChatGPTの画面が新しく開きます。入力欄が空のときは、長押しして「ペースト」を選ぶだけでOKです。')}
      ${shot('chatgpt-buttons.png', 'ChatGPTの画面イメージ：貼り付け・送信・回答のコピーの場所（実際の画面と多少異なる場合があります）')}
      ${step('①貼り付け', '入力欄が空のときは、その欄を指で押したままにする（長押し）と「ペースト」という小さなメニューが出てくるので、それをタップします。文字を自分で打ち込む必要はありません。')}
      ${step('②送信', '貼り付けたら、入力欄の右にある黒い丸のボタン（上向きの矢印マーク）を押します。これでChatGPTに送られます。')}
      ${step('③回答をコピー', 'ChatGPTが答え終わったら、回答の下に小さいアイコンが並びます。四角が2つ重なったアイコンを押すと、回答全体がコピーされます。')}
      ${shot('return-toast.png', 'ChatGPTから戻ってくると出る通知と、この先の案内')}
      ${step('ChatGPTから戻るには', 'スマホの「アプリの切り替え」（画面の下から上にスワイプ）からこの画面に戻ります。途中で左上に「×」だけがある真っ白の画面が出たら、それはChatGPTアプリを開くための一時的な画面なので、その「×」をタップして閉じてください。戻ってくると、上のような通知で次にやることを自動でお知らせします。')}
      ${shot('nextstep.png', '「次のステップ」カードと進むボタン（オレンジの枠＝押す場所）')}
      ${step('「次のステップ」を押すと', '今のGATEで次に使うプロンプトへ移動します。最後まで進んでいれば、GATEの判定を記録する画面に移動します。')}
    </div>

    <div class="card">
      <div class="card-title">${icon('flag', 18)}GATEの判定ボタン</div>
      <p class="muted" style="margin:0 0 14px">各GATEの手順を終えたら、ホーム画面でそのGATEを開き、3つのうちどれかを選びます。</p>
      ${shot('gate-judge.png', 'GATE判定の3つのボタン（オレンジの枠＝合格ボタンの例）')}
      ${step('「合格」を押すと', 'そのGATEが完了になり、次のGATEに進めるようになります。')}
      ${step('「要修正」を押すと', 'そのGATEはまだ完了になりません。指摘された点をAIにもう一度直してもらってから、あらためて判定してください。')}
      ${step('「やり直し」を押すと', '前の工程まで戻って考え直すサインです。無理に先へ進めなくて大丈夫です。')}
    </div>

    <div class="card">
      <div class="card-title">${icon('box', 18)}マイ商品・お支払いの設定</div>
      ${shot('payment-chips.png', 'お客様のお支払い方法を選ぶチップ')}
      <p class="muted" style="margin:0">商品名やターゲットなどを一度登録すると、以後すべてのプロンプトに自動で入るようになります。お客様からの代金の受け取り方（銀行振込・PayPal）を設定すると、お客様に送る案内文も自動で作られます。</p>
    </div>

    <div class="card">
      <div class="card-title">${icon('bulb', 18)}それでも分からないときは</div>
      <p class="muted" style="margin:0">「プロンプト」タブの「困ったときに使う」に、進め方に迷ったとき・時間が足りないときのためのプロンプトがあります。それでも分からなければ、<a href="/contact">お問い合わせ</a>からご連絡ください。</p>
    </div>

    ${welcome ? `<a class="btn btn-primary btn-block" href="/dashboard" style="margin-top:6px">ホームへ進む ${icon('arrow', 16)}</a>` : ''}
  `, { user, active: 'guide', noNav: !!welcome });
}

// ── ページ: プロンプト一覧 ──
function promptsPage(user) {
  const prompts = Prompts.all();
  const pg = progressOf(user);
  const rec = pg.nextDef ? [...pg.nextDef.steps, ...(pg.nextDef.extra || [])] : [];
  const row = (p, isRec) => `<a class="row-link" href="/prompts/${p.no}"><span class="no"><small>No.</small><em>${p.no}</em></span>
    <span class="t"><b>${escapeHtml(p.title)}${isRec ? '<span class="rec">今使う</span>' : ''}</b><small>${escapeHtml(p.timing || p.phase)}</small></span>${icon('chevron', 18, 'chev')}</a>`;
  const byNo = new Map(prompts.map((p) => [p.no, p]));
  return layout('プロンプト', `
    <header class="page-head">
      <div class="eyebrow">Prompts</div>
      <h1>AIプロンプト</h1>
      <p class="lead">項目を選ぶだけでプロンプトが完成します。そのままChatGPTで使えます。</p>
    </header>
    ${rec.length ? `<h2>${icon('flag', 20)}今のGATEで使う（GATE${pg.nextDef.no} ${escapeHtml(pg.nextDef.name)}）</h2>
      <div class="rows">${rec.map((n) => byNo.get(n)).filter(Boolean).map((p) => row(p, true)).join('')}</div>` : ''}
    <h2>${icon('bulb', 20)}困ったときに使う</h2>
    <div class="rows">${TROUBLE_PROMPTS.map((n) => row(byNo.get(n), false)).join('')}</div>
    <h2>${icon('prompt', 20)}すべてのプロンプト</h2>
    <div class="rows">${prompts.map((p) => row(p, rec.includes(p.no))).join('')}</div>
  `, { user, active: 'prompts' });
}

// ── ページ: プロンプト詳細（選択式フォーム → 完成プロンプト → ChatGPT/AI実行）──
function promptDetailPage(user, p) {
  const pg = progressOf(user);
  const profile = ProductProfile.get(user.id);
  profile.sale_price_label = profile.sale_price ? `${yen(profile.sale_price)}（税込）` : '';
  const persona = PERSONAS[user.persona];
  const { occ, fields } = planFields(p.body, promptFields[p.no] || {});
  const ctx = { profile, auto: pg.auto };
  const formHtml = fields.length
    ? fields.map((f) => fieldHtml(f, ctx)).join('')
    : '<p class="muted">このプロンプトは入力項目がありません。そのまま使えます。</p>';
  const providers = Object.keys(PROVIDERS);
  const next = nextStepFor(pg, p.no);
  const nextPrompt = next && next.type === 'prompt' ? Prompts.get(next.no) : null;
  return layout(`No.${p.no} ${p.title}`, `
    <a href="/prompts" class="btn btn-quiet back" style="padding-left:0">${icon('chevron', 16)}<span style="margin-left:-4px">プロンプト一覧</span></a>
    <header class="detail-head">
      <div class="ghost-no" aria-hidden="true">${p.no}</div>
      <div class="eyebrow">Prompt No. ${p.no}</div>
      <h1>${escapeHtml(p.title)}</h1>
      <div class="meta-chips"><span>${escapeHtml(p.phase)}</span><span>使うタイミング：${escapeHtml(p.timing || '―')}</span></div>
    </header>

    <div class="card">
      <div class="card-title"><span class="step-no">1</span>選ぶだけで入力できます</div>
      <form id="pbForm" onsubmit="return false">${formHtml}
        ${persona ? `<label class="chip" style="margin-top:14px"><input type="checkbox" id="usePreamble" checked><span>${icon('user', 16)}「${escapeHtml(persona.label)}」向けに説明してもらう</span></label>` : ''}
      </form>
    </div>

    <div class="card doc">
      <span class="ribbon">Your Prompt</span>
      <div class="card-title"><span class="step-no">2</span>完成したプロンプト</div>
      <textarea id="promptBody" class="pb-out" rows="10" aria-label="完成したプロンプト"></textarea>
      <div id="missMsg" class="miss"></div>
      <p class="hint">上の項目を変更すると、この欄は作り直されます。細かい修正は最後にこの欄で行ってください。</p>
      <div class="notice info" style="margin-top:10px">${icon('external', 16)}<div>「ChatGPTで開く」を押すと、このプロンプトは自動でコピーされます。スマホにChatGPTアプリが入っているとアプリが開き、入力欄が空のことがあります。そのときは入力欄を長押しして「ペースト」を押すだけでOKです（打ち込む必要はありません）。<br><br>まれに、アプリではなくブラウザでChatGPTのページが開くことがあります（前回のChatGPTアプリを完全に閉じずに残していると起きやすいようです）。その場合は一度ChatGPTアプリをスマホの「アプリの切り替え」から上にスワイプして完全に閉じてから、もう一度「ChatGPTで開く」を押すとアプリが開きやすくなります。
        <img src="/guide/chatgpt-buttons.png" alt="ChatGPTの画面イメージ：貼り付け・送信・回答のコピーの場所" style="width:100%;border-radius:10px;margin-top:12px;display:block">
        <span class="muted" style="display:block;margin-top:6px">①長押しして「ペースト」→②丸いボタンで送信→回答が出たら③のアイコンでコピー（実際の画面と多少異なる場合があります）。</span>
      </div></div>
      <div class="notice info" style="margin-top:10px">${icon('flag', 16)}<div><b>この画面への戻り方</b>：ChatGPTでの作業が終わったら、スマホの「アプリの切り替え」（画面の下から上にスワイプすると出てきます）から、この画面に戻ってください。その途中で、<b>左上に「×」だけがある真っ白の画面</b>が出ることがあります。これはChatGPTアプリを開くための一時的な画面なので、そのまま左上の「×」をタップして閉じてください。閉じると、この画面に戻ってきます（戻ってくると、次にやることを自動でお知らせします）。</div></div>
      <div class="notice gold" style="margin-top:10px">${icon('bulb', 16)}<div>回答が一般的・浅いと感じたら、そのまま使わずに「もっと具体的に」「私の経験をもっと反映して」のように聞き返してください。それだけで内容の質が大きく変わります。</div></div>
      ${p.note && p.note !== '―' ? `<div class="notice warn" style="margin-top:10px">${icon('flag', 16)}<div>注意：${escapeHtml(p.note)}</div></div>` : ''}
    </div>

    <div class="sticky-actions">
      <div class="btn-row">
        <button id="copyBtn" type="button" class="btn btn-ghost">${icon('copy', 18)}コピー</button>
        <button id="openChatGptBtn" type="button" class="btn btn-primary">${icon('external', 18)}ChatGPTで開く</button>
      </div>
      <p id="copyMsg" class="muted" style="margin:6px 2px 0;text-align:center"></p>
    </div>

    ${next ? `<div class="card" id="nextStepCard" style="margin-top:14px">
      <div class="card-title">${icon('flag', 18)}次のステップ</div>
      ${nextPrompt
        ? `<p class="muted">ChatGPTの回答を確認できたら、続けて次に進みましょう。</p>
           <a class="btn btn-primary btn-block" style="white-space:normal;height:auto;line-height:1.4" href="/prompts/${nextPrompt.no}">No.${nextPrompt.no} ${escapeHtml(nextPrompt.title)}へ ${icon('arrow', 16)}</a>`
        : `<p class="muted">これでGATE${next.gateNo}「${escapeHtml(next.gateName)}」の手順は最後です。判定結果をダッシュボードで記録しましょう。</p>
           <a class="btn btn-primary btn-block" style="white-space:normal;height:auto;line-height:1.4" href="/dashboard?open=${next.gateNo}#gate-${next.gateNo}">GATE${next.gateNo}の判定を記録する ${icon('arrow', 16)}</a>`}
    </div>` : ''}

    <details class="card fold" style="margin-top:14px">
      <summary><span style="display:flex;gap:8px;align-items:center">${icon('lock', 18)}APIキーでアプリ内から実行する（上級者向け）</span>${icon('chevron', 18, 'chev')}</summary>
      <div style="margin-top:12px">
        <div class="notice info">APIキーはこのブラウザにのみ保存され、実行のたびにサーバーへ中継されるだけで保存されません。利用料はご自身のOpenAI／Anthropicのご契約に基づき発生します。</div>
        <div class="field" style="margin-top:12px"><label class="lbl" for="provider">プロバイダ</label>
          <select id="provider">${providers.map((pv) => `<option value="${pv}">${pv}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl" for="apiKey">APIキー</label><input id="apiKey" type="password" placeholder="sk-... / このブラウザにのみ保存" autocomplete="off"></div>
        <button id="runBtn" type="button" class="btn btn-primary btn-block">実行する</button>
        <div id="result" style="margin-top:14px;white-space:pre-wrap;font-size:13.5px"></div>
      </div>
    </details>

    <script type="application/json" id="pb-data">${jsonForScript({ no: p.no, body: p.body, occ, preamble: persona ? persona.preamble : '' })}</script>
    <script>${CLIENT_JS}</script>
    <script>
      const CHATGPT_URL_LIMIT = 1500; // これを超える長さはURL方式が不安定になりうるため、URLには載せずコピーで渡す
      // 同期コピー（ボタンを押した瞬間に完了させる。直後に別タブ・別アプリへ移っても確実にクリップボードへ入るように）
      function copySync(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:12pt';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        return ok;
      }
      async function copyText(text) {
        if (copySync(text)) return true;
        try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
      }
      const PASTE_HELP = 'ChatGPTアプリが開いて入力欄が空のときは、入力欄を長押し→「ペースト」で貼り付けて送信してください。';
      let awaitingReturn = false;
      document.getElementById('copyBtn').addEventListener('click', async () => {
        const text = document.getElementById('promptBody').value;
        const msgEl = document.getElementById('copyMsg');
        const ok = await copyText(text);
        msgEl.textContent = ok
          ? 'コピーしました。ChatGPTの入力欄を長押し→「ペースト」で貼り付けてください。'
          : 'コピーできませんでした。プロンプト欄を長押しして全選択→コピーしてください。';
        if (ok) toast('コピーしました');
      });
      document.getElementById('openChatGptBtn').addEventListener('click', () => {
        const text = document.getElementById('promptBody').value;
        const msgEl = document.getElementById('copyMsg');
        const copied = copySync(text);
        const tooLong = text.length > CHATGPT_URL_LIMIT;
        // 末尾に毎回変わる値を付け、iOS/Androidが「前回と同じURL」とみなしてWeb版に留まる（アプリへの引き継ぎが起きない）のを避ける
        const cacheBust = 't=' + Date.now();
        const url = tooLong ? 'https://chatgpt.com/?' + cacheBust : 'https://chatgpt.com/?q=' + encodeURIComponent(text) + '&' + cacheBust;
        window.open(url, '_blank', 'noopener');
        awaitingReturn = true;
        const done = function(ok){
          if (ok) toast('プロンプトをコピーしました');
          msgEl.textContent = ok
            ? (tooLong ? 'プロンプトが長いため自動入力はされません。コピー済みなので、' : 'プロンプトをコピーしました。') + PASTE_HELP
            : 'ChatGPTを開きました。入力欄が空の場合は、この画面に戻って「コピー」を押し、貼り付けてください。';
        };
        if (copied || !navigator.clipboard) { done(copied); return; }
        navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(false); });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !awaitingReturn) return;
        awaitingReturn = false;
        const card = document.getElementById('nextStepCard');
        if (!card) return;
        toast('ChatGPTの回答が出たら、次のステップに進みましょう');
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
      });
      const KEY_STORE = 'ai-bijika:apiKey:';
      const providerSel = document.getElementById('provider');
      const keyInput = document.getElementById('apiKey');
      function loadKey() { try { keyInput.value = localStorage.getItem(KEY_STORE + providerSel.value) || ''; } catch (e) {} }
      providerSel.addEventListener('change', loadKey);
      loadKey();
      document.getElementById('runBtn').addEventListener('click', async () => {
        const provider = providerSel.value;
        const apiKey = keyInput.value.trim();
        const promptText = document.getElementById('promptBody').value;
        const resultEl = document.getElementById('result');
        if (!apiKey) { resultEl.textContent = 'APIキーを入力してください。'; return; }
        try { localStorage.setItem(KEY_STORE + provider, apiKey); } catch (e) {}
        resultEl.textContent = '実行中…';
        try {
          const resp = await fetch('/api/run-prompt', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ provider, apiKey, promptText, promptNo: ${p.no} })
          });
          const data = await resp.json();
          resultEl.textContent = resp.ok ? data.output : ('エラー: ' + data.error);
        } catch (e) {
          resultEl.textContent = '通信エラーが発生しました。';
        }
      });
    </script>
  `, { user, active: 'prompts' });
}

// ── ページ: マイ商品（商品の基本情報・お客様からの代金の受け取り方）──
function chipsInput(name, options, current, { multi = false, other = false } = {}) {
  const type = multi ? 'checkbox' : 'radio';
  const cur = new Set(multi ? String(current || '').split('、').filter(Boolean) : [current]);
  const isOther = other && current && !multi && !options.includes(current);
  const chips = options.map((o) => `<label class="chip"><input type="${type}" name="${name}" value="${escapeHtml(o)}" ${cur.has(o) ? 'checked' : ''}><span>${escapeHtml(o)}</span></label>`).join('');
  const otherChip = other ? `<label class="chip"><input type="${type}" name="${name}" value="__other" ${isOther ? 'checked' : ''} data-other-for="${name}"><span>その他</span></label>` : '';
  const otherInput = other ? `<input type="text" name="${name}_other" class="other-input ${isOther ? '' : 'hide'}" data-other-input="${name}" value="${isOther ? escapeHtml(current) : ''}" placeholder="自由に入力" maxlength="120">` : '';
  return `<div class="chips">${chips}${otherChip}</div>${otherInput}`;
}

// お客様（あなたの商品を買う人）へ送る「お支払い方法のご案内」。保存済みの内容から組み立てる
function paymentGuide(pf) {
  const methods = new Set(splitList(pf.payment_method));
  const P = O.PAY;
  const sections = [];
  if (methods.has(P.BANK) && pf.bank_name && pf.account_number && pf.account_holder) {
    sections.push([
      '■銀行振込',
      `銀行名：${pf.bank_name}`,
      `支店名：${pf.bank_branch || '（支店名）'}`,
      `口座種別：${pf.account_type || '普通'}`,
      `口座番号：${pf.account_number}`,
      `口座名義：${pf.account_holder}`,
      ...(pf.pay_deadline && pf.pay_deadline !== '指定しない' ? [`お振込期限：${pf.pay_deadline}`] : []),
      `※${pf.transfer_note || O.TRANSFER_NOTES[0]}`,
    ].join('\n'));
  }
  if (methods.has(P.PAYPAL) && pf.pay_url_paypal) sections.push(['■PayPal', 'お客様側もPayPalアカウントへのご登録が必要です。下記のリンクからお支払いください。', pf.pay_url_paypal].join('\n'));
  if (!sections.length) return '';
  return [
    '【お支払い方法のご案内】',
    `このたびは${pf.product_name ? `「${pf.product_name}」に` : ''}お申し込みいただき、ありがとうございます。`,
    ...(pf.sale_price ? [`お支払い金額：${yen(pf.sale_price)}（税込）`] : []),
    sections.length > 1 ? '以下のいずれかの方法でお支払いをお願いいたします。' : '以下の方法でお支払いをお願いいたします。',
    '',
    sections.join('\n\n'),
    '',
    '※ご入金を確認でき次第、商品のお届けについてご連絡いたします。',
  ].join('\n');
}

function productPage(user, { saved } = {}) {
  const pf = ProductProfile.get(user.id);
  const methods = new Set(splitList(pf.payment_method));
  const guide = paymentGuide(pf);
  const masked = pf.account_number ? `••••${pf.account_number.slice(-3)}` : '';
  const block = (method, title, inner) => `<div class="pay-block ${methods.has(method) ? '' : 'hide'}" data-pay-block="${escapeHtml(method)}">
      <div class="pay-block-title">${escapeHtml(title)}</div>${inner}</div>`;
  const urlField = (name, label, placeholder, hint) => `<div class="field"><label class="lbl" for="${name}">${label}</label>
      <input id="${name}" type="url" name="${name}" value="${escapeHtml(pf[name])}" maxlength="300" placeholder="${placeholder}" autocomplete="off">
      <div class="hint">${hint}</div></div>`;
  return layout('マイ商品', `
    <header class="page-head">
      <div class="eyebrow">My Product</div>
      <h1>マイ商品</h1>
      <p class="lead">あなたが作って売る商品の情報です。ここで登録した内容は各プロンプトに自動で入ります。決まっていない項目は空欄のままで大丈夫です。</p>
    </header>
    ${saved ? `<script>document.addEventListener('DOMContentLoaded', function () { toast('保存しました'); });</script>` : ''}
    <form method="POST" action="/api/product" id="productForm">
      <h2><span class="sec-no">01</span>商品の基本</h2>
      <div class="card">
        <div class="field"><label class="lbl" for="product_name">商品名（仮でもOK）</label>
          <input id="product_name" type="text" name="product_name" value="${escapeHtml(pf.product_name)}" maxlength="80" placeholder="例：はじめての家計簿テンプレート"></div>
        <div class="field"><label class="lbl">商品の形式</label>${chipsInput('product_format', O.PRODUCT_FORMATS, pf.product_format)}</div>
        <div class="field"><label class="lbl" for="product_type">商品タイプ</label>
          <select id="product_type" name="product_type">${O.PRODUCT_TYPES.map((t) => `<option ${pf.product_type === t || (!pf.product_type && t === '未判定') ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
          <div class="hint">分からなければ「未判定」のままで、<a href="/prompts/6">No.6 商品タイプ判定</a>を使ってください。</div></div>
        <div class="field"><label class="lbl">ターゲット（誰に届けるか）</label>${chipsInput('target', O.TARGETS, pf.target, { other: true })}</div>
        <div class="field"><label class="lbl" for="pain">ターゲットの悩み（一言で）</label>
          <input id="pain" type="text" name="pain" value="${escapeHtml(pf.pain)}" maxlength="120" placeholder="例：家計簿が続かない"></div>
        <div class="field"><label class="lbl">集客経路<span class="req-badge">複数選択可</span></label>${chipsInput('channel', O.CHANNELS, pf.channel, { multi: true })}</div>
        <div class="field"><label class="lbl">価格帯（予定）</label>${chipsInput('price_band', O.PRICE_BANDS, pf.price_band)}</div>
      </div>

      <h2 id="payment"><span class="sec-no">02</span>お客様からの代金の受け取り方</h2>
      <p class="muted">あなたの商品を買ってくれたお客様に、代金を支払ってもらうための設定です（このアプリの利用料の支払いとは関係ありません）。</p>
      <div class="card">
        <div class="field"><label class="lbl" for="sale_price">販売価格（税込）</label>
          <div class="yen-wrap"><input id="sale_price" type="text" name="sale_price" inputmode="numeric" value="${escapeHtml(pf.sale_price)}" maxlength="11" placeholder="例：2980"><span>円</span></div>
          <div class="hint">決まっていなければ空欄でOK。販売ページのプロンプト（No.17）とお支払い案内文に入ります。</div></div>
        <div class="field"><label class="lbl">お客様のお支払い方法<span class="req-badge">複数選択可</span></label>${chipsInput('payment_method', O.PAYMENT_METHODS, pf.payment_method, { multi: true })}
          <div class="hint">選んだ方法は販売ページのプロンプト（No.17）に自動で反映されます。口座番号やURLはAIには送りません。</div></div>
        ${block(O.PAY.BANK, '銀行振込の振込先（あなたの口座）', `
          <div class="notice gold" style="margin-bottom:14px">${icon('lock', 16)}<div>振込先はあなたのアカウントでのみ表示され、AIへ送るプロンプトには含まれません。</div></div>
          <div class="field"><label class="lbl" for="bank_name">銀行名</label>
            <input id="bank_name" type="text" name="bank_name" list="bankList" value="${escapeHtml(pf.bank_name)}" maxlength="40" placeholder="タップして候補から選択">
            <datalist id="bankList">${O.BANKS.map((b) => `<option value="${escapeHtml(b)}">`).join('')}</datalist></div>
          <div class="field"><label class="lbl" for="bank_branch">支店名</label>
            <input id="bank_branch" type="text" name="bank_branch" value="${escapeHtml(pf.bank_branch)}" maxlength="40" placeholder="例：新宿支店 / 〇一八支店"></div>
          <div class="field"><label class="lbl">口座種別</label>${chipsInput('account_type', O.ACCOUNT_TYPES, pf.account_type || '普通')}</div>
          <div class="field"><label class="lbl" for="account_number">口座番号${masked ? `<span class="auto-badge">登録済み ${masked}</span>` : ''}</label>
            <div class="pw-wrap"><input id="account_number" type="password" name="account_number" inputmode="numeric" autocomplete="off" maxlength="8" value="${escapeHtml(pf.account_number)}" placeholder="半角数字">
            <button type="button" class="btn btn-ghost btn-sm" id="toggleAcct">表示</button></div></div>
          <div class="field"><label class="lbl" for="account_holder">口座名義（カナ）</label>
            <input id="account_holder" type="text" name="account_holder" value="${escapeHtml(pf.account_holder)}" maxlength="60" placeholder="例：ヤマダ タロウ"></div>
          <div class="field"><label class="lbl">振込手数料</label>${chipsInput('transfer_note', O.TRANSFER_NOTES, pf.transfer_note)}</div>
          <div class="field"><label class="lbl">お振込期限</label>${chipsInput('pay_deadline', O.PAY_DEADLINES, pf.pay_deadline || '指定しない')}</div>`)}
        ${block(O.PAY.PAYPAL, 'PayPal', `
          <div class="notice info" style="margin-bottom:14px">${icon('flag', 16)}<div>
            <b>使い方</b>：PayPalアカウントを作成し、「PayPal.Me」リンクまたは「請求書」機能でお客様に金額を伝えます。お客様側もPayPalアカウントへの登録が必要です（日本ではアカウントを持たない相手からの支払いは受けられません）。<br>
            <b>決済手段</b>：お客様はPayPal残高・登録済みのクレジットカード・銀行口座のいずれかから支払えます。<br>
            <b>手数料</b>：受け取り時に手数料がかかります（国内取引の目安：受取額の3.6％＋40円）。料率は変更されることがあるため、最新の金額はPayPalの公式ページで確認してください。
          </div></div>
          ${urlField('pay_url_paypal', 'PayPal.Meのリンクまたは請求書URL', 'https://www.paypal.me/...', 'PayPal.Meのリンクなど、お客様が支払いに使うリンクを貼り付けます。')}`)}
        <div class="notice warn" style="margin-top:14px">${icon('flag', 16)}<div>インターネットで商品を販売するときは「特定商取引法に基づく表記」の掲載が必要です。販売ページとあわせて準備してください。</div></div>
      </div>

      <h2 id="guide"><span class="sec-no">03</span>お客様へ送るお支払い案内</h2>
      <div class="card">
        ${guide ? `<p class="muted">お申し込みがあったお客様に、メールやDMでそのまま送れる文章です。保存した内容から自動で作られます。</p>
          <div class="letter"><pre class="template" id="tplText">${escapeHtml(guide)}</pre></div>
          <button type="button" class="btn btn-ghost btn-sm" id="copyTpl" style="margin-top:10px">${icon('copy', 16)}案内文をコピー</button>
          <span id="tplMsg" class="muted"></span>`
        : '<p class="muted" style="margin:0">お支払い方法を選び、振込先やお支払いページのURLを入れて保存すると、お客様へ送る案内文がここに自動で作られます。</p>'}
      </div>

      <div class="sticky-actions">
        <button class="btn btn-primary btn-block" type="submit">保存する</button>
      </div>
    </form>
    <script>
      (function(){
        const form = document.getElementById('productForm');
        function sync(){
          document.querySelectorAll('[data-other-input]').forEach(function(inp){
            const on = !!form.querySelector('input[data-other-for="' + inp.dataset.otherInput + '"]:checked');
            inp.classList.toggle('hide', !on);
          });
          const chosen = new Set(Array.from(form.querySelectorAll('input[name=payment_method]:checked')).map(function(i){ return i.value; }));
          document.querySelectorAll('[data-pay-block]').forEach(function(b){ b.classList.toggle('hide', !chosen.has(b.dataset.payBlock)); });
        }
        form.addEventListener('change', sync);
        sync();
        const acct = document.getElementById('account_number');
        document.getElementById('toggleAcct').addEventListener('click', function(){
          const show = acct.type === 'password';
          acct.type = show ? 'text' : 'password';
          this.textContent = show ? '隠す' : '表示';
        });
        const copyTpl = document.getElementById('copyTpl');
        if (copyTpl) copyTpl.addEventListener('click', async function(){
          try { await navigator.clipboard.writeText(document.getElementById('tplText').textContent); document.getElementById('tplMsg').textContent = ' コピーしました'; toast('案内文をコピーしました'); }
          catch (e) { document.getElementById('tplMsg').textContent = ' コピーできませんでした。長押しで選択してください'; }
        });
      })();
    </script>
  `, { user, active: 'product' });
}

// 入力値の検証・正規化（選択肢はリストにあるものだけを受け付ける）
function normalizeProfile(body) {
  // 選択肢の照合は送られてきた値そのままで行う（NFKCをかけると全角の（）や＋が半角になり、選択肢と一致しなくなるため）。
  // NFKC（全角数字・半角カナの統一）は自由入力の項目だけにかける。
  const raw = (v) => String(Array.isArray(v) ? v[0] : (v ?? '')).trim();
  const one = (v) => raw(v).normalize('NFKC');
  const text = (v, max) => one(v).slice(0, max);
  const pick = (v, list) => { const s = raw(v); return list.includes(s) ? s : ''; };
  const pickOrOther = (v, otherV, list) => {
    const s = raw(v);
    if (s === '__other') return text(otherV, 120);
    return list.includes(s) ? s : '';
  };
  const many = (v, list) => { const chosen = new Set([].concat(v || []).map((x) => String(x).trim())); return list.filter((x) => chosen.has(x)).join('、'); };
  const url = (v) => { const s = one(v).slice(0, 300); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : ''; };
  return {
    product_name: text(body.product_name, 80),
    product_format: pick(body.product_format, O.PRODUCT_FORMATS),
    product_type: pick(body.product_type, O.PRODUCT_TYPES),
    target: pickOrOther(body.target, body.target_other, O.TARGETS),
    pain: text(body.pain, 120),
    channel: many(body.channel, O.CHANNELS),
    price_band: pick(body.price_band, O.PRICE_BANDS),
    sale_price: one(body.sale_price).replace(/\D/g, '').replace(/^0+/, '').slice(0, 9),
    payment_method: many(body.payment_method, O.PAYMENT_METHODS),
    bank_name: text(body.bank_name, 40),
    bank_branch: text(body.bank_branch, 40),
    account_type: pick(body.account_type, O.ACCOUNT_TYPES),
    account_number: one(body.account_number).replace(/\D/g, '').slice(0, 8),
    account_holder: text(body.account_holder, 60),
    transfer_note: pick(body.transfer_note, O.TRANSFER_NOTES),
    pay_deadline: pick(body.pay_deadline, O.PAY_DEADLINES),
    pay_url_card: url(body.pay_url_card),
    pay_url_paypal: url(body.pay_url_paypal),
    pay_url_platform: url(body.pay_url_platform),
    pay_other_note: text(body.pay_other_note, 120),
  };
}

// ── ページ: アカウント ──
function accountPage(user) {
  const persona = PERSONAS[user.persona];
  return layout('アカウント', `
    <header class="page-head"><div class="eyebrow">Account</div><h1>アカウント</h1></header>
    <div class="card lux acct">
      ${guilloche(420, 320, { lines: 16, opacity: 0.18 })}
      <div class="hero-in">
        <div class="avatar-lg">${escapeHtml(initial(user.email))}</div>
        <dl class="kv"><dt>メール</dt><dd>${escapeHtml(user.email)}</dd>
        <dt>あなたの属性</dt><dd>${escapeHtml(persona ? persona.label : '未設定')}</dd>
        <dt>ライセンス</dt><dd>${user.license_active ? '認証済み' : '<a href="/license" style="color:inherit;text-decoration:underline">未認証（詳しく見る）</a>'}</dd></dl>
        <a class="btn btn-outline-light btn-block" href="/onboarding?change=1" style="margin-top:18px">属性を変更する</a>
      </div>
    </div>
    <div class="card">
      <div class="card-title">${icon('lock', 18)}データの扱い</div>
      <p class="muted" style="margin:0">AIのAPIキーはサーバーに保存しません（このブラウザ内のみ）。マイ商品・振込先・進捗は、あなたのアカウントでのみ表示されます。</p>
    </div>
    <a class="btn btn-ghost btn-block" href="/guide">${icon('bulb', 18)}使い方ガイド</a>
    <a class="btn btn-ghost btn-block" href="/contact">${icon('mail', 18)}お問い合わせ</a>
    <a class="btn btn-quiet btn-block" href="/logout">${icon('logout', 18)}ログアウト</a>
  `, { user, active: 'account' });
}

// ── お問い合わせ管理（運営者用。購入者アカウントとは別のシンプルなパスワード認証）──
function adminLoginPage(error) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>管理者ログイン｜ミチシルベ</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E1A22;color:#F3EEE4;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif}
form{width:min(340px,86vw);background:#152530;padding:30px 26px;border-radius:18px;box-shadow:0 20px 44px -18px rgba(0,0,0,.6)}
h1{font-size:16px;margin:0 0 18px;letter-spacing:.04em}
input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:0;background:#0E1A22;color:#fff;margin-bottom:14px;font-size:15px;box-shadow:inset 0 0 0 1px #33454F}
button{width:100%;padding:13px;border:0;border-radius:10px;background:#D9BF8C;color:#1B1408;font-weight:700;font-size:15px;cursor:pointer}
.err{color:#E8998C;font-size:13px;margin-bottom:14px}
</style></head><body>
<form method="POST" action="/admin/login">
  <h1>お問い合わせ管理</h1>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
  <input type="password" name="password" placeholder="管理者パスワード" required autofocus autocomplete="current-password">
  <button type="submit">ログイン</button>
</form>
</body></html>`;
}

function adminInquiriesPage(list) {
  const newCount = list.filter((i) => i.status !== 'DONE').length;
  const rows = list.map((inq) => `
    <div class="inq">
      <div class="inq-head">
        <span class="badge ${inq.status === 'DONE' ? 'done' : 'new'}">${inq.status === 'DONE' ? '対応済み' : '未対応'}</span>
        <time>${escapeHtml(new Date(inq.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }))}</time>
      </div>
      <div class="inq-meta"><b>${escapeHtml(inq.name || '（お名前なし）')}</b> ／ ${escapeHtml(inq.email)}${inq.category ? ` ／ ${escapeHtml(inq.category)}` : ''}${inq.user_id ? ' ／ <span class="tag">購入者</span>' : ''}</div>
      <p class="inq-msg">${escapeHtml(inq.message)}</p>
      <form method="POST" action="/admin/inquiries/${inq.id}/status">
        <input type="hidden" name="status" value="${inq.status === 'DONE' ? 'NEW' : 'DONE'}">
        <button type="submit">${inq.status === 'DONE' ? '未対応に戻す' : '対応済みにする'}</button>
      </form>
    </div>`).join('') || '<p class="empty">お問い合わせはまだありません。</p>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>お問い合わせ管理｜ミチシルベ</title>
<style>
body{margin:0;background:#F5F1EA;color:#0E1A22;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif}
header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#0E1A22;color:#F3EEE4}
header h1{font-size:15px;margin:0;letter-spacing:.02em}
header a{color:#D9BF8C;font-size:13px;text-decoration:none}
main{max-width:640px;margin:0 auto;padding:18px}
.inq{background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(14,26,34,.06);padding:16px 18px;margin-bottom:14px}
.inq-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.04em}
.badge.new{background:#FBF0D8;color:#9C660F}
.badge.done{background:#E2F1E8;color:#1C7A55}
time{font-size:11.5px;color:#6B7780}
.inq-meta{font-size:13px;color:#42525D;margin-bottom:8px;word-break:break-all}
.tag{color:#0D4D47;font-weight:700}
.inq-msg{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.8;margin:0 0 12px}
.inq form button{border:0;background:#F5F1EA;color:#42525D;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:10px;cursor:pointer}
.empty{color:#6B7780;text-align:center;padding:40px 0}
.navlink{margin-left:14px}
</style></head><body>
<header><h1>お問い合わせ管理（未対応 ${newCount}件）</h1><div><a class="navlink" href="/admin/licenses">ライセンス</a><a class="navlink" href="/admin/logout">ログアウト</a></div></header>
<main>${rows}</main>
</body></html>`;
}

// ── 有料ツール：SNS自動投稿ツール（ポストメッシュ https://post-mesh.com/ のAPIを中継する）──
// ポストメッシュへの登録・SNSアカウントの連携・APIキーの発行は、購入者自身がそれぞれ行う
// 前提（運営者側では一切管理しない）。APIキーは画面から毎回受け取って中継するだけで、
// このアプリのDB・ログには一切保存しない（/tools/shukyaku・/tools/kanyu と同じ設計）。
// いいね・フォロー・コメント自動返信などのエンゲージメント自動化は、SNS各社の規約に
// 抵触しやすいため実装していない（`営業システム`側の求人媒体に関する
// 「自動巡回・自動応募は実装しない」という方針と同じ理由。詳細は`docs/SNS自動投稿連携案.md`）。
const SNS_PLATFORM_LABEL = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', threads: 'Threads', x: 'X', facebook: 'Facebook' };
const SNS_CAPTION_LIMIT = { x: '280字', threads: '500字', tiktok: '2,200字', instagram: '2,200字', youtube: '5,000バイト', facebook: '上限なし' };
const SNS_STATUS_LABEL = { posted: '投稿済み', scheduled: '予約済み', processing: '処理中', failed: '失敗', draft: '下書き' };
// 本ツールはテキスト投稿（category: text）のみを扱う。ポストメッシュの仕様上、テキスト投稿に対応する
// プラットフォームはX・Threads・Facebookの3つのみ（画像・動画が必須のYouTube・Instagram・TikTokは
// 投稿先の選択肢に含めない。選べてしまうとポストメッシュ側のバリデーションで投稿が失敗するため）。
const SNS_TEXT_PLATFORMS = new Set(['x', 'threads', 'facebook']);

function jidoutoukouToolPage() {
  return layout('SNS自動投稿ツール', `
    <section class="landing-hero lux" style="padding-bottom:22px">
      ${crest(50)}
      <div class="eyebrow">ご購入者様専用</div>
      <h1>SNS自動投稿<br><em>ツール</em></h1>
      <p>ご自身のポストメッシュアカウントと連携し、複数のSNSへまとめて投稿・予約配信できます。</p>
    </section>
    <section>
      <div class="card">
        <div class="notice warn">${icon('flag', 16)}<div>本ツールのご利用には、<a href="https://post-mesh.com/" target="_blank" rel="noopener">ポストメッシュ</a>へのご自身での登録と、投稿したいSNSアカウントの連携が必要です（連携作業はポストメッシュのダッシュボードで行います）。登録・連携がまだの方は、先にポストメッシュ側で済ませてください。</div></div>
        <div class="field"><label class="lbl" for="pmApiKey">ポストメッシュのAPIキー</label>
          <input id="pmApiKey" type="password" placeholder="ポストメッシュのダッシュボードで発行したAPIキー" autocomplete="off"></div>
        <button id="connectBtn" type="button" class="btn btn-primary btn-block">連携アカウントを読み込む</button>
        <p id="connectError" class="err"></p>

        <div id="afterConnect" style="display:none;margin-top:18px">
          <div class="field"><label class="lbl">投稿先のSNSアカウント</label>
            <div id="connList"></div>
          </div>
          <div class="field"><label class="lbl" for="caption">投稿本文</label>
            <textarea id="caption" rows="6" placeholder="投稿する文章"></textarea></div>

          <details class="fold" style="margin-top:12px">
            <summary>${icon('lock', 18)}AIで下書きを作る（任意）</summary>
            <div style="margin-top:12px">
              <div class="notice info">APIキーはこのブラウザにのみ保存され、実行のたびにサーバーへ中継されるだけで保存されません。利用料はご自身のOpenAI／Anthropicのご契約に基づき発生します。</div>
              <div class="field" style="margin-top:12px"><label class="lbl" for="draftTheme">伝えたいテーマ・役立つ情報</label>
                <textarea id="draftTheme" rows="2" placeholder="例：副業で最初の一歩を踏み出せない人へ、今日からできる小さな一歩"></textarea></div>
              <div class="field"><label class="lbl" for="provider">プロバイダ</label>
                <select id="provider">${Object.keys(PROVIDERS).map((p) => `<option value="${p}">${p}</option>`).join('')}</select></div>
              <div class="field"><label class="lbl" for="apiKey">APIキー</label><input id="apiKey" type="password" placeholder="sk-... / このブラウザにのみ保存" autocomplete="off"></div>
              <button id="draftBtn" type="button" class="btn btn-ghost btn-block">AIで下書きを作る</button>
              <p id="draftError" class="err"></p>
            </div>
          </details>

          <div class="field" style="margin-top:12px"><label class="lbl" for="scheduledAt">予約日時（空なら即時投稿）</label>
            <input id="scheduledAt" type="datetime-local"></div>
          <label class="chip" style="margin-top:8px"><input type="checkbox" id="draftOnly"><span>下書きとして保存する（SNSへは配信しない）</span></label>
          <button id="composeBtn" type="button" class="btn btn-primary btn-block" style="margin-top:14px">投稿する</button>
          <p id="composeResult" style="margin-top:10px;font-size:13.5px"></p>

          <div style="margin-top:22px">
            <label class="lbl">直近の投稿</label>
            <div id="postList"></div>
          </div>
        </div>
      </div>
      <p class="muted center" style="margin-top:14px">投稿内容は必ずご自身で確認してから送信してください。断定的な収入表現・実在しない実績は含めないでください。</p>
    </section>
    <script>
      const PLATFORM_LABEL = ${JSON.stringify(SNS_PLATFORM_LABEL)};
      const CAPTION_LIMIT = ${JSON.stringify(SNS_CAPTION_LIMIT)};
      const STATUS_LABEL = ${JSON.stringify(SNS_STATUS_LABEL)};
      const esc = (s) => (s || '').replace(/</g, '&lt;');

      const KEY_STORE_PM = 'ai-bijika:postmeshApiKey';
      const KEY_STORE = 'ai-bijika:apiKey:';
      const pmKeyInput = document.getElementById('pmApiKey');
      try { pmKeyInput.value = localStorage.getItem(KEY_STORE_PM) || ''; } catch (e) {}
      const providerSel = document.getElementById('provider');
      const keyInput = document.getElementById('apiKey');
      function loadKey() { try { keyInput.value = localStorage.getItem(KEY_STORE + providerSel.value) || ''; } catch (e) {} }
      providerSel.addEventListener('change', loadKey);
      loadKey();

      let CONNECTIONS = [];
      function renderConnections() {
        document.getElementById('connList').innerHTML = CONNECTIONS.map((c) =>
          '<label class="chip" style="margin:4px 6px 4px 0"><input type="checkbox" class="connCb" value="' + esc(c.id) + '">' +
          '<span>' + esc(PLATFORM_LABEL[c.platform] || c.platform) + ' ' + esc(c.account_name) +
          ' ・ ' + esc(CAPTION_LIMIT[c.platform] || '') + '</span></label>'
        ).join('') || '<p class="muted">連携済みのアカウントがありません。ポストメッシュのダッシュボードでSNSアカウントを連携してください。</p>';
      }
      function renderPosts(posts) {
        document.getElementById('postList').innerHTML = posts.map((p) =>
          '<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--border,#E7E0D2)">' +
          '<b>' + esc(p.title) + '</b>　' + esc(STATUS_LABEL[p.status] || p.status) + '　' +
          new Date(p.display_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + '</div>'
        ).join('') || '<p class="muted">投稿はまだありません。</p>';
      }

      document.getElementById('connectBtn').addEventListener('click', async () => {
        const errEl = document.getElementById('connectError');
        errEl.textContent = '';
        const pmApiKey = pmKeyInput.value.trim();
        if (!pmApiKey) { errEl.textContent = 'ポストメッシュのAPIキーを入力してください。'; return; }
        try { localStorage.setItem(KEY_STORE_PM, pmApiKey); } catch (e) {}
        try {
          const [connResp, postResp] = await Promise.all([
            fetch('/api/tools/jidoutoukou/connections', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pmApiKey }) }),
            fetch('/api/tools/jidoutoukou/posts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pmApiKey }) }),
          ]);
          const connData = await connResp.json();
          if (!connResp.ok) throw new Error(connData.error || '連携アカウントの取得に失敗しました');
          const postData = await postResp.json();
          CONNECTIONS = connData.connections;
          renderConnections();
          renderPosts(postResp.ok ? postData.posts : []);
          document.getElementById('afterConnect').style.display = '';
        } catch (e) {
          errEl.textContent = e.message;
        }
      });

      document.getElementById('draftBtn').addEventListener('click', async () => {
        const btn = document.getElementById('draftBtn');
        const errEl = document.getElementById('draftError');
        errEl.textContent = '';
        const theme = document.getElementById('draftTheme').value.trim();
        const provider = providerSel.value;
        const apiKey = keyInput.value.trim();
        if (!theme) { errEl.textContent = 'テーマを入力してください。'; return; }
        if (!apiKey) { errEl.textContent = 'APIキーを入力してください。'; return; }
        try { localStorage.setItem(KEY_STORE + provider, apiKey); } catch (e) {}
        btn.disabled = true; btn.textContent = '作成中…';
        try {
          const resp = await fetch('/api/tools/jidoutoukou/draft', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme, provider, apiKey }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || '生成に失敗しました');
          document.getElementById('caption').value = data.output;
        } catch (e) {
          errEl.textContent = e.message;
        } finally {
          btn.disabled = false; btn.textContent = 'AIで下書きを作る';
        }
      });

      document.getElementById('composeBtn').addEventListener('click', async () => {
        const btn = document.getElementById('composeBtn');
        const resultEl = document.getElementById('composeResult');
        resultEl.textContent = '';
        const pmApiKey = pmKeyInput.value.trim();
        const caption = document.getElementById('caption').value.trim();
        const connectionIds = [...document.querySelectorAll('.connCb:checked')].map((el) => el.value);
        const scheduledAt = document.getElementById('scheduledAt').value;
        const draftOnly = document.getElementById('draftOnly').checked;
        if (!caption || connectionIds.length === 0) { resultEl.textContent = '投稿本文と、投稿先のSNSアカウントを1つ以上指定してください。'; return; }
        btn.disabled = true; btn.textContent = '送信中…';
        try {
          const resp = await fetch('/api/tools/jidoutoukou/compose', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pmApiKey, caption, connectionIds, scheduledAt, draft: draftOnly }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || '投稿に失敗しました');
          resultEl.textContent = draftOnly ? '下書きとして保存しました。' : '投稿しました。';
          const postResp = await fetch('/api/tools/jidoutoukou/posts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pmApiKey }) });
          if (postResp.ok) renderPosts((await postResp.json()).posts);
        } catch (e) {
          resultEl.textContent = 'エラー: ' + e.message;
        } finally {
          btn.disabled = false; btn.textContent = '投稿する';
        }
      });
    </script>
  `, { noNav: true });
}

// ── ライセンス管理（運営者用。購入時のメールアドレスを許可リストに登録し、購入者だけが使えるようにする）──
function adminLicensesPage(emailList) {
  const emailCounts = { UNUSED: 0, ACTIVE: 0, REVOKED: 0 };
  for (const a of emailList) emailCounts[a.status] = (emailCounts[a.status] || 0) + 1;
  const STATUS_LABEL_AE = { UNUSED: '未ログイン', ACTIVE: 'ログイン済み', REVOKED: '無効化済み' };
  const emailRows = emailList.map((a) => `
    <div class="lic">
      <div class="lic-head">
        <code class="lic-code">${escapeHtml(a.email)}</code>
        <span class="badge ${a.status.toLowerCase()}">${STATUS_LABEL_AE[a.status]}</span>
      </div>
      <div class="lic-meta">${a.note ? `${escapeHtml(a.note)} ／ ` : ''}<time>${escapeHtml(new Date(a.created_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }))}登録</time></div>
      ${a.trial_expires_days || a.trial_gates ? `<div class="lic-meta">体験版：${a.trial_gates ? `GATE${escapeHtml(a.trial_gates)}のみ` : '全GATE'}・${a.trial_expires_days ? `${escapeHtml(a.trial_expires_days)}日間` : '無期限'}</div>` : ''}
      ${a.status !== 'REVOKED' ? `<form method="POST" action="/admin/licenses/emails/${a.id}/revoke" onsubmit="return confirm('このメールアドレスの許可を取り消しますか？${a.status === 'ACTIVE' ? 'ログイン済みのため、このアカウントは使えなくなります。' : ''}')">
        <button type="submit">無効化する</button>
      </form>` : ''}
    </div>`).join('') || '<p class="empty">許可済みのメールアドレスはまだありません。まず下のフォームから登録してください。</p>';

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ライセンス管理｜ミチシルベ</title>
<style>
body{margin:0;background:#F5F1EA;color:#0E1A22;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif}
header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#0E1A22;color:#F3EEE4}
header h1{font-size:15px;margin:0;letter-spacing:.02em}
header a{color:#D9BF8C;font-size:13px;text-decoration:none;margin-left:14px}
main{max-width:640px;margin:0 auto;padding:18px}
.section-desc{font-size:12.5px;color:#42525D;margin:0 0 12px}
.counts{display:flex;gap:10px;margin-bottom:16px;font-size:12.5px;color:#42525D}
.counts b{color:#0E1A22}
.genbox{background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(14,26,34,.06);padding:16px 18px;margin-bottom:18px}
.genbox h2{font-size:14px;margin:0 0 10px}
.genbox label{display:block;font-size:12.5px;color:#42525D;margin-bottom:4px}
.genbox input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #DCD4C4;font-size:14px;margin-bottom:10px}
.genbox button{border:0;background:#0E1A22;color:#F3EEE4;font-size:13.5px;font-weight:700;padding:10px 16px;border-radius:10px;cursor:pointer}
.lic{background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(14,26,34,.06);padding:14px 18px;margin-bottom:10px}
.lic-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.lic-code{font-size:14.5px;font-weight:700;letter-spacing:.03em}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.04em;white-space:nowrap}
.badge.unused{background:#EEE8DA;color:#6B7780}
.badge.active{background:#E2F1E8;color:#1C7A55}
.badge.revoked{background:#F6E3DF;color:#9C3B2C}
.lic-meta{font-size:12.5px;color:#42525D;margin:6px 0 8px;word-break:break-all}
.lic form button{border:0;background:#F5F1EA;color:#42525D;font-size:12.5px;font-weight:700;padding:7px 12px;border-radius:10px;cursor:pointer}
.empty{color:#6B7780;text-align:center;padding:40px 0}
</style></head><body>
<header><h1>ライセンス管理</h1><div><a href="/admin/inquiries">お問い合わせ</a><a href="/admin/logout">ログアウト</a></div></header>
<main>
  <p class="section-desc">購入時のメールアドレスを登録すると、そのメールアドレスで登録・ログインした時点で自動的に使えるようになります。</p>
  <div class="counts">未ログイン <b>${emailCounts.UNUSED || 0}</b>／ログイン済み <b>${emailCounts.ACTIVE || 0}</b>／無効化済み <b>${emailCounts.REVOKED || 0}</b></div>
  <div class="genbox">
    <h2>メールアドレスを許可する</h2>
    <form method="POST" action="/admin/licenses/allow-email">
      <label for="allow-email">購入者のメールアドレス</label>
      <input id="allow-email" type="email" name="email" required placeholder="buyer@example.com">
      <label for="allow-note">メモ（任意。購入経路など）</label>
      <input id="allow-note" type="text" name="note" maxlength="100" placeholder="例：2026-09 note販売分">
      <label for="allow-trial-days">体験版の期間・日数（任意。空欄なら通常の購入者と同じ無期限）</label>
      <input id="allow-trial-days" type="number" name="trialDays" min="1" placeholder="例：7">
      <label for="allow-trial-gates">体験版でアクセスできるGATE番号（任意。カンマ区切り。空欄なら全GATE）</label>
      <input id="allow-trial-gates" type="text" name="trialGates" placeholder="例：1,3">
      <button type="submit">許可する</button>
    </form>
  </div>
  ${emailRows}
</main>
</body></html>`;
}

// ── リクエストハンドラ ──
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const pathname = url.pathname;
    const userId = auth.currentUserId(req);
    const user = userId ? Users.findById(userId) : null;

    // ── PWA静的ファイル（認証不要）──
    if (STATIC_FILES[pathname] && method === 'GET') {
      const asset = STATIC_FILES[pathname];
      const filePath = path.join(PUBLIC_DIR, asset.file);
      if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'public, max-age=3600' });
      return fs.createReadStream(filePath).pipe(res);
    }

    // ── 認証不要 ──
    if (pathname === '/' && method === 'GET') {
      if (user) return redirect(res, '/dashboard');
      return sendHtml(res, 200, homePage());
    }
    if (pathname === '/signup' && method === 'GET') return sendHtml(res, 200, authForm('signup'));
    if (pathname === '/login' && method === 'GET') return sendHtml(res, 200, authForm('login'));

    if (pathname === '/signup' && method === 'POST') {
      const { email, password } = await parseBody(req);
      if (!email || !password || password.length < 8) {
        return sendHtml(res, 400, authForm('signup', 'メールアドレスと8文字以上のパスワードを入力してください。'));
      }
      if (Users.findByEmail(email)) {
        return sendHtml(res, 400, authForm('signup', 'このメールアドレスは既に登録されています。'));
      }
      const { hash, salt } = auth.hashPassword(password);
      const id = Users.create({ email, passwordHash: hash, passwordSalt: salt });
      const token = auth.createSession(id);
      return redirect(res, '/onboarding', { 'Set-Cookie': auth.sessionCookie(token) });
    }

    if (pathname === '/login' && method === 'POST') {
      const { email, password } = await parseBody(req);
      const u = email ? Users.findByEmail(email) : null;
      if (!u || !auth.verifyPassword(password || '', u.password_hash, u.password_salt)) {
        return sendHtml(res, 401, authForm('login', 'メールアドレスまたはパスワードが違います。'));
      }
      const token = auth.createSession(u.id);
      return redirect(res, '/dashboard', { 'Set-Cookie': auth.sessionCookie(token) });
    }

    if (pathname === '/logout') {
      const token = auth.parseCookies(req).get('session');
      auth.destroySession(token);
      return redirect(res, '/', { 'Set-Cookie': auth.clearCookie() });
    }

    // ── お問い合わせ（ログイン前後どちらからでも送信できる）──
    if (pathname === '/contact' && method === 'GET') {
      return sendHtml(res, 200, contactPage(user, { sent: url.searchParams.get('sent') === '1' }));
    }
    if (pathname === '/api/contact' && method === 'POST') {
      const body = await parseBody(req);
      const name = String(body.name || '').trim().slice(0, 60);
      const email = String(body.email || '').trim().slice(0, 200);
      const category = O.CONTACT_CATEGORIES.includes(String(body.category || '')) ? body.category : '';
      const message = String(body.message || '').trim().slice(0, 2000);
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk || !message) {
        return sendHtml(res, 400, contactPage(user, {
          error: 'メールアドレスとお問い合わせ内容を正しく入力してください。',
          values: { name, email, category, message },
        }));
      }
      Inquiries.create({ userId: user ? user.id : null, name, email, category, message });
      return redirect(res, '/contact?sent=1');
    }

    // ── 公開ツール：自己紹介文ジェネレーター（ログイン不要。APIキーは毎回受け取るだけで保存しない）──
    if (pathname === '/tools/jikoshoukai' && method === 'GET') {
      return sendHtml(res, 200, jikoshoukaiToolPage());
    }
    if (pathname === '/api/tools/jikoshoukai' && method === 'POST') {
      const { mode, provider, apiKey, fieldA, fieldB, fieldC } = await parseBody(req);
      const a = String(fieldA || '').trim().slice(0, 2000);
      const b = String(fieldB || '').trim().slice(0, 2000);
      const c = String(fieldC || '').trim().slice(0, 2000);
      if (!a || !b || (mode !== 'mlm' && !c)) return sendJson(res, 400, { error: '必要な項目を入力してください。' });
      const promptText = mode === 'mlm'
        ? `あなたはプロのコピーライターです。以下の情報をもとに、SNSのプロフィール欄に使える自己紹介文を作ってください。資格・肩書きを誇張せず、誠実な印象になるようにしてください。新しい会員・ビジネスパートナーの募集を目的とした内容は含めないでください。\n\n【自分の経験・大切にしていること】：${a}\n【扱っている商品・サービスの分野】：${b}`
        : `あなたはプロのコピーライターです。以下の情報をもとに、SNSのプロフィール欄に使える100字程度の自己紹介文を3パターン作ってください。\n\n【経験・得意なこと】：${a}\n【伝えたい相手】：${b}\n【大切にしていること】：${c}`;
      try {
        const output = await runPrompt({ provider, apiKey, promptText });
        return sendJson(res, 200, { output });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ── 公開ツール：副業初心者向け集客ツール（ログイン不要。APIキーは毎回受け取るだけで保存しない）──
    if (pathname === '/tools/fukugyou' && method === 'GET') {
      return sendHtml(res, 200, multiModeToolPage('副業初心者向け集客ツール', 'どなたでも無料でお使いいただけます', FUKUGYOU_MODES, '/api/tools/fukugyou'));
    }
    if (pathname === '/api/tools/fukugyou' && method === 'POST') {
      const { mode, provider, apiKey, values } = await parseBody(req);
      const m = FUKUGYOU_MODES.find((x) => x.key === mode);
      if (!m) return sendJson(res, 400, { error: 'invalid mode' });
      const v = {};
      for (const f of m.fields) v[f.id] = String((values && values[f.id]) || '').trim().slice(0, 2000);
      if (m.fields.some((f) => !v[f.id])) return sendJson(res, 400, { error: '必要な項目を入力してください。' });
      try {
        const output = await runPrompt({ provider, apiKey, promptText: m.build(v) });
        return sendJson(res, 200, { output });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ── 有料ツール：集客・接客ツール（980円）──
    if (pathname === '/tools/shukyaku' && method === 'GET') {
      if (!shukyakuGate.isAuthed(req)) return sendHtml(res, 200, toolLoginPage('集客・接客ツール', '/tools/shukyaku/login'));
      return sendHtml(res, 200, multiModeToolPage('集客・接客ツール', 'ご購入者様専用', SHUKYAKU_MODES, '/api/tools/shukyaku'));
    }
    if (pathname === '/tools/shukyaku/login' && method === 'POST') {
      const { password } = await parseBody(req);
      const sid = shukyakuGate.tryLogin(String(password || ''));
      if (!sid) return sendHtml(res, 401, toolLoginPage('集客・接客ツール', '/tools/shukyaku/login', 'パスワードが違います。'));
      return redirect(res, '/tools/shukyaku', { 'Set-Cookie': shukyakuGate.cookie(sid) });
    }
    if (pathname === '/api/tools/shukyaku' && method === 'POST') {
      if (!shukyakuGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      const { mode, provider, apiKey, values } = await parseBody(req);
      const m = SHUKYAKU_MODES.find((x) => x.key === mode);
      if (!m) return sendJson(res, 400, { error: 'invalid mode' });
      const v = {};
      for (const f of m.fields) v[f.id] = String((values && values[f.id]) || '').trim().slice(0, 2000);
      if (m.fields.some((f) => !v[f.id])) return sendJson(res, 400, { error: '必要な項目を入力してください。' });
      try {
        const output = await runPrompt({ provider, apiKey, promptText: m.build(v) });
        return sendJson(res, 200, { output });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ── 有料ツール：ダウンライン拡大ツール（1,480円）──
    if (pathname === '/tools/kanyu' && method === 'GET') {
      if (!kanyuGate.isAuthed(req)) return sendHtml(res, 200, toolLoginPage('ダウンライン拡大ツール', '/tools/kanyu/login'));
      return sendHtml(res, 200, multiModeToolPage('ダウンライン拡大ツール', 'ご購入者様専用', KANYU_MODES, '/api/tools/kanyu'));
    }
    if (pathname === '/tools/kanyu/login' && method === 'POST') {
      const { password } = await parseBody(req);
      const sid = kanyuGate.tryLogin(String(password || ''));
      if (!sid) return sendHtml(res, 401, toolLoginPage('ダウンライン拡大ツール', '/tools/kanyu/login', 'パスワードが違います。'));
      return redirect(res, '/tools/kanyu', { 'Set-Cookie': kanyuGate.cookie(sid) });
    }
    if (pathname === '/api/tools/kanyu' && method === 'POST') {
      if (!kanyuGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      const { mode, provider, apiKey, values } = await parseBody(req);
      const m = KANYU_MODES.find((x) => x.key === mode);
      if (!m) return sendJson(res, 400, { error: 'invalid mode' });
      const v = {};
      for (const f of m.fields) v[f.id] = String((values && values[f.id]) || '').trim().slice(0, 2000);
      if (m.fields.some((f) => !v[f.id])) return sendJson(res, 400, { error: '必要な項目を入力してください。' });
      try {
        const output = await runPrompt({ provider, apiKey, promptText: m.build(v) });
        return sendJson(res, 200, { output });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ── 有料ツール：集客・接客ツール かんたん版（APIキー不要。運営者の共有APIキーで生成、1日上限あり）──
    if (pathname === '/tools/shukyaku-kantan' && method === 'GET') {
      if (!shukyakuKantanGate.isAuthed(req)) return sendHtml(res, 200, toolLoginPage('集客・接客ツール かんたん版', '/tools/shukyaku-kantan/login'));
      return sendHtml(res, 200, multiModeToolPageNoKey('集客・接客ツール かんたん版', 'ご購入者様専用・APIキー不要', SHUKYAKU_MODES, '/api/tools/shukyaku-kantan', `1日${shukyakuKantanLimiter.limit}回まで生成できます（全購入者共通の上限です）。`));
    }
    if (pathname === '/tools/shukyaku-kantan/login' && method === 'POST') {
      const { password } = await parseBody(req);
      const sid = shukyakuKantanGate.tryLogin(String(password || ''));
      if (!sid) return sendHtml(res, 401, toolLoginPage('集客・接客ツール かんたん版', '/tools/shukyaku-kantan/login', 'パスワードが違います。'));
      return redirect(res, '/tools/shukyaku-kantan', { 'Set-Cookie': shukyakuKantanGate.cookie(sid) });
    }
    if (pathname === '/api/tools/shukyaku-kantan' && method === 'POST') {
      if (!shukyakuKantanGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      if (!SHARED_AI_API_KEY) return sendJson(res, 400, { error: '現在ご利用いただけません（運営者側の設定が未完了です）。お手数ですがお問い合わせください。' });
      const { mode, values } = await parseBody(req);
      const m = SHUKYAKU_MODES.find((x) => x.key === mode);
      if (!m) return sendJson(res, 400, { error: 'invalid mode' });
      const v = {};
      for (const f of m.fields) v[f.id] = String((values && values[f.id]) || '').trim().slice(0, 2000);
      if (m.fields.some((f) => !v[f.id])) return sendJson(res, 400, { error: '必要な項目を入力してください。' });
      if (!shukyakuKantanLimiter.tryConsume()) return sendJson(res, 429, { error: '本日の生成回数の上限に達しました。日付が変わってからお試しください。' });
      try {
        const output = await runPrompt({ provider: SHARED_AI_PROVIDER, apiKey: SHARED_AI_API_KEY, promptText: m.build(v) });
        return sendJson(res, 200, { output });
      } catch (e) {
        shukyakuKantanLimiter.refund();
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ── 有料ツール：ダウンライン拡大ツール かんたん版（APIキー不要。運営者の共有APIキーで生成、1日上限あり）──
    if (pathname === '/tools/kanyu-kantan' && method === 'GET') {
      if (!kanyuKantanGate.isAuthed(req)) return sendHtml(res, 200, toolLoginPage('ダウンライン拡大ツール かんたん版', '/tools/kanyu-kantan/login'));
      return sendHtml(res, 200, multiModeToolPageNoKey('ダウンライン拡大ツール かんたん版', 'ご購入者様専用・APIキー不要', KANYU_MODES, '/api/tools/kanyu-kantan', `1日${kanyuKantanLimiter.limit}回まで生成できます（全購入者共通の上限です）。`));
    }
    if (pathname === '/tools/kanyu-kantan/login' && method === 'POST') {
      const { password } = await parseBody(req);
      const sid = kanyuKantanGate.tryLogin(String(password || ''));
      if (!sid) return sendHtml(res, 401, toolLoginPage('ダウンライン拡大ツール かんたん版', '/tools/kanyu-kantan/login', 'パスワードが違います。'));
      return redirect(res, '/tools/kanyu-kantan', { 'Set-Cookie': kanyuKantanGate.cookie(sid) });
    }
    if (pathname === '/api/tools/kanyu-kantan' && method === 'POST') {
      if (!kanyuKantanGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      if (!SHARED_AI_API_KEY) return sendJson(res, 400, { error: '現在ご利用いただけません（運営者側の設定が未完了です）。お手数ですがお問い合わせください。' });
      const { mode, values } = await parseBody(req);
      const m = KANYU_MODES.find((x) => x.key === mode);
      if (!m) return sendJson(res, 400, { error: 'invalid mode' });
      const v = {};
      for (const f of m.fields) v[f.id] = String((values && values[f.id]) || '').trim().slice(0, 2000);
      if (m.fields.some((f) => !v[f.id])) return sendJson(res, 400, { error: '必要な項目を入力してください。' });
      if (!kanyuKantanLimiter.tryConsume()) return sendJson(res, 429, { error: '本日の生成回数の上限に達しました。日付が変わってからお試しください。' });
      try {
        const output = await runPrompt({ provider: SHARED_AI_PROVIDER, apiKey: SHARED_AI_API_KEY, promptText: m.build(v) });
        return sendJson(res, 200, { output });
      } catch (e) {
        kanyuKantanLimiter.refund();
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ── お問い合わせ管理（運営者用。購入者ログインとは別のパスワード認証）──
    if (pathname === '/admin/login' && method === 'GET') {
      return sendHtml(res, 200, adminLoginPage());
    }
    if (pathname === '/admin/login' && method === 'POST') {
      const { password } = await parseBody(req);
      if (password !== ADMIN_PASSWORD) return sendHtml(res, 401, adminLoginPage('パスワードが違います。'));
      const sid = crypto.randomBytes(24).toString('hex');
      adminSessions.add(sid);
      return redirect(res, '/admin/inquiries', { 'Set-Cookie': adminSessionCookie(sid) });
    }
    if (pathname === '/admin/logout') {
      const sid = auth.parseCookies(req).get('admin_sid');
      if (sid) adminSessions.delete(sid);
      return redirect(res, '/admin/login', { 'Set-Cookie': 'admin_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }
    if (pathname === '/admin/inquiries' && method === 'GET') {
      if (!isAdminAuthed(req)) return redirect(res, '/admin/login');
      return sendHtml(res, 200, adminInquiriesPage(Inquiries.all()));
    }
    const inqStatusMatch = pathname.match(/^\/admin\/inquiries\/([a-f0-9]+)\/status$/);
    if (inqStatusMatch && method === 'POST') {
      if (!isAdminAuthed(req)) return redirect(res, '/admin/login');
      const { status } = await parseBody(req);
      if (['NEW', 'DONE'].includes(status)) Inquiries.setStatus(inqStatusMatch[1], status);
      return redirect(res, '/admin/inquiries');
    }

    // ── ライセンス管理（運営者用。購入時のメールアドレスだけを許可し、購入者だけが使えるようにする）──
    if (pathname === '/admin/licenses' && method === 'GET') {
      if (!isAdminAuthed(req)) return redirect(res, '/admin/login');
      return sendHtml(res, 200, adminLicensesPage(AllowedEmails.all()));
    }
    if (pathname === '/admin/licenses/allow-email' && method === 'POST') {
      if (!isAdminAuthed(req)) return redirect(res, '/admin/login');
      const { email, note, trialDays, trialGates } = await parseBody(req);
      const trimmed = String(email || '').trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        AllowedEmails.add(trimmed, String(note || '').trim().slice(0, 100), String(trialDays || '').trim(), String(trialGates || '').trim());
      }
      return redirect(res, '/admin/licenses');
    }
    const aeRevokeMatch = pathname.match(/^\/admin\/licenses\/emails\/([a-f0-9]+)\/revoke$/);
    if (aeRevokeMatch && method === 'POST') {
      if (!isAdminAuthed(req)) return redirect(res, '/admin/login');
      const revoked = AllowedEmails.revoke(aeRevokeMatch[1]);
      if (revoked && revoked.user_id) Users.setLicenseActive(revoked.user_id, false);
      return redirect(res, '/admin/licenses');
    }

    // ── 有料ツール：SNS自動投稿ツール（ポストメッシュAPIを中継。購入者自身のアカウント・APIキーを使う）──
    if (pathname === '/tools/jidoutoukou' && method === 'GET') {
      if (!jidoutoukouGate.isAuthed(req)) return sendHtml(res, 200, toolLoginPage('SNS自動投稿ツール', '/tools/jidoutoukou/login'));
      return sendHtml(res, 200, jidoutoukouToolPage());
    }
    if (pathname === '/tools/jidoutoukou/login' && method === 'POST') {
      const { password } = await parseBody(req);
      const sid = jidoutoukouGate.tryLogin(String(password || ''));
      if (!sid) return sendHtml(res, 401, toolLoginPage('SNS自動投稿ツール', '/tools/jidoutoukou/login', 'パスワードが違います。'));
      return redirect(res, '/tools/jidoutoukou', { 'Set-Cookie': jidoutoukouGate.cookie(sid) });
    }
    if (pathname === '/api/tools/jidoutoukou/connections' && method === 'POST') {
      if (!jidoutoukouGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      const { pmApiKey } = await parseBody(req);
      try {
        const connections = await postmesh.listConnections({ apiKey: pmApiKey });
        return sendJson(res, 200, { connections: connections.filter((c) => SNS_TEXT_PLATFORMS.has(c.platform)) });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
    if (pathname === '/api/tools/jidoutoukou/posts' && method === 'POST') {
      if (!jidoutoukouGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      const { pmApiKey } = await parseBody(req);
      try {
        const posts = await postmesh.listPosts({ apiKey: pmApiKey, limit: 20 });
        return sendJson(res, 200, { posts });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
    if (pathname === '/api/tools/jidoutoukou/compose' && method === 'POST') {
      if (!jidoutoukouGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      const { pmApiKey, caption, connectionIds, scheduledAt, draft } = await parseBody(req);
      const captionText = String(caption || '').trim().slice(0, 5000);
      const ids = Array.isArray(connectionIds) ? connectionIds : (connectionIds ? [connectionIds] : []);
      if (!captionText || ids.length === 0) {
        return sendJson(res, 400, { error: '投稿本文と、投稿先のSNSアカウントを1つ以上指定してください。' });
      }
      let scheduledAtIso = null;
      if (scheduledAt) {
        // <input type="datetime-local"> にはタイムゾーン情報が無いため、日本時間として明示的に解釈する
        // （サーバーの実行タイムゾーンに依存させない。本番はTZ未指定のためUTCで動く）
        const d = new Date(`${scheduledAt}+09:00`);
        if (isNaN(d.getTime())) return sendJson(res, 400, { error: '予約日時の形式が正しくありません。' });
        scheduledAtIso = d.toISOString();
      }
      const targets = ids.map((id) => ({ connection_id: id, caption: captionText }));
      try {
        const result = await postmesh.createTextPost({ apiKey: pmApiKey, targets, scheduledAt: scheduledAtIso, draft: !!draft });
        return sendJson(res, 200, { ok: true, post: result.data });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }
    if (pathname === '/api/tools/jidoutoukou/draft' && method === 'POST') {
      if (!jidoutoukouGate.isAuthed(req)) return sendJson(res, 403, { error: 'ログインが必要です。' });
      const { theme, provider, apiKey } = await parseBody(req);
      const themeText = String(theme || '').trim().slice(0, 2000);
      if (!themeText) return sendJson(res, 400, { error: 'テーマを入力してください。' });
      const promptText = `あなたはSNSマーケティングに詳しいコピーライターです。副業やネットワークビジネスにこれから取り組む人・取り組み始めたばかりの人に向けて、押し売り感のない、読んだ人が「役に立った」と感じるSNS投稿文を1つ作ってください。断定的な収入の保証表現（必ず稼げる、誰でも成功する等）は使わないでください。実在しない実績・お客様の声は含めないでください。\n\n【伝えたいテーマ・役立つ情報】：${themeText}`;
      try {
        const output = await runPrompt({ provider, apiKey, promptText });
        return sendJson(res, 200, { output });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ── 以降は認証必須 ──
    if (!user) return redirect(res, '/login');

    // ── ライセンス認証（購入者だけが使えるようにする）。/license と /account 以外はすべてブロックする ──
    // リクエストのたびに許可リストを再照合する（管理者がログイン中に許可した場合も、再ログイン不要で即座に反映される）。
    if (!user.license_active) tryAutoActivateByEmail(user);
    const licenseExpired = isLicenseExpired(user);
    const LICENSE_EXEMPT_PATHS = new Set(['/license', '/account']);
    if ((!user.license_active || licenseExpired) && !LICENSE_EXEMPT_PATHS.has(pathname)) {
      if (pathname.startsWith('/api/')) return sendJson(res, 403, { error: licenseExpired ? '体験版の期間が終了しました' : 'ライセンス認証が必要です' });
      return redirect(res, '/license');
    }
    if (pathname === '/license' && method === 'GET') {
      return sendHtml(res, 200, licensePage(user));
    }

    if (pathname === '/onboarding' && method === 'GET') {
      return sendHtml(res, 200, onboardingPage(user, url.searchParams.get('change') === '1' && !!PERSONAS[user.persona]));
    }
    if (pathname === '/api/persona' && method === 'POST') {
      const { persona, change } = await parseBody(req);
      if (!PERSONAS[persona]) return sendHtml(res, 400, onboardingPage(user, !!change));
      Users.setPersona(user.id, persona);
      return redirect(res, change ? '/account' : '/guide?welcome=1');
    }

    // 属性が未設定なら、まずオンボーディングへ（既存アカウントも含む）
    if (!PERSONAS[user.persona] && method === 'GET') return redirect(res, '/onboarding');

    if (pathname === '/dashboard' && method === 'GET') {
      const openNo = parseInt(url.searchParams.get('open') || '', 10) || null;
      return sendHtml(res, 200, dashboardPage(user, openNo));
    }
    if (pathname === '/prompts' && method === 'GET') return sendHtml(res, 200, promptsPage(user));
    if (pathname === '/account' && method === 'GET') return sendHtml(res, 200, accountPage(user));
    if (pathname === '/guide' && method === 'GET') {
      return sendHtml(res, 200, guidePage(user, { welcome: url.searchParams.get('welcome') === '1' }));
    }
    if (pathname === '/product' && method === 'GET') {
      return sendHtml(res, 200, productPage(user, { saved: url.searchParams.get('saved') === '1' }));
    }
    if (pathname === '/api/product' && method === 'POST') {
      const body = await parseBody(req);
      ProductProfile.update(user.id, normalizeProfile(body));
      return redirect(res, '/product?saved=1');
    }

    const promptMatch = pathname.match(/^\/prompts\/(\d+)$/);
    if (promptMatch && method === 'GET') {
      const p = Prompts.get(parseInt(promptMatch[1], 10));
      if (!p) { res.writeHead(404); return res.end('not found'); }
      const promptGateNo = gateNoOfPrompt(p.no);
      if (promptGateNo && !isGateAllowed(user, promptGateNo)) return sendHtml(res, 200, trialLockedPage(user, promptGateNo));
      return sendHtml(res, 200, promptDetailPage(user, p));
    }

    const gateMatch = pathname.match(/^\/api\/gate\/(\d+)$/);
    if (gateMatch && method === 'POST') {
      const gateNo = parseInt(gateMatch[1], 10);
      const { status } = await parseBody(req);
      if (gateNo < 1 || gateNo > 10 || !['PENDING', 'GREEN', 'YELLOW', 'RED'].includes(status)) {
        return sendJson(res, 400, { error: 'invalid status' });
      }
      if (!isGateAllowed(user, gateNo)) return sendJson(res, 403, { error: '体験版では利用できないGATEです' });
      GateProgress.upsert(user.id, gateNo, status, '');
      return redirect(res, `/dashboard?open=${gateNo}#gate-${gateNo}`);
    }

    const dayMatch = pathname.match(/^\/api\/day\/(\d+)$/);
    if (dayMatch && method === 'POST') {
      const dayNo = parseInt(dayMatch[1], 10);
      if (dayNo < 1 || dayNo > 90) return sendJson(res, 400, { error: 'invalid day' });
      const { done } = await parseBody(req);
      DayProgress.setDone(user.id, dayNo, !!done);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/run-prompt' && method === 'POST') {
      const { provider, apiKey, promptText, promptNo } = await parseBody(req);
      const runGateNo = gateNoOfPrompt(promptNo);
      if (runGateNo && !isGateAllowed(user, runGateNo)) return sendJson(res, 403, { error: '体験版では利用できないGATEです' });
      try {
        const output = await runPrompt({ provider, apiKey, promptText });
        AiRuns.create({ userId: user.id, promptNo: promptNo || null, provider, inputText: promptText, outputText: output });
        return sendJson(res, 200, { output });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`ミチシルベ: http://localhost:${PORT}`));
}

module.exports = server;
