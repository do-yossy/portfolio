'use strict';
// AI商品化実践システム｜購入者向けWebアプリ
// - 購入者アカウント（メール+パスワード）、購入者属性に合わせた進め方、90日/GATE進捗の保存
// - マイ商品（商品の基本情報・決済方法・振込先）を一度登録すると、各プロンプトに自動入力される
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
const { escapeHtml, jsonForScript, icon, layout } = require('./lib/ui');
const { PERSONAS, tipsFor, prepStepsFor } = require('./lib/personas');
const { planFields, fieldHtml, CLIENT_JS } = require('./lib/prompt-form');
const O = require('./lib/options');
const promptSeeds = require('./seeds/prompts');
const promptFields = require('./seeds/prompt-fields');
const gateDefs = require('./seeds/gates');

Prompts.sync(promptSeeds);

const PORT = parseInt(process.env.PORT || '3300', 10);
const STATUS_LABEL = { PENDING: '未着手', GREEN: '合格', YELLOW: '要修正', RED: 'やり直し' };
const TROUBLE_PROMPTS = [18, 28, 23, 24];

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

// ── ページ: トップ（未ログイン）──
function homePage() {
  const feat = (ic, t, d) => `<div class="feature"><div class="fi">${icon(ic, 22)}</div><div><b>${t}</b><small>${d}</small></div></div>`;
  return layout('ようこそ', `
    <section class="landing-hero">
      <div class="eyebrow">90 DAYS PROGRAM</div>
      <h1>あなたの経験を、<br>ひとつの商品に。</h1>
      <p>AIプロンプトと10のGATEで、商品選びから販売・改善までを順番に進めるための専用アプリです。</p>
      <div class="btn-row" style="margin-top:18px">
        <a class="btn btn-gold" href="/signup">アカウントを作成</a>
        <a class="btn btn-ghost" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.35)" href="/login">ログイン</a>
      </div>
    </section>
    <div class="features">
      ${feat('map', '今やることが、ひと目でわかる', 'ロードマップ上に現在地と「次に開くプロンプト」を表示します。')}
      ${feat('sparkle', '選ぶだけでプロンプトが完成', '商品名や決済方法は一度登録すれば自動入力。ほとんどの項目はタップで選べます。')}
      ${feat('user', 'あなたのレベルに合わせて案内', 'ビジネス初心者・AI初心者など、選んだ属性に合わせてヒントとAIへの頼み方が変わります。')}
      ${feat('prompt', 'いつものChatGPTでそのまま使える', 'APIキーがなくても、コピーまたはワンタップでChatGPTを開いて使えます。')}
    </div>
  `);
}

// ── ページ: サインアップ／ログイン ──
function authForm(kind, error) {
  const isSignup = kind === 'signup';
  return layout(isSignup ? 'アカウント作成' : 'ログイン', `
    <div class="eyebrow">${isSignup ? 'CREATE ACCOUNT' : 'SIGN IN'}</div>
    <h1>${isSignup ? 'アカウント作成' : 'ログイン'}</h1>
    <p class="lead">${isSignup ? '購入時のメールアドレスで登録してください。' : 'おかえりなさい。続きから進めましょう。'}</p>
    ${error ? `<div class="notice error" style="margin:12px 0">${escapeHtml(error)}</div>` : ''}
    <div class="card" style="margin-top:14px">
      <form method="POST" action="${isSignup ? '/signup' : '/login'}">
        <div class="field"><label class="lbl" for="email">メールアドレス</label><input id="email" type="email" name="email" required autofocus autocomplete="email"></div>
        <div class="field"><label class="lbl" for="password">パスワード${isSignup ? '（8文字以上）' : ''}</label>
          <input id="password" type="password" name="password" required minlength="8" autocomplete="${isSignup ? 'new-password' : 'current-password'}"></div>
        <button class="btn btn-primary btn-block" type="submit">${isSignup ? 'アカウントを作成して始める' : 'ログイン'}</button>
      </form>
    </div>
    <p class="muted" style="text-align:center">${isSignup ? 'すでにアカウントをお持ちの方は <a href="/login">ログイン</a>'
      : 'はじめての方は <a href="/signup">アカウント作成</a>'}</p>
  `);
}

// ── ページ: オンボーディング（購入者属性の選択）──
function onboardingPage(user, isChange) {
  const cur = user.persona || '';
  const cards = Object.entries(PERSONAS).map(([key, p]) => `
    <label><input type="radio" name="persona" value="${key}" ${cur === key ? 'checked' : ''} required>
      <div class="pc"><span class="mark"></span><div><b>${escapeHtml(p.label)}</b><small>${escapeHtml(p.desc)}</small></div></div></label>`).join('');
  return layout('あなたについて', `
    ${isChange ? '' : '<div class="stepper"><i class="on"></i><i></i></div><div class="eyebrow">STEP 1 / 2</div>'}
    <h1>いちばん近いものを選んでください</h1>
    <p class="lead">選んだ内容に合わせて、ヒントの出し方と、AIへの頼み方（説明の詳しさ）を調整します。あとからいつでも変更できます。</p>
    <form method="POST" action="/api/persona" style="margin-top:16px">
      <input type="hidden" name="change" value="${isChange ? '1' : ''}">
      <div class="pick">${cards}</div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:18px">${isChange ? '変更を保存する' : '次へ'} ${icon('arrow', 18)}</button>
    </form>
  `, { user, noNav: !isChange, active: 'account' });
}

// ── ページ: ダッシュボード ──
function heroHtml(pg, titles) {
  const pct = pg.greenCount / 10;
  const C = 2 * Math.PI * 38;
  const ring = `<div class="ring"><svg width="92" height="92" viewBox="0 0 92 92">
      <circle cx="46" cy="46" r="38" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="8"/>
      ${pct > 0 ? `<circle cx="46" cy="46" r="38" fill="none" stroke="url(#rg)" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"/>` : ''}
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DDB0"/><stop offset="1" stop-color="#CFAE74"/></linearGradient></defs>
    </svg><div class="num"><div><b>${pg.greenCount}</b><span>/ 10 GATE</span></div></div></div>`;
  const dayPct = Math.round((pg.doneDays.size / 90) * 100);
  const daybar = `<div class="daybar"><div class="track"><div class="fill" style="width:${dayPct}%"></div></div>
    <div class="meta"><span>90日チェックリスト</span><span>${pg.doneDays.size} / 90 日</span></div></div>`;
  if (!pg.nextDef) {
    return `<section class="hero"><div class="hero-top">${ring}<div class="hero-next"><div class="eyebrow">COMPLETE</div>
      <div class="gate">全GATE合格</div><p class="why">お疲れさまでした。No.16で商品のシリーズ展開を考えてみましょう。</p></div></div>
      <div class="hero-steps"><a class="first" href="/prompts/16">No.16 ${escapeHtml(titles[16] || '')}</a></div>${daybar}</section>`;
  }
  const d = pg.nextDef;
  const steps = d.steps.map((n, i) => `<a class="${i === 0 ? 'first' : ''}" href="/prompts/${n}"><span class="n">${i + 1}</span>No.${n} ${escapeHtml(titles[n] || '')}</a>`).join('');
  const extra = d.setupLink ? `<a class="first" href="${d.setupLink.href}">${escapeHtml(d.setupLink.text)}</a>` : '';
  return `<section class="hero">
    <div class="hero-top">${ring}<div class="hero-next"><div class="eyebrow">NEXT ・ ${escapeHtml(d.phase)}</div>
      <div class="gate">GATE${d.no}　${escapeHtml(d.name)}</div>
      <p class="why">${d.steps.length ? '上から順にプロンプトを開いて進めましょう。' : 'このGATEは購入時の資料を見ながら進めます。'}</p></div></div>
    <div class="hero-steps">${steps}${extra}</div>
    ${daybar}
  </section>`;
}

function roadmapHtml(pg, persona, titles, openNo) {
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
        <span class="nm">${escapeHtml(titles[n] || '')}</span>${reviews.has(n) ? '<span class="tag">GATE判定</span>' : ''}
        ${(d.extra || []).includes(n) ? '<span class="tag">必要な人だけ</span>' : ''}${icon('chevron', 16)}</a></li>`).join('');
      const ext = d.external ? `<li><div class="ext">${icon('lock', 16)}「${escapeHtml(d.external)}」はアプリ未収録です。購入時にお渡しした資料をご覧ください。</div></li>` : '';
      const setup = d.setupLink ? `<li><a href="${d.setupLink.href}"><span class="no">${icon('bank', 14)}</span><span class="nm">${escapeHtml(d.setupLink.text)}</span>${icon('chevron', 16)}</a></li>` : '';
      const tips = tipsFor(persona, no).map((t) => `<div class="tip">${icon('bulb', 18)}<div><b>${escapeHtml(t.tag)}</b>${escapeHtml(t.text)}</div></div>`).join('');
      const seg = ['GREEN', 'YELLOW', 'RED', 'PENDING'].map((s) => `<button type="submit" name="status" value="${s}" class="s-${s} ${g.status === s ? 'on' : ''}">${STATUS_LABEL[s]}</button>`).join('');
      const open = no === nextNo || no === openNo;
      return `<li class="${cls}" id="gate-${no}">
        <span class="dot">${g.status === 'GREEN' ? icon('check', 18) : no}</span>
        <details class="node-card" ${open ? 'open' : ''}>
          <summary><span class="t"><b>GATE${no}　${escapeHtml(d.name)}${no === nextNo ? '<span class="now-tag">NOW</span>' : ''}</b>
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
    return `<li class="stage"><div class="stage-head"><b>${escapeHtml(st.title)}</b><span>${escapeHtml(st.sub)}</span></div><ol class="roadmap">${nodes}</ol></li>`;
  }).join('');
  return `<ol class="roadmap">${stages}</ol>`;
}

function lineupHtml(pg, profile) {
  const st = (no) => pg.gates.find((g) => g.gate_no === no).status === 'GREEN';
  const p1State = st(8) ? '販売中' : st(5) ? '販売準備中' : st(1) ? '制作中' : '選定中';
  const p2State = st(10) ? '企画確定' : st(9) ? '企画中' : 'これから';
  const card = (no, name, state, meta, active, locked) => `<div class="lu-card ${active ? 'active' : ''} ${locked ? 'locked' : ''}">
      <div class="lu-head"><span class="lu-no">${no}</span><span class="lu-state">${escapeHtml(state)}</span></div>
      <div class="lu-name">${escapeHtml(name)}</div><div class="lu-meta">${escapeHtml(meta)}</div></div>`;
  const arrow = `<div class="lu-arrow">${icon('arrow', 20)}</div>`;
  return `<div class="lineup">
    ${card('PRODUCT 01', profile.product_name || '（未定）', p1State, [profile.product_format, profile.price_band].filter(Boolean).join('・') || 'GATE1〜9', true, false)}
    ${arrow}
    ${card('PRODUCT 02', '商品1の学びを活かした商品', p2State, 'GATE10・No.25を再利用', st(9), !st(9))}
    ${arrow}
    ${card('SERIES', 'シリーズ・上位商品', st(10) ? '検討中' : 'これから', 'No.16でシリーズ化', st(10), !st(10))}
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
    <a class="card" href="/product" style="display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit">
      <span class="feature" style="padding:0;border:0;box-shadow:none;background:none"><span class="fi">${icon('box', 22)}</span></span>
      <span style="flex:1"><b style="display:block;font-size:14.5px">マイ商品を登録しましょう</b>
      <span class="muted">商品名・ターゲット・決済方法などが、各プロンプトに自動で入るようになります。</span></span>${icon('chevron', 18)}</a>`;

  return layout('ホーム', `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">
      <div><div class="eyebrow">DASHBOARD</div><h1 style="margin:0">今日も一歩ずつ</h1></div>
      <a href="/onboarding?change=1" class="badge st-PENDING" style="text-decoration:none">${escapeHtml(persona.label)}</a>
    </div>
    ${heroHtml(pg, titles)}
    ${prepHtml}
    ${profileNudge}
    <h2>${icon('map', 20)}ロードマップ</h2>
    <p class="muted">各GATEをタップすると、使うプロンプトと進め方のヒントが開きます。順番は強制ではありませんが、上から進めるのがおすすめです。</p>
    ${roadmapHtml(pg, user.persona, titles, openNo)}
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
  const row = (p, isRec) => `<a class="row-link" href="/prompts/${p.no}"><span class="no">No.${p.no}</span>
    <span class="t"><b>${escapeHtml(p.title)}${isRec ? '<span class="rec">今使う</span>' : ''}</b><small>${escapeHtml(p.timing || p.phase)}</small></span>${icon('chevron', 18, 'chev')}</a>`;
  const byNo = new Map(prompts.map((p) => [p.no, p]));
  return layout('プロンプト', `
    <div class="eyebrow">PROMPTS</div>
    <h1>AIプロンプト</h1>
    <p class="lead">項目を選ぶだけでプロンプトが完成します。そのままChatGPTで使えます。</p>
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
  const persona = PERSONAS[user.persona];
  const { occ, fields } = planFields(p.body, promptFields[p.no] || {});
  const ctx = { profile, auto: pg.auto };
  const formHtml = fields.length
    ? fields.map((f) => fieldHtml(f, ctx)).join('')
    : '<p class="muted">このプロンプトは入力項目がありません。そのまま使えます。</p>';
  const providers = Object.keys(PROVIDERS);
  return layout(`No.${p.no} ${p.title}`, `
    <a href="/prompts" class="btn btn-quiet back" style="padding-left:0">${icon('chevron', 16)}<span style="margin-left:-4px">プロンプト一覧</span></a>
    <div class="eyebrow">PROMPT No.${p.no}</div>
    <h1>${escapeHtml(p.title)}</h1>
    <p class="muted">${escapeHtml(p.phase)}　｜　使うタイミング：${escapeHtml(p.timing || '―')}</p>

    <div class="card">
      <div class="card-title">${icon('sparkle', 18)}選ぶだけで入力できます</div>
      <form id="pbForm" onsubmit="return false">${formHtml}
        ${persona ? `<label class="chip" style="margin-top:14px"><input type="checkbox" id="usePreamble" checked><span>${icon('user', 16)}「${escapeHtml(persona.label)}」向けに説明してもらう</span></label>` : ''}
      </form>
    </div>

    <div class="card">
      <div class="card-title">${icon('prompt', 18)}完成したプロンプト</div>
      <textarea id="promptBody" class="pb-out" rows="10" aria-label="完成したプロンプト"></textarea>
      <div id="missMsg" class="miss"></div>
      <p class="hint">上の項目を変更すると、この欄は作り直されます。細かい修正は最後にこの欄で行ってください。</p>
      ${p.note && p.note !== '―' ? `<div class="notice warn" style="margin-top:10px">${icon('flag', 16)}<div>注意：${escapeHtml(p.note)}</div></div>` : ''}
    </div>

    <div class="sticky-actions">
      <div class="btn-row">
        <button id="copyBtn" type="button" class="btn btn-ghost">${icon('copy', 18)}コピー</button>
        <button id="openChatGptBtn" type="button" class="btn btn-primary">${icon('external', 18)}ChatGPTで開く</button>
      </div>
      <p id="copyMsg" class="muted" style="margin:6px 2px 0;text-align:center"></p>
    </div>

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
      const CHATGPT_URL_LIMIT = 1500; // これを超える長さはURL方式が不安定になりうるため、コピーのみ案内する
      document.getElementById('copyBtn').addEventListener('click', async () => {
        const text = document.getElementById('promptBody').value;
        const msgEl = document.getElementById('copyMsg');
        try {
          await navigator.clipboard.writeText(text);
          msgEl.textContent = 'コピーしました。ChatGPTに貼り付けてください。';
        } catch (e) {
          msgEl.textContent = 'コピーできませんでした。プロンプト欄を長押しして全選択→コピーしてください。';
        }
      });
      document.getElementById('openChatGptBtn').addEventListener('click', async () => {
        const text = document.getElementById('promptBody').value;
        const msgEl = document.getElementById('copyMsg');
        if (text.length > CHATGPT_URL_LIMIT) {
          try { await navigator.clipboard.writeText(text); } catch (e) {}
          msgEl.textContent = 'プロンプトが長いため自動入力できません。コピー済みなので、ChatGPTの入力欄に貼り付けてください。';
          window.open('https://chatgpt.com/', '_blank', 'noopener');
          return;
        }
        window.open('https://chatgpt.com/?q=' + encodeURIComponent(text), '_blank', 'noopener');
        msgEl.textContent = '新しいタブでChatGPTを開きました（自動入力されない場合は「コピー」→貼り付けてください）。';
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

// ── ページ: マイ商品（商品の基本情報・決済方法・振込先）──
function chipsInput(name, options, current, { multi = false, other = false } = {}) {
  const type = multi ? 'checkbox' : 'radio';
  const cur = new Set(multi ? String(current || '').split('、').filter(Boolean) : [current]);
  const isOther = other && current && !multi && !options.includes(current);
  const chips = options.map((o) => `<label class="chip"><input type="${type}" name="${name}" value="${escapeHtml(o)}" ${cur.has(o) ? 'checked' : ''}><span>${escapeHtml(o)}</span></label>`).join('');
  const otherChip = other ? `<label class="chip"><input type="${type}" name="${name}" value="__other" ${isOther ? 'checked' : ''} data-other-for="${name}"><span>その他</span></label>` : '';
  const otherInput = other ? `<input type="text" name="${name}_other" class="other-input ${isOther ? '' : 'hide'}" data-other-input="${name}" value="${isOther ? escapeHtml(current) : ''}" placeholder="自由に入力" maxlength="120">` : '';
  return `<div class="chips">${chips}${otherChip}</div>${otherInput}`;
}

function transferTemplate(pf) {
  if (!(pf.bank_name && pf.account_number && pf.account_holder)) return '';
  return [
    '【お振込先のご案内】',
    'このたびはお申し込みいただき、ありがとうございます。',
    '下記の口座へ代金のお振込みをお願いいたします。',
    '',
    `銀行名：${pf.bank_name}`,
    `支店名：${pf.bank_branch || '（支店名）'}`,
    `口座種別：${pf.account_type || '普通'}`,
    `口座番号：${pf.account_number}`,
    `口座名義：${pf.account_holder}`,
    '',
    `※${pf.transfer_note || '振込手数料はお客様のご負担でお願いいたします。'}`,
    '※ご入金を確認でき次第、商品のお届けについてご連絡いたします。',
  ].join('\n');
}

function productPage(user, { welcome, saved } = {}) {
  const pf = ProductProfile.get(user.id);
  const isBank = pf.payment_method === '銀行振込';
  const tpl = transferTemplate(pf);
  const masked = pf.account_number ? `••••${pf.account_number.slice(-3)}` : '';
  return layout('マイ商品', `
    ${welcome ? '<div class="stepper"><i class="on"></i><i class="on"></i></div><div class="eyebrow">STEP 2 / 2</div>' : '<div class="eyebrow">MY PRODUCT</div>'}
    <h1>マイ商品</h1>
    <p class="lead">ここで登録した内容は、各プロンプトに自動で入ります。決まっていない項目は空欄のままで大丈夫です。</p>
    ${saved ? `<div class="notice info" style="margin:12px 0">${icon('check', 16)}<div>保存しました。</div></div>` : ''}
    <form method="POST" action="/api/product" id="productForm">
      <input type="hidden" name="welcome" value="${welcome ? '1' : ''}">
      <h2>${icon('box', 20)}商品の基本</h2>
      <div class="card">
        <div class="field"><label class="lbl" for="product_name">商品名（仮でもOK）</label>
          <input id="product_name" type="text" name="product_name" value="${escapeHtml(pf.product_name)}" maxlength="80" placeholder="例：はじめての家計簿テンプレート"></div>
        <div class="field"><label class="lbl">商品の形式</label>${chipsInput('product_format', O.PRODUCT_FORMATS, pf.product_format)}</div>
        <div class="field"><label class="lbl" for="product_type">商品タイプ</label>
          <select id="product_type" name="product_type">${O.PRODUCT_TYPES.map((t) => `<option ${pf.product_type === t || (!pf.product_type && t === '未判定') ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
          <div class="hint">分からなければ「未判定」のままで、<a href="/prompts/29">No.29 商品タイプ判定</a>を使ってください。</div></div>
        <div class="field"><label class="lbl">ターゲット（誰に届けるか）</label>${chipsInput('target', O.TARGETS, pf.target, { other: true })}</div>
        <div class="field"><label class="lbl" for="pain">ターゲットの悩み（一言で）</label>
          <input id="pain" type="text" name="pain" value="${escapeHtml(pf.pain)}" maxlength="120" placeholder="例：家計簿が続かない"></div>
        <div class="field"><label class="lbl">集客経路<span class="req-badge">複数選択可</span></label>${chipsInput('channel', O.CHANNELS, pf.channel, { multi: true })}</div>
        <div class="field"><label class="lbl">価格帯（予定）</label>${chipsInput('price_band', O.PRICE_BANDS, pf.price_band)}</div>
      </div>

      <h2 id="payment">${icon('bank', 20)}決済方法・振込先</h2>
      <div class="card">
        <div class="field"><label class="lbl">お客様からの代金の受け取り方</label>${chipsInput('payment_method', O.PAYMENT_METHODS, pf.payment_method)}
          <div class="hint">販売ページのプロンプト（No.12）に自動で反映されます。口座番号などはAIには送りません。</div></div>
        <div id="bankFields" class="${isBank ? '' : 'hide'}">
          <div class="notice gold" style="margin-bottom:14px">${icon('lock', 16)}<div>振込先はあなたのアカウントでのみ表示され、AIへ送るプロンプトには含まれません。下の「振込案内文」をコピーして、購入者へのメールなどに使えます。</div></div>
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
          <div class="field"><label class="lbl">振込手数料</label>${chipsInput('transfer_note', ['振込手数料はお客様のご負担でお願いいたします。', '振込手数料は当方で負担いたします。'], pf.transfer_note)}</div>
          ${tpl ? `<details class="fold" style="margin-top:6px"><summary><span>振込案内文を表示（コピーして使えます）</span>${icon('chevron', 18, 'chev')}</summary>
            <pre class="template" id="tplText">${escapeHtml(tpl)}</pre>
            <button type="button" class="btn btn-ghost btn-sm" id="copyTpl" style="margin-top:10px">${icon('copy', 16)}案内文をコピー</button>
            <span id="tplMsg" class="muted"></span></details>` : '<p class="hint">銀行名・口座番号・口座名義を保存すると、購入者向けの振込案内文が作られます。</p>'}
          <div class="notice warn" style="margin-top:14px">${icon('flag', 16)}<div>インターネットで商品を販売するときは「特定商取引法に基づく表記」の掲載が必要です。販売ページとあわせて準備してください。</div></div>
        </div>
      </div>

      <div class="sticky-actions">
        <button class="btn btn-primary btn-block" type="submit">${welcome ? '保存して始める' : '保存する'}</button>
        ${welcome ? '<a class="btn btn-quiet btn-block" href="/dashboard">あとで登録する</a>' : ''}
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
          const pm = form.querySelector('input[name=payment_method]:checked');
          document.getElementById('bankFields').classList.toggle('hide', !(pm && pm.value === '銀行振込'));
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
          try { await navigator.clipboard.writeText(document.getElementById('tplText').textContent); document.getElementById('tplMsg').textContent = ' コピーしました'; }
          catch (e) { document.getElementById('tplMsg').textContent = ' コピーできませんでした。長押しで選択してください'; }
        });
      })();
    </script>
  `, { user, active: 'product', noNav: welcome });
}

// 入力値の検証・正規化（選択肢はリストにあるものだけを受け付ける）
function normalizeProfile(body) {
  const one = (v) => String(Array.isArray(v) ? v[0] : (v ?? '')).normalize('NFKC').trim();
  const text = (v, max) => one(v).slice(0, max);
  const pick = (v, list) => { const s = one(v); return list.includes(s) ? s : ''; };
  const pickOrOther = (v, otherV, list) => {
    const s = one(v);
    if (s === '__other') return text(otherV, 120);
    return list.includes(s) ? s : '';
  };
  const channels = [].concat(body.channel || []).map((c) => one(c)).filter((c) => O.CHANNELS.includes(c));
  const notes = ['振込手数料はお客様のご負担でお願いいたします。', '振込手数料は当方で負担いたします。'];
  return {
    product_name: text(body.product_name, 80),
    product_format: pick(body.product_format, O.PRODUCT_FORMATS),
    product_type: pick(body.product_type, O.PRODUCT_TYPES),
    target: pickOrOther(body.target, body.target_other, O.TARGETS),
    pain: text(body.pain, 120),
    channel: channels.join('、'),
    price_band: pick(body.price_band, O.PRICE_BANDS),
    payment_method: pick(body.payment_method, O.PAYMENT_METHODS),
    bank_name: text(body.bank_name, 40),
    bank_branch: text(body.bank_branch, 40),
    account_type: pick(body.account_type, O.ACCOUNT_TYPES),
    account_number: one(body.account_number).replace(/\D/g, '').slice(0, 8),
    account_holder: text(body.account_holder, 60),
    transfer_note: pick(body.transfer_note, notes),
  };
}

// ── ページ: アカウント ──
function accountPage(user) {
  const persona = PERSONAS[user.persona];
  return layout('アカウント', `
    <div class="eyebrow">ACCOUNT</div>
    <h1>アカウント</h1>
    <div class="card">
      <dl class="kv"><dt>メール</dt><dd>${escapeHtml(user.email)}</dd>
      <dt>あなたの属性</dt><dd>${escapeHtml(persona ? persona.label : '未設定')}</dd></dl>
      <a class="btn btn-ghost btn-block" href="/onboarding?change=1" style="margin-top:14px">属性を変更する</a>
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
      const first = !PERSONAS[user.persona];
      Users.setPersona(user.id, persona);
      return redirect(res, first ? '/product?welcome=1' : (change ? '/account' : '/dashboard'));
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
      return sendHtml(res, 200, productPage(user, { welcome: url.searchParams.get('welcome') === '1', saved: url.searchParams.get('saved') === '1' }));
    }
    if (pathname === '/api/product' && method === 'POST') {
      const body = await parseBody(req);
      ProductProfile.update(user.id, normalizeProfile(body));
      return redirect(res, body.welcome ? '/dashboard' : '/product?saved=1');
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
