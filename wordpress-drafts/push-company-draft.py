# -*- coding: utf-8 -*-
"""会社概要に「代表メッセージ」を企業理念と企業情報の間へ挿入し、
スクロール連動の動きを付けた内容を、公開せず status=draft の下書きページとして投入する。

- live の会社概要（id=46）には一切触れない。
- source は content-company.html（raw をベースにメッセージ＋モーションを組み込み済み）。
- slug 'company-message-draft' の下書きが既にあれば更新、なければ新規作成（重複しない）。
"""
import os, json, base64, urllib.request, urllib.parse
SITE=os.environ['WP_SITE'].rstrip('/'); USER=os.environ['WP_USER']; PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
WD=os.path.dirname(os.path.abspath(__file__))
SLUG='company-message-draft'; TITLE='会社概要（代表メッセージ追加・動き付き・下書き）'

content=open(os.path.join(WD,'content-company.html'),encoding='utf-8').read()

def api(method, path, payload=None):
    url=f"{SITE}/wp-json{path}"
    data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request(url, data=data, method=method,
        headers={'Authorization':f'Basic {auth}','Content-Type':'application/json','Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)

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
