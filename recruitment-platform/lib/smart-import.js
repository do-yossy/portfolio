'use strict';

// ─────────────────────────────────────────────────────────────
// スマート一括取込
//   1ファイルに全会社・全媒体が混在したExcelを取り込む。
//   - シート名 → 媒体 を自動判定（indeed / engage / 求人ボックス 等）
//   - シート内の「会社見出し行」（電話・メール空＋会社名キーワード）で
//     以降の応募者をその会社に割り当てる
//   - 見出し行・日付区切り行はスキップ
// ─────────────────────────────────────────────────────────────

// シート名 → 媒体ID
function mediaFromSheetName(name) {
  const n = String(name || '').toLowerCase().replace(/\s/g, '');
  if (n.includes('indeed')) return 'indeed';
  if (n.includes('engage')) return 'engage';
  if (n.includes('求人ボックス') || n.includes('kyujinbox') || n.includes('job-box') || n.includes('jobbox')) return 'kyujinbox';
  if (n.includes('スタンバイ') || n.includes('stanby') || n.includes('standby')) return 'stanby';
  if (n.includes('google') || n.includes('しごと')) return 'google';
  return null; // 不明
}

// 見出し行の文字列 → 会社ID（含まれる会社キーワードで判定）
function companyFromHeaderText(text) {
  const t = String(text || '');
  if (/ピープル|people/i.test(t)) return 'pe';
  if (/ライフテイラー|ライフテーラー|lifetaylor|life ?taylor/i.test(t)) return 'lt';
  if (/socialquality|social ?quality|ソーシャルクオリティ|ソーシャル ?クオリティ|ソーシャル|(^|[^A-Za-z])SQ([^A-Za-z]|$)/i.test(t)) return 'sq';
  if (/bigeyes|big ?eyes|ビッグアイズ|ビックアイズ|ビッグアイ|ビックアイ/i.test(t)) return 'bg';
  if (/[二ニ] ?クール|nicol/i.test(t)) return 'nc';
  if (/ネクサス|nexus/i.test(t)) return 'nx';
  return null;
}

// 行から「氏名相当」の値を取り出す（会社見出し検出用）
function rowNameText(row) {
  const sei = (row['氏名（姓）'] || '').trim();
  const mei = (row['氏名（名）'] || '').trim();
  const single = (row['名前'] || row['氏名'] || row['お名前'] || '').trim();
  return (sei + mei + single).trim();
}

// 連絡先を持つか（応募者行かどうかの判定）
function hasContact(row) {
  const phone = (row['電話番号'] || row['電話'] || row['携帯'] || '').trim();
  const email = (row['メールアドレス'] || row['メール'] || row['email'] || '').trim();
  return !!(phone || email);
}

// メイン: parseXlsxSheets の結果を受け取り、会社・媒体を割り当てて取り込む。
//   deps: { mapOpsCSVRow, normalizePhone, normalizeEmail, Applicants, Logs }
async function smartImport({ sheets, deps, defaultCompany = 'sq', splitByCallCount = false, countAsNew = false }) {
  const { mapOpsCSVRow, normalizePhone, normalizeEmail, Applicants, Ops, Logs } = deps;
  const summary = {};   // "会社/媒体" → { imported, duplicates }
  const skippedSheets = [];
  let imported = 0, duplicates = 0, skipped = 0, headerRows = 0;
  let toCallList = 0, toPast = 0;   // 振り分け結果（架電リスト / 過去リスト）
  const today = new Date().toISOString().slice(0, 10);   // 新着計上時の応募日

  const bump = (co, media, key) => {
    const k = `${co}/${media}`;
    if (!summary[k]) summary[k] = { imported: 0, duplicates: 0 };
    summary[k][key]++;
  };

  for (const sheet of sheets) {
    const media = mediaFromSheetName(sheet.name);
    if (!media) { skippedSheets.push(sheet.name); continue; }

    let currentCompany = defaultCompany;
    for (const row of sheet.records) {
      // 会社見出し / 日付区切り行（連絡先なし）を検出
      if (!hasContact(row)) {
        const nameText = rowNameText(row);
        const co = companyFromHeaderText(nameText);
        if (co) currentCompany = co;     // 会社見出し → 以降の所属を切り替え
        headerRows++;
        continue;                        // 見出し・空行は取り込まない
      }

      const mapped = mapOpsCSVRow(row, currentCompany, media);
      if (!mapped.name || (!mapped.phone && !mapped.email)) { skipped++; continue; }

      const nPhone = normalizePhone(mapped.phone);
      const nEmail = normalizeEmail(mapped.email);
      // 振り分け先(アーカイブ)の決定:
      //  - 架電回数で分ける場合: 未架電(0)→架電リスト / 架電済み(≥1)→過去リスト
      //  - 本日の新着として計上(countAsNew): 全件 架電リスト
      //  - それ以外(過去バックログ): 全件 過去リスト（アーカイブ）
      const callCount = parseInt(mapped.callCount || 0) || 0;
      // 終了・対応中・不通ステータスは取込モードに関わらず過去リストへ
      const PAST_STATUSES = ['終了', '対応中', '架電済(不通)', '不通'];
      const forcePast = PAST_STATUSES.includes(mapped.status || '');
      const archived = forcePast ? 1 : (splitByCallCount ? (callCount >= 1 ? 1 : 0) : (countAsNew ? 0 : 1));
      // 新着計上時は新規応募にカウント(is_imported=0)し、応募日を本日に設定して
      // 「本日の新規応募」に確実に反映させる。過去バックログ時はカウントせず(is_imported=1)、
      // 応募日が空ならそのまま空に保持する。
      const importedFlag = countAsNew ? 0 : 1;
      const newFields = countAsNew
        ? { isImported: 0, appliedAt: today }
        : { isImported: 1, allowEmptyDate: true };

      const dupId = await Applicants.findDuplicate(nPhone, nEmail);
      if (dupId && countAsNew && Applicants.promoteToNew) {
        // 新着モードで既存（先に取込済みのバックログ等）が見つかった場合は、
        // 重複にせず「本日の新着」へ昇格して新規応募に計上する。
        await Applicants.promoteToNew(dupId, today);
        imported++; toCallList++; bump(currentCompany, media, 'imported');
      } else if (dupId) {
        // 重複は架電リストに出さず必ずアーカイブ＋重複フラグで記録（新着でも計上しない）
        await Applicants.create({ ...mapped, isImported: 1, allowEmptyDate: true, isArchived: 1, isDuplicate: 1, duplicateOfId: dupId, status: '重複' });
        duplicates++; bump(currentCompany, media, 'duplicates');
      } else {
        await Applicants.create({ ...mapped, ...newFields, isArchived: archived });
        imported++; bump(currentCompany, media, 'imported');
        if (archived) toPast++; else toCallList++;
      }
    }
  }

  if (Logs) {
    const detail = Object.entries(summary).map(([k, v]) => `${k}:${v.imported}件`).join(' / ');
    await Logs.create('ops_smart_import', 'success',
      `スマート取込 ${imported}件（重複${duplicates}件）${detail ? ' ' + detail : ''}` +
      (skippedSheets.length ? ` ※媒体不明でスキップ:${skippedSheets.join(',')}` : ''));
  }

  return { imported, duplicates, skipped, headerRows, summary, skippedSheets, toCallList, toPast };
}

module.exports = { smartImport, mediaFromSheetName, companyFromHeaderText };
