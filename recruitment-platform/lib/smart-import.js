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
async function smartImport({ sheets, deps, defaultCompany = 'sq', splitByCallCount = false }) {
  const { mapOpsCSVRow, normalizePhone, normalizeEmail, Applicants, Logs } = deps;
  const summary = {};   // "会社/媒体" → { imported, duplicates }
  const skippedSheets = [];
  let imported = 0, duplicates = 0, skipped = 0, headerRows = 0;
  let toCallList = 0, toPast = 0;   // 振り分け結果（架電リスト / 過去リスト）

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
      // 振り分け: 架電回数で分ける場合は「未架電(0)→架電リスト / 架電済み(≥1)→過去リスト」。
      // それ以外は全件を過去リスト（アーカイブ）として取り込む。
      const callCount = parseInt(mapped.callCount || 0) || 0;
      const archived = splitByCallCount ? (callCount >= 1 ? 1 : 0) : 1;

      const dupId = await Applicants.findDuplicate(nPhone, nEmail);
      if (dupId) {
        // 重複は架電リストに出さず必ずアーカイブ＋重複フラグで記録
        await Applicants.create({ ...mapped, allowEmptyDate: true, isArchived: 1, isDuplicate: 1, duplicateOfId: dupId, status: '重複' });
        duplicates++; bump(currentCompany, media, 'duplicates');
      } else {
        await Applicants.create({ ...mapped, allowEmptyDate: true, isArchived: archived });
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
