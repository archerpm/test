#!/usr/bin/env bash
# Сборка и выкладка на VPS одной командой (Linux/macOS/Git Bash). Из корня репозитория:
#   ./deploy/ship.sh root@IP [-p порт] [-d домен] [--certbot почта] [--bundle-only] [--skip-tests]
# Пароль/ключ спрашивает ssh в вашем терминале. Скрипт ничего не сохраняет и никуда не отправляет, кроме вашего сервера.
set -euo pipefail
TARGET=""; PORT=22; DOMAIN="_"; EMAIL=""; BUNDLE_ONLY=0; SKIP_TESTS=0
while [ $# -gt 0 ]; do
  case "$1" in
    -p) PORT="$2"; shift 2;;
    -d) DOMAIN="$2"; shift 2;;
    --certbot) EMAIL="$2"; shift 2;;
    --bundle-only) BUNDLE_ONLY=1; shift;;
    --skip-tests) SKIP_TESTS=1; shift;;
    *) TARGET="$1"; shift;;
  esac
done
[ -n "$TARGET" ] || [ "$BUNDLE_ONLY" = 1 ] || { echo "Укажите адрес: ./deploy/ship.sh root@IP"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/app"

echo "== Сборка"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
npm run typecheck
[ "$SKIP_TESTS" = 1 ] || npm test
npm run build

TMP="$(mktemp -d)"; B="$TMP/bundle"
mkdir -p "$B/tools/src"
cp -r dist "$B/dist"
cp -r scripts "$B/tools/scripts"; cp -r src/data "$B/tools/src/data"; cp package.json "$B/tools/"
cp -r "$ROOT/deploy" "$B/deploy"
tar -czf "$TMP/posobie-bundle.tgz" -C "$B" .
echo "Пакет: $TMP/posobie-bundle.tgz ($(du -h "$TMP/posobie-bundle.tgz" | cut -f1))"
[ "$BUNDLE_ONLY" = 1 ] && exit 0

echo "== Отправка на $TARGET (потребуется пароль или ключ)"
scp -P "$PORT" "$TMP/posobie-bundle.tgz" "$TARGET:/tmp/posobie-bundle.tgz"
ssh -p "$PORT" "$TARGET" "rm -rf /tmp/posobie-bundle && mkdir /tmp/posobie-bundle && tar -xzf /tmp/posobie-bundle.tgz -C /tmp/posobie-bundle && DOMAIN='$DOMAIN' CERTBOT=$([ -n "$EMAIL" ] && echo 1 || echo 0) EMAIL='$EMAIL' bash /tmp/posobie-bundle/deploy/install-bundle.sh; rm -rf /tmp/posobie-bundle /tmp/posobie-bundle.tgz"
