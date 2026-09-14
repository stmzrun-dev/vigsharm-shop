# 🔒 Security Migration — NordRouter API Key

**Дата:** 14 сентября 2026  
**Статус:** ✅ Завершено

---

## Проблема

До миграции NordRouter API ключ хранился в `localStorage` браузера и был доступен через DevTools:

```javascript
// ❌ НЕБЕЗОПАСНО (старая версия)
localStorage.getItem('vigsharm_admin_settings')
// → {"workerUrl":"...", "nordrouterKey":"sk-nr-..."}

// Любой пользователь мог украсть ключ:
app.nordrouterKey // → "sk-nr-xxxxx"
```

**Риски:**
- Ключ виден в DevTools → Application → LocalStorage
- Любой с доступом к админке мог скопировать ключ
- Нарушение требований NordRouter TOS (ключ должен быть на сервере)

---

## Решение

Переместили API ключ в **Cloudflare Worker Secrets**:

```
Админка (браузер)
    ↓ [БЕЗ API ключа]
    ↓ fetch(workerUrl + '/api/studio/process')
Worker (Cloudflare)
    ↓ [env.NORDROUTER_API_KEY из секретов]
    ↓ fetch('https://nordrouter.com/media/generate')
NordRouter API
```

---

## Изменения

### ✂️ Удалено из `index.html`:

1. Поле ввода NordRouter API Key (строки 325-329)
2. Подключение небезопасных скриптов:
   - `admin-nordrouter-direct.js` ❌
   - `admin-nordrouter-ai.js` ❌

### 🔄 Изменено в `index.html`:

| Было | Стало |
|------|-------|
| `onclick="app.processStudioProDirect()"` | `onclick="app.processStudioProNew()"` |
| `onclick="app.generateAIMetadataDirect()"` | `onclick="app.generateAIMetadata()"` |

### 🧹 Очищено в `admin.js`:

1. Удалена переменная `nordrouterKey`
2. Из `loadSettings()` убрано чтение `nordrouterKey` из localStorage
3. Из `saveSettings()` убрано сохранение `nordrouterKey`
4. Добавлена **автомиграция** — при загрузке старый ключ автоматически удаляется

### 🗑️ Удалены файлы:

- `admin-nordrouter-direct.js` — прямые запросы к NordRouter
- `admin-nordrouter-ai.js` — прямые запросы к NordRouter

---

## ✅ Безопасная архитектура

### Используемые файлы:

| Файл | Функция | Безопасность |
|------|---------|--------------|
| `admin-studio-pro.js` | `processStudioProNew()` | ✅ Через Worker |
| `admin-ai.js` | `generateAIMetadata()` | ✅ Через Worker |
| `worker/index.js` | Проксирует запросы | ✅ Ключ в `env.NORDROUTER_API_KEY` |

### Эндпоинты Worker:

```javascript
// Studio Pro
POST /api/studio/process
GET  /api/studio/status/:jobId

// AI генерация
POST /api/ai/generate-card
POST /api/ai/suggest-category
```

---

## 🧪 Проверка миграции

### 1. Проверить localStorage:
```javascript
localStorage.getItem('vigsharm_admin_settings')
// Должно вернуть: {"workerUrl":"https://vigsharm-api.vigsharm.workers.dev"}
// НЕ должно быть поля "nordrouterKey" ✅
```

### 2. Проверить объект app:
```javascript
app.nordrouterKey
// Должно вернуть: undefined ✅
```

### 3. Проверить UI:
- Открыть админку → Настройки
- НЕ должно быть поля "NordRouter API Key" ✅

### 4. Функциональная проверка:
1. Создать новую карточку
2. Загрузить фото
3. Нажать **"Обработать фото через Studio Pro"**
4. Открыть DevTools → Network
5. Проверить запрос идёт на: `vigsharm-api.vigsharm.workers.dev/api/studio/process`
6. Убедиться что фото обработалось ✅

---

## 📝 Автоматическая миграция

При первой загрузке админки после обновления:

```javascript
// admin.js:100-106
if (settings.nordrouterKey) {
  delete settings.nordrouterKey;
  localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
  console.warn('⚠️ NordRouter API ключ удалён из localStorage');
}
```

Пользователи увидят предупреждение в консоли:
```
⚠️ NordRouter API ключ удалён из localStorage (теперь хранится в Worker secrets)
```

---

## 🔐 Проверка Worker секрета

Убедитесь что ключ установлен в Worker:

```bash
cd c:\vigsharm-shop\worker
npx wrangler secret list
```

Должно вернуть:
```json
[
  {
    "name": "NORDROUTER_API_KEY",
    "type": "secret_text"
  }
]
```

✅ **Секрет уже установлен и работает**

---

## 🎯 Итог

✅ API ключ больше не хранится в браузере  
✅ Все запросы идут через безопасный Worker proxy  
✅ Соответствует требованиям NordRouter TOS  
✅ Автоматическая миграция для существующих пользователей  
✅ Функционал Studio Pro и AI полностью сохранён  

**Безопасность восстановлена! 🔒**
