# VigSharm Admin Panel - Quick Start

## 📁 Структура файлов

```
admin/
├── index.html           (3.9 KB)  - HTML структура админ-панели
├── styles.css           (8.7 KB)  - Стили интерфейса
├── admin.js             (7.6 KB)  - Базовая логика и навигация
├── admin-extended.js    (18.7 KB) - Расширенный функционал
├── README.md            - Документация
├── CHANGELOG.md         - История изменений
└── admin.js.backup      - Резервная копия
```

## ✅ Статус реализации

### Готово (Frontend):
- ✅ HTML структура с 5 шагами создания товара
- ✅ Адаптивные стили (Mobile First)
- ✅ Drag & Drop загрузка фото (макс. 6 шт)
- ✅ Выбор сцены для Studio Pro
- ✅ Группы тегов (Для кого, Повод, Даты, Тип)
- ✅ Форма с валидацией
- ✅ Toast уведомления
- ✅ Управление настройками (localStorage)

### Требует реализации (Backend):
- ⏳ Cloudflare Worker API endpoints
- ⏳ D1 Database CRUD операции
- ⏳ R2 Storage для фото
- ⏳ OpenAI интеграция
- ⏳ Nord Router Studio Pro интеграция

## 🚀 Быстрый старт

### 1. Открыть админ-панель
```
file:///c:/vigsharm-shop/admin/index.html
```

или через локальный сервер:
```bash
cd c:\vigsharm-shop
python -m http.server 8000
# Открыть: http://localhost:8000/admin/
```

### 2. Настроить подключения

Перейти на вкладку **Настройки** и указать:
- **Worker URL**: `https://your-worker.workers.dev`
- **OpenAI API Key**: `sk-...`
- **Nord Router API Key**: `sk-nr-...`

Настройки сохраняются в localStorage браузера.

### 3. Создать товар

#### Шаг 1: Фото
- Перетащите фото или нажмите для выбора
- Макс. 6 фото, до 10 МБ каждое
- Первое фото = главное (можно изменить)

#### Шаг 2: AI + Studio
- **🤖 Сгенерировать через ИИ** - OpenAI анализирует фото и создает карточку
- **✨ Studio Pro** - обработка фото через Nord Router (фон, освещение)

#### Шаг 3: Данные товара
- Название, артикул, цена
- Краткое и полное описание
- Состав (каждая строка = один элемент)

#### Шаг 4: Категория и теги
- Выбор категории
- Выбор тегов (Для кого, Повод, Даты, Тип)
- Опции для клиента (надпись, цифры, аренда)

#### Шаг 5: SEO
- SEO заголовок
- SEO описание
- URL slug (автогенерация)

#### Публикация
- **Опубликовать** - сразу на сайт
- **Сохранить черновик** - для дальнейшей работы

## 📋 API Endpoints (требуется реализация)

### Товары
```
GET    /api/products          - Список товаров
POST   /api/products          - Создание/обновление
GET    /api/products/:id      - Получение товара
DELETE /api/products/:id      - Удаление
```

### Загрузка
```
POST   /api/upload/photo      - Загрузка в R2 Storage
```

### AI
```
POST   /api/ai/generate-card  - Генерация через OpenAI
Body: { image_url, scene, price }
```

### Studio Pro
```
POST   /api/studio/process    - Запуск обработки
Body: { image_url, scene }

GET    /api/studio/status/:jobId - Проверка статуса
```

## 🔧 Функции admin-extended.js

### Управление фото
- `setupPhotoUpload()` - инициализация
- `handlePhotoFiles(files)` - обработка загруженных
- `renderPhotos()` - отображение
- `setMainPhoto(index)` - установка главного
- `removePhoto(index)` - удаление

### AI и Studio
- `generateAICard()` - генерация через OpenAI
- `fillFormWithAIData(card)` - заполнение формы
- `processStudioPro()` - обработка всех фото
- `pollStudioStatus(jobId)` - опрос статуса (60 попыток × 3 сек)
- `uploadPhoto(file)` - загрузка на сервер

### Работа с данными
- `collectFormData()` - сбор данных из формы
- `publishProduct()` - публикация с валидацией
- `saveDraft()` - сохранение черновика
- `editProduct(id)` - загрузка для редактирования
- `loadProductToForm(product)` - заполнение формы
- `resetForm()` - очистка формы

## 🎨 Дизайн токены

Все стили берутся из `DESIGN.md`:
- Основной: `#E84C3D` (коралловый)
- Акцент: `#FFD700` (золотой)
- Фон: `#FFF9F5` (кремовый)
- Шрифт: Montserrat

## ⚠️ Важно

1. **Без корзины** - заказы через WhatsApp/Telegram/звонок
2. **Mobile First** - 80%+ заказов с мобильных
3. **Не менять токены** без согласования (см. AGENTS.md)
4. **Валидация обязательна**: название + категория + фото

## 📝 Следующие шаги

### Worker (Cloudflare)
1. Создать D1 базу данных
2. Применить schema.sql
3. Реализовать CRUD endpoints
4. Подключить R2 Storage
5. Добавить OpenAI API
6. Добавить Nord Router API

### Тестирование
1. Проверить drag & drop
2. Проверить форму и валидацию
3. Проверить toast уведомления
4. Проверить навигацию между табами
5. Проверить сохранение настроек

### Production
1. Деплой worker на Cloudflare
2. Настроить домен
3. Добавить базовую аутентификацию
4. Мониторинг и логи

## 🐛 Debugging

### Открыть консоль браузера
```
F12 → Console
```

Вы должны увидеть:
```
✓ VigSharm Admin loaded
✓ VigSharm Admin Extended Functions loaded
```

### Проверить настройки
```javascript
console.log(app.workerUrl);
console.log(app.openaiKey ? '✓ OpenAI' : '✗ OpenAI');
console.log(app.nordrouterKey ? '✓ NordRouter' : '✗ NordRouter');
```

### Проверить состояние
```javascript
console.log(app.currentProduct);
console.log(app.currentStep);
```

## 📞 Поддержка

См. `AGENTS.md` для правил работы с проектом.

---

**Версия**: 1.0.0  
**Дата**: 13.09.2026  
**Статус**: Frontend готов, Backend требуется
