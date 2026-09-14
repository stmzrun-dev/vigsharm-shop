# 🚀 Инструкция по деплою Worker

## ✅ Исправления выполнены:

### Файл: `worker/index.js`
- **Строка 157:** `openai/gpt-4o` → `openai/gpt-4o-mini` ✅
- **Строка 190:** `openai/gpt-4o-mini` (уже было правильно) ✅

---

## 📋 Как задеплоить:

### Вариант 1: Через батник (РЕКОМЕНДУЕТСЯ)
```bash
# Откройте терминал в VS Code
cd c:\vigsharm-shop\worker
DEPLOY_NOW.bat
```

### Вариант 2: Через командную строку
```bash
cd c:\vigsharm-shop\worker
npx wrangler deploy
```

### Вариант 3: Через Cloudflare Dashboard
1. Откройте: https://dash.cloudflare.com
2. Workers & Pages → vigsharm-api
3. Settings → Edit code
4. Скопируйте содержимое `worker/index.js`
5. Вставьте в редактор
6. Save and Deploy

---

## 🧪 После деплоя проверьте:

### 1. Откройте Worker в браузере:
```
https://vigsharm-api.vigsharm.workers.dev/api/products
```

Должно вернуть: `{"ok": true, "products": [...]}`

### 2. Проверьте AI генерацию:
Откройте админку:
```
https://stmzrun-dev.github.io/vigsharm-shop/admin/
```

- Создайте новый товар
- Нажмите "Сгенерировать данные через ИИ"
- Проверьте, что ошибки `unknown model` больше нет

---

## ❌ Если ошибка осталась:

### Проверка 1: API ключ установлен?
```bash
cd c:\vigsharm-shop\worker
wrangler secret put NORDROUTER_API_KEY
# Введите: sk-nr-...
```

### Проверка 2: Баланс NordRouter
- Откройте: https://nordrouter.com
- Личный кабинет → Баланс
- Должно быть > $0.01

### Проверка 3: Логи Worker
```bash
wrangler tail
# Откройте админку и попробуйте AI генерацию
# Смотрите ошибки в реальном времени
```

---

## 📊 Текущее состояние:

✅ Модель исправлена: `openai/gpt-4o-mini`  
⏳ Нужно задеплоить изменения  
✅ Код готов к деплою
