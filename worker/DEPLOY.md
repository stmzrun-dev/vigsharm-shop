# 🚀 Инструкция по деплою Cloudflare Worker

## ✅ Что уже сделано
- ✅ Worker код готов (`index.js`)
- ✅ Конфигурация готова (`wrangler.toml`)
- ✅ `package.json` исправлен (добавлен `"type": "module"`)
- ✅ Старая админка удалена (`admin.html`, `assets/admin.js`)
- ✅ Новая админка готова и настроена на использование Worker API

---

## 📋 Шаги для деплоя (выполните вручную)

Откройте **PowerShell** или **CMD** в отдельном окне и выполните:

### 1. Перейдите в директорию Worker
```bash
cd c:\vigsharm-shop\worker
```

### 2. Проверьте авторизацию в Cloudflare
```bash
wrangler whoami
```

**Если вы НЕ авторизованы**, выполните:
```bash
wrangler login
```
Откроется браузер для авторизации через Cloudflare аккаунт.

---

### 3. Задеплойте Worker
```bash
wrangler deploy
```

**Ожидаемый результат:**
```
✨ Success! Uploaded vigsharm-api (X.XX sec)
📡 Published vigsharm-api (X.XX sec)
   https://vigsharm-api.<ваш-аккаунт>.workers.dev
```

**⚠️ ВАЖНО:** Скопируйте URL вашего Worker'а!  
Он будет вида: `https://vigsharm-api.<ваш-аккаунт>.workers.dev`

---

### 4. Установите секрет NordRouter API Key
```bash
wrangler secret put NORDROUTER_API_KEY
```

Вставьте ваш ключ NordRouter (начинается с `sk-nr-...`) и нажмите Enter.

**Ожидаемый результат:**
```
🌀 Creating the secret for the Worker "vigsharm-api"
✨ Success! Uploaded secret NORDROUTER_API_KEY
```

---

## 🎯 Настройка новой админ-панели

После успешного деплоя:

1. Откройте новую админку: **`c:\vigsharm-shop\admin\index.html`** в браузере
2. Перейдите на вкладку **"Настройки"** (Settings)
3. В поле **"Worker API URL"** вставьте URL вашего Worker'а:
   ```
   https://vigsharm-api.<ваш-аккаунт>.workers.dev
   ```
4. Нажмите **"Сохранить настройки"**

---

## ✅ Проверка работоспособности

После настройки проверьте:

### 1. Кнопка "Сгенерировать через ИИ"
- Загрузите фото товара
- Нажмите "Сгенерировать через ИИ"
- Должны заполниться поля: название, описание, категория, теги

### 2. Кнопка "Studio Pro"
- Загрузите фото товара
- Выберите сцену (например, "Напольная сцена")
- Нажмите "Обработать через Studio Pro"
- Должны создаться 3 фото (Master + 2 кропа)

---

## 🔧 Устранение проблем

### Ошибка: "Worker not found"
- Проверьте, что Worker задеплоен: `wrangler deployments list`
- Проверьте URL в настройках админки

### Ошибка: "Unauthorized" или "API Key missing"
- Проверьте, что секрет установлен: `wrangler secret list`
- Если нет — выполните снова: `wrangler secret put NORDROUTER_API_KEY`

### Ошибка при деплое: "Module format error"
- Убедитесь, что в `package.json` есть `"type": "module"` (уже исправлено)

---

## 📚 Полезные команды

```bash
# Посмотреть список Worker'ов
wrangler deployments list

# Посмотреть логи Worker'а в реальном времени
wrangler tail

# Посмотреть список секретов
wrangler secret list

# Удалить секрет (если нужно)
wrangler secret delete NORDROUTER_API_KEY

# Локальная разработка (запуск Worker локально)
wrangler dev
```

---

## 📝 Что изменилось

### До:
- ❌ Две админки: старая (`admin.html`) и новая (`admin/index.html`)
- ❌ Worker не задеплоен
- ❌ Кнопки "ИИ" и "Studio Pro" не работали

### После:
- ✅ Одна админка: новая (`admin/index.html`)
- ✅ Worker готов к деплою (код исправлен)
- ✅ После деплоя все кнопки заработают

---

**Готово!** После выполнения всех шагов ваша админ-панель будет полностью функциональна.
