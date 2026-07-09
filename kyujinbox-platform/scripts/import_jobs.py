#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""既存の求人票PDF（ZIPに複数入り）を読み込み、求人ボックス掲載用の構造化データに変換する。
使い方:
  python scripts/import_jobs.py <zipファイル>
環境変数:
  ANTHROPIC_API_KEY  必須（Claude APIキー）
  OPTIMIZER_MODEL    既定 claude-sonnet-5
  JOB_KIND           'normal'(通常求人) / 'agency'(人材紹介求人)。既定 normal
  COMPANY            会社ID（ログ表示用）
出力(stdout, 1行1JSON):
  {"type":"progress","message":"..."}
  {"type":"job","source_file":"xxx.pdf","job":{...}}   ← Nodeがこれを受け取りDBへ登録
  {"type":"done","count":N,"failed":M}
"""
import sys, os, json, zipfile, base64, urllib.request, urllib.error

API_KEY = (os.environ.get('ANTHROPIC_API_KEY') or '').strip()
MODEL   = (os.environ.get('OPTIMIZER_MODEL') or 'claude-sonnet-5').strip()
JOB_KIND = (os.environ.get('JOB_KIND') or 'normal').strip()

def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n"); sys.stdout.flush()

def progress(msg):
    out({"type": "progress", "message": msg})

FIELDS = {
    "title": "求人タイトル（求人ボックス向けに簡潔で検索されやすいもの）",
    "location": "勤務地（都道府県＋市区町村）",
    "salary": "給与（例: 月給300,000円〜370,000円）",
    "jobType": "職種名",
    "employmentType": "雇用形態（正社員/契約社員/アルバイト等）",
    "catchcopy": "キャッチコピー（1〜2文）",
    "description": "仕事内容の本文（見出し・箇条書きを含め読みやすく）",
    "qualifications": "応募資格・対象となる方",
    "benefit": "給与補足・待遇・福利厚生",
    "worktimeHoliday": "勤務時間・休日",
    "transportation": "アクセス・交通・車通勤可否",
    "rewarding": "仕事のやりがい・アピールポイント",
    "howToApply": "応募方法・選考の流れ",
    "tags": "検索キーワードの配列（例: [\"未経験OK\",\"正社員\",\"日勤\"]）",
}

def build_prompt():
    kind_note = ""
    if JOB_KIND == 'agency':
        kind_note = ("\nこの求人は【人材紹介（職業紹介）】です。実際の雇用主は紹介先企業です。"
                     "事実（職種・勤務地・給与・雇用形態）は絶対に変えず、求人ボックス掲載用に整えてください。")
    keys = "\n".join(f'- {k}: {v}' for k, v in FIELDS.items())
    return (f"添付の求人票PDFから、求人ボックス掲載用の情報を抽出してください。{kind_note}\n"
            f"次のキーを持つJSONだけを出力（前後に説明やコードフェンスを付けない）:\n{keys}\n"
            "PDFに無い項目は空文字（tagsは空配列）にしてください。誇張・虚偽・実在しない条件の追加は禁止です。")

def parse_pdf(pdf_bytes):
    b64 = base64.b64encode(pdf_bytes).decode('ascii')
    body = {
        "model": MODEL, "max_tokens": 3000,
        "messages": [{"role": "user", "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
            {"type": "text", "text": build_prompt()},
        ]}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode('utf-8'),
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    s, e = text.find('{'), text.rfind('}')
    if s < 0 or e < 0:
        raise ValueError("AI応答からJSONを抽出できませんでした")
    obj = json.loads(text[s:e+1])
    # 正規化
    job = {k: (obj.get(k) or ("" if k != "tags" else [])) for k in FIELDS}
    if not isinstance(job.get("tags"), list):
        job["tags"] = [t.strip() for t in str(job.get("tags") or "").split(",") if t.strip()]
    return job

def main():
    if len(sys.argv) < 2:
        progress("ZIPファイルが指定されていません"); out({"type": "done", "count": 0, "failed": 0}); return
    if not API_KEY or API_KEY.startswith('sk-ant-your'):
        progress("❌ ANTHROPIC_API_KEY が未設定です（.envに本物のキーを設定してください）")
        out({"type": "done", "count": 0, "failed": 0}); return
    zip_path = sys.argv[1]
    kind_label = "人材紹介求人" if JOB_KIND == 'agency' else "通常求人"
    count = 0; failed = 0
    try:
        zf = zipfile.ZipFile(zip_path)
    except Exception as ex:
        progress(f"❌ ZIPを開けませんでした: {ex}"); out({"type": "done", "count": 0, "failed": 0}); return
    pdfs = [n for n in zf.namelist() if n.lower().endswith('.pdf') and not n.startswith('__MACOSX')]
    progress(f"📦 ZIP内のPDF: {len(pdfs)}件（区分: {kind_label}）")
    for i, name in enumerate(pdfs, 1):
        base = os.path.basename(name)
        try:
            progress(f"📄 [{i}/{len(pdfs)}] 読み込み中: {base}")
            job = parse_pdf(zf.read(name))
            out({"type": "job", "source_file": base, "job": job})
            count += 1
            progress(f"  ✅ 変換完了: {job.get('title','')[:40]}")
        except urllib.error.HTTPError as he:
            failed += 1
            try: detail = he.read().decode('utf-8')[:200]
            except Exception: detail = str(he)
            progress(f"  ❌ {base}: Claude APIエラー {he.code}: {detail}")
        except Exception as ex:
            failed += 1
            progress(f"  ❌ {base}: {ex}")
    out({"type": "done", "count": count, "failed": failed})

if __name__ == "__main__":
    main()
