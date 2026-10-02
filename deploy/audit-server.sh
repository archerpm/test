#!/usr/bin/env bash
# Только чтение: показывает, что на сервере защищено, а что стоит усилить. Ничего не меняет.
# Запуск на сервере: sudo bash audit-server.sh [домен]
D="${1:-}"
ok(){ printf '  [ok]  %s\n' "$*"; }; bad(){ printf '  [!!]  %s\n' "$*"; }
echo "== SSH"
SSHD="$(sshd -T 2>/dev/null || true)"
echo "$SSHD" | grep -qi '^passwordauthentication no' && ok "вход по паролю выключен" || bad "вход по паролю включён: настройте ключи и PasswordAuthentication no"
echo "$SSHD" | grep -qiE '^permitrootlogin (no|prohibit-password|without-password)' && ok "root по паролю не войти" || bad "разрешён вход под root по паролю: PermitRootLogin prohibit-password"
echo "== Брандмауэр"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ok "ufw включён"; else bad "ufw не включён (сначала ufw allow OpenSSH, 80, 443 и порты RustDesk, затем ufw enable)"; fi
echo "== Защита от подбора паролей и обновления"
systemctl is-active --quiet fail2ban 2>/dev/null && ok "fail2ban работает" || bad "fail2ban не запущен (apt install fail2ban)"
dpkg -s unattended-upgrades >/dev/null 2>&1 && ok "автообновления безопасности установлены" || bad "нет unattended-upgrades"
[ -f /var/run/reboot-required ] && bad "нужна перезагрузка после обновлений" || ok "перезагрузка не требуется"
echo "== Открытые порты (проверьте, что каждый нужен)"
ss -lntuH 2>/dev/null | awk '{print "  "$1, $5}' | sort -u
echo "== nginx и сертификат"
command -v nginx >/dev/null && nginx -v 2>&1 | sed 's/^/  /'
if [ -n "$D" ]; then
  H="$(curl -sI "https://$D/" --max-time 10 || true)"
  for h in content-security-policy strict-transport-security x-content-type-options x-frame-options; do echo "$H" | grep -qi "^$h" && ok "заголовок $h" || bad "нет заголовка $h"; done
  echo "$H" | grep -qi '^server: nginx/[0-9]' && bad "nginx показывает версию (server_tokens off в http{} /etc/nginx/nginx.conf)" || ok "версия nginx не раскрывается"
  E="$(echo | openssl s_client -servername "$D" -connect "$D:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null)"; echo "  сертификат: ${E:-не прочитан}"
fi
command -v certbot >/dev/null && { certbot renew --dry-run >/dev/null 2>&1 && ok "продление сертификата работает (dry-run)" || bad "certbot renew --dry-run не прошёл"; }
