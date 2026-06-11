'use strict';
/**
 * 営業バックエンド server（raw http・recruitment-platform 同方式）。
 * 管制塔(管理画面) + JSON API + LP問い合わせ受付(/api/contact, CORS)。
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const { Deals, Logs } = require('./db');
const L = require('./logic');
const claude = require('./lib/claude');
const mail = require('./lib/mail');

const PORT = process.env.PORT || 3100;
const GOAL = +process.env.SALES_GOAL || 1000000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const PUBLIC_DIR = path.join(__dirname, 'public');
if (ADMIN_PASSWORD === 'changeme') console.warn('[warn] ADMIN_PASSWORD 未設定。本番では必ず設定してください。');

// ── utils ──
const sessions = new Map();
const send = (res, status, body, ct = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'Content-Type': ct, ...extra }); res.end(body);
};
const json = (res, status, obj, extra = {}) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
const readBody = req => new Promise((resolve) => {
  const c = []; req.on('data', x => c.push(x)); req.on('end', () => resolve(Buffer.concat(c).toString())); req.on('error', () => resolve(''));
});
const parseJSON = async req => { try { return JSON.parse(await readBody(req)) || {}; } catch { return {}; } };
const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=').map(decodeURIComponent)).filter(p => p[0]));
const authed = req => { const sid = parseCookies(req).sid; return sid && sessions.has(sid); };

function notify(message, details = '') {
  Logs.create('notify', 'info', message, details);
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const data = JSON.stringify({ text: `🟦 ${message}\n${typeof details === 'string' ? details : JSON.stringify(details)}` });
    const u = new URL(url);
    const r = https.request({ method: 'POST', hostname: u.hostname, path: u.pathname + u.search, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } });
    r.on('error', () => {}); r.write(data); r.end();
  } catch { /* noop */ }
}

// 問い合わせ受付の自動処理（非同期・既存フローを壊さない）。
//  ① 顧客へ自動受付メール（Resend。未設定ならスキップ）
//  ② 担当者向けにAIが一次返信ドラフト＋概算を生成し、管制塔/Slackへ通知（担当が確認して送る）
async function autoReply(deal, b) {
  const customer = b.メール || b.email || '';
  let quote = null;
  try { quote = L.quote({ type: deal.type, rush: /即日|1週間/.test(b.納期 || '') }); } catch { /* noop */ }
  let mr = { skipped: true };
  try { mr = await mail.sendAck({ to: customer, inquiry: b }); } catch (e) { mr = { ok: false, error: e.message }; }
  let draft = '';
  try { draft = await claude.draftReply(b, quote); }
  catch (e) { draft = `（AIドラフト生成スキップ：${e.message}）`; }
  try { Deals.update(deal.id, { proposal: draft, amount: (quote && quote.total) || deal.amount || 0 }); } catch { /* noop */ }
  const qline = quote && quote.total ? `概算の目安：¥${quote.total.toLocaleString()}（税別）` : '概算：要ヒアリング';
  const ack = mr.skipped ? '受付メール：未設定(未送信)' : mr.ok ? '受付メール：送信済' : `受付メール：失敗(${mr.status || mr.error || ''})`;
  notify('LP問い合わせ＋AI返信ドラフト', `${deal.title}\n顧客：${customer}\n${ack}\n${qline}\n\n──── 返信ドラフト（確認のうえ送信）────\n${draft}`);
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

function metrics() {
  const deals = Deals.findAll();
  const month = new Date().toISOString().slice(0, 7);
  const active = deals.filter(d => !['won', 'lost'].includes(d.stage));
  const won = deals.filter(d => d.stage === 'won');
  const lost = deals.filter(d => d.stage === 'lost');
  const wonMonth = won.filter(d => (d.won_at || d.created_at || '').slice(0, 7) === month);
  const revMonth = wonMonth.reduce((s, d) => s + (d.amount || 0), 0);
  const forecast = active.reduce((s, d) => s + (d.amount || 0) * L.stageProb(d.stage), 0) + revMonth;
  const mrr = won.reduce((s, d) => s + (d.maintenance || 0), 0);
  const decided = won.length + lost.length;
  const wonAmt = won.reduce((s, d) => s + (d.amount || 0), 0);
  const profits = won.filter(d => d.profit_rate).map(d => d.profit_rate);
  const byStage = {}; for (const s of L.STAGE_KEYS) byStage[s] = deals.filter(d => d.stage === s).length;
  return {
    goal: GOAL, month, revenue_month: revMonth, goal_pct: Math.min(100, Math.round(revMonth / GOAL * 100)),
    forecast: Math.round(forecast), active: active.length, won: won.length, lost: lost.length,
    win_rate: decided ? Math.round(won.length / decided * 100) : 0,
    avg_price: won.length ? Math.round(wonAmt / won.length) : 0,
    avg_profit: profits.length ? Math.round(profits.reduce((a, b) => a + b, 0) / profits.length) : 0,
    mrr, inbound: active.filter(d => d.source === 'lp').length, outbound: active.filter(d => d.source !== 'lp').length,
    by_stage: byStage, stages: L.STAGES
  };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;
  const m = req.method;

  try {
    // ── public ──
    if (p === '/healthz') return json(res, 200, { ok: true });

    if (p === '/api/contact' && m === 'OPTIONS') return send(res, 204, '', 'text/plain', CORS);
    if (p === '/api/contact' && m === 'POST') {
      const b = await parseJSON(req);
      if (!b.メール && !b.email) return json(res, 400, { error: 'email required' }, CORS);
      const title = `【LP問い合わせ】${b.依頼内容 || b.type || ''} ${b.会社名 || b.お名前 || ''}`.trim();
      const deal = Deals.create({
        title: title || 'LP問い合わせ', client: b.会社名 || b.お名前 || '', industry: b.業種 || '',
        email: b.メール || b.email || '', source: 'lp', stage: 'meeting',
        type: mapType(b.依頼内容), amount: 0, priority: 'A', score: 60, pred_win_rate: 55,
        next_action: '要件確認→見積もり提示', raw: JSON.stringify(b), notes: b.ご相談内容 || b.message || ''
      });
      // フォームを待たせないよう即レスし、受付メール送信とAI返信ドラフト生成は非同期で行う。
      json(res, 200, { ok: true, id: deal.id }, CORS);
      autoReply(deal, b).catch(e => Logs.create('autoreply', 'error', (e && e.message) || String(e)));
      return;
    }

    if (p === '/login' && m === 'GET') return serveFile(res, 'login.html');
    if (p === '/login' && m === 'POST') {
      const b = await parseJSON(req);
      if (b.password === ADMIN_PASSWORD) {
        const sid = crypto.randomUUID(); sessions.set(sid, { t: Date.now() });
        return json(res, 200, { ok: true }, { 'Set-Cookie': `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400` });
      }
      return json(res, 401, { error: 'invalid password' });
    }
    if (p === '/logout') {
      const sid = parseCookies(req).sid; if (sid) sessions.delete(sid);
      return send(res, 302, '', 'text/html', { Location: '/login' });
    }

    // ── gate ──
    if (p === '/' ) return send(res, 302, '', 'text/html', { Location: authed(req) ? '/admin' : '/login' });
    if (p === '/admin') return authed(req) ? serveFile(res, 'admin.html') : send(res, 302, '', 'text/html', { Location: '/login' });

    // ── protected API ──
    if (p.startsWith('/api/')) {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });

      if (p === '/api/metrics' && m === 'GET') return json(res, 200, metrics());
      if (p === '/api/logs' && m === 'GET') return json(res, 200, Logs.findAll(80));

      if (p === '/api/deals' && m === 'GET') return json(res, 200, Deals.findAll({ stage: u.searchParams.get('stage') || undefined }));
      if (p === '/api/deals' && m === 'POST') {
        const b = await parseJSON(req);
        if (b.raw && !b.score) Object.assign(b, pick(L.scoreFromText(b.raw, b)));
        const d = Deals.create(b); Logs.create('deal_create', 'success', d.title);
        return json(res, 200, d);
      }
      if (p === '/api/ingest' && m === 'POST') {
        const b = await parseJSON(req);
        const items = b.items || (b.text ? [{ text: b.text }] : []);
        const created = [];
        for (const it of items) {
          const s = L.scoreFromText(it.text || it.title || '', it);
          const deal = Deals.create({
            title: it.title || (it.text || '').slice(0, 40) || '無題案件', source: it.source || 'lancers',
            stage: 'lead', raw: it.text || '', link: it.url || '', ref: it.ref || '', ...pick(s)
          });
          // 取込時は採点のみ（成果物の自動生成はしない＝無駄なAPI消費を防ぐ）。
          // 提案文＋成果物は、各カードの ✨生成 ボタンを押したときだけ生成する。
          created.push(deal);
        }
        Logs.create('ingest', 'success', `${created.length}件を採点（自動生成なし）`);
        return json(res, 200, { created: created.length, deals: created });
      }
      if (p === '/api/quote' && m === 'POST') { const b = await parseJSON(req); return json(res, 200, L.quote(b)); }

      const idm = p.match(/^\/api\/deals\/([^/]+)(\/advance)?$/);
      if (idm) {
        const id = idm[1]; const isAdv = !!idm[2];
        const cur = Deals.findById(id); if (!cur) return json(res, 404, { error: 'not found' });
        if (isAdv && m === 'POST') {
          let i = Math.min(L.STAGE_KEYS.length - 1, L.STAGE_KEYS.indexOf(cur.stage) + 1);
          return json(res, 200, Deals.update(id, { stage: L.STAGE_KEYS[i] }));
        }
        if (p.endsWith('/proposal') ) {} // handled below
        if (m === 'PATCH') { const b = await parseJSON(req); return json(res, 200, Deals.update(id, b)); }
        if (m === 'DELETE') { Deals.remove(id); return json(res, 200, { ok: true }); }
      }
      const pm = p.match(/^\/api\/deals\/([^/]+)\/proposal$/);
      if (pm && m === 'GET') { const d = Deals.findById(pm[1]); if (!d) return json(res, 404, {}); return json(res, 200, { proposal: L.proposal(d) }); }

      // 提案文＋成果物を生成（APIキー有=Claude高品質／無=無料テンプレで完結）
      const gm = p.match(/^\/api\/deals\/([^/]+)\/generate$/);
      if (gm && m === 'POST') {
        const d = Deals.findById(gm[1]); if (!d) return json(res, 404, { error: 'not found' });
        if (!process.env.ANTHROPIC_API_KEY) {
          const free = L.proposal(d);
          Deals.update(d.id, { proposal: free });
          return json(res, 200, { proposal: free, free: true });
        }
        try {
          // LP問い合わせは「応募提案文」ではなく「お客様への返信ドラフト」を生成
          if (d.source === 'lp') {
            let inquiry = {}; try { inquiry = JSON.parse(d.raw || '{}'); } catch { /* noop */ }
            const draft = await claude.draftReply(inquiry, L.quote({ type: d.type }));
            Deals.update(d.id, { proposal: draft });
            return json(res, 200, { proposal: draft });
          }
          const g = await claude.generate(d);
          const combined = (g.proposal || '') + '\n\n――― 添付用の成果物（' + (g.deliverable_type || '') + '） ―――\n' + (g.deliverable || '') + '\n\n参考デモ: ' + (g.demo_url || '');
          Deals.update(d.id, { proposal: combined });
          return json(res, 200, { proposal: combined });
        } catch (e) { return json(res, 200, { error: e.message }); }
      }

      // 相手メッセージへの返信文を生成（全媒体：ランサーズ/ココナラ/CW/LP）
      const rp = p.match(/^\/api\/deals\/([^/]+)\/reply$/);
      if (rp && m === 'POST') {
        const d = Deals.findById(rp[1]); if (!d) return json(res, 404, { error: 'not found' });
        const b = await parseJSON(req);
        if (!(b.message || '').trim()) return json(res, 400, { error: 'message required' });
        try { return json(res, 200, { reply: await claude.replyToMessage(d, b.message) }); }
        catch (e) { return json(res, 200, { error: e.message }); }
      }

      if (p === '/api/generate-all' && m === 'POST') {
        let n = 0;
        for (const d of Deals.findAll()) {
          if (d.stage === 'lost') continue;                 // 断片・不要カードは除外
          if (d.proposal && d.proposal.trim()) continue;    // 既存の提案は温存
          const type = (d.raw && d.raw.trim()) ? L.scoreFromText(d.raw).type : d.type; // 種別を再判定
          Deals.update(d.id, { type, proposal: L.proposal({ ...d, type }) });
          n++;
        }
        Logs.create('generate_all', 'success', `${n}件に提案文＋成果物を生成`);
        return json(res, 200, { generated: n });
      }

      return json(res, 404, { error: 'no route' });
    }

    // ── static ──
    if (m === 'GET' && /^\/[\w.\-]+\.(html|css|js|svg|png|ico)$/.test(p)) return serveFile(res, p.slice(1));
    return send(res, 404, 'Not Found', 'text/plain');
  } catch (e) {
    Logs.create('error', 'error', String(e && e.message || e));
    return json(res, 500, { error: 'server error' });
  }
});

function pick(s) {
  return { score: s.score, priority: s.priority, pred_win_rate: s.pred_win_rate, type: s.type, amount: s.budget || 0, est_hours: s.est_hours, next_action: s.decision };
}
function mapType(v = '') {
  if (/AI/i.test(v)) return 'ai'; if (/LINE/i.test(v)) return 'line'; if (/EC/i.test(v)) return 'ec';
  if (/ツール|システム|アプリ/.test(v)) return 'system'; if (/コーポレート/.test(v)) return 'corp'; return 'LP';
}
function serveFile(res, name) {
  const fp = path.join(PUBLIC_DIR, name);
  if (!fp.startsWith(PUBLIC_DIR) || !fs.existsSync(fp)) return send(res, 404, 'Not Found', 'text/plain');
  const ext = path.extname(fp);
  const ct = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
  send(res, 200, fs.readFileSync(fp), ct);
}

if (require.main === module) {
  server.listen(PORT, () => console.log(`[sales-platform] http://localhost:${PORT}  (admin: /admin, goal: ¥${GOAL.toLocaleString()})`));
}
module.exports = { server, metrics };
