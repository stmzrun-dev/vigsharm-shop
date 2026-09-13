# VigSharm Admin Panel — Инструкция по развертыванию

## Архитектура V3

```
Админка (браузер)  →  Cloudflare Worker  →  NordRouter (AI + Studio Pro)
                         ↓                        ↓
                        D1 (товары)          GPT/Claude/Gemini
                        R2 (фото)            nano-banana-edit
```

## Шаг 1: Создание Cloudflare Worker

### 1.1 Установка Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 1.2 Создание D1 базы данных
```bash
cd worker
wrangler d1 create vigsharm-db
```

Скопируйте `database_id` из вывода и вставьте в `wrangler.toml`

### 1.3 Запуск миграции
```bash
wrangler d1 execute vigsharm-db --file=./schema.sql
```

### 1.4 Создание R2 бакета
```bash
wrangler r2 bucket create vigsharm-photos
```

После создания включите публичный доступ в дашборде Cloudflare и скопируйте Public URL в `wrangler.toml`

### 1.5 Добавление секретов
```bash
wrangler secret put NORDROUTER_API_KEY
```

### 1.6 Деплой Worker
```bash
wrangler deploy
```

После деплоя вы получите URL: `https://vigsharm-api.YOUR_SUBDOMAIN.workers.dev`

## Шаг 2: Настройка админки

Откройте `admin/index.html` в браузере. В разделе **Настройки** введите:
- **Worker API URL**: `https://vigsharm-api.YOUR_SUBDOMAIN.workers.dev`
- **NordRouter API Key**: `sk-nr-...` (опционально)

## Шаг 3: Создание первого товара



## API эндпоинты

### AI
- `POST /api/ai/generate-card` — генерация данных карточки по фото
- `POST /api/ai/suggest-category` — предложение категории

### Studio Pro
- `POST /api/studio/process` — обработка фото через Studio Pro
- `GET /api/studio/status/:job_id` — проверка статуса задачи
- `POST /api/studio/upload` — загрузка приватного фото

### Products
- `GET /api/products` — список товаров
- `GET /api/products/:id` — получение товара
- `POST /api/products` — создание товара
- `PUT /api/products/:id` — обновление товара
- `DELETE /api/products/:id` — удаление товара
- `PATCH /api/products/:id/status` — переключение статуса

### Upload
- `POST /api/upload/photo` — загрузка фото в R2
- `DELETE /api/upload/photo/:id` — удаление фото из R2

## Правила Studio Pro

**СТРОГИЕ ЗАПРЕТЫ:**
1. PRODUCT IMMUTABLE — товар неизменен (количество, форма, надписи, ленты)
2. Фольгированная покупная фигура ≠ фигура из шаров (ШДМ)
3. НЕ добавлять элементы, которых нет на оригинальном фото
4. НЕ дорисовывать обрезанные части товара

**Режимы сцены:**
- `unit_balloon` — один шар, чистый фон
- `handheld_bouquet` — букет в руках/без пола
- `wall_only` — строжайший запрет пола
- `floor` — стена + плинтус + ламинат
- `photozone` — полный интерьер

## Категории

**Для кого:** Для девочки, Для мальчика, Для неё, Для мамы, Для него, Геймерам

**Поводы:** Юбилей, 1 годик, Крещение, Гендер-пати, На выписку, Свадьба и девичник

**Даты:** Выпускной, Новый год, 14 февраля, 23 февраля, 8 марта, 1 сентября

**Тип товара:** Фигуры из шаров, Напольные композиции, Букет из шаров, Цветы из шаров, Крафтовый букет, Шар-сюрприз, Коробка-сюрприз, Фотозона, Арка из шаров, Шары поштучно

## Troubleshooting

### Worker не отвечает
```bash
wrangler tail
wrangler deployments list
```

### D1 не работает
```bash
wrangler d1 execute vigsharm-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### R2 фото не загружаются
1. Проверьте публичный доступ к бакету
2. Проверьте `R2_PUBLIC_URL` в `wrangler.toml`

### ИИ не генерирует карточки
```bash
wrangler secret list
```
Проверьте баланс API ключа NordRouter

## Развертывание на GitHub Pages

1. Закоммитьте папку `admin/` в репозиторий
2. Включите GitHub Pages в настройках
3. Админка будет доступна: `https://YOUR_USERNAME.github.io/vigsharm-shop/admin/`

## Безопасность

- Токен NordRouter хранится только в localStorage браузера
- Worker проксирует все запросы к NordRouter
- D1 база доступна только через Worker API
- R2 бакет доступен только для чтения

## Следующие шаги

1. Настройте кастомный домен для Worker (например, `api.vigsharm.ru`)
2. Добавьте аутентификацию в админку (Basic Auth)
3. Настройте CI/CD для автоматического деплоя
4. Добавьте резервное копирование D1 базы

1. Нажмите **+ Создать товар**
2. **Шаг 1**: Загрузите фото (минимум 1, максимум 6)
3. **Шаг 2**: Выберите сцену Studio Pro
4. **Шаг 3**: Нажмите **Сгенерировать данные через ИИ**
5. **Шаг 4-7**: Дополните информацию
6. **Шаг 8**: Нажмите **Опубликовать товар**

