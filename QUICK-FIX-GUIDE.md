# 🔧 Быстрая инструкция: Исправление Job ID Mismatch

## Что сделано

✅ **Worker** (`worker/index.js`):
- Добавлено детальное логирование в `handleStudioProcess` и `handleStudioStatus`
- Добавлен try-catch для обработки ошибок в `handleStudioStatus`
- Улучшено логирование job_id на каждом этапе

✅ **Frontend** (`admin/admin-studio-pro.js`):
- Добавлено детальное логирование передачи job_id
- Добавлено логирование каждого polling запроса с указанием job_id
- Добавлена проверка HTTP статуса перед парсингом JSON

✅ **CORS**: Уже работает через функцию `corsHeaders()` для всех endpoints

✅ **Тестовый файл**: `test-job-id-flow.html` — для проверки flow

## Что нужно сделать

### 1. Задеплоить Worker

```cmd
cd c:\vigsharm-shop\worker
npx wrangler deploy
```

ИЛИ двойной клик на `deploy-worker.bat`

### 2. Открыть админку и проверить

Открыть `c:\vigsharm-shop\admin\admin.html` в браузере (file://)

### 3. Загрузить фото и запустить Studio Pro

Нажать **"✨ Обработать фото через Studio Pro"**

### 4. Проверить консоль браузера

Должно быть:
```
[Frontend] ✅ Job created successfully: <SAME_ID>
[Frontend] 📤 Sending job_id to polling: <SAME_ID>
[Frontend] 🔄 Starting polling for job: <SAME_ID>
[Frontend] 🔄 Polling attempt 1/60 for job: <SAME_ID>
```

### 5. Проверить Cloudflare Worker Logs

https://dash.cloudflare.com → Workers → vigsharm-api → Logs

Должно быть:
```
[Studio Pro] ✅ Job created: <SAME_ID>
[Studio Pro] ✅ Returning job_id to frontend: <SAME_ID>
[Studio Status] 📊 Checking job: <SAME_ID>
```

## Если job ID всё ещё отличается

### Вариант 1: Кеш браузера
```
Ctrl + Shift + R (hard refresh)
```

### Вариант 2: Проверить Network tab
1. Открыть DevTools → Network
2. Найти запрос `POST /api/studio/process`
3. Проверить Response: `{"ok":true,"job_id":"..."}`
4. Скопировать job_id
5. Найти запросы `GET /api/studio/status/...`
6. Сравнить ID в URL с job_id из шага 3

### Вариант 3: Использовать тестовый файл
```
Открыть: c:\vigsharm-shop\test-job-id-flow.html
Нажать: ▶️ Запустить тест
```

Тест покажет точный flow и где происходит подмена ID.

## Ожидаемый результат

✅ POST `/api/studio/process` → job_id: `f175202b-...`  
✅ GET `/api/studio/status/f175202b-...` → 200 OK  
✅ Status: processing → done  
✅ Result URL получен  
✅ Master Image отображается  
✅ Crop #2 и #3 созданы локально

## Если 500 ошибка

Проверить Cloudflare Worker Logs:
```
[Studio Status] ❌ Error checking job: <ID> <ERROR>
```

Ошибка покажет точную причину (NordRouter API error, network error, etc.)

## CORS уже работает

`origin: null` (file://) поддерживается через:
```javascript
'Access-Control-Allow-Origin': '*'
```

Не нужно ничего менять.
