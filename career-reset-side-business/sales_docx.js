const fs=require('fs'),path=require('path');
const {Document,Packer,Paragraph,TextRun,AlignmentType,Table,TableRow,TableCell,WidthType,BorderStyle,ShadingType,LineRuleType,HeadingLevel}=require('docx');
const OUT=process.argv[2]||'membperpay.docx';
const INK='23201F',WINE='7A2233',WINE_DK='591826',SUB='7C716B',LINE='D8CCC0',GRAY='F3F1EF',BEIGE='F6EFE3';
const F_BODY={ascii:'Georgia',hAnsi:'Georgia',eastAsia:'游明朝'};
const F_GO={ascii:'Segoe UI',hAnsi:'Segoe UI',eastAsia:'游ゴシック'};
const PAGE_W=11906,MARGIN=1134,CW=PAGE_W-MARGIN*2;
const r=(t,o={})=>new TextRun(Object.assign({text:t},o));
const P=(runs,o={})=>new Paragraph(Object.assign({children:Array.isArray(runs)?runs:[runs]},o));
function b(sz,c){return{style:BorderStyle.SINGLE,size:sz,color:c};}

const kids=[];
// header
kids.push(P([r('メンバーペイ用（コピペ用）',{font:F_GO,size:20,color:SUB,characterSpacing:20})],{spacing:{after:40}}));
kids.push(P([r('CAREER RESET & SIDE BUSINESS｜商品説明＋特定商取引法に基づく表記',{font:F_GO,size:30,color:WINE_DK,bold:true})],{spacing:{after:120},border:{bottom:b(12,WINE)}}));
kids.push(P([r('このファイルには【①商品説明（販売ページ）】と【②特定商取引法に基づく表記】が入っています。〔　〕を埋めて、「▼コピペここから」〜「▲コピペここまで」の間を選択コピーし、メンバーペイの該当欄（商品説明欄／特商法欄）に貼り付けてください。',{font:F_BODY,size:20,color:INK})],{spacing:{after:80,line:340,lineRule:LineRuleType.AUTO}}));
kids.push(P([r('※本資料は一般的な情報提供であり、法的助言ではありません。最終的な文面・運用の適法性は、消費者庁の最新情報の確認、または行政書士等の専門家にご確認ください。',{font:F_GO,size:16,color:SUB,italics:true})],{spacing:{after:240}}));

function sectionTitle(t){ kids.push(P([r(t,{font:F_GO,size:24,color:WINE_DK,bold:true})],{spacing:{before:200,after:60},border:{left:{style:BorderStyle.SINGLE,size:22,color:WINE,space:8}},indent:{left:120}})); }
function marker(t,top){ kids.push(P([r(t,{font:F_GO,size:18,color:WINE,bold:true})],{spacing:{before:top?120:60,after:60},alignment:AlignmentType.LEFT})); }
// copy block: one gray-filled cell containing many paragraphs
function copyBlock(lines){
  const inner=lines.map((ln,i)=>{
    if(ln.h) return P([r(ln.h,{font:F_GO,size:ln.big?24:20,color:ln.big?WINE_DK:INK,bold:true})],{spacing:{before:i?120:0,after:60,line:340,lineRule:LineRuleType.AUTO}});
    if(ln.hr) return P([r('',{})],{spacing:{after:40},border:{bottom:b(4,LINE)}});
    return P([r(ln.t||'',{font:F_BODY,size:19,color:INK})],{spacing:{after:60,line:350,lineRule:LineRuleType.AUTO}});
  });
  const cell=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:GRAY},margins:{top:200,bottom:200,left:240,right:240},borders:{top:b(6,LINE),bottom:b(6,LINE),left:b(6,LINE),right:b(6,LINE)}});
  kids.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:b(6,LINE),bottom:b(6,LINE),left:b(6,LINE),right:b(6,LINE)},rows:[new TableRow({children:[cell]})]}));
}
function memoBlock(lines){
  const inner=lines.map((ln,i)=> ln.h ? P([r(ln.h,{font:F_GO,size:19,color:WINE_DK,bold:true})],{spacing:{before:i?120:0,after:50}}) : P([r('・'+ln.t,{font:F_BODY,size:19,color:INK})],{spacing:{after:50,line:340,lineRule:LineRuleType.AUTO},indent:{left:260,hanging:260}}));
  const cell=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:BEIGE},margins:{top:180,bottom:180,left:240,right:220},borders:{top:b(4,BEIGE),bottom:b(4,BEIGE),right:b(4,BEIGE),left:{style:BorderStyle.SINGLE,size:26,color:WINE}}});
  kids.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:b(4,BEIGE),bottom:b(4,BEIGE),left:b(4,BEIGE),right:b(4,BEIGE)},rows:[new TableRow({children:[cell]})]}));
}

// ===== ① 商品説明 =====
sectionTitle('① 商品説明（メンバーペイの「商品説明」欄へ）');
marker('▼ コピペここから（この下から選択）',true);
copyBlock([
 {big:true,h:'CAREER RESET & SIDE BUSINESS'},
 {h:'30代女性のための「これからの働き方と収入源」を考える実践ガイド'},
 {t:'「今すぐ辞めたいわけじゃない。でも、このままでいいのかな」――そんな30代女性のための、“読むだけ”で考えが整理できるキャリア教材です。'},
 {t:'年収250万円・300万円・350万円の3人の女性のケースを読みながら、現職継続・転職・会社員＋副業・退職後のキャリアという選択肢を、あわてず整理できます。'},
 {hr:true},
 {h:'■ この教材で分かること'},
 {t:'・自分に近いケースを通して、働き方の選択肢を落ち着いて整理できる'},
 {t:'・退職前に知っておきたいお金（失業手当・傷病手当金・健康保険・国民年金・住民税）のしくみ'},
 {t:'・失業手当と傷病手当金の「受給条件／金額の考え方／必要書類／申請手順」を、初心者にも分かる形で'},
 {t:'・年収250/300/350万円の“モデルケース”で、給付額の考え方をイメージ（実額を保証するものではありません）'},
 {t:'・副業の選択肢の比較、EC（ネットショップ運営）という選択肢の基礎'},
 {h:'■ こんな方に'},
 {t:'・今の働き方に、なんとなく違和感がある'},
 {t:'・退職・転職を考えているが、辞めたあとのお金が不安'},
 {t:'・副業に興味はあるが、何が自分に向いているか分からない'},
 {t:'・会社の収入だけに頼ることに、少し不安がある'},
 {h:'■ この教材の特長'},
 {t:'・読むだけで完結：記入やワークは不要。必要な計算は教材の中でモデルケースとして示します。'},
 {t:'・中立的な立ち位置：「退職しましょう」「副業しましょう」と結論を押し付けません。'},
 {t:'・制度は公式情報ベース：厚生労働省・ハローワーク・全国健康保険協会（協会けんぽ）・日本年金機構等の情報を参照し、確認日を明記しています。'},
 {h:'■ 正直にお伝えすること'},
 {t:'・これは「自分で情報を整理して、自分で決める」ための教材です。'},
 {t:'・副業やECで必ず稼げること、給付金が必ず受け取れることを保証するものではありません。金額は制度上の計算方法・教材上のモデルであり、実際の支給額を保証しません。'},
 {t:'・個別相談・面談・継続サポートは含みません。制度の適用可否や具体的な手続きは、各公的窓口でご確認ください。'},
 {t:'・本教材は一般的な情報提供であり、法律・税務・社会保険等についての個別の助言ではありません。'},
 {h:'■ 形式・お渡し・価格'},
 {t:'・デジタルコンテンツ（PDF／Word）。買い切り（1回のお支払い）。'},
 {t:'・ご購入後、ダウンロードでお受け取りいただけます。'},
 {t:'・動作環境：PDF／Wordファイルが閲覧できる環境。'},
 {t:'・価格：〔価格〕円（税込）'},
]);
marker('▲ コピペここまで（この上まで）');

// ===== ② 特商法 =====
sectionTitle('② 特定商取引法に基づく表記（メンバーペイの「特商法」欄へ）');
marker('▼ コピペここから（この下から選択）',true);
copyBlock([
 {h:'特定商取引法に基づく表記'},
 {t:'販売事業者：〔屋号／会社名〕'},
 {t:'運営統括責任者：〔氏名〕'},
 {t:'所在地：ご請求があれば遅滞なく開示します'},
 {t:'電話番号：ご請求があれば遅滞なく開示します'},
 {t:'メールアドレス：〔連絡先メールアドレス〕'},
 {t:'販売価格：各商品ページに税込で表示（本商品：〔価格〕円）'},
 {t:'商品代金以外の必要料金：なし（デジタルコンテンツのため送料不要）'},
 {t:'お支払い方法：クレジットカード等（メンバーペイが対応する決済方法）'},
 {t:'お支払い時期：ご購入手続き時に確定します'},
 {t:'商品の引渡時期：決済完了後、ただちに（またはメールにて）ダウンロードURLをご案内します'},
 {t:'返品・キャンセル：デジタルコンテンツの性質上、購入後の返品・返金は原則お受けできません。ファイルが開けない・ダウンロードできない等の不具合がある場合は、上記メールアドレスまでご連絡ください。内容を確認のうえ、再送等で対応いたします。'},
 {t:'動作環境：PDF／Wordファイルが閲覧できる環境が必要です'},
]);
marker('▲ コピペここまで（この上まで）');

// ===== 補足メモ =====
sectionTitle('補足メモ（貼り付けには含めなくてOK・あなた向け）');
memoBlock([
 {h:'【価格の決め方】'},
 {t:'〔価格〕は、商品説明と特商法の両方に「同じ税込価格」を入れてください。デジタル単品教材の一般的な帯は¥2,980〜¥4,980、複数点セットなら¥7,800〜¥12,800程度が自然です（例：¥4,980）。'},
 {t:'※以前の企画資料では「300,000円（税込）」という高単価の設定の記載もありました。高単価で販売する場合は、販売ページの価値づけ・提供内容・サポートの有無が価格に釣り合うようご検討ください（本教材は個別サポートを含まない読み物型のため、その点も踏まえてお決めください）。'},
 {h:'【住所・電話について】'},
 {t:'ご希望どおり「請求があれば遅滞なく開示します」にしています（特商法で認められた省略方法）。ただし“出さなくてよい”ではなく“求められたらすぐ出す”という意味です。お客様からメール等で請求があったら、遅滞なく住所・電話をお伝えください（対応しないと違反）。'},
 {t:'省略が使えるかはメンバーペイの規約にもよるので、特商法欄で許容されているか一度ご確認を。自宅を出したくない場合はバーチャルオフィス／私書箱も選択肢です。'},
 {h:'【課金は1回きり（買い切り）】'},
 {t:'月額なしなので、メンバーペイは必ず「1回きりの課金（単発決済）」に設定してください。継続課金にしなければ、定期購入の追加表示は不要です。'},
 {h:'【“通信販売”として成立させる】'},
 {t:'対面では説明までにとどめ、購入の判断・手続きは相手自身がオンラインで行う形にしてください。対面でその場の決済まで完結させると「訪問販売」に寄り、書面交付・クーリングオフ8日の義務が別途かかります。'},
 {h:'【口コミ・体験談・成果例】'},
 {t:'実際に許可を得た本人の声だけを掲載してください。架空のレビュー・成果例、および「必ず稼げる／必ずもらえる／◯万円もらえる」等の断定は、ステマ規制・景品表示法・特商法の観点でNGです。無ければ載せない。'},
 {h:'【EC・給付金の表現】'},
 {t:'販売ページでも、EC事業者の報酬額や給付金額を「あなたの収入」として断定しないでください。教材本編と同じく「保証しない・実額は個別に異なる」という姿勢を保つと安全です。'},
]);
kids.push(P([r('本資料は一般的な情報提供であり、法的助言ではありません。最終的な文面・運用の適法性は、消費者庁「特定商取引法ガイド」等の最新情報の確認、または行政書士等の専門家にご相談ください。',{font:F_GO,size:16,color:SUB,italics:true})],{spacing:{before:200,line:320,lineRule:LineRuleType.AUTO}}));

const doc=new Document({creator:'CAREER RESET & SIDE BUSINESS',title:'メンバーペイ 商品説明＋特商法',
 styles:{default:{document:{run:{font:F_BODY,size:20,color:INK},paragraph:{spacing:{line:350,lineRule:LineRuleType.AUTO,after:100}}}}},
 sections:[{properties:{page:{size:{width:PAGE_W,height:16838},margin:{top:1276,bottom:1276,left:MARGIN,right:MARGIN}}},children:kids}]});
Packer.toBuffer(doc).then(buf=>{fs.writeFileSync(OUT,buf);console.log('WROTE',OUT,(buf.length/1024).toFixed(0)+'KB');}).catch(e=>{console.error(e);process.exit(1);});
