const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,AlignmentType,Table,TableRow,TableCell,WidthType,BorderStyle,ShadingType,LineRuleType,VerticalAlign}=require('docx');
const OUT=process.argv[2]||'threads.docx';
const INK='23201F',WINE='7A2233',WINE_DK='591826',SUB='7C716B',LINE='D8CCC0',GRAY='F3F1EF',BEIGE='F6EFE3',WHITE='FFFFFF';
const F_BODY={ascii:'Georgia',hAnsi:'Georgia',eastAsia:'游明朝'};
const F_GO={ascii:'Segoe UI',hAnsi:'Segoe UI',eastAsia:'游ゴシック'};
const PAGE_W=11906,MARGIN=1134,CW=PAGE_W-MARGIN*2;
const r=(t,o={})=>new TextRun(Object.assign({text:t},o));
const P=(runs,o={})=>new Paragraph(Object.assign({children:Array.isArray(runs)?runs:[runs]},o));
const bd=(sz,c)=>({style:BorderStyle.SINGLE,size:sz,color:c});
const K=[];
function H1(t){K.push(P([r(t,{font:F_GO,size:28,color:WINE_DK,bold:true})],{spacing:{after:120},border:{bottom:bd(12,WINE)}}));}
function H(t){K.push(P([r(t,{font:F_GO,size:23,color:WINE_DK,bold:true})],{spacing:{before:240,after:70},border:{left:{style:BorderStyle.SINGLE,size:22,color:WINE,space:8}},indent:{left:120}}));}
function sub(t){K.push(P([r(t,{font:F_GO,size:20,color:WINE_DK,bold:true})],{spacing:{before:130,after:40}}));}
function p(t){K.push(P([r(t,{font:F_BODY,size:20,color:INK})],{spacing:{after:70,line:350,lineRule:LineRuleType.AUTO}}));}
function li(items){items.forEach(t=>K.push(P([r('・',{font:F_GO,size:20,color:WINE,bold:true}),r(t,{font:F_BODY,size:20,color:INK})],{spacing:{after:40,line:340,lineRule:LineRuleType.AUTO},indent:{left:300,hanging:300}})));}
function num(items){items.forEach((t,i)=>K.push(P([r((i+1)+'. ',{font:F_GO,size:20,color:WINE,bold:true}),r(t,{font:F_BODY,size:20,color:INK})],{spacing:{after:40,line:340,lineRule:LineRuleType.AUTO},indent:{left:320,hanging:320}})));}
function copy(lines){
  const inner=lines.map((ln,i)=> ln==='' ? P([r('',{})],{spacing:{after:40}}) : (ln.startsWith('#')?P([r(ln.slice(1),{font:F_GO,size:19,color:WINE_DK,bold:true})],{spacing:{before:i?100:0,after:40}}):P([r(ln,{font:F_BODY,size:19,color:INK})],{spacing:{after:30,line:330,lineRule:LineRuleType.AUTO}})));
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:GRAY},margins:{top:180,bottom:180,left:230,right:230},borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)}});
  K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)},rows:[new TableRow({children:[c]})]}));
  K.push(P([r('',{})],{spacing:{after:100}}));
}
function memo(lines){
  const inner=lines.map((t,i)=>P([r('・'+t,{font:F_BODY,size:19,color:INK})],{spacing:{after:40,line:330,lineRule:LineRuleType.AUTO},indent:{left:260,hanging:260}}));
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:BEIGE},margins:{top:160,bottom:160,left:240,right:220},borders:{top:bd(4,BEIGE),bottom:bd(4,BEIGE),right:bd(4,BEIGE),left:{style:BorderStyle.SINGLE,size:26,color:WINE}}});
  K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(4,BEIGE),bottom:bd(4,BEIGE),left:bd(4,BEIGE),right:bd(4,BEIGE)},rows:[new TableRow({children:[c]})]}));
  K.push(P([r('',{})],{spacing:{after:100}}));
}
function tbl(headers,rows){
  const W=headers.map((_,i)=> i===0?Math.round(CW*0.16):Math.floor(CW*0.84/(headers.length-1)));
  const cell=(t,i,fill,head)=>new TableCell({children:[P([r(String(t),{font:head?F_GO:F_BODY,size:head?17:18,color:head?WHITE:INK,bold:!!head})],{spacing:{after:0,line:280,lineRule:LineRuleType.AUTO}})],shading:{type:ShadingType.CLEAR,color:'auto',fill},verticalAlign:VerticalAlign.CENTER,margins:{top:70,bottom:70,left:110,right:90},width:{size:W[i],type:WidthType.DXA}});
  const trs=[new TableRow({children:headers.map((h,i)=>cell(h,i,WINE_DK,true))})];
  rows.forEach((row,ri)=>trs.push(new TableRow({children:row.map((c,i)=>cell(c,i,ri%2?BEIGE:WHITE,false))})));
  K.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:W,borders:{top:bd(4,LINE),bottom:bd(4,LINE),left:bd(4,LINE),right:bd(4,LINE),insideHorizontal:bd(4,LINE),insideVertical:bd(4,LINE)},rows:trs}));
  K.push(P([r('',{})],{spacing:{after:110}}));
}

H1('Threads →（仕事用LINE）→ 無料相談アポ｜完全マニュアル');
p('目的：Threadsの発信から「無料相談（アポ）」を安定して生み出し、90日プログラム（30万円）につなげる。受け皿は“あなたの仕事用LINE”（個人アカウント）。売り込みは投稿でせず、価値提供→導線→手動フォロー→相談の順で信頼を積みます。');
memo([
 '個人LINE（仕事用）は、公式LINEと違い「自動のステップ配信」ができません＝あいさつ・フォローはすべて手動。ただし初期の少人数なら手動で十分回せます（むしろ1対1で温かい）。',
 '個人アカウントは相手にプロフィール・VOOM等が見えます。仕事用として名前・アイコン・ひとこと・公開範囲を整えておく。',
 '大量の一斉送信はNG（規約制限・ブロックの元）。1対1で丁寧に。',
 '電話番号に紐づくため、公開は「友だち追加URL／QRコード」で（ID検索は迷惑追加が来やすい）。',
 '登録者が増えて手動が回らなくなったら、その時に公式LINE（無料・自動配信可）へ移行を検討。'
]);

H('0. 全体の流れ（これを回すだけ）');
num(['Threads投稿（毎日）で認知と共感をつくる','プロフィールから 仕事用LINE（友だち追加URL）へ誘導し、無料特典を渡す','追加された人へ、手動であいさつ＋特典→数日後にフォロー','「無料相談（30分）」の予約へ','相談で90日プログラムをご案内']);
sub('数値の目安（月3件から逆算）');
li(['無料相談：月8〜10件','LINE友だち追加：月30〜40件','プロフクリック：月150〜200','→ そのために毎日1〜2投稿＋丁寧なリプ。まず「友だち追加数」を追う。']);

H('1. プロフィール設計（アポの土台）');
p('プロフィールは“24時間働く営業マン”。投稿で興味を持った人が最初に見る場所です。');
copy([
 '#名前（検索と一目で分かる肩書を）',
 '安藤｜30代女性の「働き方とお金」整理',
 '',
 '#自己紹介文（bio・150字目安）',
 '「今のままでいいのかな」が消えない30代女性へ。',
 '退職・転職・副業・お金（失業手当や傷病手当金）を、"事実ベース"で一緒に整理します。',
 '煽りません／答えは押し付けません。',
 '▼無料「退職前チェックリスト」プレゼント中',
 '（LINE友だち追加URL）',
 '',
 '#リンク：LINE友だち追加URL 1本（無料特典の受け取り先）',
 '#ピン投稿：自己紹介＋無料特典の案内を固定'
]);

H('2. 投稿の型（フォーマット）');
p('1投稿＝「フック（1行目）＋本文（3〜7行・1行1メッセージ）＋CTA」。フックが9割です。');
li(['頻度：まず毎日1〜2投稿（1本でも継続が最優先）','時間帯：朝7〜8時／昼12時／夜20〜22時のどれか','リプ運用：関連発信者へ丁寧なリプを1日5〜10（露出が増える）','伸ばすコツ：最後を「問いかけ」で締めて返信を誘う／“一覧・まとめ”は保存されやすい','CTA：毎回売り込まない。週1〜2回「プロフのLINEで無料特典」へ誘導する“導線投稿”を混ぜる']);

H('3. フック（1行目）テンプレ20');
p('コピーして、内容に合わせて調整してください。');
copy([
 '1. 「今すぐ辞めたいわけじゃない。でも、このままでいいのかな」',
 '2. 退職したら“すぐ”失業手当がもらえる、と思っていませんか？',
 '3. 年収は同じでも、もらえる失業手当は人によって違います。',
 '4. 「辞めてから考える」は、いちばんお金が不安になります。',
 '5. 30代で“働き方のモヤモヤ”が出るのは、あなただけじゃない。',
 '6. 退職前に確認しないと損しやすい「お金」5つ。',
 '7. 病気で働けない時の「傷病手当金」、失業手当とは別物です。',
 '8. 副業＝稼げる、ではありません。まず知るべきこと。',
 '9. 「転職すれば収入が上がる」とは限らない話。',
 '10. 会社を辞める前に、私がやっておけばよかったこと。',
 '11. 年収250万・300万・350万。3人の30代女性の分かれ道。',
 '12. “退職した方が得”とは、私は言いません。',
 '13. 失業手当は「退職翌日から振込」ではありません。',
 '14. 退職後、手取りがそのまま使えるわけじゃない理由。',
 '15. 「副業何がいい？」の前に決めるべきこと。',
 '16. 貯金が思うように増えない30代へ。',
 '17. 在宅・副業に興味はあるけど、何が向くか分からない人へ。',
 '18. 「なんとなく不安」を、事実に置き換えると軽くなる。',
 '19. 会社員だけの収入に不安を感じ始めたら読んでほしい。',
 '20. 退職・転職・副業。ぜんぶ“選択肢”にすぎません。'
]);

H('4. そのまま使える完成投稿例（6本）');
sub('① 共感型');
copy(['「今すぐ辞めたいわけじゃない。でも、このままでいいのかな」','','30代になると、この感覚がふっと出てきます。','仕事が嫌いなわけじゃない。生活も回ってる。','でも、40代・50代の自分を想像すると、少し不安。','','大事なのは「辞める／辞めない」の二択にしないこと。','続けながら選択肢を並べるだけでも、気持ちは軽くなります。','','あなたは今、どんなモヤモヤがありますか？']);
sub('② お役立ち型（失業手当の誤解）※導線あり');
copy(['退職したら“すぐ”失業手当がもらえる、と思っていました。','','実は自己都合だと「7日の待期＋原則1か月の給付制限」があり、すぐには振り込まれません。','金額も“年収で決まる”わけではなく、離職前6か月の賃金・年齢・理由で変わります。','','「知らずに辞めて生活費が…」を避けるには、辞める前の確認が大切。','※制度は改正あり。最新はハローワークで確認を。','','退職前に確認する項目をまとめた無料PDFを、プロフのLINEでお配りしています。']);
sub('③ ケース型');
copy(['年収250万・34歳・契約社員のケース。','','「このままの収入で将来大丈夫かな」と不安。','でも“年収が低いから辞める”とは考えません。','転職・雇用形態の変更・現職＋副業…と、複数の道を並べて比べます。','','同じ30代女性でも、置かれた状況で「現実的な選択」は変わる。','','3人のケースの続きは、プロフのLINEで読めます。']);
sub('④ スタンス型（信頼づくり）');
copy(['“退職した方が得”とは、私は言いません。','','退職が正解でも、副業が正解でもない。','大事なのは、自分の収入・生活・時間・リスクを整理したうえで選ぶこと。','','だから私は、答えを押し付けず「選択肢の整理」をお手伝いしています。','煽って不安にさせる発信は、しません。']);
sub('⑤ 比較型（保存されやすい）');
copy(['退職前に確認したい「お金」チェック（保存推奨）','','◻ 失業手当：待期7日＋自己都合は原則1か月の給付制限','◻ 健康保険：任意継続／国保／扶養、どれが得か','◻ 国民年金：切替と免除','◻ 住民税：辞めても前年分がかかる','◻ 生活費：無収入でも数か月分は必要','','詳しい一覧は、プロフのLINEから無料で受け取れます。']);
sub('⑥ 導線型（特典告知・週1）');
copy(['【無料プレゼント】退職前チェックリスト','','「辞める前に何を確認すればいい？」を1枚にまとめました。','・失業手当／傷病手当金の基本','・退職後にかかるお金','・3人のケースお試し版','','受け取りは、プロフィールのLINEから。売り込みはしません🙆']);

H('5. 30日 投稿カレンダー（曜日の型）');
p('“何を投稿するか”で迷わないよう、曜日にテーマを固定します。ネタは上のフック集から。');
tbl(['曜日','投稿テーマ'],[
 ['月','共感（働き方のモヤモヤ）'],
 ['火','お役立ち（失業手当・お金の基本）※導線'],
 ['水','ケース（3人の1人を小出し）'],
 ['木','お役立ち（傷病手当金／退職後のお金）'],
 ['金','スタンス／想い（信頼づくり）'],
 ['土','まとめ・一覧（保存される投稿）'],
 ['日','導線（無料特典・相談の案内）']
]);
li(['週7本が理想。難しければ火・水・金・日の週4本でもOK（導線の火・日は必ず）。','伸びた投稿は数日後に言い換えて再投稿（使い回しOK）。']);

H('6. Threads → 仕事用LINE の導線');
li(['友だち追加URLを取得：LINEアプリ「ホーム → 友だち追加 → QRコード（マイQR）／リンクを共有」で https://line.me/ti/p/～ が出ます。これを使う。','Threadsのプロフィールのリンク欄（またはピン投稿）に「▼働き方・お金の無料相談＆特典はLINEから（友だち追加URL）」を置く。','投稿のCTAは「詳しくはプロフィールのLINEから受け取れます」。','コメント誘導（任意）：「“気になる”とコメントくれた方に、受け取り方を返信します」→ 手動対応。','週1〜2回、上記⑥のような“特典告知”投稿を入れる。','注意：投稿に外部リンクを貼ると伸びづらい傾向。本文では“プロフから”が無難。']);

H('7. 仕事用LINE側（手動運用のテンプレ）');
p('個人LINEは自動配信ができないので、次の3〜4通を“手動”で送ります。定型文として保存しておき、コピペで対応すると楽です。');
sub('① 追加された直後（あいさつ＋特典）');
copy(['はじめまして、〇〇です！追加ありがとうございます😊','お約束の『退職前チェックリスト』はこちらです → （特典URL）','30代の“働き方とお金”の整理をしています。','気になることがあれば気軽にメッセージくださいね（売り込みはしません）。']);
sub('② 2〜3日後のフォロー');
copy(['その後いかがですか？','チェックリストで“気になった項目”があれば、そこだけでも一緒に整理できますよ。','よくあるのが「失業手当は退職後すぐもらえる？」という誤解で…（※一般的な説明。可否や金額は人により異なります）。']);
sub('③ 無料相談の案内');
copy(['よければ30分の無料相談（オンライン）で、あなたの状況に合わせて選択肢を整理できます。','その場で決める必要はありませんし、売り込みもしません。','ご希望ならこちらの日程からどうぞ → （日程調整リンク）']);
sub('運用のコツ');
li(['「誰に・どこまで送ったか」を簡単なメモ（スプレッドシート）で管理（氏名/追加日/特典送付/フォロー/相談日）。','1日の対応枠を決める（例：朝と夜に10分ずつ）。','人数が増えて手が回らなくなったら公式LINEへ移行（そのとき過去の友だちにも一斉配信できて楽に）。']);

H('8. 無料相談（アポ）の“見せ方”でアポ率が変わる');
li(['名前をつける：「働き方・お金の整理 無料相談（30分）」','3つの約束を明記：①売り込みしない ②その場で決めなくていい ③持ち帰りメモを渡す','予約はワンタップ（日程調整ツールのリンク／LINEのトークでも可）','「相談＝営業」ではなく「整理の時間」と伝えるとハードルが下がる']);

H('9. コメント・DM → LINE誘導／アポ化 返信テンプレ');
copy(['#Threadsの「気になる」等のコメントへ','コメントありがとうございます！受け取り方をお送りしますね。プロフィールのLINEから「退職前チェックリスト」を無料で受け取れます😊','','#ThreadsのDMで質問が来たとき','ご連絡ありがとうございます。詳しくお話しできるので、よければLINEからどうぞ → （友だち追加URL）。特典『退職前チェックリスト』もそこでお渡しします😊','','#LINEで具体的な質問が来たとき','その状況だと〇〇の観点が大事ですね（一般的な説明）。個別の数字に関わる部分は、無料相談（30分）で一緒に整理できます。よければこちらから日程をどうぞ → （リンク）','','※いきなり30万の話はしない。まず“整理の相談”へ。']);

H('10. KPIボード（毎週記録）');
tbl(['指標','見るポイント'],[
 ['投稿数／インプレッション','継続と露出（まず量）'],
 ['プロフィールクリック','投稿→プロフの興味度'],
 ['LINE友だち追加数','導線の強さ（最重要の先行指標）'],
 ['相談予約数','追加→アポの転換'],
 ['相談実施・成約','クロージング']
]);
p('ボトルネックは「友だち追加数」と「相談化率」に出やすい。数字を見て、フック・導線・特典を毎週改善。');

H('11. 注意（コンプラ＆アカウント保護）');
memo([
 '誇大・断定はNG：「必ず／誰でも／絶対もらえる／〇万円もらえる／簡単に稼げる」は使わない。',
 '成果を保証しない：給付・収入・ECの結果は保証しない。制度は「考え方」まで、可否・手続きは公的窓口／専門家へ（社労士等の独占業務に踏み込まない）。',
 'お客様の声・実績は実在・許可済みのみ（架空・盛りはステマ規制／景表法違反）。',
 'Threads：同一文の大量投稿・自動化・大量フォロー/DMはスパム判定→凍結。手動で自然に。',
 '仕事用LINE：不特定多数への一斉送信は避け、1対1で。追加時に「何が届くか」を明示。個人情報（電話番号）に紐づく点に留意し、公開は友だち追加URL／QRで。',
 '対面クロージングはしない（購入はオンライン本人＝訪問販売化を回避）。'
]);
p('本資料は一般的な情報提供であり、法的助言ではありません。最終的な文面は消費者庁の最新情報の確認、または専門家にご相談ください。');

const doc=new Document({creator:'CAREER RESET & SIDE BUSINESS',title:'Threads→アポ 完全マニュアル（仕事用LINE版）',
 styles:{default:{document:{run:{font:F_BODY,size:20,color:INK},paragraph:{spacing:{line:350,lineRule:LineRuleType.AUTO,after:100}}}}},
 sections:[{properties:{page:{size:{width:PAGE_W,height:16838},margin:{top:1276,bottom:1276,left:MARGIN,right:MARGIN}}},children:K}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(OUT,b);console.log('WROTE',OUT,(b.length/1024).toFixed(0)+'KB');}).catch(e=>{console.error(e);process.exit(1);});
