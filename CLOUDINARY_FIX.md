# 🔧 ИСПРАВЛЕНИЕ CLOUDINARY UPLOAD

## Проблема
```
Cloudinary upload failed:
Upload preset must be whitelisted for unsigned uploads
HTTP 400
```

## Причина
Upload preset не настроен как **UNSIGNED** в Cloudinary.

## Решение (5 минут)

### Шаг 1: Откройте Cloudinary Console
https://console.cloudinary.com/

### Шаг 2: Создайте UNSIGNED Upload Preset

1. **Settings** → **Upload** → **Upload Presets**
2. Нажмите **Add upload preset**
3. Заполните:
   - **Preset name:** `vigsharm_unsigned`
   - **Signing Mode:** **Unsigned** ⚠️ ВАЖНО!
   - **Folder:** `vigsharm-products`
4. **Save**

### Шаг 3: Скопируйте Cloud Name

На **Dashboard** скопируйте **Cloud Name** (например: `dxxxxx`)

### Шаг 4: Настройте админ-панель

1. Откройте: `http://localhost:8000/admin/`
2. Перейдите в **Настройки**
3. Заполните:
   - **Cloud Name:** `dxxxxx` (ваше значение)
   - **Upload Preset:** `vigsharm_unsigned`
4. Нажмите **Сохранить**

### Шаг 5: Проверка

1. Откройте: `http://localhost:8000/admin/test-cloudinary.html`
2. Нажмите **"Загрузить из localStorage"**
3. Выберите любое изображение
4. Нажмите **"Загрузить в Cloudinary"**
5. Должно быть: `✅ УСПЕШНО!`

## Тестовый файл

Используйте для диагностики:
- `test-cloudinary.html` - простой тест загрузки

## Что происходит сейчас

1. ❌ Cloudinary возвращает HTTP 400
2. ❌ Studio Pro не может загрузить фото
3. ❌ Frontend показывает: "модель не приняла запрос"

## Что будет после исправления

1. ✅ Cloudinary принимает загрузку
2. ✅ Возвращает `secure_url` и `public_id`
3. ✅ Studio Pro получает URL изображения
4. ✅ Отправляет в NordRouter API
5. ✅ Обработка успешна

## Проверка в Console (F12)

Должно быть:
```
CLOUDINARY UPLOAD SUCCESS
secure_url: https://res.cloudinary.com/...
public_id: vigsharm-products/...
```

## Если всё ещё не работает

1. Убедитесь что preset **Unsigned**
2. Проверьте правильность Cloud Name
3. Попробуйте создать новый preset
4. Очистите localStorage: `localStorage.clear()`
5. Заново сохраните настройки

## Логи для диагностики

```javascript
// В Console (F12) выполните:
localStorage.getItem('vigsharm_admin_settings')
```

Должно быть:
```json
{
  "cloudinaryCloudName": "dxxxxx",
  "cloudinaryUploadPreset": "vigsharm_unsigned",
  "workerUrl": "https://vigsharm-api.vigsharm.workers.dev"
}
```
