# Studio Pro: Исправление ошибки 500 "Maximum call stack size exceeded"

**Дата:** 15 сентября 2026  
**Статус:** ✅ **ИСПРАВЛЕНО**

---

## 🔍 Проблема

Studio Pro запросы падали с ошибкой **500 Internal Server Error** на 5-м polling запросе:

```
GET /api/studio/status/0a0a7efc-8dc1-4fa3-abb7-777f3035d403
→ HTTP 500 Internal Server Error

{
  "ok": false,
  "error": "Maximum call stack size exceeded"
}
```

### Симптомы
- ✅ Первые 4 запроса успешны: `{ok: true, status: "processing"}`
- ❌ 5-й запрос падает с 500
- ❌ Frontend, polling, Cloudinary, модель работают корректно
- ❌ Проблема только в Worker при обработке готового результата

---

## 🐛 Причина

**Файл:** `worker/index.js`, строка 493  
**Функция:** `handleStudioStatus()`

```javascript
// ❌ НЕПРАВИЛЬНО - вызывает переполнение стека для больших изображений
const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
```

### Почему происходила ошибка?

1. **Spread operator (`...`)** разворачивает весь массив байтов в аргументы функции
2. Для изображения 2-3 МБ это создаёт **миллионы аргументов**
3. JavaScript движок V8 имеет ограничение на количество аргументов функции
4. Результат: **Maximum call stack size exceeded**

### Почему ошибка появлялась на 5-м запросе?

- Первые 4 запроса: задача в статусе `processing` → возвращается простой JSON
- 5-й запрос: задача завершена (`status: done`) → Worker скачивает результат и пытается конвертировать в base64
- Именно при конвертации большого изображения происходило переполнение стека

---

## ✅ Решение

**Файл:** `worker/index.js`, строки 492-499

```javascript
// ✅ ПРАВИЛЬНО - побайтовое преобразование
const arrayBuffer = await blob.arrayBuffer();
const bytes = new Uint8Array(arrayBuffer);
let binaryString = '';
for (let i = 0; i < bytes.length; i++) {
  binaryString += String.fromCharCode(bytes[i]);
}
const base64 = btoa(binaryString);
const dataUrl = 'data:image/webp;base64,' + base64;
```

### Преимущества нового подхода:
- ✅ Обрабатывает изображения любого размера
- ✅ Не создаёт переполнение стека вызовов
- ✅ Работает надёжно в Cloudflare Workers
- ✅ Поддерживает изображения до 10 МБ (лимит Workers)

---

## 🧪 Тестирование

### Тестовый файл
`test-studio-status-debug.js` - воспроизводит проблемный сценарий

### Результат ДО исправления:
```
← HTTP 500 Internal Server Error
{
  "ok": false,
  "error": "Maximum call stack size exceeded"
}
```

### Результат ПОСЛЕ исправления:
```
← HTTP 200 OK
{
  "ok": true,
  "status": "done",
  "result_url": "data:image/webp;base64,...",
  "format": "base64"
}
```

---

## 📊 Логи NordRouter

Запрос к NordRouter API успешен на всех попытках:

```
[Studio Status] 📊 Checking job: 0a0a7efc-8dc1-4fa3-abb7-777f3035d403
[Studio Status] 📊 Job: 0a0a7efc-8dc1-4fa3-abb7-777f3035d403 → Status: done
[Studio Status] 📥 Downloaded: 2485632 bytes
[Studio Status] ✅ Returning result for job: 0a0a7efc-8dc1-4fa3-abb7-777f3035d403
```

**Вывод:** NordRouter API работает корректно. Проблема была в Worker коде.

---

## 🚀 Деплой

```bash
cd c:\vigsharm-shop\worker
npx wrangler deploy
```

**Worker URL:** https://vigsharm-api.vigsharm.workers.dev

---

## 📝 Важные замечания

### Что НЕ нужно было менять:
- ❌ Frontend polling логика
- ❌ Cloudinary интеграция
- ❌ NordRouter API запросы
- ❌ Модель или промпты
- ❌ Архитектура системы

### Что было исправлено:
- ✅ Только 1 строка кода в `handleStudioStatus()`
- ✅ Заменён spread operator на побайтовый цикл
- ✅ Проблема полностью решена

---

## 🎯 Заключение

**Проблема:** "Maximum call stack size exceeded" при конвертации больших изображений в base64  
**Причина:** Использование spread operator с миллионами аргументов  
**Решение:** Побайтовое преобразование через цикл  
**Статус:** ✅ Исправлено и протестировано

Frontend теперь может успешно получать готовые результаты от Studio Pro через polling!
