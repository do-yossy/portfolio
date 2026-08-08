/* CAREER RESET & SIDE BUSINESS — story-type Word教材 builder (bordeaux edition)
 * Reads an ordered list of final part files (fp00..fp13) and renders a designed .docx.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, Footer, Header, PageNumber, TableOfContents, VerticalAlign,
  HeightRule, LineRuleType
} = require('docx');

const CONTENT_DIR = process.argv[2] || path.join(__dirname, '..', 'content');
const OUT = process.argv[3] || path.join(__dirname, 'output.docx');

// ---------- palette (bordeaux / wine / beige / white / light gray) ----------
const INK      = '2B2426';
const WINE     = '7A2233'; // bordeaux accent
const WINE_DK  = '591826'; // deep wine (chapter headings)
const WINE_SOFT= 'FBEFE0'; // pale on-wine text
const LINE     = 'D8CCC0';
const BEIGE    = 'F4ECDD';
const BEIGE2   = 'FAF4E9';
const BLUSH    = 'F8EDEF';
const GRAYBG   = 'F1EFEE';
const SAND     = 'FBF2E7';
const WARN_BG  = 'FAE9E5';
const WARN_BAR = 'B4492F';
const SUB      = '8C807A';
const WHITE    = 'FFFFFF';

// ---------- fonts ----------
const F_BODY = { ascii: 'Georgia', hAnsi: 'Georgia', eastAsia: '游明朝' };
const F_HEAD = { ascii: 'Century Gothic', hAnsi: 'Century Gothic', eastAsia: '游ゴシック' };
const F_GO   = { ascii: 'Segoe UI', hAnsi: 'Segoe UI', eastAsia: '游ゴシック' };

// ---------- geometry ----------
const PAGE_W = 11906, MARGIN = 1134;
const CW = PAGE_W - MARGIN * 2;

// ---------- helpers ----------
const r = (text, opt = {}) => new TextRun(Object.assign({ text }, opt));
function noBorders() {
  const n = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
}
function b(size, color, style) { return { style: style || BorderStyle.SINGLE, size: size, color: color }; }
function P(runs, opt = {}) { return new Paragraph(Object.assign({ children: Array.isArray(runs) ? runs : [runs] }, opt)); }
function spacer(h) { return P([r('', {})], { spacing: { before: 0, after: h || 100, line: 20, lineRule: LineRuleType.AUTO } }); }

// ---------- block renderers ----------
function lead(text){ return [P([r(text,{font:F_BODY,size:22,color:WINE_DK})],{spacing:{before:40,after:200,line:360,lineRule:LineRuleType.AUTO}})]; }
function para(text,bold){ return [P([r(text,{font:F_BODY,size:21,color:INK,bold:!!bold})],{spacing:{after:150,line:370,lineRule:LineRuleType.AUTO}})]; }
function h3(text){ return [P([r(text,{font:F_HEAD,size:24,color:WINE_DK,bold:true})],{spacing:{before:260,after:110},border:{left:{style:BorderStyle.SINGLE,size:20,color:WINE,space:10}},indent:{left:130}})]; }
function note(text){ return [P([r(text,{font:F_GO,size:17,color:SUB,italics:true})],{spacing:{before:60,after:150,line:300,lineRule:LineRuleType.AUTO}})]; }

function bulletsBlock(items,ordered){
  return items.map((it,i)=>P([
    r((ordered?(i+1)+'.':'●')+' ',{font:F_GO,size:ordered?20:16,color:WINE,bold:true}),
    r(String(it),{font:F_BODY,size:21,color:INK})
  ],{spacing:{after:80,line:350,lineRule:LineRuleType.AUTO},indent:{left:320,hanging:320}}));
}

function checklistBlock(bl){
  const out=[];
  if(bl.title) out.push(P([r(bl.title,{font:F_HEAD,size:20,color:WINE_DK,bold:true})],{spacing:{before:120,after:80}}));
  (bl.items||[]).forEach(it=>out.push(P([
    r('□  ',{font:F_GO,size:24,color:WINE}),
    r(String(it),{font:F_BODY,size:21,color:INK})
  ],{spacing:{after:100,line:330,lineRule:LineRuleType.AUTO},indent:{left:420,hanging:420}})));
  return out;
}

function boxBlock(bl){
  const style=bl.style||'info';
  let bg=BEIGE,bar=WINE,tc=WINE_DK;
  if(style==='point'){bg=BLUSH;bar=WINE;tc=WINE_DK;}
  else if(style==='warn'){bg=WARN_BG;bar=WARN_BAR;tc='9E3A22';}
  else if(style==='source'){bg=GRAYBG;bar=SUB;tc='6B615B';}
  const inner=[];
  if(bl.title){ const pre=style==='warn'?'⚠ ':''; inner.push(P([r(pre+bl.title,{font:F_HEAD,size:20,color:tc,bold:true})],{spacing:{after:90}})); }
  const items=bl.items||(bl.text?[bl.text]:[]);
  items.forEach((it,i)=>{
    if(it&&typeof it==='object'){ renderBlock(it).forEach(n=>inner.push(n)); }
    else inner.push(P([r(String(it),{font:F_BODY,size:20,color:INK})],{spacing:{after:i===items.length-1?0:80,line:340,lineRule:LineRuleType.AUTO}}));
  });
  if(!inner.length) inner.push(P([r('',{})]));
  const cell=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:bg},margins:{top:150,bottom:150,left:230,right:210},borders:{top:b(4,bg),bottom:b(4,bg),right:b(4,bg),left:{style:BorderStyle.SINGLE,size:28,color:bar}}});
  return [new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:noBorders(),rows:[new TableRow({children:[cell]})]}),spacer(90)];
}

function actionBlock(bl){
  const head=new TableCell({children:[P([r('ACTION',{font:F_HEAD,size:22,color:WHITE,bold:true,characterSpacing:60})])],shading:{type:ShadingType.CLEAR,color:'auto',fill:WINE},margins:{top:90,bottom:90,left:210,right:210},borders:noBorders()});
  const steps=(bl.steps||[]).map((s,i)=>P([
    r('STEP '+(i+1)+'　',{font:F_HEAD,size:19,color:WINE_DK,bold:true}),
    r(String(s),{font:F_BODY,size:21,color:INK})
  ],{spacing:{after:100,line:340,lineRule:LineRuleType.AUTO},indent:{left:820,hanging:820}}));
  if(!steps.length) steps.push(P([r('',{})]));
  const body=new TableCell({children:steps,shading:{type:ShadingType.CLEAR,color:'auto',fill:SAND},margins:{top:150,bottom:150,left:210,right:210},borders:noBorders()});
  return [new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:b(8,WINE),bottom:b(8,WINE),left:b(8,WINE),right:b(8,WINE),insideHorizontal:b(2,SAND)},rows:[new TableRow({children:[head]}),new TableRow({children:[body]})]}),spacer(130)];
}

function cellText(text,opt){
  opt=opt||{};
  return new TableCell({
    children:[P([r(String(text==null?'':text),Object.assign({font:F_BODY,size:19,color:INK},opt.run||{}))],{alignment:opt.align||AlignmentType.LEFT,spacing:{after:0,line:300,lineRule:LineRuleType.AUTO}})],
    shading:opt.fill?{type:ShadingType.CLEAR,color:'auto',fill:opt.fill}:undefined,
    verticalAlign:VerticalAlign.CENTER,
    margins:{top:80,bottom:80,left:140,right:120},
    width:opt.width?{size:opt.width,type:WidthType.DXA}:undefined
  });
}

function tableBlock(bl){
  const headers=bl.headers||[]; const rows=bl.rows||[];
  const ncol=headers.length||(rows[0]?rows[0].length:1);
  let widths=[];
  if(ncol===1) widths=[CW];
  else{ const first=Math.round(CW*(ncol>3?0.19:0.32)); const rest=Math.floor((CW-first)/(ncol-1)); widths=[first]; for(let i=1;i<ncol-1;i++)widths.push(rest); widths.push(CW-first-rest*(ncol-2)); }
  const trs=[];
  if(headers.length) trs.push(new TableRow({tableHeader:true,children:headers.map((hh,i)=>cellText(hh,{width:widths[i],fill:WINE_DK,align:i===0?AlignmentType.LEFT:AlignmentType.CENTER,run:{font:F_GO,size:18,color:WHITE,bold:true}}))}));
  rows.forEach((row,ri)=>{
    const cells=[];
    for(let i=0;i<ncol;i++){ const v=row[i]==null?'':row[i]; cells.push(cellText(v,{width:widths[i],fill:ri%2===1?BEIGE:WHITE,align:(i===0||String(v).length>6)?AlignmentType.LEFT:AlignmentType.CENTER})); }
    trs.push(new TableRow({children:cells,height:{value:440,rule:HeightRule.ATLEAST},cantSplit:true}));
  });
  return [new Table({width:{size:CW,type:WidthType.DXA},columnWidths:widths,borders:{top:b(4,LINE),bottom:b(4,LINE),left:b(4,LINE),right:b(4,LINE),insideHorizontal:b(4,LINE),insideVertical:b(4,LINE)},rows:trs}),spacer(130)];
}

function scaletableBlock(bl){
  const scale=bl.scale||5; const out=[]; const low=bl.lowLabel||'低い'; const high=bl.highLabel||'高い';
  if(bl.title) out.push(P([r(bl.title,{font:F_HEAD,size:20,color:WINE_DK,bold:true})],{spacing:{before:80,after:60}}));
  out.push(P([r('各項目について、1（'+low+'）〜'+scale+'（'+high+'）で当てはまる数字に○を付けましょう。',{font:F_GO,size:17,color:SUB})],{spacing:{after:80}}));
  const leftW=Math.round(CW*0.42); const numW=Math.floor((CW-leftW)/scale); const widths=[leftW]; for(let i=0;i<scale;i++)widths.push(numW);
  const header=[cellText(bl.leftHeader||'項目',{width:leftW,fill:WINE_DK,run:{font:F_GO,size:18,color:WHITE,bold:true}})];
  for(let i=1;i<=scale;i++)header.push(cellText(String(i),{width:numW,fill:WINE_DK,align:AlignmentType.CENTER,run:{font:F_GO,size:18,color:WHITE,bold:true}}));
  const trs=[new TableRow({tableHeader:true,children:header})];
  (bl.items||[]).forEach((it,ri)=>{
    const cells=[cellText(it,{width:leftW,fill:ri%2===1?BEIGE:WHITE,run:{font:F_BODY,size:19,color:INK}})];
    for(let i=1;i<=scale;i++)cells.push(cellText(String(i),{width:numW,fill:ri%2===1?BEIGE:WHITE,align:AlignmentType.CENTER,run:{font:F_GO,size:18,color:'B0A59F'}}));
    trs.push(new TableRow({children:cells,height:{value:400,rule:HeightRule.ATLEAST},cantSplit:true}));
  });
  out.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:widths,borders:{top:b(4,LINE),bottom:b(4,LINE),left:b(4,LINE),right:b(4,LINE),insideHorizontal:b(4,LINE),insideVertical:b(4,LINE)},rows:trs}));
  out.push(spacer(130)); return out;
}

function ruledLines(n){
  const out=[];
  for(let i=0;i<n;i++) out.push(P([r('',{font:F_BODY,size:21})],{spacing:{before:130,after:60,line:240,lineRule:LineRuleType.AUTO},border:{bottom:{style:BorderStyle.SINGLE,size:4,color:LINE,space:2}}}));
  return out;
}
function fillBlock(bl){ const out=[]; if(bl.label) out.push(P([r(bl.label,{font:F_HEAD,size:20,color:WINE_DK,bold:true})],{spacing:{before:80,after:40}})); ruledLines(bl.lines||4).forEach(x=>out.push(x)); out.push(spacer(90)); return out; }

function worksheetBlock(bl){
  const out=[];
  if(bl.title) out.push(P([r(bl.title,{font:F_HEAD,size:20,color:WINE_DK,bold:true})],{spacing:{before:100,after:80}}));
  const fields=bl.fields||[]; let i=0;
  const labelW=Math.round(CW*0.34),unitW=Math.round(CW*0.12),inW=CW-labelW-unitW;
  while(i<fields.length){
    const kind=fields[i].kind||'line';
    if(kind==='line'||kind==='num'){
      const group=[]; while(i<fields.length&&((fields[i].kind||'line')==='line'||(fields[i].kind||'line')==='num')){group.push(fields[i]);i++;}
      const trs=group.map((g,gi)=>{
        const labelCell=new TableCell({children:[P([r(g.label||'',{font:F_GO,size:19,color:INK})],{spacing:{after:0,line:280,lineRule:LineRuleType.AUTO}})],width:{size:labelW,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,margins:{top:90,bottom:90,left:70,right:100},borders:noBorders(),shading:{type:ShadingType.CLEAR,color:'auto',fill:gi%2===1?BEIGE:BEIGE2}});
        const inputCell=new TableCell({children:[P([r('',{})])],width:{size:inW,type:WidthType.DXA},verticalAlign:VerticalAlign.BOTTOM,margins:{top:90,bottom:60,left:120,right:120},borders:{top:b(6,WHITE),left:b(6,WHITE),right:b(6,WHITE),bottom:{style:BorderStyle.DOTTED,size:6,color:'C2B7AF'}}});
        const unitCell=new TableCell({children:[P([r(g.unit||'',{font:F_GO,size:18,color:SUB})],{spacing:{after:0}})],width:{size:unitW,type:WidthType.DXA},verticalAlign:VerticalAlign.BOTTOM,margins:{top:90,bottom:60,left:60,right:40},borders:noBorders()});
        return new TableRow({children:[labelCell,inputCell,unitCell],height:{value:430,rule:HeightRule.ATLEAST},cantSplit:true});
      });
      out.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[labelW,inW,unitW],borders:{top:b(4,LINE),bottom:b(4,LINE),left:b(4,LINE),right:b(4,LINE),insideHorizontal:b(4,LINE),insideVertical:b(6,WHITE)},rows:trs}));
      out.push(spacer(110));
    } else if(kind==='lines'){
      const f=fields[i]; out.push(P([r(f.label||'',{font:F_GO,size:19,color:INK})],{spacing:{before:60,after:20}})); ruledLines(f.lines||3).forEach(x=>out.push(x)); out.push(spacer(90)); i++;
    } else if(kind==='choices'){
      const f=fields[i]; out.push(P([r(f.label||'',{font:F_GO,size:19,color:INK})],{spacing:{before:60,after:40}}));
      (f.options||[]).forEach(op=>out.push(P([r('□  ',{font:F_GO,size:22,color:WINE}),r(String(op),{font:F_BODY,size:20,color:INK})],{spacing:{after:70,line:300,lineRule:LineRuleType.AUTO},indent:{left:420,hanging:420}})));
      out.push(spacer(90)); i++;
    } else i++;
  }
  return out;
}

// vertical STEP flow diagram
function flowBlock(bl){
  const steps=bl.steps||[]; const out=[];
  if(bl.title) out.push(P([r(bl.title,{font:F_HEAD,size:20,color:WINE_DK,bold:true})],{spacing:{before:80,after:120}}));
  steps.forEach((s,i)=>{
    const title = (s&&typeof s==='object')?(s.title||''):String(s);
    const desc = (s&&typeof s==='object')?(s.desc||''):'';
    const inner=[P([
      r('STEP '+(i+1)+'　',{font:F_HEAD,size:18,color:WINE,bold:true}),
      r(title,{font:F_GO,size:20,color:INK,bold:true})
    ],{spacing:{after:desc?60:0,line:300,lineRule:LineRuleType.AUTO}})];
    if(desc) inner.push(P([r(desc,{font:F_BODY,size:19,color:INK})],{spacing:{after:0,line:320,lineRule:LineRuleType.AUTO}}));
    const cell=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:BEIGE2},margins:{top:120,bottom:120,left:220,right:200},borders:{top:b(4,BEIGE2),bottom:b(4,BEIGE2),right:b(4,BEIGE2),left:{style:BorderStyle.SINGLE,size:26,color:WINE}}});
    out.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:noBorders(),rows:[new TableRow({children:[cell],cantSplit:true})]}));
    if(i<steps.length-1) out.push(P([r('▼',{font:F_GO,size:18,color:WINE})],{alignment:AlignmentType.CENTER,spacing:{before:40,after:40}}));
  });
  out.push(spacer(130));
  return out;
}

// CASE STUDY header card (bordeaux)
function caseheaderBlock(bl){
  const label=bl.case||'CASE'; const theme=bl.theme||'';
  const meta=[bl.age,bl.income,bl.job].filter(Boolean).join('　／　');
  const topInner=[
    P([r(label,{font:F_HEAD,size:36,color:WHITE,bold:true,characterSpacing:80})],{spacing:{after:70}})
  ];
  if(theme) topInner.push(P([r('「'+theme+'」',{font:F_GO,size:23,color:WINE_SOFT,bold:true})],{spacing:{after:0,line:340,lineRule:LineRuleType.AUTO}}));
  const top=new TableCell({children:topInner,shading:{type:ShadingType.CLEAR,color:'auto',fill:WINE},margins:{top:200,bottom:170,left:260,right:240},borders:noBorders()});
  const metaCell=new TableCell({children:[P([r(meta,{font:F_GO,size:19,color:WINE_DK,bold:true})])],shading:{type:ShadingType.CLEAR,color:'auto',fill:BEIGE},margins:{top:110,bottom:110,left:260,right:240},borders:noBorders()});
  return [new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:b(8,WINE),bottom:b(8,WINE),left:b(8,WINE),right:b(8,WINE),insideHorizontal:b(6,WHITE)},rows:[new TableRow({children:[top]}),new TableRow({children:[metaCell]})]}),spacer(150)];
}

function renderBlock(bl){
  if(!bl||typeof bl!=='object') return [];
  switch(bl.t){
    case 'lead': return lead(bl.text||'');
    case 'p': return para(bl.text||'',bl.bold);
    case 'h3': return h3(bl.text||'');
    case 'note': return note(bl.text||'');
    case 'bullets': return bulletsBlock(bl.items||[],false);
    case 'numbers': return bulletsBlock(bl.items||[],true);
    case 'box': return boxBlock(bl);
    case 'action': return actionBlock(bl);
    case 'checklist': return checklistBlock(bl);
    case 'table': return tableBlock(bl);
    case 'scaletable': return scaletableBlock(bl);
    case 'worksheet': return worksheetBlock(bl);
    case 'fill': return fillBlock(bl);
    case 'caseheader': return caseheaderBlock(bl);
    case 'flow': return flowBlock(bl);
    case 'spacer': return [spacer(bl.h||120)];
    default:
      if(bl.text) return para(String(bl.text));
      if(bl.items) return bulletsBlock(bl.items,false);
      return [];
  }
}

function chapterHeading(text){
  return new Paragraph({heading:HeadingLevel.HEADING_2,spacing:{before:360,after:170},border:{bottom:{style:BorderStyle.SINGLE,size:12,color:LINE,space:6}},keepNext:true,children:[r(text,{font:F_HEAD,size:27,color:WINE_DK,bold:true})]});
}

function dividerPage(part){
  const kids=[];
  kids.push(new Paragraph({children:[new PageBreak()]}));
  for(let i=0;i<5;i++) kids.push(P([r('',{})],{spacing:{after:120}}));
  kids.push(P([r('━━━━━',{font:F_GO,size:20,color:WINE})],{alignment:AlignmentType.CENTER,spacing:{after:120}}));
  kids.push(P([r((part.number||'PART').toUpperCase(),{font:F_HEAD,size:32,color:WINE,bold:true,characterSpacing:90})],{alignment:AlignmentType.CENTER,spacing:{after:120}}));
  kids.push(new Paragraph({heading:HeadingLevel.HEADING_1,alignment:AlignmentType.CENTER,spacing:{before:60,after:150},children:[r(part.title||'',{font:F_HEAD,size:42,color:WINE_DK,bold:true})]}));
  if(part.subtitle) kids.push(P([r(part.subtitle,{font:F_GO,size:22,color:SUB})],{alignment:AlignmentType.CENTER,spacing:{after:210}}));
  kids.push(P([r('◆',{font:F_GO,size:16,color:WINE})],{alignment:AlignmentType.CENTER,spacing:{after:210}}));
  if(part.intro) kids.push(P([r(part.intro,{font:F_BODY,size:21,color:INK})],{alignment:AlignmentType.CENTER,spacing:{after:120,line:390,lineRule:LineRuleType.AUTO},indent:{left:900,right:900}}));
  kids.push(new Paragraph({children:[new PageBreak()]}));
  return kids;
}

function coverPage(){
  const k=[];
  for(let i=0;i<6;i++) k.push(P([r('',{})],{spacing:{after:150}}));
  k.push(P([r('PURCHASER EDITION',{font:F_HEAD,size:18,color:SUB,characterSpacing:160})],{alignment:AlignmentType.CENTER,spacing:{after:360}}));
  k.push(P([r('━━━━━━━━━━━━━',{font:F_GO,size:18,color:LINE})],{alignment:AlignmentType.CENTER,spacing:{after:200}}));
  k.push(P([r('CAREER RESET',{font:F_HEAD,size:58,color:WINE_DK,bold:true,characterSpacing:60})],{alignment:AlignmentType.CENTER,spacing:{after:40}}));
  k.push(P([r('& SIDE BUSINESS',{font:F_HEAD,size:58,color:WINE,bold:true,characterSpacing:60})],{alignment:AlignmentType.CENTER,spacing:{after:210}}));
  k.push(P([r('━━━━━━━━━━━━━',{font:F_GO,size:18,color:LINE})],{alignment:AlignmentType.CENTER,spacing:{after:240}}));
  k.push(P([r('30代女性のための',{font:F_GO,size:26,color:INK})],{alignment:AlignmentType.CENTER,spacing:{after:70}}));
  k.push(P([r('「これからの働き方と収入源」を考える実践ガイド',{font:F_GO,size:26,color:INK,bold:true})],{alignment:AlignmentType.CENTER,spacing:{after:300}}));
  k.push(P([r('Career  /  Money  /  Side Business',{font:F_HEAD,size:17,color:SUB,characterSpacing:80})],{alignment:AlignmentType.CENTER,spacing:{after:520}}));
  for(let i=0;i<4;i++) k.push(P([r('',{})],{spacing:{after:150}}));
  k.push(P([r('自分と似た女性のケースを読みながら、自分の働き方・収入・将来について',{font:F_GO,size:19,color:SUB})],{alignment:AlignmentType.CENTER,spacing:{after:40}}));
  k.push(P([r('ゆっくり考えるための一冊です。',{font:F_GO,size:19,color:SUB})],{alignment:AlignmentType.CENTER,spacing:{after:0}}));
  return k;
}

function tocPage(){
  const k=[];
  k.push(new Paragraph({children:[new PageBreak()]}));
  k.push(P([r('目　次',{font:F_HEAD,size:34,color:WINE_DK,bold:true,characterSpacing:40})],{spacing:{after:60}}));
  k.push(P([r('CONTENTS',{font:F_HEAD,size:16,color:WINE,characterSpacing:80})],{spacing:{after:200},border:{bottom:{style:BorderStyle.SINGLE,size:10,color:LINE,space:8}}}));
  k.push(new TableOfContents('目次',{hyperlink:true,headingStyleRange:'1-2'}));
  k.push(P([r('※ 目次のページ番号は、Wordで開いて「フィールドの更新」を行うと反映されます。',{font:F_GO,size:15,color:SUB})],{spacing:{before:220}}));
  return k;
}

function closingPage(){
  const k=[];
  k.push(new Paragraph({children:[new PageBreak()]}));
  for(let i=0;i<5;i++) k.push(P([r('',{})],{spacing:{after:130}}));
  k.push(P([r('おわりに',{font:F_HEAD,size:30,color:WINE_DK,bold:true,characterSpacing:60})],{alignment:AlignmentType.CENTER,spacing:{after:60}}));
  k.push(P([r('━━━━━',{font:F_GO,size:18,color:WINE})],{alignment:AlignmentType.CENTER,spacing:{after:260}}));
  const lines=[
    '大切なのは、急いで退職や契約を決めることではありません。',
    '自分の生活・収入・時間・リスクを整理したうえで、',
    '自分に合った働き方を考えることが大切です。',
    '',
    '退職することが正解でも、副業することが正解でもありません。',
    'あなた自身が納得できる選択をすることを、この教材はサポートします。'
  ];
  lines.forEach(t=>k.push(P([r(t,{font:F_BODY,size:22,color:INK})],{alignment:AlignmentType.CENTER,spacing:{after:t===''?120:120,line:420,lineRule:LineRuleType.AUTO}})));
  for(let i=0;i<4;i++) k.push(P([r('',{})],{spacing:{after:130}}));
  k.push(P([r('CAREER RESET & SIDE BUSINESS',{font:F_HEAD,size:16,color:SUB,characterSpacing:60})],{alignment:AlignmentType.CENTER,spacing:{before:200,after:40}}));
  k.push(P([r('30代女性のための「働き方・収入源再設計」実践ガイド',{font:F_GO,size:15,color:SUB})],{alignment:AlignmentType.CENTER}));
  return k;
}

// ---------- load ordered parts ----------
function loadPart(fname){
  const p=path.join(CONTENT_DIR,fname);
  if(!fs.existsSync(p)){ console.warn('MISSING',p); return null; }
  try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){ console.error('BAD JSON',p,e.message); return null; }
}
const ORDER=['fp00','fp01','fp02','fp03','fp04','fp05','fp06','fp07','fp08','fp09','fp10','fp11'];
const parts=ORDER.map(n=>loadPart(n+'.json')).filter(Boolean);
console.log('Loaded parts:',parts.map(p=>p.number).join(', '));

const bodyEls=[];
coverPage().forEach(x=>bodyEls.push(x));
tocPage().forEach(x=>bodyEls.push(x));
parts.forEach(part=>{
  dividerPage(part).forEach(x=>bodyEls.push(x));
  (part.sections||[]).forEach(sec=>{
    if(sec.heading&&String(sec.heading).trim()!=='') bodyEls.push(chapterHeading(sec.heading));
    (sec.blocks||[]).forEach(bl=>renderBlock(bl).forEach(x=>bodyEls.push(x)));
    bodyEls.push(spacer(130));
  });
});

const doc=new Document({
  creator:'CAREER RESET & SIDE BUSINESS',
  title:'CAREER RESET & SIDE BUSINESS 実践ガイド',
  styles:{ default:{
    document:{run:{font:F_BODY,size:21,color:INK},paragraph:{spacing:{line:370,lineRule:LineRuleType.AUTO,after:120}}},
    heading1:{run:{font:F_HEAD,size:42,bold:true,color:WINE_DK},paragraph:{spacing:{before:240,after:150}}},
    heading2:{run:{font:F_HEAD,size:27,bold:true,color:WINE_DK},paragraph:{spacing:{before:360,after:170}}}
  }},
  sections:[{
    properties:{page:{size:{width:PAGE_W,height:16838},margin:{top:1418,bottom:1418,left:MARGIN,right:MARGIN,header:720,footer:640}},titlePage:true},
    headers:{default:new Header({children:[P([r('CAREER RESET & SIDE BUSINESS',{font:F_HEAD,size:14,color:'B7ADA6',characterSpacing:30})],{alignment:AlignmentType.RIGHT})]}),first:new Header({children:[P([r('',{})])]})},
    footers:{default:new Footer({children:[P([r('—  ',{font:F_GO,size:16,color:SUB}),new TextRun({children:[PageNumber.CURRENT],font:F_GO,size:16,color:SUB}),r('  —',{font:F_GO,size:16,color:SUB})],{alignment:AlignmentType.CENTER})]}),first:new Footer({children:[P([r('',{})])]})},
    children:bodyEls
  }]
});

Packer.toBuffer(doc).then(buf=>{ fs.writeFileSync(OUT,buf); console.log('WROTE',OUT,(buf.length/1024).toFixed(0)+' KB'); }).catch(e=>{console.error('PACK ERROR',e);process.exit(1);});
