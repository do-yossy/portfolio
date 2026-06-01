#!/usr/bin/env python3
"""
Indeedログインページのデバッグ用スクリプト
実際のページHTMLとURLを確認する
"""
import os
import time
from playwright.sync_api import sync_playwright

email    = os.environ.get("INDEED_EMAIL", "")
password = os.environ.get("INDEED_PASSWORD", "")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        locale="ja-JP"
    )
    page = ctx.new_page()

    print("=== ログインページにアクセス ===")
    page.goto("https://secure.indeed.com/account/login", timeout=30000)
    time.sleep(4)

    print(f"URL: {page.url}")
    print(f"タイトル: {page.title()}")
    print("\n=== input要素一覧 ===")
    inputs = page.query_selector_all("input")
    for i in inputs:
        print(f"  type={i.get_attribute('type')} name={i.get_attribute('name')} id={i.get_attribute('id')} placeholder={i.get_attribute('placeholder')}")

    print("\n=== ページHTML（先頭3000文字）===")
    print(page.content()[:3000])

    browser.close()
