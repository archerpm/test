#!/usr/bin/env bash
# Сборка и выкладка сайта на VPS.  Запуск из корня репозитория:
#   ./deploy/deploy.sh deploy@IP_или_домен [порт_ssh]
# Нужны: node/npm, rsync, ssh-доступ пользователя deploy (см. deploy/README.md).
set -euo pipefail
TARGET="${1:?Укажите адрес: ./deploy/deploy.sh deploy@host [порт]}"
PORT="${2:-22}"
SSH="ssh -p $PORT"
cd "$(dirname "$0")/../app"

echo "== Сборка и тесты"
npm ci
npm run typecheck
npm test
npm run build

echo "== Выкладка сайта"
rsync -az --delete -e "$SSH" dist/ "$TARGET:/var/www/posobie/"

echo "== Выкладка скриптов проверки ссылок"
rsync -az --delete -e "$SSH" --relative scripts src/data package.json "$TARGET:/opt/posobie-tools/"

HOST="${TARGET#*@}"
echo "== Проверка"
curl -fsS -o /dev/null -w "Главная: HTTP %{http_code}\n" "http://$HOST/" || echo "Не удалось открыть http://$HOST/ — проверьте nginx"
