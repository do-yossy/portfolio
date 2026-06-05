'use strict';
/**
 * スプレッドシート同期（方式B：既存シートに書き戻す）。サービスアカウント方式。
 *
 *  B列「募集本文」を採点 → 同じ行の C〜G に書き戻し（案件名/スコア/優先度/予測受注率/提案状況）
 *  → さらに管制塔(DB)にも候補として登録。
 *
 *  事前準備:
 *   1) 対象シートを SA（calllist@list-498317.iam.gserviceaccount.com）に「編集者」で共有
 *   2) fly secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<鍵JSON>'  （チャット/Gitに貼らない）
 *   3) SHEET_ID, SHEET_RANGE を環境変数に
 *  実行（ネットワークのある環境＝デプロイ先で）:  node scripts/sync-sheet.js
 *
 *  シート列:  A:媒体  B:募集本文  C:案件名  D:スコア  E:優先度  F:予測受注率  G:提案状況  H:結果  I:メモ
 */
const L = require('../logic');
const sheets = require('../lib/sheets');
const { Deals } = require('../db');

const RANGE = process.env.SHEET_RANGE || 'A2:I200';

(async () => {
  if (!sheets.SHEET_ID) { console.error('SHEET_ID 未設定'); process.exit(1); }
  const rows = await sheets.getRows(RANGE);
  let done = 0, skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const media = (row[0] || 'ランサーズ').toString().trim();
    const body = (row[1] || '').toString().trim();      // B列：募集本文
    const scored = (row[3] || '').toString().trim();    // D列：スコア（既にあればスキップ）
    if (!body) continue;
    if (scored) { skipped++; continue; }

    const channel = /クラウド|crowd/i.test(media) ? 'crowdworks' : 'lancers';
    const s = L.scoreFromText(body, { source: channel });
    const title = body.split('\n')[0].slice(0, 40) || '案件';
    const proposal = L.proposal({ title, type: s.type, amount: s.budget, link: L.demoUrl(s.type) });
    const rowNum = i + 2; // RANGE が A2 起点

    // ① 同じ行 C:G に書き戻し（＝既存シートに直接入力）
    await sheets.updateRange(`C${rowNum}:G${rowNum}`,
      [[title, s.score, s.priority, s.pred_win_rate, s.apply ? '応募推奨' : '見送り']]);

    // ② 管制塔(DB)にも候補登録（提案文つき）
    Deals.create({
      title, source: channel, type: s.type, stage: 'lead', amount: s.budget,
      score: s.score, priority: s.priority, pred_win_rate: s.pred_win_rate,
      est_hours: s.est_hours, proposal, next_action: s.decision, raw: body
    });
    done++;
    console.log(`✓ 行${rowNum}: ${title} → ${s.score}点 ${s.priority} / ${s.apply ? '応募推奨' : '見送り'}`);
  }
  console.log(`\n完了: 採点&書き戻し ${done}件 ／ スキップ(既採点) ${skipped}件`);
})().catch(e => { console.error('同期エラー:', e.message); process.exit(1); });
