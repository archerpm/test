#!/usr/bin/env bash
# Разовая настройка VPS (Ubuntu 22.04/24.04). Запускать от root:
#   sudo DOMAIN=example.ru DEPLOY_PUBKEY="ssh-ed25519 AAAA… ваш-ключ" bash setup-server.sh
# DOMAIN и DEPLOY_PUBKEY необязательны. Скрипт можно запускать повторно.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo)"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="${DOMAIN:-_}"

echo "== Пакеты"
apt-get update -y
apt-get install -y nginx rsync nodejs   # Node ≥ 18 нужен только для проверки ссылок
node -e 'if (parseInt(process.versions.node) < 18) { console.error("Нужен Node 18+"); process.exit(1) }'

echo "== Пользователь deploy (только для выкладки файлов, без пароля)"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys; chmod 600 /home/deploy/.ssh/authorized_keys
fi

echo "== Каталоги"
install -d -o deploy -g deploy /var/www/posobie /var/www/posobie-status /opt/posobie-tools

echo "== nginx"
install -m 644 "$HERE/posobie-headers.conf" /etc/nginx/snippets/posobie-headers.conf
sed "s/server_name _;/server_name ${DOMAIN};/" "$HERE/nginx-posobie.conf" > /etc/nginx/sites-available/posobie
ln -sf /etc/nginx/sites-available/posobie /etc/nginx/sites-enabled/posobie
rm -f /etc/nginx/sites-enabled/default   # заглушка «404 Not Found»
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "== Еженедельная проверка ссылок (systemd)"
install -m 644 "$HERE/posobie-links.service" /etc/systemd/system/posobie-links.service
install -m 644 "$HERE/posobie-links.timer" /etc/systemd/system/posobie-links.timer
timedatectl set-timezone Europe/Moscow 2>/dev/null || true
systemctl daemon-reload
systemctl enable --now posobie-links.timer

echo "== Брандмауэр (если включён ufw)"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 'Nginx Full' || true; fi

echo
echo "Готово. Дальше: выложить сайт (deploy/deploy.sh или deploy/deploy.ps1)."
echo "HTTPS (нужен домен, указывающий на этот сервер):  apt install -y certbot python3-certbot-nginx && certbot --nginx -d ${DOMAIN}"
