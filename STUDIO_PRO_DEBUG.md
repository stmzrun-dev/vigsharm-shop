# Проблема: Фото не меняется после обработки через Studio Pro

## Диагностика проблемы

Судя по скриншотам техподдержки NordRouter, правильный формат ответа от API `/media/job/:id`:

```json
{
  "id": "...",
  "model": "image/nano-banana-edit",
  "status": "done",
  "result_url": "https://nordrouter.com/media/file/...",
  "results": [
    {
      "index": 1,
      "name": "Результат 1",
      "url": "https://nordrouter.com/media/file/..."
    }
  ],
  "cost_usd": 0.025
}
```

**Ключевой момент:** результат приходит в поле `result_url`, а не в `output.url`.

## Текущий код

### Worker (`worker/index.js`)

Код **уже правильный** и использует `result_url`:

```javascript
// Строка 415
if (result.status === 'done' && result.result_url) {
  const imgResp = await fetch(result.result_url, {
    headers: { 'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY }
  });
  const blob = await imgResp.blob();
  
  // Конвертируем в base64
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const dataUrl = 'data:image/webp;base64,' + base64;
  
  return json({ ok: true, status: 'done', result_url: dataUrl, format: 'base64' });
}
```

### Админка (`admin/admin-studio-pro.js`)

Код также правильный:

```javascript
// Строка 86
if (data.status === 'done' && data.result_url) {
  return data.result_url; // Возвращаем Master Image
}
```

## Возможные причины

### 1. Модель возвращает точно такое же изображение

**Самая вероятная причина!** Модель `image/nano-banana-edit` может:
- Не понять промпт
- Решить что фон уже достаточно хороший
- Вернуть оригинальное изображение без изменений

### 2. Кэширование браузера

Браузер может показывать старую версию из-за кэша.

### 3. Ошибка при скачивании результата

`result_url` может быть недоступен или возвращать ошибку.

## Что добавлено для диагностики

### 1. Логирование в Worker

Добавлены логи в `worker/index.js`:

```javascript
console.log('📊 Studio Status:', jobId, '→', result.status);
console.log('📥 Скачано:', blob.size, 'байт');
```

### 2. Логирование в админке

Добавлен лог в `admin/admin-studio-pro.js`:

```javascript
console.log('✅ Получен result_url:', {
  length: data.result_url.length,
  preview: data.result_url.substring(0, 100),
  format: data.format
});
```

### 3. Тестовый скрипт

Создан `test-image-edit.js` для прямого теста API:

```bash
node test-image-edit.js
```

## Инструкция по проверке

### Шаг 1: Деплой изменений

```bash
cd c:\vigsharm-shop\worker
npx wrangler deploy
```

Дождитесь сообщения:
```
✨ Success! Uploaded vigsharm-api (X.XX sec)
  https://vigsharm-api.vigsharm.workers.dev
```

### Шаг 2: Тест через админку

1. Откройте `http://localhost:8000/admin/`
2. Загрузите тестовое фото (шары)
3. Нажмите "Обработать фото через Studio Pro"
4. Откройте DevTools → Console (F12)
5. Следите за логами:
   - `📊 Studio Status` - в логах Worker (Cloudflare Dashboard)
   - `✅ Получен result_url` - в консоли браузера

### Шаг 3: Проверка результата

**В консоли браузера:**
```javascript
// Скопируйте result_url из лога
const resultUrl = "data:image/webp;base64,...";

// Откройте в новой вкладке
window.open(resultUrl);
```

Сравните визуально с оригиналом.

### Шаг 4: Прямой тест API

```bash
cd c:\vigsharm-shop
node test-image-edit.js
```

Это отправит запрос напрямую к NordRouter и покажет:
- Создается ли задача
- Сколько времени обработка
- Размер результата
- Стоимость

## Ожидаемое поведение

### Если модель работает:
- Фон изображения должен измениться
- Размер файла может немного отличаться
- В консоли будут логи скачивания

### Если модель не меняет фото:
- `result_url` будет, но изображение визуально то же
- Размер файла примерно одинаковый
- **Значит проблема в промпте или модели, а не в коде**

## Следующие шаги

### Если фото действительно не меняется:

1. **Попробовать другую модель:**
   - `image/nano-banana-pro` (0.0125$) - лучше качество
   - `image/seedream-5.0-pro` (0.0083$) - альтернатива

2. **Изменить промпт:**
   Текущий промпт очень сложный (300+ строк правил).
   Попробовать простой:
   ```
   Replace background with white wall and wooden floor. Keep all objects unchanged.
   ```

3. **Использовать референс-изображение:**
   Модель поддерживает до 10 референсов для стиля фона.

### Если фото меняется, но не отображается:

1. Проверить кэш браузера (Ctrl+Shift+R)
2. Проверить размер base64 (не слишком большой?)
3. Проверить формат (должен быть `data:image/webp;base64,`)

## Контакты техподдержки NordRouter

Если модель действительно не обрабатывает:

1. Скопировать `job_id` из логов
2. Написать в поддержку NordRouter
3. Спросить почему `result_url` возвращает тот же файл

---

## Резюме

✅ **Код правильный** - использует `result_url`  
❓ **Неясно** - меняет ли модель изображение визуально  
🔍 **Нужно проверить** - логи и прямой тест API  

**Следующий шаг:** Деплой worker и тест через админку с открытой консолью.
