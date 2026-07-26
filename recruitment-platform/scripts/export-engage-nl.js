#!/usr/bin/env node
'use strict';
/**
 * engage投稿用の求人JSONを書き出す（NOWLIVE 移動販売車の送迎ドライバー）。
 * 求人ボックスで仕上げた最終版の内容を、engageの各欄（仕事内容/勤務時間/休日/待遇/
 * 応募資格）に分けて入るように整形して engage-nl.json を出力する。
 *
 * 実行:  node scripts/export-engage-nl.js
 * 生成:  engage-nl.json（カレントに出力）
 * 使い方: python scripts/engage_poster.py engage-nl.json
 */

const fs = require('fs');
const path = require('path');

const job = {
  id: 'nl-engage-movingsales',
  company: 'nl',
  // engageの「求人タイトル（キャッチ）」← catchcopy、「職種名」← jobType
  catchcopy: '未経験歓迎！移動販売車（キッチンカー）の送迎ドライバー｜月給36万円〜46万円｜完全週休二日制',
  title: '移動販売車の送迎ドライバー',
  jobType: '移動販売車の送迎ドライバー',
  // 勤務地（engageは 都道府県＋市区町村＋住所 に分解される）
  location: '大阪府大阪市中央区',
  // 給与（月給 下限〜上限を自動抽出）
  salary: '月給360,000円〜460,000円',
  // 仕事内容（engageの work_contents）— 給与/休日/待遇は別欄に入れるので、ここには含めない
  description:
`食品催事やイベント会場へ、移動販売車（キッチンカー）を送迎（回送）するドライバーのお仕事です。

【会社について】
株式会社NOWLIVEは「ワクワクする未来を選ぶ」を理念に、食品催事事業・イベントプロモーション事業を展開しています。人気スイーツや地域の特産品など多彩な商品をお客様へお届けしており、その現場を支えているのが移動販売車の送迎・物流です。ドライバーは会社の最前線で活躍する大切なポジションです。

【お任せするお仕事】
・移動販売車（キッチンカー）を催事・イベント会場へ送迎（回送）
・イベント資材の搬入・搬出、積み込み・積み下ろし
・各拠点・取引先へのルート配送
・出発前の車両点検、簡単な清掃
※普通自動車免許（AT限定可）があればOK。決まった会場・ルートが中心で、未経験の方も安心してスタートできます。

【この仕事の魅力】
◆ イベント・催事の“最前線”を支えるやりがい
◆ 未経験・ブランクの方も歓迎、先輩が丁寧にサポート
◆ 「やってみたい」という気持ちを尊重する社風
◆ 普通自動車免許があればOK・特別な経験は不要`,
  // 事業内容（engageの business_content 相当・参考）
  business_content:
`・食品催事事業（催事の企画・運営）
・イベントプロモーション事業
・配送、物流サポート`,
  // 勤務時間（engageの office_hours）
  worktime_holiday: '9:00〜21:00の間で実働8時間（休憩あり）のシフト制',
  // 休日・休暇（engageの holiday）
  holiday:
`・完全週休二日制（シフト制）
・年間休日110日以上
・有給休暇（入社半年後に付与）
・夏季休暇／年末年始休暇／慶弔休暇
・産前産後休暇・育児休暇／特別休暇`,
  // 待遇・福利厚生（engageの treatment）
  benefit:
`・各種社会保険完備（健康保険・厚生年金・雇用保険・労災保険）
・交通費支給（規定内）／車通勤OK
・社用車・ガソリン代は会社負担（自己負担なし）
・制服貸与／資格取得支援制度／研修制度あり
・服装・髪型自由（清潔感のある範囲で）
・昇給あり（年1回）／賞与あり（業績に応じて支給）
・各種手当あり／試用期間3ヶ月（期間中も給与・待遇に変更なし）
・固定残業代なし（残業が発生した場合は別途全額支給）`,
  // 応募資格（engageの qualification）
  qualifications:
`・普通自動車運転免許（AT限定可）
・未経験歓迎／ブランクOK／学歴不問`,
  // 選考プロセス（engageの selection_process_contents_01）
  how_to_apply: 'ご応募後、採用担当よりご連絡いたします。面接日程を調整させていただきます。',
  tags: ['未経験OK', '正社員', '普通免許OK', 'ブランクOK', '送迎', '配送', '大阪', 'イベント'],
};

const outPath = path.join(process.cwd(), 'engage-nl.json');
fs.writeFileSync(outPath, JSON.stringify([job], null, 2), 'utf8');
console.log(`✅ 書き出しました: ${outPath}`);
console.log('次: python scripts\\engage_poster.py engage-nl.json');
