# HANDOFF — Vigsharm

_Последнее обновление: 25 сентября 2026, ~01:42 (UTC+3). Ветка `main`._

Этот файл — выжимка для следующего агента/сессии, чтобы не гонять контекст заново. Общие правила проекта — в `AGENTS.md`, дизайн-токены — в `DESIGN.md`. Здесь только: что сделано, над чем шла работа прямо сейчас, какие файлы трогать и что осталось.

## 0b. Заказ / мессенджеры — домен карточки (25.09.2026)

В `assets/product.js` → `orderMessage()` ссылка на карточку больше не ведёт на тестовый `new.vigsharm.ru/product/…`.

- **Боевой домен:** `https://vigsharm.ru`
- **Канон URL карточки** (как в каталоге/главной): `product.html?slug=…`
- Итог в тексте заказа: `https://vigsharm.ru/product.html?slug=` + `encodeURIComponent(canonicalSlug())`
- Кеш: `product.html` → `assets/product.js?v=20260925-order-domain`
- Коммит: `fix(order): update production domain to vigsharm.ru in orderMessage links`

Аудит логики (без правок): WhatsApp/Telegram получают prefill через `encodeURIComponent(orderMessage())`; MAX — только буфер + `max.ru/u/…`. Телефон/имя клиента в текст мессенджера **не** входят (только в API-заявку).

## 0a. Admin UI refresh — завершён + follow-up layout (`?v=20260925-admin-fix3`)

CSS-first редизайн админки без смены Studio/AI/фото JS.
- Phase 1–5: tokens, SaaS list, editor chrome, AI review, header CTA «+ Создать»
- Follow-up: сцена `max-width:960px` (фото ≥380 + сетка сцен 1fr 1fr), `padding-bottom:120px` над sticky dock, компактный AI review (`max-height:90vh`)
- Файлы: `admin/styles.css`, `admin/index.html`, `admin/admin-ai.js`
- Не трогать: state-классы формы, `syncAiReview*`, Studio/AI handlers

## 0. Спринт UI-polish + responsive (завершён, 24–25.09.2026)

Два связанных спринта по витрине — **сделано и в `main`**.

### Главная (`index.html`) — Phase 1–5
- Touch-таргеты меню 44px, читаемые мессенджеры в бургере (12px), без page x-scroll на popular.
- Цена на popular-карточках как якорь (разметка в `home.js` + CSS).
- Hero: один primary CTA + текстовая secondary + trust-chip про доставку.
- Единый surface карточек в `site-marshmallow.css`; дубли border/shadow убраны из `home-polish.css`; rainbow-классы категорий сняты с HTML.
- Footer CTA / прайс / coral-ссылки; «Листайте карточки» убрано.
- Коммит: `6a0e2d3`. Кеш: `index.html` → polish/marshmallow `?v=20260925-rwd`.

### Карточка товара (`product.html`) — Phase A–C
- На ≤1020px снова виден `.product-base-price` под заголовком (22px); sticky-цена 18px.
- CTA form + sticky (в т.ч. `is-ready`) — единый `--mm-accent-grad`, min-height 52px.
- Lilac wash шагов убран из `product-polish.css`; канон surface/CTA в `site-marshmallow.css`.
- Кеш: `product.html` → polish/marshmallow `?v=20260925-rwd`.

### Responsive stress-test (320 + landscape) — в `main`
- Коммит: `2f748f7` (`fix(ui): harden sticky order bar for 320px and landscape`).
- Patch A (≤360px): sticky price + messengers не сжимаются друг в друга (`flex-wrap`, иконки 44px).
- Patch B (≤1020px × ≤420px height): компактный sticky; при focus input/textarea sticky скрывается (не перекрывает клавиатуру).
- Код: конец `assets/site-marshmallow.css` («Responsive stress-test patches»).

**Правило каскада:** новые правки витрины класть в конец `assets/site-marshmallow.css` (последний в `<head>`), не плодить четвёртый override.

## 1. Статус сайта

- **Боевой домен:** https://vigsharm.ru/
- Зеркало Pages: https://stmzrun-dev.github.io/vigsharm-shop/ — деплой через `.github/workflows/pages.yml` **только с push в `main`**.
- Локальный превью — `python scripts/_dev_server_5500.py` / `powershell -File scripts/start_dev_5500.ps1` (см. `AGENTS.md`).

### Публичные страницы витрины
| Страница | CSS marshmallow `?v=` | Статус |
|---|---|---|
| `index.html` | `20260925-rwd2` | sync |
| `product.html` | `20260925-rwd2` | sync; JS `?v=20260925-order-domain` |
| `catalog.html` | `20260925-rwd2` | sync |
| `delivery.html` | `20260925-rwd2` | sync |
| `price.html` | `20260925-rwd2` | sync |

Не витрина (не трогать в UI-спринтах без явной задачи): `admin/*`, `preview-*.html`, `test-*.html`, `check-remove-bg.html`, `_archive/**`.

## 2. Задача, которую решали прямо сейчас

**Тема:** боевой домен в тексте заказа (`orderMessage`) + аудит оформления заказов.

**Статус:** ссылка карточки → `https://vigsharm.ru/product.html?slug=…` в `main`.

## 3. Файлы, которые за это отвечают

| Файл | За что отвечает |
|---|---|
| `assets/product.js` | `orderMessage()`, WA/TG/MAX, форма заказа |
| `product.html` | кеш `product.js?v=` |
| `assets/site-marshmallow.css` | Канон витрины + responsive patches |
| `admin/styles.css` | Admin UI refresh |

## 0c. Footer parity + client contacts + sitemap.xml (25.09.2026, `?v=20260925-footer-parity`)

### Шаг 1 — Footer UI
- `.footer-phone` и `.footer-chat` теперь одинаково: `display:flex`, `min-height:48px`, `padding:10px 16px`, `gap:12px`, иконка 28×28px, работает на 320px+.
- Стили добавлены в конец `assets/site-marshmallow.css` (раздел «Footer contacts parity»).
- Кеш: `index.html` + `product.html` → `?v=20260925-footer-parity`.

### Шаг 2 — Контакты клиента в orderMessage()
- В `assets/product.js` → `orderMessage()` добавлен блок «Имя: …» + «Телефон: …» (только если поля заполнены).
- Кеш: `product.js?v=20260925-client-contacts`.

### Шаг 3 — sitemap.xml
- Файл `sitemap.xml` содержит 372 URL: 4 статических + 368 товаров (`/p/<slug>.html`).
- Скрипт-генератор: `scripts/generate_sitemap.py` (запускать при добавлении товаров).
- `robots.txt` уже содержал `Sitemap: https://vigsharm.ru/sitemap.xml` ✓
- Коммит: `3200600`.

## 4. Следующие шаги

1. Smoke на проде: карточка → заполнить имя/телефон → «Написать» — убедиться что имя и телефон присутствуют в тексте WhatsApp/Telegram.
2. При добавлении новых товаров — перезапустить `python scripts/generate_sitemap.py` и закоммитить обновлённый `sitemap.xml`.

## 5. Как проверять

1. `powershell -File scripts/start_dev_5500.ps1` из `C:\vigsharm-shop`.
2. Карточка → заполнить заказ → «Написать в мессенджер» — в тексте `Карточка: https://vigsharm.ru/product.html?slug=…`.
3. Ctrl+F5 после смены `?v=`.
4. После правок — commit + `git push origin main`.
