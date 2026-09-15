# Canvas Algorithm Update — Alpha Channel Cropping

## Дата обновления: 2026-09-15

## Проблема

Старый алгоритм масштабировал весь transparent PNG напрямую, включая прозрачные поля.
В результате товар выглядел как маленькая картинка на большом фоне.

**Пример из логов:**
```
scene: floor
scale: 0.65
productAspectRatio: 1.00
```
Товар визуально маленький, много пустого пространства вокруг.

---

## Решение: Новый 5-шаговый алгоритм

### ШАГ 1: Загрузка transparent PNG
Загружаем прозрачный PNG во временный canvas для сканирования.

### ШАГ 2: Сканирование alpha-канала
Функция `getAlphaBoundingBox(imageData)`:
- Сканирует все пиксели
- Находит минимальные и максимальные координаты непрозрачных пикселей (alpha > 10)
- Возвращает bounding box: `{ x, y, width, height }`

### ШАГ 3: Обрезка прозрачных полей
Создаем новый canvas только с реальным объектом:
```javascript
croppedCanvas.width = boundingBox.width;
croppedCanvas.height = boundingBox.height;
croppedCtx.drawImage(productImg, 
  boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
  0, 0, boundingBox.width, boundingBox.height
);
```

### ШАГ 4: Масштабирование реального объекта
Передаем размеры **обрезанного объекта** в `getProductPositioning()`:
```javascript
const positioning = this.getProductPositioning(
  scene, 
  boundingBox.width,   // Реальный размер объекта!
  boundingBox.height,  // Без прозрачных полей!
  MASTER_SIZE
);
```

### ШАГ 5: Композиция на эталонном фоне
Рисуем фон + масштабированный обрезанный объект:
```javascript
finalCtx.drawImage(bgImg, 0, 0, MASTER_SIZE, MASTER_SIZE);
finalCtx.drawImage(croppedCanvas, 
  positioning.drawX, positioning.drawY, 
  positioning.drawWidth, positioning.drawHeight
);
```

---

## Новая система позиционирования

### Раздельные параметры для каждой сцены

#### **floor** (напольная композиция)
```javascript
{
  targetWidth: 0.65,        // 65% ширины canvas
  centerX: 0.5,             // Центр по горизонтали
  floorY: 0.93,             // "Пол" на 93% от верха
  useFloorAlignment: true   // Выравнивать по нижней границе объекта
}
```
**Позиционирование:**
- `drawX = (canvasSize * centerX) - (drawWidth / 2)` — центр по X
- `drawY = (canvasSize * floorY) - drawHeight` — нижняя граница на "полу"

#### **wall_only** (только стена)
```javascript
{
  targetWidth: 0.55,        // 55% ширины canvas
  centerX: 0.5,             // Центр по горизонтали
  centerY: 0.55,            // Центр по вертикали (верхняя треть)
  useFloorAlignment: false
}
```
**Позиционирование:** классическое центрирование

#### **unit_balloon** (шар поштучно)
```javascript
{
  targetWidth: 0.55,
  centerX: 0.5,
  centerY: 0.60,
  useFloorAlignment: false
}
```

#### **handheld_bouquet** (букет в руке)
```javascript
{
  targetWidth: 0.60,
  centerX: 0.5,
  centerY: 0.65,
  useFloorAlignment: false
}
```

---

## Параметры для легкой настройки

### Для floor:
- **targetWidth** (0.65) — ширина товара относительно canvas
- **centerX** (0.5) — позиция по горизонтали (0.5 = центр)
- **floorY** (0.93) — Y-координата "пола" (0.93 = 93% от верха)

### Для остальных сцен:
- **targetWidth** (0.55-0.70) — ширина товара
- **centerX** (0.5) — позиция по горизонтали
- **centerY** (0.55-0.65) — позиция по вертикали

---

## Детальное логирование

Новые логи в консоли:

```
[Canvas] ====== НАЧАЛО КОМПОЗИЦИИ ======
[Canvas] Transparent PNG: 1024x1024
[Canvas] Alpha bounding box: x=120 y=80 width=780 height=850
[Canvas] Cropped product: 780x850
[Canvas] Final product: 600x654
[Canvas] Position: x=212 y=300
[Canvas] FloorY: 952
[Canvas] Scene config: {
  scene: 'floor',
  targetWidth: 0.65,
  centerX: 0.5,
  floorY: 0.93,
  useFloorAlignment: true,
  productAspectRatio: '0.92',
  description: 'Напольная композиция - товар стоит на полу'
}
[Canvas] ====== КОМПОЗИЦИЯ ЗАВЕРШЕНА ======
```

---

## Измененные функции

### 1. `getProductPositioning()` (строки 7-107)
**ДО:**
- Параметр `scale` (масштаб по высоте)
- Простое центрирование по `centerY`

**ПОСЛЕ:**
- Параметр `targetWidth` (масштаб по ширине)
- Параметр `floorY` для floor-сцен
- Параметр `useFloorAlignment` для выбора алгоритма
- Выравнивание по нижней границе для floor

### 2. `getAlphaBoundingBox()` (строки 112-144)
**НОВАЯ ФУНКЦИЯ** — сканирует alpha-канал и находит реальные границы объекта.

### 3. `composeWithBackground()` (строки 262-356)
**ДО:**
- Прямое масштабирование всего PNG
- Один canvas

**ПОСЛЕ:**
- Сканирование alpha
- Обрезка прозрачности
- Масштабирование только реального объекта
- Три canvas (temp → cropped → final)

---

## Важные гарантии

✅ Эталонный фон остается **абсолютно неизменным**  
✅ Товар НЕ перерисовывается (сохраняются цвета, формы, надписи)  
✅ Пропорции товара сохраняются  
✅ Старый код Nano Banana НЕ удален  
✅ Worker Remove BG остается без изменений  
✅ **НЕТ** новых платных AI-запросов  

---

## Тестирование

Для проверки нового алгоритма:

1. Открыть Admin Studio Pro
2. Загрузить фото товара
3. Установить эталонный фон
4. Выбрать сцену: **floor**
5. Запустить обработку
6. Проверить логи в консоли браузера
7. Оценить визуальный результат

### Ожидаемый результат:
- Товар занимает ~65% ширины canvas
- Нижняя граница товара касается "пола" (floorY = 93%)
- Нет лишних прозрачных полей
- Товар выглядит крупнее и естественнее

### Настройка под свои нужды:
Если товар слишком большой/маленький или стоит слишком высоко/низко:

**Файл:** `c:\vigsharm-shop\admin\admin-studio-pro.js`  
**Строки:** 12-17 (floor-конфигурация)

```javascript
floor: {
  targetWidth: 0.65,   // ← Измените (0.5-0.8)
  centerX: 0.5,        // ← Измените (0.4-0.6)
  floorY: 0.93,        // ← Измените (0.85-0.95)
  useFloorAlignment: true
}
```

Сохраните файл и перезагрузите страницу админки.

---

## Файлы

- **Измененный файл:** `c:\vigsharm-shop\admin\admin-studio-pro.js`
- **Строки изменений:** 5-144, 260-356
- **Новые функции:** `getAlphaBoundingBox()` (строки 112-144)
