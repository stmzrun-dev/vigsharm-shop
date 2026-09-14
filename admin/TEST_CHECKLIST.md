# ✅ Чек-лист тестирования NordRouter интеграции

## 🔧 Подготовка
- [ ] Локальный сервер запущен на `http://localhost:8000`
- [ ] Открыта админ-панель: `http://localhost:8000/admin/index.html`
- [ ] Открыта консоль браузера (F12 → Console)

## 1️⃣ Проверка загрузки модулей

В консоли должны быть сообщения:
```
✓ Vigsharm Admin Extended Functions loaded
✓ Studio Pro NEW ARCHITECTURE loaded
✓ AI Metadata Generator loaded
✓ NordRouter Direct Integration loaded
✓ NordRouter AI Generation loaded
✓ Cloudinary Uploader loaded
✓ Cloudinary Integration enabled
```

## 2️⃣ Настройка NordRouter API ключа

- [ ] Перейти на вкладку **"Настройки"**
- [ ] Ввести NordRouter API Key: `sk-nr-...`
- [ ] Нажать кнопку **"Сохранить"**
- [ ] Увидеть зеленое уведомление: **"Настройки сохранены"**

**Проверка в консоли:**
```javascript
localStorage.getItem('vigsharm_admin_settings')
// Должно вернуть: {"workerUrl":"https://...","nordrouterKey":"sk-nr-..."}

app.nordrouterKey
// Должно вернуть: "sk-nr-..."
```

- [ ] localStorage содержит ключ
- [ ] `app.nordrouterKey` не пустой

## 3️⃣ Тест Studio Pro (обработка фото)

- [ ] Перейти на вкладку **"+ Создать"**
- [ ] **Шаг 1:** Загрузить фото товара
- [ ] **Шаг 2:** Выбрать сцену (например: "Напольная сцена")
- [ ] Нажать **"✨ Обработать фото через Studio Pro"**

**Ожидаемое поведение:**
1. Кнопка становится неактивной
2. Текст меняется на "Обработка..."
3. Статус: "📤 Отправка фото в NordRouter..."
4. Статус: "⏳ Обработка изображения... (1-2 минуты)"
5. Статус: "⏳ Статус: processing... (15с)"
6. Статус: "✅ Фото обработано через Studio Pro"
7. Фото в превью обновляется на обработанное

**В консоли:**
```
Studio Pro: sending request {scene: "floor", prompt: "заменить фон на стену с плинтусом и ламинатом"}
Studio Pro: job created [job_id]
Polling 1/60, status: processing
...
Studio Pro: completed [url]
```

**В Network (F12 → Network → Fetch/XHR):**
- [ ] Запрос POST `nordrouter.com/media/generate` (status 200)
- [ ] Несколько GET `nordrouter.com/media/job/[id]` (polling)

- [ ] Фото успешно обработано
- [ ] Нет ошибок в консоли

## 4️⃣ Тест AI генерации метаданных

- [ ] Нажать **"🤖 Сгенерировать данные через ИИ"**

**Ожидаемое поведение:**
1. Кнопка становится неактивной
2. Текст меняется на "Генерация..."
3. Статус: "🤖 Анализ фото через GPT-4o-mini..."
4. Статус: "✅ Метаданные успешно сгенерированы"
5. Все поля формы заполняются автоматически:
   - Название
   - Артикул
   - Цена
   - Короткое описание
   - Полное описание
   - Состав
   - Категория

**В консоли:**
```
AI Generation: sending request to NordRouter
AI Generation: received response {...}
AI Generation: completed {title: "...", price: ..., ...}
```

**В Network:**
- [ ] Запрос POST `nordrouter.com/chat/completions` (status 200)

- [ ] Поля заполнены корректно
- [ ] Нет ошибок в консоли

## 5️⃣ Проверка повторного использования

- [ ] Обновить страницу (Ctrl+Shift+R)
- [ ] Проверить, что ключ остался: `app.nordrouterKey`
- [ ] Создать новую карточку
- [ ] Повторить тесты Studio Pro и AI

## 🐛 Возможные ошибки

### "⚠️ Введите NordRouter API ключ в настройках"
- Ключ не сохранен в localStorage
- **Решение:** повторно ввести и сохранить

### "HTTP 401" или "Unauthorized"
- Неправильный API ключ
- **Решение:** проверить ключ на nordrouter.com

### "Не удалось распарсить ответ AI"
- GPT вернул не JSON
- **Решение:** проверить консоль, повторить запрос

### Фото не обновляется после Studio Pro
- URL не применился к `app.currentProduct.photos[0]`
- **Решение:** проверить в консоли `app.currentProduct.photos[0].url`

## 📊 Итоговая проверка

- [ ] Все модули загружены
- [ ] Ключ сохраняется в localStorage
- [ ] Studio Pro обрабатывает фото
- [ ] AI генерирует метаданные
- [ ] Нет ошибок в консоли
- [ ] После перезагрузки страницы всё работает

**Всё отмечено?** 🎉 Интеграция работает!

**Есть проблемы?** Отправьте:
1. Скриншот консоли (F12 → Console)
2. Скриншот Network (F12 → Network)
3. Описание ошибки
