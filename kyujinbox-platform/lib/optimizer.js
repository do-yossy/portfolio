'use strict';
// 求人ボックス自動改善ループのコア（成績保存・突合・検知・AI改善・DB適用）
// - storeMetrics: 取得した成績スナップショットを保存し、DB求人と突合
// - detectUnderperformers: 低調な求人を検知して診断（露出不足 or 中身の問題）
// - rewriteJob: Claude(Sonnet)で改善案を生成
// - applyImprovement: 改善をDBへ適用（自社サイトへ即反映）
const { db, generateId } = require('../db');

const nowIso = () => new Date().toISOString();
const normTitle = (s) => (s || '').replace(/\s+/g, '').replace(/株式会社.*$/,'').trim();
const daysSince = (iso) => {
  if (!iso) return 999;
  const t = Date.parse(iso.length <= 10 ? iso + 'T00:00:00Z' : iso);
  if (isNaN(t)) return 999;
  return Math.floor((Date.now() - t) / 86400000);
};
const isLiveStatus = (s) => /公開中|掲載中/.test(s || '');

// ── 成績スナップショットの保存＋DB求人との突合 ────────────────
function storeMetrics(company, rows) {
  const ins = db.prepare(`INSERT INTO job_metrics (id,company,job_number,job_id,title,location,status,views,applies,collected_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?)`);
  // 会社の求人を正規化タイトルで索引化（1回の投稿掲載に対応するDB求人を突合）
  const jobs = db.prepare(`SELECT id,title FROM jobs WHERE company=?`).all(company);
  const byNorm = new Map();
  for (const j of jobs) byNorm.set(normTitle(j.title), j.id);

  const setNum = db.prepare(`UPDATE jobs SET kyujinbox_job_number=? WHERE id=? AND (kyujinbox_job_number IS NULL OR kyujinbox_job_number='')`);
  const ts = nowIso();
  let matched = 0;
  for (const r of rows || []) {
    const titleNorm = normTitle(r.titleRaw || r.title || '');
    // 完全一致 → 前方一致（掲載タイトルは末尾に会社名が付くため）
    let jobId = byNorm.get(titleNorm) || null;
    if (!jobId) {
      for (const [n, id] of byNorm) { if (titleNorm.startsWith(n) && n.length > 8) { jobId = id; break; } }
    }
    if (jobId) { matched++; if (r.jobNumber) setNum.run(r.jobNumber, jobId); }
    ins.run(generateId(), company, r.jobNumber || '', jobId,
            (r.titleRaw || r.title || '').slice(0, 200), r.location || '', r.status || '',
            Number.isFinite(r.views) ? r.views : (parseInt(r.views, 10) || 0),
            Number.isFinite(r.applies) ? r.applies : (parseInt(r.applies, 10) || 0), ts);
  }
  return { stored: (rows || []).length, matched };
}

// ── 各求人の最新スナップショット（DB求人に紐づくもの） ──────────
function latestMetrics(company) {
  return db.prepare(`
    SELECT m.*, j.title AS job_title, j.published_at, j.updated_at, j.optimize_count, j.last_optimized_at,
           j.salary, j.job_type
    FROM job_metrics m
    JOIN jobs j ON j.id = m.job_id
    WHERE m.company = ? AND m.job_id IS NOT NULL
      AND m.collected_at = (SELECT MAX(collected_at) FROM job_metrics m2 WHERE m2.job_id = m.job_id)
  `).all(company);
}

// ── 低調求人の検知（露出不足 or 中身の問題） ──────────────────
// opts: { minAgeDays=3, viewFloor=30, cooldownDays=5, maxOptimize=3, limit=20 }
function detectUnderperformers(company, opts = {}) {
  const { minAgeDays = 3, viewFloor = 30, cooldownDays = 5, maxOptimize = 3, limit = 20 } = opts;
  const rows = latestMetrics(company);
  const flagged = [];
  for (const m of rows) {
    if (!isLiveStatus(m.status)) continue;                 // 公開中のみ判定
    const age = daysSince(m.published_at || m.updated_at);
    if (age < minAgeDays) continue;                        // 掲載直後は判定しない
    if ((m.optimize_count || 0) >= maxOptimize) continue;  // 改善回数の上限
    if (m.last_optimized_at && daysSince(m.last_optimized_at) < cooldownDays) continue; // クールダウン

    const views = m.views || 0, applies = m.applies || 0;
    if (applies > 0) continue;                             // 応募が来ている求人は対象外
    let diagnosis = null, reason = '';
    if (views < viewFloor) {
      diagnosis = 'exposure';
      reason = `掲載${age}日で閲覧${views}回・応募0（露出不足の可能性）`;
    } else {
      diagnosis = 'content';
      reason = `閲覧${views}回あるが応募0（中身・条件の見せ方の問題の可能性）`;
    }
    flagged.push({ jobId: m.job_id, jobNumber: m.job_number, diagnosis, reason,
                   age, views, applies, status: m.status });
  }
  // 応募ゼロで露出が多い＝もったいない順に優先
  flagged.sort((a, b) => (b.views - a.views));
  return flagged.slice(0, limit);
}

// ── Claude(Sonnet)で改善案を生成 ─────────────────────────────
// 事実（職種・勤務地・給与レンジ）は変えず、タイトルのキーワード最適化・
// 訴求文・応募ハードルの見せ方を改善する。返り値は改善後フィールド。
async function rewriteJob(job, diagnosis, reason, opts = {}) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey || apiKey.startsWith('sk-ant-your')) {
    throw new Error('ANTHROPIC_API_KEY が未設定です（.env に本物のAPIキーを設定してください）');
  }
  const model = (process.env.OPTIMIZER_MODEL || 'claude-sonnet-5').trim();
  const tags = (() => { try { return JSON.parse(job.tags || '[]'); } catch { return []; } })();

  // 人材紹介求人（agency）は、実在他社の求人条件を扱うため本文の書き換えは虚偽リスクが高い。
  // → タイトル・キャッチコピー（訴求）・タグのみ最適化し、仕事内容/やりがいは一切変更しない。
  const isAgency = (job.job_kind === 'agency');

  let sys, user;
  if (isAgency) {
    const guide = diagnosis === 'exposure'
      ? `【診断: 露出不足】検索で見つかりにくい状態です。求職者が実際に検索する語（例: 未経験歓迎/正社員/日勤/土日休み/シニア歓迎/普通免許OK 等、この求人に「実際に当てはまるものだけ」）を、タイトルとキャッチコピーに自然に反映してください。求人票に無い条件は追加しないでください。`
      : `【診断: 中身の問題】閲覧はあるが応募がありません。タイトルとキャッチコピーの言い回し・語順・訴求だけを魅力的にしてください（事実の追加・誇張は不可）。`;
    sys = `あなたは人材紹介求人（求人ボックス掲載）のコピーライターです。これは実在する他社の求人であり、条件を偽ると法令違反（虚偽求人・職業安定法）になります。
制約（絶対厳守）:
- 変更してよいのは「タイトル」「キャッチコピー（訴求）」「タグ」の3つ「だけ」。
- 仕事内容(description)・やりがい(rewarding)・職種・勤務地・給与・雇用形態は「絶対に変更しない・出力もしない」。
- 求人票に書かれていない条件・待遇・数値を一切追加しない。表現（語順・言い回し・強調）だけを整える。
- 「人材紹介である旨」の記載は保持前提（本文は触らない）。日本語。
出力は次のJSONのみ（説明文やコードフェンスを付けない）:
{"title":"...","catchcopy":"...","tags":["..."],"note":"表現をどう変えたか1〜2文"}`;
    user = `${guide}

以下は人材紹介求人です。事実は一切変えず、タイトル・キャッチコピー・タグの「表現だけ」改善したJSONを返してください。

# 現状の指標
${reason}

# 現在の求人（事実として保持すべき情報。変更禁止）
職種: ${job.job_type}
勤務地: ${job.location}
給与: ${job.salary}
雇用形態: ${job.employment_type}
--- 仕事内容(参考・変更禁止) ---
${(job.description || '').slice(0, 1500)}
--- 改善対象: タイトル ---
${job.title}
--- 改善対象: キャッチコピー ---
${job.catchcopy || ''}
--- 改善対象: タグ ---
${JSON.stringify(tags)}`;
  } else {
    const guide = diagnosis === 'exposure'
      ? `【診断: 露出不足】検索で見つかりにくい状態です。求職者が実際に検索する語（例: 未経験歓迎/正社員/日勤/土日休み/高収入/シニア歓迎/普通免許OK 等、この求人に当てはまるもの）をタイトル前半と本文に自然に増やしてください。`
      : `【診断: 中身の問題】閲覧はあるが応募がありません。応募ハードルを下げ、不安を先に解消し、給与や条件の見せ方・訴求を魅力的にしてください（誇張・虚偽は不可）。`;
    sys = `あなたは求人広告（求人ボックス掲載）の改善を担うプロの求人コピーライターです。
制約（厳守）:
- 職種・勤務地・給与レンジ・雇用形態などの「事実」は絶対に変えない。誇張・虚偽・実在しない条件の追加は禁止。
- 改善するのは、タイトルのキーワード/語順、キャッチコピー、本文の訴求・構成、タグ、やりがい文のみ。
- 日本語。求人ボックスの掲載基準（虚偽・差別表現の禁止）を守る。
出力は次のJSONのみ（前後に説明文やコードフェンスを付けない）:
{"title":"...","catchcopy":"...","description":"...","rewarding":"...","tags":["..."],"note":"何をどう変えたか1〜2文"}`;
    user = `${guide}

以下の求人を改善してください。事実は保持し、上記の観点だけ改善したJSONを返してください。

# 現状の指標
${reason}

# 現在の求人
職種: ${job.job_type}
勤務地: ${job.location}
給与: ${job.salary}
雇用形態: ${job.employment_type}
--- タイトル ---
${job.title}
--- キャッチコピー ---
${job.catchcopy || ''}
--- 仕事内容(description) ---
${job.description || ''}
--- やりがい(rewarding) ---
${job.rewarding || ''}
--- タグ ---
${JSON.stringify(tags)}`;
  }

  const body = {
    model,
    max_tokens: 3000,
    system: sys,
    messages: [{ role: 'user', content: user }],
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Claude API エラー ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  // JSONを頑健に抽出
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('AI応答からJSONを抽出できませんでした');
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); }
  catch (err) { throw new Error('AI応答のJSON解析に失敗: ' + err.message); }

  // 安全策: 給与レンジや職種の改ざんを防ぐため、これらは元の値を維持
  // 人材紹介(agency)は、仕事内容(description)・やりがい(rewarding)を「絶対に」元のまま保持し、
  // タイトル・キャッチコピー・タグの表現だけを差し替える（虚偽求人の防止）。
  return {
    title: (obj.title || job.title).slice(0, 120),
    catchcopy: (obj.catchcopy || job.catchcopy || '').slice(0, 300),
    description: isAgency ? job.description : (obj.description || job.description),
    rewarding: isAgency ? job.rewarding : (obj.rewarding || job.rewarding || '').slice(0, 500),
    tags: Array.isArray(obj.tags) && obj.tags.length ? obj.tags.slice(0, 15).map(String) : tags,
    note: (obj.note || '').slice(0, 200),
  };
}

// ── 改善をDBへ適用（自社サイトへ即反映）──────────────────────
function applyImprovement(jobId, improved) {
  const ts = nowIso();
  db.prepare(`UPDATE jobs SET title=?, catchcopy=?, description=?, rewarding=?, tags=?,
              optimize_count=COALESCE(optimize_count,0)+1, last_optimized_at=?, updated_at=?
              WHERE id=?`)
    .run(improved.title, improved.catchcopy, improved.description, improved.rewarding,
         JSON.stringify(improved.tags), ts, ts, jobId);
}

module.exports = { storeMetrics, latestMetrics, detectUnderperformers, rewriteJob, applyImprovement };
