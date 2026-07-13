'use strict';

// ─────────────────────────────────────────────────────────────
// 共有スプレッドシート同期ロジック（依存は引数で注入＝テスト可能）
//   pushToSheets: DB → スプレッドシート（会社ごとタブ・新規分のみ追記）
//   pullFromSheets: スプレッドシート → DB（IDで突合し対応状況等を更新）
// ─────────────────────────────────────────────────────────────

// 架電リスト用の列定義
// B列（index 1）= 重複情報、F列（index 5）= ふりがな（名前の隣）
// S〜V列（index 18〜21）= 入力欄（架電回数・対応状況・最終架電日・メモ）
// W列（index 22）= 職歴（notesから抽出）
const SHEET_HEADERS = [
  'ID', '重複', '媒体', '会社', '名前', 'ふりがな',
  '電話番号', 'メールアドレス', '性別', '生年月日', '年齢', '居住地',
  '現在の職業', '求人タイトル', '経験', '学歴', '勤務地', '応募日',
  '架電回数', '対応状況', '最終架電日', 'メモ', '職歴',
];
const SHEET_COL = { id: 0, dupInfo: 1, furigana: 5, callCount: 18, status: 19, lastCalled: 20, notes: 21, workHistory: 22 };

// notesフィールドから【職歴N】/【勤務先N】セクションを抽出してW列用テキストを生成する
function extractWorkHistory(notes) {
  if (!notes) return '';
  const sections = [];
  const regex = /【(?:職歴|勤務先)\d+】[^【]*/g;
  let m;
  while ((m = regex.exec(notes)) !== null) {
    sections.push(m[0].trim().replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' '));
  }
  return sections.join(' | ');
}

// レイアウト検出用（旧レイアウトのインデックスで退避する）
const LAYOUTS = [
  // 最新: ID/重複/媒体/会社/名前/ふりがな/...
  { detect: h => h[0]==='ID' && h[1]==='重複' && h[5]==='ふりがな',
    col: { id:0, furigana:5, callCount:18, status:19, notes:21 } },
  // 中間: ID/重複/媒体/会社/名前/電話番号/... (ふりがななし)
  { detect: h => h[0]==='ID' && h[1]==='重複' && h[2]==='媒体',
    col: { id:0, furigana:-1, callCount:17, status:18, notes:20 } },
  // 旧: ID/媒体/会社/名前/...
  { detect: h => h[0]==='ID' && h[2]==='会社',
    col: { id:0, furigana:-1, callCount:16, status:17, notes:20 } },
];

function applicantToSheetRow(a, mediaLabel, companyLabel, dupInfo = '') {
  return [
    a.id, dupInfo,
    mediaLabel(a.media), companyLabel ? companyLabel(a.company) : (a.company || ''),
    a.name || '', a.furigana || '',
    a.phone || '', a.email || '',
    a.gender || '', a.birth_date || '', String(a.age || ''), a.address || '',
    a.current_job || '', a.job_title || '', a.experience || '', a.education || '', a.work_location || '',
    (a.applied_at || '').slice(0, 10),
    String(a.call_count || 0), a.status || '', (a.last_called_at || '').slice(0, 10),
    (a.notes || '').replace(/[\r\n]+/g, ' '),
    extractWorkHistory(a.notes || ''),
  ].map(v => v == null ? '' : String(v));
}

// DB → スプレッドシート（会社ごとタブ。重複を除き、未登録IDのみ追記）
async function pushToSheets({ gsheets, Ops, Logs, companies, statuses, mediaList, archived = false }) {
  const mediaLabel = id => { const m = mediaList.find(x => x.id === id); return m ? m.name : (id || '不明'); };
  // 管理画面と同じラベルを使用（c.label → c.short → id の順で fallback）
  const companyLabel = id => { const c = companies.find(x => x.id === id); return c ? (c.label || c.short || id) : (id || ''); };
  // 旧ステータス → 新ステータスのマッピング（スプレッドシートから古い値が返ってきた場合の対応）
  const STATUS_MIGRATE = {
    '架電済(不通)': '不通', '対応終了': '終了', '断られた': '終了', '辞退': '終了', '重複': '新規',
  };
  let count = 0, tabs = 0;
  const warnings = [];
  // 全員をシートに反映（重複・過去応募に関わらず除外しない）
  for (const co of companies) {
    const { db } = require('../db');
    const list = (await Ops.listCalls({ company: co.id, archived }));
    const title = co.short || co.name || co.id;
    const props = await gsheets.ensureTab(title);

    // 既存シートから手入力済みの架電結果（ID→{callCount,status,notes,furigana}）を退避。
    // レイアウトを自動判定し、新旧どのレイアウトでも正しく退避する。
    const existing = await gsheets.readValues(title);
    const prior = new Map();
    const existingHeader = existing[0] || [];
    const layout = LAYOUTS.find(l => l.detect(existingHeader));
    // 手入力値を退避する列はヘッダー名でも検出（レイアウト判定に失敗してもメモ等を消さない）
    const priorBirthCol      = existingHeader.findIndex(h => h === '生年月日');
    const priorGenderCol     = existingHeader.findIndex(h => h === '性別');
    const priorNotesCol      = existingHeader.findIndex(h => h === 'メモ');
    const priorFuriCol       = existingHeader.findIndex(h => h === 'ふりがな');
    const priorLastCol       = existingHeader.findIndex(h => h === '最終架電日');
    const priorWorkHistoryCol= existingHeader.findIndex(h => h === '職歴');
    const priorPhoneCol      = existingHeader.findIndex(h => h === '電話番号');
    const priorEmailCol      = existingHeader.findIndex(h => h === 'メールアドレス');
    const priorIdCol         = existingHeader.findIndex(h => h === 'ID');
    const pcL  = layout ? layout.col : null;
    const idCl = pcL ? pcL.id : (priorIdCol >= 0 ? priorIdCol : 0);
    for (const row of existing.slice(1)) {
      const id = row[idCl];
      if (!id) continue;
      prior.set(id, {
        callCount:  pcL && pcL.callCount >= 0 ? row[pcL.callCount] : undefined,
        status:     pcL && pcL.status   >= 0 ? row[pcL.status]    : undefined,
        notes:      priorNotesCol >= 0 ? row[priorNotesCol] : (pcL && pcL.notes    >= 0 ? row[pcL.notes]    : ''),
        furigana:   priorFuriCol  >= 0 ? row[priorFuriCol]  : (pcL && pcL.furigana >= 0 ? row[pcL.furigana] : ''),
        birthDate:   priorBirthCol       >= 0 ? row[priorBirthCol]       : '',
        gender:      priorGenderCol      >= 0 ? row[priorGenderCol]      : '',
        lastCalled:  priorLastCol        >= 0 ? row[priorLastCol]        : '',
        workHistory: priorWorkHistoryCol >= 0 ? row[priorWorkHistoryCol] : '',
        phone:       priorPhoneCol       >= 0 ? row[priorPhoneCol]       : '',
        email:       priorEmailCol       >= 0 ? row[priorEmailCol]       : '',
      });
    }

    // ── 重複検出 ──────────────────────────────────────────────
    // ① 直近重複: 今回プッシュ対象の中に同一電話/メールが複数いる
    const phoneCount = new Map(); // normalized_phone → [id, ...]
    const emailCount = new Map(); // normalized_email → [id, ...]
    for (const a of list) {
      if (a.normalized_phone) {
        if (!phoneCount.has(a.normalized_phone)) phoneCount.set(a.normalized_phone, []);
        phoneCount.get(a.normalized_phone).push(a.id);
      }
      if (a.normalized_email) {
        if (!emailCount.has(a.normalized_email)) emailCount.set(a.normalized_email, []);
        emailCount.get(a.normalized_email).push(a.id);
      }
    }
    // listをid→レコードのMapに変換（直近重複の最終対応日参照用）
    const listById = new Map(list.map(a => [a.id, a]));

    const buildDupInfo = (a) => {
      const parts = [];

      // ① 直近重複: 今回プッシュ対象に同一電話/メールが複数存在する
      const pIds = (a.normalized_phone && phoneCount.get(a.normalized_phone)) || [];
      const eIds = (a.normalized_email && emailCount.get(a.normalized_email)) || [];
      const otherIds = [...new Set([...pIds, ...eIds])].filter(id => id !== a.id);
      if (otherIds.length > 0) {
        // 直近の他レコードのうち最終架電日が最新のものを取得
        let latestDate = '', latestStatus = '';
        for (const oid of otherIds) {
          const other = listById.get(oid);
          if (!other) continue;
          const d = other.last_called_at || other.applied_at || '';
          if (d > latestDate) { latestDate = d; latestStatus = other.status; }
        }
        const datePart = latestDate ? ` 最終対応:${latestDate.slice(0, 10)} (${latestStatus})` : '';
        parts.push(`直近重複 ${otherIds.length + 1}件${datePart}`);
      }

      // ② 過去応募: アーカイブ済みレコードが存在する
      let pastRow = null;
      if (a.normalized_phone) {
        pastRow = db.prepare(`SELECT status, last_called_at, applied_at, updated_at FROM applicants WHERE normalized_phone=? AND normalized_phone!='' AND is_archived=1 ORDER BY updated_at DESC LIMIT 1`).get(a.normalized_phone);
      }
      if (!pastRow && a.normalized_email) {
        pastRow = db.prepare(`SELECT status, last_called_at, applied_at, updated_at FROM applicants WHERE normalized_email=? AND normalized_email!='' AND is_archived=1 ORDER BY updated_at DESC LIMIT 1`).get(a.normalized_email);
      }
      if (pastRow) {
        // 実際に対応した日(last_called_at)を優先。無ければ過去の応募日(applied_at)。
        // updated_at はアーカイブ等のDB更新で本日に書き換わるため使わない。
        const date = (pastRow.last_called_at || pastRow.applied_at || '').slice(0, 10);
        parts.push(`過去応募 最終対応:${date} (${pastRow.status})`);
      }

      return parts.join(' / ');
    };
    // ──────────────────────────────────────────────────────────

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
      sec[2] = `▼ ${label}（${grp.length}件）`;  // 媒体見出し（B列=重複を避けてC列に）
      sectionRowIdx.push(rows.length);
      rows.push(sec);
      for (const a of grp) {
        const dupInfo = buildDupInfo(a);
        const row = applicantToSheetRow(a, mediaLabel, companyLabel, dupInfo);
        const p = prior.get(a.id);  // 手入力済みのデータを優先（架電結果・ふりがな・生年月日・性別）
        if (p) {
          if (p.callCount !== undefined && p.callCount !== '') row[SHEET_COL.callCount] = String(p.callCount);
          if (p.status) row[SHEET_COL.status] = p.status;
          // メモ: 架電リスト(DB)のメモとシート手入力のメモを両方保持してマージ（どちらも消さない）
          {
            const dbNotes    = String(row[SHEET_COL.notes] || '').trim(); // DB(架電リスト)のメモ
            const sheetNotes = String(p.notes || '').trim();              // シート手入力のメモ
            let merged;
            if (dbNotes && sheetNotes) {
              if (sheetNotes.includes(dbNotes))      merged = sheetNotes;
              else if (dbNotes.includes(sheetNotes)) merged = dbNotes;
              else                                    merged = `${dbNotes} / ${sheetNotes}`;
            } else {
              merged = dbNotes || sheetNotes;
            }
            row[SHEET_COL.notes] = merged;
          }
          if (p.furigana) row[SHEET_COL.furigana] = p.furigana;
          // 電話番号(index6)・メール(index7) の手入力値はDBが空でも保持（シニアジョブ等で手入力した連絡先を消さない）
          if (p.phone && String(p.phone).trim() && !String(row[6] || '').trim()) row[6] = String(p.phone).trim();
          if (p.email && String(p.email).trim() && !String(row[7] || '').trim()) row[7] = String(p.email).trim();
          // 生年月日(index9)・性別(index8)・最終架電日 の手入力値はDBが空でも保持
          if (p.birthDate && String(p.birthDate).trim() && !row[9]) row[9] = String(p.birthDate).trim();
          if (p.gender && String(p.gender).trim() && !row[8]) row[8] = String(p.gender).trim();
          if (p.lastCalled && String(p.lastCalled).trim() && !String(row[SHEET_COL.lastCalled] || '').trim())
            row[SHEET_COL.lastCalled] = String(p.lastCalled).trim();
          // 職歴: DBから自動抽出した値が空なら手入力値を保持
          if (p.workHistory && String(p.workHistory).trim() && !String(row[SHEET_COL.workHistory] || '').trim())
            row[SHEET_COL.workHistory] = String(p.workHistory).trim();
        }
        rows.push(row);
        count++;
      }
    }

    // RAW モードで書き込む（日付・数値の自動変換を防ぐ）
    await gsheets.writeValues(title, rows);

    // 年齢列（K列=index10）に生年月日（J列=index9）から計算する数式を設定
    if (rows.length > 1 && gsheets.writeColumnFormulas) {
      const formulas = Array.from({ length: rows.length - 1 }, (_, i) => {
        const r = i + 2; // シート行番号（1始まり、row1はヘッダ）
        return `=IF(J${r}<>"",IFERROR(DATEDIF(J${r},TODAY(),"Y"),IFERROR(DATEDIF(DATEVALUE(J${r}),TODAY(),"Y"),"")),"")`;
      });
      try { await gsheets.writeColumnFormulas(title, 10, 2, formulas); }
      catch (e) { warnings.push(`${title}: 年齢数式設定失敗 (${e.message || e})`); }
    }

    // 書式・プルダウンは毎回（冪等）適用。失敗してもデータ反映は止めず警告に。
    try {
      await gsheets.styleHeader(props.sheetId, SHEET_HEADERS.length);
      // S〜V列（架電回数・対応状況・最終架電日・メモ）のヘッダー1行目のみオレンジ
      if (gsheets.setColumnBackground) {
        await gsheets.setColumnBackground(props.sheetId, SHEET_COL.callCount, SHEET_COL.notes,
          { red: 0.918, green: 0.722, blue: 0 },        // #eab800 濃い黄色（白文字で視認可）
          { red: 1, green: 1, blue: 1 });                // 文字色: 白
      }
      // Q〜V列（index16〜21）のデータ行（row2以降）の背景色を白にリセット
      // 過去のpushで誤ってデータ行にオレンジが付いている場合のクリア
      if (gsheets.clearColumnDataBackground) {
        await gsheets.clearColumnDataBackground(props.sheetId, 16, SHEET_HEADERS.length - 1);
      }
      // 過去レイアウトの余分なプルダウン（応募日列など）を一度全クリアしてから必要な列だけ再設定
      if (gsheets.clearDataValidations) {
        await gsheets.clearDataValidations(props.sheetId);
      }
      await gsheets.setDropdowns(props.sheetId, [
        { colIndex: SHEET_COL.callCount, list: ['1','2','3','4','5','6','7','8','9','10'] },
        { colIndex: SHEET_COL.status,    list: ['新規','不通','対応中','終了'] },
      ]);
      if (sectionRowIdx.length && gsheets.styleSectionRows) {
        await gsheets.styleSectionRows(props.sheetId, sectionRowIdx, SHEET_HEADERS.length);
      }
      // 経験(O列)・職歴(W列)など長文セルで行の高さが伸びるのを防ぐ:
      //   O列以降(index14〜)ははみ出し(クリップ)にし、データ行の高さを一律21pxに固定
      if (rows.length > 1 && gsheets.setClipWrap) {
        await gsheets.setClipWrap(props.sheetId, 14, SHEET_HEADERS.length - 1, 1);
      }
      if (rows.length > 1 && gsheets.setRowHeights) {
        await gsheets.setRowHeights(props.sheetId, 1, rows.length, 21);
      }
    } catch (e) {
      warnings.push(`${title}: 書式/プルダウン設定に失敗 (${e.message || e})`);
    }
    // 対応状況の値に応じて「行全体」を着色（マスだけでなく行全体）
    if (gsheets.setStatusConditionalFormats) {
      try {
        await gsheets.setStatusConditionalFormats(props.sheetId, SHEET_COL.status, SHEET_HEADERS.length, SHEET_COL.dupInfo);
      } catch (e) { warnings.push(`${title}: 条件付き書式設定失敗 (${e.message || e})`); }
    }
    tabs++;
  }
  const listLabel = archived ? '過去応募者スプレッドシート' : '共有スプレッドシート';
  if (Logs) await Logs.create('sheets_push', 'success',
    `${count}件を${listLabel}に反映（${tabs}タブ・媒体別）` + (warnings.length ? ` ※${warnings.join(' / ')}` : ''));
  return { count, appended: count, tabs, warnings };
}

// スプレッドシート → DB（IDで突合し対応状況・架電回数・メモ・ふりがなを更新。IDなし行は新規作成）
async function pullFromSheets({ gsheets, Ops, Applicants, Logs }) {
  const STATUS_MIGRATE = {
    '架電済(不通)': '不通', '対応終了': '終了', '断られた': '終了', '辞退': '終了', '重複': '新規',
  };
  const { COMPANIES, MEDIA, db } = require('../db');
  const { normalizePhone, normalizeEmail } = require('../normalize');
  // media名→IDマッピング（"Indeed"→"indeed", "求人ボックス"→"kyujinbox" 等）
  const mediaNameToId = {};
  for (const m of MEDIA) { mediaNameToId[m.name] = m.id; mediaNameToId[m.id] = m.id; }
  // タブ名→会社オブジェクトのマップ
  const tabToCompany = {};
  for (const c of COMPANIES) { tabToCompany[c.short || c.name || c.id] = c; }

  const companyTabs = new Set(Object.keys(tabToCompany));
  let updated = 0, created = 0, notFound = 0, scanned = 0, skippedTabs = [];
  const meta = await gsheets.getMeta();

  for (const sh of (meta.sheets || [])) {
    const title = sh.properties.title;
    if (!companyTabs.has(title)) { skippedTabs.push(title); continue; }
    const coObj = tabToCompany[title];
    const companyId = coObj ? coObj.id : 'sq';

    const values = await gsheets.readValues(title);
    if (values.length < 2) continue;

    // ヘッダー行からカラム位置を名前で検出（全レイアウト共通）
    const headerRow = values[0] || [];
    const fc = (name) => headerRow.findIndex(h => h === name);
    const colIdx = {
      id:          fc('ID') >= 0 ? fc('ID') : 0,
      media:       fc('媒体'),
      name:        fc('名前'),
      furigana:    fc('ふりがな'),
      phone:       fc('電話番号'),
      email:       fc('メールアドレス'),
      gender:      fc('性別'),
      birthDate:   fc('生年月日'),
      address:     fc('居住地'),
      currentJob:  fc('現在の職業'),
      jobTitle:    fc('求人タイトル'),
      experience:  fc('経験'),
      education:   fc('学歴'),
      workLocation:fc('勤務地'),
      appliedAt:   fc('応募日'),
      lastCalled:  fc('最終架電日'),
    };

    // 架電結果列は LAYOUTS で検出（旧レイアウトのインデックスずれを吸収）
    const layout = LAYOUTS.find(l => l.detect(headerRow));
    const pc = layout ? layout.col : SHEET_COL;

    for (let rowIdx = 0; rowIdx < values.length - 1; rowIdx++) {
      const row = values[rowIdx + 1];
      const sheetRowNum = rowIdx + 2; // 1始まりシート行番号

      const id = row[colIdx.id];

      // ── IDなし行：スプレッドシート手入力の新規応募者 ──────────
      if (!id) {
        const nameVal  = colIdx.name  >= 0 ? (row[colIdx.name]  || '') : '';
        const phoneVal = colIdx.phone >= 0 ? (row[colIdx.phone] || '') : '';
        // 名前・電話なし、またはセクション見出し行（▼）はスキップ
        if (!nameVal || !phoneVal || (row[2] || '').startsWith('▼')) continue;

        const emailVal = colIdx.email >= 0 ? (row[colIdx.email] || '') : '';
        const mediaNameVal = colIdx.media >= 0 ? (row[colIdx.media] || '') : '';
        const mediaId = mediaNameToId[mediaNameVal] || 'google';

        const newA = Applicants.create({
          name:          nameVal,
          furigana:      colIdx.furigana    >= 0 ? (row[colIdx.furigana]    || '') : '',
          phone:         phoneVal,
          email:         emailVal,
          gender:        colIdx.gender      >= 0 ? (row[colIdx.gender]      || '') : '',
          birth_date:    colIdx.birthDate   >= 0 ? (row[colIdx.birthDate]   || '') : '',
          address:       colIdx.address     >= 0 ? (row[colIdx.address]     || '') : '',
          current_job:   colIdx.currentJob  >= 0 ? (row[colIdx.currentJob]  || '') : '',
          job_title:     colIdx.jobTitle    >= 0 ? (row[colIdx.jobTitle]    || '') : '',
          experience:    colIdx.experience  >= 0 ? (row[colIdx.experience]  || '') : '',
          education:     colIdx.education   >= 0 ? (row[colIdx.education]   || '') : '',
          work_location: colIdx.workLocation >= 0 ? (row[colIdx.workLocation] || '') : '',
          applied_at:    colIdx.appliedAt >= 0 && row[colIdx.appliedAt]
                           ? row[colIdx.appliedAt] : new Date().toISOString(),
          call_count:    pc.callCount >= 0 && row[pc.callCount] ? (parseInt(row[pc.callCount]) || 0) : 0,
          status:        pc.status >= 0 && row[pc.status]
                           ? (STATUS_MIGRATE[row[pc.status]] || row[pc.status]) : '新規',
          notes:         pc.notes >= 0 ? (row[pc.notes] || '') : '',
          media:         mediaId,
          source_media:  mediaNameVal,
          company:       companyId,
          allowEmptyDate: true,
        });
        if (newA) {
          created++;
          // A列（ID列）に生成したIDを書き戻す
          if (gsheets.writeSingleCell) {
            try { await gsheets.writeSingleCell(title, sheetRowNum, colIdx.id, newA.id); } catch {}
          }
        }
        continue;
      }

      // ── IDあり行：既存レコードを更新 ──────────────────────────
      scanned++;
      const existing = await Applicants.findById(id);
      if (!existing) { notFound++; continue; }
      const ccRaw = row[pc.callCount];
      const newStatus = row[pc.status];
      const normalizedStatus = STATUS_MIGRATE[newStatus] || newStatus;
      await Ops.updateCall(id, {
        callCount: (ccRaw !== undefined && ccRaw !== '') ? (parseInt(ccRaw) || 0) : undefined,
        status: normalizedStatus || undefined,
        // 空セルではDBのメモを消さない（手入力メモを保持）。値がある時だけ更新。
        notes: (row[pc.notes] !== undefined && String(row[pc.notes]).trim() !== '') ? row[pc.notes] : undefined,
        skipAutoArchive: false,
      });
      // ふりがなをDBに同期
      if (pc.furigana >= 0) {
        const sheetFurigana = row[pc.furigana];
        if (sheetFurigana !== undefined && sheetFurigana !== '') {
          db.prepare('UPDATE applicants SET furigana=?, updated_at=? WHERE id=?')
            .run(sheetFurigana, new Date().toISOString(), id);
        }
      }
      // 生年月日をDBに同期（Indeed等で空欄→シートで手入力した値を取り込む）
      if (colIdx.birthDate >= 0) {
        const sheetBirth = row[colIdx.birthDate];
        if (sheetBirth !== undefined && String(sheetBirth).trim() !== '') {
          db.prepare('UPDATE applicants SET birth_date=?, updated_at=? WHERE id=?')
            .run(String(sheetBirth).trim(), new Date().toISOString(), id);
        }
      }
      // 性別をDBに同期（Indeedは性別なし→シートで手入力した値を取り込む）
      if (colIdx.gender >= 0) {
        const sheetGender = row[colIdx.gender];
        if (sheetGender !== undefined && String(sheetGender).trim() !== '') {
          db.prepare('UPDATE applicants SET gender=?, updated_at=? WHERE id=?')
            .run(String(sheetGender).trim(), new Date().toISOString(), id);
        }
      }
      // 電話番号をDBに同期（シニアジョブ等で空欄→シートで手入力した値を取り込む）。
      // 正規化値も更新して重複判定が効くようにする。
      if (colIdx.phone >= 0) {
        const sheetPhone = row[colIdx.phone];
        if (sheetPhone !== undefined && String(sheetPhone).trim() !== '') {
          const ph = String(sheetPhone).trim();
          db.prepare('UPDATE applicants SET phone=?, normalized_phone=?, updated_at=? WHERE id=?')
            .run(ph, normalizePhone(ph), new Date().toISOString(), id);
        }
      }
      // メールアドレスをDBに同期（同上）
      if (colIdx.email >= 0) {
        const sheetEmail = row[colIdx.email];
        if (sheetEmail !== undefined && String(sheetEmail).trim() !== '') {
          const em = String(sheetEmail).trim();
          db.prepare('UPDATE applicants SET email=?, normalized_email=?, updated_at=? WHERE id=?')
            .run(em, normalizeEmail(em), new Date().toISOString(), id);
        }
      }
      // 最終架電日をDBに同期（シートで手入力した値を取り込む）。
      // updateCallが架電回数>0で last_called_at を本日に上書きするため、その後に手入力値で再設定する。
      if (colIdx.lastCalled >= 0) {
        const sheetLast = row[colIdx.lastCalled];
        if (sheetLast !== undefined && String(sheetLast).trim() !== '') {
          db.prepare('UPDATE applicants SET last_called_at=?, updated_at=? WHERE id=?')
            .run(String(sheetLast).trim(), new Date().toISOString(), id);
        }
      }
      // 不通/対応中/終了 → 同一電話・メールのレコードをまとめてアーカイブ
      if (['不通', '対応中', '終了'].includes(normalizedStatus)) {
        const ts = new Date().toISOString();
        const nPhone = existing.normalized_phone || '';
        const nEmail = existing.normalized_email || '';
        db.prepare(`
          UPDATE applicants SET is_archived=1, updated_at=?
          WHERE is_archived=0
            AND ( id=?
              OR (normalized_phone != '' AND normalized_phone = ?)
              OR (normalized_email != '' AND normalized_email = ?) )
        `).run(ts, id, nPhone, nEmail);
      }
      updated++;
    }
  }
  if (Logs) await Logs.create('sheets_pull', 'success',
    `${updated}件更新・${created}件新規作成（${notFound}件該当なし）` +
    (skippedTabs.length ? `／対象外タブ: ${skippedTabs.join('・')}` : ''));
  return { updated, created, notFound, scanned, skippedTabs };
}

// ─────────────────────────────────────────────────────────────
// 推薦管理・案件精査シートの初期化
// ─────────────────────────────────────────────────────────────

const COMPANY_LIST = ['SQ', 'BG', 'PE', 'LT'];
const MEDIA_LIST   = ['Indeed', '求人ボックス', 'スタンバイ', 'Googleしごと検索'];

const SUISHO_HEADERS = [
  '推薦日', 'ステータス', '会社', '応募媒体', 'アカウント', '対象案件', '応募案件',
  '氏名', '読み方', '年齢', '生年月日', '性別', '最終学歴',
  '最寄駅', '通勤時間', '希望職種・動機', '経験', '雇用形態',
  '希望入社日', '他社並行', '電話番号', 'メールアドレス', '住所', '備考',
  'オンライン面談', '面談候補日①', '面談候補日②', '面談候補日③',
  '面談日確定', '面談結果', 'メモ',
];
const SUISHO_COL = { status: 1, company: 2, media: 3, online: 24, result: 29 };

// 案件精査・面談依頼で共通の列定義
const SEISA_BASE_HEADERS = [
  '会社', '応募媒体', 'アカウント', '対象案件', '応募案件',
  '氏名', '読み方', '年齢', '生年月日', '性別', '最終学歴',
  '最寄駅', '通勤時間(分)', '希望職種・動機', '経験', '雇用形態',
  '希望入社日', '他社並行', '電話番号', 'メールアドレス', '住所', '備考',
  'オンライン面談',
  '面談候補日①', '面談候補日②', '面談候補日③',
  '面談候補日④', '面談候補日⑤', '面談候補日⑥',
  '運転免許', '安全運転(事故・点数)', '健康状態(疾患・既往歴)',
  '精査結果', 'メモ',
];
const SEISA_HEADERS  = ['精査日',    ...SEISA_BASE_HEADERS];
const MENTAN_HEADERS = ['面談依頼日', ...SEISA_BASE_HEADERS];

// 先頭の日付列の次から: company=1, media=2, online=23, license=30, result=33
const SEISA_COL = { company: 1, media: 2, online: 23, license: 30, seisaResult: 33 };

async function applySeisaFormat(gsheets, props, title) {
  const headers = title === '面談依頼' ? MENTAN_HEADERS : SEISA_HEADERS;
  await gsheets.writeValues(title, [headers.slice()]);
  await gsheets.styleHeader(props.sheetId, headers.length);
  await gsheets.setDropdowns(props.sheetId, [
    { colIndex: SEISA_COL.company,     list: COMPANY_LIST },
    { colIndex: SEISA_COL.media,       list: MEDIA_LIST },
    { colIndex: SEISA_COL.online,      list: ['◯', '✕', '要確認'] },
    { colIndex: SEISA_COL.license,     list: ['有', '無', '要確認'] },
    { colIndex: SEISA_COL.seisaResult, list: ['推薦OK', '保留', '見送り', '再精査'] },
  ]);
}

async function initRecruitmentSheets({ gsheets, Logs }) {
  const created = [];

  // ── 推薦管理シート ───────────────────────────────────────
  const suishoProps = await gsheets.ensureTab('推薦管理');
  await gsheets.writeValues('推薦管理', [SUISHO_HEADERS.slice()]);
  try {
    await gsheets.styleHeader(suishoProps.sheetId, SUISHO_HEADERS.length);
    await gsheets.setDropdowns(suishoProps.sheetId, [
      { colIndex: SUISHO_COL.status,  list: ['推薦前', '案件精査中', '推薦済み', '面談調整中', '面談確定', '面談済み', '内定', '入社', '不採用', '辞退', '見送り'] },
      { colIndex: SUISHO_COL.company, list: COMPANY_LIST },
      { colIndex: SUISHO_COL.media,   list: MEDIA_LIST },
      { colIndex: SUISHO_COL.online,  list: ['◯', '✕', '要確認'] },
      { colIndex: SUISHO_COL.result,  list: ['合格', '不合格', '辞退', '見送り', '結果待ち'] },
    ]);
  } catch (_) { /* 書式エラーはデータに影響しない */ }
  created.push('推薦管理');

  // ── 案件精査シート ───────────────────────────────────────
  const seisaProps = await gsheets.ensureTab('案件精査');
  try { await applySeisaFormat(gsheets, seisaProps, '案件精査'); } catch (_) {}
  created.push('案件精査');

  // ── 面談依頼シート ───────────────────────────────────────
  const mentanProps = await gsheets.ensureTab('面談依頼');
  try { await applySeisaFormat(gsheets, mentanProps, '面談依頼'); } catch (_) {}
  created.push('面談依頼');

  if (Logs) await Logs.create('sheets_init_recruitment', 'success', `推薦管理・案件精査シートを作成しました（${created.join('・')}）`);
  return { created };
}

module.exports = { SHEET_HEADERS, SHEET_COL, applicantToSheetRow, pushToSheets, pullFromSheets, initRecruitmentSheets };
