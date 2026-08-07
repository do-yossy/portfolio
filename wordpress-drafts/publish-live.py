# -*- coding: utf-8 -*-
"""レビュー済みの下書きページの中身を、対応する公開ページへ反映して公開する。
各下書きに実際に投入された content(raw) をそのままコピーするため、
service の SV_FULLPAGE ラッパ等も含め、確認済みの見た目を忠実に本番へ反映する。
title / slug / テンプレートは変更せず、content と status=publish のみ更新する。
"""
import os, json, base64, urllib.request, urllib.parse

SITE=os.environ['WP_SITE'].rstrip('/'); USER=os.environ['WP_USER']; PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()

# 下書きID -> 公開ページID（ラベル）
MAP=[
    (1948, 11, 'トップ（フロントページ）'),
    (1939, 46, '会社概要 /company'),
    (1937, 41, '事業内容 /service'),
    (1954, 48, 'お問い合わせ /contact'),
    (2063, 50, 'プライバシーポリシー /policy'),
]

def api(method, path, payload=None):
    url=f"{SITE}/wp-json{path}"
    data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request(url, data=data, method=method,
        headers={'Authorization':f'Basic {auth}','Content-Type':'application/json','Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=45) as r: return json.load(r)

for draft_id, live_id, label in MAP:
    src=api('GET', f"/wp/v2/pages/{draft_id}?context=edit&_fields=id,content")
    content=src['content']['raw']
    d=api('POST', f"/wp/v2/pages/{live_id}", {'content':content, 'status':'publish'})
    print(f"公開: {label} live id={d['id']} status={d['status']} len={len(content)} (<-draft {draft_id})")
    print(f"  {d.get('link','')}")
