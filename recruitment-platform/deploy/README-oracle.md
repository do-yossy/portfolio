# Oracle Cloud Always Free で「求人フィード」を無料公開する手順

求人ページと求人ボックス向けXMLフィードだけを、**完全無料・常時起動**で公開するための手順です。
応募者の個人情報・管理画面は公開されません（`PUBLIC_MODE`＋求人だけDBで二重に遮断）。

> 正直な注意：Oracle は「無料・常時起動」で最良ですが、**アカウント作成〜VM〜SSH〜設定が一番技術的**です。
> 迷ったら各ステップを一緒に進めます（画面を見ながら聞いてください）。

---

## 全体像
```
ローカルPC(あなたの本番)  ──①求人だけDBを書き出し──▶  public.db
                                                          │ ②アップロード(scp)
                                                          ▼
Oracle無料VM(Ubuntu) ── ③setup.sh ──▶ node server.js (PUBLIC_MODE=1) ── ④求人ボックスがクロール
```

## 事前準備（ローカルPCで）
公開してよい「求人だけのDB」を作ります（応募者情報は入りません）。
```
cd C:\Users\sqtan\portfolio\recruitment-platform
node scripts/export-public-db.js
```
→ `data\public.db` ができます。

---

## STEP 1. Oracle Cloud の無料VMを作る
1. https://www.oracle.com/jp/cloud/free/ で **Always Free** アカウント作成（本人確認でクレカ登録あり・課金はされません）。
2. コンソールで **インスタンスの作成**：
   - イメージ：**Ubuntu 22.04**
   - シェイプ：**Always Free 対象**（Ampere ARM か VM.Standard.E2.1.Micro）
   - **SSHキー**：自動生成の秘密鍵をダウンロードして保管（ログインに使う）
3. 作成後に表示される **パブリックIPアドレス**を控える。

## STEP 2. 通信ポートを開ける（Oracle側のファイアウォール）
1. インスタンスの **サブネット → セキュリティリスト → イングレス・ルールの追加**：
   - ソースCIDR `0.0.0.0/0`、**TCP ポート 80, 443, 3000** を許可（ドメイン使うなら80/443、使わないなら3000）。

## STEP 3. VMにSSHで入る（Windows）
`Windows PowerShell` で（`鍵ファイル`と`IP`は自分のもの）：
```
ssh -i C:\path\to\ssh-key.key ubuntu@（VMのIP）
```

## STEP 4. 求人だけDBをVMへアップロード
別のPowerShellで（ローカルの public.db をVMへ・`recruitment.db`という名前で置く）：
```
scp -i C:\path\to\ssh-key.key C:\Users\sqtan\portfolio\recruitment-platform\data\public.db ubuntu@（VMのIP）:/tmp/public.db
```

## STEP 5. セットアップ実行（VMのSSH内で）
```
sudo apt-get update
curl -fsSL https://raw.githubusercontent.com/do-yossy/portfolio/main/recruitment-platform/deploy/oracle-setup.sh -o oracle-setup.sh
# 求人だけDBを所定の場所へ
sudo mkdir -p /opt/recruitment/recruitment-platform/data
# （setup実行後に配置でもOK。ここで先に置くなら↓）
# ドメインを使う場合は DOMAIN も指定
SITE_URL=https://あなたのドメイン DOMAIN=あなたのドメイン bash oracle-setup.sh
# ドメインが無い場合（IP:3000で公開）
# SITE_URL=http://（VMのIP）:3000 bash oracle-setup.sh
```
setup後、アップロードした public.db を配置してサービス再起動：
```
sudo cp /tmp/public.db /opt/recruitment/recruitment-platform/data/recruitment.db
sudo systemctl restart recruitment-public
```

## STEP 6. 動作確認
ブラウザで（自分のドメイン or IP:3000）：
- `https://あなたのドメイン/jobs` … 求人一覧が出る
- `https://あなたのドメイン/api/feed/kyujinbox?company=sq` … XMLが出る
- `https://あなたのドメイン/admin` … **404（遮断されていればOK）**

## STEP 7. 求人ボックスに申請・登録
求人ボックスの問い合わせで「サイト連携（クロール）／XML連携で掲載したい」を申請し、
フィードURL `https://あなたのドメイン/api/feed/kyujinbox?company=sq` を登録。

---

## 求人を更新したくなったら
1. ローカルで `node scripts/export-public-db.js`
2. `scp` で VM の `/tmp/public.db` に上書きアップロード
3. VMで `sudo cp /tmp/public.db /opt/recruitment/recruitment-platform/data/recruitment.db && sudo systemctl restart recruitment-public`

## 会社別フィードURL
- SQ：`.../api/feed/kyujinbox?company=sq`
- BG：`.../api/feed/kyujinbox?company=bg`
- ST：`.../api/feed/kyujinbox?company=st`
- 全社：`.../api/feed/kyujinbox`
