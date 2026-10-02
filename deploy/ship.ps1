# Сборка и выкладка на VPS одной командой (Windows PowerShell). Из корня репозитория:
#   .\deploy\ship.ps1 -Target root@IP [-Identity путь_к_ключу] [-Port 22] [-Domain example.ru] [-WebPort 8088] [-Preflight] [-CertbotEmail me@mail.ru] [-BundleOnly] [-SkipTests]
# Пароль или ключ спрашивает ssh в вашем окне. Скрипт ничего не сохраняет и не отправляет никуда, кроме вашего сервера.
# Нужны: Node.js 18+, встроенные OpenSSH (ssh, scp) и tar (есть в Windows 10/11).
param(
  [string]$Target,
  [int]$Port = 22,
  [string]$Identity = "",
  [string]$Domain = "_",
  [int]$WebPort = 0,
  [switch]$Preflight,
  [string]$CertbotEmail = "",
  [switch]$BundleOnly,
  [switch]$SkipTests
)
$ErrorActionPreference = "Stop"
if (-not $Target -and -not $BundleOnly) { throw "Укажите адрес: .\deploy\ship.ps1 -Target root@IP" }
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location (Join-Path $root "app")

Write-Host "== Сборка"
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
npm ci; if ($LASTEXITCODE) { throw "npm ci не прошёл" }
npm run typecheck; if ($LASTEXITCODE) { throw "проверка типов не прошла" }
if (-not $SkipTests) { npm test; if ($LASTEXITCODE) { throw "тесты не прошли" } }
npm run build; if ($LASTEXITCODE) { throw "сборка не прошла" }

$tmp = Join-Path $env:TEMP ("posobie-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$b = Join-Path $tmp "bundle"
New-Item -ItemType Directory -Force -Path (Join-Path $b "tools\src") | Out-Null
Copy-Item -Recurse dist (Join-Path $b "dist")
Copy-Item -Recurse scripts (Join-Path $b "tools\scripts")
Copy-Item -Recurse src\data (Join-Path $b "tools\src\data")
Copy-Item package.json (Join-Path $b "tools")
Copy-Item -Recurse (Join-Path $root "deploy") (Join-Path $b "deploy")
$tgz = Join-Path $tmp "posobie-bundle.tgz"
tar -czf $tgz -C $b .
if ($LASTEXITCODE) { throw "не удалось создать пакет" }
Write-Host ("Пакет: " + $tgz + " (" + [math]::Round((Get-Item $tgz).Length / 1MB, 2) + " МБ)")
if ($BundleOnly) { return }

$keyArgs = @()
if ($Identity) { $keyArgs = @("-i", $Identity, "-o", "IdentitiesOnly=yes") }
Write-Host "== Отправка на $Target (потребуется пароль или ключ)"
scp @keyArgs -P $Port $tgz "${Target}:/tmp/posobie-bundle.tgz"
if ($LASTEXITCODE) { throw "scp не удался" }
$certbot = if ($CertbotEmail) { "1" } else { "0" }
$dry = if ($Preflight) { "1" } else { "0" }
$wp = if ($WebPort -gt 0) { [string]$WebPort } else { "" }
$remote = "rm -rf /tmp/posobie-bundle && mkdir /tmp/posobie-bundle && tar -xzf /tmp/posobie-bundle.tgz -C /tmp/posobie-bundle && DRY_RUN=$dry WEBPORT='$wp' DOMAIN='$Domain' CERTBOT=$certbot EMAIL='$CertbotEmail' bash /tmp/posobie-bundle/deploy/install-bundle.sh; rm -rf /tmp/posobie-bundle /tmp/posobie-bundle.tgz"
ssh @keyArgs -p $Port $Target $remote
if ($LASTEXITCODE) { throw "установка на сервере завершилась с ошибкой" }
