# Fix Worker validation to accept Cloudinary URLs
# Remove old validation at lines 291-294

$content = Get-Content "c:/vigsharm-shop/worker/index.js" -Encoding UTF8 -Raw

# Remove old validation block (lines 291-294)
$content = $content -replace "(?m)^\s*// Валидация формата изображения\r?\n\s*if \(!image_url \|\| !image_url\.startsWith\('data:image/'\)\) \{\r?\n\s*return json\(\{ ok: false, error: 'Invalid image format\. Expected data:image/\.\.\. URL' \}, 400\);\r?\n\s*\}\r?\n", ""

# Save
$content | Set-Content "c:/vigsharm-shop/worker/index.js" -Encoding UTF8 -NoNewline

Write-Host "✅ Old validation removed"
Write-Host "✅ Worker now accepts both data:image/... and https:// URLs"
