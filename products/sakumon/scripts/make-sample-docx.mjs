// 見本の .docx を書き出す(確認・デモ用)。API は使わない。使い方: node scripts/make-sample-docx.mjs 出力先.docx
// 中身は、人が作って、計算を確かめた「仮」の見本。AIが作ったものではない。告知・販促に「サクモンで作った」として使わないこと。
import { writeFileSync } from 'node:fs';
import { buildTestDocx } from '../src/docx.js';

const out = process.argv[2] || 'sample.docx';
const q = (no, aspect, difficulty, text, answer, points, scoring) => ({ no, aspect, difficulty, unit: '一次関数', text, answer, points, scoring });
const bytes = buildTestDocx({
  title: '中2数学 一次関数 小テスト(見本・仮)', kind: '小テスト', levelLabel: '中学校', subject: '数学', grade: '2年', total: 100, minutes: 20,
  questions: [
    q(1, '知識・技能', 'やさしい', '一次関数 y = 2x + 1 で、x = 3 のときの y の値を求めなさい。', '7', 15, [{ point: 15, criterion: '7と答えている' }]),
    q(2, '知識・技能', 'やさしい', '一次関数 y = -x + 4 の、傾きと切片を答えなさい。', '傾き -1、切片 4', 15, [{ point: 8, criterion: '傾きが -1' }, { point: 7, criterion: '切片が 4' }]),
    q(3, '知識・技能', 'ふつう', '傾きが 3 で、点(1, 2)を通る直線の式を求めなさい。', 'y = 3x - 1', 20, [{ point: 10, criterion: 'y = 3x + b とおいて、点の座標を代入している' }, { point: 10, criterion: '答えが y = 3x - 1' }]),
    q(4, '知識・技能', 'ふつう', '2点(1, 3)、(3, 7)を通る直線の式を求めなさい。', 'y = 2x + 1(傾きは (7-3)÷(3-1)=2)', 20, [{ point: 8, criterion: '傾き 2 を求めている' }, { point: 6, criterion: '切片を求める式がある' }, { point: 6, criterion: '答えが y = 2x + 1' }]),
    q(5, '知識・技能', 'ふつう', '一次関数 y = 2x + 1 のグラフと、x軸との交点の座標を求めなさい。', '(-1/2, 0)', 15, [{ point: 7, criterion: 'y = 0 を代入している' }, { point: 8, criterion: '答えが (-1/2, 0)(-0.5 も可)' }]),
    q(6, '思考・判断・表現', 'ふつう', '1本30円の鉛筆を x 本と、100円の箱を1つ買ったときの代金を y 円とします。\n(1) y を x の式で表しなさい。\n(2) (1)の式で、傾きと切片は、それぞれ何を表していますか。言葉で説明しなさい。', '(1) y = 30x + 100\n(2) 傾き30は鉛筆1本の値段、切片100は箱の代金', 15, [{ point: 7, criterion: '(1) y = 30x + 100' }, { point: 4, criterion: '(2) 傾きが1本の値段' }, { point: 4, criterion: '(2) 切片が箱の代金' }]),
  ],
});
writeFileSync(out, bytes);
console.log(`${out} に書き出しました(${bytes.length}バイト)`);
