'use strict';
// 共通レイアウト・デザインシステム（Midnight & Champagne）・アイコン
// 見出しは Shippori Mincho B1、英字・数字は Cormorant Garamond（Google Fonts）。本文は端末標準のゴシック体。
// CSS・SVGはすべてインライン（npm依存なし）。

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// <script type="application/json"> に安全に埋め込むためのJSON
function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  prompt: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12.5h5"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  map: '<path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4.4 3-7.5 7.5-7.5 0 4.4-3 7.5-7.5 7.5z"/><path d="M12 15.5c0-3.6-2.6-6.5-6.5-6.5 0 3.6 2.6 6.5 6.5 6.5z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z"/>',
};

function icon(name, size = 20, extraClass = '') {
  return `<svg class="ico ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

// ブランドの紋章（金の二重リングにAIのモノグラム）
let crestSeq = 0;
function crest(size = 34) {
  const id = `cr${++crestSeq % 100000}`;
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4E5BF"/><stop offset=".45" stop-color="#D6B878"/><stop offset=".75" stop-color="#A9854A"/><stop offset="1" stop-color="#E9D4A4"/></linearGradient></defs>
  <circle cx="24" cy="24" r="22.8" fill="#0E1A22" stroke="url(#${id})" stroke-width="1.4"/>
  <circle cx="24" cy="24" r="19.4" fill="none" stroke="url(#${id})" stroke-width=".55" opacity=".75"/>
  <text x="24" y="30.6" text-anchor="middle" font-family="Cormorant Garamond, Shippori Mincho B1, serif" font-weight="600" font-size="19.5" letter-spacing=".6" fill="url(#${id})">AI</text>
</svg>`;
}

// 紙幣や証書のような細い波線の地紋（暗いカードの背景に敷く）
const guillocheCache = new Map();
function guilloche(w = 400, h = 300, { lines = 18, opacity = 0.24 } = {}) {
  const key = `${w}-${h}-${lines}-${opacity}`;
  if (guillocheCache.has(key)) return guillocheCache.get(key);
  const gid = `gl${key.replace(/\W/g, '')}`;
  let paths = '';
  for (let i = 0; i < lines; i++) {
    const ph = i * 0.3;
    let d = '';
    for (let x = 0; x <= w; x += 8) {
      const t = (x / w) * Math.PI * 2;
      const y = h * 0.5 + Math.sin(t * 1.2 + ph) * h * 0.26 + Math.sin(t * 2.7 - ph * 1.6) * h * 0.08 + (i - lines / 2) * (h / lines) * 0.38;
      d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
    }
    paths += `<path d="${d}"/>`;
  }
  const svg = `<svg class="guilloche" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D9BF8C" stop-opacity="0"/><stop offset=".4" stop-color="#EAD6A8"/><stop offset="1" stop-color="#B8945A" stop-opacity=".35"/></linearGradient></defs><g fill="none" stroke="url(#${gid})" stroke-width=".7" opacity="${opacity}">${paths}</g></svg>`;
  guillocheCache.set(key, svg);
  return svg;
}

const roman = (n) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || String(n);
const pad2 = (n) => String(n).padStart(2, '0');
const initial = (email) => (String(email || '?').match(/[a-z0-9]/i) || ['?'])[0].toUpperCase();

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Shippori+Mincho+B1:wght@600;700&display=swap';

const CSS = `
:root{
  --ink:#0E1A22;--ink-2:#243440;--ink-3:#42525D;--muted:#6B7780;
  --line:#E4DDD0;--line-2:#EDE8DF;
  --bg:#F5F1EA;--surface:#FFFFFF;--surface-2:#FBF8F2;
  --emerald:#0D4D47;--emerald-2:#15665E;--emerald-soft:#E4EFEB;--emerald-ink:#0A3B36;
  --gold:#B8945A;--gold-2:#D9BF8C;--gold-soft:#F6EEDD;--bronze:#80602F;
  --gold-grad:linear-gradient(135deg,#F4E5BF 0%,#D6B878 36%,#AE8A4C 66%,#E7D19E 100%);
  --green:#1C7A55;--green-soft:#E2F1E8;--yellow:#9C660F;--yellow-soft:#FBF0D8;--red:#AF3A2F;--red-soft:#F8E6E3;--pending:#7F8B95;--pending-soft:#EEF0F2;
  --sh-1:0 1px 2px rgba(14,26,34,.05);
  --sh-2:0 1px 2px rgba(14,26,34,.04),0 16px 36px -18px rgba(14,26,34,.2);
  --sh-3:0 28px 60px -28px rgba(14,26,34,.55);
  --r:20px;--r-sm:14px;
  --f-sans:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",YuGothic,Meiryo,system-ui,sans-serif;
  --f-serif:"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho",YuMincho,"Noto Serif JP",serif;
  --f-display:"Cormorant Garamond","Shippori Mincho B1",Georgia,serif;
  --check:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  --grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .42 0 0 0 0 .36 0 0 0 0 .26 0 0 0 .06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  --safe-b:env(safe-area-inset-bottom,0px);--safe-t:env(safe-area-inset-top,0px);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{margin:0;color:var(--ink);font-family:var(--f-sans);font-feature-settings:"palt","lnum";font-variant-numeric:lining-nums;letter-spacing:.03em;line-height:1.75;font-size:15px;
  -webkit-font-smoothing:antialiased;
  background:radial-gradient(90% 38% at 100% 0%,rgba(217,191,140,.2),rgba(217,191,140,0) 70%),radial-gradient(70% 40% at 0% 34%,rgba(13,77,71,.05),rgba(13,77,71,0) 70%),var(--grain),var(--bg);
  padding-top:calc(60px + var(--safe-t));padding-bottom:calc(108px + var(--safe-b))}
body.no-nav{padding-bottom:calc(36px + var(--safe-b))}
a{color:var(--emerald-2)}
.ico{flex-shrink:0;vertical-align:middle}
main{max-width:760px;margin:0 auto;padding:22px 18px 30px}
section{display:block}

/* type */
h1{font-family:var(--f-serif);font-weight:700;font-size:25px;line-height:1.5;letter-spacing:.08em;margin:6px 0 8px}
h2{display:flex;align-items:center;gap:12px;font-family:var(--f-serif);font-weight:700;font-size:18px;letter-spacing:.1em;margin:38px 0 14px}
h2 .ico{color:var(--gold)}
h2::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(184,148,90,.55),rgba(184,148,90,0))}
h2 .sec-no{font-family:var(--f-display);font-weight:600;font-size:25px;line-height:1;color:var(--gold);letter-spacing:.02em}
h3{font-family:var(--f-serif);font-size:16px;margin:0 0 8px;letter-spacing:.08em}
p{margin:0 0 10px}
.lead{color:var(--ink-3);font-size:14px;line-height:1.9}
.muted{color:var(--muted);font-size:12.5px;line-height:1.75}
.hint{font-size:12px;color:var(--muted);margin-top:7px;line-height:1.7}
.center{text-align:center}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:var(--f-display);font-style:italic;font-weight:500;font-size:16px;letter-spacing:.1em;color:var(--bronze);line-height:1.3}
.eyebrow::before{content:"";width:22px;height:1px;background:currentColor;opacity:.6}
.eyebrow.c::after{content:"";width:22px;height:1px;background:currentColor;opacity:.6}

/* header */
.topbar{position:fixed;top:0;left:0;right:0;z-index:30;height:calc(60px + var(--safe-t));padding:var(--safe-t) 16px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;
  background:linear-gradient(180deg,rgba(14,26,34,.97),rgba(14,26,34,.93));backdrop-filter:saturate(1.5) blur(14px);-webkit-backdrop-filter:saturate(1.5) blur(14px);
  box-shadow:0 1px 0 rgba(217,191,140,.3),0 12px 30px -20px rgba(0,0,0,.7)}
.brand{display:flex;align-items:center;gap:11px;color:#fff;text-decoration:none;min-width:0}
.brand-name{font-family:var(--f-serif);font-weight:700;font-size:15px;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}
.brand-name small{display:block;font-family:var(--f-display);font-style:italic;font-weight:500;font-size:12.5px;letter-spacing:.12em;color:var(--gold-2);margin-top:1px}
.avatar{width:36px;height:36px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-family:var(--f-display);font-weight:600;font-size:17px;color:var(--ink);text-decoration:none;
  background:var(--gold-grad);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 0 0 3px rgba(217,191,140,.16)}

/* surfaces */
.card{position:relative;background:var(--surface);border-radius:var(--r);padding:20px;margin-bottom:16px;box-shadow:inset 0 0 0 1px var(--line-2),var(--sh-2)}
.card-title{display:flex;align-items:center;gap:10px;font-family:var(--f-serif);font-weight:700;font-size:16px;letter-spacing:.08em;margin-bottom:14px}
.card-title .ico{color:var(--gold)}
.step-no{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-family:var(--f-display);font-weight:600;font-size:15px;line-height:1;background:var(--ink);color:var(--gold-2)}
.lux{position:relative;overflow:hidden;color:#F3EEE4;border-radius:24px;
  background:radial-gradient(120% 90% at 100% 0%,rgba(217,191,140,.24),rgba(217,191,140,0) 55%),radial-gradient(90% 80% at 0% 100%,rgba(21,102,94,.5),rgba(21,102,94,0) 62%),linear-gradient(160deg,#17313B 0%,#0E1A22 55%,#0A1318 100%);
  box-shadow:inset 0 0 0 1px rgba(217,191,140,.3),var(--sh-3)}
.lux::after{content:"";position:absolute;inset:6px;border-radius:19px;box-shadow:inset 0 0 0 1px rgba(217,191,140,.13);pointer-events:none}
.lux .eyebrow{color:var(--gold-2)}
.guilloche{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.hero-in{position:relative;z-index:1}

/* buttons */
.btn{position:relative;overflow:hidden;appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:9px;
  min-height:52px;padding:13px 22px;border-radius:15px;font:inherit;font-weight:700;font-size:15px;letter-spacing:.1em;text-decoration:none;white-space:nowrap;
  transition:transform .15s ease,box-shadow .25s ease,filter .2s}
.btn:active{transform:scale(.98)}
.btn-primary{color:#FBF7EE;background:linear-gradient(180deg,#17685F 0%,#0D4D47 55%,#0A3F3A 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 0 0 0 1px rgba(217,191,140,.38),0 14px 28px -14px rgba(10,63,58,.85)}
.btn-gold{color:#1B1408;background:var(--gold-grad);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 0 0 1px rgba(122,92,44,.22),0 16px 32px -14px rgba(168,132,69,.8)}
.btn-gold::after{content:"";position:absolute;top:0;bottom:0;width:38%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.6),transparent);transform:skewX(-20deg);animation:sheen 6s ease-in-out 1.4s infinite}
@keyframes sheen{0%,72%{left:-60%}100%{left:135%}}
.btn-ghost{color:var(--ink);background:rgba(255,255,255,.8);box-shadow:inset 0 0 0 1px var(--line),0 1px 2px rgba(14,26,34,.04)}
.btn-outline-light{color:#F6EFE0;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(246,239,224,.38)}
.btn-quiet{background:transparent;color:var(--muted);min-height:42px;padding:8px 12px;font-weight:600;letter-spacing:.06em}
.btn-block{width:100%}
.btn-sm{min-height:40px;padding:8px 16px;font-size:13px;border-radius:12px;letter-spacing:.06em}
.btn-row{display:flex;gap:10px;flex-wrap:wrap}
.btn-row>.btn{flex:1;min-width:0;padding-left:12px;padding-right:12px;letter-spacing:.04em}
.back .ico{transform:rotate(180deg)}

/* forms */
label.lbl{display:block;font-size:12.5px;font-weight:700;color:var(--ink-3);margin:0 0 8px;letter-spacing:.08em}
input[type=text],input[type=email],input[type=password],input[type=number],input[type=url],textarea,select{
  width:100%;padding:13px 15px;border:0;border-radius:var(--r-sm);font:inherit;font-size:16px;letter-spacing:.02em;background:var(--surface-2);color:var(--ink);
  box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .2s,background .2s}
input:focus,textarea:focus,select:focus{outline:none;background:#fff;box-shadow:inset 0 0 0 1.5px var(--gold),0 0 0 4px rgba(184,148,90,.16)}
textarea{line-height:1.8;resize:vertical}
select{appearance:none;-webkit-appearance:none;padding-right:42px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23A9854A' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 13px center}
.field{margin-bottom:18px}
.field:last-child{margin-bottom:0}
.auto-badge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--bronze);background:var(--gold-soft);box-shadow:inset 0 0 0 1px rgba(184,148,90,.3);
  border-radius:999px;padding:2px 9px;margin-left:8px;letter-spacing:.04em;vertical-align:1px}
.req-badge{font-size:10.5px;font-weight:700;color:var(--bronze);margin-left:8px}

/* chips */
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{position:relative;display:inline-flex}
.chip input{position:absolute;opacity:0;pointer-events:none}
.chip span{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:9px 16px;border-radius:999px;background:var(--surface);
  box-shadow:inset 0 0 0 1px var(--line);font-size:13.5px;font-weight:600;color:var(--ink-2);cursor:pointer;transition:all .18s ease;line-height:1.4}
.chip input:checked+span{background:var(--ink);color:#F6EFE0;box-shadow:inset 0 0 0 1px rgba(217,191,140,.5),0 8px 18px -10px rgba(14,26,34,.7)}
.chip input:checked+span::before{content:"";width:13px;height:13px;flex-shrink:0;background:var(--gold-grad);-webkit-mask:var(--check) center/contain no-repeat;mask:var(--check) center/contain no-repeat}
.chip input:focus-visible+span{box-shadow:inset 0 0 0 1.5px var(--gold),0 0 0 4px rgba(184,148,90,.2)}
.other-input{margin-top:10px}

/* notices */
.notice{display:flex;gap:10px;align-items:flex-start;padding:13px 15px;border-radius:var(--r-sm);font-size:13px;line-height:1.75}
.notice .ico{margin-top:3px}
.notice.warn{background:var(--yellow-soft);color:#6E4A0E;box-shadow:inset 3px 0 0 var(--yellow)}
.notice.info{background:linear-gradient(90deg,rgba(13,77,71,.08),rgba(13,77,71,.035));color:var(--emerald-ink);box-shadow:inset 3px 0 0 var(--emerald)}
.notice.gold{background:var(--gold-soft);color:#5E4623;box-shadow:inset 3px 0 0 var(--gold)}
.notice.error{background:var(--red-soft);color:#7E2A22;box-shadow:inset 3px 0 0 var(--red)}

/* status */
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;white-space:nowrap}
.badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.st-GREEN{background:var(--green-soft);color:var(--green)}
.st-YELLOW{background:var(--yellow-soft);color:var(--yellow)}
.st-RED{background:var(--red-soft);color:var(--red)}
.st-PENDING{background:var(--pending-soft);color:var(--pending)}

/* bottom tab bar (floating) */
.tabbar{position:fixed;left:12px;right:12px;bottom:calc(10px + var(--safe-b));z-index:30;display:flex;gap:2px;padding:6px;border-radius:24px;
  background:rgba(14,26,34,.95);backdrop-filter:saturate(1.6) blur(16px);-webkit-backdrop-filter:saturate(1.6) blur(16px);
  box-shadow:inset 0 0 0 1px rgba(217,191,140,.24),0 20px 44px -18px rgba(0,0,0,.6)}
.tabbar a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 2px 7px;border-radius:18px;color:#8D9AA3;text-decoration:none;
  font-size:10.5px;font-weight:600;letter-spacing:.06em;transition:color .2s,background .2s}
.tabbar a.active{color:var(--gold-2);background:rgba(217,191,140,.11)}
@media (min-width:600px){.tabbar{left:50%;right:auto;width:560px;transform:translateX(-50%)}}

/* page head */
.page-head{margin:2px 0 18px}
.page-head .sub{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:12.5px;color:var(--muted)}
.page-head .sub b{font-family:var(--f-display);font-size:20px;color:var(--ink);font-weight:600;margin:0 2px}
.pill-link{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--gold-soft);color:var(--bronze);text-decoration:none;
  font-size:11.5px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(184,148,90,.32)}

/* hero */
.hero{padding:24px 20px 20px;margin-bottom:18px;border-radius:26px}
.hero::after{border-radius:21px}
.hero-top{display:flex;gap:18px;align-items:center}
.ring{position:relative;width:104px;height:104px;flex-shrink:0}
.ring svg{transform:rotate(-90deg);overflow:visible}
.ring .prog{stroke-dasharray:var(--c);stroke-dashoffset:var(--off);animation:draw 1.5s cubic-bezier(.3,.7,.2,1) .3s both}
@keyframes draw{from{stroke-dashoffset:var(--c)}}
.ring .num{position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1}
.ring .num b{display:block;font-family:var(--f-display);font-weight:600;font-size:42px;color:#FBF6EA}
.ring .num span{display:block;margin-top:3px;font-family:var(--f-display);font-style:italic;font-size:12.5px;letter-spacing:.1em;color:var(--gold-2)}
.hero-next{min-width:0}
.hero-next .gate{margin:7px 0 7px;line-height:1.3}
.hero-next .gno{display:block;font-family:var(--f-display);font-weight:600;font-size:15px;letter-spacing:.24em;color:var(--gold-2)}
.hero-next .gname{display:block;font-family:var(--f-serif);font-weight:700;font-size:23px;letter-spacing:.1em;color:#fff}
.hero-next .why{font-size:12.5px;color:rgba(243,238,228,.78);margin:0;line-height:1.7}
.hero-steps{list-style:none;margin:20px 0 18px;padding:0;display:grid;gap:8px}
.hero-steps a{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;color:#F3EEE4;text-decoration:none;font-size:13.5px;font-weight:600;
  background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.hero-steps a .n{font-family:var(--f-display);font-weight:600;font-size:20px;line-height:1;color:var(--gold-2);min-width:18px;text-align:center}
.hero-steps a .t{flex:1;min-width:0}
.hero-steps a .ico{color:rgba(243,238,228,.5)}
.hero-steps a.first{background:linear-gradient(120deg,rgba(244,229,191,.24),rgba(174,138,76,.12));box-shadow:inset 0 0 0 1px rgba(217,191,140,.62),0 12px 26px -16px rgba(0,0,0,.7)}
.hero-steps a .start{font-family:var(--f-display);font-style:italic;font-size:13px;letter-spacing:.12em;color:var(--gold-2)}
.daybar .track{height:5px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden}
.daybar .fill{height:100%;border-radius:99px;background:var(--gold-grad)}
.daybar .meta{display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;color:rgba(243,238,228,.75);margin-top:8px;letter-spacing:.06em}
.daybar .meta b{font-family:var(--f-display);font-size:16px;color:#fff;font-weight:600}

/* nudge */
.nudge{display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit}
.nudge .ni{width:48px;height:48px;border-radius:14px;flex-shrink:0;display:grid;place-items:center;color:var(--bronze);background:var(--gold-soft);box-shadow:inset 0 0 0 1px rgba(184,148,90,.3)}
.nudge .tx{flex:1;min-width:0}
.nudge b{display:block;font-family:var(--f-serif);font-size:15px;letter-spacing:.06em}
.nudge .chev{color:var(--gold)}
.nudge .muted{display:block;margin-top:2px}

/* roadmap */
.roadmap{list-style:none;margin:0;padding:0}
.stage{margin-bottom:6px}
.stage-head{display:flex;align-items:baseline;gap:10px;margin:22px 0 12px}
.stage-head .roman{font-family:var(--f-display);font-weight:600;font-size:24px;line-height:1;color:var(--gold);width:40px;text-align:center;letter-spacing:.02em}
.stage-head b{font-family:var(--f-serif);font-size:15.5px;letter-spacing:.1em}
.stage-head .ph{font-family:var(--f-display);font-style:italic;font-size:14px;letter-spacing:.08em;color:var(--bronze)}
.node{position:relative;padding-left:54px;padding-bottom:12px}
.node::before{content:"";position:absolute;left:19px;top:42px;bottom:-2px;width:2px;background:repeating-linear-gradient(to bottom,var(--line) 0 5px,transparent 5px 10px)}
.node.done::before{background:var(--gold-grad)}
.node.last::before{display:none}
.dot{position:absolute;left:0;top:4px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-family:var(--f-display);font-weight:600;font-size:19px;line-height:1;
  color:var(--muted);background:var(--surface);box-shadow:inset 0 0 0 1px var(--line),var(--sh-1);z-index:1}
.node.done .dot{color:var(--ink);background:var(--gold-grad);box-shadow:0 8px 18px -10px rgba(168,132,69,.9)}
.node.st-y .dot{color:var(--yellow);background:var(--yellow-soft);box-shadow:inset 0 0 0 1.5px var(--yellow)}
.node.st-r .dot{color:var(--red);background:var(--red-soft);box-shadow:inset 0 0 0 1.5px var(--red)}
.node.current .dot{color:var(--gold-2);background:var(--ink);box-shadow:0 0 0 4px rgba(217,191,140,.3),0 10px 22px -10px rgba(14,26,34,.8)}
.node.current .dot::after{content:"";position:absolute;inset:-9px;border-radius:50%;border:1.5px solid rgba(184,148,90,.55);animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{transform:scale(.8);opacity:1}100%{transform:scale(1.35);opacity:0}}
.node-card{background:var(--surface);border-radius:18px;box-shadow:inset 0 0 0 1px var(--line-2),var(--sh-1);overflow:hidden}
.node.current .node-card{box-shadow:inset 0 0 0 1px rgba(184,148,90,.6),0 20px 42px -24px rgba(168,132,69,.75)}
.node-card summary{list-style:none;display:flex;align-items:center;gap:10px;padding:14px 15px;cursor:pointer}
.node-card summary::-webkit-details-marker{display:none}
.node-card summary .t{flex:1;min-width:0}
.node-card .gno{display:block;font-family:var(--f-display);font-weight:600;font-size:13px;letter-spacing:.22em;color:var(--bronze);line-height:1.3}
.node-card summary .t b{display:block;font-family:var(--f-serif);font-size:16px;letter-spacing:.08em;line-height:1.5}
.node-card summary .t small{font-size:11px;color:var(--muted)}
.node-card summary .chev{color:var(--muted);transition:transform .25s}
.node-card[open] summary .chev{transform:rotate(90deg)}
.node-body{padding:2px 15px 16px;border-top:1px solid var(--line-2)}
.now-tag{display:inline-block;margin-left:8px;padding:1px 9px;border-radius:999px;font-family:var(--f-display);font-style:italic;font-weight:600;font-size:12.5px;letter-spacing:.1em;
  color:var(--ink);background:var(--gold-grad);vertical-align:1px}
.steps{list-style:none;margin:14px 0 0;padding:0}
.steps li{margin-bottom:8px}
.steps a{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:14px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2);text-decoration:none;color:var(--ink)}
.steps .no{flex-shrink:0;min-width:50px;text-align:center;font-family:var(--f-display);font-weight:600;font-size:15px;color:var(--emerald);background:var(--emerald-soft);border-radius:10px;padding:4px 6px;line-height:1.2}
.steps .nm{flex:1;font-size:13.5px;font-weight:600;line-height:1.55}
.steps .nm .tag{display:inline-block;margin-left:6px;vertical-align:1px}
.steps .tag{font-size:10px;font-weight:700;color:var(--bronze);background:var(--gold-soft);box-shadow:inset 0 0 0 1px rgba(184,148,90,.35);border-radius:6px;padding:2px 7px;white-space:nowrap}
.steps a .ico{color:var(--gold)}
.steps .ext{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:14px;box-shadow:inset 0 0 0 1px var(--line);font-size:12.5px;color:var(--muted);background:rgba(255,255,255,.5)}
.tip{display:flex;gap:12px;margin-top:12px;padding:13px 14px;border-radius:14px;background:linear-gradient(135deg,var(--gold-soft),#FBF6EA);box-shadow:inset 0 0 0 1px rgba(184,148,90,.24);
  font-size:12.5px;line-height:1.85;color:#4D3D22}
.tip .ico{color:var(--gold);margin-top:3px}
.tip b{display:block;font-family:var(--f-serif);font-size:12.5px;letter-spacing:.1em;color:var(--bronze);margin-bottom:2px}
.status-form{margin-top:16px}
.status-form .lbl{margin-bottom:9px;font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ink-3)}
.seg{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px;border-radius:14px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2)}
.seg button{appearance:none;border:0;font:inherit;font-size:12px;font-weight:700;letter-spacing:.06em;min-height:40px;border-radius:10px;cursor:pointer;background:transparent;color:var(--muted);transition:all .2s}
.seg button.on.s-GREEN{background:var(--green);color:#fff;box-shadow:0 8px 16px -10px rgba(28,122,85,.9)}
.seg button.on.s-YELLOW{background:var(--yellow);color:#fff}
.seg button.on.s-RED{background:var(--red);color:#fff}
.seg button.on.s-PENDING{background:#fff;color:var(--ink-2);box-shadow:0 1px 3px rgba(14,26,34,.14)}
.seg-help{font-size:11px;color:var(--muted);margin-top:9px;line-height:1.7}

/* lineup */
.lineup{display:grid;grid-template-columns:1fr;gap:0}
.lu-card{position:relative;overflow:hidden;background:var(--surface);border-radius:18px;padding:18px 18px 18px 20px;box-shadow:inset 0 0 0 1px var(--line-2),var(--sh-1)}
.lu-card.active{box-shadow:inset 0 0 0 1px rgba(184,148,90,.55),0 20px 42px -26px rgba(168,132,69,.8)}
.lu-card.active::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--gold-grad)}
.lu-card.locked{background:rgba(255,255,255,.55);box-shadow:inset 0 0 0 1px var(--line-2)}
.lu-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.lu-no{font-family:var(--f-display);font-style:italic;font-weight:600;font-size:17px;letter-spacing:.08em;color:var(--bronze)}
.lu-state{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--pending-soft);color:var(--muted);letter-spacing:.04em}
.lu-card.active .lu-state{background:var(--ink);color:var(--gold-2)}
.lu-name{font-family:var(--f-serif);font-weight:700;font-size:16px;letter-spacing:.06em;line-height:1.6;word-break:break-all}
.lu-meta{font-size:11.5px;color:var(--muted);margin-top:4px}
.lu-arrow{display:grid;place-items:center;height:30px;color:var(--gold)}
.lu-arrow .ico{transform:rotate(90deg)}
@media (min-width:560px){
  .lineup{grid-template-columns:1fr 30px 1fr 30px 1fr;align-items:stretch}
  .lu-arrow{height:auto}
  .lu-arrow .ico{transform:none}
}

/* prep */
.prep ul{list-style:none;margin:6px 0 0;padding:0}
.prep li{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line-2);font-size:13.5px;line-height:1.7}
.prep li:first-child{border-top:0}
.prep input{width:20px;height:20px;margin:3px 0 0;accent-color:var(--emerald);flex-shrink:0}

/* fold / day grid */
details.fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:700;font-size:14px}
details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary .chev{color:var(--gold);transition:transform .25s}
details.fold[open]>summary .chev{transform:rotate(90deg)}
.day-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px;margin-top:16px}
.daycell{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-family:var(--f-display);font-weight:600;font-size:13px;color:var(--muted);
  padding:7px 2px;border-radius:12px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2);min-height:50px;cursor:pointer;transition:all .15s}
.daycell.done{background:var(--ink);color:var(--gold-2);box-shadow:none}
.daycell input{width:17px;height:17px;margin:0;accent-color:var(--gold)}

/* list rows */
.rows{background:var(--surface);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line-2),var(--sh-2);overflow:hidden}
.row-link{display:flex;align-items:center;gap:14px;padding:14px 16px;text-decoration:none;color:var(--ink);border-top:1px solid var(--line-2)}
.row-link:first-child{border-top:0}
.row-link .no{flex-shrink:0;width:50px;height:50px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;
  background:linear-gradient(160deg,#FCF8EF,var(--gold-soft));box-shadow:inset 0 0 0 1px rgba(184,148,90,.32)}
.row-link .no small{font-family:var(--f-display);font-style:italic;font-size:11.5px;color:var(--bronze);letter-spacing:.04em}
.row-link .no em{font-family:var(--f-display);font-style:normal;font-weight:600;font-size:22px;color:var(--ink);margin-top:1px}
.row-link .t{flex:1;min-width:0}
.row-link .t b{display:block;font-family:var(--f-serif);font-size:15px;letter-spacing:.06em;line-height:1.55}
.row-link .t small{display:block;font-size:11.5px;color:var(--muted);line-height:1.6;margin-top:3px}
.row-link .chev{color:var(--gold)}
.rec{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:6px;font-family:var(--f-sans);font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--ink);background:var(--gold-grad);vertical-align:2px}

/* persona */
.pick{display:grid;gap:12px}
.pick label{position:relative;display:block;cursor:pointer}
.pick input{position:absolute;opacity:0}
.pick .pc{display:flex;gap:14px;align-items:center;padding:16px;border-radius:18px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line),var(--sh-1);transition:all .2s}
.pick .pi{width:48px;height:48px;border-radius:14px;flex-shrink:0;display:grid;place-items:center;color:var(--bronze);background:var(--gold-soft);box-shadow:inset 0 0 0 1px rgba(184,148,90,.3);transition:all .2s}
.pick .tx{flex:1;min-width:0}
.pick .pc b{display:block;font-family:var(--f-serif);font-size:15.5px;letter-spacing:.06em;margin-bottom:2px;line-height:1.5}
.pick .pc small{font-size:12.5px;color:var(--muted);line-height:1.65}
.pick .mark{width:24px;height:24px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 0 0 1.5px var(--line);display:grid;place-items:center;transition:all .2s}
.pick input:checked+.pc{background:linear-gradient(135deg,#FFFFFF,#FBF5E8);box-shadow:inset 0 0 0 1.5px var(--gold),0 18px 36px -22px rgba(168,132,69,.9)}
.pick input:checked+.pc .pi{color:var(--ink);background:var(--gold-grad);box-shadow:none}
.pick input:checked+.pc .mark{background:var(--ink);box-shadow:none}
.pick input:checked+.pc .mark::after{content:"";width:12px;height:12px;background:var(--gold-grad);-webkit-mask:var(--check) center/contain no-repeat;mask:var(--check) center/contain no-repeat}
.pick input:focus-visible+.pc{box-shadow:inset 0 0 0 1.5px var(--gold),0 0 0 4px rgba(184,148,90,.2)}

/* prompt detail */
.detail-head{position:relative;margin-bottom:16px}
.ghost-no{position:absolute;right:-4px;top:-26px;font-family:var(--f-display);font-weight:600;font-size:128px;line-height:1;color:var(--gold);opacity:.14;pointer-events:none}
.meta-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.meta-chips span{font-size:11.5px;color:var(--ink-3);background:rgba(255,255,255,.8);box-shadow:inset 0 0 0 1px var(--line);border-radius:999px;padding:3px 12px;line-height:1.6}
.card.doc{background:linear-gradient(180deg,#FFFFFF,#FFFDF8)}
.card.doc::before{content:"";position:absolute;top:0;left:22px;right:22px;height:2px;border-radius:0 0 2px 2px;background:var(--gold-grad)}
.ribbon{position:absolute;top:18px;right:18px;font-family:var(--f-display);font-style:italic;font-weight:600;font-size:14px;letter-spacing:.1em;color:var(--bronze)}
.pb-out{font-size:14px;min-height:240px;background:#FFFDF8;line-height:1.9}
.miss{font-size:12px;font-weight:700;color:var(--yellow);margin-top:9px}
.miss.ok{color:var(--green)}
.sticky-actions{position:sticky;bottom:calc(94px + var(--safe-b));z-index:5;margin-top:16px;padding:10px;border-radius:22px;
  background:rgba(255,255,255,.84);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
  box-shadow:inset 0 0 0 1px var(--line-2),0 18px 40px -20px rgba(14,26,34,.45)}
body.no-nav .sticky-actions{bottom:calc(14px + var(--safe-b))}
.compose-grid{display:grid;gap:12px}
.compose-grid .part label{font-size:11.5px;font-weight:700;color:var(--muted);display:block;margin-bottom:6px;letter-spacing:.06em}
@media (min-width:560px){.compose-grid{grid-template-columns:1fr 1fr}}

/* account / product */
.kv{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:13.5px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;font-weight:600;word-break:break-all}
.lux .kv dt{color:rgba(243,238,228,.62)}
.lux .kv dd{color:#fff}
.acct{padding:24px 20px 20px}
.avatar-lg{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin-bottom:16px;font-family:var(--f-display);font-weight:600;font-size:30px;color:var(--ink);
  background:var(--gold-grad);box-shadow:0 0 0 4px rgba(217,191,140,.2),0 14px 30px -14px rgba(0,0,0,.8)}
.pw-wrap{display:flex;gap:8px}
.pw-wrap input{flex:1}
.pay-block{border-top:1px solid var(--line-2);padding-top:18px;margin-top:8px;margin-bottom:6px}
.pay-block-title{display:flex;align-items:center;gap:10px;font-family:var(--f-serif);font-weight:700;font-size:14.5px;color:var(--ink);margin-bottom:14px;letter-spacing:.08em}
.pay-block-title::before{content:"";width:18px;height:1px;background:var(--gold)}
.yen-wrap{display:flex;align-items:center;gap:10px}
.yen-wrap input{max-width:210px;font-family:var(--f-display);font-size:22px;font-weight:600;letter-spacing:.04em}
.yen-wrap span{font-weight:700;color:var(--ink-2)}
.letter{position:relative;margin-top:12px;padding:24px 18px 18px;border-radius:16px;background:#FFFDF8;box-shadow:inset 0 0 0 1px rgba(184,148,90,.38)}
.letter::before{content:"";position:absolute;top:0;left:18px;right:18px;height:2px;background:var(--gold-grad)}
pre.template{white-space:pre-wrap;word-break:break-all;font:inherit;font-size:13.5px;line-height:1.95;color:var(--ink-2);margin:0}

/* landing */
.landing-hero{margin:-22px -18px 8px;padding:40px 24px 36px;border-radius:0 0 34px 34px}
.landing-hero::after{border-radius:0 0 28px 28px}
.landing-hero .crest{display:block;margin-bottom:22px}
.landing-hero h1{font-size:31px;line-height:1.6;letter-spacing:.1em;color:#fff;margin:12px 0 14px}
.landing-hero h1 em{font-style:normal;background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.landing-hero p{color:rgba(243,238,228,.82);font-size:14px;line-height:1.95;margin:0}
.feat-list{list-style:none;margin:0;padding:0}
.feat-list li{display:flex;gap:16px;padding:16px 2px;border-top:1px solid var(--line-2)}
.feat-list li:first-child{border-top:0;padding-top:4px}
.feat-list li:last-child{padding-bottom:2px}
.feat-list .fn{font-family:var(--f-display);font-weight:600;font-size:30px;line-height:1;color:var(--gold);min-width:42px}
.feat-list b{display:block;font-family:var(--f-serif);font-size:15.5px;letter-spacing:.06em;margin-bottom:4px;line-height:1.55}
.feat-list p{margin:0;font-size:13px;color:var(--muted);line-height:1.8}
.journey{list-style:none;margin:0;padding:0}
.journey li{position:relative;display:flex;gap:16px;padding:0 0 18px}
.journey li:last-child{padding-bottom:0}
.journey li::before{content:"";position:absolute;left:21px;top:46px;bottom:4px;width:1px;background:linear-gradient(var(--gold),rgba(184,148,90,.15))}
.journey li:last-child::before{display:none}
.journey .rn{width:44px;height:44px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-family:var(--f-display);font-weight:600;font-size:18px;color:var(--gold-2);
  background:var(--ink);box-shadow:0 0 0 4px rgba(217,191,140,.18)}
.journey b{display:block;font-family:var(--f-serif);font-size:15.5px;letter-spacing:.08em;margin-top:3px}
.journey small{font-size:12px;color:var(--muted)}
.cta-card{margin-top:30px;padding:30px 22px 22px;text-align:center}
.cta-card h3{font-size:20px;color:#fff;margin:12px 0 20px;line-height:1.75}
.foot{margin:34px 0 4px;text-align:center;color:var(--muted);font-size:11.5px}
.foot .crest{display:block;margin:0 auto 8px}
.foot .fname{font-family:var(--f-serif);font-weight:700;color:var(--ink);letter-spacing:.12em;font-size:13px}
.foot .ftag{font-family:var(--f-display);font-style:italic;letter-spacing:.12em;font-size:13px}

/* auth */
.auth{max-width:440px;margin:4px auto 0}
.auth-head{text-align:center;margin-bottom:18px}
.auth-head .crest{display:block;margin:6px auto 16px}

/* toast */
.toast{position:fixed;left:50%;top:calc(70px + var(--safe-t));z-index:60;transform:translate(-50%,-14px);opacity:0;pointer-events:none;max-width:calc(100% - 40px);
  display:flex;gap:10px;align-items:center;padding:12px 18px 12px 16px;border-radius:14px;background:rgba(14,26,34,.97);color:#F6EFE0;font-size:13px;font-weight:600;letter-spacing:.04em;line-height:1.6;
  box-shadow:inset 0 0 0 1px rgba(217,191,140,.38),0 20px 44px -16px rgba(0,0,0,.65);transition:opacity .25s,transform .35s cubic-bezier(.2,.8,.2,1)}
.toast::before{content:"";width:16px;height:16px;flex-shrink:0;background:var(--gold-grad);-webkit-mask:var(--check) center/contain no-repeat;mask:var(--check) center/contain no-repeat}
.toast.show{opacity:1;transform:translate(-50%,0)}

/* motion */
@media (prefers-reduced-motion:no-preference){
  main>*{animation:rise .75s cubic-bezier(.2,.7,.2,1) both}
  main>*:nth-child(2){animation-delay:.06s}main>*:nth-child(3){animation-delay:.12s}main>*:nth-child(4){animation-delay:.18s}
  main>*:nth-child(5){animation-delay:.24s}main>*:nth-child(6){animation-delay:.3s}main>*:nth-child(n+7){animation-delay:.36s}
}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.btn-gold::after{display:none}.node.current .dot::after{animation:none}.ring .prog{animation:none}}
@media (hover:hover){
  .btn-primary:hover{filter:brightness(1.08)}
  .btn-gold:hover{filter:brightness(1.04)}
  .btn-ghost:hover{box-shadow:inset 0 0 0 1px var(--gold),0 1px 2px rgba(14,26,34,.04)}
  .steps a:hover,.row-link:hover{background:#FFFDF8}
  .seg button:not(.on):hover{color:var(--ink)}
  .chip span:hover{box-shadow:inset 0 0 0 1px var(--gold)}
}
.hide{display:none!important}
@media (min-width:600px){main{padding:30px 22px 40px}h1{font-size:27px}.landing-hero{margin:-30px -22px 8px}}
`;

function layout(title, bodyHtml, { user, active, noNav } = {}) {
  const showNav = user && !noNav;
  const tab = (href, key, ic, label) => `<a href="${href}" class="${active === key ? 'active' : ''}">${icon(ic, 22)}<span>${label}</span></a>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)}｜AI商品化実践システム</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon-192.png"><link rel="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#0E1A22">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="AI商品化">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_CSS}">
<style>${CSS}</style>
<script>
window.toast = function (msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
};
</script>
</head><body class="${showNav ? '' : 'no-nav'}">
<header class="topbar"><a class="brand" href="${user ? '/dashboard' : '/'}">${crest(34)}<span class="brand-name">AI商品化実践システム<small>The 90-Day Program</small></span></a>
${user ? `<a class="avatar" href="/account" aria-label="アカウント">${escapeHtml(initial(user.email))}</a>` : ''}</header>
<main>${bodyHtml}</main>
${showNav ? `<nav class="tabbar">
  ${tab('/dashboard', 'home', 'home', 'ホーム')}
  ${tab('/prompts', 'prompts', 'prompt', 'プロンプト')}
  ${tab('/product', 'product', 'box', 'マイ商品')}
  ${tab('/account', 'account', 'user', 'アカウント')}
</nav>` : ''}
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
</script>
</body></html>`;
}

module.exports = { escapeHtml, jsonForScript, icon, layout, crest, guilloche, roman, pad2, initial };
