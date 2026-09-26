'use strict';
// AI商品化実践システム｜購入者向けWebアプリ
// - 購入者アカウント（メール+パスワード）、購入者属性に合わせた進め方、90日/GATE進捗の保存
// - マイ商品（商品の基本情報・お客様からの代金の受け取り方）を一度登録すると、各プロンプトに自動入力される
// - AIプロンプト実行は購入者自身のAPIキーを都度受け取って中継するのみ。
//   キーはサーバー側に保存しない（lib/aiproxy.js を参照）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const STATIC_FILES = {
  '/manifest.json': { file: 'manifest.json', type: 'application/manifest+json; charset=utf-8' },
  '/sw.js': { file: 'sw.js', type: 'application/javascript; charset=utf-8' },
  '/icon-192.png': { file: 'icon-192.png', type: 'image/png' },
  '/icon-512.png': { file: 'icon-512.png', type: 'image/png' },
};

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

const { Users, GateProgress, DayProgress, Prompts, AiRuns, ProductProfile } = require('./db');
const auth = require('./lib/auth');
const { runPrompt, PROVIDERS } = require('./lib/aiproxy');
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
        <div class="eyebrow">The 90-Day Program</div>
        <h1>あなたの経験を、<br><em>ひとつの商品</em>に。</h1>
        <p>AIプロンプトと10のGATEで、商品選びから販売・改善までを順番に進めるための専用アプリです。</p>
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
    <footer class="foot">${crest(30)}<div class="fname">AI商品化実践システム</div><div class="ftag">The 90-Day Program</div></footer>
  `);
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

function roadmapHtml(pg, persona, titles, openNo, profile) {
  const byNo = new Map(pg.gates.map((g) => [g.gate_no, g]));
  const nextNo = pg.nextGate ? pg.nextGate.gate_no : null;
  const stages = gateDefs.STAGES.map((st, si) => {
    const nodes = st.gates.map((no) => {
      const g = byNo.get(no);
      const d = gateDefs.find((x) => x.no === no);
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
              <div class="seg-help">「GATE判定」のプロンプトでAIが出した判定（GREEN＝合格／YELLOW＝要修正／RED＝やり直し）をそのまま記録してください。</div>
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
      <div class="sub"><span>開始から<b>${pg.auto.daysSinceStart}</b>日目</span><a class="pill-link" href="/onboarding?change=1">${icon('user', 13)}${escapeHtml(persona.label)}</a></div>
    </header>
    ${heroHtml(pg, titles, profile)}
    ${prepHtml}
    ${profileNudge}
    <h2>${icon('map', 20)}ロードマップ</h2>
    <p class="muted">各GATEをタップすると、使うプロンプトと進め方のヒントが開きます。順番は強制ではありませんが、上から進めるのがおすすめです。</p>
    ${roadmapHtml(pg, user.persona, titles, openNo, profile)}
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
      <div class="notice info" style="margin-top:10px">${icon('external', 16)}<div>「ChatGPTで開く」を押すと、このプロンプトは自動でコピーされます。スマホにChatGPTアプリが入っているとアプリが開き、入力欄が空のことがあります。そのときは入力欄を長押しして「ペースト」を押すだけでOKです（打ち込む必要はありません）。</div></div>
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
           <a class="btn btn-primary btn-block" href="/prompts/${nextPrompt.no}">No.${nextPrompt.no} ${escapeHtml(nextPrompt.title)}へ ${icon('arrow', 16)}</a>`
        : `<p class="muted">これでGATE${next.gateNo}「${escapeHtml(next.gateName)}」の手順は最後です。判定結果をダッシュボードで記録しましょう。</p>
           <a class="btn btn-primary btn-block" href="/dashboard?open=${next.gateNo}#gate-${next.gateNo}">GATE${next.gateNo}の判定を記録する ${icon('arrow', 16)}</a>`}
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

    <script type="application/json" id="pb-data">${jsonForScript({ body: p.body, occ, preamble: persona ? persona.preamble : '' })}</script>
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
        window.open(tooLong ? 'https://chatgpt.com/' : 'https://chatgpt.com/?q=' + encodeURIComponent(text), '_blank', 'noopener');
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
  if (methods.has(P.CARD) && pf.pay_url_card) sections.push(['■クレジットカード', '下記のお支払いページからお手続きください。', pf.pay_url_card].join('\n'));
  if (methods.has(P.PAYPAL) && pf.pay_url_paypal) sections.push(['■PayPal', '下記のリンクからお支払いください。', pf.pay_url_paypal].join('\n'));
  if (methods.has(P.PLATFORM) && pf.pay_url_platform) sections.push(['■販売サイトでのご購入', '下記のページからご購入手続きをお願いいたします。', pf.pay_url_platform].join('\n'));
  if (methods.has(P.OTHER) && pf.pay_other_note) sections.push(['■その他のお支払い方法', pf.pay_other_note].join('\n'));
  if (!sections.length) return '';
  // 販売サイト経由だけなら入金確認・お届けは販売サイト側で行われるため、その一文は付けない
  const direct = sections.some((sec) => !sec.startsWith('■販売サイト'));
  return [
    '【お支払い方法のご案内】',
    `このたびは${pf.product_name ? `「${pf.product_name}」に` : ''}お申し込みいただき、ありがとうございます。`,
    ...(pf.sale_price ? [`お支払い金額：${yen(pf.sale_price)}（税込）`] : []),
    sections.length > 1 ? '以下のいずれかの方法でお支払いをお願いいたします。' : '以下の方法でお支払いをお願いいたします。',
    '',
    sections.join('\n\n'),
    ...(direct ? ['', '※ご入金を確認でき次第、商品のお届けについてご連絡いたします。'] : []),
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
        ${block(O.PAY.CARD, 'クレジットカード決済', urlField('pay_url_card', 'お支払いページのURL', 'https://buy.stripe.com/...', 'Stripeの「Payment Links」など、決済サービスで作ったお支払いページのURLを貼り付けます。'))}
        ${block(O.PAY.PAYPAL, 'PayPal', urlField('pay_url_paypal', 'PayPalのお支払いリンク', 'https://www.paypal.me/...', 'PayPal.Meのリンクなど、お客様が支払いに使うリンクを貼り付けます。'))}
        ${block(O.PAY.PLATFORM, '販売プラットフォーム', urlField('pay_url_platform', '商品ページのURL', 'https://...', 'note・Brain・BASE・STORESなどに出品した、あなたの商品ページのURLを貼り付けます。'))}
        ${block(O.PAY.OTHER, 'その他の方法', `<div class="field"><label class="lbl" for="pay_other_note">お支払い方法の説明</label>
          <input id="pay_other_note" type="text" name="pay_other_note" value="${escapeHtml(pf.pay_other_note)}" maxlength="120" placeholder="例：対面でのお支払い（現金）"></div>`)}
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
        <dt>あなたの属性</dt><dd>${escapeHtml(persona ? persona.label : '未設定')}</dd></dl>
        <a class="btn btn-outline-light btn-block" href="/onboarding?change=1" style="margin-top:18px">属性を変更する</a>
      </div>
    </div>
    <div class="card">
      <div class="card-title">${icon('lock', 18)}データの扱い</div>
      <p class="muted" style="margin:0">AIのAPIキーはサーバーに保存しません（このブラウザ内のみ）。マイ商品・振込先・進捗は、あなたのアカウントでのみ表示されます。</p>
    </div>
    <a class="btn btn-quiet btn-block" href="/logout">${icon('logout', 18)}ログアウト</a>
  `, { user, active: 'account' });
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

    // ── 以降は認証必須 ──
    if (!user) return redirect(res, '/login');

    if (pathname === '/onboarding' && method === 'GET') {
      return sendHtml(res, 200, onboardingPage(user, url.searchParams.get('change') === '1' && !!PERSONAS[user.persona]));
    }
    if (pathname === '/api/persona' && method === 'POST') {
      const { persona, change } = await parseBody(req);
      if (!PERSONAS[persona]) return sendHtml(res, 400, onboardingPage(user, !!change));
      Users.setPersona(user.id, persona);
      return redirect(res, change ? '/account' : '/dashboard');
    }

    // 属性が未設定なら、まずオンボーディングへ（既存アカウントも含む）
    if (!PERSONAS[user.persona] && method === 'GET') return redirect(res, '/onboarding');

    if (pathname === '/dashboard' && method === 'GET') {
      const openNo = parseInt(url.searchParams.get('open') || '', 10) || null;
      return sendHtml(res, 200, dashboardPage(user, openNo));
    }
    if (pathname === '/prompts' && method === 'GET') return sendHtml(res, 200, promptsPage(user));
    if (pathname === '/account' && method === 'GET') return sendHtml(res, 200, accountPage(user));
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
      return sendHtml(res, 200, promptDetailPage(user, p));
    }

    const gateMatch = pathname.match(/^\/api\/gate\/(\d+)$/);
    if (gateMatch && method === 'POST') {
      const gateNo = parseInt(gateMatch[1], 10);
      const { status } = await parseBody(req);
      if (gateNo < 1 || gateNo > 10 || !['PENDING', 'GREEN', 'YELLOW', 'RED'].includes(status)) {
        return sendJson(res, 400, { error: 'invalid status' });
      }
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
  server.listen(PORT, () => console.log(`AI商品化実践システム: http://localhost:${PORT}`));
}

module.exports = server;
