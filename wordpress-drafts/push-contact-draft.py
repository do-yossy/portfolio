# -*- coding: utf-8 -*-
"""お問い合わせページ：ヘッダーを他ページと統一（sv-global-hdr、既存と同一）＋SERVICEにRPO事業ボタン追加。
公開せず status=draft の下書きとして投入。live(id=48)には触れない。slug 'contact-rpo-draft'。
"""
import os, json, base64, urllib.request, urllib.parse
SITE=os.environ['WP_SITE'].rstrip('/'); USER=os.environ['WP_USER']; PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
WD=os.path.dirname(os.path.abspath(__file__))
SLUG='contact-rpo-draft'; TITLE='お問い合わせ（ヘッダー統一・RPOボタン追加・下書き）'
content=open(os.path.join(WD,'content-contact.html'),encoding='utf-8').read()

def api(method, path, payload=None):
    url=f"{SITE}/wp-json{path}"
    data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request(url, data=data, method=method,
        headers={'Authorization':f'Basic {auth}','Content-Type':'application/json','Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)

existing=api('GET', f"/wp/v2/pages?status=draft,publish,pending,private&slug={urllib.parse.quote(SLUG)}&context=edit")
if existing:
    pid=existing[0]['id']
    d=api('POST', f"/wp/v2/pages/{pid}", {'content':content, 'status':'draft', 'title':TITLE}); action='更新'
else:
    d=api('POST', "/wp/v2/pages", {'title':TITLE, 'slug':SLUG, 'content':content, 'status':'draft'}); action='新規作成'
link=d.get('link',''); sep='&' if '?' in link else '?'
print(f"{action}: id={d['id']} status={d['status']} len={len(content)}")
print(f"  プレビュー: {link}{sep}preview=true")
