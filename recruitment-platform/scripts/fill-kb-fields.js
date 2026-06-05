'use strict';
/**
 * 求人ボックス必須フィールド 一括自動入力スクリプト
 * recruitment-platform/ ディレクトリで実行:
 *   node --experimental-sqlite scripts/fill-kb-fields.js
 */

(function loadEnv() {
  const fs = require('fs'), path = require('path');
  const envFile = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
})();

const { Jobs } = require('../db-factory');

// ── 職種別テンプレート ────────────────────────────────────────────
const TEMPLATES = [
  {
    match: (j) => /ドライバー|配送|宅配|軽貨物|配達|デリバリー/.test(j.title + j.job_type),
    rewarding:       'お客様の大切な荷物を安全・確実にお届けする達成感があります。自分のペースで働けるため、自由度高く稼げる魅力的な仕事です。',
    worktimeHoliday: '8:00〜19:00のうちシフト制（実働8時間程度）　週休2日以上　年間休日105日以上　シフト相談OK',
    transportation:  '担当エリア内をルート配送　車通勤必須（駐車場完備）　各エリアのセンターへ直接出勤',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
  {
    match: (j) => /介護|ケア|福祉|デイサービス|老人ホーム/.test(j.title + j.job_type),
    rewarding:       '利用者様の笑顔と感謝の言葉が大きなやりがいです。未経験でも丁寧な研修があり、資格取得支援制度も充実しています。',
    worktimeHoliday: '早番7:00〜16:00 / 日勤9:00〜18:00 / 遅番12:00〜21:00（シフト制）　週休2日　年間休日110日',
    transportation:  '最寄り駅より徒歩10分以内　バス通勤・車通勤OK（駐車場完備）',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
  {
    match: (j) => /看護|ナース|病棟|クリニック/.test(j.title + j.job_type),
    rewarding:       '患者様の回復をそばで支える充実感があります。スキルアップ支援・研修制度が充実しており、長く活躍できる職場です。',
    worktimeHoliday: '日勤8:30〜17:30 / 夜勤16:30〜翌9:00（2交代制または3交代制）　週休2日　年間休日120日以上',
    transportation:  '最寄り駅より徒歩5〜10分　院内駐車場あり（車・バイク通勤OK）',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
  {
    match: (j) => /調理|キッチン|シェフ|料理|飲食/.test(j.title + j.job_type),
    rewarding:       'お客様においしいと言っていただける瞬間が一番のやりがいです。本格的な料理技術を身につけながら成長できる環境です。',
    worktimeHoliday: '11:00〜15:00 / 17:00〜22:00（分割シフト）　週休2日（月曜定休+他1日）　年間休日105日',
    transportation:  '最寄り駅より徒歩3〜5分　電車・バス通勤可',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
  {
    match: (j) => /営業/.test(j.title + j.job_type),
    rewarding:       'お客様の課題解決に貢献できる達成感と、成果が給与に直結するインセンティブ制度が魅力です。実力次第で高収入を実現できます。',
    worktimeHoliday: '9:00〜18:00（実働8時間）　土日祝休み　年間休日120日以上　残業月平均20時間以内',
    transportation:  '最寄り駅より徒歩5分以内　電車通勤推奨（交通費全額支給）',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
  {
    match: (j) => /エンジニア|プログラマ|開発|システム/.test(j.title + j.job_type),
    rewarding:       '自分の書いたコードが多くのユーザーに使われる達成感があります。最新技術を学べる環境と、フルリモート・フレックスで自由な働き方が魅力です。',
    worktimeHoliday: 'フレックスタイム制（コアタイム10:00〜15:00）　土日祝休み　年間休日125日以上　リモートワーク可',
    transportation:  '最寄り駅より徒歩5分以内　リモートワーク併用可（週2〜3日出社）',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
  {
    match: (j) => /事務|受付|オフィス/.test(j.title + j.job_type),
    rewarding:       'チームを支える縁の下の力持ちとして、会社全体に貢献できる充実感があります。定時退社できるため、プライベートも大切にできます。',
    worktimeHoliday: '9:00〜18:00（実働8時間）　土日祝休み　年間休日120日　残業ほぼなし（月平均5時間以内）',
    transportation:  '最寄り駅より徒歩5分以内　電車通勤推奨（交通費全額支給）',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
  {
    // デフォルト（上記に該当しない場合）
    match: () => true,
    rewarding:       'チームと協力しながら成果を出す達成感があります。研修・資格支援制度が充実しており、未経験からでも安心してスタートできます。',
    worktimeHoliday: '9:00〜18:00（実働8時間）　週休2日制　年間休日110日以上',
    transportation:  '最寄り駅より徒歩10分以内　車通勤相談可',
    howToApply:      '下記URLよりWebでご応募ください。書類選考後、担当者よりご連絡いたします。',
  },
];

function getTemplate(job) {
  return TEMPLATES.find(t => t.match(job));
}

(async () => {
  const jobs = await Jobs.findAll();
  console.log(`求人数: ${jobs.length}件`);

  let updated = 0;
  for (const job of jobs) {
    const tpl = getTemplate(job);
    const updates = {};

    if (!job.rewarding)         updates.rewarding        = tpl.rewarding;
    if (!job.worktime_holiday)  updates.worktimeHoliday  = tpl.worktimeHoliday;
    if (!job.transportation)    updates.transportation   = tpl.transportation;
    if (!job.how_to_apply)      updates.howToApply       = tpl.howToApply;

    if (Object.keys(updates).length === 0) {
      console.log(`⏭  スキップ（入力済み）: ${job.title}`);
      continue;
    }

    await Jobs.update(job.id, updates);
    console.log(`✅ 更新: ${job.title}`);
    console.log(`   やりがい: ${(updates.rewarding || job.rewarding || '').slice(0, 30)}...`);
    console.log(`   勤務時間: ${(updates.worktimeHoliday || job.worktime_holiday || '').slice(0, 30)}...`);
    console.log(`   アクセス: ${(updates.transportation || job.transportation || '').slice(0, 30)}...`);
    updated++;
  }

  console.log(`\n完了: ${updated}件を更新しました`);
})();
