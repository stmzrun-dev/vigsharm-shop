# 🚀 Быстрый деплой админ-панели VigSharm

## Prerequisite: Node.js установлен

## Шаг 1: Установить Wrangler CLI (1 мин)
```bash
npm install -g wrangler
wrangler login
```

## Шаг 2: Создать D1 базу данных (1 мин)
```bash
cd c:\vigsharm-shop\worker
wrangler d1 create vigsharm-db
```

**Копируем `database_id` из вывода и вставляем в `wrangler.toml`:**
```toml
database_id = "YOUR_DATABASE_ID"  # заменить на реальный ID
```

## Шаг 3: Применить миграцию (30 сек)
```bash
wrangler d1 execute vigsharm-db --file=./schema.sql
```

Должно создать:
- ✅ Таблица `products` (28 полей)
- ✅ Таблица `categories` (28 категорий)
- ✅ Индексы

## Шаг 4: Создать R2 бакет для фото (2 мин)
```bash
wrangler r2 bucket create vigsharm-photos
```

**Включаем публичный доступ:**
1. Открыть [Cloudflare Dashboard](https://dash.cloudflare.com)
2. R2 → vigsharm-photos → Settings
3. Public Access → Allow Access
4. Копировать **Public R2.dev Bucket URL**

**Вставляем URL в `wrangler.toml`:**
```toml
R2_PUBLIC_URL = "https://pub-XXXXXXXXXXXX.r2.dev"  # заменить на реальный
```

## Шаг 5: Добавить API ключ NordRouter (30 сек)
```bash
wrangler secret put NORDROUTER_API_KEY
```

Вводим: `sk-nr-...` (ваш ключ от NordRouter)

## Шаг 6: Деплой Worker (1 мин)
```bash
wrangler deploy
```

**Копируем URL из вывода:**
```
https://vigsharm-api.YOUR_SUBDOMAIN.workers.dev
```

## Шаг 7: Настроить админку (30 сек)

1. Открыть `c:\vigsharm-shop\admin\index.html` в браузере
2. Перейти на вкладку **Настройки**
3. Вставить Worker API URL
4. (Опционально) Вставить NordRouter API Key для прямых запросов
5. Нажать **Сохранить**

## ✅ Готово!

Теперь можно:
- Создавать товары
- Загружать фото
- Генерировать описания через AI
- Обрабатывать фото через Studio Pro
- Публиковать товары на сайт

---

## 🔧 Проверка работоспособности

### Проверить Worker:
```bash
curl https://vigsharm-api.YOUR_SUBDOMAIN.workers.dev/api/products
```

Должно вернуть: `{"ok":true,"products":[]}`

### Проверить D1:
```bash
wrangler d1 execute vigsharm-db --command="SELECT COUNT(*) FROM categories"
```

Должно вернуть: `28`

### Проверить R2:
```bash
wrangler r2 bucket list
```

Должно показать: `vigsharm-photos`

---

## 📞 Если что-то не работает

### Worker не отвечает:
```bash
wrangler tail  # смотрим логи
wrangler deployments list  # проверяем деплой
```

### D1 не работает:
```bash
wrangler d1 execute vigsharm-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### R2 фото не загружаются:
- Проверить Public Access включен
- Проверить R2_PUBLIC_URL в wrangler.toml корректный

### AI не генерирует:
```bash
wrangler secret list  # проверяем секреты
```

---

## 🌐 Деплой админки на GitHub Pages (опционально)

```bash
# 1. Коммит в репозиторий
git add .
git commit -m "Admin panel ready"
git push

# 2. Включить GitHub Pages
# Settings → Pages → Source: main branch → Save
```

Админка будет доступна:
```
https://YOUR_USERNAME.github.io/vigsharm-shop/admin/
```

---

**Время деплоя:** ~5-10 минут  
**Стоимость:** FREE (Free tier Cloudflare покрывает всё)

Готово! 🎉
