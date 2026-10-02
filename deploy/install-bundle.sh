#!/usr/bin/env bash
# Серверная часть выкладки: запускается автоматически из ship.ps1 / ship.sh, вручную обычно не нужна.
# Устанавливает nginx и Node, раскладывает сайт, настраивает заголовки безопасности и недельную проверку ссылок.
# Безопасно запускать повторно: каждый запуск обновляет сайт до версии из пакета.
# Переменные: DOMAIN (имя сайта, по умолчанию _ — любой), CERTBOT=1 EMAIL=… (выпустить HTTPS-сертификат).
set -euo pipefail
[ "$(id -u)" = 0 ] || exec sudo -E bash "$0" "$@"

B="$(cd "$(dirname "$0")/.." && pwd)"   # корень распакованного пакета: dist/, tools/, deploy/
DOMAIN="${DOMAIN:-_}"
log() { printf '\n== %s\n' "$*"; }
HAS_SYSTEMD=0; [ -d /run/systemd/system ] && HAS_SYSTEMD=1

log "Пакеты (nginx, Node)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx nodejs ca-certificates curl
node -e 'if (parseInt(process.versions.node) < 18) { console.error("Нужен Node 18+, установлен " + process.version); process.exit(1) }'

log "Файлы сайта"
install -d -m 755 /var/www/posobie /opt/posobie-tools
install -d -m 755 -o www-data -g www-data /var/www/posobie-status
find /var/www/posobie -mindepth 1 -delete
cp -a "$B/dist/." /var/www/posobie/
rm -rf /opt/posobie-tools && install -d -m 755 /opt/posobie-tools && cp -a "$B/tools/." /opt/posobie-tools/
chmod -R a+rX /var/www/posobie /opt/posobie-tools

log "nginx"
install -d /etc/nginx/snippets
install -m 644 "$B/deploy/posobie-headers.conf" /etc/nginx/snippets/posobie-headers.conf
sed "s/server_name _;/server_name ${DOMAIN};/" "$B/deploy/nginx-posobie.conf" > /etc/nginx/sites-available/posobie
# если на сервере отключён IPv6, строка listen [::] помешала бы nginx запуститься
[ -e /proc/net/if_inet6 ] || sed -i '/listen \[::\]/d' /etc/nginx/sites-available/posobie
ln -sf /etc/nginx/sites-available/posobie /etc/nginx/sites-enabled/posobie
rm -f /etc/nginx/sites-enabled/default   # заглушка «404 Not Found»
nginx -t
if [ "$HAS_SYSTEMD" = 1 ]; then systemctl enable --now nginx; systemctl reload nginx; else nginx -s reload 2>/dev/null || nginx; fi

if [ "${CERTBOT:-0}" = 1 ] && [ "$DOMAIN" != "_" ]; then
  log "HTTPS (Let's Encrypt)"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${EMAIL:?Укажите EMAIL для сертификата}" --redirect
  sed -i 's/^# add_header Strict-Transport-Security/add_header Strict-Transport-Security/' /etc/nginx/snippets/posobie-headers.conf
  nginx -t && { [ "$HAS_SYSTEMD" = 1 ] && systemctl reload nginx || nginx -s reload; }
fi

if [ "$HAS_SYSTEMD" = 1 ]; then
  log "Еженедельная проверка ссылок (понедельник, 06:00 по Москве)"
  install -m 644 "$B/deploy/posobie-links.service" /etc/systemd/system/posobie-links.service
  install -m 644 "$B/deploy/posobie-links.timer" /etc/systemd/system/posobie-links.timer
  timedatectl set-timezone Europe/Moscow 2>/dev/null || true
  systemctl daemon-reload
  systemctl enable --now posobie-links.timer
else
  log "systemd не найден: еженедельная проверка не настроена (запускайте node /opt/posobie-tools/scripts/check-links.mjs вручную)"
fi

log "Брандмауэр"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 'Nginx Full' || true; echo "ufw: порты 80/443 открыты"; else echo "ufw не включён — ничего не меняем"; fi

log "Самопроверка"
code() { curl -s -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN/_/localhost}" "$@"; }
echo "Главная страница:     HTTP $(code http://127.0.0.1/)"
echo "Несуществующая:       HTTP $(code http://127.0.0.1/nope)  (ожидается 404)"
echo "Заголовок CSP:        $(curl -sI http://127.0.0.1/ | grep -ci '^content-security-policy') шт."
echo "Сервис-воркер:        $(curl -sI http://127.0.0.1/sw.js | grep -i '^cache-control' | tr -d '\r')"

log "Проверка ссылок с этого сервера (российский адрес)"
( cd /opt/posobie-tools && PLAIN=1 timeout 240 node scripts/check-freshness.mjs && PLAIN=1 timeout 240 node scripts/check-links.mjs ) 2>&1 | tee /var/www/posobie-status/links.txt | head -40 || true
chown www-data:www-data /var/www/posobie-status/links.txt 2>/dev/null || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
log "Готово"
echo "Сайт:   http://${DOMAIN/_/${IP:-IP_сервера}}/"
echo "Отчёт:  http://${DOMAIN/_/${IP:-IP_сервера}}/status/links.txt"
[ "$DOMAIN" = "_" ] && echo "Совет: без домена не работают HTTPS, офлайн-режим и установка как приложения (нужен домен и CERTBOT=1)."
