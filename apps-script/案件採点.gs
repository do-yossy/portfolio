/**
 * Web制作 案件リスト — Claude 自動採点（Google Apps Script・デプロイ不要）
 *
 * 動作：B列「募集本文」を Claude(Messages API) で採点し、同じ行に書き戻す。
 *   C=案件名 / D=スコア / E=優先度 / F=予測受注率 / G=提案状況 / J=提案文
 *
 * セットアップ（スプレッドシート → 拡張機能 → Apps Script に貼り付け）：
 *   1) プロジェクトの設定 → スクリプト プロパティに  ANTHROPIC_API_KEY = sk-ant-...  を追加
 *   2) 保存 → 上部の関数で scoreNewRows を一度実行し、認可（許可）する
 *   3) シートを開き直すと「Claude採点」メニューが出る → 「新規行を採点」で手動実行
 *   4) 手作業ゼロにするなら：トリガー（時計アイコン）→ scoreNewRows を「時間主導・5分おき」に追加
 *      （※UrlFetch を使うため、自動化は“インストール型トリガー”が必須。簡易onEditは不可）
 */

// ── 設定 ───────────────────────────────────────────────
// 既定は最も高性能な Opus 4.8。大量・低コスト運用にしたい場合は
//   'claude-haiku-4-5'（最安・高速）や 'claude-sonnet-4-6' に変更可。
var MODEL = 'claude-opus-4-8';
var MAX_PER_RUN = 20;          // 1回の実行で採点する最大行数（GASの実行時間制限対策）
var COL = { media:1, body:2, title:3, score:4, priority:5, pred:6, status:7, result:8, memo:9, proposal:10 }; // A..J

// 共有プレフィックス（採点基準）。各行のAPI呼び出しで使い回す＝プロンプトキャッシュ対象。
var SYSTEM_PROMPT =
'あなたは半自動化Web制作事業の営業責任者です。クラウドソーシング（ランサーズ/クラウドワークス）の案件を評価します。\n' +
'自社の強み：LP・HP・EC・業務ツール・スマホアプリ・AI活用ツールを制作。修正無制限・短納期・オンライン完結。実績URL: https://do-yossy.github.io/portfolio/\n' +
'\n' +
'【評価軸（100点）】予算（高いほど良い）/ 自社テンプレ流用しやすさ / 仕様の明確さ（参考サイト・ページ数・機能の記載）/ 継続・保守の見込み / 競合の少なさ / 締切の近さ。\n' +
'【減点・除外】修正無制限を要求し追加費用の線引きが無い / 極端な低単価（時給換算で割れる）/ 丸投げ・仕様未確定 / 短納期×高工数。\n' +
'【手数料】ランサーズは一律16.5%、クラウドワークスは段階制。低単価は実効時給が割れやすいので厳しめに。\n' +
'【優先度の閾値】75以上=S（即応募）/ 55-74=A（応募）/ 40-54=B（要ヒアリング）/ 40未満または除外フラグ=見送り。\n' +
'【提案文】です・ます調。冒頭で案件内容に触れ、対応可能と明言。具体的な提案を2-3点。料金/納期感。強み（修正無制限・短納期・オンライン完結）。実績URLを必ず含める。300字程度。\n' +
'\n' +
'出力は次のキーを持つ JSON オブジェクトのみ（前後に文章やコードフェンスを付けない）：\n' +
'{"案件名": string, "score": 0-100の整数, "priority": "S"|"A"|"B"|"見送り", "予測受注率": 0-100の整数, "提案状況": "応募推奨"|"見送り", "提案文": string}';

// ── メニュー ────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Claude採点')
    .addItem('新規行を採点（B列→自動記入）', 'scoreNewRows')
    .addToUI();
}

// ── メイン：未採点の行を採点して書き戻す ───────────────────
function scoreNewRows() {
  var sh = SpreadsheetApp.getActiveSheet();
  var last = sh.getLastRow();
  if (last < 2) return;
  var rows = sh.getRange(2, 1, last - 1, 10).getValues(); // A2:J
  var done = 0, errors = 0;

  for (var i = 0; i < rows.length && done < MAX_PER_RUN; i++) {
    var media = String(rows[i][COL.media - 1] || 'ランサーズ').trim();
    var body  = String(rows[i][COL.body  - 1] || '').trim();   // B
    var already = String(rows[i][COL.score - 1] || '').trim(); // D（採点済みならスキップ）
    if (!body || already) continue;

    var rowNum = i + 2;
    try {
      var r = scoreWithClaude_(media, body);
      // C:G に5項目を一括書き込み
      sh.getRange(rowNum, COL.title, 1, 5).setValues([[
        r['案件名'] || '', r['score'] || 0, r['priority'] || '',
        r['予測受注率'] || 0, r['提案状況'] || ''
      ]]);
      // J に提案文
      sh.getRange(rowNum, COL.proposal).setValue(r['提案文'] || '');
      done++;
      SpreadsheetApp.flush();
    } catch (e) {
      sh.getRange(rowNum, COL.status).setValue('エラー: ' + e.message);
      errors++;
    }
  }
  try { SpreadsheetApp.getActive().toast(done + '件を採点 / エラー' + errors + '件', 'Claude採点', 5); } catch (e) {}
}

// ── Claude Messages API 呼び出し（SDKなし・UrlFetchApp） ──
function scoreWithClaude_(media, body) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('スクリプトプロパティに ANTHROPIC_API_KEY を設定してください');

  var payload = {
    model: MODEL,
    max_tokens: 1200,
    // 採点基準を system に置き、cache_control でプロンプトキャッシュ（各行で使い回し）
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: '媒体: ' + media + '\n\n【募集本文】\n' + body }]
  };

  var res = fetchWithRetry_('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload)
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) throw new Error('API ' + code + ' ' + text.slice(0, 200));

  var data = JSON.parse(text);
  var out = (data.content || []).filter(function (b) { return b.type === 'text'; })
                                .map(function (b) { return b.text; }).join('');
  var m = out.match(/\{[\s\S]*\}/); // 念のためJSON部分を抽出
  if (!m) throw new Error('JSON抽出失敗');
  return JSON.parse(m[0]);
}

// ── 429/5xx は指数バックオフでリトライ ───────────────────
function fetchWithRetry_(url, options) {
  var delay = 1000;
  for (var attempt = 0; attempt < 4; attempt++) {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code !== 429 && code !== 529 && code < 500) return res;
    Utilities.sleep(delay);
    delay *= 2;
  }
  return UrlFetchApp.fetch(url, options); // 最終結果（呼び出し側で判定）
}

// ── 任意：時間主導トリガーをコードから作成（5分おき） ──────
function createTimeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scoreNewRows') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scoreNewRows').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getActive().toast('5分おきの自動採点トリガーを作成しました');
}
