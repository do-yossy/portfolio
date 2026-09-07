# -*- coding: utf-8 -*-
"""Make the SERVICE (事業案内) section on 会社概要(46) & お問い合わせ(48) identical
to the TOP page (11): remove the old description, swap the single 'サービス詳細'
button for the two-business sv-choose block, and add the sv-choose style block."""
import os,json,base64,urllib.request
SITE=os.environ['WP_SITE'].rstrip('/');USER=os.environ['WP_USER'];PW=os.environ['WP_APP_PASSWORD']
auth=base64.b64encode(f"{USER}:{PW}".encode()).decode()
BK='/home/user/portfolio/wordpress-drafts/backup-live'

STYLE=('<!-- wp:html -->\n<style id="sv-choose-style">\n'
 '.sv-choose{display:flex;flex-direction:column;gap:12px;margin-top:1rem;align-items:flex-start}\n'
 '.sv-choose .temple-btn{max-width:none;min-width:280px}\n'
 '@media(max-width:600px){.sv-choose{width:100%}.sv-choose .temple-btn{width:100%;min-width:0}}\n'
 '</style>\n<!-- /wp:html -->')
CHOOSE_PC=('<div class="sv-choose">\n'
 '      <a href="/service#jinzai" class="temple-btn">人材紹介事業</a>\n'
 '      <a href="/service#food" class="temple-btn">飲食店総合プロデュース事業</a>\n'
 '    </div>')
CHOOSE_SP=('<div class="sv-choose animated fadeIn delay-500ms">\n'
 '    <a href="/service#jinzai" class="temple-btn">人材紹介事業</a>\n'
 '    <a href="/service#food" class="temple-btn">飲食店総合プロデュース事業</a>\n'
 '  </div>')
P4_PC='<p class="p4">求職者と企業の理想を見据え、<br>個別のニーズに合わせたキャリア設計と助言を提供します。</p>'
P4_SP='<p class="p4 animated fadeIn delay-500ms">求職者と企業の理想を見据え、個別のニーズに合わせたキャリア設計と助言を提供します。</p>'
BTN_PC='<a href="/service" class="temple-btn">サービス詳細</a>'
BTN_SP='<a href="/service" class="temple-btn animated fadeIn delay-500ms">サービス詳細</a>'

def get_raw(pid):
    req=urllib.request.Request(f"{SITE}/wp-json/wp/v2/pages/{pid}?context=edit",headers={'Authorization':f'Basic {auth}'})
    with urllib.request.urlopen(req) as r: return json.load(r)
def put(pid,payload):
    data=json.dumps({'content':payload}).encode()
    req=urllib.request.Request(f"{SITE}/wp-json/wp/v2/pages/{pid}",data=data,method='POST',
        headers={'Authorization':f'Basic {auth}','Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r: return json.load(r)

for pid,name in [(46,'会社概要'),(48,'お問い合わせ')]:
    d=get_raw(pid); raw=d['content']['raw']
    # backup current live content before touching
    open(os.path.join(BK,f'page-{pid}-preSync.html'),'w',encoding='utf-8').write(
        f"<!-- BACKUP id={pid} slug={d['slug']} status={d['status']} modified={d['modified']} (pre SERVICE-sync) -->\n"+raw)
    before={'p4pc':raw.count(P4_PC),'p4sp':raw.count(P4_SP),'btnpc':raw.count(BTN_PC),'btnsp':raw.count(BTN_SP)}
    new=raw
    if 'sv-choose-style' not in new:
        new=STYLE+'\n\n'+new
    new=new.replace(P4_PC,'').replace(P4_SP,'')
    new=new.replace(BTN_SP,CHOOSE_SP)   # SP first (more specific)
    new=new.replace(BTN_PC,CHOOSE_PC)
    after={'choose':new.count('sv-choose"')+new.count('sv-choose '),'jinzai':new.count('/service#jinzai'),'food':new.count('/service#food'),'oldbtn':new.count('サービス詳細')}
    r=put(pid,new)
    print(f"{name} id={pid}: before={before} after={after} -> status={r['status']} modified={r['modified']} len={len(new)}")
