const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,AlignmentType,Table,TableRow,TableCell,WidthType,BorderStyle,ShadingType,LineRuleType,VerticalAlign}=require('docx');
const OUT=process.argv[2]||'profile.docx';
const INK='23201F',WINE='7A2233',WINE_DK='591826',SUB='7C716B',LINE='D8CCC0',GRAY='F3F1EF',BEIGE='F6EFE3',BLUE='2E5AAC',WHITE='FFFFFF',ICONBG='E9E3DC';
const F_BODY={ascii:'Georgia',hAnsi:'Georgia',eastAsia:'游明朝'};
const F_GO={ascii:'Segoe UI',hAnsi:'Segoe UI',eastAsia:'游ゴシック'};
const PAGE_W=11906,MARGIN=1180,CW=PAGE_W-MARGIN*2;
const r=(t,o={})=>new TextRun(Object.assign({text:t},o));
const P=(runs,o={})=>new Paragraph(Object.assign({children:Array.isArray(runs)?runs:[runs]},o));
const bd=(sz,c)=>({style:BorderStyle.SINGLE,size:sz,color:c});
const K=[];
function H1(t){K.push(P([r(t,{font:F_GO,size:27,color:WINE_DK,bold:true})],{spacing:{after:110},border:{bottom:bd(12,WINE)}}));}
function H(t){K.push(P([r(t,{font:F_GO,size:22,color:WINE_DK,bold:true})],{spacing:{before:230,after:60},border:{left:{style:BorderStyle.SINGLE,size:22,color:WINE,space:8}},indent:{left:120}}));}
function p(t,o){K.push(P([r(t,Object.assign({font:F_BODY,size:20,color:INK},o||{}))],{spacing:{after:70,line:350,lineRule:LineRuleType.AUTO}}));}
function copy(lines){
  const inner=lines.map((ln,i)=> ln==='' ? P([r('',{})],{spacing:{after:30}}) : (ln.startsWith('#')?P([r(ln.slice(1),{font:F_GO,size:18,color:WINE_DK,bold:true})],{spacing:{before:i?100:0,after:30}}):P([r(ln,{font:F_BODY,size:19,color:INK})],{spacing:{after:30,line:330,lineRule:LineRuleType.AUTO}})));
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:GRAY},margins:{top:170,bottom:170,left:230,right:220},borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)}});
  K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)},rows:[new TableRow({children:[c]})]}));
  K.push(P([r('',{})],{spacing:{after:90}}));
}
function memo(lines){
  const inner=lines.map(t=>P([r('・'+t,{font:F_BODY,size:19,color:INK})],{spacing:{after:40,line:330,lineRule:LineRuleType.AUTO},indent:{left:260,hanging:260}}));
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:BEIGE},margins:{top:160,bottom:160,left:240,right:220},borders:{top:bd(4,BEIGE),bottom:bd(4,BEIGE),right:bd(4,BEIGE),left:{style:BorderStyle.SINGLE,size:26,color:WINE}}});
  K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(4,BEIGE),bottom:bd(4,BEIGE),left:bd(4,BEIGE),right:bd(4,BEIGE)},rows:[new TableRow({children:[c]})]}));
  K.push(P([r('',{})],{spacing:{after:90}}));
}

H1('Threads プロフィール設定シート（完成イメージ付き）');
p('下の「完成イメージ」の通りに設定すれば、投稿で興味を持った人が“誰が・何を・どこで受け取れるか”を一目で理解できます。文言はそのままコピペで使えます（〇〇はご自身の名前に）。');

// ===== 完成イメージ（モック） =====
H('完成イメージ（Threadsのプロフィール）');
const iconCell=new TableCell({
  width:{size:2000,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,
  shading:{type:ShadingType.CLEAR,color:'auto',fill:ICONBG},margins:{top:120,bottom:120,left:80,right:80},
  borders:{top:bd(4,ICONBG),bottom:bd(4,ICONBG),left:bd(4,ICONBG),right:bd(4,ICONBG)},
  children:[P([r('アイコン',{font:F_GO,size:16,color:SUB,bold:true})],{alignment:AlignmentType.CENTER,spacing:{after:20}}),P([r('顔写真',{font:F_GO,size:14,color:SUB})],{alignment:AlignmentType.CENTER}),P([r('または ロゴ',{font:F_GO,size:14,color:SUB})],{alignment:AlignmentType.CENTER})]
});
const infoCell=new TableCell({
  width:{size:CW-2000,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,margins:{top:120,bottom:120,left:220,right:160},
  borders:{top:bd(4,WHITE),bottom:bd(4,WHITE),left:bd(4,WHITE),right:bd(4,WHITE)},
  children:[
    P([r('安藤｜30代女性の「働き方とお金」整理',{font:F_GO,size:24,color:INK,bold:true})],{spacing:{after:30}}),
    P([r('@career_money_ando',{font:F_GO,size:17,color:SUB})],{spacing:{after:70}}),
    P([r('「今のままでいいのかな」が消えない30代女性へ。退職・転職・副業・お金を“事実ベース”で一緒に整理。煽りません・答えは押しつけません。',{font:F_BODY,size:18,color:INK})],{spacing:{after:40,line:300,lineRule:LineRuleType.AUTO}}),
    P([r('🔗 ',{font:F_GO,size:18,color:BLUE}),r('lin.ee/xxxx（無料「退職前チェックリスト」）',{font:F_GO,size:18,color:BLUE,underline:{}})],{spacing:{after:60}}),
    P([r('［ フォロー ］　［ … ］',{font:F_GO,size:16,color:SUB})],{spacing:{}})
  ]
});
K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[2000,CW-2000],borders:{top:bd(8,WINE),bottom:bd(8,WINE),left:bd(8,WINE),right:bd(8,WINE),insideVertical:bd(4,LINE)},rows:[new TableRow({children:[iconCell,infoCell]})]}));
K.push(P([r('※「フォロー」ボタンやアイコンの丸枠は、実際のThreadsアプリ側で表示されます（上は配置イメージ）。',{font:F_GO,size:15,color:SUB,italics:true})],{spacing:{before:60,after:120}}));

H('① 表示名（どれか。検索＆一目で分かる肩書き）');
copy(['安藤｜30代女性の「働き方とお金」整理','30代の働き方とお金の整理｜安藤','キャリアとお金の整理室（30代女性向け）']);

H('② ユーザーネーム（＠／空きを確認して1つ）');
copy(['career_money_ando','hatarakikata_seiri','career.reset.30']);

H('③ 自己紹介文（bio・3案／150字目安）');
copy([
 '#A（共感型）',
 '「今のままでいいのかな」が消えない30代女性へ。退職・転職・副業・お金を“事実ベース”で一緒に整理。煽りません・答えは押しつけません。▼無料「退職前チェックリスト」は下のリンクから',
 '#B（機能型）',
 '30代女性の「働き方とお金」整理｜失業手当・傷病手当金・退職後のお金をやさしく中立に解説｜“辞める前に知っておきたいこと”を発信｜無料特典は下↓',
 '#C（やわらかめ）',
 '会社員のままでも、辞めても。30代女性の“これからの働き方とお金”を一緒に整理します。制度はやさしく・中立に。無料「退職前チェックリスト」配布中↓'
]);

H('④ リンク（1本だけ）');
copy(['（仕事用LINEの友だち追加URL）　←「無料特典の受け取り先」']);

H('⑤ ピン投稿（固定・そのまま投稿）');
copy(['はじめまして、〇〇です。','「今すぐ辞めたいわけじゃない。でも、このままでいいのかな」——そんな30代女性へ。','退職・転職・副業・お金（失業手当や傷病手当金）を、煽らず・事実ベースで一緒に整理する発信をしています。','答えは押しつけません。まずは“選択肢を知る”ところから。','▼無料「退職前チェックリスト」はプロフィールのLINEから受け取れます（売り込みはしません）。']);

H('⑥ 開設直後の最初の3投稿（プロフを埋める）');
p('1. 自己紹介＆スタンス（上のピン投稿をそのまま）／2. お役立ち＋導線（マニュアルの投稿例②：失業手当の誤解）／3. 保存される一覧（投稿例⑤：退職前チェック）。',{});

H('アカウント設定メモ');
memo([
 'ThreadsはInstagram連携が必須。今の連携先が「HP制作・求人系」なら、この発信用に新しいInstagram（＝新Threads）を作ると世界観が混ざらない。',
 'アイコン：本人の柔らかい写真（信頼が出る）／シンプルなロゴ・イニシャル、どちらでも可。清潔感・安心感を優先。',
 '仕事用の個人LINEは、名前・アイコン・ひとこと・公開範囲（VOOM等）を「仕事用」に整えておく。',
 '誇大・断定はしない（必ず／誰でも／稼げる／もらえる はNG）。中立・やさしいトーンを一貫。'
]);

const doc=new Document({creator:'CAREER RESET & SIDE BUSINESS',title:'Threadsプロフィール設定シート',
 styles:{default:{document:{run:{font:F_BODY,size:20,color:INK},paragraph:{spacing:{line:350,lineRule:LineRuleType.AUTO,after:100}}}}},
 sections:[{properties:{page:{size:{width:PAGE_W,height:16838},margin:{top:1300,bottom:1300,left:MARGIN,right:MARGIN}}},children:K}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(OUT,b);console.log('WROTE',OUT,(b.length/1024).toFixed(0)+'KB');}).catch(e=>{console.error(e);process.exit(1);});
