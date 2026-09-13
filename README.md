# VigSharm — Интернет-витрина цветов и подарков

Локальный интернет-магазин для Армавира и радиуса до 100 км.

## 🌐 Ссылки

- **Витрина:** https://YOUR_USERNAME.github.io/vigsharm-shop/
- **Админ-панель:** https://YOUR_USERNAME.github.io/vigsharm-shop/admin.html

## 🎯 Особенности

- **Без корзины и онлайн-оплаты** — заказы через WhatsApp/Telegram
- **Mobile First** — 80%+ трафика с мобильных
- **Studio Pro интеграция** — AI-обработка фото через NordRouter
- **GitHub Pages** — бесплатный хостинг и автодеплой

## 🛠 Технологии

- Чистый HTML/CSS/JavaScript (без фреймворков)
- GitHub API для управления каталогом
- NordRouter AI для обработки изображений
- WebP оптимизация изображений

## 📋 Использование админ-панели

1. Откройте `admin.html`
2. Подключитесь к GitHub (нужен Personal Access Token с правами `repo`)
3. Добавьте NordRouter API ключ в настройках
4. Загружайте фото, обрабатывайте в Studio Pro, публикуйте товары

## 📦 Структура проекта

```
├── admin.html              # Админ-панель
├── index.html              # Главная страница
├── catalog.html            # Каталог товаров
├── product.html            # Карточка товара
├── delivery.html           # Условия доставки
├── price.html              # Прайс-лист
├── assets/
│   ├── admin.js           # Логика админки
│   ├── products.json      # Каталог товаров
│   └── fonts.css          # Шрифты Geist
├── images/products/       # Фото товаров (WebP)
└── .github/workflows/     # GitHub Actions для деплоя

```

## 🎨 Дизайн

См. `DESIGN.md` для полного описания дизайн-токенов и стилей.

## 🔧 Разработка

Проект статический, работает без сборки. Просто откройте `index.html` локально или задеплойте на GitHub Pages.

## 📄 Лицензия

Проект для личного использования.
