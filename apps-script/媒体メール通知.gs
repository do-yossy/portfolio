/**
 * 媒体メッセージ → 管制塔「要返信」通知（Google Apps Script・デプロイ不要）
 *
 * 動作：ランサーズ / ココナラ / クラウドワークス から届く「メッセージ通知メール」を
 *   5分おきに Gmail で検知し、管制塔の /api/inbound に POST する。
 *   管制塔側で「要返信」に登録し、返信下書きを自動生成する（メールは送らない）。
 *
 * セットアップ（5分）:
 *   1) https://script.google.com で新規プロジェクト → このコードを貼り付けて保存
 *   2) 左の歯車（プロジェクトの設定）→ スクリプト プロパティ に2つ追加:
 *        API_BASE      = https://sq-sales-tanto20.fly.dev
 *        INBOUND_TOKEN = （管制塔と同じ秘密の文字列）
 *      ※ 管制塔側は  fly secrets set INBOUND_TOKEN="その文字列"  で同じ値を設定する
 *   3) 上部の関数で checkMediaMail を選び ▶実行 → 初回は権限を「許可」
 *   4) 時計アイコン（トリガー）→ checkMediaMail を「時間主導・5分おき」で追加
 *      （または関数 createTrigger を1回だけ実行）
 *
 * 二重送信は「管制塔通知済み」ラベルで防止。対象外メールにもラベルを付けて以後スキップ。
 */

// ── 設定 ───────────────────────────────────────────────
var QUERIES = [
  { source: 'lancers',    q: 'from:lancers.jp newer_than:2d' },
  { source: 'coconala',   q: 'from:coconala.com newer_than:2d' },
  { source: 'crowdworks', q: 'from:crowdworks.jp newer_than:2d' }
];
var DONE_LABEL = '管制塔通知済み';
// 「返信が必要なメッセージ系」だけに絞る件名キーワード（必要に応じて調整）
var SUBJECT_HINTS = ['メッセージ', 'お問い合わせ', '連絡', '返信', 'やりとり', 'トーク', '相談'];
var MAX_THREADS = 20;

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

function checkMediaMail() {
  var base = prop_('API_BASE'), token = prop_('INBOUND_TOKEN');
  if (!base || !token) { Logger.log('API_BASE / INBOUND_TOKEN をスクリプトプロパティに設定してください'); return; }
  base = base.replace(/\/+$/, '');
  var label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  var sent = 0;

  QUERIES.forEach(function (item) {
    var threads = GmailApp.search(item.q + ' -label:"' + DONE_LABEL + '"', 0, MAX_THREADS);
    threads.forEach(function (th) {
      try {
        var subject = th.getFirstMessageSubject() || '';
        var isMsg = SUBJECT_HINTS.some(function (h) { return subject.indexOf(h) >= 0; });
        if (!isMsg) { th.addLabel(label); return; } // 対象外も印を付けて以後スキップ

        var msgs = th.getMessages();
        var m = msgs[msgs.length - 1]; // スレッドの最新メッセージ
        var body = String(m.getPlainBody() || '').substring(0, 3500);
        var title = subject.replace(/^\s*(Re:|RE:|Fwd:|FW:)\s*/i, '').substring(0, 60);

        var res = UrlFetchApp.fetch(base + '/api/inbound', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-inbound-token': token },
          payload: JSON.stringify({ source: item.source, subject: subject, title: title, from: m.getFrom(), body: body }),
          muteHttpExceptions: true
        });
        if (res.getResponseCode() === 200) { th.addLabel(label); sent++; }
        else { Logger.log('inbound失敗 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200)); }
      } catch (e) { Logger.log('処理エラー: ' + e); }
    });
  });
  Logger.log(sent + '件を管制塔に送信しました');
}

function createTrigger() {
  // 既存の同名トリガーを掃除してから作成（二重作成防止）
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkMediaMail') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkMediaMail').timeBased().everyMinutes(5).create();
  Logger.log('5分おきトリガーを作成しました');
}
