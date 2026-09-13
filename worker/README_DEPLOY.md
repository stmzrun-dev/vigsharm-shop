# 🚀 БЫСТРЫЙ ДЕПЛОЙ

## Что исправлено:
✅ Модели изменены на `openai/gpt-4o-mini` (NordRouter требует префикс `openai/`)
✅ Обработка ошибок API добавлена
✅ Upload photo работает через base64

## Деплой (1 минута):

### Шаг 1: Откройте НОВОЕ окно терминала
⚠️ **Важно!** Wrangler зависает в текущей сессии - используйте свежий терминал

### Шаг 2: Выполните команды
```bash
cd c:\vigsharm-shop\worker
npx wrangler deploy
```

### Шаг 3: Тестируйте
```bash
cd c:\vigsharm-shop
node test-api.js
```

**Ожидаемый результат:** 3/3 теста ✅

## Если тесты не проходят:

### Проверьте API ключ NordRouter:
```bash
cd c:\vigsharm-shop\worker
wrangler secret put NORDROUTER_API_KEY
# Введите ваш ключ: sk-nr-...
```

### Проверьте баланс:
- Откройте https://nordrouter.com
- Личный кабинет → Баланс
- Должно быть > $0.01

## Формат моделей NordRouter:
- ✅ `openai/gpt-4o-mini`
- ✅ `anthropic/claude-sonnet-4.6`
- ❌ `gpt-3.5-turbo` (без префикса не работает!)

Документация: https://nordrouter.com/docs/guide/quickstart
