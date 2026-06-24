/**
 * コンテンツ購入メール → 管制塔「売上」登録＋通知（Google Apps Script・デプロイ不要）
 *
 * 動作：Brain / Tips / note などから届く「購入されました」系のメールを
 *   5分おきに Gmail で検知し、管制塔の /api/inbound に kind:"sale" で POST する。
 *   管制塔側で「売上(won)」として記録し、Slack＋（設定時）自分宛メールで通知する。
 *
 * セットアップ（5分）:
 *   1) https://script.google.com で新規プロジェクト → このコードを貼り付けて保存
 *   2) 左の歯車（プロジェクトの設定）→ スクリプト プロパティ に2つ追加:
 *        API_BASE      = https://sq-sales-tanto20.fly.dev
 *        INBOUND_TOKEN = （管制塔のログインパスワード。専用トークンを設定済みならその値）
 *   3) 関数 checkSalesMail を選び ▶実行 → 初回は権限を「許可」
 *   4) 時計アイコン（トリガー）→ checkSalesMail を「時間主導・5分おき」で追加
 *      （または関数 createSalesTrigger を1回だけ実行）
 *
 * 事前に：Brain / Tips / note 側で「購入時にメール通知が届く」設定をONにし、
 *   通知先を連携済みGmail（social.recruiting.information@gmail.com）にしておく。
 *
 * 二重計上は Gmail ラベル「管制塔売上通知済み」＋ メールIDの ref で防止。
 * ※ 送信元ドメイン・件名キーワードは実際の通知メールに合わせて調整してください（下の SOURCES）。
 */

// ── 設定 ───────────────────────────────────────────────
var SOURCES = [
  { source: 'brain', q: 'from:brain-market.com newer_than:3d' },
  { source: 'tips',  q: 'from:tips.jp newer_than:3d' },
  { source: 'note',  q: 'from:note.com newer_than:3d' }
];
// 「購入された」系メールだけに絞る件名キーワード（newsletter等は除外）
var SALE_HINTS = ['購入', '売れ', 'お買い上げ', 'ご購入', '売上', '販売しました', 'ご注文'];
var DONE_LABEL = '管制塔売上通知済み';
var MAX_THREADS = 20;

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

function parseAmount_(text) {
  if (!text) return 0;
  // 「金額」「価格」「購入金額」等のラベル近くを優先
  var labeled = String(text).match(/(?:金額|価格|購入金額|販売価格|売上|ご購入金額|お支払い)[^0-9¥￥]{0,10}[¥￥]?\s*([0-9][0-9,]{1,})/);
  if (labeled) return parseInt(labeled[1].replace(/,/g, ''), 10) || 0;
  var m = String(text).match(/[¥￥]\s*([0-9][0-9,]{1,})|([0-9][0-9,]{1,})\s*円/);
  if (m) return parseInt((m[1] || m[2]).replace(/,/g, ''), 10) || 0;
  return 0;
}

function checkSalesMail() {
  var base = prop_('API_BASE'), token = prop_('INBOUND_TOKEN');
  if (!base || !token) { Logger.log('API_BASE / INBOUND_TOKEN をスクリプトプロパティに設定してください'); return; }
  base = base.replace(/\/+$/, '');
  var label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  var sent = 0;

  SOURCES.forEach(function (item) {
    var threads = GmailApp.search(item.q + ' -label:"' + DONE_LABEL + '"', 0, MAX_THREADS);
    threads.forEach(function (th) {
      try {
        var subject = th.getFirstMessageSubject() || '';
        var isSale = SALE_HINTS.some(function (h) { return subject.indexOf(h) >= 0; });
        if (!isSale) { th.addLabel(label); return; } // 購入系でなければ印を付けて以後スキップ

        var msgs = th.getMessages();
        var msg = msgs[msgs.length - 1];
        var body = String(msg.getPlainBody() || '').substring(0, 3500);
        var product = subject.replace(/^\s*(Re:|RE:|Fwd:|FW:)\s*/i, '').substring(0, 100);
        var amount = parseAmount_(subject) || parseAmount_(body);

        var res = UrlFetchApp.fetch(base + '/api/inbound', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-inbound-token': token },
          payload: JSON.stringify({
            kind: 'sale', source: item.source, subject: subject, product: product,
            amount: amount, from: msg.getFrom(), body: body, ref: msg.getId()
          }),
          muteHttpExceptions: true
        });
        if (res.getResponseCode() === 200) { th.addLabel(label); sent++; }
        else { Logger.log('sale送信失敗 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200)); }
      } catch (e) { Logger.log('処理エラー: ' + e); }
    });
  });
  Logger.log(sent + '件の売上を管制塔に送信しました');
}

function createSalesTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkSalesMail') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkSalesMail').timeBased().everyMinutes(5).create();
  Logger.log('5分おきトリガーを作成しました');
}
