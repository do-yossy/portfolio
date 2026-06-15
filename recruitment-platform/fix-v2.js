'use strict';
// 全修正スクリプト v2: タイトル復元 + 駅フレーズ削除 + 勤務地クリーン
// 使い方: node --experimental-sqlite fix-v2.js

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, 'data', 'recruitment.db');

const db = new DatabaseSync(DB_PATH);

// ── 正しいタイトル（content識別 + job_type両方に対応） ──
const FULL_TITLES = {
  'ITエンジニア（システム開発）': 'ITエンジニア（システム開発）／＜月給30万円〜50万円＞未経験・第二新卒歓迎・完全週休2日制（土日）★',
  'ITエンジニア':                 'ITエンジニア（システム開発）／＜月給30万円〜50万円＞未経験・第二新卒歓迎・完全週休2日制（土日）★',
  'IT':                           'ITエンジニア（システム開発）／＜月給30万円〜50万円＞未経験・第二新卒歓迎・完全週休2日制（土日）★',
  'グラフィックデザイナー':       'グラフィックデザイナー（AD兼務）／＜月給30万円〜37万円＞完全週休2日制（土日）・年間休日120日以上・転勤なし★',
  'DM制作ディレクター':           'DM制作ディレクター（進行管理）／＜月給24.2万円〜28万円＞ディレクション未経験OK・完全週休2日制（土日）・年間休日127日★',
  'コスメ製造':                   'コスメ製造スタッフ／＜月給25万円〜32万円＞新事業オープニングメンバー募集・未経験歓迎・完全週休2日制（土日休み）★',
  'コスメ製造スタッフ':           'コスメ製造スタッフ／＜月給25万円〜32万円＞新事業オープニングメンバー募集・未経験歓迎・完全週休2日制（土日休み）★',
  'ロケ同行ドライバー':           'ロケ同行ドライバー／＜月給39万円〜45万円＞未経験歓迎・完全週休2日制・年間休日120日以上★',
  'EC倉庫配送ドライバー':         'EC倉庫配送ドライバー／＜月収41万円以上＞未経験歓迎・車両費用完全会社負担・完全週休2日制★',
  '夜勤配送ドライバー':           '夜勤配送ドライバー（倉庫業務あり）／＜月給40万円〜44万円＞夜勤専属で高収入・未経験歓迎・完全週休2日制★',
  '宅配便配送ドライバー':         '宅配便配送ドライバー／＜月給42万円〜77万円＞オープニングメンバー募集・未経験歓迎・完全週休2日制★',
  '送迎ドライバー':               'ロケ同行ドライバー／＜月給39万円〜45万円＞未経験歓迎・完全週休2日制・年間休日120日以上★',
};

// contentからどの求人か識別
function detectFromContent(catchcopy, description) {
  const text = (catchcopy || '') + (description || '');
  if (text.includes('鴫野')) return 'EC倉庫配送ドライバー';
  if (text.includes('ロケ') || text.includes('撮影')) return 'ロケ同行ドライバー';
  if (text.includes('夜勤') || text.includes('倉庫業務')) return '夜勤配送ドライバー';
  if (text.includes('宅配便') || text.includes('ヤマト') || text.includes('佐川')) return '宅配便配送ドライバー';
  if (text.includes('梅田') && text.includes('システム')) return 'ITエンジニア';
  if (text.includes('コスメ') || text.includes('化粧品')) return 'コスメ製造';
  return null;
}

// タイトル・キャッチコピーから駅フレーズを除去（行削除なし・インラインのみ）
function cleanInline(text) {
  if (!text) return text;
  let t = text;
  t = t.replace(/[・・]?[^\s　！!（(【「\n]*[駅]\s*(すぐ|徒歩\s*[\d〜～]*\s*分?(以内|圏内)?|徒歩圏内)[^\n★・・]*/g, '');
  t = t.replace(/[・・]?リモートワーク制度あり[^。\n★・・]*/g, '');
  t = t.replace(/[・・]+★/, '★');
  t = t.replace(/[・・\s]+$/, '');
  return t.trim();
}

// 説明文から駅アクセス行・勤務地行を削除
function cleanDescription(text) {
  if (!text) return text;
  let t = text;
  t = t.replace(/^[^\n]*[駅][^\n]*(すぐ|徒歩|圏内)[^\n]*$/gm, '');
  t = t.replace(/^[^\n]*リモートワーク制度あり[^\n]*$/gm, '');
  t = t.replace(/^◆[^\n]*$(  )?/gm, '');
  t = t.replace(/^[・✔✓•※◇▶]\s*$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

// 対象の「自社主力求人」か判定（タイトルまたはjob_typeで識別）
const MAIN_JOB_KEYS = Object.keys(FULL_TITLES);
function isMainJob(job) {
  return MAIN_JOB_KEYS.some(k => (job.job_type || '').includes(k) || (job.title || '').includes(k))
    || (job.job_type || '') === 'IT'
    || (job.job_type || '') === '配送ドライバー'
    || (job.job_type || '') === '送迎ドライバー';
}

const jobs = db.prepare('SELECT id, job_type, title, catchcopy, description, location FROM jobs').all();
let fixed = 0;

for (const job of jobs) {
  if (!isMainJob(job)) continue;

  let newTitle = job.title || '';
  let newCatch = job.catchcopy || '';
  let newDesc  = job.description || '';
  let newLoc   = job.location || '';

  // ── タイトル復元 ──
  const isShort = !newTitle || newTitle.trim() === (job.job_type || '').trim()
    || newTitle.trim().length < 10;
  if (isShort) {
    const fromType    = FULL_TITLES[job.job_type] || FULL_TITLES[newTitle.trim()];
    const fromContent = !fromType ? FULL_TITLES[detectFromContent(newCatch, newDesc)] : null;
    newTitle = fromType || fromContent || newTitle;
  }

  // ── タイトル・キャッチのインライン駅フレーズ削除 ──
  newTitle = cleanInline(newTitle);
  newCatch = cleanInline(newCatch);

  // ── 説明文の駅アクセス行を削除 ──
  newDesc = cleanDescription(newDesc);

  // ── 勤務地フィールドを「複数拠点（選択制）」に統一 ──
  if (newLoc && newLoc !== '複数拠点（選択制）' && newLoc !== '複数拠点（選択制・車通勤可）') {
    newLoc = '複数拠点（選択制）';
  }

  const changed = newTitle !== (job.title || '')
    || newCatch !== (job.catchcopy || '')
    || newDesc  !== (job.description || '')
    || newLoc   !== (job.location || '');

  if (!changed) { console.log(`- スキップ: ${newTitle.slice(0,30)}`); continue; }

  db.prepare('UPDATE jobs SET title=?, catchcopy=?, description=?, location=?, updated_at=? WHERE id=?')
    .run(newTitle, newCatch, newDesc, newLoc, new Date().toISOString(), job.id);

  if (newTitle !== (job.title || '')) console.log(`  タイトル: "${job.title}" → "${newTitle.slice(0,40)}"`);
  console.log(`✓ 更新: ${newTitle.slice(0,40)}`);
  fixed++;
}

console.log(`\n完了: ${fixed}件更新`);
