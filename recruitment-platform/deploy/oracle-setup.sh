#!/usr/bin/env bash
# =====================================================================
# Oracle Cloud Always Free (Ubuntu 22.04) 上に、求人ページ＋求人ボックス
# XMLフィードを配信する「読み取り専用サーバー」をセットアップするスクリプト。
#
# 使い方（VMにSSHログインして実行）:
#   SITE_URL=https://あなたのドメイン DOMAIN=あなたのドメイン bash oracle-setup.sh
#   ※ DOMAIN を指定するとCaddyで自動HTTPS化します。ドメインが無ければ DOMAIN は省略可
#      （その場合は http://VMのIP:3000 で公開。求人ボックス連携にはドメイン+HTTPS推奨）。
# 事前に: 公開用DB(public.db)を data/recruitment.db として置く（README参照）。
# =====================================================================
set -euo pipefail

APP_ROOT=/opt/recruitment
APP_DIR="$APP_ROOT/recruitment-platform"
REPO="https://github.com/do-yossy/portfolio.git"
PORT="${PORT:-3000}"
: "${SITE_URL:?SITE_URL（公開URL）を指定してください 例: SITE_URL=https://jobs.example.com}"
DOMAIN="${DOMAIN:-}"

echo "==> 1) Node.js 22 をインストール"
if ! node -v 2>/dev/null | grep -qE 'v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs git
else
  echo "    Node $(node -v) は既にOK"
fi

echo "==> 2) リポジトリを取得"
sudo mkdir -p "$APP_ROOT"; sudo chown "$USER":"$USER" "$APP_ROOT"
if [ -d "$APP_ROOT/.git" ]; then git -C "$APP_ROOT" pull --ff-only; else git clone --depth 1 "$REPO" "$APP_ROOT"; fi
mkdir -p "$APP_DIR/data"

if [ ! -f "$APP_DIR/data/recruitment.db" ]; then
  echo "    ⚠️  公開用DBが未配置です: $APP_DIR/data/recruitment.db"
  echo "        ローカルで  node scripts/export-public-db.js  で作った public.db を"
  echo "        この場所に recruitment.db という名前で置いてから、もう一度このスクリプトを実行してください。"
fi

echo "==> 3) systemd サービス登録（PUBLIC_MODE=読み取り専用で常時起動）"
sudo tee /etc/systemd/system/recruitment-public.service >/dev/null <<UNIT
[Unit]
Description=Recruitment public (read-only job feed)
After=network.target
[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Environment=PUBLIC_MODE=1
Environment=PORT=$PORT
Environment=SITE_URL=$SITE_URL
Restart=always
RestartSec=3
User=$USER
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now recruitment-public
echo "    サービス状態: $(systemctl is-active recruitment-public)"

echo "==> 4) ファイアウォール(OS側)を開放"
sudo iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null || true
if [ -n "$DOMAIN" ]; then sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true; sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true; fi
sudo netfilter-persistent save 2>/dev/null || true

if [ -n "$DOMAIN" ]; then
  echo "==> 5) Caddy を導入して自動HTTPS化（$DOMAIN → localhost:$PORT）"
  if ! command -v caddy >/dev/null; then
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update && sudo apt-get install -y caddy
  fi
  echo -e "$DOMAIN {\n    reverse_proxy localhost:$PORT\n}" | sudo tee /etc/caddy/Caddyfile >/dev/null
  sudo systemctl restart caddy
  echo "    → https://$DOMAIN で公開（DNSのAレコードをこのVMのIPに向けておくこと）"
fi

echo ""
echo "==================== 完了 ===================="
echo "フィードURL（求人ボックスに登録）:"
if [ -n "$DOMAIN" ]; then echo "  https://$DOMAIN/api/feed/kyujinbox?company=sq"; else echo "  http://$(curl -s ifconfig.me 2>/dev/null):$PORT/api/feed/kyujinbox?company=sq"; fi
echo "更新するとき: ローカルで public.db を作り直し → data/recruitment.db に上書き →"
echo "  sudo systemctl restart recruitment-public"
