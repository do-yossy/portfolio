#!/usr/bin/env python3
"""
WordPress 下書きページ自動投入スクリプト（REST API）

現状の公開内容には一切触れず、新規ページを status=draft（下書き・未公開）で作成します。
- 「トップページ（仮）」と「サービス詳細」の2ページを作成
- 認証情報は環境変数から読み込むため、このファイルに秘密情報は含まれません

使い方（サイトに到達できるネットワークで実行）:
    export WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"   # 新しく発行したアプリパスワード
    export WP_USER="editor"                                  # 省略時 editor
    export WP_SITE="https://savior-corporation.com"          # 省略時このURL
    python3 create-wp-drafts.py

Python3標準ライブラリのみ使用（追加インストール不要）。
"""
import os, sys, json, base64, urllib.request, urllib.error

SITE = os.environ.get("WP_SITE", "https://savior-corporation.com").rstrip("/")
USER = os.environ.get("WP_USER", "editor")
APP_PW = os.environ.get("WP_APP_PASSWORD", "")

PAGES = [
    {"title": "サービス詳細（仮）", "file": "content-service.html", "slug": "service-detail-draft"},
    {"title": "トップページ（仮）", "file": "content-top.html",     "slug": "top-draft"},
]

def auth_header():
    token = base64.b64encode(f"{USER}:{APP_PW}".encode()).decode()
    return {"Authorization": f"Basic {token}"}

def req(method, path, payload=None):
    url = f"{SITE}/wp-json{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {**auth_header(), "Content-Type": "application/json", "Accept": "application/json"}
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode())

def main():
    if not APP_PW:
        sys.exit("ERROR: 環境変数 WP_APP_PASSWORD が未設定です。")
    here = os.path.dirname(os.path.abspath(__file__))

    # 1) 認証・到達確認
    print(f"[1/2] 接続確認: {SITE} （user={USER}）")
    try:
        me = req("GET", "/wp/v2/users/me?context=edit")
        print(f"      OK: 認証成功 — {me.get('name')} (role確認済み)")
    except urllib.error.HTTPError as e:
        sys.exit(f"      NG: 認証/接続失敗 HTTP {e.code} — {e.read().decode()[:300]}")
    except Exception as e:
        sys.exit(f"      NG: 接続失敗 — {e}\n      ※ サイトに到達できるネットワークで実行してください。")

    # 2) 下書きページ作成
    print(f"[2/2] 下書きページを作成（status=draft・非公開）")
    for p in PAGES:
        content = open(os.path.join(here, p["file"]), encoding="utf-8").read()
        payload = {"title": p["title"], "content": content, "status": "draft", "slug": p["slug"]}
        try:
            res = req("POST", "/wp/v2/pages", payload)
            print(f"      作成: 「{p['title']}」 id={res['id']}")
            print(f"        編集: {SITE}/wp-admin/post.php?post={res['id']}&action=edit")
            print(f"        プレビュー: {res.get('link','(下書き)')}?preview=true")
        except urllib.error.HTTPError as e:
            print(f"      失敗: 「{p['title']}」 HTTP {e.code} — {e.read().decode()[:300]}")

    print("\n完了。管理画面の「固定ページ → 下書き」で確認できます（公開はされていません）。")

if __name__ == "__main__":
    main()
