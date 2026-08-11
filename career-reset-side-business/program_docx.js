const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,AlignmentType,Table,TableRow,TableCell,WidthType,BorderStyle,ShadingType,LineRuleType,VerticalAlign}=require('docx');
const OUT=process.argv[2]||'program.docx';
const INK='23201F',WINE='7A2233',WINE_DK='591826',SUB='7C716B',LINE='D8CCC0',GRAY='F3F1EF',BEIGE='F6EFE3',WHITE='FFFFFF';
const F_BODY={ascii:'Georgia',hAnsi:'Georgia',eastAsia:'游明朝'};
const F_GO={ascii:'Segoe UI',hAnsi:'Segoe UI',eastAsia:'游ゴシック'};
const PAGE_W=11906,MARGIN=1134,CW=PAGE_W-MARGIN*2;
const r=(t,o={})=>new TextRun(Object.assign({text:t},o));
const P=(runs,o={})=>new Paragraph(Object.assign({children:Array.isArray(runs)?runs:[runs]},o));
const bd=(sz,c)=>({style:BorderStyle.SINGLE,size:sz,color:c});
const kids=[];

kids.push(P([r('CAREER RESET & SIDE BUSINESS',{font:F_GO,size:20,color:SUB,characterSpacing:20})],{spacing:{after:20}}));
kids.push(P([r('30万円プログラム設計（面談1回＋非ライブ支援）＋メンバーペイ販売ページ（改訂版）',{font:F_GO,size:26,color:WINE_DK,bold:true})],{spacing:{after:120},border:{bottom:bd(12,WINE)}}));
kids.push(P([r('このファイルは【A プログラム設計（あなた向け）】【B 商品説明（コピペ用）】【C 特商法（コピペ用）】【D 補足メモ】で構成しています。〔　〕を埋め、「▼コピペここから」〜「▲コピペここまで」をメンバーペイの各欄へ貼り付けてください。',{font:F_BODY,size:20,color:INK})],{spacing:{after:220,line:340,lineRule:LineRuleType.AUTO}}));

function h(t){kids.push(P([r(t,{font:F_GO,size:24,color:WINE_DK,bold:true})],{spacing:{before:240,after:80},border:{left:{style:BorderStyle.SINGLE,size:22,color:WINE,space:8}},indent:{left:120}}));}
function sub(t){kids.push(P([r(t,{font:F_GO,size:20,color:WINE_DK,bold:true})],{spacing:{before:140,after:50}}));}
function para(t){kids.push(P([r(t,{font:F_BODY,size:20,color:INK})],{spacing:{after:80,line:350,lineRule:LineRuleType.AUTO}}));}
function marker(t,top){kids.push(P([r(t,{font:F_GO,size:18,color:WINE,bold:true})],{spacing:{before:top?120:60,after:60}}));}
function table(headers,rows,widths){
  const W=widths||headers.map(()=>Math.floor(CW/headers.length));
  const cell=(txt,i,fill,head)=>new TableCell({children:[P([r(String(txt),{font:head?F_GO:F_BODY,size:head?18:19,color:head?WHITE:INK,bold:!!head})],{spacing:{after:0,line:300,lineRule:LineRuleType.AUTO},alignment:AlignmentType.LEFT})],shading:{type:ShadingType.CLEAR,color:'auto',fill:fill},verticalAlign:VerticalAlign.CENTER,margins:{top:80,bottom:80,left:130,right:110},width:{size:W[i],type:WidthType.DXA}});
  const trs=[new TableRow({children:headers.map((hh,i)=>cell(hh,i,WINE_DK,true))})];
  rows.forEach((row,ri)=>trs.push(new TableRow({children:row.map((c,i)=>cell(c,i,ri%2?BEIGE:WHITE,false))})));
  kids.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:W,borders:{top:bd(4,LINE),bottom:bd(4,LINE),left:bd(4,LINE),right:bd(4,LINE),insideHorizontal:bd(4,LINE),insideVertical:bd(4,LINE)},rows:trs}));
  kids.push(P([r('',{})],{spacing:{after:120}}));
}
function copyBlock(lines){
  const inner=lines.map((ln,i)=>{
    if(ln.h) return P([r(ln.h,{font:F_GO,size:ln.big?24:20,color:ln.big?WINE_DK:INK,bold:true})],{spacing:{before:i?120:0,after:60,line:340,lineRule:LineRuleType.AUTO}});
    if(ln.hr) return P([r('',{})],{spacing:{after:40},border:{bottom:bd(4,LINE)}});
    return P([r(ln.t||'',{font:F_BODY,size:19,color:INK})],{spacing:{after:60,line:350,lineRule:LineRuleType.AUTO}});
  });
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:GRAY},margins:{top:200,bottom:200,left:240,right:240},borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)}});
  kids.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(6,LINE),bottom:bd(6,LINE),left:bd(6,LINE),right:bd(6,LINE)},rows:[new TableRow({children:[c]})]}));
}
function memoBlock(lines){
  const inner=lines.map((ln,i)=> ln.h ? P([r(ln.h,{font:F_GO,size:19,color:WINE_DK,bold:true})],{spacing:{before:i?120:0,after:50}}) : P([r('・'+ln.t,{font:F_BODY,size:19,color:INK})],{spacing:{after:50,line:340,lineRule:LineRuleType.AUTO},indent:{left:260,hanging:260}}));
  const c=new TableCell({children:inner,shading:{type:ShadingType.CLEAR,color:'auto',fill:BEIGE},margins:{top:180,bottom:180,left:240,right:220},borders:{top:bd(4,BEIGE),bottom:bd(4,BEIGE),right:bd(4,BEIGE),left:{style:BorderStyle.SINGLE,size:26,color:WINE}}});
  kids.push(new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],borders:{top:bd(4,BEIGE),bottom:bd(4,BEIGE),left:bd(4,BEIGE),right:bd(4,BEIGE)},rows:[new TableRow({children:[c]})]}));
  kids.push(P([r('',{})],{spacing:{after:120}}));
}

// ===== A 設計 =====
h('A. プログラム設計（あなた向け・販売ページには載せません）');
para('ライブ面談は「購入時90分×1回」に固定。そのうえで、あなたの都合で提供できる“非ライブ（記述・動画・メール）”の支援を足して、90日間の価値を担保します。これにより、ライブ工数を増やさずに30万円の説明力・満足度・返金リスク低減を両立します。');
sub('■ 提供内容（30万円の裏付け）');
table(['提供物','内容','狙い（価値）'],[
 ['① 教材本体','PDF/Word 約50ページ（3人のケース／働き方4選択肢／失業手当・傷病手当金の詳解／退職後のお金／副業比較）','土台となる知識と全体像'],
 ['② 個別セッション（1回・90分）','ご購入時に実施：現状の棚卸し／方向性の設計／90日の進め方の設計','“自分ごと”に落とす（ライブは1回）'],
 ['③ 個別カルテ／アクションプラン','事前ヒアリング→あなた専用の整理を「記述」でお渡し（一度きり）','意思決定を形に（非ライブ）'],
 ['④ 90日メール質問サポート','期間中のご質問に回答（目安◯営業日以内・回数上限は要設定）','詰まりを都度解消（非ライブ）'],
 ['⑤ 動画・音声解説','事前収録：教材の要点、失業手当・傷病手当金のポイント','繰り返し学べる（工数一定）'],
 ['⑥ テンプレ／チェックリスト','退職前後の段取り確認など','手戻り防止'],
 ['⑦ 30日返金保証','セッション受講後に満足なければ30日以内の申出で全額返金','高額の安心設計'],
]);
memoBlock([
 {h:'正直な補足'},
 {t:'ライブ面談1回＋教材で30万円は、価値づけとしては強気の部類です。上の「非ライブ支援＋返金保証＋実績・お客様の声（実在のみ）」をしっかり用意することが前提になります。立ち上げ期は、モニター価格や強い保証で信頼を補うのも有効です。'},
]);
sub('■ このプログラムが“しないこと”（重要な線引き）');
memoBlock([
 {t:'雇用保険・健康保険・税などの「個別の受給可否の判断」「手続き代行」は行わない（社会保険労務士・税理士・弁護士等の領域）。情報整理と選択肢提示までを伴走し、確認先（ハローワーク・協会けんぽ・年金事務所・自治体・専門家）へ案内する。無資格での個別判断・代行は法令抵触リスクがあるため必ず線を引く。'},
 {t:'収入増・給付金の受給・副業やECの収益を「保証」しない。成果は「思考の整理と意思決定の支援」であって金銭的成果ではない。'},
 {t:'EC（fedick等）は希望者のみ紹介。勧誘しない。紹介料を受け取る場合は開示。プログラムの価値をEC収入に結びつけない。'},
]);
sub('■ 価格の考え方');
para('300,000円（税込）＝「教材＋個別セッション1回（90分）＋個別カルテ＋90日メール質問サポート＋動画・音声解説＋30日返金保証」の総合対価。ライブは1回でも、記述カルテ・動画・メールで継続的な支援価値を担保します。納得度は提供者（安藤様）の専門性・実績・お客様の声（実在・許可済みのみ）が支えます。');

// ===== B 商品説明 =====
h('B. 商品説明（メンバーペイ「商品説明」欄へ）');
marker('▼ コピペここから',true);
copyBlock([
 {big:true,h:'CAREER RESET & SIDE BUSINESS ｜ 個別サポートプログラム（90日）'},
 {h:'女性のための「これからの働き方と収入源」を、専門的な視点で一緒に整理する90日プログラム'},
 {t:'読むだけで終わらせない。3人のケース教材をベースに、あなたの状況に合わせて「今の仕事を続ける・転職する・会社員＋副業・退職後の選択肢」を整理します。ご購入時の個別セッション（90分）で方向性を一緒に設計し、その後は個別カルテ・動画解説・90日のメール質問サポートで、あなたのペースの実行を支えます。'},
 {hr:true},
 {h:'■ プログラムに含まれるもの'},
 {t:'・教材本体（PDF・約50ページ）：3人のケース／働き方4選択肢／失業手当・傷病手当金の詳解／退職後のお金／副業比較'},
 {t:'・個別オンラインセッション（90分・1回）：ご購入時に、現状の棚卸しと方向性を一緒に設計'},
 {t:'・あなた専用の個別カルテ／アクションプラン（記述でお渡し）'},
 {t:'・90日間のメール質問サポート（期間中のご質問にお答えします）'},
 {t:'・動画・音声解説（教材の要点／失業手当・傷病手当金のポイント）'},
 {t:'・テンプレート／チェックリスト集'},
 {t:'・30日間の返金保証（下記条件つき）'},
 {h:'■ こんな方に'},
 {t:'・今の働き方に違和感があり、選択肢を一度きちんと整理したい'},
 {t:'・退職・転職を考えているが、辞めたあとのお金や段取りが不安'},
 {t:'・副業に興味はあるが、自分に合うものを一緒に考えたい'},
 {h:'■ このプログラムが“しないこと”（正直にお伝えします）'},
 {t:'・これは「あなたが自分で意思決定するのを支える伴走」です。特定の選択（退職・副業・EC等）を勧めるものではありません。'},
 {t:'・雇用保険・健康保険・税などの個別の受給可否の判断や、手続きの代行は行いません（公的窓口や社会保険労務士・税理士等の専門家の領域です）。情報の整理と選択肢の提示までを行い、必要な確認先へご案内します。'},
 {t:'・収入が増えること、給付金が受け取れること、副業・ECで稼げることを保証するものではありません。'},
 {h:'■ 形式・期間・価格'},
 {t:'・オンライン（セッションはZoom等・90分×1回）。プログラム期間：ご購入日から90日。'},
 {t:'・教材・動画はご購入後にご案内。セッション日程は購入後に調整します。'},
 {t:'・価格：300,000円（税込）'},
 {t:'・30日間返金保証：個別セッションを受けたうえでご満足いただけない場合、購入後30日以内にお申し出いただければ全額返金します（詳細条件は特商法・保証規定に記載）。'},
]);
marker('▲ コピペここまで');

// ===== C 特商法 =====
h('C. 特定商取引法に基づく表記（メンバーペイ「特商法」欄へ）');
marker('▼ コピペここから',true);
copyBlock([
 {h:'特定商取引法に基づく表記'},
 {t:'販売事業者：株式会社Social Quality'},
 {t:'運営統括責任者：安藤嘉啓'},
 {t:'所在地：ご請求があれば遅滞なく開示します'},
 {t:'電話番号：ご請求があれば遅滞なく開示します'},
 {t:'メールアドレス：〔連絡先メールアドレス〕'},
 {t:'販売価格：300,000円（税込）'},
 {t:'商品代金以外の必要料金：なし（オンライン提供のため送料等は不要／通信料はお客様負担）'},
 {t:'提供内容：デジタル教材（PDF）および解説動画の提供、オンライン個別セッション（90分・1回）、個別カルテの作成・提供、90日間のメール質問サポート等の役務'},
 {t:'提供期間：ご購入日から90日間（個別セッションの日程はご購入後に調整します）'},
 {t:'お支払い方法：クレジットカード等（メンバーペイが対応する決済方法）'},
 {t:'お支払い時期：ご購入手続き時に確定します'},
 {t:'商品・役務の提供時期：教材・動画は決済完了後ただちにダウンロードURL等をご案内します。個別セッションは日程調整のうえ1回実施し、メール質問サポートはプログラム期間（90日）中に提供します'},
 {t:'返品・キャンセル：デジタル教材の性質上、購入後の返品・返金は原則お受けできません。ただし「30日間返金保証」の条件（個別セッションを受けたうえで、ご購入後30日以内にお申し出）を満たす場合は、当社規定により全額返金します。なお、通信販売のため特定商取引法上のクーリング・オフ制度の適用はありません。ファイルが開けない等の不具合は下記メールアドレスへご連絡ください'},
 {t:'動作環境：PDF・動画が視聴できる環境、およびオンライン個別セッションが可能な通信環境（カメラ・マイク等）'},
]);
marker('▲ コピペここまで');

// ===== D メモ =====
h('D. 補足メモ（コンプラ・運用／貼り付け不要）');
memoBlock([
 {h:'【メールサポートの範囲を決める】'},
 {t:'負担が読めなくなるので、回数上限（例：期間内10問まで）か「無制限だが回答は◯営業日以内」を決め、販売ページ／特商法の〔目安◯営業日以内〕を具体化し、その通り運用する。'},
 {h:'【動画・音声は事前収録で工数一定】'},
 {t:'一度作れば全購入者に使い回せる＝ライブ時間を増やさず価値を足せる。教材の要点＋失業手当／傷病手当金の解説を各10〜20分で数本用意すると効果的。'},
 {h:'【個別セッションは1回＝オンボーディングに集中】'},
 {t:'90分で「現状整理→方向性→90日の使い方」まで導く設計に。録画を本人に渡すと満足度が上がる（要同意）。'},
 {h:'【士業の線引き（最重要）】'},
 {t:'「あなたは失業手当を○円もらえる」「この手続きをすれば受給できる」等の個別の可否判断・断定・手続き代行はしない（社労士・税理士・弁護士の独占業務）。制度の考え方・選択肢の整理までにとどめ、可否・手続きは公的窓口／専門家へ案内。'},
 {h:'【成果を保証しない】'},
 {t:'「必ず収入が上がる／年収アップ／給付がもらえる／ECで稼げる」等はNG（景表法・特商法）。約束は“意思決定の支援”であって金銭的成果ではない、と一貫させる。'},
 {h:'【返金保証は条件を明確に】'},
 {t:'「個別セッションを受けたうえで、購入後30日以内に申し出」など条件をはっきり書き、その通り運用する（保証をうたって応じないのは違反）。'},
 {h:'【EC（fedick）紹介】'},
 {t:'希望者のみ・勧誘しない・報酬や収益を保証しない・紹介料を受け取るなら開示。価格の根拠をEC収入に結びつけない。'},
 {h:'【売り方・その他】'},
 {t:'対面はご説明まで（購入は本人がオンラインで＝訪問販売化を回避）。口コミ・実績は実在・許可済みのみ。分割販売時は総額・回数・各回金額を明示。高額かつ役務を含むため、最終文面・返金規定・EC紹介の座組は消費者庁「特定商取引法ガイド」確認または行政書士・弁護士のレビューを推奨。本資料は一般的な情報提供で法的助言ではありません。'},
]);

const doc=new Document({creator:'CAREER RESET & SIDE BUSINESS',title:'30万円プログラム設計＋販売ページ改訂',
 styles:{default:{document:{run:{font:F_BODY,size:20,color:INK},paragraph:{spacing:{line:350,lineRule:LineRuleType.AUTO,after:100}}}}},
 sections:[{properties:{page:{size:{width:PAGE_W,height:16838},margin:{top:1276,bottom:1276,left:MARGIN,right:MARGIN}}},children:kids}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(OUT,b);console.log('WROTE',OUT,(b.length/1024).toFixed(0)+'KB');}).catch(e=>{console.error(e);process.exit(1);});
