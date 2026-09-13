# Инструкция по деплою воркера VigSharm

## Что исправлено:

1. ✅ **AI Generate Card** - изменена модель на `openai/gpt-4o-mini` (с префиксом провайдера)
2. ✅ **AI Suggest Category** - изменена модель на `openai/gpt-4o-mini`
3. ✅ **Upload Photo** - переделан на data URL (без зависимости от R2/NordRouter upload)
4. ✅ Добавлена обработка ошибок NordRouter API

## Важно: Формат моделей NordRouter

NordRouter требует **префикс провайдера** в названии модели:
- ✅ `openai/gpt-4o-mini` 
- ✅ `anthropic/claude-sonnet-4.6`
- ✅ `deepseek/deepseek-chat`
- ❌ `gpt-3.5-turbo` (ошибка: unknown model)
- ❌ `gpt-4o-mini` (ошибка: unknown model)

Документация: https://nordrouter.com/docs/guide/quickstart

## Для деплоя выполните В НОВОМ ТЕРМИНАЛЕ:

```bash
# Откройте новое окно PowerShell или CMD
cd c:\vigsharm-shop\worker
npx wrangler deploy
```

⚠️ **Важно:** Wrangler зависает в текущей сессии терминала - используйте НОВОЕ окно!

## Проверка после деплоя:

```bash
cd c:\vigsharm-shop
node test-api.js
```

Ожидаемый результат: **3/3 теста пройдено** ✅

## Примечание:

Модель `openai/gpt-4o-mini` - это OpenAI GPT-4o mini через NordRouter.
Если ошибка остается, проверьте:
1. NORDROUTER_API_KEY установлен корректно: `wrangler secret put NORDROUTER_API_KEY`
2. На балансе NordRouter есть средства
3. В ключе NordRouter включен доступ к OpenAI моделям

