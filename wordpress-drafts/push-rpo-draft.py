# -*- coding: utf-8 -*-
"""RPO事業を追加した /service 一式を、公開せず status=draft の下書きページとして投入する。

- live の /service（id=41）には一切触れない。
- 組み立ては push-service.py と完全に同一（テーマchrome無効化 + ヘッダー統一CSS + wp:htmlラップ）。
  よって下書きプレビューの見た目は本番の /service と同一になる。
- slug 'service-rpo-draft' の下書きが既にあれば更新、なければ新規作成（何度実行しても重複しない）。
"""
import os, json, base64, urllib.request, urllib.parse
SITE=os.environ['WP_SITE'].rstrip('/'); USER=os.environ['WP_USER']; PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
WD=os.path.dirname(os.path.abspath(__file__))
SLUG='service-rpo-draft'; TITLE='サービス詳細（RPO事業 追加・下書き）'

body=open(os.path.join(WD,'content-service.html'),encoding='utf-8').read()
# HOME nav must go to the live top page, not the local preview file
body=body.replace('href="トップページ_仮.html"','href="/"')

# --- push-service.py と同一の SV_FULLPAGE ---
SV_FULLPAGE='''<style id="sv-fullpage">
/* /service：テーマ標準ヘッダーを使用し他ページと完全一致させる。自作ヘッダーは撤去。フッター/ページタイトル/パンくずのみ無効化。 */
#footer,.l-footer,.c-breadcrumb,.p-breadcrumb,.c-pageTitle,.p-pageHeader{display:none!important}
.savior-draft>header{display:none!important}
#content,.l-content{max-width:none!important;width:100%!important;margin:0!important;padding:0!important}
#main_content,.l-mainContent,.l-article{max-width:none!important;width:100%!important;margin:0!important;padding:0!important;border:0!important}
.post_content{max-width:none!important;margin:0!important;padding:0!important}
/* ヘッダー背景を半透明ネイビーに統一（全ページ共通の値） */
:root{--color_header_bg:rgba(15,35,80,.75) !important}
.l-header,.l-fixHeader{background:rgba(15,35,80,.75) !important}
.l-header__bar,.l-fixHeader::before,.l-fixHeader:before{background:transparent !important}
/* 戻るボタン(↑)をフォント非依存のCSS描画に統一（アイコンフォント未読込でも必ず同じ「^」マークを表示） */
#pagetop .c-fixBtn__icon::before{content:"" !important}
#pagetop .c-fixBtn__icon{display:flex;align-items:center;justify-content:center}
#pagetop .c-fixBtn__icon::after{content:"";width:10px;height:10px;border-top:2px solid currentColor;border-right:2px solid currentColor;transform:rotate(-45deg);margin-top:3px}
/* 現在ページのナビ項目に白い下線を常時表示。WPのcurrent-menu-item と JSの.-current 両対応。content/位置も自前指定でmain.css非依存＝プレビューでも確実表示。 */
.c-gnav > .-current > a,.c-gnav > .current-menu-item > a,.c-gnav > .current_page_item > a{position:relative}
.c-gnav > .-current > a::after,.c-gnav > .current-menu-item > a::after,.c-gnav > .current_page_item > a::after{content:"" !important;display:block;position:absolute;left:0;bottom:0;width:100%;height:2px;background:var(--color_header_text);transform:scaleX(1) !important;opacity:1}
/* 他ページ(/contact等)とヘッダー構造は完全に同一(-body-solid / .l-fixHeader / scrollObserver)。
   よってヘッダーの位置やfixHeaderの表示はテーマ標準のまま一切上書きしない。 */
/* SWELLテーマが .post_content 内の見出しに付ける装飾（h2の濃紺バー・h3の下線・h4の左ボーダー等）を打ち消し、単体HTMLプレビューと同一表示にする */
.savior-draft h1,.savior-draft h2,.savior-draft h3,.savior-draft h4,.savior-draft h5,.savior-draft h6{background:none!important;border:none!important;padding:0!important;margin-top:0;margin-bottom:0}
.savior-draft h1::before,.savior-draft h1::after,.savior-draft h2::before,.savior-draft h2::after,.savior-draft h3::before,.savior-draft h3::after,.savior-draft h4::before,.savior-draft h4::after,.savior-draft h5::before,.savior-draft h6::before{content:none!important;display:none!important;border:none!important;background:none!important}
</style>
'''
inner=SV_FULLPAGE+'\n'+body
content='<!-- wp:html -->\n'+inner+'\n<!-- /wp:html -->'
open(os.path.join(WD,'deployed-rpo-draft.html'),'w',encoding='utf-8').write(content)

def api(method, path, payload=None):
    url=f"{SITE}/wp-json{path}"
    data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request(url, data=data, method=method,
        headers={'Authorization':f'Basic {auth}','Content-Type':'application/json','Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)

# 既存の下書きを探す（slug一致）。あれば更新、なければ新規作成。
existing=api('GET', f"/wp/v2/pages?status=draft,publish,pending,private&slug={urllib.parse.quote(SLUG)}&context=edit")
if existing:
    pid=existing[0]['id']
    d=api('POST', f"/wp/v2/pages/{pid}", {'content':content, 'status':'draft', 'title':TITLE})
    action='更新'
else:
    d=api('POST', "/wp/v2/pages", {'title':TITLE, 'slug':SLUG, 'content':content, 'status':'draft'})
    action='新規作成'

link=d.get('link',''); sep='&' if '?' in link else '?'
print(f"{action}: id={d['id']} status={d['status']} len={len(content)}")
print(f"  編集   : {SITE}/wp-admin/post.php?post={d['id']}&action=edit")
print(f"  プレビュー: {link}{sep}preview=true")
