# HANDOFF — Vigsharm

_Последнее обновление: 25 сентября 2026, ~01:10 (UTC+3). Ветка `main`._

Этот файл — выжимка для следующего агента/сессии, чтобы не гонять контекст заново. Общие правила проекта — в `AGENTS.md`, дизайн-токены — в `DESIGN.md`. Здесь только: что сделано, над чем шла работа прямо сейчас, какие файлы трогать и что осталось.

## 0a. Admin UI refresh — завершён (`?v=20260925-admin-final`)

CSS-first редизайн админки без смены Studio/AI/фото JS.
- Phase 1–2: tokens, список SaaS / mobile cards
- Phase 3: editor dropzone, gallery controls, busy glass, action dock, wizard tabs
- Phase 4: AI review overlay hierarchy, chip grids, sticky footer CTA
- Phase 5: header scroll-tabs + coral active, settings `<details>` folds
- Файлы: `admin/styles.css`, `admin/index.html`
- Регресс: list → create DnD → Master → AI review → publish/draft; settings save
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

**Правило каскада:** новые правки витрины класть в конец `assets/site-marshmallow.css` (последний в `<head>`), не плодить четвёртый override. JS-логику заказа не трогали.

## 1. Статус сайта

- Прод: https://stmzrun-dev.github.io/vigsharm-shop/index.html — деплоится через `.github/workflows/pages.yml` **только с push в `main`**.
- Локальный превью-сервер — **не** `python -m http.server`, а `python scripts/_dev_server_5500.py` (см. `AGENTS.md`).

### Публичные страницы витрины (охватывать адаптивностью)
| Страница | CSS marshmallow `?v=` | Статус |
|---|---|---|
| `index.html` | `20260925-rwd2` | sync |
| `product.html` | `20260925-rwd2` | sync |
| `catalog.html` | `20260925-rwd2` | sync |
| `delivery.html` | `20260925-rwd2` | sync |
| `price.html` | `20260925-rwd2` | sync |

Доп. в `site-marshmallow.css` (rwd2): Patch C — wrap `.price-jump` на ≤360; focus-hide sticky через `.client-ins:focus-within` (+ contact/config-input); date-picker hide — descendant (не `~`).

Не витрина (не трогать в UI-спринтах без явной задачи): `admin/*`, `preview-*.html`, `test-*.html`, `check-remove-bg.html`, `_archive/**`.

### Что уже сделано ранее (кратко)
1. Мобильная форма заказа на `product.html` (прогрессивные шаги, `is-order-ready`) — `product.js` / `product-polish.css`.
2. Soft-3d иконки меню (`icons/menu-*.png`) + увеличенные иконки звонка/чата в футере.
3. UI-polish главной и карточки товара — см. §0 выше.
4. Responsive 320/landscape sticky — см. §0 выше.

## 2. Задача, которую решали прямо сейчас

**Тема:** responsive patch sticky bar (320 + landscape) + аудит всех публичных HTML на `?v=` и адаптив.

**Статус:** patch в `main` (`2f748f7`). Аудит страниц — следующий шаг в чате / §4.

## 3. Файлы, которые за это отвечают

| Файл | За что отвечает |
|---|---|
| `assets/site-marshmallow.css` | Канон витрины + Phase 1–5 / A–C + responsive 320/landscape patches в конце |
| `assets/home-polish.css` | Layout главной; surface карточек не дублировать |
| `assets/product-polish.css` | Layout/форма product; fill CTA / lilac steps — не дублировать |
| `assets/home.js` | Шаблон popular: `.live-product-price-row` |
| `assets/product.js` | Рендер галереи / цены / sticky bar (логика заказа без изменений в UI-спринте) |
| `index.html`, `product.html` | `?v=20260925-rwd` на polish + marshmallow |
| `catalog.html`, `price.html`, `delivery.html` | те же стили marshmallow, но `?v=` ещё старые — выровнять |
| `.github/workflows/pages.yml` | Деплой Pages с `main` |

## 4. Следующие шаги

1. Smoke-check Pages после push: `/price` на 320 (jump chips wrap), `/product` landscape + focus в input (sticky скрывается).
2. Старый долг (не блокер): паритет карточек «Позвонить» / «Написать» в футере; Telegram в соцкнопках.
3. В working tree могут лежать **незакоммиченные** правки Studio Pro (gender/palette) — отдельно от UI; коммитить только по явной просьбе.

## 5. Как проверять

1. `powershell -File scripts/start_dev_5500.ps1` из `C:\vigsharm-shop`.
2. Chrome/Edge: `http://127.0.0.1:5500/` и `/product?slug=…` на 320 / 375 / landscape.
3. Ctrl+F5 после смены `?v=`.
4. После правок — commit + `git push origin main` (Pages только с `main`).
