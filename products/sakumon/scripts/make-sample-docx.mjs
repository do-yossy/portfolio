// 見本の .docx を書き出す(確認用)。API は使わない。使い方: node scripts/make-sample-docx.mjs 出力先.docx
import { writeFileSync } from 'node:fs';
import { buildTestDocx } from '../src/docx.js';

const out = process.argv[2] || 'sample.docx';
const q = (no, aspect, text, answer, points, unit = '一次関数') => ({ no, aspect, difficulty: 'ふつう', unit, text, answer, points, scoring: [{ point: points, criterion: '答えが正しい' }] });
const bytes = buildTestDocx({
  title: '中2数学 一次関数 小テスト(見本)', kind: '小テスト', levelLabel: '中学校', subject: '数学', grade: '2年', total: 100, minutes: 20,
  questions: [
    q(1, '知識・技能', '一次関数 y=2x+1 で、x=3 のときの y の値を求めなさい。', '7', 25),
    q(2, '知識・技能', '一次関数 y=-x+4 の傾きと切片を答えなさい。', '傾き-1、切片4', 25),
    q(3, '知識・技能', '傾きが3で、点(1,2)を通る直線の式を求めなさい。', 'y=3x-1', 25),
    q(4, '思考・判断・表現', '1本20円の鉛筆を x 本買うと、代金は y 円です。y を x の式で表し、x と y の関係を説明しなさい。', 'y=20x。yはxに比例する。', 25),
  ],
});
writeFileSync(out, bytes);
console.log(`${out} に書き出しました(${bytes.length}バイト)`);
