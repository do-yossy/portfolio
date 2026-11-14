// 依存ゼロの .docx(Word)書き出し。zip は無圧縮(stored)で組み立てる。Cloudflare Workers でも動く。
// 構成: 問題用紙 → 解答用紙 → 模範解答と採点基準(先生用) → 配点表

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, data(string) }] → zip の Uint8Array
export function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const local = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, data);
    central.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((n, a) => n + a.length, 0);
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

const xml = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT = '<w:rFonts w:ascii="Century" w:hAnsi="Century" w:eastAsia="游明朝" w:cs="Century"/>';
const run = (text, { bold = false, size = 22 } = {}) =>
  String(text ?? '')
    .split('\n')
    .map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${FONT}${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`)
    .join('');
const para = (text, { bold = false, size = 22, center = false, pageBreak = false, after = 120 } = {}) =>
  `<w:p><w:pPr>${pageBreak ? '<w:pageBreakBefore/>' : ''}<w:spacing w:after="${after}"/>${center ? '<w:jc w:val="center"/>' : ''}</w:pPr>${run(text, { bold, size })}</w:p>`;

const cell = (text, w, { bold = false } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run(text, { bold })}</w:p></w:tc>`;
const BORDERS = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('');
const table = (widths, rows, { rowHeight = 0 } = {}) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${BORDERS}</w:tblBorders></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows
    .map((r, i) => `<w:tr>${rowHeight && i > 0 ? `<w:trPr><w:trHeight w:val="${rowHeight}" w:hRule="atLeast"/></w:trPr>` : ''}${r.map((c, j) => cell(c, widths[j], { bold: i === 0 })).join('')}</w:tr>`)
    .join('')}</w:tbl>${para('', { after: 0 })}`;

const NAME_LINE = '　　年　　組　　番　　名前(　　　　　　　　　　　　)';

// t: { title, kind, levelLabel, subject, grade, total, minutes, questions:[{no,aspect,difficulty,unit,text,answer,points,scoring:[{point,criterion}]}] }
export function buildTestDocx(t) {
  const qs = t.questions;
  const sum = qs.reduce((n, q) => n + q.points, 0);
  const sub = `${t.levelLabel} ${t.subject} ${t.grade} / ${t.minutes}分 / ${t.total}点満点`;
  const body = [
    // 問題用紙
    para(t.title, { bold: true, size: 32, center: true }),
    para(sub, { center: true }),
    para(NAME_LINE, { after: 240 }),
    ...qs.map((q) => para(`問${q.no}(${q.points}点)\n${q.text}`, { after: 240 })),
    // 解答用紙
    para(`${t.title} 解答用紙`, { bold: true, size: 32, center: true, pageBreak: true }),
    para(NAME_LINE, { after: 240 }),
    table([900, 6800, 1300], [['問', '解答', '得点 / 配点'], ...qs.map((q) => [`問${q.no}`, '', `/ ${q.points}`])], { rowHeight: 1000 }),
    // 模範解答と採点基準(先生用)
    para(`${t.title} 模範解答と採点基準(先生用)`, { bold: true, size: 32, center: true, pageBreak: true }),
    ...qs.map((q) => para(`問${q.no}(${q.points}点)\n模範解答:${q.answer}${q.scoring.length ? `\n採点基準:${q.scoring.map((s) => `${s.point}点 ${s.criterion}`).join(' / ')}` : ''}`, { after: 200 })),
    // 配点表
    para('配点表', { bold: true, size: 28, pageBreak: true }),
    table([800, 2400, 2400, 1400, 1000], [['問', '単元', '観点', '難しさ', '配点'], ...qs.map((q) => [String(q.no), q.unit || '', q.aspect || '', q.difficulty || '', String(q.points)]), ['合計', '', '', '', String(sum)]]),
    para(`知識・技能:${qs.filter((q) => q.aspect === '知識・技能').reduce((n, q) => n + q.points, 0)}点 / 思考・判断・表現:${qs.filter((q) => q.aspect === '思考・判断・表現').reduce((n, q) => n + q.points, 0)}点`),
    para('※ サクモンのAIが作ったたたき台を、作成した先生が確認・修正したものです。内容の正しさと採否は、作成した先生が判断してください。', { size: 18 }),
  ].join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: document },
  ]);
}
