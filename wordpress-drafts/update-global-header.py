# -*- coding: utf-8 -*-
"""全ページのヘッダー背景を半透明ネイビーに統一（包括的に全レイヤーを上書き）。
既存の sv-global-hdr ブロックを置換する。"""
import os,json,base64,urllib.request,re
SITE=os.environ['WP_SITE'].rstrip('/');USER=os.environ['WP_USER'];PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
NEW=('<!-- wp:html -->\n<style id="sv-global-hdr">\n'
 '/* ヘッダー背景のみ半透明ネイビーに統一（/serviceに合わせる）。他要素は不変。 */\n'
 '.l-header{background:linear-gradient(to bottom,rgba(13,30,66,.6),rgba(13,30,66,.42)) !important}\n'
 '.l-header__bar{background:transparent !important}\n'
 '.l-fixHeader{background:transparent !important}\n'
 '.l-fixHeader::before,.l-fixHeader:before{background:linear-gradient(to bottom,rgba(13,30,66,.72),rgba(13,30,66,.5)) !important}\n'
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
    stripped=BLOCK_RE.sub('',raw)
    new=NEW+'\n\n'+stripped
    r=put(pid,new)
    print(f"{name} id={pid}: replaced=({('sv-global-hdr' in raw)}) -> modified={r['modified']} len={len(new)}")
