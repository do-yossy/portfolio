'use strict';
// 古い求人の自動修正（リフレッシュ）
// 求人ボックスでは掲載が古くなると表示順が落ち、応募が止まる。
// そこで「更新が古い / 有効期限が近い・切れた」公開求人を検知し、
//   - expires_at を延長（既定 +30日）
//   - updated_at を現在時刻に更新
//   - （既定）kyujinbox_posted_at をクリアして再掲載キューに戻す
//       → 次の投稿で再掲載され、求人ボックス上の表示が復活する
// を自動で行う。事実（本文・給与など）は一切変更しない。
const { db, now } = require('../db');

const isoFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();
const isoAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const isKbTarget = (tm) => { try { return JSON.parse(tm || '[]').some(m => /求人ボックス|kyujinbox/.test(m)); } catch { return false; } };

// 古い/期限切れ間近の公開求人を検知（company 指定可・古い順）
function findStaleJobs(opts = {}) {
  const staleDays = Number.isFinite(opts.staleDays) ? opts.staleDays : Number(process.env.REFRESH_STALE_DAYS || 14);
  const expireSoonDays = Number.isFinite(opts.expireSoonDays) ? opts.expireSoonDays : Number(process.env.REFRESH_EXPIRE_SOON_DAYS || 7);
  const limit = Number.isFinite(opts.limit) ? opts.limit : Number(process.env.REFRESH_LIMIT || 200);
  const company = opts.company && opts.company !== 'all' ? opts.company : null;

  const staleCut = isoAgo(staleDays);       // これより前に更新された = 古い
  const expSoonCut = isoFromNow(expireSoonDays); // これより前に期限切れ = まもなく/既に切れ

  const rows = company
    ? db.prepare(`SELECT id,title,company,updated_at,expires_at,kyujinbox_posted_at,target_media
                  FROM jobs WHERE is_published=1 AND company=? ORDER BY updated_at ASC`).all(company)
    : db.prepare(`SELECT id,title,company,updated_at,expires_at,kyujinbox_posted_at,target_media
                  FROM jobs WHERE is_published=1 ORDER BY updated_at ASC`).all();

  const out = [];
  for (const j of rows) {
    if (!isKbTarget(j.target_media)) continue;
    const isStale = (j.updated_at || '') < staleCut;
    const isExpiring = !!j.expires_at && j.expires_at < expSoonCut;
    if (isStale || isExpiring) {
      out.push({ id: j.id, title: j.title, company: j.company,
                 reason: isExpiring ? '有効期限切れ間近/切れ' : '更新が古い' });
      if (out.length >= limit) break;
    }
  }
  return out;
}

// 検知した古い求人をリフレッシュ。requeue=true で再掲載キューに戻す。
function refreshStaleJobs(opts = {}) {
  const requeue = opts.requeue !== false && String(process.env.REFRESH_REQUEUE || 'true') !== 'false';
  const extendDays = Number.isFinite(opts.extendDays) ? opts.extendDays : Number(process.env.REFRESH_EXTEND_DAYS || 30);
  const jobs = findStaleJobs(opts);
  const ts = now();
  const newExpire = isoFromNow(extendDays);
  const sql = `UPDATE jobs SET expires_at=?, updated_at=?${requeue ? ', kyujinbox_posted_at=NULL' : ''} WHERE id=?`;
  const upd = db.prepare(sql);
  let refreshed = 0;
  for (const j of jobs) { upd.run(newExpire, ts, j.id); refreshed++; }
  return { refreshed, requeued: requeue ? refreshed : 0, jobs };
}

module.exports = { findStaleJobs, refreshStaleJobs };
