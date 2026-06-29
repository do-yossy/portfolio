'use strict';
// シニアジョブ 毎日10件CSV生成（勤務地ローテーション）
//
// 掲載済み求人「ロケ同行ドライバー」(求人ID 39033) の全項目を雛形として複製し、
// 勤務地（駅の住所・番地まで）だけを差し替えて出力する。
// 毎回まだ出していない駅を自動で N 件（既定10件）選び、出力済みを記録して重複を防ぐ。
//
// 使い方:
//   node scripts/seniorjob_daily_export.js                 # 次の10件をCSV出力
//   node scripts/seniorjob_daily_export.js --count 10      # 件数指定
//   node scripts/seniorjob_daily_export.js --all           # 残り全件を出力
//   node scripts/seniorjob_daily_export.js --reset         # 出力済み記録をリセット
//   node scripts/seniorjob_daily_export.js --status        # 残り件数を表示
//   node scripts/seniorjob_daily_export.js --content 02    # 仕事内容を差し替え（contents/02*.txt を使用）
//   node scripts/seniorjob_daily_export.js --list          # 仕事内容テンプレ一覧を表示
//
// 仕事内容の変え方（一巡したら別内容にしたい場合）:
//   1. scripts/seniorjob/contents/ に新しいテキストファイルを作る（例: 02-警備.txt）。中身が仕事内容本文。
//   2. node scripts/seniorjob_daily_export.js --reset    （出力済み記録をリセット）
//   3. node scripts/seniorjob_daily_export.js --content 02   （以後この内容で出力）
//   ※--content を付けない場合は雛形（ロケ同行ドライバー）の仕事内容のまま出力します。
//
// 出力: scripts/out/seniorjob-YYYYMMDD-NN.csv （Shift-JIS・シニアジョブ取込形式）

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const STATIONS = require(path.join(DIR, 'seniorjob', 'stations.json')); // [{station,postal,pref,city,address,nearest}]
const SJIS = require(path.join(DIR, 'seniorjob', 'sjis_table.json'));   // {codePoint: "hexbytes"} CP932変換表
const OUT_DIR = path.join(DIR, 'out');
const CONTENTS_DIR = path.join(DIR, 'seniorjob', 'contents'); // 仕事内容テンプレ置き場（*.txt）

// UTF-8文字列 → Shift-JIS(CP932) Buffer（シニアジョブはShift-JIS必須・BOMなし）
function toSjis(str) {
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) { bytes.push(cp); continue; }     // ASCIIはそのまま
    const hex = SJIS[cp];
    if (hex) { for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16)); }
    else { bytes.push(0x3F); }                        // 変換不能は '?'（通常発生しない）
  }
  return Buffer.from(bytes);
}
// ── 引数 ──
const args = process.argv.slice(2);
const has = f => args.includes(f);
const getN = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : d; };
const getS = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

// 会社（既定sq）。会社ごとに雛形・出力状況を分ける。
const COMPANY = (getS('--company', 'sq') || 'sq').toLowerCase();
// 雛形パス: sq は ref_job.json、その他は ref-<会社>.json
const refPath = co => path.join(DIR, 'seniorjob', co === 'sq' ? 'ref_job.json' : `ref-${co}.json`);
const loadRef = co => { try { return require(refPath(co)); } catch { return null; } };
// 出力状況ファイル: sq は従来名、その他は会社別（出社状況を会社ごとに独立管理）
const STATE = path.join(OUT_DIR, COMPANY === 'sq' ? 'seniorjob_used.json' : `seniorjob_used-${COMPANY}.json`);

fs.mkdirSync(OUT_DIR, { recursive: true });
let used = [];
try { used = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch {}

if (has('--reset')) { fs.writeFileSync(STATE, '[]'); console.log(`出力済み記録をリセットしました (${COMPANY})`); process.exit(0); }

// 仕事内容テンプレ一覧
function listContents() {
  try { return fs.readdirSync(CONTENTS_DIR).filter(f => f.endsWith('.txt')).sort(); } catch { return []; }
}
if (has('--list')) {
  const files = listContents();
  console.log('仕事内容テンプレ (scripts/seniorjob/contents/):');
  if (!files.length) console.log('  （なし。--content を付けなければ雛形の仕事内容を使用します）');
  files.forEach(f => console.log('  ' + f));
  console.log('使用例: node scripts/seniorjob_daily_export.js --content ' + (files[0] ? files[0].replace(/\.txt$/, '').slice(0, 2) : '02'));
  process.exit(0);
}

// --content <名前>: contents/ から「名前」で始まる .txt を読み、仕事内容を差し替える
let contentText = null, contentLabel = '雛形(ロケ同行ドライバー)';
{
  const i = args.indexOf('--content');
  const key = i >= 0 && args[i + 1] ? args[i + 1] : null;
  if (key) {
    const files = listContents();
    const hit = files.find(f => f === key || f === key + '.txt' || f.startsWith(key));
    if (!hit) {
      console.error(`仕事内容テンプレ「${key}」が見つかりません。--list で一覧を確認してください。`);
      process.exit(1);
    }
    contentText = fs.readFileSync(path.join(CONTENTS_DIR, hit), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
    contentLabel = hit;
  }
}

const remaining = STATIONS.filter(s => !used.includes(s.station));
if (has('--status')) {
  console.log(`会社: ${COMPANY} / 全駅: ${STATIONS.length} / 出力済み: ${used.length} / 残り: ${remaining.length}`);
  process.exit(0);
}

// 雛形（会社別）を読み込む。未登録の会社はここで終了。
const REF = loadRef(COMPANY);
if (!REF) {
  console.error(`雛形が未登録です（会社: ${COMPANY}）。${path.basename(refPath(COMPANY))} がありません。掲載済み求人のCSVから雛形を作成してください。`);
  process.exit(2);
}

const count = has('--all') ? remaining.length : getN('--count', 10);
const pick = remaining.slice(0, count);
if (pick.length === 0) { console.log('未出力の駅がありません（全件出力済み）。--reset でリセットできます。'); process.exit(0); }

// ── 列インデックス ──
const H = REF.headers;
const idx = name => H.indexOf(name);
const I = {
  id: idx('求人ID'),
  bunrui: idx('(必須)勤務地1分類'),
  postal: idx('勤務地1郵便番号'),
  pref: idx('勤務地1都道府県'),
  city: idx('勤務地1市区町村'),
  addr: idx('勤務地1詳細住所'),
  eki:  idx('勤務地1最寄駅'),
  content: idx('(必須)仕事内容'),
};

// 政令市は「市区町村」を区のみにする（参照求人の形式に合わせる: 大阪府 / 西区 / 江戸堀1-27-8）
function wardForm(city) {
  const m = city.match(/^(?:大阪市|神戸市|堺市|京都市)(.+区)$/);
  return m ? m[1] : city;
}

// CSVクォート
const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

function buildRow(st) {
  const row = REF.ref.slice();        // 雛形を複製
  row[I.id] = '';                     // 求人IDは空=新規作成
  row[I.bunrui] = '市区町村';
  row[I.postal] = st.postal || '';
  row[I.pref]   = st.pref || '';
  row[I.city]   = wardForm(st.city || '');
  row[I.addr]   = st.address || '';
  // 最寄駅: シニアジョブは駅コードでの照合が必要。コードがあれば「駅名(コード:XXXX) 徒歩5分」、
  // 無ければ空欄（コード無しのテキストはバリデーションエラーになるため）。
  const ekiName = st.ekiName || (st.nearest ? st.nearest.replace(/\s*徒歩.*$/, '') : (st.station + '駅'));
  row[I.eki]    = st.code ? `${ekiName}(コード:${st.code}) 徒歩5分` : '';
  if (contentText && I.content >= 0) row[I.content] = contentText;  // 仕事内容の差し替え
  return row.map(q).join(',');
}

const lines = [H.map(q).join(',')];
for (const st of pick) lines.push(buildRow(st));
const csv = lines.join('\r\n') + '\r\n';   // BOMなし

// ファイル名（日付＋連番）
const stamp = (process.env.SENIORJOB_DATE || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
let n = 1, file;
do { file = path.join(OUT_DIR, `seniorjob-${COMPANY}-${stamp}-${String(n).padStart(2, '0')}.csv`); n++; } while (fs.existsSync(file));
fs.writeFileSync(file, toSjis(csv));   // Shift-JIS(CP932)で書き出し

// 出力済みを記録
used.push(...pick.map(s => s.station));
fs.writeFileSync(STATE, JSON.stringify(used, null, 0));

console.log(`出力: ${pick.length}件 → ${file}`);
console.log(`  仕事内容: ${contentLabel}`);
console.log(`  ${pick.map(s => s.station).join('・')}`);
console.log(`残り未出力: ${STATIONS.length - used.length}件`);
console.log('（Shift-JIS形式で出力済み。シニアジョブにそのまま取込できます）');
