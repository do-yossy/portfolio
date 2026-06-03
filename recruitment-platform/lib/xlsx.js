'use strict';

// ─────────────────────────────────────────────────────────────
// 依存ライブラリなしの最小XLSX（Excel/Googleスプレッドシート）生成
//   buildXlsx([{ name, rows }]) → Buffer
//     name : シート（タブ）名
//     rows : セルの2次元配列。各セルは
//            - 文字列/数値 … 通常セル
//            - { v, style } … スタイル付きセル（style: 'header' | 'section'）
// ─────────────────────────────────────────────────────────────

// CRC32（ZIP用）
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // 制御文字を除去（XMLで不正）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// 0始まりの列番号 → A1表記の列文字（0→A, 26→AA）
function colLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// シート名のサニタイズ（Excel制約: 31文字・禁止文字）
function sanitizeSheetName(name, idx) {
  let s = String(name || `Sheet${idx + 1}`).replace(/[\[\]:*?/\\]/g, ' ').trim();
  if (!s) s = `Sheet${idx + 1}`;
  return s.slice(0, 31);
}

// validations: [{ sqref, list }]  例: { sqref: 'O2:O10000', list: ['1','2','3'] }
function sheetXml(rows, validations) {
  const lines = [];
  rows.forEach((row, r) => {
    const cells = row.map((cell, c) => {
      const ref = colLetter(c) + (r + 1);
      let v, style;
      if (cell && typeof cell === 'object' && 'v' in cell) { v = cell.v; style = cell.style; }
      else { v = cell; }
      const styleAttr = style === 'header' ? ' s="1"' : style === 'section' ? ' s="2"' : '';
      if (v == null || v === '') return `<c r="${ref}"${styleAttr}/>`;
      // 数値（先頭ゼロ・電話番号は文字列扱いにする）
      if (typeof v === 'number' && Number.isFinite(v)) {
        return `<c r="${ref}"${styleAttr}><v>${v}</v></c>`;
      }
      return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('');
    lines.push(`<row r="${r + 1}">${cells}</row>`);
  });

  let dvXml = '';
  if (validations && validations.length > 0) {
    const dvItems = validations.map(dv => {
      const formula = '"' + dv.list.join(',') + '"';
      return `<dataValidation type="list" allowBlank="1" showDropDown="0" sqref="${xmlEsc(dv.sqref)}"><formula1>${formula}</formula1></dataValidation>`;
    }).join('');
    dvXml = `<dataValidations count="${validations.length}">${dvItems}</dataValidations>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${lines.join('')}</sheetData>
${dvXml}</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildXlsx(sheets) {
  const names = sheets.map((s, i) => sanitizeSheetName(s.name, i));

  const files = [];
  files.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`]);

  files.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`]);

  files.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('\n')}
</sheets>
</workbook>`]);

  files.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`]);

  files.push(['xl/styles.xml', STYLES_XML]);

  sheets.forEach((s, i) => {
    files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows || [], s.validations)]);
  });

  return zipStore(files);
}

// STORE方式（無圧縮）でZIPを構築
function zipStore(files) {
  const localParts = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(content, 'utf8');
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // version needed
    lh.writeUInt16LE(0x0800, 6);        // flags: UTF-8 filename
    lh.writeUInt16LE(0, 8);             // method 0 = stored
    lh.writeUInt16LE(0, 10);            // mod time
    lh.writeUInt16LE(0, 12);            // mod date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(size, 18);         // compressed size
    lh.writeUInt32LE(size, 22);         // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);            // extra len
    localParts.push(lh, nameBuf, dataBuf);

    // Central directory header
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);            // version made by
    ch.writeUInt16LE(20, 6);            // version needed
    ch.writeUInt16LE(0x0800, 8);        // flags
    ch.writeUInt16LE(0, 10);            // method
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(size, 20);
    ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);            // extra len
    ch.writeUInt16LE(0, 32);            // comment len
    ch.writeUInt16LE(0, 34);            // disk number
    ch.writeUInt16LE(0, 36);            // internal attrs
    ch.writeUInt32LE(0, 38);            // external attrs
    ch.writeUInt32LE(offset, 42);       // local header offset
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + dataBuf.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(central);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// ─────────────────────────────────────────────────────────────
// 依存ライブラリなしの最小XLSX読み込み
//   parseXlsx(buffer) → [{ ヘッダ名: 値, ... }, ...]
//   - Excel / Googleスプレッドシート / 本ツールの出力xlsx を解析
//   - 全シートを対象。各シートの先頭行をヘッダとして行オブジェクト化
//   - parseCSV と同じ形式を返すので取込ロジックをそのまま使える
// ─────────────────────────────────────────────────────────────
const zlib = require('zlib');

function xmlUnescape(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

// 列参照（"A","B"..."AA"）を0始まりの列番号に変換
function colToIndex(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) n = n * 26 + (ref.charCodeAt(i) - 64);
  return n - 1;
}

// ZIP（中央ディレクトリ方式）を展開して { ファイル名: Buffer } を返す
function unzip(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP形式ではありません');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const files = {};
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method   = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen  = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen   = buf.readUInt16LE(p + 32);
    const lhOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // ローカルヘッダから実データ開始位置を求める
    const lhNameLen  = buf.readUInt16LE(lhOffset + 26);
    const lhExtraLen = buf.readUInt16LE(lhOffset + 28);
    const dataStart = lhOffset + 30 + lhNameLen + lhExtraLen;
    const compData = buf.slice(dataStart, dataStart + compSize);
    let content;
    if (method === 0)      content = compData;                    // stored
    else if (method === 8) content = zlib.inflateRawSync(compData); // deflate
    else throw new Error('未対応のZIP圧縮方式: ' + method);
    files[name] = content;
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return files;
}

function parseSharedStrings(files) {
  const f = files['xl/sharedStrings.xml'];
  if (!f) return [];
  const xml = f.toString('utf8');
  const out = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t, s = '';
    while ((t = tRe.exec(m[1]))) s += t[1];
    out.push(xmlUnescape(s));
  }
  return out;
}

// 1シートのXMLを行配列（各行はセル文字列の配列）に変換
function parseSheetRows(xml, sst) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = [];
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1] || '';
      const inner = cm[2] || '';
      const refM = attrs.match(/r="([A-Z]+)\d+"/);
      const colIdx = refM ? colToIndex(refM[1]) : cells.length;
      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      let val = '';
      if (type === 's') {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) val = sst[parseInt(v[1], 10)] || '';
      } else if (type === 'inlineStr') {
        const t = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        if (t) val = xmlUnescape(t[1]);
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) val = xmlUnescape(v[1]);
      }
      cells[colIdx] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}

function parseXlsx(buf) {
  const files = unzip(buf);
  const sst = parseSharedStrings(files);
  const sheetFiles = Object.keys(files)
    .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/sheet(\d+)/)[1], 10) - parseInt(b.match(/sheet(\d+)/)[1], 10));

  const records = [];
  for (const sn of sheetFiles) {
    const sheetRows = parseSheetRows(files[sn].toString('utf8'), sst);
    if (!sheetRows.length) continue;
    // 最初の「中身のある行」をヘッダとして使う
    const headerIdx = sheetRows.findIndex(r => r.some(c => c && c.trim()));
    if (headerIdx < 0) continue;
    const header = sheetRows[headerIdx].map(h => (h || '').trim());
    for (let i = headerIdx + 1; i < sheetRows.length; i++) {
      const r = sheetRows[i];
      if (!r.some(c => c && String(c).trim())) continue; // 空行スキップ
      const obj = {};
      header.forEach((h, j) => { if (h) obj[h] = r[j] !== undefined ? r[j] : ''; });
      records.push(obj);
    }
  }
  return records;
}

module.exports = { buildXlsx, parseXlsx };
