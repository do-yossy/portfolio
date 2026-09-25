'use strict';
// プロンプト本文の【プレースホルダ】を、選択式中心の入力フォームに変換する。
// サーバー側でフォームを描画し、ブラウザ側のスクリプトが入力値を本文に差し込む。
const { escapeHtml: esc } = require('./ui');

const CHIP_MAX = 7; // 選択肢がこれ以下ならタップで選べるチップ、多ければプルダウン

// 本文の出現順に「どのフィールドで置き換えるか」を決める。skip は置換しない（null）。
function planFields(body, spec) {
  const occ = [];
  const fields = [];
  const seen = new Map();
  const counts = {};
  for (const m of body.matchAll(/【([^】]+)】/g)) {
    const name = m[1];
    counts[name] = (counts[name] ?? -1) + 1;
    const raw = spec[name];
    const def = (Array.isArray(raw) ? raw[counts[name]] : raw) || { kind: 'text', label: name };
    if (def.kind === 'skip') { occ.push(null); continue; }
    const key = Array.isArray(raw) ? `${name}#${counts[name]}` : name;
    if (!seen.has(key)) {
      const fid = `f${fields.length}`;
      seen.set(key, fid);
      fields.push({ fid, def });
    }
    occ.push(seen.get(key));
  }
  return { occ, fields };
}

function choiceHtml(name, options, selected, other, multi) {
  const type = multi ? 'checkbox' : 'radio';
  const role = multi ? 'check' : 'radio';
  const sel = new Set(multi ? String(selected || '').split('、') : [selected]);
  const opts = options.map((o) => `<label class="chip"><input type="${type}" name="${name}" value="${esc(o)}" data-role="${role}" ${sel.has(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`);
  if (other) opts.push(`<label class="chip"><input type="${type}" name="${name}" value="__other" data-role="${role}"><span>その他</span></label>`);
  return `<div class="chips">${opts.join('')}</div>${other ? `<input type="text" class="other-input hide" data-role="other" placeholder="自由に入力">` : ''}`;
}

function selectHtml(id, options, selected, other) {
  const hasSel = options.includes(selected);
  return `<select id="${id}" data-role="val">
    <option value="" ${hasSel ? '' : 'selected'}>選択してください</option>
    ${options.map((o) => `<option value="${esc(o)}" ${o === selected ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    ${other ? '<option value="__other">その他（自由入力）</option>' : ''}
  </select>${other ? `<input type="text" class="other-input hide" data-role="other" placeholder="自由に入力">` : ''}`;
}

function singleControl(id, def, value) {
  switch (def.kind) {
    case 'select':
      return def.options.length <= CHIP_MAX
        ? choiceHtml(id, def.options, value, def.other, false)
        : selectHtml(id, def.options, value, def.other);
    case 'number':
      return `<input id="${id}" type="number" inputmode="numeric" min="0" data-role="val" value="${esc(value)}" placeholder="${esc(def.placeholder || '数字')}">`;
    case 'textarea':
      return `<textarea id="${id}" rows="5" data-role="val" placeholder="${esc(def.placeholder || '')}">${esc(value)}</textarea>`;
    default:
      return `<input id="${id}" type="text" data-role="val" value="${esc(value)}" placeholder="${esc(def.placeholder || '')}">`;
  }
}

function fieldHtml({ fid, def }, ctx) {
  const kind = def.kind;
  let value = '';
  let badge = '';
  let hint = '';
  if (kind === 'profile') {
    value = ctx.profile[def.key] || '';
    if (value) badge = '<span class="auto-badge">マイ商品から自動入力</span>';
    else hint = `<div class="hint">${def.fallback ? `空欄のままなら「${esc(def.fallback)}」として送ります。` : ''}<a href="/product">マイ商品</a>に登録すると次回から自動で入ります。</div>`;
  } else if (def.auto) {
    value = ctx.auto[def.auto] == null ? '' : String(ctx.auto[def.auto]);
    if (value) badge = '<span class="auto-badge">進捗から自動入力</span>';
  }
  const attrs = `data-fid="${fid}" data-kind="${kind}" data-fallback="${esc(def.fallback || '')}" data-suffix="${esc(def.suffix || '')}"`;

  if (kind === 'compose') {
    const parts = def.parts.map((pt, i) => {
      const pid = `${fid}p${i}`;
      return `<div class="part" data-part data-label="${esc(pt.label)}" data-suffix="${esc(pt.suffix || '')}">
        <label for="${pid}">${esc(pt.label)}${pt.suffix ? `（${esc(pt.suffix)}）` : ''}</label>${singleControl(pid, pt, '')}</div>`;
    }).join('');
    return `<div class="field" ${attrs}><label class="lbl">${esc(def.label)}</label><div class="compose-grid">${parts}</div></div>`;
  }
  if (kind === 'multi') {
    return `<div class="field" ${attrs}><label class="lbl">${esc(def.label)}<span class="req-badge">複数選択可</span></label>${choiceHtml(fid, def.options, value, def.other, true)}</div>`;
  }
  return `<div class="field" ${attrs}><label class="lbl" for="${fid}">${esc(def.label)}${badge}</label>${singleControl(fid, def, value)}${hint}</div>`;
}

// ブラウザ側：入力値を読み取り、本文へ差し込む
const CLIENT_JS = `
(function(){
  const D = JSON.parse(document.getElementById('pb-data').textContent);
  const out = document.getElementById('promptBody');
  const missEl = document.getElementById('missMsg');
  const pre = document.getElementById('usePreamble');
  function readSingle(root){
    let v = '';
    const val = root.querySelector('[data-role=val]');
    if (val) v = val.value.trim();
    const r = root.querySelector('[data-role=radio]:checked');
    if (r) v = r.value;
    if (v === '__other') { const o = root.querySelector('[data-role=other]'); v = o ? o.value.trim() : ''; }
    return v;
  }
  function readField(root){
    const k = root.dataset.kind; let v = '';
    if (k === 'compose') {
      v = Array.from(root.querySelectorAll('[data-part]')).map(function(p){
        const x = readSingle(p); return x ? p.dataset.label + '：' + x + (p.dataset.suffix || '') : '';
      }).filter(Boolean).join('／');
    } else if (k === 'multi') {
      const arr = Array.from(root.querySelectorAll('[data-role=check]:checked')).map(function(c){ return c.value; }).filter(function(x){ return x !== '__other'; });
      const oc = root.querySelector('[data-role=check][value=__other]');
      const o = root.querySelector('[data-role=other]');
      if (oc && oc.checked && o && o.value.trim()) arr.push(o.value.trim());
      v = arr.join('、');
    } else {
      v = readSingle(root);
      if (v && root.dataset.suffix) v += root.dataset.suffix;
    }
    return v || root.dataset.fallback || '';
  }
  function syncOther(){
    document.querySelectorAll('.other-input').forEach(function(o){
      const box = o.parentElement;
      const sel = box.querySelector('select[data-role=val]');
      const on = (sel && sel.value === '__other') || !!box.querySelector('[data-role=radio][value=__other]:checked') || !!box.querySelector('[data-role=check][value=__other]:checked');
      o.classList.toggle('hide', !on);
    });
  }
  function build(){
    syncOther();
    const vals = {};
    document.querySelectorAll('[data-fid]').forEach(function(r){ vals[r.dataset.fid] = readField(r); });
    let i = 0, miss = 0;
    let text = D.body.replace(/【([^】]+)】/g, function(m){
      const fid = D.occ[i++];
      if (!fid) return m;
      const v = vals[fid];
      if (!v) { miss++; return m; }
      return v;
    });
    if (D.preamble && pre && pre.checked) text = D.preamble + '\\n\\n' + text;
    out.value = text;
    if (missEl) {
      missEl.textContent = miss ? '未入力の項目があります（【 】の部分）。空欄のままでも送れますが、埋めると回答の質が上がります。' : 'すべての項目が入力されました。';
      missEl.classList.toggle('ok', !miss);
    }
  }
  document.getElementById('pbForm').addEventListener('input', build);
  document.getElementById('pbForm').addEventListener('change', build);
  if (pre) pre.addEventListener('change', build);
  build();
})();
`;

module.exports = { planFields, fieldHtml, CLIENT_JS };
