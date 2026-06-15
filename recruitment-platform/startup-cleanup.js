'use strict';
// 起動時データクリーンアップ（冪等・安全）
// - 主力求人のタイトル復元
// - 駅アクセス系フレーズの削除（タイトル・キャッチ・説明・タグ）
// - 勤務地住所の簡略化
// すべて「変更がある場合のみ」UPDATE。タイトルを空にすることは絶対にしない。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// 主力（自社）求人の正式タイトル
const FULL_TITLES = {
  'ITエンジニア':         'ITエンジニア（システム開発）／＜月給30万円〜50万円＞未経験・第二新卒歓迎・完全週休2日制（土日）★',
  'IT':                   'ITエンジニア（システム開発）／＜月給30万円〜50万円＞未経験・第二新卒歓迎・完全週休2日制（土日）★',
  'グラフィックデザイナー': 'グラフィックデザイナー（AD兼務）／＜月給30万円〜37万円＞完全週休2日制（土日）・年間休日120日以上・転勤なし★',
  'DM制作ディレクター':   'DM制作ディレクター（進行管理）／＜月給24.2万円〜28万円＞ディレクション未経験OK・完全週休2日制（土日）・年間休日127日★',
  'コスメ製造':           'コスメ製造スタッフ／＜月給25万円〜32万円＞新事業オープニングメンバー募集・未経験歓迎・完全週休2日制（土日休み）★',
  'ロケ同行ドライバー':   'ロケ同行ドライバー／＜月給39万円〜45万円＞未経験歓迎・完全週休2日制・年間休日120日以上★',
  '送迎ドライバー':       'ロケ同行ドライバー／＜月給39万円〜45万円＞未経験歓迎・完全週休2日制・年間休日120日以上★',
  'EC倉庫配送ドライバー': 'EC倉庫配送ドライバー／＜月収41万円以上＞未経験歓迎・車両費用完全会社負担・完全週休2日制★',
  '夜勤配送ドライバー':   '夜勤配送ドライバー（倉庫業務あり）／＜月給40万円〜44万円＞夜勤専属で高収入・未経験歓迎・完全週休2日制★',
  '宅配便配送ドライバー': '宅配便配送ドライバー／＜月給42万円〜77万円＞オープニングメンバー募集・未経験歓迎・完全週休2日制★',
};

// 説明文・キャッチの内容からどの主力求人か推定（タイトルが壊れている場合の保険）
function detectKey(title, catchcopy, description) {
  const text = (title || '') + (catchcopy || '') + (description || '');
  if (text.includes('鴫野') || (text.includes('EC') && text.includes('倉庫'))) return 'EC倉庫配送ドライバー';
  if (text.includes('ロケ') || text.includes('撮影')) return 'ロケ同行ドライバー';
  if (text.includes('夜勤') && text.includes('配送')) return '夜勤配送ドライバー';
  if (text.includes('宅配便')) return '宅配便配送ドライバー';
  if (text.includes('システム開発') && text.includes('エンジニア')) return 'ITエンジニア';
  if (text.includes('グラフィックデザイナー')) return 'グラフィックデザイナー';
  if (text.includes('DM制作')) return 'DM制作ディレクター';
  if (text.includes('コスメ')) return 'コスメ製造';
  return null;
}

// 駅アクセス・リモート系の判定（タグ・行で使う）
const STATION_RE = /鴫野|梅田駅|新宿駅|駅\s*(すぐ|徒歩|圏内)|徒歩\s*[\d〜～]*\s*分|徒歩圏内|リモートワーク/;

// インライン除去（タイトル・キャッチ用）
// 駅・リモート系フレーズを行内から除去し、結果として空になった行は削除する。
function cleanInline(text) {
  if (!text) return text;
  let t = text;
  t = t.replace(/[・・]?[^\s　！!（(【「\n]*[駅]\s*(すぐ|徒歩\s*[\d〜～]*\s*分?(以内|圏内)?|徒歩圏内)[^\n★・・]*/g, '');
  t = t.replace(/[・・]?リモートワーク[^。\n★・・]*/g, '');
  t = t.replace(/[・・]+★/g, '★');
  // 行ごとに整形：先頭の残骸記号を整え、空行（記号だけ含む行）を除去
  const lines = t.split('\n')
    .map(l => l.replace(/[・・\s]+$/, '').trimEnd())
    .filter(l => l.trim() !== '' && !/^[・✔✓•※◇▶\s]+$/.test(l));
  return lines.join('\n').trim();
}

// 説明文の駅アクセス行を削除
function cleanDescription(text) {
  if (!text) return text;
  let t = text;
  t = t.replace(/^[^\n]*[駅][^\n]*(すぐ|徒歩|圏内)[^\n]*$/gm, '');
  t = t.replace(/^[^\n]*リモートワーク[^\n]*$/gm, '');
  t = t.replace(/^◆[^\n]*[駅][^\n]*$/gm, '');
  t = t.replace(/^[・✔✓•※◇▶]\s*$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

function runCleanup(dbPath) {
  const db = new DatabaseSync(dbPath);
  let cols;
  try { cols = db.prepare('PRAGMA table_info(jobs)').all().map(c => c.name); }
  catch { return 0; }
  const hasTags = cols.includes('tags');

  const jobs = db.prepare('SELECT * FROM jobs').all();
  let changed = 0;

  for (const job of jobs) {
    let newTitle = job.title || '';
    let newCatch = job.catchcopy || '';
    let newDesc  = job.description || '';
    let newTags  = job.tags;

    // 主力（自社）求人の判定：
    //  (A) タイトルが訴求フォーマット「…／＜…＞…★」になっている、または
    //  (B) タイトルが壊れている（職種名そのまま／極端に短い）
    // のいずれか。媒体用求人（【県市】…｜… 形式）は対象外にする。
    const t = (job.title || '').trim();
    const isAppealFormat = /／＜[^＞]*＞.*★$/.test(t);
    const isBrokenTitle = !t
      || t.length < 12
      || t === (job.job_type || '').trim()
      || (STATION_RE.test(t) && t.includes('★'));
    const isMediaFormat = /^【.+】.+｜/.test(t); // 媒体用フォーマットは除外

    const isMain = !isMediaFormat && (isAppealFormat || isBrokenTitle);

    if (isMain) {
      // 壊れている場合は内容から正式タイトルを復元
      const key = FULL_TITLES[job.job_type] ? job.job_type
        : (FULL_TITLES[t] ? t
        : detectKey(job.title, job.catchcopy, job.description));
      if (isBrokenTitle && key && FULL_TITLES[key]) newTitle = FULL_TITLES[key];

      // タイトル・キャッチのインライン駅フレーズ除去
      newTitle = cleanInline(newTitle) || (key && FULL_TITLES[key]) || job.title;
      newCatch = cleanInline(newCatch);
      // 説明文の駅アクセス行除去
      newDesc = cleanDescription(newDesc);

      // タグから駅アクセス系を除去
      if (hasTags) {
        let arr = [];
        try { arr = JSON.parse(job.tags || '[]'); } catch { arr = []; }
        const filtered = arr.filter(t => !STATION_RE.test(String(t)));
        if (filtered.length !== arr.length) newTags = JSON.stringify(filtered);
      }
    }

    const titleChanged = newTitle !== (job.title || '');
    const catchChanged = newCatch !== (job.catchcopy || '');
    const descChanged  = newDesc  !== (job.description || '');
    const tagsChanged  = hasTags && newTags !== job.tags;

    if (!titleChanged && !catchChanged && !descChanged && !tagsChanged) continue;

    // 安全装置：タイトルを空にしない
    if (!newTitle) newTitle = job.title;

    const sets = ['title=?', 'catchcopy=?', 'description=?'];
    const vals = [newTitle, newCatch, newDesc];
    if (hasTags) { sets.push('tags=?'); vals.push(newTags); }
    sets.push('updated_at=?'); vals.push(new Date().toISOString());
    vals.push(job.id);

    db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id=?`).run(...vals);
    changed++;
  }

  return changed;
}

module.exports = { runCleanup };
