'use strict';
// シニアジョブ CSVインポート用エクスポート
// 自社求人DB → シニアジョブの公開求人CSVテンプレ(153列)へ変換する
//
// 使い方:
//   node --experimental-sqlite scripts/seniorjob_csv_export.js [--limit N] [--out path] [--company sq]
//   既定: 公開中のsq求人を全件、UTF-8(BOM付き)で scripts/out/seniorjob-import.csv に出力
//
// ※ シニアジョブは Shift-JIS(JIS) テンプレを想定。UTF-8(BOM)でも多くの環境で取込可能だが、
//   Shift-JISが必須の場合は Windows で次のように変換してください（追加インストール不要）:
//     PowerShell> Get-Content seniorjob-import.csv | Out-File -Encoding Default seniorjob-import-sjis.csv
//
// ※ 一部の必須項目（職種・福利厚生・真偽系）は画面の選択肢のみでは正確な書式が確定しないため、
//   下記マッピングは「推定値」です。まず数件をテスト取込し、弾かれた項目を教えてください。調整します。

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// ── 引数 ──
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(getArg('--limit', '0'), 10) || 0;
const COMPANY = getArg('--company', 'sq');
const OUT = getArg('--out', path.join(__dirname, 'out', 'seniorjob-import.csv'));

const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'recruitment.db')
  : path.join(__dirname, '..', 'data', 'recruitment.db');
const db = new DatabaseSync(DB_PATH);

// ── 153列のヘッダー（テンプレと完全一致）──
const HEADERS = [
  '求人ID','(必須)職種','(必須)簡易職種名','(必須)求人タイトル','(必須)仕事内容','仕事内容の変更範囲',
  '通年で募集する','募集終了予定日','(必須)必須経験不問','必須経験','必須経験備考','いずれかの経験で可',
  '歓迎経験','歓迎経験不問','(必須)普通自動車免許','(必須)必要資格不問','必須資格','いずれかの資格を所持で可',
  '歓迎資格不問','歓迎資格名','(必須)応募年齢上限','学歴','外国語スキル言語','外国語スキルレベル','採用企業ID',
  '(必須)勤務地1分類','勤務地1郵便番号','勤務地1都道府県','勤務地1市区町村','勤務地1詳細住所','勤務地1最寄駅','勤務地1勤務地詳細',
  '勤務地2分類','勤務地2郵便番号','勤務地2都道府県','勤務地2市区町村','勤務地2詳細住所','勤務地2最寄駅','勤務地2勤務地詳細',
  '勤務地3分類','勤務地3郵便番号','勤務地3都道府県','勤務地3市区町村','勤務地3詳細住所','勤務地3最寄駅','勤務地3勤務地詳細',
  '勤務地4分類','勤務地4郵便番号','勤務地4都道府県','勤務地4市区町村','勤務地4詳細住所','勤務地4最寄駅','勤務地4勤務地詳細',
  '勤務地5分類','勤務地5郵便番号','勤務地5都道府県','勤務地5市区町村','勤務地5詳細住所','勤務地5最寄駅','勤務地5勤務地詳細',
  '勤務地6分類','勤務地6郵便番号','勤務地6都道府県','勤務地6市区町村','勤務地6詳細住所','勤務地6最寄駅','勤務地6勤務地詳細',
  '勤務地7分類','勤務地7郵便番号','勤務地7都道府県','勤務地7市区町村','勤務地7詳細住所','勤務地7最寄駅','勤務地7勤務地詳細',
  '勤務地8分類','勤務地8郵便番号','勤務地8都道府県','勤務地8市区町村','勤務地8詳細住所','勤務地8最寄駅','勤務地8勤務地詳細',
  '勤務地9分類','勤務地9郵便番号','勤務地9都道府県','勤務地9市区町村','勤務地9詳細住所','勤務地9最寄駅','勤務地9勤務地詳細',
  '勤務地10分類','勤務地10郵便番号','勤務地10都道府県','勤務地10市区町村','勤務地10詳細住所','勤務地10最寄駅','勤務地10勤務地詳細',
  '勤務地の変更範囲','(必須)車通勤','駐車場','(必須)寮・社宅','寮社宅詳細','(必須)受動喫煙対策','受動喫煙対策詳細',
  '(必須)雇用形態','(必須)試用期間','試用期間備考','管理監督者求人','短期求人','短期求人詳細',
  '(必須)給与形態','(必須)最低給与金額','最高給与金額','給与金額完全歩合制','給与の幅なし',
  '固定残業代(みなし残業代)','固定残業代(みなし残業代)時間','給与備考','(必須)賞与','賞与備考',
  '想定年収下限','想定年収上限','想定年収の幅なし','(必須)勤務日数下限','勤務日数上限','勤務日数の幅なし',
  '(必須)勤務時間','勤務時間詳細','残業有無','(必須)月平均残業時間最小','月平均残業時間最大','月平均残業備考',
  '(必須)休日・休暇','休日・休暇曜日','その他休日・休暇','その他休日が無い','年間休日',
  '(必須)福利厚生','(必須)求人特徴','(必須)在宅勤務','在宅勤務詳細','(必須)時短勤務','時短勤務詳細','未経験者への教育',
  '(必須)採用人数','(必須)選考フロー','(必須)Web面接可否','面接日時に関して',
  '(必須)写真ID1','写真ID2','写真ID3','写真ID4','写真ID5','写真ID6','動画ID',
];

// ── 職種マッピング（自社job_type → シニアジョブの職種）──
// ※ シニアジョブの「職種一覧」タブの正式名称に合わせて要調整。下記は推定値。
const JOBTYPE_MAP = {
  'ルート配送ドライバー（企業配送）': 'ドライバー・配送',
  '軽貨物ドライバー':                 'ドライバー・配送',
  '高時給エリア配送ドライバー':       'ドライバー・配送',
  'ドライバー・配送':                 'ドライバー・配送',
  '軽配送ドライバー':                 'ドライバー・配送',
  'EC配送ドライバー':                 'ドライバー・配送',
  '機械オペレーター（鉄鋼・化学品）': '製造・工場・軽作業',
  '機械オペレーター':                 '製造・工場・軽作業',
  '工場軽作業スタッフ':               '製造・工場・軽作業',
  '製造・工場':                       '製造・工場・軽作業',
  '工場内梱包・仕分け作業員':         '製造・工場・軽作業',
  '工場・倉庫作業員':                 '製造・工場・軽作業',
  '軽作業・物流':                     '製造・工場・軽作業',
  '倉庫内軽作業':                     '製造・工場・軽作業',
  '検品・検査':                       '製造・工場・軽作業',
};
const isDriver = jt => /ドライバー|配送/.test(jt || '');

// ── ヘルパ ──
function parseSalaryNums(salary) {
  const s = (salary || '').replace(/[,，]/g, '');
  let type = '月給';
  if (/時給|時間/.test(s)) type = '時給';
  if (/日給|日当/.test(s)) type = '日給';
  if (/年収|年俸/.test(s)) type = '年俸制';
  if (/完全歩合|フルコミ/.test(s)) type = '完全歩合制';
  const toNum = str => {
    const m = str.match(/([\d.]+)万/);
    if (m) return Math.round(parseFloat(m[1]) * 10000);
    const n = str.match(/\d+/);
    return n ? parseInt(n[0], 10) : null;
  };
  const range = s.match(/([\d.]+万?\d*)\D*[〜～~]\D*([\d.]+万?\d*)/);
  if (range) { const min = toNum(range[1]), max = toNum(range[2]); if (min && max) return { min, max, type }; }
  const single = toNum(s);
  return single ? { min: single, max: '', type } : { min: '', max: '', type };
}
function splitLocation(loc) {
  const l = (loc || '').trim();
  const pref = l.match(/^(.{2,3}[都道府県])/)?.[1] || '';
  let rest = pref ? l.slice(pref.length) : l;
  // 市区町村（…市/区/町/村 まで）を抽出
  const city = rest.match(/^(.+?[市區区町村郡])/)?.[1] || rest;
  return { pref, city, full: l };
}
// CSVクォート（RFC4180）
const q = v => {
  const s = (v == null ? '' : String(v));
  return '"' + s.replace(/"/g, '""') + '"';
};

// ── 求人取得 ──
let sql = `SELECT * FROM jobs WHERE is_published=1 AND company=? ORDER BY created_at DESC`;
let rows = db.prepare(sql).all(COMPANY);
if (LIMIT > 0) rows = rows.slice(0, LIMIT);

// ── 行生成 ──
function buildRow(j) {
  const base = (j.job_type || '').replace(/（.*?）/g, '').trim();
  const shokushu = JOBTYPE_MAP[j.job_type] || JOBTYPE_MAP[base] || (isDriver(j.job_type) ? 'ドライバー・配送' : '製造・工場・軽作業');
  const sal = parseSalaryNums(j.salary);
  const { pref, city, full } = splitLocation(j.location);
  const driver = isDriver(j.job_type);

  // 列名→値 の辞書（未指定列は空文字）
  const m = {};
  for (const h of HEADERS) m[h] = '';

  m['求人ID'] = '';                                   // 空=新規作成（再取込で上書きしたい場合は固定IDを設定）
  m['(必須)職種'] = shokushu;                          // ※職種一覧に合わせて要確認
  m['(必須)簡易職種名'] = `${base}【${j.employment_type || '正社員'}】`.slice(0, 30);
  m['(必須)求人タイトル'] = (j.title || '').slice(0, 60);
  m['(必須)仕事内容'] = j.description || '';
  m['募集終了予定日'] = j.expires_at ? j.expires_at.slice(0, 10) : '';
  m['(必須)必須経験不問'] = '1';                       // 全求人 未経験OK
  m['(必須)普通自動車免許'] = driver ? '必須(AT限定可)' : '不問';
  m['(必須)必要資格不問'] = '1';
  m['(必須)応募年齢上限'] = '年齢不問';
  m['学歴'] = '不問';

  m['(必須)勤務地1分類'] = '市区町村';
  m['勤務地1都道府県'] = pref;
  m['勤務地1市区町村'] = city;
  m['勤務地1勤務地詳細'] = full;

  m['(必須)車通勤'] = driver ? '車可' : '車可';
  m['駐車場'] = '無料駐車(輪)場あり';
  m['(必須)寮・社宅'] = 'なし';
  m['(必須)受動喫煙対策'] = '禁煙';

  m['(必須)雇用形態'] = j.employment_type || '正社員';
  m['(必須)試用期間'] = 'あり';

  m['(必須)給与形態'] = sal.type;
  m['(必須)最低給与金額'] = sal.min || '';
  m['最高給与金額'] = sal.max || '';
  m['(必須)賞与'] = 'あり';

  m['(必須)勤務日数下限'] = '5';
  m['(必須)勤務時間'] = '8:00〜17:00';
  m['勤務時間詳細'] = j.worktime_holiday || '';
  m['(必須)月平均残業時間最小'] = '0';

  m['(必須)休日・休暇'] = 'シフト制';
  m['年間休日'] = '120';

  m['(必須)福利厚生'] = '社会保険完備';
  m['(必須)求人特徴'] = '完全週休2日制';
  m['(必須)在宅勤務'] = 'なし';
  m['(必須)時短勤務'] = 'なし';

  m['(必須)採用人数'] = '1';
  m['(必須)選考フロー'] = '1次面接';
  m['(必須)Web面接可否'] = '可';

  return HEADERS.map(h => q(m[h])).join(',');
}

const lines = [HEADERS.map(q).join(',')];
for (const j of rows) lines.push(buildRow(j));
const csv = '﻿' + lines.join('\r\n') + '\r\n';   // UTF-8 BOM + CRLF

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, csv, 'utf8');

console.log(`完了: ${rows.length}件を出力 → ${OUT}`);
console.log(`（UTF-8 BOM付き。Shift-JISが必要なら PowerShell: Get-Content ${path.basename(OUT)} | Out-File -Encoding Default 出力名-sjis.csv）`);
