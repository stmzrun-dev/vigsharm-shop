# Sprint 2 — DNS и Worker Route для динамического Open Graph

Цель: `vigsharm.ru` остаётся на **GitHub Pages**, но трафик идёт через **Cloudflare** (оранжевое облако), а Worker `vigsharm-api` перехватывает только `product.html*` для ботов мессенджеров.

**Не меняйте NS, пока все записи ниже не созданы в Cloudflare и не проверены.**

---

## 0. Что уже есть у домена (снимок на 25.09.2026)

| Имя | Тип | Значение |
|-----|-----|----------|
| `vigsharm.ru` (apex) | **A** | `185.199.108.153` |
| `vigsharm.ru` (apex) | **A** | `185.199.109.153` |
| `vigsharm.ru` (apex) | **A** | `185.199.110.153` |
| `vigsharm.ru` (apex) | **A** | `185.199.111.153` |
| `www` | **CNAME** | `stmzrun-dev.github.io` |

Это стандартные адреса GitHub Pages. Их же переносим в Cloudflare.

---

## 1. Cloudflare — добавить сайт (ещё без смены NS)

1. Войдите на [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Add a site** → `vigsharm.ru` → план **Free**.
3. Cloudflare просканирует DNS — сверьте со таблицей выше.
4. **Пока не трогайте NS у регистратора.**

---

## 2. DNS в Cloudflare — точные записи

В **DNS → Records** должны быть (Proxy status = **Proxied**, оранжевое облако):

### Apex `vigsharm.ru`

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `185.199.108.153` | Proxied |
| A | `@` | `185.199.109.153` | Proxied |
| A | `@` | `185.199.110.153` | Proxied |
| A | `@` | `185.199.111.153` | Proxied |

Опционально (IPv6 GitHub Pages), тоже Proxied:

| Type | Name | Content |
|------|------|---------|
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

### `www`

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `www` | `stmzrun-dev.github.io` | Proxied |

Удалите дубликаты/лишнее, чего не было у регистратора (кроме того, что добавит сам Cloudflare для почты — MX/TXT не трогайте, если они уже есть).

---

## 3. Проверка до смены NS

В Cloudflare скопируйте назначенные NS (вида `xxx.ns.cloudflare.com`).

Пока NS ещё старые — сайт работает как раньше. Записи в CF уже готовы «в запас».

---

## 4. Смена NS у регистратора (Reg.ru / Beget / Timeweb / Ru-Center…)

1. Панель домена → DNS / Nameservers → **Custom NS**.
2. Вставьте **только** два NS от Cloudflare.
3. Сохраните. Обычно 5–60 минут, иногда до 24 ч.
4. Проверка: `https://vigsharm.ru/` и `https://vigsharm.ru/product.html?slug=zolotaya-data` открываются. В DevTools → Network у ответа должен появиться заголовок вроде `cf-ray` (трафик через Cloudflare).

---

## 5. Worker Route (после того как домен «оранжевый»)

1. **Workers & Pages** → `vigsharm-api` → **Settings** → **Domains & Routes** → **Add** → **Route**.
2. Pattern:

```text
vigsharm.ru/product.html*
```

3. Zone: `vigsharm.ru`.
4. Сохраните.

(Опционально то же для `www.vigsharm.ru/product.html*`, если люди ходят через www.)

Задеплойте Worker с OG-кодом:

```powershell
cd C:\vigsharm-shop\worker
npx wrangler deploy
```

---

## 6. Приёмка OG

```powershell
# Как бот WhatsApp — должны быть название, цена, фото товара
curl.exe -sA "WhatsApp/2.0" "https://vigsharm.ru/product.html?slug=zolotaya-data" | findstr /i "og:title og:image og:description"

# Как браузер — X-Vig-OG: passthrough (без ожидания D1 на критическом пути бота)
curl.exe -sI -A "Mozilla/5.0" "https://vigsharm.ru/product.html?slug=zolotaya-data"
```

Дополнительно: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — «Scrape Again» по URL карточки.

---

## 7. Если сайт «крутится» / без CSS (после включения прокси)

1. **Workers Routes** → удалите `product.html*` (сайт должен ожить на GitHub).
2. DNS → все A и `www` → **DNS only** (серое облако), пока чините.
3. **SSL/TLS** → Overview → режим **Full** или **Full (strict)** (не Flexible).
4. Задеплойте свежий Worker (`npx wrangler deploy`) — люди получают HTML с `<base>` на github.io.
5. Снова **оранжевые** облака на A/`www`.
6. Снова Route `vigsharm.ru/product.html*` → `vigsharm-api`.
7. Проверка: главная + карточка в инкогнито; curl с `WhatsApp/2.0` для OG.

**Важно:** при **серых** облаках Worker Route **не выполняется** (трафик мимо CF). Для OG нужны **Proxied** + Route.

---

## Откат

1. Уберите Worker Route `product.html*`.
2. Или верните NS регистратора на прежние (GitHub / регистратор).
3. Сайт снова будет как до Sprint 2; код Worker можно оставить — без route он не перехватывает витрину.
