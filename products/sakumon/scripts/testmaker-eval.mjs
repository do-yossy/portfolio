// テストのたたき台づくりの実測。APIキーを入れてから、最初に1回だけ流す。D1 も Stripe も使わない。
// 使い方(PowerShell。キーはチャットに貼らず、自分のPCの環境変数に入れる):
//   $env:ANTHROPIC_API_KEY = Read-Host "キー"   # 画面に残さない入力は、環境に合わせて
//   $env:PRICE_IN_PER_MTOK = "<入力の単価(USD/100万トークン)>"  # 任意。Anthropic の料金表で確認した値
//   $env:PRICE_OUT_PER_MTOK = "<出力の単価(USD/100万トークン)>"
//   $env:JPY_PER_USD = "<円換算>"                                # 任意
//   node scripts/testmaker-eval.mjs [回数=9]
// 単価を入れなければ、トークン数だけを表示する(費用は計算しない)。
import { buildGeneratePrompt, buildVerifyPrompt, callClaude, extractJson, validateTest, compareAnswers } from '../src/testmaker.js';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ANTHROPIC_API_KEY が未設定です。');
  process.exit(1);
}
const env = { ANTHROPIC_API_KEY: key, TESTMAKER_MODEL: process.env.TESTMAKER_MODEL };
const CASES = [
  { level: 'junior', subject: '数学', grade: '2年', units: ['一次関数'], total: 100, minutes: 50, count: 6, extra: '' },
  { level: 'elementary', subject: '算数', grade: '3年', units: ['わり算'], total: 100, minutes: 40, count: 6, extra: '' },
  { level: 'high', subject: '国語', grade: '現代の国語', units: ['論理的な文章の読解'], total: 100, minutes: 50, count: 5, extra: '本文は自作してください' },
];
const runs = Number(process.argv[2] || 9);
let totalIn = 0, totalOut = 0, invalid = 0, verifyFailed = 0, mismatches = 0, checked = 0, warned = 0;
const times = [];
for (let i = 0; i < runs; i++) {
  const v = CASES[i % CASES.length];
  const t0 = Date.now();
  try {
    const gen = await callClaude(env, buildGeneratePrompt(v));
    totalIn += gen.usage.input_tokens || 0;
    totalOut += gen.usage.output_tokens || 0;
    const test = validateTest(extractJson(gen.text), v.total);
    if (test.error) { invalid++; console.log(`#${i + 1} 形式エラー`); continue; }
    if (test.warnings.length) warned++;
    let m = 0, c = 0;
    try {
      const ver = await callClaude(env, buildVerifyPrompt(test.questions));
      totalIn += ver.usage.input_tokens || 0;
      totalOut += ver.usage.output_tokens || 0;
      for (const q of compareAnswers(test.questions, extractJson(ver.text))) {
        if (q.check === 'match' || q.check === 'mismatch') c++;
        if (q.check === 'mismatch') m++;
      }
    } catch {
      verifyFailed++;
    }
    mismatches += m; checked += c;
    times.push(Date.now() - t0);
    console.log(`#${i + 1} ${v.subject} ${v.units[0]}: 警告${test.warnings.length}件 / 検算 ${c}問中 食い違い${m}問 / ${Math.round((Date.now() - t0) / 1000)}秒`);
  } catch (e) {
    invalid++;
    console.log(`#${i + 1} 失敗: ${e.message}`);
  }
}
console.log('---');
console.log(`回数 ${runs} / 形式エラー・失敗 ${invalid} / 点検の警告あり ${warned} / 検算の失敗 ${verifyFailed}`);
console.log(`検算できた問題 ${checked}問のうち、食い違い ${mismatches}問(記述の長い答えは、比べていない)`);
console.log(`トークン合計 入力${totalIn} 出力${totalOut}(1回あたり 入力${Math.round(totalIn / runs)} 出力${Math.round(totalOut / runs)})`);
if (times.length) console.log(`所要時間 平均${Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000)}秒`);
const pi = Number(process.env.PRICE_IN_PER_MTOK), po = Number(process.env.PRICE_OUT_PER_MTOK);
if (pi > 0 && po > 0) {
  const usd = (totalIn * pi + totalOut * po) / 1e6;
  const per = usd / runs;
  console.log(`概算費用 1回あたり $${per.toFixed(4)}` + (Number(process.env.JPY_PER_USD) > 0 ? `(約${(per * Number(process.env.JPY_PER_USD)).toFixed(1)}円)` : ''));
} else {
  console.log('単価が未設定のため、費用は計算していません。');
}
