// テストのたたき台づくり(AI版)。既定ではオフ。TESTMAKER_ENABLED="true" かつ ANTHROPIC_API_KEY があるときだけ動く。
// 原本の設計(docs/引き継ぎ_AI版テスト作成.md)のうち、作成→検算→点検(配点)までを実装した。
// 種類: 定期テスト・小テスト・漢字テスト・計算テスト・宿題プリント。結果は画面で直せて、Word(.docx)で出力できる。先生の評価(使えた/直す時間)は回数だけ記録する。
// 未実装: 小問の類題差し替え / 別版 / 小学校の漢字配当表。
// 守ること: 教科書の本文・図・問題は使わない / 児童生徒の氏名・答案・成績は扱わない / 観点は2つだけ / 出力はたたき台(採用判断は先生)。
// 作った内容はサーバーに保存しない。保存するのは、会員ごと・月ごとの回数とトークン数、および先生の評価(選択式の2項目と種類)だけ。
import { LEVELS } from './content.js';
import { esc, layout } from './pages.js';

export const MONTHLY_LIMIT = 15;
export const ASPECTS = ['知識・技能', '思考・判断・表現'];
export const DIFFICULTIES = ['やさしい', 'ふつう', '難しい'];
export const KINDS = ['定期テスト', '小テスト', '漢字テスト', '計算テスト', '宿題プリント'];
const KIND_GUIDE = {
  定期テスト: '',
  小テスト: '種類:小テスト。10〜20分で終わる分量にし、単元を絞る。\n',
  漢字テスト: '種類:漢字テスト。読みと書きの問題にする。1問につき1語を基本にし、配点は同じにそろえる。問題文には、学年に合わない難しい漢字は使わない(学年の配当は、先生が確認する)。\n',
  計算テスト: '種類:計算テスト。計算問題にする。答えは数値か式だけにし、配点は同じにそろえる。\n',
  宿題プリント: '種類:宿題プリント。家庭で、ひとりで取り組める分量にする。ヒントになる言葉を、問題文に添えてよい。\n',
};
const BANNED_WORDS = ['生徒', '児童', '氏名', '成績', '答案'];
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

export const testmakerOn = (env) => env.TESTMAKER_ENABLED === 'true' && !!env.ANTHROPIC_API_KEY;

// 暦月(日本時間)。毎月1日に回数が戻る
export const jstMonth = (nowMs = Date.now()) => new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 7);

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const intIn = (v, min, max, dflt) => {
  if (v === '' || v == null) return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};

// フォームの入力を検査する。氏名・成績・答案などの語が入っていたら作成を止める
export function parseInput(get) {
  const level = clean(get('level'), 20);
  const kind = clean(get('kind'), 20) || KINDS[0];
  const subject = clean(get('subject'), 20);
  const grade = clean(get('grade'), 10);
  const units = clean(get('units'), 200).split(/[\n、,]/).map((u) => u.trim()).filter(Boolean).slice(0, 3).map((u) => u.slice(0, 40));
  const extra = clean(get('extra'), 200);
  const total = intIn(get('total'), 20, 100, 100);
  const minutes = intIn(get('minutes'), 10, 90, 50);
  const count = intIn(get('count'), 3, 20, 6);
  const kept = { kind, level, subject, grade, units: units.join('\n'), extra, total: String(get('total') ?? ''), minutes: String(get('minutes') ?? ''), count: String(get('count') ?? '') };
  const fail = (error) => ({ ok: false, error, kept });
  if (!KINDS.includes(kind)) return fail('種類を選んでください。');
  if (!Object.hasOwn(LEVELS, level)) return fail('校種を選んでください。');
  if (!subject) return fail('教科を入力してください。');
  if (!grade) return fail('学年・科目を入力してください。');
  if (units.length === 0) return fail('単元を1つ以上入力してください(3つまで)。');
  if ([total, minutes, count].some(Number.isNaN)) return fail('満点・時間・問題数は、範囲内の整数で入力してください。');
  const hit = BANNED_WORDS.find((w) => [subject, grade, extra, ...units].join(' ').includes(w));
  if (hit) return fail(`入力に「${hit}」を含む語があるため、作成を止めました。児童生徒の氏名・答案・成績は扱えません。単元名と条件だけを入力してください。`);
  return { ok: true, value: { kind, level, subject, grade, units, extra, total, minutes, count }, kept };
}

const SYSTEM_RULES = `あなたは、日本の学校の先生がテストを作るのを手伝う作問の補助者です。出力は「たたき台」で、採用するかは先生が決めます。
守ること:
・教科書や問題集の本文・図・問題は使わない。学習指導要領の単元名だけを手がかりに、問題文はすべて自作する。読解の本文は自作する。
・児童生徒の氏名・答案・成績は扱わない。
・観点は「知識・技能」「思考・判断・表現」の2つだけ。態度は、ペーパーテストでは評価しない。
・各小問の配点は正の整数。配点の合計は、指定された満点と必ず一致させる。
・各小問に、模範解答と、部分点の考え方(採点基準)をつける。
・難しさは「やさしい」「ふつう」「難しい」のどれか。
・出力は、次の形のJSONだけ。説明文やコードブロックは付けない。
{"title":"テスト名","questions":[{"no":1,"aspect":"知識・技能","difficulty":"ふつう","unit":"単元名","text":"問題文","answer":"模範解答","points":10,"scoring":[{"point":10,"criterion":"採点の基準"}]}]}`;

export function buildGeneratePrompt(v) {
  const user = `次の条件で、テストのたたき台を作ってください。
種類:${v.kind || KINDS[0]}
校種:${LEVELS[v.level]}
教科:${v.subject}
学年・科目:${v.grade}
単元:${v.units.join('、')}
満点:${v.total}点 / 時間:${v.minutes}分 / 小問の数:${v.count}問ほど
観点の配分の目安:知識・技能 6〜7割、思考・判断・表現 3〜4割
${KIND_GUIDE[v.kind] || ''}${v.level === 'elementary' ? '小学校向け:児童にわかる言い回しにし、習っていない漢字は避ける。算数は「式」と「答え」を分けて答えさせる。\n' : ''}${v.extra ? `先生からの追加の条件:${v.extra}\n` : ''}`;
  return { system: SYSTEM_RULES, user, maxTokens: v.count > 12 ? 8000 : 4096 };
}

// 検算: 模範解答を見せずに、別の呼び出しで解き直させる
export function buildVerifyPrompt(questions) {
  const system = 'あなたは、テストの問題を解く役です。各問題に、あなた自身で考えて答えてください。出力は、次の形のJSONだけ。説明文やコードブロックは付けない。\n{"answers":[{"no":1,"answer":"答え"}]}';
  const user = questions.map((q) => `問題${q.no}(${q.points}点):\n${q.text}`).join('\n\n');
  return { system, user, maxTokens: questions.length > 12 ? 4096 : 2048 };
}

export function extractJson(text) {
  const s = String(text ?? '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

// 生成結果の形と配点を点検する。形が壊れていれば error、配点などのずれは warnings に残す(先生が直せる)
export function validateTest(obj, total) {
  if (!obj || !Array.isArray(obj.questions) || obj.questions.length < 1 || obj.questions.length > 20) return { error: '作成結果の形が正しくありません。もう一度お試しください。' };
  const warnings = [];
  const questions = [];
  for (const [i, q] of obj.questions.entries()) {
    const text = clean(q?.text, 2000);
    const answer = clean(q?.answer, 2000);
    const points = Number(q?.points);
    if (!text || !answer || !Number.isInteger(points) || points < 1 || points > 100) return { error: '作成結果の形が正しくありません。もう一度お試しください。' };
    const aspect = ASPECTS.includes(q.aspect) ? q.aspect : null;
    if (!aspect) warnings.push(`問${i + 1}:観点が「知識・技能」「思考・判断・表現」のどちらでもありません。先生が選び直してください。`);
    const difficulty = DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'ふつう';
    const scoring = (Array.isArray(q.scoring) ? q.scoring : []).slice(0, 6).map((s) => ({ point: Math.max(0, Math.floor(Number(s?.point) || 0)), criterion: clean(s?.criterion, 300) })).filter((s) => s.criterion);
    if (scoring.length && scoring.reduce((n, s) => n + s.point, 0) !== points) warnings.push(`問${i + 1}:採点基準の点の合計が、配点(${points}点)と合っていません。`);
    questions.push({ no: i + 1, aspect, difficulty, unit: clean(q.unit, 40), text, answer, points, scoring });
  }
  const sum = questions.reduce((n, q) => n + q.points, 0);
  if (sum !== total) warnings.push(`配点の合計が${sum}点で、満点(${total}点)と合っていません。先生が配点を直してください。`);
  return { title: clean(obj.title, 60) || 'テスト(たたき台)', questions, warnings, sum };
}

const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s、。,.．，・「」『』()（）]/g, '');

// 検算の結果を、問題ごとに印にする。長い記述の答えは、機械では比べられないので「比較しない」とする
export function compareAnswers(questions, verifyObj) {
  const solved = new Map((Array.isArray(verifyObj?.answers) ? verifyObj.answers : []).map((a) => [Number(a?.no), String(a?.answer ?? '')]));
  return questions.map((q) => {
    if (norm(q.answer).length > 30) return { ...q, check: 'skipped' };
    if (!solved.has(q.no)) return { ...q, check: 'missing' };
    return { ...q, check: norm(solved.get(q.no)) === norm(q.answer) ? 'match' : 'mismatch', solved: clean(solved.get(q.no), 200) };
  });
}

export async function callClaude(env, { system, user, maxTokens }, fetchFn = globalThis.fetch) {
  const res = await fetchFn(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.TESTMAKER_MODEL || DEFAULT_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`); // 応答の本文は、ログにも画面にも出さない
  const data = await res.json();
  return { text: (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''), usage: data.usage || {} };
}

// ---- 月の回数(会員ごと・暦月ごと)。作った内容は保存しない ----
const changed = (r) => (r.meta?.changes ?? r.changes) > 0;

export async function reserveUse(db, customer, ym, limit = MONTHLY_LIMIT) {
  const r = await db
    .prepare('INSERT INTO test_usage (customer_id, ym, count, in_tokens, out_tokens) VALUES (?, ?, 1, 0, 0) ON CONFLICT(customer_id, ym) DO UPDATE SET count = count + 1 WHERE count < ?')
    .bind(customer, ym, limit)
    .run();
  return changed(r);
}
export const releaseUse = (db, customer, ym) => db.prepare('UPDATE test_usage SET count = MAX(count - 1, 0) WHERE customer_id = ? AND ym = ?').bind(customer, ym).run();
export const addTokens = (db, customer, ym, i, o) => db.prepare('UPDATE test_usage SET in_tokens = in_tokens + ?, out_tokens = out_tokens + ? WHERE customer_id = ? AND ym = ?').bind(i || 0, o || 0, customer, ym).run();
export async function usedThisMonth(db, customer, ym) {
  const r = await db.prepare('SELECT count FROM test_usage WHERE customer_id = ? AND ym = ?').bind(customer, ym).first();
  return r ? r.count : 0;
}

// 作成→検算。失敗したときは、回数を戻す(検算だけが失敗したときは、たたき台を返し、検算できなかったと伝える)
export async function runTestMaker(env, db, customer, v, { fetchFn = globalThis.fetch, nowMs = Date.now() } = {}) {
  const ym = jstMonth(nowMs);
  if (!(await reserveUse(db, customer, ym))) return { status: 'limit' };
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const gen = await callClaude(env, buildGeneratePrompt(v), fetchFn);
    tokensIn += gen.usage.input_tokens || 0;
    tokensOut += gen.usage.output_tokens || 0;
    const test = validateTest(extractJson(gen.text), v.total);
    if (test.error) throw new Error('invalid');
    let verified = false;
    let questions = test.questions;
    try {
      const ver = await callClaude(env, buildVerifyPrompt(questions), fetchFn);
      tokensIn += ver.usage.input_tokens || 0;
      tokensOut += ver.usage.output_tokens || 0;
      const obj = extractJson(ver.text);
      if (obj) {
        questions = compareAnswers(questions, obj);
        verified = true;
      }
    } catch {
      /* 検算だけが失敗: 検算できなかったと表示する */
    }
    await addTokens(db, customer, ym, tokensIn, tokensOut);
    return { status: 'ok', title: test.title, questions, warnings: test.warnings, verified, sum: test.sum, used: await usedThisMonth(db, customer, ym) };
  } catch (e) {
    console.error('testmaker failed:', e && e.message);
    await releaseUse(db, customer, ym);
    if (tokensIn || tokensOut) await addTokens(db, customer, ym, tokensIn, tokensOut);
    return { status: 'error' };
  }
}


// ---- 先生が直した内容の受け取り(Word出力用)と、評価の記録 ----
export const SCHOOL_PC_NOTE = 'スマホやパソコンで作れます。作ったWordやPDFを学校に持ち込むかどうか、持ち込み方(自分宛メール・コンビニのネットプリント・学校のパソコンで開いて印刷など)は、所属校・自治体の情報セキュリティの方針に従ってください。学校のパソコンで使うことが禁止されている場合があります。';

const num = (v, min, max) => {
  const n = Number(String(v ?? '').normalize('NFKC').trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};
const parseScoring = (text) =>
  clean(text, 1000)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((l) => {
      const m = l.normalize('NFKC').match(/^(\d{1,3})\s*点?\s*(.*)$/);
      return m ? { point: Number(m[1]), criterion: clean(m[2], 300) } : { point: 0, criterion: clean(l, 300) };
    })
    .filter((s) => s.criterion);

export function parseEditedTest(get) {
  const kind = clean(get('kind'), 20);
  const level = clean(get('level'), 20);
  const n = num(get('n'), 1, 20);
  if (!KINDS.includes(kind) || !Object.hasOwn(LEVELS, level) || Number.isNaN(n)) return { ok: false, error: '入力内容を読み取れませんでした。' };
  const questions = [];
  for (let i = 1; i <= n; i++) {
    const text = clean(get(`q${i}_text`), 2000);
    const points = num(get(`q${i}_points`), 0, 100);
    if (!text || Number.isNaN(points)) return { ok: false, error: `問${i}:問題文を入れ、配点は0〜100の整数にしてください。` };
    const aspect = clean(get(`q${i}_aspect`), 20);
    const difficulty = clean(get(`q${i}_difficulty`), 10);
    questions.push({ no: i, aspect: ASPECTS.includes(aspect) ? aspect : '', difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : '', unit: clean(get(`q${i}_unit`), 40), text, answer: clean(get(`q${i}_answer`), 2000), points, scoring: parseScoring(get(`q${i}_scoring`)) });
  }
  return {
    ok: true,
    value: { kind, levelLabel: LEVELS[level], subject: clean(get('subject'), 20), grade: clean(get('grade'), 10), total: num(get('total'), 20, 100) || 100, minutes: num(get('minutes'), 10, 90) || 50, title: clean(get('title'), 60) || 'テスト(たたき台)', questions },
  };
}

export const docxFileName = (title) => (String(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 40) || 'テスト') + '.docx';

export const USABLE = ['yes', 'partial', 'no'];
export const FIX = ['le10', 'le30', 'gt30'];
export function parseRating(get) {
  const usable = clean(get('usable'), 10);
  const fix = clean(get('fix'), 10);
  const kind = clean(get('kind'), 20);
  if (!USABLE.includes(usable) || !FIX.includes(fix) || !KINDS.includes(kind)) return null;
  return { usable, fix, kind };
}
// 1人あたり24時間に30件まで。保存できたら true
export async function saveRating(db, customer, r, nowSec = Math.floor(Date.now() / 1000)) {
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM test_rating WHERE customer_id = ? AND created_at > ?').bind(customer, nowSec - 86400).first();
  if (recent && recent.n >= 30) return false;
  await db.prepare('INSERT INTO test_rating (customer_id, kind, usable, fix_minutes, created_at) VALUES (?, ?, ?, ?, ?)').bind(customer, r.kind, r.usable, r.fix, nowSec).run();
  return true;
}


// スマホ向け: 印刷用ページ。ブラウザの「印刷 → PDFとして保存」で、PDFにできる(サーバー側でWordをPDFに変換する方法は、Workers では使えない)
// 先生が直した内容(parseEditedTest の結果)を受け取り、問題用紙・解答用紙・模範解答と採点基準(先生用)・配点表を、A4で改ページして並べる。保存はしない
export const testPrintPage = (t) => {
  const qs = t.questions;
  const sum = qs.reduce((n, q) => n + q.points, 0);
  const aspectSum = (a) => qs.filter((q) => q.aspect === a).reduce((n, q) => n + q.points, 0);
  const NAME = '　　年　　組　　番　　名前(　　　　　　　　　　　　)';
  const CSS = `@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font-family:"Yu Mincho","游明朝","Hiragino Mincho ProN",serif;color:#000;background:#fff;line-height:1.7;font-size:15px}.bar{background:#f4f1e8;border-bottom:1px solid #ccc;padding:12px 16px;font-family:system-ui,sans-serif;font-size:15px}.bar button{font-size:17px;padding:12px 18px;border:0;border-radius:10px;background:#1f6f4a;color:#fff;margin:6px 0}.bar p{margin:6px 0}.sheet{padding:16px;max-width:210mm;margin:0 auto}.pb{page-break-before:always;break-before:page}h1{font-size:22px;text-align:center;margin:0 0 4px}.sub{text-align:center;margin:0 0 10px}.q{margin:0 0 16px;white-space:pre-wrap}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:6px 8px;text-align:left;vertical-align:top}.ans td{height:70px}.note{font-size:12px;margin-top:14px}@media print{.bar{display:none}.sheet{padding:0}}`;
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.title)}</title><style>${CSS}</style></head><body>
<div class="bar"><p><strong>PDFにして保存・印刷する</strong></p><p>下のボタンを押し、表示された画面で「PDFとして保存」(または「PDFに保存」)を選んでください。選べないときは、ブラウザの共有・印刷のメニューから、同じ項目を探してください。</p><button type="button" onclick="window.print()">印刷 / PDFとして保存</button><p>この画面を閉じると、内容は消えます(保存されません)。ファイルを学校に持ち込むかどうかや、持ち込み方は、所属校・自治体の情報セキュリティの方針に従ってください。</p></div>
<div class="sheet"><h1>${esc(t.title)}</h1><p class="sub">${esc(t.levelLabel)} ${esc(t.subject)} ${esc(t.grade)} / ${t.minutes}分 / ${t.total}点満点</p><p>${NAME}</p>
${qs.map((q) => `<p class="q"><strong>問${q.no}</strong>(${q.points}点)\n${esc(q.text)}</p>`).join('')}
</div>
<div class="sheet pb"><h1>${esc(t.title)} 解答用紙</h1><p>${NAME}</p>
<table class="ans"><tr><th style="width:12%">問</th><th>解答</th><th style="width:20%">得点 / 配点</th></tr>${qs.map((q) => `<tr><td>問${q.no}</td><td></td><td>/ ${q.points}</td></tr>`).join('')}</table></div>
<div class="sheet pb"><h1>模範解答と採点基準(先生用)</h1>
${qs.map((q) => `<p class="q"><strong>問${q.no}</strong>(${q.points}点)\n模範解答:${esc(q.answer)}${q.scoring.length ? `\n採点基準:${q.scoring.map((s) => `${s.point}点 ${esc(s.criterion)}`).join(' / ')}` : ''}</p>`).join('')}
</div>
<div class="sheet pb"><h1>配点表</h1>
<table><tr><th>問</th><th>単元</th><th>観点</th><th>難しさ</th><th>配点</th></tr>${qs.map((q) => `<tr><td>${q.no}</td><td>${esc(q.unit)}</td><td>${esc(q.aspect)}</td><td>${esc(q.difficulty)}</td><td>${q.points}</td></tr>`).join('')}<tr><th colspan="4">合計</th><th>${sum}</th></tr></table>
<p>知識・技能:${aspectSum('知識・技能')}点 / 思考・判断・表現:${aspectSum('思考・判断・表現')}点</p>
<p class="note">※ サクモンのAIが作ったたたき台を、作成した先生が確認・修正したものです。内容の正しさと採否は、作成した先生が判断してください。</p></div>
</body></html>`;
};

// ---- 画面 ----
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const FIELD = 'width:100%;font-size:17px;padding:12px 14px;border:1.5px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font-family:inherit';

export const testFormPage = (used, error, kept = {}) =>
  layout(
    'テストのたたき台を作る',
    `<style>.tm label{display:block;margin:16px 0 6px;font-weight:700}.tm input,.tm select,.tm textarea{${FIELD}}</style>
<div class="hero tm" style="padding-top:8px">
<a class="back" href="/m">← 一覧へ戻る</a>
<h1 style="font-size:26px">テストのたたき台を作る</h1>
<p class="lead" style="font-size:16px">種類(定期テスト・小テスト・漢字テスト・計算テスト・宿題プリント)・校種・教科・単元を選ぶと、問題・模範解答・採点基準・配点表のたたき台ができます。答えを見せずに解き直して、模範解答と食い違う問題に印を付けます(一致しても、正しいとは限りません。長い記述の答えは比べません)。画面で直して、Wordで出力できます。</p>
<p class="note">今月の回数:${used}/${MONTHLY_LIMIT}回(毎月1日に戻ります)。作った内容は保存されません。画面を閉じる前に、Wordに出力してください。</p>
<p class="note">${esc(SCHOOL_PC_NOTE)}</p>
<p class="note">作成には、1〜2分かかることがあります。作成中は、画面を閉じたり、ほかのアプリに切り替えたりしないでください(スマホでは、画面を消さないでください)。</p>
<p class="note">入力した内容は、作成のため、外部のAIサービスに送られます。児童生徒の氏名・答案・成績は、入力しないでください。</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<form method="post" action="/m/test">
<label for="kind">種類</label>
<select id="kind" name="kind" required>${KINDS.map((k) => `<option value="${k}" ${kept.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
<label for="level">校種</label>
<select id="level" name="level" required>${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${kept.level === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
<label for="subject">教科</label><input id="subject" name="subject" maxlength="20" value="${esc(kept.subject || '')}" required>
<label for="grade">学年・科目</label><input id="grade" name="grade" maxlength="10" value="${esc(kept.grade || '')}" required>
<label for="units">単元(3つまで。1行に1つ)</label><textarea id="units" name="units" rows="3" maxlength="200" required>${esc(kept.units || '')}</textarea>
<label for="total">満点(20〜100。空欄は100)</label><input id="total" name="total" inputmode="numeric" value="${esc(kept.total || '')}">
<label for="minutes">時間・分(10〜90。空欄は50)</label><input id="minutes" name="minutes" inputmode="numeric" value="${esc(kept.minutes || '')}">
<label for="count">小問の数(3〜20。空欄は6)</label><input id="count" name="count" inputmode="numeric" value="${esc(kept.count || '')}">
<label for="extra">追加の条件(任意・200字まで)</label><textarea id="extra" name="extra" rows="3" maxlength="200">${esc(kept.extra || '')}</textarea>
<p style="margin-top:16px"><button class="btn" type="submit">作成する(1回に数える)</button></p>
</form></div>`,
  );

const CHECK_LABEL = { match: '検算:一致(正しいとは限りません)', mismatch: '検算:食い違い(要確認)', skipped: '検算:記述のため比べていません', missing: '検算:結果なし' };

const scoringText = (q) => q.scoring.map((s) => `${s.point}点 ${s.criterion}`).join('\n');

// 結果は、先生が画面で直してから、Word(.docx)で出力する。作った内容はサーバーに保存しない
export const testResultPage = (r, v) => {
  const sum = r.questions.reduce((n, q) => n + q.points, 0);
  const T = 'width:100%;font-size:16px;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink);font-family:inherit';
  const hid = (k, val) => `<input type="hidden" name="${k}" value="${esc(val)}">`;
  return layout(
    r.title,
    `<style>.warn{background:var(--warn);border:1px solid var(--warn-line);border-radius:10px;padding:12px 14px;margin:12px 0}.qb{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:12px 0}.qb label{display:block;margin:10px 0 4px;font-weight:700;font-size:14px}</style>
<div class="hero" style="padding-top:8px">
<p><a class="back" href="/m/test">← 条件を変えて作り直す</a></p>
<div class="warn"><strong>これは「たたき台」です。</strong>内容の正しさ・難しさ・配点は、先生が確認し、下の欄で直してから、Wordで出力してください。教科書の問題と似ていないかも、ご確認ください。${r.verified ? '' : '<br><strong>検算ができませんでした。</strong>模範解答は、ご自身で解いて確かめてください。'}</div>
<div class="warn">${esc(SCHOOL_PC_NOTE)}</div>
${r.warnings.length ? `<div class="warn"><strong>点検で見つかったこと</strong><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
<p>${esc(v.kind || KINDS[0])} / ${esc(LEVELS[v.level])} ${esc(v.subject)} ${esc(v.grade)} / 満点${v.total}点 / ${v.minutes}分 / いまの配点の合計 ${sum}点</p>
<p class="note">この画面を閉じると、内容は消えます(保存されません)。Wordに出力してから、閉じてください。</p>
<form method="post" action="/m/test/docx">
${hid('kind', v.kind || KINDS[0])}${hid('level', v.level)}${hid('subject', v.subject)}${hid('grade', v.grade)}${hid('total', v.total)}${hid('minutes', v.minutes)}${hid('n', r.questions.length)}
<label for="title" style="display:block;font-weight:700;margin-top:12px">テスト名</label><input id="title" name="title" maxlength="60" value="${esc(r.title)}" style="${T}">
${r.questions
  .map(
    (q) => `<div class="qb"><strong>${q.check === 'mismatch' ? '<span style="color:#a33">⚠ </span>' : ''}問${q.no}</strong> <small>${esc(CHECK_LABEL[q.check] || '')}${q.check === 'mismatch' && q.solved ? `(解き直しの答え:${esc(q.solved)})` : ''}</small>
${hid(`q${q.no}_aspect`, q.aspect || '')}${hid(`q${q.no}_difficulty`, q.difficulty)}${hid(`q${q.no}_unit`, q.unit)}
<label for="q${q.no}_text">問題文</label><textarea id="q${q.no}_text" name="q${q.no}_text" rows="4" maxlength="2000" style="${T}">${esc(q.text)}</textarea>
<label for="q${q.no}_answer">模範解答</label><textarea id="q${q.no}_answer" name="q${q.no}_answer" rows="2" maxlength="2000" style="${T}">${esc(q.answer)}</textarea>
<label for="q${q.no}_points">配点(点)</label><input id="q${q.no}_points" name="q${q.no}_points" inputmode="numeric" value="${q.points}" style="${T};max-width:120px">
<label for="q${q.no}_scoring">採点基準(1行に1つ。「3点 式が正しい」の形)</label><textarea id="q${q.no}_scoring" name="q${q.no}_scoring" rows="2" maxlength="1000" style="${T}">${esc(scoringText(q))}</textarea>
<small>観点:${esc(q.aspect || '未設定(先生が決めてください)')} / 難しさ:${esc(q.difficulty)}</small></div>`,
  )
  .join('')}
<p><button class="btn" type="submit">Wordで出力する(.docx)</button></p>
<p><button class="btn" type="submit" formaction="/m/test/print" formtarget="_blank">PDF・印刷用のページを開く(スマホ向け)</button></p>
<p class="note">問題用紙・解答用紙・模範解答と採点基準・配点表が、1つのWordファイルに入ります。スマホでは、「PDF・印刷用のページ」から、PDFとして保存できます。今月の回数:${r.used}/${MONTHLY_LIMIT}回。</p>
</form>
<form method="post" action="/m/test/rating" class="qb">
<strong>使ってみて、どうでしたか(任意・今後の改善に使います)</strong>
${hid('kind', v.kind || KINDS[0])}
<label for="usable">そのまま、または少し直して使えそうですか</label>
<select id="usable" name="usable" style="${T}"><option value="yes">使えそう</option><option value="partial">かなり直せば使えそう</option><option value="no">使えなさそう</option></select>
<label for="fix">直す時間の目安</label>
<select id="fix" name="fix" style="${T}"><option value="le10">10分以内</option><option value="le30">30分以内</option><option value="gt30">30分より長い</option></select>
<p><button class="btn" type="submit">送る</button></p>
<p class="note">送られるのは、この2つの選択と種類だけです。作った内容や入力した条件は送られません。</p>
</form>
</div>`,
  );
};
