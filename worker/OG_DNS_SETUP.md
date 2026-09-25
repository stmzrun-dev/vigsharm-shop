# Open Graph / DNS — статус (25.09.2026)

## Сейчас

| Тема | Статус |
|------|--------|
| Витрина | Серые облака CF → GitHub Pages. **Без VPN открылось: да** |
| Worker Route `product.html*` | **Не использовать** (оранжевый CF ломал доступ) |
| **OG План Б** | Статика `p/<slug>.html` при деплое Pages (`scripts/generate-og-pages.mjs`) |

### Как работает OG

1. CI (`pages.yml`) перед деплоем: `node scripts/generate-og-pages.mjs`
2. Из `data/products.json` → `p/<slug>.html` с `og:title` / `og:image` / `og:description`
3. В тексте заказа в мессенджер: `https://vigsharm.ru/p/<slug>.html`
4. Боты читают OG; люди получают JS-редирект на `product.html?slug=…`

Локально: `node scripts/generate-og-pages.mjs` (папка `p/` в `.gitignore`).

Проверка после деплоя:

```powershell
curl.exe -sA "WhatsApp/2.0" "https://vigsharm.ru/p/koshkin-dom.html" | findstr /i "og:title og:image og:description"
```

---

## План Б — детали

Без оранжевого Cloudflare. Мессенджеры видят готовый HTML на GitHub Pages.

---

## Архив: Sprint 2 (оранжевый CF + Worker) — не использовать

Proxied DNS + Worker Route на `product.html*` — откатили из‑за доступа из РФ. Не включать, пока витрина важнее edge-OG.
