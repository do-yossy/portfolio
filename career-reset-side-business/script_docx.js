const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,AlignmentType,Table,TableRow,TableCell,WidthType,BorderStyle,ShadingType,LineRuleType}=require('docx');
const OUT=process.argv[2]||'script.docx';
const INK='23201F',WINE='7A2233',WINE_DK='591826',SUB='7C716B',LINE='D8CCC0',GRAY='F3F1EF',BEIGE='F6EFE3',WHITE='FFFFFF';
const F_BODY={ascii:'Georgia',hAnsi:'Georgia',eastAsia:'游明朝'};
const F_GO={ascii:'Segoe UI',hAnsi:'Segoe UI',eastAsia:'游ゴシック'};
const PAGE_W=11906,MARGIN=1180,CW=PAGE_W-MARGIN*2;
const r=(t,o={})=>new TextRun(Object.assign({text:t},o));
const P=(runs,o={})=>new Paragraph(Object.assign({children:Array.isArray(runs)?runs:[runs]},o));
const bd=(sz,c)=>({style:BorderStyle.SINGLE,size:sz,color:c});
const K=[];
function H1(t){K.push(P([r(t,{font:F_GO,size:27,color:WINE_DK,bold:true})],{spacing:{before:140,after:110},border:{bottom:bd(12,WINE)}}));}
function H(t){K.push(P([r(t,{font:F_GO,size:22,color:WINE_DK,bold:true})],{spacing:{before:230,after:60},border:{left:{style:BorderStyle.SINGLE,size:22,color:WINE,space:8}},indent:{left:120}}));}
function sub(t){K.push(P([r(t,{font:F_GO,size:19,color:WINE_DK,bold:true})],{spacing:{before:120,after:40}}));}
function p(t,o){K.push(P([r(t,Object.assign({font:F_BODY,size:20,color:INK},o||{}))],{spacing:{after:70,line:350,lineRule:LineRuleType.AUTO}}));}
function li(items){items.forEach(t=>K.push(P([r('・',{font:F_GO,size:20,color:WINE,bold:true}),r(t,{font:F_BODY,size:20,color:INK})],{spacing:{after:40,line:340,lineRule:LineRuleType.AUTO},indent:{left:300,hanging:300}})));}
function num(items){items.forEach((t,i)=>K.push(P([r((i+1)+'. ',{font:F_GO,size:20,color:WINE,bold:true}),r(t,{font:F_BODY,size:20,color:INK})],{spacing:{after:40,line:340,lineRule:LineRuleType.AUTO},indent:{left:340,hanging:340}})));}
function say(lines){
  const inner=lines.map((ln,i)=> ln==='' ? P([r('',{})],{spacing:{after:30}}) : (ln.startsWith('#')?P([r(ln.slice(1),{font:F_GO,size:18,color:WINE_DK,bold:true})],{spacing:{before:i?90:0,after:30}}):P([r('「'+ln+'」',{font:F_BODY,size:19,color:INK})],{spacing:{after:30,line:330,lineRule:LineRuleType.AUTO}})));
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:GRAY},margins:{top:170,bottom:170,left:230,right:220},borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)}});
  K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)},rows:[new TableRow({children:[c]})]}));
  K.push(P([r('',{})],{spacing:{after:90}}));
}
function plain(lines){ // like say() but no quotes (for 依頼文/設問)
  const inner=lines.map((ln,i)=> ln==='' ? P([r('',{})],{spacing:{after:30}}) : (ln.startsWith('#')?P([r(ln.slice(1),{font:F_GO,size:18,color:WINE_DK,bold:true})],{spacing:{before:i?90:0,after:30}}):P([r(ln,{font:F_BODY,size:19,color:INK})],{spacing:{after:30,line:330,lineRule:LineRuleType.AUTO}})));
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
function fieldLine(label){K.push(P([r(label+'：',{font:F_GO,size:19,color:INK}),r('　＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿',{font:F_BODY,size:19,color:'BBB0A8'})],{spacing:{after:120}}));}

H1('無料相談トークスクリプト ＆ お客様の声テンプレ');
p('①「働き方・お金の整理 無料相談（30分・オンライン）」で使う進行台本と、②受講後に“お客様の声”を集めるための依頼文・設問・同意フォームです。売り込まず、相手が自分で決められるよう支える設計にしています。',{});

H1('① 無料相談トークスクリプト（30分・オンライン）');
memo([
 '目的は「売る」ではなく「一緒に整理する」。価値を体感してもらえれば、必要な人は自然と前に進みます。',
 '対面でも“その場決済”はしない（購入はご本人がオンラインで＝訪問販売化を回避）。',
 '給付・収入・ECの結果は保証しない。受給の可否・手続きの個別判断はしない（公的窓口／専門家へ案内）。',
 'NGワード：今だけ／必ず／絶対／誰でも／稼げる／もらえる／その場で決めて。'
]);

H('STEP 1 アイスブレイク＆前提共有（〜2分）');
say(['今日はお時間ありがとうございます。','今日は“売り込み”ではなく、〇〇さんの働き方とお金を一緒に整理する時間です。','その場で何かを決める必要はないので、気楽にお話しくださいね。','（もし合わなければ、遠慮なく「今日はここまで」で大丈夫です。）']);

H('STEP 2 ヒアリング（〜10分・ここが8割）');
p('話すより「聴く」。相手に7割話してもらう。うなずき・要約をはさむ。');
say(['#聞く順番の例','今日、相談してみようと思ったきっかけは何でしたか？','今の働き方で、「いいな」と思うところと、「気になる」ところは？','収入・時間・将来のうち、いちばん引っかかっているのはどれですか？','「こうなったらいいな」という理想を、言葉にするとどんな感じですか？','これまで、ご自分で調べたり試したことはありますか？']);

H('STEP 3 現状の整理・フィードバック（〜8分）');
p('聞いた内容を要約して返す→論点を2つに絞る→選択肢を並べる。ここで“価値”を体感してもらう。');
say(['お聞きした感じだと、論点は大きく2つですね。①〇〇 と ②△△。','選択肢としては「続ける・転職・今の仕事＋副業・退職して立て直す」と並びますが、','〇〇さんの場合は、先に△△を確かめると迷いがぐっと減りそうです。','（※失業手当や傷病手当金は、可否や金額が人によって違うので、最終的にはハローワークや健康保険の窓口で確認する前提でお話ししますね。）']);

H('STEP 4 提案（〜5分・無理に勧めない）');
say(['ここまでを一人で続けるのは、正直けっこう大変なんです。','もしご希望なら、90日で一緒に整理して、行動まで進める個別サポートがあります。','内容は「教材＋90分の個別セッション＋あなた専用の整理カルテ＋90日メールサポート＋動画解説」で、','価格は300,000円（税込）。初回セッション後30日の返金保証もつけています。','もちろん、合わなければ断っていただいて大丈夫です。']);

H('STEP 5 質問対応・意思確認（〜3分）');
say(['気になる点があれば、なんでも聞いてください。','今すぐ決める必要はありません。持ち帰って考えていただいてOKです。','もし進めるなら、こちらのページからご自身でお手続きいただけます（オンライン）。','迷っている段階でしたら、そのままで大丈夫ですよ。']);

H('STEP 6 クロージング（〜2分）');
say(['今日は話してみて、どうでしたか？','（決めきれない場合）ぜひ一度持ち帰って、ご自分のペースで考えてみてください。質問はLINEでいつでもどうぞ。','今日はありがとうございました。']);

H('反論・ためらいへの誠実な対応');
sub('「高い」と感じている');
say(['そう感じるのは自然だと思います。価格の理由は、教材だけでなく“90日の伴走と返金保証”がついている点です。','とはいえ、今のタイミングで無理に、とは思いません。まず無料の範囲でできることからでも大丈夫です。']);
sub('「迷う」');
say(['迷うポイントは、具体的にどのあたりですか？','（言語化を手伝う）持ち帰ってOKですし、30日の返金保証があるので、始めてから合わなければ止められます。']);
sub('「家族に相談したい」');
say(['もちろんです。資料をお渡しするので、落ち着いて相談してください。','（期限や特典で急かさない）また気持ちが固まったら、LINEで教えてくださいね。']);

H('うまく進めるコツ');
li(['沈黙を怖がらない（相手が考える時間）。','否定しない・答えを押し付けない。「整理を手伝う人」に徹する。','相手の言葉をそのまま使って要約する（信頼が生まれる）。','制度の“断定”はしない。「一般的にはこう、詳しくは窓口で」を徹底。','「決めなくていい」と何度も伝える（高額ほど安心が背中を押す）。']);

H1('② お客様の声（体験談）取得テンプレ');
memo([
 '最重要：実在し、許可を得た人の声だけを掲載する。架空・盛った成果例はステマ規制・景品表示法違反。',
 '「収入が増える／給付がもらえる」など、成果を保証すると誤解される表現は載せない。',
 '掲載する範囲（掲載名・年代・職業・写真）は、必ず本人の同意した範囲で。',
 '掲載時は「※個人の感想です。成果や効果を保証するものではありません。」を必ず添える。'
]);

H('依頼文（受講後・モニター後にLINE等で送る）');
plain(['先日はありがとうございました！','差し支えなければ、これから同じように悩む方の参考に、簡単な感想をいただけませんか？','3〜5分で終わります。','載せ方（お名前をイニシャルにする等）は、ご希望に合わせますのでご安心ください。','▼こちらの質問に答えていただく形でOKです']);

H('感想アンケート（設問）');
num([
 '受ける前は、どんなことに悩んでいましたか？',
 '受けてみようと思ったきっかけは何でしたか？',
 '受けてみて、気持ちや考えはどう変わりましたか？',
 '具体的に、行動に移せたこと・決められたことはありますか？',
 'いちばん印象に残ったこと・役に立ったことは何ですか？',
 'どんな人におすすめしたいですか？',
 '最後に、一言お願いします。'
]);

H('掲載についての同意（本人記入）');
p('以下について、掲載してよい範囲に○を付け、ご記入ください。',{});
fieldLine('掲載するお名前（実名／イニシャル／ニックネーム のいずれか）');
fieldLine('年代・職業（任意）');
K.push(P([r('写真の掲載：　可　・　不可',{font:F_GO,size:19,color:INK})],{spacing:{after:120}}));
K.push(P([r('掲載してよい媒体：　SNS　・　販売ページ　・　LINE　・　その他（　　　　　）',{font:F_GO,size:19,color:INK})],{spacing:{after:120}}));
fieldLine('同意日');
fieldLine('お名前（署名）');
p('※いただいた内容は、上記で同意いただいた範囲でのみ使用します。掲載後の削除希望にも対応します。',{font:F_GO,size:16,color:SUB,italics:true});

p('本資料は一般的な情報提供であり、法的助言ではありません。表記や運用の適法性は、消費者庁の最新情報の確認、または専門家にご相談ください。',{font:F_GO,size:15,color:SUB,italics:true});

const doc=new Document({creator:'CAREER RESET & SIDE BUSINESS',title:'無料相談トークスクリプト＆お客様の声テンプレ',
 styles:{default:{document:{run:{font:F_BODY,size:20,color:INK},paragraph:{spacing:{line:350,lineRule:LineRuleType.AUTO,after:100}}}}},
 sections:[{properties:{page:{size:{width:PAGE_W,height:16838},margin:{top:1300,bottom:1300,left:MARGIN,right:MARGIN}}},children:K}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(OUT,b);console.log('WROTE',OUT,(b.length/1024).toFixed(0)+'KB');}).catch(e=>{console.error(e);process.exit(1);});
