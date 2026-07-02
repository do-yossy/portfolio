# -*- coding: utf-8 -*-
"""全ページのテーマヘッダー背景だけを半透明ネイビーに統一（他は不変）。
各ページ本文の先頭に、ヘッダー背景のみを上書きする Custom-HTML ブロックを注入。"""
import os,json,base64,urllib.request
SITE=os.environ['WP_SITE'].rstrip('/');USER=os.environ['WP_USER'];PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
BK='/home/user/portfolio/wordpress-drafts/backup-live'
MARK='sv-global-hdr'
BLOCK=('<!-- wp:html -->\n<style id="'+MARK+'">\n'
 '/* ヘッダー背景のみ半透明ネイビーに統一（/serviceに合わせる）。他要素は変更しない。 */\n'
 '.l-header,.l-fixHeader{background:linear-gradient(to bottom,rgba(13,30,66,.62),rgba(13,30,66,.42)) !important}\n'
 '</style>\n<!-- /wp:html -->')
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
    open(os.path.join(BK,f'page-{pid}-preHdr.html'),'w',encoding='utf-8').write(
        f"<!-- BACKUP id={pid} slug={d['slug']} status={d['status']} modified={d['modified']} (pre global-header) -->\n"+raw)
    if MARK in raw:
        print(f"{name} id={pid}: already has header override, skip"); continue
    new=BLOCK+'\n\n'+raw
    r=put(pid,new)
    print(f"{name} id={pid}: injected -> status={r['status']} modified={r['modified']} len={len(new)}")
