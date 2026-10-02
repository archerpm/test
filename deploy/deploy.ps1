# Сборка и выкладка сайта на VPS из Windows (PowerShell). Нужны: Node.js, встроенный OpenSSH (ssh, scp).
#   .\deploy\deploy.ps1 -Target deploy@IP_или_домен [-Port 22]
param(
  [Parameter(Mandatory = $true)][string]$Target,
  [int]$Port = 22
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\app")

Write-Host "== Сборка и тесты"
npm ci; if ($LASTEXITCODE) { throw "npm ci" }
npm run typecheck; if ($LASTEXITCODE) { throw "typecheck" }
npm test; if ($LASTEXITCODE) { throw "тесты" }
npm run build; if ($LASTEXITCODE) { throw "сборка" }

$ssh = @("-p", $Port)
$scp = @("-P", $Port)

Write-Host "== Выкладка сайта (в новый каталог, затем подмена)"
ssh @ssh $Target "rm -rf /var/www/posobie.new && mkdir -p /var/www/posobie.new"
scp @scp -r dist/* "${Target}:/var/www/posobie.new/"
ssh @ssh $Target "rm -rf /var/www/posobie.old; mv /var/www/posobie /var/www/posobie.old; mv /var/www/posobie.new /var/www/posobie; rm -rf /var/www/posobie.old"

Write-Host "== Скрипты проверки ссылок"
ssh @ssh $Target "mkdir -p /opt/posobie-tools/src && rm -rf /opt/posobie-tools/scripts /opt/posobie-tools/src/data"
scp @scp -r scripts "${Target}:/opt/posobie-tools/"
scp @scp -r src/data "${Target}:/opt/posobie-tools/src/"
scp @scp package.json "${Target}:/opt/posobie-tools/"

$hostName = $Target.Split("@")[-1]
Write-Host "Готово: http://$hostName/"
