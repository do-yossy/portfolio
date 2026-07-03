# -*- coding: utf-8 -*-
"""Assemble & publish the /service page (id=41) so it renders identically to
the standalone preview (サービス詳細_仮.html):
  1. theme-chrome neutralization (header/footer/title/frame)
  2. SWELL heading-decoration reset  <-- fixes the dark bar on 人材紹介事業 etc.
  3. content-service.html body, with the HOME link pointed at the live top page
"""
import os, json, base64, urllib.request
SITE=os.environ['WP_SITE'].rstrip('/'); USER=os.environ['WP_USER']; PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
WD='/home/user/portfolio/wordpress-drafts'

body=open(os.path.join(WD,'content-service.html'),encoding='utf-8').read()
# HOME nav must go to the live top page, not the local preview file
body=body.replace('href="トップページ_仮.html"','href="/"')

SV_FULLPAGE='''<style id="sv-fullpage">
/* /service：テーマ標準ヘッダーを使用し他ページと完全一致させる。自作ヘッダーは撤去。フッター/ページタイトル/パンくずのみ無効化。 */
#footer,.l-footer,.c-breadcrumb,.p-breadcrumb,.c-pageTitle,.p-pageHeader{display:none!important}
.savior-draft>header{display:none!important}
#content,.l-content{max-width:none!important;width:100%!important;margin:0!important;padding:0!important}
#main_content,.l-mainContent,.l-article{max-width:none!important;width:100%!important;margin:0!important;padding:0!important;border:0!important}
.post_content{max-width:none!important;margin:0!important;padding:0!important}
/* ヘッダー背景を半透明ネイビーに統一（全ページ共通の値） */
:root{--color_header_bg:rgba(15,35,80,.55) !important}
.l-header{background:rgba(15,35,80,.55) !important}
.l-header__bar{background:transparent !important}
.l-fixHeader{background:transparent !important}
.l-fixHeader::before,.l-fixHeader:before{background:rgba(15,35,80,.62) !important}
/* SWELLテーマが .post_content 内の見出しに付ける装飾（h2の濃紺バー・h3の下線・h4の左ボーダー等）を打ち消し、単体HTMLプレビューと同一表示にする */
.savior-draft h1,.savior-draft h2,.savior-draft h3,.savior-draft h4,.savior-draft h5,.savior-draft h6{background:none!important;border:none!important;padding:0!important;margin-top:0;margin-bottom:0}
.savior-draft h1::before,.savior-draft h1::after,.savior-draft h2::before,.savior-draft h2::after,.savior-draft h3::before,.savior-draft h3::after,.savior-draft h4::before,.savior-draft h4::after,.savior-draft h5::before,.savior-draft h6::before{content:none!important;display:none!important;border:none!important;background:none!important}
</style>
'''
# CRITICAL: wrap everything in a single Gutenberg Custom-HTML block so WordPress
# outputs it VERBATIM. Freeform content otherwise runs through wpautop, which
# injects stray <p>/<br> tags, corrupts the div nesting, and makes .hero-media
# escape .hero -> the hero photo bleeds across the whole page.
inner=SV_FULLPAGE+'\n'+body
content='<!-- wp:html -->\n'+inner+'\n<!-- /wp:html -->'
# persist the exact deployed payload for the record
open(os.path.join(WD,'deployed-service.html'),'w',encoding='utf-8').write(content)

def put(pid, payload):
    data=json.dumps({'content':payload}).encode()
    req=urllib.request.Request(f"{SITE}/wp-json/wp/v2/pages/{pid}", data=data, method='POST',
        headers={'Authorization':f'Basic {auth}','Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r:
        d=json.load(r); return d
d=put(41, content)
print('OK id=%s status=%s modified=%s len=%d'%(d['id'],d['status'],d['modified'],len(content)))
