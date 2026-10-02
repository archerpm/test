#!/usr/bin/env bash
# Серверная часть выкладки. Запускается из ship.ps1 / ship.sh.
#
# Принципы безопасности для сервера с другими службами (nginx, игровой сервер и т. п.):
#  • ничего чужого не удаляется и не перенастраивается: сайты nginx, default, nginx.conf, часовой пояс, брандмауэр;
#  • nginx только перечитывает конфигурацию (reload, без обрыва соединений) и только после успешной проверки `nginx -t`;
#    при любой ошибке наши файлы убираются, и конфигурация возвращается к исходной;
#  • apt не обновляет установленные пакеты (--no-upgrade) и не перезапускает службы (NEEDRESTART_MODE=l);
#    без необходимости apt не вызывается вовсе (Node берётся системный или скачивается отдельным каталогом);
#  • перед началом сохраняется копия /etc/nginx, до и после сравниваются запущенные службы и открытые порты.
#
# Переменные: DRY_RUN=1 (только отчёт, без изменений), DOMAIN, WEBPORT, CERTBOT=1 EMAIL=…
set -euo pipefail
[ "$(id -u)" = 0 ] || exec sudo -E bash "$0" "$@"

B="$(cd "$(dirname "$0")/.." && pwd)"   # корень распакованного пакета: dist/, tools/, deploy/
DOMAIN="${DOMAIN:-_}"; WEBPORT="${WEBPORT:-}"; DRY="${DRY_RUN:-0}"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l NEEDRESTART_SUSPEND=1
log()  { printf '\n== %s\n' "$*"; }
warn() { printf '!! %s\n' "$*"; }
HAS_SYSTEMD=0; [ -d /run/systemd/system ] && HAS_SYSTEMD=1
SNAP="$(mktemp -d)"; trap 'rm -rf "$SNAP"' EXIT

snapshot() {
  if [ "$HAS_SYSTEMD" = 1 ]; then systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null | awk '{print $1}' | sort > "$SNAP/$1.services" || true; else : > "$SNAP/$1.services"; fi
  ss -lntuH 2>/dev/null | awk '{print $1, $5}' | sort > "$SNAP/$1.ports" || true
  { pgrep -fa -i 'rustdesk|hbbs|hbbr|rust' 2>/dev/null || true; } | grep -v -e pgrep -e install-bundle | awk '{print $1}' | sort > "$SNAP/$1.rustpids" || true
}
port_busy() { ss -lntH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }

# ---------------------------------------------------------------- отчёт о сервере
log "Что уже работает на сервере (только чтение)"
. /etc/os-release 2>/dev/null && echo "Система:      $PRETTY_NAME"
echo "Память/диск:  $(free -h 2>/dev/null | awk '/Mem:/ {print $2" всего, "$7" доступно"}'), корень: $(df -h / | awk 'NR==2 {print $4" свободно"}')"
if command -v nginx >/dev/null; then
  echo "nginx:        $(nginx -v 2>&1)"
  echo "Сайты nginx (listen / server_name):"
  nginx -T 2>/dev/null | grep -E '^\s*(listen|server_name)\s' | sed 's/^\s*/    /' | sort -u | head -30
else
  echo "nginx:        не установлен (будет установлен)"
fi
echo "Слушающие порты:"; ss -lntuH 2>/dev/null | awk '{print "    "$1, $5}' | sort -u | head -30
echo "RustDesk/Rust: $( { pgrep -fa -i 'rustdesk|hbbs|hbbr|rust' 2>/dev/null || true; } | grep -v -e pgrep -e install-bundle | wc -l ) процесс(ов); systemd: $( [ "$HAS_SYSTEMD" = 1 ] && systemctl list-units --type=service --no-legend --plain 2>/dev/null | grep -i -E 'rustdesk|hbbs|hbbr|rust' | awk '{print $1}' | tr '\n' ' ' )"

# выбор порта
LISTEN=""
if [ "$DOMAIN" != "_" ]; then
  LISTEN=80
  if command -v nginx >/dev/null && nginx -T 2>/dev/null | grep -E '^\s*server_name\s' | grep -qw "$DOMAIN"; then warn "Домен $DOMAIN уже есть в конфигурации nginx — проверьте, не принадлежит ли он другому сайту."; fi
else
  if [ -n "$WEBPORT" ]; then
    port_busy "$WEBPORT" && { warn "Порт $WEBPORT уже занят. Укажите другой (-WebPort)."; exit 1; }
    LISTEN="$WEBPORT"
  else
    for p in $(seq 8088 8120); do port_busy "$p" || { LISTEN="$p"; break; }; done
    [ -n "$LISTEN" ] || { warn "Не нашёл свободный порт в 8088–8120."; exit 1; }
  fi
fi
# если указан домен — проверяем, что он уже указывает на этот сервер (иначе Let's Encrypt откажет, а лимиты на ошибки строгие)
DNS_OK=""; DNS_MSG=""
if [ "$DOMAIN" != "_" ]; then
  RES="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  if [ -z "$RES" ]; then DNS_MSG="домен $DOMAIN пока не найден в DNS (создайте A-запись на IP этого сервера и подождите)"
  elif hostname -I 2>/dev/null | tr ' ' '\n' | grep -qxF "$(echo $RES | awk '{print $1}')"; then DNS_OK=1; DNS_MSG="домен $DOMAIN указывает на этот сервер ($RES)"
  else DNS_MSG="домен $DOMAIN указывает на $RES, а не на этот сервер ($(hostname -I | awk '{print $1}'))"; fi
  [ "${SKIP_DNS_CHECK:-0}" = 1 ] && DNS_OK=1   # для серверов за NAT, где локальный IP отличается от публичного
  echo "DNS:          $DNS_MSG"
fi
NEED_NODE=""; command -v node >/dev/null && node -e 'process.exit(parseInt(process.versions.node)>=18?0:1)' 2>/dev/null || NEED_NODE=1

log "План изменений"
cat <<PLAN
  Будет создано:  /var/www/posobie, /var/www/posobie-status, /opt/posobie-tools,
                  /etc/nginx/sites-available/posobie (+ ссылка в sites-enabled), /etc/nginx/snippets/posobie-headers.conf,
                  systemd: posobie-links.service и posobie-links.timer (еженедельная проверка ссылок, низкий приоритет)
  Адрес сайта:    $( [ "$DOMAIN" != "_" ] && echo "http://$DOMAIN/ (порт 80, без default_server)" || echo "http://IP_сервера:$LISTEN/ (свободный порт, порт 80 не используется)" )
  Не будет тронуто: остальные сайты nginx, default, nginx.conf, брандмауэр (кроме добавления разрешения для нашего порта, если ufw включён), часовой пояс, RustDesk (hbbs/hbbr, порты 21115–21119) и любые другие службы
  Node.js:        $( [ -n "$NEED_NODE" ] && echo "системного нет — скачается отдельно в /opt/posobie-tools/node (apt не используется)" || echo "используется системный $(node -v)" )
  Перезапуск nginx: нет, только reload после успешной проверки конфигурации
PLAN
if [ "$DRY" = 1 ]; then log "DRY_RUN: ничего не изменено"; exit 0; fi

snapshot before
BACKUP="/root/posobie-nginx-backup-$(date +%Y%m%d-%H%M%S).tgz"
if [ -d /etc/nginx ]; then tar -czf "$BACKUP" /etc/nginx 2>/dev/null && echo "Копия конфигурации nginx: $BACKUP"; fi

# ---------------------------------------------------------------- nginx
if ! command -v nginx >/dev/null; then
  log "Установка nginx (apt, без обновления других пакетов)"
  apt-get install -y --no-upgrade nginx
fi
reload_nginx() { if [ "$HAS_SYSTEMD" = 1 ] && systemctl is-active --quiet nginx; then systemctl reload nginx; else nginx -s reload 2>/dev/null || nginx; fi; }
rollback() {
  warn "Откат: убираю файлы сайта из конфигурации nginx"
  rm -f /etc/nginx/sites-enabled/posobie /etc/nginx/sites-available/posobie /etc/nginx/snippets/posobie-headers.conf
  nginx -t 2>&1 | tail -1 && reload_nginx || true
}

log "Файлы сайта"
install -d -m 755 /var/www/posobie /opt/posobie-tools
install -d -m 755 -o www-data -g www-data /var/www/posobie-status
find /var/www/posobie -mindepth 1 -delete
cp -a "$B/dist/." /var/www/posobie/
find /opt/posobie-tools -mindepth 1 -maxdepth 1 ! -name node -exec rm -rf {} +
cp -a "$B/tools/." /opt/posobie-tools/
chmod -R a+rX /var/www/posobie /opt/posobie-tools

log "Конфигурация nginx для сайта"
install -d /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled
install -m 644 "$B/deploy/posobie-headers.conf" /etc/nginx/snippets/posobie-headers.conf
L6=""; [ -e /proc/net/if_inet6 ] && L6="listen [::]:$LISTEN;"
sed -e "s/@LISTEN@/$LISTEN/" -e "s/@LISTEN6@/$L6/" -e "s/@SERVER_NAME@/$DOMAIN/" "$B/deploy/nginx-posobie.conf" > /etc/nginx/sites-available/posobie
ln -sf /etc/nginx/sites-available/posobie /etc/nginx/sites-enabled/posobie
if ! nginx -t 2>&1 | tee "$SNAP/nginx-test.txt" | tail -2 | grep -q successful; then cat "$SNAP/nginx-test.txt"; rollback; warn "Конфигурация не прошла проверку, ничего не изменено."; exit 1; fi
reload_nginx
sleep 1
if ! curl -s -o /dev/null -H "Host: ${DOMAIN/_/localhost}" "http://127.0.0.1:$LISTEN/"; then rollback; warn "Сайт не отвечает на порту $LISTEN, откат выполнен."; exit 1; fi

if [ "${CERTBOT:-0}" = 1 ] && [ "$DOMAIN" != "_" ] && [ -z "$DNS_OK" ]; then
  warn "HTTPS пропущен: $DNS_MSG. Сайт работает по http; после настройки DNS повторите команду с тем же -Domain и -CertbotEmail."
elif [ "${CERTBOT:-0}" = 1 ] && [ "$DOMAIN" != "_" ]; then
  log "HTTPS (Let's Encrypt)"
  command -v certbot >/dev/null || apt-get install -y --no-upgrade certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${EMAIL:?Укажите EMAIL для сертификата}" --redirect
  sed -i 's/^# add_header Strict-Transport-Security/add_header Strict-Transport-Security/' /etc/nginx/snippets/posobie-headers.conf
  if nginx -t >/dev/null 2>&1; then reload_nginx; else warn "После certbot конфигурация не прошла проверку — смотрите nginx -t"; fi
fi

# ---------------------------------------------------------------- Node и проверка ссылок
NODE_BIN="$(command -v node || true)"
if [ -n "$NEED_NODE" ]; then
  log "Node.js отдельным каталогом (без apt)"
  ARCH=""; case "$(uname -m)" in x86_64) ARCH=x64;; aarch64) ARCH=arm64;; esac
  V=v22.11.0
  if [ -n "$ARCH" ] && command -v curl >/dev/null; then
    for URL in "https://nodejs.org/dist/$V/node-$V-linux-$ARCH.tar.xz" "https://registry.npmmirror.com/-/binary/node/$V/node-$V-linux-$ARCH.tar.xz"; do
      rm -rf /opt/posobie-tools/node && install -d /opt/posobie-tools/node
      if curl -fsSL --max-time 180 "$URL" | tar -xJ -C /opt/posobie-tools/node --strip-components=1; then NODE_BIN=/opt/posobie-tools/node/bin/node; break; fi
    done
  fi
  [ -x "$NODE_BIN" ] || warn "Не удалось получить Node.js: сайт работает, но проверка ссылок не настроена."
fi
chmod -R a+rX /opt/posobie-tools

# Корневой и промежуточный сертификаты Минцифры — только для проверки ссылок (NODE_EXTRA_CA_CERTS);
# в системное хранилище сервера они НЕ добавляются. Отключить: RU_CA=0
CA_FILE=/opt/posobie-tools/certs/russian-ca.pem; CAENV=""
if [ "${RU_CA:-1}" = 1 ] && command -v curl >/dev/null && command -v openssl >/dev/null; then
  log "Сертификаты российского УЦ (только для проверки ссылок)"
  install -d /opt/posobie-tools/certs; CT="$(mktemp -d)"; OK=1
  for f in russian_trusted_root_ca_pem.crt russian_trusted_sub_ca_pem.crt; do
    curl -fsSL --max-time 30 "https://gu-st.ru/content/lending/$f" -o "$CT/$f" 2>/dev/null && openssl x509 -in "$CT/$f" -noout >/dev/null 2>&1 || { OK=0; break; }
    echo "  $f: $(openssl x509 -in "$CT/$f" -noout -subject -fingerprint -sha256 | tr '\n' ' ')"
  done
  if [ "$OK" = 1 ]; then cat "$CT"/russian_trusted_*_ca_pem.crt > "$CA_FILE"; chmod 644 "$CA_FILE"; CAENV="$CA_FILE"; echo "  Сверьте отпечатки со страницей https://www.gosuslugi.ru/crt"
  else warn "Не удалось скачать сертификаты УЦ: сайты на российском УЦ останутся предупреждениями в отчёте."; fi
  rm -rf "$CT"
fi

if [ "$HAS_SYSTEMD" = 1 ] && [ -x "${NODE_BIN:-/nonexistent}" ]; then
  log "Еженедельная проверка ссылок (понедельник, 06:00 по Москве; часовой пояс сервера не меняется)"
  sed -e "s#@NODE@#$NODE_BIN#g" -e "s#@CAENV@#${CAENV}#g" "$B/deploy/posobie-links.service" > /etc/systemd/system/posobie-links.service
  install -m 644 "$B/deploy/posobie-links.timer" /etc/systemd/system/posobie-links.timer
  systemctl daemon-reload
  systemctl enable --now posobie-links.timer
elif [ "$HAS_SYSTEMD" != 1 ]; then
  warn "systemd не найден: еженедельная проверка не настроена."
fi

log "Брандмауэр"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  if [ "$DOMAIN" != "_" ]; then ufw allow 80/tcp >/dev/null; [ "${CERTBOT:-0}" = 1 ] && ufw allow 443/tcp >/dev/null; echo "ufw: разрешены 80/443 (правила только добавлены)"
  else ufw allow "$LISTEN/tcp" comment 'posobie' >/dev/null; echo "ufw: разрешён порт $LISTEN/tcp (правило только добавлено)"; fi
else echo "ufw не включён — ничего не меняем"; [ "$DOMAIN" = "_" ] && echo "Если у провайдера есть внешний файрвол/группа безопасности, откройте там порт $LISTEN/tcp."; fi

# ---------------------------------------------------------------- самопроверка
log "Самопроверка сайта"
HDR="Host: ${DOMAIN/_/localhost}"
SCHEME=http; ROOT="http://127.0.0.1:$LISTEN"; RES=()
if [ "$DOMAIN" != "_" ] && [ -e "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then SCHEME=https; ROOT="https://$DOMAIN"; RES=(--resolve "$DOMAIN:443:127.0.0.1"); fi
code() { curl -s -o /dev/null -w '%{http_code}' -H "$HDR" "${RES[@]}" "$@"; }
echo "Главная страница:  HTTP $(code $ROOT/)"
echo "Несуществующая:    HTTP $(code $ROOT/nope)  (ожидается 404)"
echo "Заголовок CSP:     $(curl -sI -H "$HDR" "${RES[@]}" $ROOT/ | grep -ci '^content-security-policy') шт."

if [ -x "${NODE_BIN:-/nonexistent}" ]; then
  log "Первая проверка ссылок с этого сервера (низкий приоритет)"
  ( cd /opt/posobie-tools && PLAIN=1 nice -n 19 timeout 240 "$NODE_BIN" scripts/check-freshness.mjs && PLAIN=1 NODE_EXTRA_CA_CERTS="$CAENV" nice -n 19 timeout 240 "$NODE_BIN" scripts/check-links.mjs ) > /var/www/posobie-status/links.txt 2>&1 || true
  chown www-data:www-data /var/www/posobie-status/links.txt 2>/dev/null || true
  head -25 /var/www/posobie-status/links.txt
fi

# ---------------------------------------------------------------- сравнение состояния
log "Остальные службы сервера: до и после"
snapshot after
if diff -q "$SNAP/before.services" "$SNAP/after.services" >/dev/null; then echo "Запущенные службы:  без изменений"; else echo "Запущенные службы изменились:"; diff "$SNAP/before.services" "$SNAP/after.services" || true; fi
NEW_PORTS="$(diff "$SNAP/before.ports" "$SNAP/after.ports" | grep '^>' || true)"; LOST_PORTS="$(diff "$SNAP/before.ports" "$SNAP/after.ports" | grep '^<' || true)"
echo "Новые порты:        ${NEW_PORTS:-нет}"
[ -z "$LOST_PORTS" ] && echo "Закрытые порты:     нет" || { warn "Пропали порты:"; echo "$LOST_PORTS"; }
if diff -q "$SNAP/before.rustpids" "$SNAP/after.rustpids" >/dev/null; then echo "RustDesk/Rust:      те же ($(wc -l < "$SNAP/after.rustpids") шт., не перезапускались)"; else warn "Список процессов RustDesk/Rust изменился — проверьте, что сервер удалённого доступа работает"; fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ "$DOMAIN" != "_" ]; then BASE="$SCHEME://$DOMAIN"; else BASE="http://${IP:-IP_сервера}:$LISTEN"; fi
log "Готово"
echo "Сайт:   $BASE/"
echo "Отчёт:  $BASE/status/links.txt"
echo "Откат:  rm /etc/nginx/sites-enabled/posobie && nginx -t && systemctl reload nginx  (копия конфигурации: $BACKUP)"
[ "$DOMAIN" = "_" ] && echo "Без домена нет HTTPS: офлайн-режим и установка как приложения не заработают."
