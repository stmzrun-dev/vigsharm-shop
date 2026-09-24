# Включить R2 и задеплоить хранилище фото VigSharm
# Запускать из корня репо в PowerShell, ПОСЛЕ Accept R2 в Dashboard.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Write-Host "1) Создаём бакет vigsharm-photos..."
npx wrangler r2 bucket create vigsharm-photos

$toml = Get-Content worker\wrangler.toml -Raw
if ($toml -notmatch '(?m)^\[\[r2_buckets\]\]') {
  Write-Host "2) Включаем binding PHOTOS в wrangler.toml..."
  $block = @"

[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "vigsharm-photos"
"@
  # Вставляем после блока D1
  $toml = $toml -replace '(database_id = "[^"]+")', "`$1$block"
  Set-Content -Path worker\wrangler.toml -Value $toml -NoNewline
} else {
  Write-Host "2) Binding PHOTOS уже есть."
}

Write-Host "3) Деплой Worker..."
Set-Location worker
npx wrangler deploy
Write-Host "Готово. Проверка: загрузите фото в админке — в консоли должно быть Worker/R2 upload."
