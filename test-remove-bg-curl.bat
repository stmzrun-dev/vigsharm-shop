@echo off
echo ==========================================
echo ТЕСТ REMOVE-BG через curl
echo ==========================================
echo.

echo Шаг 1: Отправка запроса к /media/generate...
curl -X POST https://vigsharm-api.vigsharm.workers.dev/media/generate ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"image/recraft-remove-bg\",\"input\":{\"image\":\"https://res.cloudinary.com/demo/image/upload/sample.jpg\"}}" ^
  -o test-results\generate-response.json
echo.
echo Результат сохранён в test-results\generate-response.json
echo.
type test-results\generate-response.json
echo.
echo ==========================================
