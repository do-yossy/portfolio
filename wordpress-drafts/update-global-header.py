# -*- coding: utf-8 -*-
"""ヘッダー背景変数(--color_header_bg)自体を半透明ネイビーに上書き＝全レイヤー/全端末に一括適用。"""
import os,json,base64,urllib.request,re
SITE=os.environ['WP_SITE'].rstrip('/');USER=os.environ['WP_USER'];PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
NEW=('<!-- wp:html -->\n<style id="sv-global-hdr">\n'
 '/* ヘッダー背景のみ半透明ネイビーに統一（/serviceに合わせる）。変数上書きで全レイヤー/全端末に適用。他要素は不変。 */\n'
 ':root{--color_header_bg:rgba(15,35,80,.55) !important}\n'
 '.l-header{background:rgba(15,35,80,.55) !important}\n'
 '.l-header__bar{background:transparent !important}\n'
 '.l-fixHeader{background:transparent !important}\n'
 '.l-fixHeader::before,.l-fixHeader:before{background:rgba(15,35,80,.62) !important}\n'
 '</style>\n<!-- /wp:html -->')
BLOCK_RE=re.compile(r'<!-- wp:html -->\s*<style id="sv-global-hdr">.*?</style>\s*<!-- /wp:html -->\s*', re.S)
def get_raw(pid):
    req=urllib.request.Request(f"{SITE}/wp-json/wp/v2/pages/{pid}?context=edit",headers={'Authorization':f'Basic {auth}'})
    with urllib.request.urlopen(req) as r: return json.load(r)
def put(pid,payload):
    data=json.dumps({'content':payload}).encode()
    req=urllib.request.Request(f"{SITE}/wp-json/wp/v2/pages/{pid}",data=data,method='POST',
        headers={'Authorization':f'Basic {auth}','Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r: return json.load(r)
for pid,name in [(11,'トップ'),(46,'会社概要'),(48,'お問い合わせ'),(50,'プライバシーポリシー')]:
    d=get_raw(pid); raw=d['content']['raw']
    new=NEW+'\n\n'+BLOCK_RE.sub('',raw)
    r=put(pid,new); print(f"{name} id={pid}: -> modified={r['modified']} len={len(new)}")
