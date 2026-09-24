# HANDOFF — Vigsharm

_Последнее обновление: 25 сентября 2026, ~00:20 (UTC+3). Ветка `main`._

Этот файл — выжимка для следующего агента/сессии, чтобы не гонять контекст заново. Общие правила проекта — в `AGENTS.md`, дизайн-токены — в `DESIGN.md`. Здесь только: что сделано, над чем шла работа прямо сейчас, какие файлы трогать и что осталось.

## 0. Спринт UI-polish (завершён, 24–25.09.2026)

Два связанных спринта по витрине — **сделано и в `main`**.

### Главная (`index.html`) — Phase 1–5
- Touch-таргеты меню 44px, читаемые мессенджеры в бургере (12px), без page x-scroll на popular.
- Цена на popular-карточках как якорь (разметка в `home.js` + CSS).
- Hero: один primary CTA + текстовая secondary + trust-chip про доставку.
- Единый surface карточек в `site-marshmallow.css`; дубли border/shadow убраны из `home-polish.css`; rainbow-классы категорий сняты с HTML.
- Footer CTA / прайс / coral-ссылки; «Листайте карточки» убрано.
- Коммит: `6a0e2d3`. Кеш: `index.html` → `?v=20260925-uireview`.

### Карточка товара (`product.html`) — Phase A–C
- На ≤1020px снова виден `.product-base-price` под заголовком (22px); sticky-цена 18px.
- CTA form + sticky (в т.ч. `is-ready`) — единый `--mm-accent-grad`, min-height 52px.
- Lilac wash шагов убран из `product-polish.css`; канон surface/CTA в `site-marshmallow.css`.
- Кеш: `product.html` → `product-polish.css` / `site-marshmallow.css` `?v=20260925-productui`.

**Правило каскада:** новые правки витрины класть в конец `assets/site-marshmallow.css` (последний в `<head>`), не плодить четвёртый override. JS-логику заказа не трогали.

## 1. Статус сайта

- Прод: https://stmzrun-dev.github.io/vigsharm-shop/index.html — деплоится через `.github/workflows/pages.yml` **только с push в `main`**.
- Локальный превью-сервер — **не** `python -m http.server`, а `python scripts/_dev_server_5500.py` (см. `AGENTS.md`).

### Что уже сделано ранее (кратко)
1. Мобильная форма заказа на `product.html` (прогрессивные шаги, `is-order-ready`) — `product.js` / `product-polish.css`.
2. Soft-3d иконки меню (`icons/menu-*.png`) + увеличенные иконки звонка/чата в футере.
3. UI-polish главной и карточки товара — см. §0 выше.

## 2. Задача, которую решали прямо сейчас

**Тема:** дизайн-ревью → правки главной (Phase 1–5) и карточки товара (Phase A–C): иерархия цены/CTA, touch, каскад polish↔marshmallow, sync cache busting.

**Статус:** оба спринта закрыты.

## 3. Файлы, которые за это отвечают

| Файл | За что отвечает |
|---|---|
| `assets/site-marshmallow.css` | Канон витрины (DESIGN.md v3): карточки, CTA, product price/sticky, homepage phases 1–5 + product A–C |
| `assets/home-polish.css` | Layout главной; surface карточек не дублировать |
| `assets/product-polish.css` | Layout/форма product; fill CTA / lilac steps — не дублировать |
| `assets/home.js` | Шаблон popular: `.live-product-price-row` |
| `assets/product.js` | Рендер галереи / цены / sticky bar (логика заказа без изменений в UI-спринте) |
| `index.html`, `product.html` | `?v=` кеш CSS/JS — бампать при правках стилей |
| `.github/workflows/pages.yml` | Деплой Pages с `main` |

## 4. Следующие шаги

1. Визуально проверить 375px: главная (hero/popular/меню) и `product.html` (цена под h1 + sticky gradient CTA).
2. По желанию — выровнять `?v=` marshmallow на `catalog.html` / `price.html` / `delivery.html` с `20260925-*`.
3. Старый долг (не блокер): паритет карточек «Позвонить» / «Написать» в футере; Telegram в соцкнопках.

## 5. Как проверять

1. `powershell -File scripts/start_dev_5500.ps1` из `C:\vigsharm-shop`.
2. Chrome/Edge: `http://127.0.0.1:5500/` и `/product?slug=…` на 375px.
3. Ctrl+F5 после смены `?v=`.
4. После правок — commit + `git push origin main` (Pages только с `main`).
