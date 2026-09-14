# 🚀 DEPLOY ИНСТРУКЦИЯ

## Что исправлено

✅ Worker теперь принимает Cloudinary HTTPS URLs  
✅ Добавлено подробное логирование  
✅ NordRouter получает публичный URL напрямую

## Деплой

```bash
cd c:/vigsharm-shop/worker
wrangler deploy
```

Ожидаемый вывод:
```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded vigsharm-api (X.XX sec)
Published vigsharm-api (X.XX sec)
  https://vigsharm-api.vigsharm.workers.dev
Current Deployment ID: xxxxxxxxx
```

## Проверка

### 1. Тест через браузер

```
1. Открыть: http://localhost:8000/admin/
2. Создать товар
3. Загрузить фото
4. "Обработать фото через Studio Pro"
5. Открыть Console (F12)
```

**Ожидаемые логи:**
```
✅ CLOUDINARY UPLOAD SUCCESS
secure_url: https://res.cloudinary.com/xxx/...
📸 Отправка в Studio Pro: https://res.cloudinary.com/...
✅ Job created: job_abc123
⏳ Polling status...
✅ Готово! Master: data:image/webp;base64,...
```

### 2. Проверка Worker логов

```bash
wrangler tail
```

**Ожидаемые логи:**
```
[Studio Pro] Input image type: cloudinary-url
[Studio Pro] Input image URL: https://res.cloudinary.com/...
[Studio Pro] Sending to Vision API (Step 1/2)
[Studio Pro] Model: claude-sonnet-5
[Studio Pro] Sending ONE AI request to image generation (Step 2/2)
[Studio Pro] Model: image/nano-banana-edit
[Studio Pro] ✅ AI request completed successfully
[Studio Pro] Job ID: job_abc123
```

## Если ошибка

### HTTP 400 "Invalid image format"
- ❌ Worker не задеплоен
- **Решение:** `wrangler deploy`

### HTTP 400 "Upload preset must be whitelisted"
- ❌ Cloudinary Upload Preset не настроен
- **Решение:** См. `ЧТО_ДЕЛАТЬ_ДАЛЬШЕ.md`

### HTTP 401 "Unauthorized"
- ❌ NordRouter API key не настроен
- **Решение:** `wrangler secret put NORDROUTER_API_KEY`

### Фото не появляется
- Открыть Console (F12)
- Проверить логи
- Проверить `wrangler tail`

## Документация

- 📄 `ИСПРАВЛЕНИЕ_WORKER_ГОТОВО.md` — что сделано (краткое)
- 📄 `CLOUDINARY_WORKER_FIX.md` — полная архитектура
- 📄 `ЧТО_ДЕЛАТЬ_ДАЛЬШЕ.md` — настройка Cloudinary

---

**Готово к деплою!** 🚀
