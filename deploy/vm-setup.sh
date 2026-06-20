#!/usr/bin/env bash
#
# PAWP connect relay — one-shot VM setup (Ubuntu 22.04/24.04, e.g. Oracle Cloud
# Always Free or GCP e2-micro). Run this ON the VM, as a sudo-capable user:
#
#   curl -fsSL https://raw.githubusercontent.com/Anandjeechoubey/youtube-watchparty/main/deploy/vm-setup.sh | bash -s -- pawp.duckdns.org
#   # or, after cloning the repo:
#   bash deploy/vm-setup.sh pawp.duckdns.org
#
# Argument: the domain that points at this VM's public IP (a free DuckDNS
# subdomain works great). Caddy uses it to fetch a Let's Encrypt cert so the
# relay is reachable over wss://.
#
set -euo pipefail

DOMAIN="${1:?usage: vm-setup.sh <your-domain>   (e.g. pawp.duckdns.org)}"
REPO_URL="https://github.com/Anandjeechoubey/youtube-watchparty.git"
APP_DIR="/opt/pawp"
RUN_USER="$(whoami)"

say() { printf '\n\033[1;33m• %s\033[0m\n' "$*"; }

say "Updating apt"
sudo apt-get update -y

say "Installing Node.js 22 LTS (if missing)"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

say "Fetching the relay code into $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$RUN_USER":"$RUN_USER" "$APP_DIR"
if [ -d "$APP_DIR/repo/.git" ]; then
  git -C "$APP_DIR/repo" pull --ff-only
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR/repo"
fi
cd "$APP_DIR/repo/server"
npm install --omit=dev

say "Creating the systemd service (relay on 127.0.0.1:8080)"
sudo tee /etc/systemd/system/pawp-relay.service >/dev/null <<UNIT
[Unit]
Description=PAWP connect WebSocket relay
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR/repo/server
Environment=PORT=8080
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now pawp-relay
sudo systemctl restart pawp-relay

say "Opening ports 80/443 in the OS firewall (Oracle images block these by default)"
if command -v iptables >/dev/null 2>&1; then
  sudo iptables -I INPUT -p tcp --dport 80  -m conntrack --ctstate NEW -j ACCEPT || true
  sudo iptables -I INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT || true
  if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save || true; fi
fi

say "Installing Caddy (auto-HTTPS reverse proxy)"
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

say "Writing Caddyfile for $DOMAIN -> localhost:8080"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$DOMAIN {
    reverse_proxy localhost:8080
}
CADDY
sudo systemctl reload caddy || sudo systemctl restart caddy

say "Done."
echo "-------------------------------------------------------------"
echo "Relay service : sudo systemctl status pawp-relay"
echo "Local health  : curl http://localhost:8080/health"
echo "Public health : curl https://$DOMAIN/health   (after DNS + cert, ~30s)"
echo
echo "Use this in the extension's Server URL:"
echo "    wss://$DOMAIN"
echo "-------------------------------------------------------------"
