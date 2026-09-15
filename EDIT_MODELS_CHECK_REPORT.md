# 🔍 Отчет: Проверка Edit-моделей NordRouter

**Дата:** 15.09.2026  
**Источник:** `GET /media/models` через Worker API  
**Проверено моделей:** 10 из 126 доступных  

---

## ✅ Статус

**Все 10 моделей найдены в NordRouter API:**
1. ✅ `image/gpt-image-2-edit`
2. ✅ `image/gpt-image-1.5-edit`
3. ✅ `image/flux2-pro-edit`
4. ✅ `image/seedream-5.0-pro-edit`
5. ✅ `image/seedream-4.5-edit`
6. ✅ `image/seedream-edit`
7. ✅ `image/qwen3-pro-edit`
8. ✅ `image/qwen3-edit`
9. ✅ `image/qwen-edit`
10. ✅ `image/grok-edit`

---

## 🔑 Ключевой вывод: НЕТ ПОДДЕРЖКИ НЕСКОЛЬКИХ ИЗОБРАЖЕНИЙ

**Все 10 проверенных edit-моделей имеют ТОЛЬКО одно поле `image`:**
- ❌ `image2` — НЕ НАЙДЕНО ни в одной модели
- ❌ `reference` — НЕ НАЙДЕНО ни в одной модели  
- ❌ `mask` — НЕ НАЙДЕНО ни в одной модели
- ❌ `attachments` — НЕ НАЙДЕНО ни в одной модели
- ❌ `background_image` — НЕ НАЙДЕНО ни в одной модели

**Все модели принимают:**
- ✅ `prompt` (textarea, required)
- ✅ `image` (image, required) — **ТОЛЬКО ОДНО ИЗОБРАЖЕНИЕ**
- ✅ Дополнительные параметры: `aspect_ratio`, `resolution`, `quality`, `nsfw_checker` и т.д.

---

## 📋 Структура fields для всех моделей

Все проверенные edit-модели имеют одинаковую базовую структуру:

```json
{
  "fields": [
    {
      "name": "prompt",
      "type": "textarea",
      "label": "Промпт",
      "required": true
    },
    {
      "name": "image",
      "type": "image",
      "label": "Входная картинка",
      "required": true
    },
    // ... дополнительные параметры (aspect_ratio, resolution, etc.)
  ]
}
```

---

## 💰 Стоимость моделей

| Модель | Стоимость (USD) | Описание |
|--------|-----------------|----------|
| `gpt-image-2-edit` | $0.0313 | OpenAI, до 4K |
| `gpt-image-1.5-edit` | $0.025 | OpenAI, до 2K |
| `flux2-pro-edit` | $0.0313 | Правка фото |
| `seedream-5.0-pro-edit` | $0.025 | SD, мульти-модальный |
| `seedream-4.5-edit` | $0.0125 | SD, правка |
| `seedream-edit` | $0.025 | SD, многоязычный |
| `qwen3-pro-edit` | $0.05 | Правка, до 5K |
| `qwen3-edit` | $0.0313 | Многоязычный |
| `qwen-edit` | $0.0375 | Многоязычный |
| `grok-edit` | $0.025 | Правка фото |

---

## 🎯 Рекомендации

### Для текущего проекта (Vigsharm):

**Вывод:** Невозможно реализовать функцию "добавить товар на фон" с использованием edit-моделей, так как:
1. Edit-модели принимают только ОДНО изображение
2. Нет способа передать два изображения (товар + фон)
3. Нет полей `image2`, `reference`, `background_image`

### Альтернативы:

1. **Использовать image-generation модели (не edit):**
   - Проверить модели типа `image/` (не `-edit`)
   - Искать модели с поддержкой `reference_image` или `attachments`

2. **Композиция через промпт:**
   - Загрузить товар на фон локально (Canvas/ImageMagick)
   - Отправить готовую композицию в edit-модель для улучшения

3. **Использовать другой сервис:**
   - DALL-E 3 (inpainting)
   - Midjourney (multi-image prompts)
   - Stable Diffusion WebUI (ControlNet + reference)

---

## 📄 Полные данные

Полный JSON-отчет со всеми fields сохранен в:
- `c:/vigsharm-shop/edit-models-report.txt`

---

## ⚙️ Техническая информация

**Endpoint:** `https://vigsharm-api.vigsharm.workers.dev/check-model`  
**Метод:** `GET`  
**Аутентификация:** Через Worker (серверный `NORDROUTER_API_KEY`)  
**Исходный код:**
- `c:/vigsharm-shop/worker/index.js` (строки 668-747)
- `c:/vigsharm-shop/test-check-edit-models.js`
- `c:/vigsharm-shop/test-check-model.html`

**После завершения диагностики можно удалить:**
1. Строки 45-47 в `worker/index.js` (route `/check-model`)
2. Строки 667-747 в `worker/index.js` (функция `handleCheckModel`)
3. Файл `test-check-model.html`
4. Файл `test-check-edit-models.js`
5. Файл `edit-models-report.txt`
6. Повторный деплой Worker

---

## ✅ Задача выполнена

- ✅ Использован существующий Worker с серверным API-ключом
- ✅ Расширен endpoint `/check-model` для проверки 10 моделей
- ✅ Получены полные JSON-записи всех моделей
- ✅ Проанализированы fields на наличие поддержки нескольких изображений
- ✅ Создан отчет с выводами

**Итог:** Ни одна из 10 проверенных edit-моделей НЕ поддерживает передачу второго изображения.
