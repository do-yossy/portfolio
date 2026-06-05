'use strict';
/**
 * 応募キュー生成エンジン（メールアラート運用フローの AI ステップ 1〜4 を1コマンド化）
 *   [取り込み] → [役割1スコアリング] → [提案文+価格+デモ自動差込] → [応募キュー生成]
 *
 * 入力 : data/inbox.json … 求人アラートから集めた案件配列 [{title?, text, source?, url?, industry?}]
 *        （Gmailのアラート本文を私(Claude)がここに書き込む／手で貼ってもOK）
 * 出力 : data/queue.json … 応募コックピット(応募コックピット.html)にそのまま読み込めるJSON
 *
 * 使い方:
 *   node scripts/build-queue.js              # data/inbox.json を処理（無ければ見本を生成）
 *   node scripts/build-queue.js path.json    # 任意の入力ファイル
 *
 * ※ data/ は .gitignore 対象。実案件データはリポジトリに公開されません。
 */
const fs = require('fs');
const path = require('path');
const L = require('../logic');

const DATA = path.join(__dirname, '..', 'data');
const IN = process.argv[2] || path.join(DATA, 'inbox.json');
const OUT = path.join(DATA, 'queue.json');
const TPL_OF = { LP: 'A', corp: 'B', ec: 'C', system: 'C', ai: 'D', line: 'A' };
const today = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(IN)) {
  const sample = [
    { title: '美容サロンの新規LP制作', source: 'lancers', url: 'https://www.lancers.jp/work/detail/0000001',
      text: '美容サロン向けのLP制作をお願いします。予算5万円、参考サイトあり、来店予約を増やしたい。スマホ対応必須。' },
    { title: 'クリニックの予約システム開発', source: 'lancers', url: 'https://www.lancers.jp/work/detail/0000002',
      text: '予約システムの開発依頼。予算20万円、継続的な保守も希望。要件は参考資料あり。' },
    { title: '丸投げでHP作って（急ぎ）', source: 'crowdworks', url: '',
      text: 'とにかく急ぎでホームページ。仕様はお任せ・丸投げで。今日中。単価2000円。修正無制限希望。' }
  ];
  fs.writeFileSync(IN, JSON.stringify(sample, null, 2));
  console.log(`(見本) ${IN} を生成しました。Gmailのアラート本文に置き換えて再実行してください。\n`);
}

const inbox = JSON.parse(fs.readFileSync(IN, 'utf8'));
const queue = [], skipped = [];

inbox.forEach((it, i) => {
  const s = L.scoreFromText(it.text || it.title || '', { source: it.source, type: it.type });
  const type = it.type || s.type;
  const channel = it.source || 'lancers';
  const proposed = s.budget > 0 ? s.budget : L.quote({ type, channel }).total;
  const item = {
    id: `Q${Date.now()}${i}`, date: today, channel, title: it.title || (it.text || '').slice(0, 36),
    industry: it.industry || '', type, budget: s.budget, proposed_price: proposed, est_hours: s.est_hours,
    score: s.score, priority: s.priority, pred_win_rate: s.pred_win_rate, template: TPL_OF[type] || 'A',
    url: it.url || '', demo_url: L.demoUrl(type),
    proposal: L.proposal({ title: it.title || '案件', type, industry: it.industry, amount: proposed, link: L.demoUrl(type) }),
    notes: s.decision
  };
  (s.apply ? queue : skipped).push({ ...item, _reason: s.decision });
});

queue.sort((a, b) => b.score - a.score);
const clean = queue.map(({ _reason, ...q }) => q);
fs.writeFileSync(OUT, JSON.stringify(clean, null, 2));

console.log(`■ 応募キュー生成: ${clean.length}件（応募推奨） / 見送り ${skipped.length}件`);
console.log(`  → ${OUT}\n`);
console.log('【応募推奨（スコア順）】');
clean.forEach(q => console.log(`  [${q.priority}] ${q.score}点 ${q.title} / ${q.channel} / ¥${(q.proposed_price || 0).toLocaleString()} / 予測受注率${q.pred_win_rate}%`));
if (skipped.length) {
  console.log('\n【見送り】');
  skipped.forEach(q => console.log(`  ✗ ${q.title} … ${q._reason}`));
}
console.log('\n応募コックピットに読み込む内容（コピー可）:\n');
console.log(JSON.stringify(clean));
