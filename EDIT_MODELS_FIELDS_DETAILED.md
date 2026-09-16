# Детализированные Fields Edit-моделей

## 1. image/gpt-image-2-edit
**Стоимость:** $0.0313  
**Описание:** OpenAI, правка, до 4K  
**Макс. промпт:** 10000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `aspect_ratio` (select) — Формат: auto, 1:1, 3:2, 2:3, 16:9, 9:16 [default: auto]
- `resolution` (select) — Разрешение: 1K, 2K, 4K [default: 1K]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 2. image/gpt-image-1.5-edit
**Стоимость:** $0.025  
**Описание:** OpenAI, правка, до 2K  
**Макс. промпт:** 10000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `quality` (select) — Качество: medium, high [default: medium]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 3. image/flux2-pro-edit
**Стоимость:** $0.0313  
**Описание:** Правка фото  
**Макс. промпт:** 5000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `aspect_ratio` (select) — Формат: 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, auto [default: 1:1]
- `resolution` (select) — Разрешение: 1K, 2K [default: 1K]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 4. image/seedream-5.0-pro-edit
**Стоимость:** $0.025  
**Описание:** SD, мульти-модальный  
**Макс. промпт:** 2000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `aspect_ratio` (select) — Формат: 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9 [default: 1:1]
- `quality` (select) — Качество: basic, high [default: basic]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 5. image/seedream-4.5-edit
**Стоимость:** $0.0125  
**Описание:** SD, правка  
**Макс. промпт:** 2000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `aspect_ratio` (select) — Формат: 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9 [default: 1:1]
- `quality` (select) — Качество: basic, high [default: basic]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 6. image/seedream-edit
**Стоимость:** $0.025  
**Описание:** SD, многоязычный, правка  
**Макс. промпт:** 2000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `aspect_ratio` (select) — Формат: 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9 [default: 1:1]
- `quality` (select) — Качество: basic, high [default: basic]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 7. image/qwen3-pro-edit
**Стоимость:** $0.05  
**Описание:** Правка, до 5K  
**Макс. промпт:** 2000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `aspect_ratio` (select) — Формат: 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9 [default: 1:1]
- `output_format` (select) — Формат файла: png, jpeg [default: png]
- `negative_prompt` (text, optional) — Чего не должно быть
- `prompt_extend` (bool) — ✨ Улучшать промпт [default: true]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 8. image/qwen3-edit
**Стоимость:** $0.0313  
**Описание:** Многоязычный, правка  
**Макс. промпт:** 2000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `aspect_ratio` (select) — Формат: 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9 [default: 1:1]
- `output_format` (select) — Формат файла: png, jpeg [default: png]
- `negative_prompt` (text, optional) — Чего не должно быть
- `prompt_extend` (bool) — ✨ Улучшать промпт [default: true]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 9. image/qwen-edit
**Стоимость:** $0.0375  
**Описание:** Многоязычная правка  
**Макс. промпт:** 2000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `image_size` (select) — Размер: square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9 [default: landscape_4_3]
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 10. image/grok-edit
**Стоимость:** $0.025  
**Описание:** Правка фото  
**Макс. промпт:** 10000 символов

### Fields:
- `prompt` (textarea, required) — Промпт
- `image` (image, required) — Входная картинка
- `nsfw_checker` (bool) — 🛡 Фильтр 18+ [default: true]

---

## 🔍 Общие выводы

### Обязательные поля (все модели):
- ✅ `prompt` — текстовое описание изменений
- ✅ `image` — ОДНО входное изображение

### Дополнительные параметры:
- 🎨 **Формат/размер:** `aspect_ratio`, `resolution`, `image_size`
- 🎯 **Качество:** `quality`, `output_format`
- 🛡 **Безопасность:** `nsfw_checker` (почти везде)
- ✨ **Улучшения:** `prompt_extend` (Qwen3)
- ❌ **Негативный промпт:** `negative_prompt` (только Qwen3)

### ❌ НЕ НАЙДЕНО ни в одной модели:
- `image2` — второе изображение
- `reference` — референсное изображение
- `mask` — маска для inpainting
- `attachments` — дополнительные файлы
- `background_image` — фоновое изображение

---

## 💡 Вывод для проекта Vigsharm

**Задача:** Наложить товар на готовый фон (2 изображения)

**Проблема:** Edit-модели принимают только 1 изображение.

**Решение:**
1. Локальная композиция (Canvas/PIL/ImageMagick) → отправка в edit для улучшения
2. Поиск моделей с `reference_image` среди НЕ-edit моделей
3. Использование внешних сервисов (DALL-E 3 inpainting, Midjourney, ComfyUI)
