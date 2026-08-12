const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,AlignmentType,Table,TableRow,TableCell,WidthType,BorderStyle,ShadingType,LineRuleType}=require('docx');
const OUT=process.argv[2]||'freebie.docx';
const INK='23201F',WINE='7A2233',WINE_DK='591826',SUB='7C716B',LINE='D8CCC0',BEIGE='F6EFE3',BLUSH='F8EDEF',WHITE='FFFFFF';
const F_BODY={ascii:'Georgia',hAnsi:'Georgia',eastAsia:'游明朝'};
const F_GO={ascii:'Segoe UI',hAnsi:'Segoe UI',eastAsia:'游ゴシック'};
const PAGE_W=11906,MARGIN=1180,CW=PAGE_W-MARGIN*2;
const r=(t,o={})=>new TextRun(Object.assign({text:t},o));
const P=(runs,o={})=>new Paragraph(Object.assign({children:Array.isArray(runs)?runs:[runs]},o));
const bd=(sz,c)=>({style:BorderStyle.SINGLE,size:sz,color:c});
const K=[];
function sec(t){K.push(P([r(t,{font:F_GO,size:23,color:WINE_DK,bold:true})],{spacing:{before:240,after:90},border:{left:{style:BorderStyle.SINGLE,size:22,color:WINE,space:8}},indent:{left:120}}));}
function p(t,o){K.push(P([r(t,Object.assign({font:F_BODY,size:20,color:INK},o||{}))],{spacing:{after:80,line:360,lineRule:LineRuleType.AUTO}}));}
function chk(items){items.forEach(t=>K.push(P([r('☐  ',{font:F_GO,size:24,color:WINE}),r(t,{font:F_BODY,size:20,color:INK})],{spacing:{after:90,line:330,lineRule:LineRuleType.AUTO},indent:{left:420,hanging:420}})));}
function box(title,items,style){
  const bg=style==='point'?BLUSH:BEIGE, tc=WINE_DK;
  const inner=[];
  if(title) inner.push(P([r(title,{font:F_GO,size:19,color:tc,bold:true})],{spacing:{after:70}}));
  items.forEach((it,i)=>inner.push(P([r(it,{font:F_BODY,size:19,color:INK})],{spacing:{after:i===items.length-1?0:60,line:340,lineRule:LineRuleType.AUTO}})));
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:bg},margins:{top:160,bottom:160,left:230,right:210},borders:{top:bd(4,bg),bottom:bd(4,bg),right:bd(4,bg),left:{style:BorderStyle.SINGLE,size:26,color:WINE}}});
  K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(4,bg),bottom:bd(4,bg),left:bd(4,bg),right:bd(4,bg)},rows:[new TableRow({children:[c]})]}));
  K.push(P([r('',{})],{spacing:{after:110}}));
}

// header
K.push(P([r('CAREER RESET & SIDE BUSINESS ｜ 無料プレゼント',{font:F_GO,size:17,color:SUB,characterSpacing:20})],{spacing:{after:30}}));
K.push(P([r('退職前チェックリスト',{font:F_GO,size:40,color:WINE_DK,bold:true})],{spacing:{after:20}}));
K.push(P([r('辞める前に確認したい「お金と手続き」',{font:F_GO,size:22,color:WINE})],{spacing:{after:120},border:{bottom:bd(12,WINE)}}));
p('「なんとなく辞めたい」と思ったとき、いちばん不安になるのが“お金”です。このリストは、退職を決める前・進める前に確認しておきたいことを1枚にまとめたものです。チェックを付けながら、抜けがないか見てみてください。',{});
p('※本資料は一般的な情報提供です。制度は改正される場合があり、受給の可否や金額は個人の条件によって異なります。実際の手続き・可否・金額は、必ず各公的窓口の最新情報でご確認ください。',{font:F_GO,size:16,color:SUB,italics:true});

sec('① 会社に確認すること');
chk(['就業規則（退職の申し出時期・手続き）を確認した','有給休暇の残日数を確認した','退職日を決めた（月末／月中で社会保険料の扱いが変わることも）','最終給与・賞与の支払い日を確認した','離職票の受け取り方法・時期を確認した（失業手当の手続きに必要）','会社からの貸与物・返却物を確認した']);

sec('② 失業手当（雇用保険の基本手当）');
chk(['自分の雇用保険の加入期間を確認した（受給資格の目安：原則、離職前2年間に通算12か月以上）','離職理由（自己都合／会社都合など）で扱いが変わることを理解した','「退職翌日からすぐ振込」ではないと知った（7日の待期＋自己都合は原則1か月の給付制限）','金額は“年収では決まらない”（離職前6か月の賃金・年齢・理由で変わる）と理解した','所定給付日数の目安を確認した（自己都合など一般の離職者：10年未満90日／10〜20年120日／20年以上150日）','ハローワークで自分の条件を確認する予定を立てた']);

sec('③ 傷病手当金（病気・けがで働けないとき）※失業手当とは別制度');
chk(['「健康保険の傷病手当金」と「雇用保険の失業手当」は“別物”だと理解した','支給の目安（連続3日の待期を含め4日以上休み・その間の給与がない等）を確認した','支給期間は「支給開始日から通算して1年6か月」と知った','詳細・可否は加入している健康保険（協会けんぽ等）で確認する予定を立てた']);

sec('④ 退職後に発生するお金');
chk(['健康保険をどうするか比較した（任意継続＝退職翌日から20日以内／国民健康保険＝14日以内／家族の扶養）','国民年金への切替（14日以内）と、免除・納付猶予の制度を確認した','住民税は前年の所得に課税され、辞めても支払いが続くと理解した']);

sec('⑤ 生活費・資金');
chk(['毎月の最低生活費を把握した','無収入でも数か月分の生活費が必要だと理解した','今の貯金で何か月もつか、ざっくり計算した']);

sec('⑥ 公的窓口で確認する（最終チェック）');
chk(['ハローワーク（失業手当・再就職手当）','加入している健康保険（傷病手当金・任意継続）','市区町村（国民健康保険・国民年金・住民税）','年金事務所（国民年金）']);

box('よくある3つの誤解',[
 '×「退職したらすぐ失業手当がもらえる」→ 待期7日＋自己都合は原則1か月の給付制限があります。',
 '×「年収で金額が決まる」→ 賃金日額・年齢・離職理由などで変わります。',
 '×「傷病手当金と失業手当は同時にもらって得できる」→ 前提が逆（働けない／働ける）で、原則として同時には受けられません。'
],'point');

box('この3人、あなたに近いのは？（本編のケースお試し版）',[
 'CASE 01｜32歳・年収350万・事務職：「このまま10年働いていい？」→ 続ける・転職・副業・退職後を比較。',
 'CASE 02｜30歳・年収300万・販売職：「働いてもお金が貯まらない」→ 本業＋副業で収入源を増やす。',
 'CASE 03｜34歳・年収250万・契約社員：「将来大丈夫かな」→ 複数の選択肢を比較（“低収入＝退職”とは考えません）。'
]);

sec('出典・確認先');
p('本資料の制度に関する記載は、2026年8月8日時点で公開されている、厚生労働省・ハローワーク・全国健康保険協会（協会けんぽ）・日本年金機構・国税庁・各自治体の情報を参照しています。制度は改正される場合があるため、利用時は必ず最新の公的情報をご確認ください。',{font:F_GO,size:17,color:SUB});

box('“自分の場合”を整理したい方へ',[
 'このチェックリストで「気になった項目」があれば、そこだけでも一緒に整理できます。',
 'LINEから【無料相談（30分・オンライン）】も承っています。売り込みはしません／その場で決める必要もありません。',
 'さらに詳しく学べる本編（3人のケース教材＋失業手当・傷病手当金の詳しい解説＋90日サポート）もあります。気になる方はLINEでお気軽に。'
],'point');
p('※無料相談・本編は、収入や給付の結果を保証するものではありません。本資料は法律・税務・社会保険等の個別助言ではありません。',{font:F_GO,size:15,color:SUB,italics:true});

const doc=new Document({creator:'CAREER RESET & SIDE BUSINESS',title:'退職前チェックリスト（無料特典）',
 styles:{default:{document:{run:{font:F_BODY,size:20,color:INK},paragraph:{spacing:{line:360,lineRule:LineRuleType.AUTO,after:100}}}}},
 sections:[{properties:{page:{size:{width:PAGE_W,height:16838},margin:{top:1300,bottom:1300,left:MARGIN,right:MARGIN}}},children:K}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(OUT,b);console.log('WROTE',OUT,(b.length/1024).toFixed(0)+'KB');}).catch(e=>{console.error(e);process.exit(1);});
