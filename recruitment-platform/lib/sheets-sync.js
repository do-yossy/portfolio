'use strict';

// ─────────────────────────────────────────────────────────────
// 共有スプレッドシート同期ロジック（依存は引数で注入＝テスト可能）
//   pushToSheets: DB → スプレッドシート（会社ごとタブ・新規分のみ追記）
//   pullFromSheets: スプレッドシート → DB（IDで突合し対応状況等を更新）
// ─────────────────────────────────────────────────────────────

// 架電リスト用の列定義（先頭にIDを置き、行を一意に突合する結合キーにする）
const SHEET_HEADERS = ['ID', '媒体', '名前', '電話番号', 'メールアドレス', '性別', '生年月日', '年齢', '居住地', '現在の職業', '求人タイトル', '経験', '学歴', '勤務地', '応募日', '架電回数', '対応状況', '最終架電日', '重複', 'メモ'];
const SHEET_COL = { id: 0, callCount: 15, status: 16, notes: 19 };

function applicantToSheetRow(a, mediaLabel) {
  return [
    a.id, mediaLabel(a.media), a.name || '', a.phone || '', a.email || '',
    a.gender || '', a.birth_date || '', a.age || '', a.address || '',
    a.current_job || '', a.job_title || '', a.experience || '', a.education || '', a.work_location || '',
    (a.applied_at || '').slice(0, 10),
    String(a.call_count || 0), a.status || '', (a.last_called_at || '').slice(0, 10),
    a.is_duplicate ? '重複' : '', (a.notes || '').replace(/[\r\n]+/g, ' '),
  ].map(v => v == null ? '' : String(v));
}

// DB → スプレッドシート（会社ごとタブ。重複を除き、未登録IDのみ追記）
async function pushToSheets({ gsheets, Ops, Logs, companies, statuses, mediaList }) {
  const mediaLabel = id => { const m = mediaList.find(x => x.id === id); return m ? m.name : (id || '不明'); };
  let count = 0, tabs = 0;
  const warnings = [];
  for (const co of companies) {
    const list = (await Ops.listCalls({ company: co.id })).filter(a => !a.is_duplicate);
    const title = co.short || co.name || co.id;
    const props = await gsheets.ensureTab(title);

    // 既存シートから手入力済みの架電結果（ID→{callCount,status,notes}）を退避し、
    // 組み直しても記入内容を失わないようにする。
    const existing = await gsheets.readValues(title);
    const prior = new Map();
    for (const row of existing.slice(1)) {
      const id = row[SHEET_COL.id];
      if (id) prior.set(id, { callCount: row[SHEET_COL.callCount], status: row[SHEET_COL.status], notes: row[SHEET_COL.notes] });
    }

    // 媒体ごとにグルーピング（未知の媒体は「その他」へ）
    const groups = new Map();
    for (const a of list) {
      const key = mediaList.some(m => m.id === a.media) ? a.media : '__other__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }

    // レイアウト再構築: ヘッダ → [媒体見出し → 応募者行] × 媒体
    const rows = [SHEET_HEADERS.slice()];
    const sectionRowIdx = [];
    const order = [...mediaList.map(m => m.id), '__other__'];
    for (const key of order) {
      const grp = groups.get(key);
      if (!grp || !grp.length) continue;
      const label = key === '__other__' ? 'その他・媒体未設定' : mediaLabel(key);
      const sec = new Array(SHEET_HEADERS.length).fill('');
      sec[1] = `▼ ${label}（${grp.length}件）`;   // 見出しはID列(A)を空にして取込でスキップさせる
      sectionRowIdx.push(rows.length);               // 0始まりの行インデックス
      rows.push(sec);
      for (const a of grp) {
        const row = applicantToSheetRow(a, mediaLabel);
        const p = prior.get(a.id);                   // 手入力済みの架電結果を優先（取込前の編集を保持）
        if (p) {
          if (p.callCount !== undefined && p.callCount !== '') row[SHEET_COL.callCount] = String(p.callCount);
          if (p.status) row[SHEET_COL.status] = p.status;
          if (p.notes !== undefined && p.notes !== '') row[SHEET_COL.notes] = p.notes;
        }
        rows.push(row);
        count++;
      }
    }

    await gsheets.writeValues(title, rows);

    // 書式・プルダウンは毎回（冪等）適用。失敗してもデータ反映は止めず警告に。
    try {
      await gsheets.styleHeader(props.sheetId, SHEET_HEADERS.length);
      await gsheets.setDropdowns(props.sheetId, [
        { colIndex: SHEET_COL.callCount, list: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
        { colIndex: SHEET_COL.status, list: statuses },
      ]);
      if (sectionRowIdx.length && gsheets.styleSectionRows) {
        await gsheets.styleSectionRows(props.sheetId, sectionRowIdx, SHEET_HEADERS.length);
      }
    } catch (e) {
      warnings.push(`${title}: 書式/プルダウン設定に失敗 (${e.message || e})`);
    }
    tabs++;
  }
  if (Logs) await Logs.create('sheets_push', 'success',
    `${count}件を共有スプレッドシートに反映（${tabs}タブ・媒体別）` + (warnings.length ? ` ※${warnings.join(' / ')}` : ''));
  return { count, appended: count, tabs, warnings };
}

// スプレッドシート → DB（IDで突合し対応状況・架電回数・メモを更新）
async function pullFromSheets({ gsheets, Ops, Applicants, Logs }) {
  let updated = 0, notFound = 0, scanned = 0;
  const meta = await gsheets.getMeta();
  for (const sh of (meta.sheets || [])) {
    const title = sh.properties.title;
    const values = await gsheets.readValues(title);
    if (values.length < 2) continue;
    for (const row of values.slice(1)) {
      const id = row[SHEET_COL.id];
      if (!id) continue;
      scanned++;
      const existing = await Applicants.findById(id);
      if (!existing) { notFound++; continue; }
      const ccRaw = row[SHEET_COL.callCount];
      await Ops.updateCall(id, {
        callCount: (ccRaw !== undefined && ccRaw !== '') ? (parseInt(ccRaw) || 0) : undefined,
        status: row[SHEET_COL.status] || undefined,
        notes: row[SHEET_COL.notes] !== undefined ? row[SHEET_COL.notes] : undefined,
      });
      updated++;
    }
  }
  if (Logs) await Logs.create('sheets_pull', 'success', `${updated}件をスプレッドシートから更新（${notFound}件該当なし）`);
  return { updated, notFound, scanned };
}

module.exports = { SHEET_HEADERS, SHEET_COL, applicantToSheetRow, pushToSheets, pullFromSheets };
