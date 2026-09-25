'use strict';
// 共通レイアウト・デザインシステム・アイコン（外部依存なし。CSS/SVGはすべてインライン）

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
};

function icon(name, size = 20, extraClass = '') {
  return `<svg class="ico ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

const CSS = `
:root{
  --ink:#13212B;--ink-2:#34444F;--muted:#6B7882;--line:#E5E3DD;--line-2:#EFEDE8;
  --bg:#F6F4EF;--surface:#FFFFFF;--surface-2:#FBFAF7;
  --primary:#0E5A55;--primary-2:#157A71;--primary-soft:#E4F1EE;--primary-ink:#08403C;
  --gold:#B08A4F;--gold-2:#CFAE74;--gold-soft:#F5EEE2;
  --green:#1E8A5A;--green-soft:#E2F3EA;--yellow:#AD7414;--yellow-soft:#FCF1DC;
  --red:#BF3B2F;--red-soft:#FBE8E5;--pending:#8793A0;--pending-soft:#EEF1F3;
  --shadow-sm:0 1px 2px rgba(19,33,43,.06);
  --shadow:0 1px 2px rgba(19,33,43,.05),0 6px 20px rgba(19,33,43,.06);
  --shadow-lg:0 12px 36px rgba(8,64,60,.22);
  --r:16px;--r-sm:11px;
  --safe-b:env(safe-area-inset-bottom,0px);--safe-t:env(safe-area-inset-top,0px);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI",YuGothic,Meiryo,system-ui,sans-serif;
  font-feature-settings:"palt";letter-spacing:.02em;line-height:1.7;font-size:15px;
  padding-top:calc(58px + var(--safe-t));padding-bottom:calc(76px + var(--safe-b))}
body.no-nav{padding-bottom:calc(24px + var(--safe-b))}
a{color:var(--primary)}
.ico{flex-shrink:0;vertical-align:middle}

/* header */
.topbar{position:fixed;top:0;left:0;right:0;z-index:20;height:calc(58px + var(--safe-t));
  padding:var(--safe-t) 16px 0;display:flex;align-items:center;justify-content:space-between;
  background:rgba(19,33,43,.96);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);
  border-bottom:1px solid rgba(207,174,116,.25)}
.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;min-width:0}
.brand-mark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--gold-2),var(--gold));color:var(--ink);font-weight:800;font-size:12px;letter-spacing:0}
.brand-name{font-weight:700;font-size:14.5px;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand-name small{display:block;font-size:9.5px;font-weight:500;color:var(--gold-2);letter-spacing:.18em;margin-top:-3px}
.topbar .who{color:#C9D3D8;font-size:11px;max-width:38vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

main{max-width:760px;margin:0 auto;padding:20px 16px 28px}
h1{font-size:22px;line-height:1.45;margin:4px 0 6px;letter-spacing:.04em}
h2{font-size:16px;margin:30px 0 12px;letter-spacing:.05em;display:flex;align-items:center;gap:8px}
h2 .ico{color:var(--gold)}
h3{font-size:15px;margin:0 0 8px}
p{margin:0 0 10px}
.lead{color:var(--ink-2);font-size:14px}
.muted{color:var(--muted);font-size:12.5px}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;color:var(--gold);text-transform:uppercase}

/* surfaces */
.card{background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:18px;margin-bottom:14px;box-shadow:var(--shadow)}
.card.flat{box-shadow:none}
.card-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;margin-bottom:10px}
.card-title .ico{color:var(--primary)}
.stack>*+*{margin-top:12px}

/* buttons */
.btn{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  min-height:48px;padding:12px 20px;border-radius:12px;font:inherit;font-weight:700;font-size:15px;letter-spacing:.04em;
  text-decoration:none;white-space:nowrap;transition:transform .12s ease,box-shadow .2s ease,background .2s ease}
.btn:active{transform:scale(.98)}
.btn-primary{background:linear-gradient(180deg,var(--primary-2),var(--primary));color:#fff;box-shadow:0 4px 14px rgba(14,90,85,.28)}
.btn-gold{background:linear-gradient(180deg,var(--gold-2),var(--gold));color:var(--ink);box-shadow:0 4px 14px rgba(176,138,79,.3)}
.btn-ghost{background:var(--surface);color:var(--primary);border:1.5px solid var(--primary-soft)}
.btn-quiet{background:transparent;color:var(--muted);min-height:40px;padding:8px 12px;font-weight:600}
.btn-block{width:100%}
.btn-sm{min-height:38px;padding:8px 14px;font-size:13px;border-radius:10px}
.btn-row{display:flex;gap:10px;flex-wrap:wrap}
.btn-row>.btn{flex:1;min-width:0;padding-left:12px;padding-right:12px;letter-spacing:.02em}

/* forms */
label.lbl{display:block;font-size:12.5px;font-weight:700;color:var(--ink-2);margin:0 0 6px;letter-spacing:.04em}
.input,input[type=text],input[type=email],input[type=password],input[type=number],textarea,select{
  width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:var(--r-sm);font:inherit;font-size:16px;
  background:var(--surface-2);color:var(--ink);transition:border-color .15s,box-shadow .15s,background .15s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--primary-2);background:#fff;box-shadow:0 0 0 4px rgba(21,122,113,.12)}
textarea{line-height:1.65;resize:vertical}
select{appearance:none;-webkit-appearance:none;padding-right:40px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236B7882' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 12px center}
.field{margin-bottom:16px}
.field:last-child{margin-bottom:0}
.hint{font-size:12px;color:var(--muted);margin-top:6px}
.auto-badge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--primary);
  background:var(--primary-soft);border-radius:999px;padding:2px 8px;margin-left:6px;letter-spacing:.04em;vertical-align:1px}
.req-badge{font-size:10.5px;font-weight:700;color:var(--gold);margin-left:6px}

/* chips (radio / checkbox) */
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{position:relative;display:inline-flex}
.chip input{position:absolute;opacity:0;pointer-events:none}
.chip span{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:8px 14px;border-radius:999px;
  border:1.5px solid var(--line);background:var(--surface);font-size:13.5px;font-weight:600;color:var(--ink-2);cursor:pointer;
  transition:all .15s ease;line-height:1.35}
.chip input:checked+span{border-color:var(--primary);background:var(--primary);color:#fff;box-shadow:0 3px 10px rgba(14,90,85,.22)}
.chip input:focus-visible+span{box-shadow:0 0 0 4px rgba(21,122,113,.2)}
.other-input{margin-top:8px}

/* notices */
.notice{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:var(--r-sm);font-size:13px;line-height:1.65}
.notice .ico{margin-top:2px}
.notice.warn{background:var(--yellow-soft);color:#7A5210}
.notice.info{background:var(--primary-soft);color:var(--primary-ink)}
.notice.gold{background:var(--gold-soft);color:#6E5328}
.notice.error{background:var(--red-soft);color:#8A2A21}

/* status */
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em}
.badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.st-GREEN{background:var(--green-soft);color:var(--green)}
.st-YELLOW{background:var(--yellow-soft);color:var(--yellow)}
.st-RED{background:var(--red-soft);color:var(--red)}
.st-PENDING{background:var(--pending-soft);color:var(--pending)}

/* bottom nav */
.tabbar{position:fixed;bottom:0;left:0;right:0;z-index:20;background:rgba(255,255,255,.96);
  backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);
  border-top:1px solid var(--line);display:flex;padding-bottom:var(--safe-b)}
.tabbar a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px 8px;
  color:var(--muted);text-decoration:none;font-size:10.5px;font-weight:600;letter-spacing:.04em;position:relative}
.tabbar a.active{color:var(--primary)}
.tabbar a.active::before{content:"";position:absolute;top:0;left:30%;right:30%;height:2.5px;border-radius:0 0 3px 3px;background:var(--gold)}

/* hero */
.hero{position:relative;overflow:hidden;border-radius:22px;padding:22px 20px;color:#fff;margin-bottom:16px;box-shadow:var(--shadow-lg);
  background:radial-gradient(120% 120% at 100% 0%,rgba(207,174,116,.35) 0%,rgba(207,174,116,0) 45%),linear-gradient(145deg,#157A71 0%,#0E5A55 45%,#13212B 100%)}
.hero::after{content:"";position:absolute;right:-60px;bottom:-60px;width:200px;height:200px;border-radius:50%;border:1px solid rgba(255,255,255,.08)}
.hero .eyebrow{color:var(--gold-2)}
.hero-top{display:flex;gap:18px;align-items:center}
.ring{position:relative;width:92px;height:92px;flex-shrink:0}
.ring svg{transform:rotate(-90deg)}
.ring .num{position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1.1}
.ring .num b{font-size:24px;font-weight:800;letter-spacing:0}
.ring .num span{display:block;font-size:10px;opacity:.8;letter-spacing:.08em}
.hero-next{min-width:0}
.hero-next .gate{font-size:19px;font-weight:800;letter-spacing:.04em;margin:2px 0 4px}
.hero-next .why{font-size:12.5px;opacity:.85;margin:0}
.hero-steps{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 14px}
.hero-steps a{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;font-size:12.5px;font-weight:700;
  color:#fff;text-decoration:none;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)}
.hero-steps a.first{background:#fff;color:var(--primary-ink);border-color:#fff}
.hero-steps .n{font-size:10px;opacity:.7}
.daybar{margin-top:4px}
.daybar .track{height:6px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden}
.daybar .fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold-2),#fff)}
.daybar .meta{display:flex;justify-content:space-between;font-size:11px;opacity:.85;margin-top:6px}

/* roadmap */
.roadmap{list-style:none;margin:0;padding:0;position:relative}
.stage{margin-bottom:6px}
.stage-head{display:flex;align-items:baseline;gap:8px;margin:18px 0 10px 50px}
.stage-head b{font-size:14px;letter-spacing:.06em}
.stage-head span{font-size:11px;color:var(--gold);font-weight:700;letter-spacing:.12em}
.node{position:relative;padding-left:50px;padding-bottom:12px}
.node::before{content:"";position:absolute;left:17px;top:36px;bottom:-4px;width:2px;background:var(--line)}
.node.done::before{background:linear-gradient(var(--primary-2),var(--primary-2))}
.node.last::before{display:none}
.dot{position:absolute;left:0;top:2px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;
  font-weight:800;font-size:13px;background:var(--surface);border:2px solid var(--line);color:var(--muted);z-index:1}
.node.done .dot{background:var(--primary);border-color:var(--primary);color:#fff}
.node.st-y .dot{border-color:var(--yellow);color:var(--yellow);background:var(--yellow-soft)}
.node.st-r .dot{border-color:var(--red);color:var(--red);background:var(--red-soft)}
.node.current .dot{border-color:var(--gold);color:var(--ink);background:var(--gold-soft);box-shadow:0 0 0 6px rgba(207,174,116,.22)}
.node.current .dot::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(207,174,116,.5);animation:pulse 2.2s ease-out infinite}
@keyframes pulse{0%{transform:scale(.85);opacity:1}100%{transform:scale(1.35);opacity:0}}
@media (prefers-reduced-motion:reduce){.node.current .dot::after{animation:none}}
.node-card{background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:var(--shadow-sm)}
.node.current .node-card{border-color:rgba(176,138,79,.45);box-shadow:0 6px 22px rgba(176,138,79,.16)}
.node-card summary{list-style:none;display:flex;align-items:center;gap:10px;padding:13px 14px;cursor:pointer}
.node-card summary::-webkit-details-marker{display:none}
.node-card summary .t{flex:1;min-width:0}
.node-card summary .t b{display:block;font-size:14.5px;letter-spacing:.04em}
.node-card summary .t small{font-size:11px;color:var(--muted)}
.node-card summary .chev{color:var(--muted);transition:transform .2s}
.node-card[open] summary .chev{transform:rotate(90deg)}
.node-body{padding:0 14px 14px;border-top:1px solid var(--line-2)}
.now-tag{font-size:10px;font-weight:800;color:var(--gold);letter-spacing:.14em;margin-left:6px}
.steps{list-style:none;margin:12px 0 0;padding:0}
.steps li{margin-bottom:6px}
.steps a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--surface-2);
  border:1px solid var(--line-2);text-decoration:none;color:var(--ink)}
.steps .no{flex-shrink:0;font-size:11px;font-weight:800;color:var(--primary);background:var(--primary-soft);border-radius:8px;padding:3px 7px;letter-spacing:.02em}
.steps .nm{flex:1;font-size:13.5px;font-weight:600}
.steps .tag{font-size:10px;font-weight:700;color:var(--gold);border:1px solid var(--gold-2);border-radius:6px;padding:1px 6px}
.steps .ext{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1px dashed var(--line);font-size:12.5px;color:var(--muted)}
.tip{display:flex;gap:10px;margin-top:12px;padding:12px;border-radius:12px;background:var(--gold-soft);font-size:12.5px;line-height:1.7;color:#5C4722}
.tip .ico{color:var(--gold);margin-top:2px}
.tip b{display:block;font-size:11px;letter-spacing:.1em;color:var(--gold);margin-bottom:2px}
.status-form{margin-top:14px}
.status-form .lbl{margin-bottom:8px}
.seg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.seg button{appearance:none;font:inherit;font-size:11.5px;font-weight:800;letter-spacing:.06em;min-height:42px;border-radius:10px;cursor:pointer;
  border:1.5px solid var(--line);background:var(--surface);color:var(--muted)}
.seg button.on.s-GREEN{background:var(--green-soft);border-color:var(--green);color:var(--green)}
.seg button.on.s-YELLOW{background:var(--yellow-soft);border-color:var(--yellow);color:var(--yellow)}
.seg button.on.s-RED{background:var(--red-soft);border-color:var(--red);color:var(--red)}
.seg button.on.s-PENDING{background:var(--pending-soft);border-color:var(--pending);color:var(--ink-2)}
.seg-help{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.6}

/* lineup */
.lineup{display:grid;grid-template-columns:1fr;gap:0}
.lu-card{position:relative;background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);padding:16px;box-shadow:var(--shadow-sm)}
.lu-card.active{border-color:rgba(14,90,85,.35);box-shadow:0 6px 20px rgba(14,90,85,.12)}
.lu-card.locked{background:var(--surface-2);box-shadow:none}
.lu-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.lu-no{font-size:11px;font-weight:800;letter-spacing:.16em;color:var(--gold)}
.lu-state{font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--pending-soft);color:var(--muted)}
.lu-card.active .lu-state{background:var(--primary-soft);color:var(--primary)}
.lu-name{font-weight:700;font-size:15px;line-height:1.5;word-break:break-all}
.lu-meta{font-size:11.5px;color:var(--muted);margin-top:4px}
.lu-arrow{display:grid;place-items:center;height:26px;color:var(--gold-2)}
.lu-arrow .ico{transform:rotate(90deg)}
@media (min-width:560px){
  .lineup{grid-template-columns:1fr 28px 1fr 28px 1fr;align-items:stretch}
  .lu-arrow{height:auto}
  .lu-arrow .ico{transform:none}
}

/* prep */
.prep li{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line-2);font-size:13.5px}
.prep li:first-child{border-top:0}
.prep input{width:20px;height:20px;margin:2px 0 0;accent-color:var(--primary);flex-shrink:0}
.prep ul{list-style:none;margin:0;padding:0}

/* day grid */
details.fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:700}
details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary .chev{color:var(--muted);transition:transform .2s}
details.fold[open]>summary .chev{transform:rotate(90deg)}
.day-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(50px,1fr));gap:6px;margin-top:14px}
.daycell{display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10.5px;font-weight:600;color:var(--muted);
  padding:7px 2px;border:1.5px solid var(--line-2);border-radius:10px;background:var(--surface-2);min-height:46px;cursor:pointer}
.daycell.done{background:var(--primary-soft);border-color:rgba(21,122,113,.35);color:var(--primary)}
.daycell input{width:18px;height:18px;margin:0 0 3px;accent-color:var(--primary)}

/* list rows */
.rows{background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r);box-shadow:var(--shadow-sm);overflow:hidden}
.row-link{display:flex;align-items:center;gap:12px;padding:14px 16px;text-decoration:none;color:var(--ink);border-top:1px solid var(--line-2)}
.row-link:first-child{border-top:0}
.row-link .no{flex-shrink:0;width:44px;text-align:center;font-size:11px;font-weight:800;color:var(--primary);background:var(--primary-soft);border-radius:9px;padding:5px 0}
.row-link .t{flex:1;min-width:0}
.row-link .t b{display:block;font-size:14px;font-weight:700}
.row-link .t small{display:block;font-size:11.5px;color:var(--muted);line-height:1.5;margin-top:2px}
.row-link .chev{color:var(--line)}
.rec{display:inline-block;font-size:10px;font-weight:800;color:var(--ink);background:var(--gold-2);border-radius:6px;padding:1px 7px;margin-left:6px;letter-spacing:.06em;vertical-align:1px}

/* persona cards */
.pick{display:grid;gap:10px}
.pick label{position:relative;display:block;cursor:pointer}
.pick input{position:absolute;opacity:0}
.pick .pc{display:flex;gap:14px;align-items:flex-start;padding:16px;border-radius:var(--r);border:1.5px solid var(--line);background:var(--surface);transition:all .15s}
.pick .pc .mark{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);flex-shrink:0;margin-top:2px;display:grid;place-items:center}
.pick input:checked+.pc{border-color:var(--primary);box-shadow:0 0 0 4px rgba(21,122,113,.12);background:#FCFEFD}
.pick input:checked+.pc .mark{border-color:var(--primary);background:var(--primary)}
.pick input:checked+.pc .mark::after{content:"";width:8px;height:8px;border-radius:50%;background:#fff}
.pick .pc b{display:block;font-size:15px;margin-bottom:2px}
.pick .pc small{font-size:12.5px;color:var(--muted);line-height:1.6}
.stepper{display:flex;gap:6px;margin-bottom:14px}
.stepper i{flex:1;height:4px;border-radius:99px;background:var(--line)}
.stepper i.on{background:var(--gold)}

/* prompt builder */
.pb-out{font-size:14px;min-height:220px;background:#fff}
.miss{font-size:12px;font-weight:700;color:var(--yellow);margin-top:8px}
.miss.ok{color:var(--green)}
.sticky-actions{position:sticky;bottom:calc(72px + var(--safe-b));z-index:5;margin-top:14px;padding:10px;border-radius:16px;
  background:rgba(255,255,255,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 8px 28px rgba(19,33,43,.14);border:1px solid var(--line-2)}
.compose-grid{display:grid;gap:10px}
.compose-grid .part label{font-size:11.5px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px}
@media (min-width:560px){.compose-grid{grid-template-columns:1fr 1fr}}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13.5px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;font-weight:600;word-break:break-all}
.pw-wrap{display:flex;gap:8px}
.pw-wrap input{flex:1}
pre.template{white-space:pre-wrap;font:inherit;font-size:13px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:12px;padding:14px;margin:10px 0 0}

/* landing */
.landing-hero{padding:28px 22px 26px;border-radius:24px;color:#fff;margin:4px 0 18px;box-shadow:var(--shadow-lg);
  background:radial-gradient(90% 90% at 100% 0%,rgba(207,174,116,.4) 0%,rgba(207,174,116,0) 50%),linear-gradient(150deg,#157A71 0%,#0E5A55 40%,#13212B 100%)}
.landing-hero h1{font-size:26px;line-height:1.5;margin:8px 0 10px}
.landing-hero p{opacity:.88;font-size:14px}
.features{display:grid;gap:10px}
.feature{display:flex;gap:14px;padding:16px;border-radius:var(--r);background:var(--surface);border:1px solid var(--line-2);box-shadow:var(--shadow-sm)}
.feature .fi{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);flex-shrink:0}
.feature b{display:block;font-size:14.5px;margin-bottom:2px}
.feature small{font-size:12.5px;color:var(--muted);line-height:1.6}
.back .ico{transform:rotate(180deg)}
@media (hover:hover){
  .btn-primary:hover{box-shadow:0 6px 18px rgba(14,90,85,.36)}
  .btn-ghost:hover{border-color:var(--primary-2)}
  .steps a:hover{border-color:var(--primary-soft)}
  .row-link:hover{background:var(--surface-2)}
  .seg button.s-GREEN:hover{border-color:var(--green);color:var(--green)}
  .seg button.s-YELLOW:hover{border-color:var(--yellow);color:var(--yellow)}
  .seg button.s-RED:hover{border-color:var(--red);color:var(--red)}
}
.hide{display:none!important}
@media (min-width:600px){main{padding:28px 20px 40px}h1{font-size:24px}}
`;

function layout(title, bodyHtml, { user, active, noNav } = {}) {
  const showNav = user && !noNav;
  const tab = (href, key, ic, label) => `<a href="${href}" class="${active === key ? 'active' : ''}">${icon(ic, 22)}${label}</a>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(title)}｜AI商品化実践システム</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon-192.png"><link rel="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#13212B">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="AI商品化">
<style>${CSS}</style></head><body class="${showNav ? '' : 'no-nav'}">
<header class="topbar"><a class="brand" href="${user ? '/dashboard' : '/'}"><span class="brand-mark">AI</span>
<span class="brand-name">AI商品化実践システム<small>90 DAYS PROGRAM</small></span></a>
${user ? `<span class="who">${escapeHtml(user.email)}</span>` : ''}</header>
<main>${bodyHtml}</main>
${showNav ? `<nav class="tabbar">
  ${tab('/dashboard', 'home', 'home', 'ホーム')}
  ${tab('/prompts', 'prompts', 'prompt', 'プロンプト')}
  ${tab('/product', 'product', 'box', 'マイ商品')}
  ${tab('/account', 'account', 'user', 'アカウント')}
</nav>` : ''}
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
</script>
</body></html>`;
}

module.exports = { escapeHtml, jsonForScript, icon, layout };
