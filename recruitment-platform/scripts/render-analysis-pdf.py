#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
採用ファネル解釈レポート（Markdown）をPDFに変換する。
日本語表示には実際のTrueTypeフォント（IPAゴシック等）を埋め込む方式を使う。
【重要】reportlab組み込みのCIDフォント（HeiseiKakuGo-W5等）はフォント自体を埋め込まないため、
そのフォントを持たないPDFビューア（多くのブラウザ/Windows標準ビューア等）では文字が
表示されない（空白になる）ことを確認済み。そのため必ずTTF埋め込み方式を使うこと。
見出し・表・箇条書き・通常文を簡易パースして変換する。本格的なMarkdown文法には対応していない
（この採用分析レポートの書式専用）。

使い方:
  python3 scripts/render-analysis-pdf.py <入力.md> <出力.pdf>
"""
import glob
import os
import re
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

FONT = 'IPAGothic'
_CANDIDATES = [
    '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
] + glob.glob('/usr/share/fonts/**/NotoSansCJK*.ttc', recursive=True) \
  + glob.glob('/usr/share/fonts/**/NotoSansJP*.ttf', recursive=True)
_FONT_PATH = next((p for p in _CANDIDATES if os.path.exists(p)), None)
if not _FONT_PATH:
    raise SystemExit('日本語TrueTypeフォントが見つかりません（IPAゴシック等をインストールしてください）')
pdfmetrics.registerFont(TTFont(FONT, _FONT_PATH))

styles = {
    'h1': ParagraphStyle('h1', fontName=FONT, fontSize=16, leading=20, spaceAfter=10, spaceBefore=4),
    'h2': ParagraphStyle('h2', fontName=FONT, fontSize=13, leading=17, spaceAfter=8, spaceBefore=12,
                          textColor=colors.HexColor('#1a3d5c')),
    'body': ParagraphStyle('body', fontName=FONT, fontSize=9.5, leading=14, spaceAfter=6),
    'bold': ParagraphStyle('bold', fontName=FONT, fontSize=9.5, leading=14, spaceAfter=6),
}


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def inline_md(t):
    # **bold** -> <b>bold</b>（reportlabのParagraphはXMLタグでインライン装飾を解釈する）
    t = esc(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    return t


def is_table_row(line):
    return line.strip().startswith('|') and line.strip().endswith('|')


def is_separator_row(line):
    return bool(re.match(r'^\|[\s:\-|]+\|$', line.strip()))


def parse_table(lines, i):
    rows = []
    while i < len(lines) and is_table_row(lines[i]):
        if not is_separator_row(lines[i]):
            cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
            rows.append(cells)
        i += 1
    return rows, i


def build_flowables(md_text):
    lines = md_text.split('\n')
    story = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if stripped == '---':
            story.append(HRFlowable(width='100%', color=colors.HexColor('#cccccc'), spaceBefore=6, spaceAfter=6))
            i += 1
        elif stripped.startswith('# '):
            story.append(Paragraph(inline_md(stripped[2:]), styles['h1']))
            i += 1
        elif stripped.startswith('## '):
            story.append(Paragraph(inline_md(stripped[3:]), styles['h2']))
            i += 1
        elif stripped.startswith('### '):
            story.append(Paragraph(inline_md(stripped[4:]), styles['h2']))
            i += 1
        elif is_table_row(stripped):
            rows, i = parse_table(lines, i)
            if rows:
                col_count = len(rows[0])
                avail_width = 170 * mm
                col_width = avail_width / col_count
                data = [[Paragraph(inline_md(c), styles['body']) for c in r] for r in rows]
                t = Table(data, colWidths=[col_width] * col_count, repeatRows=1)
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8eef3')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bbbbbb')),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('FONTNAME', (0, 0), (-1, -1), FONT),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 3),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ]))
                story.append(t)
                story.append(Spacer(1, 8))
        elif re.match(r'^\d+\.\s', stripped) or stripped.startswith('- '):
            text = re.sub(r'^\d+\.\s', '', stripped)
            text = re.sub(r'^-\s', '', text)
            story.append(Paragraph('・' + inline_md(text), styles['body']))
            i += 1
        else:
            story.append(Paragraph(inline_md(stripped), styles['body']))
            i += 1
    return story


def main():
    if len(sys.argv) != 3:
        print('使い方: python3 scripts/render-analysis-pdf.py <入力.md> <出力.pdf>')
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as f:
        md_text = f.read()
    doc = SimpleDocTemplate(dst, pagesize=A4,
                             topMargin=18 * mm, bottomMargin=18 * mm,
                             leftMargin=16 * mm, rightMargin=16 * mm)
    story = build_flowables(md_text)
    doc.build(story)
    print(f'完了: {dst}')


if __name__ == '__main__':
    main()
