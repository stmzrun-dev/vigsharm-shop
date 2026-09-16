# Инструкция: Проверка конфигурации модели image/nano-banana-edit

## Что сделано

1. ✅ Создан временный endpoint `/check-model` в Worker (read-only, БЕЗ генерации)
2. ✅ Создан HTML-файл для тестирования `test-check-model.html`
3. ✅ Код добавлен в `worker/index.js` (строки 45-47 и 661-714)

## Как выполнить проверку

### Шаг 1: Деплой Worker в Cloudflare

```bash
cd c:/vigsharm-shop/worker
npx wrangler deploy
```

**Ожидаемый результат:**
```
Total Upload: ... KiB / gzip: ... KiB
Uploaded vigsharm-api (... sec)
Published vigsharm-api (... sec)
  https://vigsharm-api.vigsharm.workers.dev
```

### Шаг 2: Открыть test-check-model.html

```bash
# Откройте в браузере:
c:/vigsharm-shop/test-check-model.html
```

### Шаг 3: Нажать кнопку "Проверить модель"

Страница отправит GET-запрос к:
```
https://vigsharm-api.vigsharm.workers.dev/check-model
```

Worker внутренне вызовет:
```
GET https://nordrouter.com/media/models
Authorization: Bearer [NORDROUTER_API_KEY из секретов]
```

**⚠️ ВАЖНО:** Этот запрос НЕ создает платную генерацию, только читает список моделей.

## Что покажет результат

### 1. Модель найдена: ✅ ДА / ❌ НЕТ
Существует ли модель `image/nano-banana-edit` в API

### 2. Поддержка multiple images:
- **image2** — второе входное изображение
- **reference_image** — референсное изображение (эталонный фон)
- **attachments** — массив дополнительных изображений
- **background_image** — фоновое изображение

### 3. Полная конфигурация модели
JSON с полной схемой input параметров модели

## Что делать после проверки

### Если `reference_image: ✅`
Можно передавать эталонный фон как отдельный параметр:
```javascript
input: {
  prompt: simplePrompt,
  image: image_url,           // Оригинал товара
  reference_image: bg_url     // Эталонный фон
}
```

### Если `reference_image: ❌`
Только текстовое описание фона в промпте (текущий подход).

## Удаление временного кода (после проверки)

После получения результатов нужно удалить:
1. Строки 45-47 в `worker/index.js` (route `/check-model`)
2. Строки 661-714 в `worker/index.js` (функция `handleCheckModel`)
3. Файл `test-check-model.html`
4. Файл `worker/check-model.js` (не используется)
5. Повторный деплой Worker

---

## Текущий статус

- ✅ Код добавлен в Worker
- ⏳ Ожидает деплоя в Cloudflare
- ⏳ Ожидает выполнения проверки

## Команда для деплоя

```bash
cd c:/vigsharm-shop/worker && npx wrangler deploy
```
