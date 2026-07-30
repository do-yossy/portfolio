'use strict';
/*
 * 過去応募者を「架電リスト（アクティブ）」に確実に載せる（富岡 祐一 / 求職者ID 117124）
 * ------------------------------------------------------------------------------
 * 対応内容:
 *   - 媒体は「シニアジョブ」(seniorjob) に設定 → 架電リストのシニアジョブタブに表示。
 *     ※採用決定費・求職者IDがある＝紹介経由のため。別媒体なら MEDIA 環境変数で上書き可
 *       例: MEDIA=indeed node --experimental-sqlite scripts/add-applicant-tomioka.js
 *   - 既存レコード（過去応募でアーカイブ済み・重複含む）があれば新規追加せず、
 *     それをアクティブ架電リストへ復帰（is_archived=0 / status=新規 / 重複解除）。
 *   - 応募日を本日(現在時刻)に設定し「本日の新規応募（新規応募タブ）」にも計上。
 *   - 本スクリプトが以前作った暫定レコード（媒体google・電話空）が別にあれば掃除。
 *   - 何も無ければ新規作成。
 *   - 冪等: 何度実行しても最終状態は「アクティブ架電リストに1件（シニアジョブ）・本日応募」。
 *
 * 実行: node --experimental-sqlite scripts/add-applicant-tomioka.js
 */
const { db, Applicants, Ops } = require('../db');

let finalPhone = '';
const NAME = '富岡 祐一';
const SEEKER_ID = '117124';
const MEDIA = (process.env.MEDIA || 'seniorjob').trim();
const NAME_COMPACT = NAME.replace(/[\s　]/g, '');
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const APPLIED_AT = now();                 // 本日応募として計上（applied_at >= JST当日開始）
const APPLIED_MONTH = APPLIED_AT.slice(0, 7);

const noteLines = [
  `求職者ID:${SEEKER_ID} / 採用決定費:8万円(税別)`,
  `保有資格:8トン限定中型自動車免許、危険物取扱者(乙種)、普通自動車免許(保有)`,
  `希望職種:タクシードライバー、運送ドライバー(中・長距離)、トレーラー(牽引)ドライバー、ダンプドライバー、役員運転手、送迎ドライバー、収集運搬ドライバー、回送ドライバー、新聞配達・集金、バス運転手・バス乗務員、電車運転士・車掌・機関士・航海士、構内倉庫作業・倉庫管理、運行管理、運送現場作業員、セールスドライバー・配送・宅配`,
  `希望勤務地:大阪府(大阪市各区・堺市ほか府内全域)`,
  `経歴:お弁当の浜の家 営業(2019年〜2025年)`,
];
const NOTES = noteLines.join('\n');

// 氏名（空白無視）一致 or 求職者IDメモ一致の既存レコードを全部拾う
const matches = db
  .prepare(
    `SELECT * FROM applicants
      WHERE REPLACE(REPLACE(name,' ',''),'　','') = ? OR notes LIKE ?`
  )
  .all(NAME_COMPACT, `%求職者ID:${SEEKER_ID}%`);

function fillAndActivate(rec) {
  // 空フィールドのみ補完（既存の正しい値は壊さない）
  Ops.fillMissingFields(rec.id, {
    age: 59,
    gender: '男性',
    address: rec.address && rec.address.trim() ? undefined : '〒591-8002 大阪府堺市北区北花田町',
    experience: rec.experience && rec.experience.trim() ? undefined : '営業（お弁当の浜の家 / 2019年〜2025年）',
  });
  // メモに求職者ID等が無ければ追記
  let notes = rec.notes || '';
  if (!notes.includes(`求職者ID:${SEEKER_ID}`)) {
    notes = notes ? `${notes}\n${NOTES}` : NOTES;
  }
  // アクティブ架電リストへ復帰（媒体もシニアジョブへ）＋本日の新規応募として計上
  db.prepare(
    `UPDATE applicants
        SET media = ?, status = '新規', is_archived = 0, is_imported = 0,
            is_duplicate = 0, duplicate_of_id = NULL,
            applied_at = ?, applied_month = ?,
            work_location = CASE WHEN (work_location IS NULL OR work_location='') THEN ? ELSE work_location END,
            notes = ?, updated_at = ?
      WHERE id = ?`
  ).run(MEDIA, APPLIED_AT, APPLIED_MONTH, '大阪府（大阪市各区・堺市ほか府内全域）', notes, now(), rec.id);
}

if (matches.length) {
  // 電話番号を持つレコードを優先して「本命」に。無ければ先頭。
  const withPhone = matches.filter((r) => (r.phone || '').trim());
  const primary = withPhone[0] || matches[0];
  fillAndActivate(primary);

  // 本スクリプトが以前作った暫定レコード（求職者IDメモ有り・電話空・本命以外）は掃除
  let removed = 0;
  for (const r of matches) {
    if (r.id === primary.id) continue;
    const isMyStub = (r.notes || '').includes(`求職者ID:${SEEKER_ID}`) && !(r.phone || '').trim();
    if (isMyStub) {
      db.prepare(`DELETE FROM applicants WHERE id = ?`).run(r.id);
      removed++;
    }
  }
  const p = Applicants.findById(primary.id);
  finalPhone = p.phone || '';
  console.log(`✅ 架電リスト（媒体:${MEDIA}）に復帰させました: ${p.name}（ID:${p.id}）`);
  console.log(`   status=${p.status} / is_archived=${p.is_archived} / 電話=${p.phone || '(未登録)'}`);
  if (removed) console.log(`   🧹 重複していた暫定レコードを${removed}件削除しました`);
  if (matches.length - removed > 1) {
    console.log(`   ⚠️ 同名レコードが他にも残っています（自動作成分でないため保持）。掲載管理でご確認ください。`);
  }
} else {
  const created = Applicants.create({
    name: NAME,
    furigana: '',
    phone: '',
    email: '',
    age: 59,
    gender: '男性',
    address: '〒591-8002 大阪府堺市北区北花田町',
    experience: '営業（お弁当の浜の家 / 2019年〜2025年）',
    workLocation: '大阪府（大阪市各区・堺市ほか府内全域）',
    sourceMedia: 'シニアジョブ',
    media: MEDIA,
    status: '新規',
    isImported: 0,
    isArchived: 0,
    appliedAt: APPLIED_AT,        // 本日の新規応募として計上
    notes: NOTES,
  });
  console.log(`✅ 架電リスト（媒体:${MEDIA}）に新規追加しました: ${created.name}（ID:${created.id}）`);
}

if (!MEDIA || MEDIA === 'seniorjob') {
  console.log(`   → 架電リスト「会社:SQ / 媒体:シニアジョブ」タブ、および新規応募タブ(本日)でご確認ください。`);
}
if (!finalPhone.trim()) {
  console.log(`   ⚠️ 電話番号が情報にありません。架電前に掲載管理から電話番号を入力してください。`);
}
