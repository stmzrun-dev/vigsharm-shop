// VigSharm API — Cloudflare Worker
// Хранит ключ NordRouter, проксирует запросы, управляет D1 + R2

// VigSharm API — Cloudflare Worker
// Хранит ключ NordRouter, проксирует запросы, управляет D1 + R2

/** Текущий request для CORS (file:// → Origin: null) */
let _corsRequest = null;

export default {
  async fetch(request, env) {
    _corsRequest = request;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS (в т.ч. file:// → Origin: null)
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Публичное чтение каталога — доступно витрине без авторизации.
      // Всё остальное (создание/изменение/удаление товаров, загрузка фото,
      // ИИ-генерация, Studio Pro) требует заголовок Authorization: Bearer <ADMIN_API_KEY>.
      const isPublicRead = method === 'GET' && (
        path === '/api/products' || /^\/api\/products\/[^/]+$/.test(path)
      );
      if (!isPublicRead) {
        const authHeader = request.headers.get('Authorization') || '';
        const expected = 'Bearer ' + (env.ADMIN_API_KEY || '');
        if (!env.ADMIN_API_KEY || authHeader !== expected) {
          return json({ ok: false, error: 'Unauthorized' }, 401);
        }
      }

      // Router
      if (path === '/api/ai/generate-card' && method === 'POST')
        return handleGenerateCard(request, env);
      if (path === '/api/ai/suggest-category' && method === 'POST')
        return handleSuggestCategory(request, env);
      if (path === '/api/studio/process' && method === 'POST')
        return handleStudioProcess(request, env);
      if (path === '/api/studio/rephotograph' && method === 'POST')
        return handleStudioRephotograph(request, env);
      if (path === '/api/studio/enhance' && method === 'POST')
        return handleStudioEnhance(request, env);
      if (path === '/api/studio/restore' && method === 'POST')
        return handleStudioRestore(request, env);
      if (path === '/api/studio/upscale' && method === 'POST')
        return handleStudioUpscale(request, env);
      if (path === '/api/studio/sign-text' && method === 'POST')
        return handleStudioSignText(request, env);
      if (path === '/api/studio/sign-detect' && method === 'POST')
        return handleStudioSignDetect(request, env);
      if (path.startsWith('/api/studio/status/') && method === 'GET')
        return handleStudioStatus(path, env);
      if (path === '/api/studio/upload' && method === 'POST')
        return handleStudioUpload(request, env);
      if (path === '/api/studio/generate-reference' && method === 'POST')
        return handleGenerateReference(request, env);
      if (path === '/api/products' && method === 'GET')
        return handleGetProducts(env);
      if (path.match(/^\/api\/products\/[^/]+$/) && method === 'GET')
        return handleGetProduct(path, env);
      if (path === '/api/products' && method === 'POST')
        return handleCreateProduct(request, env);
      if (path.match(/^\/api\/products\/[^/]+$/) && method === 'PUT')
        return handleUpdateProduct(path, request, env);
      if (path.match(/^\/api\/products\/[^/]+$/) && method === 'DELETE')
        return handleDeleteProduct(path, env);
      if (path.match(/^\/api\/products\/[^/]+\/status$/) && method === 'PATCH')
        return handleToggleStatus(path, request, env);
      if (path === '/api/upload/photo' && method === 'POST')
        return handleUploadPhoto(request, env);
      if (path.match(/^\/api\/upload\/photo\/[^/]+$/) && method === 'DELETE')
        return handleDeletePhoto(path, env);

      return json({ ok: false, error: 'Not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ ok: false, error: e.message }, 500);
    }
  }
};

// ─── CORS ────────────────────────────────────────────────

function corsHeaders() {
  const origin = _corsRequest?.headers?.get('Origin');
  // Chrome: для file:// Origin === "null", нельзя отвечать "*"
  let allowOrigin = '*';
  if (origin === 'null') allowOrigin = 'null';
  else if (origin) allowOrigin = origin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

/** Chunked base64 — avoids O(n²) string concat that kills Worker CPU on 2K images */
function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

// ─── NordRouter ──────────────────────────────────────────

async function nordRequest(endpoint, method, body, env) {
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch('https://nordrouter.com' + endpoint, opts);
  
  const responseText = await resp.text();
  
  if (!resp.ok) {
    console.error('[NordRouter] HTTP ERROR', {
      endpoint,
      status: resp.status,
      body: responseText
    });
    throw new Error(`NordRouter HTTP ${resp.status}: ${responseText}`);
  }
  
  return JSON.parse(responseText);
}

async function nordUpload(file, env) {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch('https://nordrouter.com/media/upload', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY },
    body: form
  });
  return resp.json();
}

// ─── AI: Generate Card ───────────────────────────────────

const CARD_CATEGORIES = [
  'Для девочки', 'Для мальчика', 'Для неё', 'Для мамы', 'Для него', 'Геймерам',
  'Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник',
  'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября',
  'Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров',
  'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров',
  'Шары поштучно'
];

/** Основная категория карточки — аудитория / явный повод (не тип изделия) */
const AUDIENCE_CATEGORIES = [
  'Для девочки', 'Для мальчика', 'Для неё', 'Для мамы', 'Для него', 'Геймерам',
  'Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник',
  'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'
];

const TYPE_TAGS = [
  'Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров',
  'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров',
  'Шары поштучно'
];

/** Пока не ставим на карточки — отдельный раздел позже */
const DEFERRED_TYPE_TAGS = ['Шар-сюрприз'];

const HOLIDAY_CATEGORIES = [
  'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'
];

/** Тематики в скобках состава: аудитория / повод / праздник */
const THEME_CATEGORIES = [...AUDIENCE_CATEGORIES];

const CARD_TAGS = [...AUDIENCE_CATEGORIES, ...TYPE_TAGS];

function normalizeHolidayKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchHolidayCategory(raw) {
  const key = normalizeHolidayKey(raw);
  if (!key) return null;
  const aliases = {
    '1 сентября': '1 сентября',
    '1сентября': '1 сентября',
    '1 сент': '1 сентября',
    'первое сентября': '1 сентября',
    'новый год': 'Новый год',
    'новогод': 'Новый год',
    'нг': 'Новый год',
    '14 февраля': '14 февраля',
    '14февраля': '14 февраля',
    'валентин': '14 февраля',
    '23 февраля': '23 февраля',
    '23февраля': '23 февраля',
    '8 марта': '8 марта',
    '8марта': '8 марта',
    'выпускной': 'Выпускной',
    'для нее': 'Для неё',
    'для него': 'Для него',
    'для девочки': 'Для девочки',
    'для мальчика': 'Для мальчика',
    'для мамы': 'Для мамы',
    'на выписку': 'На выписку',
    'выписка': 'На выписку',
    'выписку': 'На выписку',
    'из роддома': 'На выписку',
    'роддом': 'На выписку'
  };
  for (const [alias, canon] of Object.entries(aliases)) {
    if (key === alias || key.includes(alias)) return canon;
  }
  for (const h of THEME_CATEGORIES) {
    const hk = normalizeHolidayKey(h);
    if (key === hk || key.includes(hk) || hk.includes(key)) return h;
  }
  return null;
}

/** Всё в скобках — подсказки (не состав). Спец: тематика → holiday; (цифра) снимается. */
function parseCompositionHolidayMeta(text) {
  const src = String(text || '');
  let holiday = null;
  const hints = [];
  const clean = src.replace(/\(([^)]{1,80})\)/g, (full, inner) => {
    const raw = String(inner || '').trim();
    if (!raw) return ' ';
    hints.push(raw);
    const hit = matchHolidayCategory(inner);
    if (hit) holiday = hit;
    return ' ';
  })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { holiday, hints, cleanText: clean };
}

function applyHolidayOnlyCard(data, holiday) {
  if (!holiday) return data;
  data.category = holiday;
  data.character = '';
  data.character_alts = [];
  data.character_confidence = '';
  data.age_group = '';
  data.occasion = '';
  data.target_audience = '';
  data.series_name = '';
  data.series_alts = [];
  data.series_confidence = '';
  data.ask_character = false;
  // Доп. разделы: только тематика
  data.tags = [holiday];
  data.holiday_only = holiday;
  return data;
}

function applyTypeOnlyCard(data, typeTag) {
  data.category = typeTag;
  data.tags = [typeTag];
  // Букет/фигуры — без аудитории в полях. Фотозона — аудиторию/повод/возраст сохраняем.
  if (typeTag !== 'Фотозона') {
    data.target_audience = '';
    data.occasion = '';
  }
  return data;
}

function compositionLooksLikeBouquet(text) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (!t) return false;
  if (/крафтов/.test(t)) return false;
  if (/цвет\w*\s+из\s+шар/.test(t)) return false;
  return /букет/.test(t);
}

function compositionLooksLikeBalloonFigure(text) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (!t) return false;
  if (/фольг\w*\s+фигур/.test(t)) return false;
  return /фигур[аыуе]?(?:\s+\w+){0,2}\s+из\s+шар/.test(t)
    || /скрутк\w*\s+из\s+шар/.test(t);
}

const GENERIC_OCCASIONS = new Set([
  'день рождения', 'др', 'birthday', 'праздник', 'любой повод', 'без повода'
]);

function sceneTypeHint(scene) {
  switch (scene) {
    case 'unit_balloon': return 'Шары поштучно';
    case 'photozone': return 'Фотозона';
    case 'handheld_bouquet': return 'Букет из шаров';
    // wall_only: foil-герой / бабл / фонтан — НЕ «Фигуры из шаров» (это скрутки на полу)
    case 'wall_only': return 'Букет из шаров';
    case 'floor': return 'Напольные композиции';
    case 'balloon_figures': return 'Фигуры из шаров';
    default: return '';
  }
}

function budgetFromPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1000) return 'до 1 000 ₽';
  if (n < 2000) return '1 000–2 000 ₽';
  if (n < 3500) return '2 000–3 500 ₽';
  if (n < 5000) return '3 500–5 000 ₽';
  if (n < 8000) return '5 000–8 000 ₽';
  return 'от 8 000 ₽';
}

const BUDGET_OPTIONS = [
  'до 1 000 ₽',
  '1 000–2 000 ₽',
  '2 000–3 500 ₽',
  '3 500–5 000 ₽',
  '5 000–8 000 ₽',
  'от 8 000 ₽'
];

async function handleGenerateCard(request, env) {
  const body = await request.json();
  const {
    title_hint,
    description,
    scene,
    image_url,
    price,
    composition_raw,
    composition_hints,
    existing_titles,
    holiday_only
  } = body;
  const rawIn = String(composition_raw || description || '').trim();
  const holidayMeta = parseCompositionHolidayMeta(rawIn);
  const holidayOnly = matchHolidayCategory(holiday_only) || holidayMeta.holiday || null;
  const rawComposition = holidayMeta.cleanText || rawIn;
  const hintsFromBody = Array.isArray(composition_hints)
    ? composition_hints.map((h) => String(h || '').trim()).filter(Boolean)
    : [];
  const compositionHints = [...new Set([...(holidayMeta.hints || []), ...hintsFromBody])];
  const typeHint = sceneTypeHint(scene || 'floor');
  const priceNum = Number(price) || 0;
  const takenTitles = normalizeExistingTitlesList(existing_titles);

  const hintsBlock = compositionHints.length
    ? `Подсказки оператора (из скобок в составе — НЕ пункты состава, учти при category/audience/occasion/age/опциях):\n${compositionHints.map((h) => `• ${h}`).join('\n')}`
    : '';

  const holidayRule = holidayOnly
    ? `
ТЕМАТИЧЕСКАЯ КАРТОЧКА (метка в скобках уже снята из состава; правило для ЛЮБОЙ сцены): category = РОВНО «${holidayOnly}».
- НЕ заполняй character, age_group, target_audience, series_name, occasion (оставь пустыми)
- tags: ТОЛЬКО «${holidayOnly}» — без type-тегов («Букет из шаров», «Фигуры…» и т.п.), без других разделов
- composition: БЕЗ скобок и БЕЗ текста тематики — только физический состав шаров`
    : '';

  const bouquetOnly = !holidayOnly && (
    (scene || '') === 'handheld_bouquet'
    || compositionLooksLikeBouquet(rawComposition)
  );
  const figuresOnly = !holidayOnly && !bouquetOnly && (
    (scene || '') === 'balloon_figures'
    || compositionLooksLikeBalloonFigure(rawComposition)
  );
  const photozoneOnly = !holidayOnly && !bouquetOnly && !figuresOnly && (scene || '') === 'photozone';

  const bouquetRule = bouquetOnly
    ? `
БУКЕТ ИЗ ШАРОВ (без тематики в скобках): category = РОВНО «Букет из шаров».
- tags: ТОЛЬКО «Букет из шаров» — БЕЗ «Для неё/него/девочки/мальчика» и прочих аудиторий/поводов
- target_audience и occasion оставь пустыми`
    : '';
  const figuresRule = figuresOnly
    ? `
ФИГУРА ИЗ ШАРОВ (скрутка; без тематики в скобках): category = РОВНО «Фигуры из шаров».
- tags: ТОЛЬКО «Фигуры из шаров» — БЕЗ «Для неё/него/девочки/мальчика» и прочих аудиторий/поводов
- target_audience и occasion оставь пустыми`
    : '';
  const photozoneRule = photozoneOnly
    ? `
ФОТОЗОНА (без тематики в скобках): category = РОВНО «Фотозона».
- tags: ТОЛЬКО «Фотозона» (пол/повод не дублируй в tags)
- ОБЯЗАТЕЛЬНО заполни age_group по фото (дети/малыши/…)
- ОБЯЗАТЕЛЬНО заполни target_audience (Для мальчика / Для девочки / …) по имени, цветам, герою
- ОБЯЗАТЕЛЬНО заполни occasion узким поводом (НЕ «День рождения») — например по надписи на круге; если только ДР ребёнка — оставь occasion пустым, но age_group = «Для детей»
- character / series_name — по герою на фото (Человек-паук и т.п.)`
    : '';

  const systemPrompt = `Ты — копирайтер каталога VigSharm (воздушные шары, Армавир).
Пиши коротко. Без маркетинговой воды и эмодзи.
Верни ТОЛЬКО валидный JSON.

Структура JSON:
{
  "title": "Крючковое название 1–4 слова. НЕ описание фото",
  "title_alts": ["запасной крючок 1", "запасной крючок 2"],
  "short_description": "Одно предложение по фото (макс 110)",
  "full_description": "1–2 предложения: что на фото. Без «заказать»",
  "composition": ["оформленный пункт 1", "пункт 2"],
  "category": "ОДНА аудитория/повод из списка AUDIENCE",
  "character": "имя героя с фото или пустая строка",
  "character_alts": ["запасной персонаж 1", "запасной персонаж 2"],
  "character_confidence": "high|medium|low",
  "age_group": "Для малышей|Для детей|Для подростков|Для взрослых|Для любого возраста",
  "occasion": "только ЯВНЫЙ узкий повод или пустая строка",
  "target_audience": "Для мальчика / Для девочки / …",
  "series_name": "тематическая серия/франшиза если видна или пустая строка",
  "series_alts": ["запасная серия 1"],
  "series_confidence": "high|medium|low",
  "budget": "РОВНО одно значение из BUDGET",
  "seo_title": "SEO макс 70, можно «Армавир»",
  "seo_description": "SEO макс 155",
  "slug": "url-slug-latin",
  "tags": ["1–4 тега из списка"]
}

AUDIENCE (поле category):
${AUDIENCE_CATEGORIES.join(', ')}

TYPE (только tags, НЕ category):
${TYPE_TAGS.filter((t) => !DEFERRED_TYPE_TAGS.includes(t)).join(', ')}

BUDGET (ровно одно):
${BUDGET_OPTIONS.join(' | ')}

НАЗВАНИЯ — критично:
- Стиль эталона: «Герой Готэма», «Тёмный рыцарь», «Качок», «Готик-шифр», «Выше облаков», «Большая прогулка»
- Это бренд-крючок / настроение / шутка / метафора — НЕ перечень того, что на фото
- ЗАПРЕЩЕНО: «Набор с…», «Композиция …», «… с зайчиком», «… на крестины», «Фонтан из шаров…», просто имя героя одним словом без крючка
- Персонаж и повод — в character / category / tags, не в title
- title_alts: ещё 1–2 крючка в том же духе, не пересказ состава
- УНИКАЛЬНОСТЬ: title и title_alts НЕ должны совпадать и НЕ должны быть похожи на уже занятые названия каталога (другой порядок слов, синоним-близнец, «почти то же» — тоже запрещены). Придумай свежие крючки.
- ЦИФРА НА ФОТО (1, 2, 6… на фольге) — это ПРИМЕР. Клиент выберет любую цифру 0–9.
  • ЗАПРЕЩЕНО в title и title_alts любая привязка к конкретной цифре или возрасту:
    «шестилетка», «на 6 лет», «Модный шестой», «Стильная шестёрка», «1 годик», «пятёрка», цифры 0–9 в тексте и т.п.
  • Крючок про героя / стиль / настроение (LOL, дива, модница) — БЕЗ числа и возраста

ПРОЧИЕ ПРАВИЛА:
- category = ОДНА главная полка из AUDIENCE (аудитория ИЛИ явный повод), НЕ тип изделия
- ПРИОРИТЕТ category (важнее цвета и пола):
  1) «На выписку» — если на фото/в тексте признаки выписки из роддома: бабл/таблица с датой+временем+весом (гр)+ростом (см), следы ножек, «Добро пожаловать домой», «выписка», «из роддома», метрики новорождённого. Розовый/голубой и имя малыша НЕ отменяют выписку: category = «На выписку»; пол можно в tags («Для девочки»/«Для мальчика»), не вместо category
  2) Узкий повод из списка (Крещение, Гендер-пати, 1 годик, Юбилей…) — если явно виден
  3) Иначе аудитория по стилю (Для девочки / мальчика / неё / него…)
- тип изделия — только в tags
- ЗАПРЕЩЕНО: тег и категория «Шар-сюрприз» — раздел пока не используется, не ставь никуда
- «Фигуры из шаров» — ТОЛЬКО скрутка/лепка из множества шаров, стоящая на полу. НЕ ставь этот тег для фольгированных персонажей (Пикачу, Гонщик, зайчик), баблов, фонтанов и букетов на стене
- ПЕРСОНАЖ И СЕРИЯ — критично, определяй по фото:
  • Смотри фигуры, принты, цвета, декор, паутину, логотипы, типичные сочетания
  • Примеры: красно-синие шары + паутина / звезда → character «Человек-паук», series_name «Человек-паук»
  • Миньоны, Единорог, LOL, Холодное сердце, Гонщик, Пикачу, Барби — по узнаваемым признакам
  • series_name = франшиза/тематика (Человек-паук, Marvel, Миньоны…), не «День рождения»
  • character = конкретный герой по-русски («Человек-паук», не Spider-Man), если героя нет — пустая строка
  • character_confidence / series_confidence: high если уверен, medium если вероятнее всего, low если сомневаешься
  • При medium/low ОБЯЗАТЕЛЬНО заполни character_alts / series_alts (2–3 варианта для выбора оператором)
  • При high тоже можно дать 1 alt, если есть близкий синоним
  • НЕ выдумывай героя без признаков на фото
  • Мишка/зайчик/сердце на выписке — НЕ character франшизы; character и series_name оставь пустыми
- age_group: ОБЯЗАТЕЛЬНО одно значение из списка по стилю фото/категории (выписка/1 годик → «Для малышей»; герои/цифры/для девочки|мальчика → «Для детей»; для неё/него/юбилей → «Для взрослых»). Не оставляй пустым; «Для любого возраста» — только если совсем неоднозначно
- occasion: ОБЯЗАТЕЛЬНО заполни узкий повод по фото/category (На выписку, Крещение, Гендер-пати, Юбилей, 1 годик, Свадьба и девичник, 8 марта…). ЗАПРЕЩЕНО «День рождения», «ДР», «праздник», «любой повод». Если category уже узкий повод — скопируй его в occasion. Если узкого повода нет — оставь пустым
- composition: оформи ТОЛЬКО сырой состав пользователя.
  • НЕ добавляй позиции, которых нет во входе
  • НЕ добавляй цвет (жёлтых/синих…), если пользователь цвет не написал → «5 латексных шаров», не «5 жёлтых шаров»
  • фольгированный персонаж: «фольгированная фигура Пикачу» — ок; это НЕ «фигура из шаров»
  • НЕ считай и НЕ дополняй с фото
  • НЕ включай в composition текст из скобок/подсказок оператора (пол, повод, «цифра», тематика) — это не пункты состава
  • КОРОБКА: если в составе есть «коробка» / «коробка-сюрприз» — оформи пункт так:
    «коробка 70x70x70 с индивидуальной надписью и декором»
    (если пользователь указал другой размер — сохрани его, напр. «коробка 60x60x60 с индивидуальной надписью и декором»)
  • ОРФОГРАФИЯ: исправь опечатки и ошибки в словах пользователя (падежи, «надписью», «звезда», «сердце», «баблс/бабл»), смысл и числа не меняй
- Во всех текстовых полях (title, descriptions, composition, seo): грамотный русский, без орфографических ошибок
- budget: только из BUDGET по цене пользователя
- НЕ возвращай article и price${holidayRule}${bouquetRule}${figuresRule}${photozoneRule}`;

  const takenBlock = takenTitles.length
    ? `Уже занятые названия в каталоге (НЕ предлагай эти и похожие):\n${takenTitles.slice(0, 80).map((t) => `• ${t}`).join('\n')}`
    : 'Занятых названий пока нет.';

  const userPrompt = `Сгенерируй карточку:
Подсказка названия: ${title_hint || 'не указано'}
Цена (₽): ${priceNum > 0 ? priceNum : 'не указана'}
Сырой состав от пользователя (оформи красиво, исправь орфографию, числа сохрани; скобки-подсказки уже убраны): ${rawComposition || 'не указан'}
${hintsBlock}
Сцена Studio Pro: ${scene || 'floor'}
Подсказка типа изделия для tags: ${typeHint || 'по фото'}
${holidayOnly ? `Праздничная/тематическая категория (обязательно): ${holidayOnly}` : ''}
${bouquetOnly ? 'Это букет из шаров без тематики в скобках — category и tags только «Букет из шаров».' : ''}
${figuresOnly ? 'Это фигура из шаров без тематики в скобках — category и tags только «Фигуры из шаров».' : ''}
${photozoneOnly ? 'Это фотозона без тематики в скобках — category и tags только «Фотозона».' : ''}
${takenBlock}
${image_url
    ? (holidayOnly || bouquetOnly || figuresOnly
      ? 'Фото приложено — опиши товар в short/full description. НЕ заполняй target_audience и occasion под другие разделы.'
      : (photozoneOnly
        ? 'Фото приложено — category/tags только «Фотозона». ОБЯЗАТЕЛЬНО заполни age_group, target_audience, character/series по фото. occasion — узкий повод без «День рождения». Имена/цифры на круге — пример персонализации, не в title.'
        : 'Фото приложено — ОБЯЗАТЕЛЬНО определи category (с приоритетом «На выписку» при метриках рождения / «добро пожаловать домой»), персонажа и тематическую серию по визуальным признакам. Если сомневаешься — confidence medium/low и дай alts. Логотипы магазинов игнорируй. Имена на табличке — пример персонализации, не в title; но дата+вес+рост / выписка → category «На выписку».'))
    : ''}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  if (image_url) {
    messages[1].content = [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: image_url } }
    ];
  }

  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'claude-sonnet-5',
    messages,
    temperature: 0.4,
    response_format: { type: 'json_object' }
  }, env);

  if (aiResp.error) {
    console.error('NordRouter API error:', aiResp.error);
    return json({ ok: false, error: 'NordRouter API ошибка: ' + (aiResp.error.message || JSON.stringify(aiResp.error)) });
  }

  const text = aiResp.choices?.[0]?.message?.content || '';
  if (!text) {
    return json({ ok: false, error: 'AI не вернул ответ' });
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'AI вернул некорректный JSON: ' + text.slice(0, 200) });
  }

  data = sanitizeCardMetadata(data, scene || 'floor', priceNum, rawComposition, takenTitles);
  if (holidayOnly) {
    applyHolidayOnlyCard(data, holidayOnly);
  } else if (bouquetOnly) {
    applyTypeOnlyCard(data, 'Букет из шаров');
  } else if (figuresOnly) {
    applyTypeOnlyCard(data, 'Фигуры из шаров');
  } else if (photozoneOnly) {
    applyTypeOnlyCard(data, 'Фотозона');
  } else {
    applyDischargeCategoryPriority(data, rawComposition);
  }
  // Убрать случайно оставшиеся скобки-подсказки из состава
  if (Array.isArray(data.composition)) {
    data.composition = data.composition
      .map((line) => parseCompositionHolidayMeta(line).cleanText)
      .filter(Boolean);
  }
  return json({ ok: true, data });
}

function looksLikeDischargeText(...parts) {
  const t = normalizeHolidayKey(parts.filter(Boolean).join(' '));
  if (!t) return false;
  if (/на выписку|выписк|из роддома|роддом|новорожден|новорожд|добро пожаловать домой|welcome home/.test(t)) {
    return true;
  }
  // Метрики рождения: вес + рост и/или дата+время рядом с гр/см
  const hasWeight = /\d{3,4}\s*(г|гр|грамм)/.test(t) || /\bвес\b/.test(t);
  const hasHeight = /\d{2}\s*(см|сантиметр)/.test(t) || /\bрост\b/.test(t);
  const hasBirthDate = /\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(t);
  const hasFootprints = /след(ы|ов)?\s*(ножек|малыша)|отпечатк\w*\s*ножек|footprint/.test(t);
  if ((hasWeight && hasHeight) || (hasBirthDate && (hasWeight || hasHeight)) || hasFootprints) {
    return true;
  }
  return false;
}

function applyDischargeCategoryPriority(data, rawComposition = '') {
  const blob = [
    rawComposition,
    data.title,
    data.short_description,
    data.full_description,
    data.occasion,
    data.seo_description,
    ...(Array.isArray(data.composition) ? data.composition : [])
  ].join(' ');
  if (!looksLikeDischargeText(blob)) return data;

  const prev = String(data.category || '').trim();
  data.category = 'На выписку';
  let tags = Array.isArray(data.tags) ? [...data.tags] : [];
  // Пол оставляем в тегах, если ИИ уже угадал
  if (prev === 'Для девочки' || prev === 'Для мальчика') {
    if (!tags.includes(prev)) tags.push(prev);
  }
  tags = tags.filter((t) => t !== 'На выписку');
  tags.unshift('На выписку');
  data.tags = [...new Set(tags)].slice(0, 5);
  if (!data.occasion || GENERIC_OCCASIONS.has(String(data.occasion).toLowerCase())) {
    data.occasion = 'На выписку';
  }
  if (!data.age_group || data.age_group === 'Для любого возраста') {
    data.age_group = 'Для малышей';
  }
  // Мягкие игрушки на выписке — не франшиза
  const ch = normalizeHolidayKey(data.character || '');
  if (/мишка|медвед|зайчик|зайка|сердечк/.test(ch)) {
    data.character = '';
    data.character_alts = [];
  }
  return data;
}

function sanitizeCompositionColors(lines, rawComposition) {
  const raw = String(rawComposition || '').toLowerCase();
  const colorRe = /жёлт\w*|желт\w*|син\w*|голуб\w*|роз\w*|красн\w*|зелён\w*|зелен\w*|фиолет\w*|оранж\w*|бел\w*|чёрн\w*|черн\w*|золот\w*|серебр\w*|хром\w*/gi;
  const rawHasColor = colorRe.test(raw);
  colorRe.lastIndex = 0;
  if (rawHasColor) return lines;

  return lines.map((line) => {
    let s = String(line || '');
    // «5 жёлтых шаров» → «5 латексных шаров»
    s = s.replace(
      /(\d+)\s+(?:жёлт\w*|желт\w*|син\w*|голуб\w*|роз\w*|красн\w*|зелён\w*|зелен\w*|фиолет\w*|оранж\w*|бел\w*|чёрн\w*|черн\w*|золот\w*|серебр\w*)\s+шаров/gi,
      '$1 латексных шаров'
    );
    // «жёлтых шаров» без числа → «латексных шаров»
    s = s.replace(
      /(?:жёлт\w*|желт\w*|син\w*|голуб\w*|роз\w*|красн\w*|зелён\w*|зелен\w*|фиолет\w*|оранж\w*)\s+шаров/gi,
      'латексных шаров'
    );
    return s.replace(/\s{2,}/g, ' ').trim();
  }).filter(Boolean);
}

/** «коробка» → «коробка 70x70x70 с индивидуальной надписью и декором» (размер сохраняем, если указан). */
function sanitizeCompositionBoxes(lines) {
  return (lines || []).map((line) => {
    const s = String(line || '').trim();
    if (!/коробк/i.test(s)) return s;
    const sizeM = s.match(/(\d+)\s*[xх×]\s*(\d+)\s*[xх×]\s*(\d+)/i);
    const size = sizeM ? `${sizeM[1]}x${sizeM[2]}x${sizeM[3]}` : '70x70x70';
    const countM = s.match(/^(\d+)\s+/);
    const count = countM ? `${countM[1]} ` : '';
    return `${count}коробка ${size} с индивидуальной надписью и декором`;
  }).filter(Boolean);
}

/** Названия не должны цепляться к цифре на фото — клиент меняет 0–9. */
function titleLocksToDigit(title) {
  const t = String(title || '').toLowerCase().replace(/ё/g, 'е');
  if (!t) return false;
  if (/\d/.test(t)) return true;
  if (/(^|[^а-я])(ноль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)([^а-я]|$)/.test(t)) return true;
  // шестилетка, модный шестой, стильная шестерка, пятерка… (\w не ловит кириллицу)
  if (/(нулев|перв|втор|трет|четверт|пят|шест|седьм|восьм|девят)[а-я]*?(летк|ерк|ый|ая|ое|ой|ому|ого)/.test(t)) return true;
  if (/годик/.test(t) || /на\s+\d+\s*лет/.test(t)) return true;
  return false;
}

function normalizeTitleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeExistingTitlesList(list) {
  const raw = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const t = String(item || '').trim();
    if (!t) continue;
    const key = normalizeTitleKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Точное совпадение или «почти то же» (общие слова / одно содержит другое). */
function titlesTooSimilar(a, b) {
  const na = normalizeTitleKey(a);
  const nb = normalizeTitleKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 6 && longer.includes(shorter) && shorter.length / longer.length >= 0.55) {
    return true;
  }

  const wa = na.split(' ').filter((w) => w.length > 1);
  const wb = nb.split(' ').filter((w) => w.length > 1);
  if (!wa.length || !wb.length) return false;
  if (wa.length === 1 && wb.length === 1) return wa[0] === wb[0];

  const setB = new Set(wb);
  let inter = 0;
  for (const w of wa) if (setB.has(w)) inter++;
  const union = wa.length + wb.length - inter;
  if (union > 0 && inter / union >= 0.75 && inter >= 2) return true;
  // Одинаковый набор слов в другом порядке
  if (wa.length === wb.length && inter === wa.length) return true;
  return false;
}

function titleCollidesWithTaken(title, takenTitles) {
  const t = String(title || '').trim();
  if (!t) return false;
  return (takenTitles || []).some((ex) => titlesTooSimilar(t, ex));
}

function sanitizeTitleAgainstDigitLock(data) {
  const charHint = String(data.character || data.series_name || '').trim();
  const fallback = charHint
    ? (charHint.length <= 24 ? charHint : charHint.slice(0, 24))
    : 'Яркий праздник';

  let pool = [data.title, ...(Array.isArray(data.title_alts) ? data.title_alts : [])]
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  pool = [...new Set(pool)];

  const good = pool.filter((t) => !titleLocksToDigit(t));
  if (good.length) {
    data.title = good[0];
    data.title_alts = good.slice(1, 3);
    return;
  }
  // Все варианты привязаны к цифре — сбрасываем крючок без числа
  data.title = fallback;
  data.title_alts = [];
}

/** Убрать title/alts, которые уже есть или похожи на каталог. */
function sanitizeTitleAgainstExisting(data, takenTitles = []) {
  if (!takenTitles.length) return;

  const charHint = String(data.character || data.series_name || '').trim();
  const fallbacks = [
    charHint,
    charHint ? `${charHint} стиль` : '',
    'Яркий акцент',
    'Праздничный вайб',
    'Цветной момент'
  ].map((t) => String(t || '').trim()).filter(Boolean);

  let pool = [data.title, ...(Array.isArray(data.title_alts) ? data.title_alts : [])]
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  pool = [...new Set(pool)];

  const free = pool.filter((t) => !titleCollidesWithTaken(t, takenTitles));
  if (free.length) {
    data.title = free[0];
    data.title_alts = free.slice(1, 3).filter((t) => !titlesTooSimilar(t, data.title));
    return;
  }

  const rescue = fallbacks.find((t) => !titleCollidesWithTaken(t, takenTitles) && !titleLocksToDigit(t));
  data.title = rescue || '';
  data.title_alts = [];
  if (!data.title) data.ask_title = true;
}

function sanitizeCardMetadata(data, scene = 'floor', price = 0, rawComposition = '', takenTitles = []) {
  const stripEmoji = (s) => String(s || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const fields = [
    'title', 'short_description', 'full_description',
    'seo_title', 'seo_description', 'character', 'slug',
    'age_group', 'occasion', 'target_audience', 'series_name', 'budget'
  ];
  for (const key of fields) {
    if (data[key] != null) data[key] = stripEmoji(data[key]);
  }

  let alts = Array.isArray(data.title_alts) ? data.title_alts : [];
  if (!alts.length && data.title_alt) alts = [data.title_alt];
  data.title_alts = alts.map(stripEmoji).filter(Boolean)
    .filter((t) => t.toLowerCase() !== String(data.title || '').toLowerCase())
    .slice(0, 2);

  sanitizeTitleAgainstDigitLock(data);
  sanitizeTitleAgainstExisting(data, takenTitles);

  const normAlts = (list, primary) => {
    const main = String(primary || '').trim().toLowerCase();
    return (Array.isArray(list) ? list : [])
      .map(stripEmoji)
      .filter(Boolean)
      .filter((t) => t.toLowerCase() !== main)
      .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
      .slice(0, 3);
  };
  data.character_alts = normAlts(data.character_alts, data.character);
  data.series_alts = normAlts(data.series_alts, data.series_name);

  const normConf = (v) => {
    const c = String(v || '').toLowerCase();
    return c === 'high' || c === 'medium' || c === 'low' ? c : '';
  };
  data.character_confidence = normConf(data.character_confidence)
    || (data.character_alts.length ? 'medium' : (data.character ? 'high' : ''));
  data.series_confidence = normConf(data.series_confidence)
    || (data.series_alts.length ? 'medium' : (data.series_name ? 'high' : ''));
  data.ask_character = data.character_confidence === 'medium' || data.character_confidence === 'low'
    || data.series_confidence === 'medium' || data.series_confidence === 'low';

  if (Array.isArray(data.composition)) {
    data.composition = data.composition.map(stripEmoji).filter(Boolean);
  } else if (typeof data.composition === 'string') {
    data.composition = data.composition.split(/\n|•|;/).map(stripEmoji).filter(Boolean);
  } else {
    data.composition = [];
  }
  if (!data.composition.length && rawComposition) {
    data.composition = rawComposition.split(/[\n,;]+/).map(stripEmoji).filter(Boolean);
  }

  delete data.article;
  delete data.price;
  delete data.client_options;

  const tagSet = new Set(CARD_TAGS);
  let tags = Array.isArray(data.tags) ? data.tags.map(stripEmoji).filter((t) => tagSet.has(t)) : [];

  let category = stripEmoji(data.category);
  if (TYPE_TAGS.includes(category)) {
    if (!tags.includes(category)) tags.unshift(category);
    category = '';
  }
  if (!AUDIENCE_CATEGORIES.includes(category)) {
    const fromAudience = stripEmoji(data.target_audience);
    const hit = AUDIENCE_CATEGORIES.find((a) =>
      a === fromAudience || tags.includes(a) || (fromAudience && fromAudience.includes(a.replace(/^Для /, '')))
    );
    category = hit || AUDIENCE_CATEGORIES.find((a) => tags.includes(a)) || '';
  }
  data.category = category;

  const typeHint = sceneTypeHint(scene);
  // «Фигуры из шаров» — только со сцены balloon_figures (не навязывать с floor/wall)
  if (typeHint && !tags.includes(typeHint)) {
    if (typeHint !== 'Фигуры из шаров' || scene === 'balloon_figures') {
      tags.push(typeHint);
    }
  }
  // Фольга на стене / букет / поштучно — тег скруток запрещён
  if (['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene)) {
    tags = tags.filter((t) => t !== 'Фигуры из шаров');
  }
  // Отложенные разделы (пока без карточек)
  tags = tags.filter((t) => !DEFERRED_TYPE_TAGS.includes(t));
  if (DEFERRED_TYPE_TAGS.includes(category)) {
    category = AUDIENCE_CATEGORIES.find((a) => tags.includes(a)) || '';
  }
  if (category && !tags.includes(category)) tags.unshift(category);
  data.category = category;
  data.tags = [...new Set(tags)].slice(0, 5);

  // Состав: убрать цвет шаров, если в сыром тексте цвета не было
  if (Array.isArray(data.composition) && rawComposition) {
    data.composition = sanitizeCompositionColors(data.composition, rawComposition);
  }
  if (Array.isArray(data.composition)) {
    data.composition = sanitizeCompositionBoxes(data.composition);
  }

  const occ = String(data.occasion || '').toLowerCase();
  if (!data.occasion || GENERIC_OCCASIONS.has(occ)) {
    data.occasion = '';
  }
  // Если повод пуст, а category — узкий повод из списка, подставь category
  const occasionFromCategory = [
    'На выписку', 'Крещение', 'Гендер-пати', 'Юбилей', '1 годик', 'Свадьба и девичник',
    'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'
  ];
  if (!data.occasion && occasionFromCategory.includes(data.category)) {
    data.occasion = data.category;
  }

  if (!data.budget || !BUDGET_OPTIONS.includes(data.budget)) {
    data.budget = budgetFromPrice(price);
  }

  const ages = ['Для малышей', 'Для детей', 'Для подростков', 'Для взрослых', 'Для любого возраста'];
  if (data.age_group && !ages.includes(data.age_group)) {
    const low = data.age_group.toLowerCase();
    if (/малыш|0-3|ясел/.test(low)) data.age_group = 'Для малышей';
    else if (/подрост/.test(low)) data.age_group = 'Для подростков';
    else if (/взросл/.test(low)) data.age_group = 'Для взрослых';
    else if (/дет/.test(low)) data.age_group = 'Для детей';
    else data.age_group = '';
  }
  // Дозаполнение возраста по category, если ИИ оставил пусто / «любой»
  if (!data.age_group || data.age_group === 'Для любого возраста') {
    const cat = String(data.category || '');
    if (cat === 'На выписку' || cat === '1 годик' || cat === 'Крещение') data.age_group = 'Для малышей';
    else if (cat === 'Для девочки' || cat === 'Для мальчика' || cat === 'Гендер-пати' || cat === 'Фотозона') {
      data.age_group = 'Для детей';
    } else if (cat === 'Для неё' || cat === 'Для него' || cat === 'Для мамы' || cat === 'Юбилей' || cat === 'Свадьба и девичник') {
      data.age_group = 'Для взрослых';
    }
  }

  applyDischargeCategoryPriority(data, rawComposition);
  // Если категория всё ещё пуста — не подставляем «Для девочки» наугад
  if (!data.category) {
    const fromTags = (data.tags || []).find((t) => AUDIENCE_CATEGORIES.includes(t));
    data.category = fromTags || '';
  }

  return data;
}


// ─── AI: Suggest Category ────────────────────────────────

async function handleSuggestCategory(request, env) {
  const { description, title } = await request.json();

  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'claude-sonnet-5',
    messages: [
      {
        role: 'system',
        content: `Определи категорию и теги для карточки товара магазина шаров.
Верни ТОЛЬКО JSON: { "category": "...", "tags": ["..."] }
Категории: Для девочки, Для мальчика, Для неё, Для мамы, Для него, Геймерам, Юбилей, 1 годик, Крещение, Гендер-пати, На выписку, Свадьба и девичник, Выпускной, Новый год, 14 февраля, 23 февраля, 8 марта, 1 сентября, Фигуры из шаров, Напольные композиции, Букет из шаров, Цветы из шаров, Крафтовый букет, Коробка-сюрприз, Фотозона, Арка из шаров, Шары поштучно.
Приоритет: выписка/метрики рождения/«добро пожаловать домой» → category «На выписку» (пол — в tags). Не используй «Шар-сюрприз».`
      },
      { role: 'user', content: `Название: ${title}\nОписание: ${description}` }
    ],
    temperature: 0.2
  }, env);

  // Проверяем ошибки от NordRouter API
  if (aiResp.error) {
    console.error('NordRouter API error:', aiResp.error);
    return json({ ok: false, error: 'NordRouter API ошибка: ' + (aiResp.error.message || JSON.stringify(aiResp.error)) });
  }

  const text = aiResp.choices?.[0]?.message?.content || '';
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);
    return json({ ok: true, ...result });
  } catch {
    return json({ ok: false, error: 'AI error' });
  }
}

// ─── Studio Pro: Process (NEW FLOW - Remove BG + Canvas) ───────────────────

async function handleStudioProcess(request, env) {
  const { image_url, scene, prompt: userPrompt } = await request.json();
  
  // Validation: accept both data:image/... and https:// URLs
  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url parameter' }, 400);
  }
  
  const isDataUrl = image_url.startsWith('data:image/');
  const isHttpsUrl = image_url.startsWith('https://');
  
  if (!isDataUrl && !isHttpsUrl) {
    return json({ 
      ok: false, 
      error: 'Invalid image format. Expected data:image/... or https:// URL' 
    }, 400);
  }
  
  console.log('[Studio Pro NEW] ====== NEW REMOVE BG FLOW ======');
  console.log('[Studio Pro NEW] Input image type:', isDataUrl ? 'data-url' : 'cloudinary-url');
  console.log('[Studio Pro NEW] Input image URL:', isHttpsUrl ? image_url : `${image_url.substring(0, 50)}...`);
  console.log('[Studio Pro NEW] Scene:', scene);
  
  // NEW FLOW: Remove background only, no AI editing
  console.log('[Studio Pro NEW] Sending Remove BG request');
  console.log('[Studio Pro NEW] Model: image/recraft-remove-bg');
  
  const generateResp = await nordRequest('/media/generate', 'POST', {
    model: 'image/recraft-remove-bg',
    input: {
      image: image_url
    }
  }, env);

  console.log('[Studio Pro NEW] Remove BG job started', {
    job_id: generateResp.id,
    model: generateResp.model
  });

  if (generateResp.error) {
    return json({ 
      ok: false, 
      error: 'Ошибка Remove BG: ' + (generateResp.error.message || JSON.stringify(generateResp.error))
    }, 500);
  }

  if (!generateResp.id) {
    return json({ 
      ok: false, 
      error: 'NordRouter не вернул job_id: ' + JSON.stringify(generateResp)
    }, 500);
  }
  
  console.log('[Studio Pro NEW] ? Remove BG job created:', generateResp.id);
  console.log('[Studio Pro NEW] ? Returning job_id to frontend:', generateResp.id);
  
  return json({ 
    ok: true, 
    job_id: generateResp.id, 
    status: 'processing',
    scene: scene
  });
}

// ─── Studio Pro: Rephotograph (Manus-style: original + room reference → Master) ───────

function isWallOnlyScene(scene) {
  return ['wall_only', 'unit_balloon'].includes(scene);
}

function buildRephotographPrompt(scene, opts = {}) {
  const photozoneType = opts.photozone_type === 'easel' ? 'easel' : 'frame';
  const lock = `LOCKED — preserve without any change:
- entire original product; exact balloon count, shapes, sizes, colors, positions, overlaps, clustering density
- ALL decorative text that is PART OF THE PRODUCT PRINT on balloons (character art, foil prints, custom names/numbers meant to stay on the item) — copy exactly, never retype or autocorrect
- characters, foil figures, chrome/metallic surfaces, ribbons, knots, product stickers that belong to the item
- do NOT add, remove, redraw, densify, beautify, or “improve” any product element (except the ALLOWED EXCEPTION below)
- do NOT invent extra small filler balloons between larger ones; keep the original sparsity/density of every column and cluster
- when uncertain about a product print or balloon count, keep the original — do NOT guess or embellish`;

  const logoClean = `ALLOWED EXCEPTION — REMOVE supplier / marketplace packaging overlays and watermarks (critical for catalog photos, especially «шары поштучно» / unit balloons from Sima-land and similar):
REMOVE completely (inpaint as if never there):
- Corner and floating badges/boxes: brand logos (MARVEL, Disney, etc. as separate rectangular stickers on the photo), size labels («12" / 30 CM», «18"», diameter), usage labels («ДЛЯ ГЕЛИЯ И ВОЗДУХА», «для гелия», «воздух», helium/air icons)
- Marketplace / shop watermarks and URLs anywhere on the image: sima-land.ru, wildberries, ozon, sharomem.ru, sharomen.ru, Instagram/VK handles, translucent stamps, shop names, banners
- Small © copyright stamps and supplier URL text overlaid on or near balloons that are NOT part of the balloon's own printed design
- Any colored pill/rectangle with white text glued onto the catalog photo (packaging chrome), not printed into the latex/foil artwork
- Circular / round hang tags and brand discs on ribbons or wrap (shop logos like «МАИК», heart+name discs, cardboard circle tags, plastic logo badges dangling from the bouquet)
Inpaint the wall / balloon / ribbon surface underneath cleanly — no blur blotches, no leftover letters or half a circle.
KEEP: Spider-Man / character art printed ON the balloon latex or foil; decorative words that are clearly part of that print (e.g. «HERO» baked into the balloon design); bubble lettering and custom personalization on the product itself; foil heart texts that are printed ON the balloon face.`;

  const forbidden = `FORBIDDEN: sticker/cutout appearance, white or dark halo, invented text, changed colors, plastic CGI look, furniture, window, curtains from the original room, melting ribbons, harsh cast shadows, yellow/orange color cast, duplicate objects, collage, dark moody look, evening lighting, underexposure, extra balloons, denser balloon columns than the original, new mini filler balloons, new foreground balloon clusters, objects not present in the original, store watermarks, supplier packaging badges, size/helium labels, marketplace URL overlays (sima-land.ru etc.), leftover half-erased text, circular shop hang-tags on ribbons`;

  const light = `LIGHTING: soft even professional studio product photography. Remove harsh window backlight. Match exposure and white balance to the studio room. Real photograph, not CGI render.`;

  const brightLight = `LIGHTING — NATURAL CATALOG DAYLIGHT (critical):
- Well-lit professional catalog photo — clear and clean, NOT dark, NOT evening, NOT underexposed
- Soft daylight / softbox look — NATURAL brightness, not overexposed high-key wash
- Do NOT blow out whites: white balloons, white signs, pale wall stay detailed (no clipped highlights)
- Neutral white balance; wall reads as warm light beige-grey (like the reference), not blown pure white
- Soft diffuse light; gentle contact shadows OK — no dramatic cinematic grade, no muddy underexposure`;

  const brightFloor = `FLOOR LUMINANCE — CRITICAL (catalog floors go too dark OR too washed):
- Laminate MUST match the SECOND reference floor — LIGHT pale oak / light grey-beige planks
- Floor brightness ≈ reference (not darker charcoal, not glowing white wash)
- FORBIDDEN: dark brown, walnut, charcoal, muddy grey, cool slate laminate
- Soft contact shadow only under product contact points — no large dark wash across the floor
- Do NOT copy dark floor tones from the source photo; replace with the reference laminate`;

  const nearWall = `PLACEMENT — CLOSE TO THE WALL (move as a RIGID photo — do not rebuild):
- Translate the WHOLE original product closer to the white baseboard as one locked unit (same internal layout)
- Only a SHORT strip of laminate between product base and baseboard (about 1–3 plank widths)
- Change ONLY room, lighting, and distance to wall — NEVER redraw balloons while moving
- FORBIDDEN while placing: adding balloons, densifying garlands/columns, inventing mini fillers, reshaping clusters, “beautifying” the arrangement
- Soft contact shadow under the original base only; tiny soft wall-contact shadow OK
- Camera still shows full product; do not crop tops`;

  if (scene === 'handheld_bouquet') {
    return `Rephotograph this VigSharm balloon BOUQUET for a square catalog card — Manus style: one real photo of a WOMAN holding the bouquet against the studio wall.

TASK:
1. Replace the background with the SECOND reference image — VigSharm studio WALL ONLY (warm beige-grey plaster). NO floor, NO baseboard, NO laminate, NO furniture.
2. The bouquet must be HELD by ONE realistic adult FEMALE hand (woman's hand only — never male, never child's) gripping the ribbon / wrapping base — natural gift-bouquet catalog pose.
3. If a hand is already in the original: keep the grip idea but REPLACE with a correct female hand/wrist if the original looks male, CGI, or stretched. Fix lighting to match the studio.
4. If there is NO hand in the original, ADD one photoreal female hand holding the bouquet base — physically gripping the ribbons, same light as the product — NOT a sticker, NOT a separate cutout plate, NOT floating.
5. REMOVE any circular hang-tag / logo disc on the ribbons or wrap (shop brand tags). Replace with clean ribbons only.

${lock}

${logoClean}

HAND — critical anatomy (allowed exception — only this may be added/replaced):
- ONE woman's hand only: feminine proportions, natural nails, soft skin — NEVER a man's hand
- Show mainly the HAND + short wrist; forearm must be SHORT and natural — NEVER a long stretched / elongated / warped arm entering from the corner
- Correct perspective: hand size matches bouquet base; fingers wrap around the stem/wrap naturally
- No rubbery stretch, no liquid morphing, no extra-long forearm diagonally across the frame
- Match skin lighting to soft studio daylight on the balloons
- Do not cover balloon faces or printed foil text with fingers
- Optional plain sleeve at wrist OK; no logos on sleeve

${light}
Do NOT add artificial balloon shadows on the wall. Soft natural contact only where hand/ribbons need grounding.

FORBIDDEN: floor, baseboard, laminate, sticker/cutout look, white halo, invented balloon text, changed balloon colors/counts, extra balloons, plastic CGI, collage of a pasted fist, dark moody grade, store watermarks, supplier logos, circular hang-tags, male hand, child's hand, stretched/elongated forearm, warped anatomy.

OUTPUT: one square 1:1 catalog photo — wall background, bouquet large in frame, natural female hand holding it (short wrist, no stretch), no hang-tags, bright and sharp.`;
  }

  if (isWallOnlyScene(scene)) {
    const unit = scene === 'unit_balloon';
    return `Rephotograph this VigSharm balloon product for a square catalog card — Manus style: one REAL photograph shot by a professional product photographer in a commercial catalog studio (NOT a cutout/sticker composite, NOT a phone snap in a dark room).

TASK:
1. Replace ONLY the room/background with the SECOND reference image — VigSharm studio WALL section (warm light beige-grey plaster).
2. NO floor, NO baseboard, NO laminate, NO furniture, NO LED strips from the original room.
3. Keep the product as one continuous photograph in the new room — remove cutout halo, white fringe, hard sticker edges.
4. Do NOT add a hand. Do NOT add balloons, bows, or ribbons that were not in the original.
${unit ? `5. UNIT / «шары поштучно» SOURCE PHOTOS often come from marketplace catalogs (Sima-land etc.) with heavy packaging overlays — you MUST strip ALL of them (MARVEL/Disney badge boxes, «ДЛЯ ГЕЛИЯ И ВОЗДУХА», size «12" / 30 CM», sima-land.ru / © stamps) while keeping the balloon artwork itself.` : ''}

STUDIO LOOK (critical — fix dark muddy walls):
- Shoot like a pro e-commerce session: softboxes + large soft daylight, high-key bright catalog lighting
- Wall must read as LIGHT bright beige-grey — lift wall exposure to match (or brighter than) the reference plaster; NOT taupe, NOT grey-brown, NOT underexposed
- Even illumination across the whole wall; no vignette, no muddy patches, no dirty fill artifacts
- Neutral white balance; foil/chrome stay vivid; bubble balloons stay clear and bright
- Clean commercial finish — as if for a premium balloon shop lookbook

${lock}

${logoClean}

EXTRA LOCK for bubble / chrome / tulle sets:
- Exact count of balloons INSIDE any clear bubble balloon
- Exact lettering on bubble balloons — every character identical
- Black tulle bows, mesh ribbons, curls — keep separate strands, do not melt or smear
- Sphere edges stay round — never flatten or clip

Minimal soft edge integration only — no graphic drop shadow on the wall.

FORBIDDEN: dark/muddy/taupe wall, underexposed background, floor, baseboard, laminate, sticker/cutout look, white/dark halo, invented text, changed balloon counts (including inside bubbles), melting tulle, plastic CGI, adding a hand, dark moody cinematic grade, store watermarks, supplier packaging badges, size/helium labels, marketplace URLs, leftover half-erased text.

OUTPUT: one square 1:1 bright professional catalog photo — ${unit ? 'single balloon / small set' : 'full product'} large in frame on a LIGHT studio wall only${unit ? ', with zero packaging badges or marketplace watermarks' : ''}.`;
  }

  if (scene === 'photozone') {
    if (photozoneType === 'easel') {
      return `Edit the provided photozone on an EASEL (~1.8 m tall) with polystyrene circle for a square VigSharm catalog card. Change ONLY the room background, lighting, and distance to the wall.

${lock}

${logoClean}

PHOTOZONE PRODUCT LOCK (critical — do not rebuild the set):
- Keep the easel, round board, text on the board, giraffe/foil figures, and EVERY balloon column/cluster EXACTLY as in the source
- Same balloon count and density — no extra pink/white/gold mini balloons stuffed into the column
- Do NOT redesign, densify, or “upgrade” the garland while moving it nearer the wall
- FORBIDDEN: inventing a round metal hoop / circular arch frame if the source has an easel (or no frame)
- If the source has no easel, do NOT invent one — only rephotograph what is already there against the studio

Use the SECOND reference image as the real VigSharm photozone studio — full room: warm beige-grey wall, white baseboard, grey-beige laminate floor with horizontal planks. Match that reference background as closely as possible.

SCALE — easel photozone height ~1.8 meters:
- Tall floor installation on a wooden easel with a round board — NOT a small tabletop prop
- Product must fill approximately 78–90% of the frame HEIGHT — minimal empty wall above
- Keep full width visible; do NOT shrink into a tiny object in the center
- Preserve human-scale proportions: a person standing next to it would see ~180 cm height

${nearWall}

Only minimal soft contact shadows where objects genuinely touch the floor.

${brightLight}

${brightFloor}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo, easel photozone (~1.8 m) unchanged product, near the wall, natural catalog light.`;
    }

    return `Edit the provided ROUND FRAME photozone (circular arch / hoop on a metal frame) for a square VigSharm catalog card. Change ONLY the room background, lighting, and distance to the wall.

${lock}

${logoClean}

PHOTOZONE PRODUCT LOCK (critical — do not rebuild the set):
- Keep the round frame and EVERY balloon on it EXACTLY as in the source — same count, colors, density, attachments
- Do NOT redesign, densify, or invent new balloon clusters
- FORBIDDEN: inventing a round metal hoop / circular arch if the source does NOT already have that frame
- FORBIDDEN: turning an easel photozone into a round hoop, or adding a hoop behind a freestanding balloon set
- If the source has no circular frame, do NOT add one — only rephotograph the existing product against the studio

Use the SECOND reference image as the real VigSharm photozone studio — full room: warm beige-grey wall, white baseboard, grey-beige laminate floor with horizontal planks. Match that reference background as closely as possible.

SCALE — CRITICAL: round frame diameter is about 3 METERS (huge party installation):
- This is a MASSIVE circular photozone frame filling most of a room — NOT a small wreath, NOT a 1 m hoop
- The circle/arch must dominate the catalog frame: fill approximately 88–96% of WIDTH and HEIGHT
- Minimal empty wall/floor around the ring; edges of the frame may come close to the photo borders

${nearWall}

Only minimal soft contact shadows where the frame base genuinely touches the floor.

${brightLight}

${brightFloor}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo — round Ø3 m photozone frame nearly filling the frame, near the wall, natural catalog light.`;
  }

  if (scene === 'balloon_figures') {
    return `Edit the provided balloon FIGURE / sculpture photo (скрутка «фигуры из шаров») for a square VigSharm catalog card. Change the room background/lighting AND fix posture/support as specified below.

${lock}

${logoClean}

ALLOWED EXCEPTION — POSTURE & SUPPORT (critical for catalog):
- STRAIGHTEN aggressively: head, body and green base on ONE vertical plumb line, parallel to the side edges of the frame / wall corners.
- Correct ANY remaining lean/tilt left or right — even a slight list. The sculpture must look perfectly upright and balanced.
- If bouquet / number foil weight makes it lean, rotate/rebalance the WHOLE figure upright without changing balloon counts or colors.
- REMOVE any non-balloon support under or around the sculpture: small table, stolik, glass table, wire stand, metal rack, stool, chair, crate, box, furniture legs, mirrors, vanity lights — as if never there.
- Place the EXISTING balloon BASE (usually the large green / bottom cluster already in the photo) DIRECTLY on the laminate floor.
- Soft contact shadow ONLY under those original base spheres that touch the floor — no large dark pool.
- Do NOT invent a new stand. Do NOT invent NEW balloons under the base (no extra white, clear, translucent, “feet”, “shoes”, filler spheres, or stabilizer cluster that was not in the original).
- After removing the table: the lowest balloons that already existed in the sculpture must sit on the floor unchanged — zero added balloons below them.
- Keep ALL original balloon parts (head, body, arms, bouquet, number foil, colors, counts) — only fix orientation and remove furniture. ZERO new balloons anywhere.

ROOM / FLOOR (critical — match reference, not wash out):
- Use the SECOND reference image as the real VigSharm studio — warm LIGHT beige-grey wall, white baseboard, LIGHT pale oak laminate with horizontal planks.
- Floor brightness ≈ reference pale oak — not darker charcoal, not glowing white wash.
- Explicitly REPLACE any dark/grey/brown floor from the source photo with the reference laminate.
- FORBIDDEN floor look: dark brown, walnut, charcoal, muddy grey, cool slate.
- Soft contact shadow ONLY under the original base balloons that touch the floor — tiny soft spots, not a dark pool.

${nearWall}

SCALE — CRITICAL for balloon figures (typically 1 m tall and taller):
- This is a LARGE human-scale balloon sculpture standing on the floor — NOT a small toy, NOT a tabletop prop
- The figure must fill approximately 80–92% of the frame HEIGHT — dominate the catalog card
- Minimal empty wall above the head/top; do NOT shrink the figure into a tiny object in the middle of the room
- Preserve real proportions: a person standing next to it would see a figure about 1–1.5+ meters tall
- FORBIDDEN: miniaturizing, floating tiny figure, excessive empty floor/wall that makes it look under ~1 m, leaving the figure leaning (even slightly), keeping a table/stand under the base, dark/muddy laminate floor, inventing extra balloons under the base

${brightLight}

${brightFloor}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo — balloon figure LARGE, perfectly VERTICAL, near the wall on LIGHT pale-oak laminate (no table, no invented feet balloons), natural catalog light, human scale ≥1 m.`;
  }

  return `Edit the provided floor-standing balloon composition photo for a square VigSharm catalog card. Change ONLY the room background and lighting.

${lock}

${logoClean}

Use the SECOND reference image as the real VigSharm studio environment — match it as closely as possible: warm beige-grey wall, white baseboard, LIGHT pale-oak / light grey-beige laminate floor with horizontal planks.

Keep the real base/support and natural floor position from the original. Only minimal soft contact shadow where the product genuinely touches the floor.

${nearWall}

SCALE: floor composition should fill approximately 70–85% of frame height — not a small object floating in empty room.

${brightLight}

${brightFloor}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo, composition large near the wall on LIGHT laminate, natural catalog light.`;
}

function buildRephotographAttempts(imageUrl, referenceUrl, prompt, resolution = '2K', prefer = 'quality', scene = 'floor') {
  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';
  const refFields = [
    { reference_image: referenceUrl },
    { reference: referenceUrl },
    { image2: referenceUrl },
    { reference_images: [referenceUrl] }
  ];
  const wallOnly = ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  const wallHint = '\n\nTarget room: VigSharm studio wall from the SECOND reference — warm light beige-grey plaster, natural catalog softbox daylight (not overexposed wash). Copy reference wall tone; do NOT darken into taupe/muddy grey and do NOT blow out to pure white. NO invented mottled/smudged wall.';
  const floorHint = '\n\nTarget FLOOR from the SECOND reference — LIGHT pale oak / light grey-beige laminate matching reference brightness. Place product CLOSE to the white baseboard (short floor strip only — not mid-room). Soft contact shadows only under product feet. FORBIDDEN: dark brown/charcoal laminate; large empty floor toward the wall.';
  const roomHint = wallOnly ? wallHint : (wallHint + floorHint);
  const attempts = [];

  const pushBanana = () => {
    for (const ref of refFields) {
      attempts.push({
        model: 'image/nano-banana-2',
        input: { prompt: prompt + (wallOnly ? '' : floorHint), image: imageUrl, aspect_ratio: '1:1', ...ref }
      });
    }
    for (const ref of refFields.slice(0, 2)) {
      attempts.push({
        model: 'image/nano-banana-pro',
        input: { prompt: prompt + (wallOnly ? '' : floorHint), image: imageUrl, ...ref }
      });
      attempts.push({
        model: 'image/nano-banana-edit',
        input: { prompt: prompt + (wallOnly ? '' : floorHint), image: imageUrl, ...ref }
      });
    }
  };

  // Job-level fallback path: only proven banana (after gpt/flux failed mid-run)
  if (prefer === 'banana' || prefer === 'fast') {
    pushBanana();
    return attempts;
  }

  // quality: one clean gpt + one flux (single ref field), then banana for submit-fallback
  attempts.push({
    model: 'image/gpt-image-2-edit',
    input: {
      prompt: prompt + roomHint,
      image: imageUrl,
      reference_image: referenceUrl,
      aspect_ratio: '1:1',
      resolution: res
    }
  });
  attempts.push({
    model: 'image/flux2-pro-edit',
    input: {
      prompt: prompt + roomHint,
      image: imageUrl,
      reference_image: referenceUrl,
      aspect_ratio: '1:1',
      resolution: res === '4K' ? '2K' : res
    }
  });
  pushBanana();
  return attempts;
}

async function handleStudioRephotograph(request, env) {
  const body = await request.json();
  const { image_url, reference_url, scene = 'floor', resolution = '2K' } = body;
  const prefer = body.prefer === 'banana' || body.prefer === 'fast' ? 'banana' : 'quality';
  const photozone_type = body.photozone_type === 'easel' ? 'easel' : 'frame';

  if (!image_url || !reference_url) {
    return json({ ok: false, error: 'Missing image_url or reference_url' }, 400);
  }

  for (const url of [image_url, reference_url]) {
    const ok = String(url).startsWith('data:image/') || String(url).startsWith('https://');
    if (!ok) {
      return json({ ok: false, error: 'Images must be data:image/... or https:// URLs' }, 400);
    }
  }

  const prompt = buildRephotographPrompt(scene, { photozone_type });
  const attempts = buildRephotographAttempts(image_url, reference_url, prompt, resolution, prefer, scene);

  let generateResp = null;
  let usedModel = null;

  for (const attempt of attempts) {
    console.log('[Studio Rephotograph] scene=', scene, 'photozone_type=', photozone_type, 'prefer=', prefer, 'try model=', attempt.model);
    generateResp = await nordRequest('/media/generate', 'POST', {
      model: attempt.model,
      input: attempt.input
    }, env);

    if (!generateResp.error && generateResp.id) {
      usedModel = attempt.model;
      console.log('[Studio Rephotograph] using model=', usedModel, 'job_id=', generateResp.id);
      break;
    }
    console.warn('[Studio Rephotograph] model failed:', attempt.model, generateResp.error || generateResp);
  }

  if (generateResp?.error) {
    return json({
      ok: false,
      error: 'Ошибка rephotograph: ' + (generateResp.error.message || JSON.stringify(generateResp.error))
    }, 500);
  }

  if (!generateResp?.id) {
    return json({ ok: false, error: 'NordRouter не вернул job_id: ' + JSON.stringify(generateResp) }, 500);
  }

  return json({
    ok: true,
    job_id: generateResp.id,
    status: 'processing',
    scene,
    resolution,
    model: usedModel,
    prefer,
    pipeline: 'rephotograph'
  });
}

// ─── Studio Pro: Enhance (legacy / fallback) ───────

function buildGentleEnhancePrompt(scene) {
  return `LIGHT seam/shadow finish ONLY for VigSharm balloon catalog. Do NOT rephotograph or redraw the product.

The balloons are ALREADY correctly placed on the studio wall. Touch only the silhouette edge and contact shadow.

ABSOLUTE LOCK — leave these pixels unchanged:
- Sphere outlines must stay ROUND (never flatten, clip, or straighten any balloon edge)
- Exact chrome/metallic colors (rose gold, gold, pink) — no purple/blue recolor
- Balloon counts, sizes, overlaps
- ALL text/lettering on bubble balloons — every character identical
- Ribbons, curls, butterfly stickers — keep separate strands, do not melt or smear
- Product position and scale

ONLY ALLOWED:
- Soften cutout halo / white fringe along the outer silhouette
- Soft natural contact shadow of the product on the wall behind it
- Tiny light match at the very edge

FORBIDDEN: reshaping balloons, straight vertical cuts on spheres, melting ribbons, changing text, chrome color shift, plastic CGI rewrite, moving the product.

SCENE: ${scene === 'handheld_bouquet' ? 'wall only; FEMALE hand only, short natural wrist (no stretched arm); remove circular hang-tags on ribbons' : 'wall only — no floor'}.`;
}

function buildEnhancePrompt(scene, mode = 'rephotograph') {
  if (mode === 'gentle') {
    return buildGentleEnhancePrompt(scene);
  }

  const base = `Rephotograph this VigSharm balloon product in the studio room — make it look like ONE real catalog photo taken in this space, not a cutout pasted on top.

The product is ALREADY placed correctly. Do NOT move, resize, or recompose it.

KEEP STRICTLY IDENTICAL:
- Every balloon: exact colors, counts, shapes, foil prints, text, numbers, names, characters
- Sphere edges must remain perfectly round — never clip or flatten
- Ribbons must stay as separate strands — do not melt together
- Product arrangement and composition — pixel-accurate
- Room layout (wall, baseboard, laminate) — same geometry

REPHOTOGRAPH / INTEGRATE:
- Remove cutout halo, white fringe, hard sticker edges
- Match product lighting to soft daylight in the room (reduce harsh studio HDR on foil balloons)
- Real contact shadows where balloons meet floor/wall — soft ambient occlusion under each sphere
- Subtle bounce light from floor onto the bottom of the product
- Natural edge blending so the product feels physically in the room

Do NOT reposition to fix floating. Do NOT redesign the product. No plastic 3D render. No full background replacement.`;

  if (scene === 'photozone') {
    return `${base}

SCENE: large photozone on laminate NEAR baseboard (short floor strip only — not mid-room). Contact shadow under the base. Keep full structure and LARGE real-world scale (round frame ~3 m diameter OR easel ~1.8 m — do not miniaturize). Natural catalog light, not overexposed.`;
  }

  if (scene === 'balloon_figures') {
    return `${base}

SCENE: large balloon FIGURE sculpture (≥1 m tall) standing PERFECTLY VERTICAL on LIGHT pale-oak laminate NEAR baseboard — no lean, no table/stand, not mid-room. Soft contact shadow only under ORIGINAL base balloons. Do NOT invent extra white/clear/feet balloons under the base. Natural catalog light (not washed out). Keep LARGE human scale — do not shrink.`;
  }

  return `${base}

SCENE: floor composition on laminate NEAR baseboard (short floor strip — not floating mid-room). Soft contact shadow under balloon cluster on the floor. Natural catalog light.`;
}

async function handleStudioEnhance(request, env) {
  const body = await request.json();
  const { image_url, scene = 'floor', resolution = '2K' } = body;
  let mode = body.mode || 'rephotograph';

  // wall_only / unit_balloon / handheld use full enhance/rephotograph prompts (Manus), not gentle-only

  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const isDataUrl = String(image_url).startsWith('data:image/');
  const isHttpsUrl = String(image_url).startsWith('https://');
  if (!isDataUrl && !isHttpsUrl) {
    return json({ ok: false, error: 'Invalid image_url' }, 400);
  }

  const prompt = buildEnhancePrompt(scene, mode);
  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';

  // Gentle: lighter models first (less rewrite). Rephotograph: gpt 2K first.
  const enhanceAttempts = mode === 'gentle'
    ? [
        { model: 'image/nano-banana-edit', input: { prompt, image: image_url } },
        { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
        { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url } },
        { model: 'image/nano-banana-pro', input: { prompt, image: image_url } }
      ]
    : [
        { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
        { model: 'image/flux2-pro-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res === '4K' ? '2K' : res } },
        { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url } },
        { model: 'image/nano-banana-pro', input: { prompt, image: image_url } },
        { model: 'image/nano-banana-edit', input: { prompt, image: image_url } }
      ];

  let generateResp = null;
  for (const attempt of enhanceAttempts) {
    console.log('[Studio Enhance] scene=', scene, 'mode=', mode, 'try model=', attempt.model);
    generateResp = await nordRequest('/media/generate', 'POST', {
      model: attempt.model,
      input: attempt.input
    }, env);

    if (!generateResp.error && generateResp.id) {
      console.log('[Studio Enhance] using model=', attempt.model, 'job_id=', generateResp.id);
      break;
    }
    console.warn('[Studio Enhance] model failed:', attempt.model, generateResp.error || generateResp);
  }

  if (generateResp.error) {
    return json({
      ok: false,
      error: 'Ошибка AI-доводки: ' + (generateResp.error.message || JSON.stringify(generateResp.error))
    }, 500);
  }

  if (!generateResp.id) {
    return json({ ok: false, error: 'NordRouter не вернул job_id: ' + JSON.stringify(generateResp) }, 500);
  }

  console.log('[Studio Enhance] job_id=', generateResp.id);
  return json({ ok: true, job_id: generateResp.id, status: 'processing', scene, resolution: res, mode });
}

/** Restore phone photo: exposure, noise, mild sharpen — keep product identical */
async function handleStudioRestore(request, env) {
  const { image_url, resolution = '2K' } = await request.json();

  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const prompt = `Professional product photo restore for e-commerce balloons catalog.

Fix a phone photo taken in poor lighting:
- Correct exposure and white balance (neutral, not yellow)
- Reduce noise and compression artifacts
- Mild sharpening, recover detail in foil prints and latex texture
- Keep the REAL product: same balloons, colors, counts, shapes, text, numbers, characters
- Do NOT change composition, background content, or add objects
- Do NOT restyle as CGI or plastic render
- Output a clean, sharp catalog-ready source photo`;

  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';
  const attempts = [
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, resolution: res } },
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url } },
    { model: 'image/nano-banana-edit', input: { prompt, image: image_url } }
  ];

  let generateResp = null;
  for (const attempt of attempts) {
    console.log('[Studio Restore] try', attempt.model);
    generateResp = await nordRequest('/media/generate', 'POST', {
      model: attempt.model,
      input: attempt.input
    }, env);
    if (!generateResp.error && generateResp.id) break;
    console.warn('[Studio Restore] failed', attempt.model, generateResp.error || generateResp);
  }

  if (generateResp?.error || !generateResp?.id) {
    return json({
      ok: false,
      error: 'Ошибка restore: ' + JSON.stringify(generateResp?.error || generateResp)
    }, 500);
  }

  return json({ ok: true, job_id: generateResp.id, status: 'processing' });
}

/**
 * Vision: найти область надписи (звезда/сердце/бабл/коробка/табличка) — нормализованный bbox 0–1.
 */
async function handleStudioSignDetect(request, env) {
  const body = await request.json();
  const image_url = body.image_url;
  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'claude-sonnet-5',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You locate personalization lettering on VigSharm balloon catalog photos.
Return ONLY JSON: {"x":0,"y":0,"w":0,"h":0,"surface":"star|heart|bubble|box|plaque|other"}
Coordinates are normalized 0–1 relative to full image width/height.
Box must cover the FULL foil STAR / heart / bubble / plaque that has personalization text (include the whole gold star face, not only the letters, and not the whole balloon man).
Prefer the gold foil STAR if present.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Find the foil star (or other lettering surface) and return a box around that whole surface.'
          },
          { type: 'image_url', image_url: { url: image_url } }
        ]
      }
    ]
  }, env);

  if (aiResp.error) {
    return json({
      ok: false,
      error: 'Sign-detect API: ' + (aiResp.error.message || JSON.stringify(aiResp.error))
    }, 500);
  }

  const raw = aiResp.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) {
      return json({ ok: false, error: 'Sign-detect: неверный JSON', raw: String(raw).slice(0, 200) }, 500);
    }
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return json({ ok: false, error: 'Sign-detect: не разобрать JSON', raw: String(raw).slice(0, 200) }, 500);
    }
  }

  let x = Number(parsed.x);
  let y = Number(parsed.y);
  let w = Number(parsed.w);
  let h = Number(parsed.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) {
    return json({ ok: false, error: 'Sign-detect: нет bbox', parsed }, 500);
  }

  // clamp + pad; не даём боксу съесть весь кадр (иначе вклейка сотрёт фигуру)
  const pad = 0.04;
  x = Math.max(0, Math.min(1, x - pad));
  y = Math.max(0, Math.min(1, y - pad));
  w = Math.max(0.06, Math.min(1 - x, w + pad * 2));
  h = Math.max(0.06, Math.min(1 - y, h + pad * 2));
  if (w > 0.42 || h > 0.42) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    w = Math.min(w, 0.36);
    h = Math.min(h, 0.36);
    x = Math.max(0, Math.min(1 - w, cx - w / 2));
    y = Math.max(0, Math.min(1 - h, cy - h / 2));
  }

  return json({
    ok: true,
    region: { x, y, w, h },
    surface: String(parsed.surface || 'other')
  });
}

/**
 * Rewrite ONLY personalization lettering on an existing Master.
 * mode=erase — fully clear letters; mode=print — paint exact text on blank surface.
 * Admin runs erase → canvas print for sharp exact Cyrillic.
 */
async function handleStudioSignText(request, env) {
  const body = await request.json();
  const {
    image_url,
    text = '',
    line1 = '',
    line2 = '',
    line3 = '',
    region = null,
    resolution = '2K',
    mode: rawMode = 'print'
  } = body;

  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const mode = rawMode === 'erase' ? 'erase' : (rawMode === 'fix' ? 'fix' : 'print');
  const fromText = String(text || '').replace(/\r\n/g, '\n').trim();
  const l1 = String(line1 || '').trim();
  const l2 = String(line2 || '').trim();
  const l3 = String(line3 || '').trim();
  const exactText = fromText || [l1, l2, l3].filter(Boolean).join('\n');
  if ((mode === 'print' || mode === 'fix') && !exactText) {
    return json({ ok: false, error: 'Укажите правильный текст надписи' }, 400);
  }

  let regionHint = `This image is often a CLOSE-UP crop of the lettering surface (gold foil star / heart / bubble / plaque).
Edit ONLY the lettering on that foil/plaque. Keep the foil material.`;
  if (region && typeof region.x === 'number' && typeof region.y === 'number' && typeof region.size === 'number') {
    const cx = Math.round((region.x + region.size / 2) * 100);
    const cy = Math.round((region.y + region.size / 2) * 100);
    const sz = Math.round(region.size * 100);
    regionHint = `The lettering surface is near ${cx}% from left, ${cy}% from top, roughly ${sz}% of frame size — edit ONLY that area.`;
  }

  const locked = `LOCKED — do not change:
- foil star/heart/bubble outer silhouette and chrome material
- wrinkles and lighting of the foil (except where letters sit)
- do NOT add balloons, hands, or background objects
- do NOT replace the foil with a flat gray sticker or rectangle plaque`;

  const printRules = `Typography: clean simple sans-serif, sharp edges, even baseline, uniform size, high-contrast white (or matching original ink color) on foil.
Letters must be CRISP — NEVER melt, warp, smear, liquify, or scramble Cyrillic.
Copy NEW TEXT character-by-character — do NOT autocorrect, translate, or invent (keep exact spelling).

NEW TEXT:
---
${exactText}
---`;

  let prompt;
  if (mode === 'erase') {
    prompt = `Edit this photo. ERASE lettering ONLY — blank clean foil/plaque.

TASK: remove every letter/glyph from the personalization surface; inpaint matching foil. Zero ghost letters.

${regionHint}

${locked}

OUTPUT: same framing, blank lettering surface.`;
  } else if (mode === 'fix') {
    prompt = `IN-PLACE LETTERING EDIT of a CLOSE-UP CROP. This is NOT a new catalog photo.

CRITICAL — SAME PIXELS / SAME FRAMING:
- Keep the EXACT same crop framing, camera, scale, and background fragments already in this crop
- Do NOT rephotograph, do NOT center the star alone on a clean studio wall
- Do NOT remove hands, ribbons, figure parts, or room bits visible at the edges of this crop
- Do NOT turn this into a "product shot of only the star"
- Output must match the input composition — only the letters on the foil change

TASK:
1. Erase distorted letters on the foil star/heart/bubble/plaque in this crop.
2. Print NEW TEXT exactly on that same foil surface.

${printRules}

${regionHint}

${locked}

FORBIDDEN: full-bleed star on empty beige wall, gray sticker plaques, recomposing the scene, scrambled Cyrillic.

OUTPUT: same crop framing as input, foil intact, crisp exact NEW TEXT only.`;
  } else {
    prompt = `Edit this photo. The inscription surface is blank (or nearly). PRINT new lettering ONLY.

${printRules}

${regionHint}

${locked}

OUTPUT: same framing, only crisp exact NEW TEXT on the blank surface.`;
  }

  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';
  const prefer = body.prefer === 'banana' || body.prefer === 'fast' ? 'banana' : 'quality';

  const bananaAttempts = [
    { model: 'image/nano-banana-edit', input: { prompt, image: image_url } },
    { model: 'image/nano-banana-2', input: { prompt, image: image_url, resolution: res } },
    { model: 'image/nano-banana-pro', input: { prompt, image: image_url } }
  ];
  // fix-кроп: НЕ форсировать aspect_ratio 1:1 — иначе модель делает «звезду на бежевом» вместо in-place
  const gptAttempts = mode === 'fix'
    ? [
      { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, resolution: res } },
      { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url } }
    ]
    : [
      { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
      { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1' } }
    ];
  const attempts = prefer === 'banana'
    ? [...bananaAttempts, ...gptAttempts]
    : [...gptAttempts, ...bananaAttempts];

  let generateResp = null;
  let usedModel = '';
  for (const attempt of attempts) {
    console.log('[Studio SignText] try', attempt.model, 'mode=', mode, 'prefer=', prefer);
    generateResp = await nordRequest('/media/generate', 'POST', {
      model: attempt.model,
      input: attempt.input
    }, env);
    if (!generateResp.error && generateResp.id) {
      usedModel = attempt.model;
      break;
    }
    console.warn('[Studio SignText] failed', attempt.model, generateResp.error || generateResp);
  }

  if (generateResp?.error || !generateResp?.id) {
    return json({
      ok: false,
      error: 'Ошибка sign-text: ' + JSON.stringify(generateResp?.error || generateResp)
    }, 500);
  }

  console.log('[Studio SignText] job_id=', generateResp.id, 'mode=', mode, 'model=', usedModel,
    mode === 'print' ? ('text=' + exactText.replace(/\n/g, ' | ')) : 'erase');
  return json({
    ok: true,
    job_id: generateResp.id,
    status: 'processing',
    model: usedModel,
    prefer,
    mode
  });
}

/** Upscale crop to 2K for sharp catalog zooms */
async function handleStudioUpscale(request, env) {
  const { image_url, resolution = '2K' } = await request.json();

  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const prompt = `Upscale this square product crop. KEEP geometry identical.

LOCK: round balloon edges (no flat/clipped sides), exact colors, text lettering, separate ribbons (do not melt).
Only increase resolution/sharpness. No restyle, no recolor, no recomposition.`;

  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';
  const attempts = [
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1' } },
    { model: 'image/nano-banana-edit', input: { prompt, image: image_url } }
  ];

  let generateResp = null;
  for (const attempt of attempts) {
    console.log('[Studio Upscale] try', attempt.model);
    generateResp = await nordRequest('/media/generate', 'POST', {
      model: attempt.model,
      input: attempt.input
    }, env);
    if (!generateResp.error && generateResp.id) break;
    console.warn('[Studio Upscale] failed', attempt.model, generateResp.error || generateResp);
  }

  if (generateResp?.error || !generateResp?.id) {
    return json({
      ok: false,
      error: 'Ошибка upscale: ' + JSON.stringify(generateResp?.error || generateResp)
    }, 500);
  }

  return json({ ok: true, job_id: generateResp.id, status: 'processing' });
}


// ─── Studio Pro: Generate Reference Background ───────────

async function handleGenerateReference(request, env) {
  const { type = 'full' } = await request.json().catch(() => ({}));

  const prompts = {
    full: `Professional empty product photography studio, square 1:1.
Upper 65%: soft warm beige-grey plaster wall with subtle real texture.
Thin clean white baseboard.
Lower 30-35%: light grey-beige oak laminate, planks running LEFT-RIGHT (horizontal), soft grain.
Soft even daylight, neutral white balance, NO yellow/orange cast.
Empty room — no furniture, no objects, no people.
Photorealistic catalog backdrop, real photo NOT 3D render, high resolution.`,
    wall: `Clean empty studio wall only, square 1:1. Soft warm beige-grey plaster texture, even soft light, NO floor, NO yellow cast, photorealistic backdrop.`,
    corner: `Empty product studio corner, square 1:1. Beige-grey walls, white baseboard, light grey-beige laminate floor, soft depth, soft light, NO yellow cast, empty, photorealistic.`
  };

  const prompt = prompts[type] || prompts.full;
  console.log('[Reference BG] Generating type:', type);

  const generateResp = await nordRequest('/media/generate', 'POST', {
    model: 'image/nano-banana-2',
    input: {
      prompt,
      aspect_ratio: '1:1'
    }
  }, env);

  if (generateResp.error) {
    // fallback model
    console.warn('[Reference BG] nano-banana-2 failed, trying flux:', generateResp.error);
    const fluxResp = await nordRequest('/media/generate', 'POST', {
      model: 'image/flux2-pro',
      input: { prompt, aspect_ratio: '1:1' }
    }, env);
    if (fluxResp.error || !fluxResp.id) {
      return json({
        ok: false,
        error: 'Ошибка генерации: ' + JSON.stringify(generateResp.error || fluxResp.error || fluxResp)
      }, 500);
    }
    return json({ ok: true, job_id: fluxResp.id, status: 'processing' });
  }

  if (!generateResp.id) {
    return json({ ok: false, error: 'NordRouter не вернул job_id: ' + JSON.stringify(generateResp) }, 500);
  }

  return json({ ok: true, job_id: generateResp.id, status: 'processing' });
}

// ─── Studio Pro: Status ──────────────────────────────────

async function handleStudioStatus(path, env) {
  const jobId = path.split('/').pop();
  console.log('[Studio Status] ?? Checking job:', jobId);
  
  try {
    const result = await nordRequest('/media/job/' + jobId, 'GET', null, env);

  console.log('[Studio Status] ?? Job:', jobId, '? Status:', result.status);

  if (result.status === 'done' && result.result_url) {
    const remoteUrl = String(result.result_url);
    // Always fetch with Nord auth and return dataURL — raw Nord https URLs
    // often need Bearer and show as black/broken <img> in admin.
    const imgResp = await fetch(remoteUrl, {
      headers: { 'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY }
    });
    if (!imgResp.ok) {
      console.error('[Studio Status] download failed:', imgResp.status);
      return json({ ok: false, error: `Ошибка скачивания: ${imgResp.status}` }, 500);
    }

    const arrayBuffer = await imgResp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isWebP = bytes.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8;
    let detectedMimeType = 'image/png';
    if (isWebP) detectedMimeType = 'image/webp';
    else if (isJPEG) detectedMimeType = 'image/jpeg';
    else if (!isPNG) {
      const ct = (imgResp.headers.get('Content-Type') || '').split(';')[0].trim();
      detectedMimeType = ct.startsWith('image/') ? ct : 'image/png';
    }

    // Chunked base64 — no O(n²) concat (that caused Worker 503 on 2K masters)
    const base64 = bytesToBase64(bytes);
    const dataUrl = 'data:' + detectedMimeType + ';base64,' + base64;
    console.log('[Studio Status] done → dataURL', jobId, bytes.length, detectedMimeType);
    return json({ ok: true, status: 'done', result_url: dataUrl, format: 'base64' });
  }

  if (result.status === 'failed') {
    const errDetail = result.error?.message || result.error || result.message || 'Модель отклонила задачу';
    const errText = typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail);
    console.error('[Studio Status] failed job:', jobId, errText);
    return json({ ok: false, status: 'failed', error: errText });
  }

  return json({ ok: true, status: result.status || 'processing' });
  } catch (error) {
    console.error('[Studio Status] ? Error checking job:', jobId, error);
    return json({ ok: false, error: error.message || 'Status check failed' }, 500);
  }
}

// ─── Studio Pro: Upload ──────────────────────────────────

async function handleStudioUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ ok: false, error: 'No file' });

  const result = await nordUpload(file, env);
  if (!result.url) return json({ ok: false, error: 'Upload failed' });

  return json({ ok: true, url: result.url });
}

// ─── Products CRUD ───────────────────────────────────────

/** D1 не принимает undefined — только null / number / string / ArrayBuffer */
function d1(v) {
  return v === undefined ? null : v;
}

function slugifyServer(str) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  return String(str || '').toLowerCase().split('')
    .map((ch) => (map[ch] !== undefined ? map[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tovar';
}

/** Гарантирует уникальный slug (products.slug UNIQUE). */
async function ensureUniqueSlug(env, desired, excludeId = null) {
  let base = slugifyServer(desired);
  if (!base) base = 'tovar';

  const taken = async (slug) => {
    const row = excludeId
      ? await env.DB.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').bind(slug, excludeId).first()
      : await env.DB.prepare('SELECT id FROM products WHERE slug = ?').bind(slug).first();
    return !!row;
  };

  if (!(await taken(base))) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`.slice(0, 70);
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Гарантирует уникальный артикул (products.article UNIQUE). */
async function ensureUniqueArticle(env, desired, excludeId = null) {
  let base = String(desired || '').trim().toUpperCase() || 'DG-001';

  const taken = async (article) => {
    const row = excludeId
      ? await env.DB.prepare('SELECT id FROM products WHERE article = ? AND id != ?').bind(article, excludeId).first()
      : await env.DB.prepare('SELECT id FROM products WHERE article = ?').bind(article).first();
    return !!row;
  };

  if (!(await taken(base))) return base;

  const m = base.match(/^(.*?)[-_]?(\d+)$/);
  const prefix = m ? m[1].replace(/[-_]$/, '') : base;
  let n = m ? (parseInt(m[2], 10) + 1) : 2;
  for (; n < 10000; n++) {
    const candidate = `${prefix}-${String(n).padStart(3, '0')}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

async function handleGetProducts(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM products ORDER BY created_at DESC"
  ).all();
  return json({ ok: true, products: results.map(parseProduct) });
}

async function handleGetProduct(path, env) {
  const id = path.split('/').pop();
  const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!product) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, product: parseProduct(product) });
}

async function handleCreateProduct(request, env) {
  try {
    const data = await request.json();

    const photos = Array.isArray(data.photos) ? data.photos : [];
    const hugeDataUrl = photos.find(u => typeof u === 'string' && u.startsWith('data:'));
    if (hugeDataUrl) {
      return json({
        ok: false,
        error: 'Фото пришли как dataURL (слишком большие для БД). Загрузите их в Cloudinary и сохраните снова.'
      }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const price = Number(data.price);
    const priceSafe = Number.isFinite(price) ? price : 0;
    const slug = await ensureUniqueSlug(env, data.slug || data.title || data.article || id);
    const article = await ensureUniqueArticle(env, data.article || 'DG-001');

    await env.DB.prepare(`INSERT INTO products (
      id, title, article, price, short_description, full_description, composition,
      category, character, age_group, budget, series_name, occasion, target_audience,
      seo_title, seo_description, slug, scene, tags, client_options, photos, main_photo,
      status, show_on_site, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id,
      d1(data.title),
      article,
      priceSafe,
      d1(data.short_description),
      d1(data.full_description),
      JSON.stringify(data.composition || []),
      d1(data.category),
      d1(data.character),
      d1(data.age_group),
      d1(data.budget),
      d1(data.series_name),
      d1(data.occasion),
      d1(data.target_audience),
      d1(data.seo_title),
      d1(data.seo_description),
      slug,
      d1(data.scene) || 'auto',
      JSON.stringify(data.tags || []),
      JSON.stringify(data.client_options || {}),
      JSON.stringify(photos),
      d1(data.main_photo) || photos[0] || null,
      d1(data.status) || 'draft',
      data.show_on_site ? 1 : 0,
      now,
      now
    ).run();

    return json({ ok: true, id });
  } catch (e) {
    console.error('[CreateProduct]', e);
    return json({ ok: false, error: 'Ошибка БД: ' + (e.message || String(e)) }, 500);
  }
}

async function handleUpdateProduct(path, request, env) {
  try {
    const id = path.split('/').pop();
    const data = await request.json();
    const now = new Date().toISOString();

    const existing = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
    if (!existing) return json({ ok: false, error: 'Not found' }, 404);

    const photos = data.photos !== undefined
      ? (Array.isArray(data.photos) ? data.photos : [])
      : JSON.parse(existing.photos || '[]');

    if (photos.some(u => typeof u === 'string' && u.startsWith('data:'))) {
      return json({
        ok: false,
        error: 'Фото пришли как dataURL. Загрузите в Cloudinary и сохраните снова.'
      }, 400);
    }

    const nextSlug = await ensureUniqueSlug(
      env,
      data.slug ?? existing.slug ?? data.title ?? existing.title ?? id,
      id
    );
    const nextArticle = await ensureUniqueArticle(
      env,
      data.article ?? existing.article ?? 'DG-001',
      id
    );

    await env.DB.prepare(`UPDATE products SET
      title = ?, article = ?, price = ?, short_description = ?, full_description = ?,
      composition = ?, category = ?, character = ?, age_group = ?, budget = ?,
      series_name = ?, occasion = ?, target_audience = ?,
      seo_title = ?, seo_description = ?, slug = ?, scene = ?,
      tags = ?, client_options = ?, photos = ?, main_photo = ?,
      status = ?, show_on_site = ?, updated_at = ?
    WHERE id = ?`).bind(
      d1(data.title ?? existing.title),
      nextArticle,
      Number.isFinite(Number(data.price ?? existing.price)) ? Number(data.price ?? existing.price) : 0,
      d1(data.short_description ?? existing.short_description),
      d1(data.full_description ?? existing.full_description),
      JSON.stringify(data.composition ?? JSON.parse(existing.composition || '[]')),
      d1(data.category ?? existing.category),
      d1(data.character ?? existing.character),
      d1(data.age_group ?? existing.age_group),
      d1(data.budget ?? existing.budget),
      d1(data.series_name ?? existing.series_name),
      d1(data.occasion ?? existing.occasion),
      d1(data.target_audience ?? existing.target_audience),
      d1(data.seo_title ?? existing.seo_title),
      d1(data.seo_description ?? existing.seo_description),
      nextSlug,
      d1(data.scene ?? existing.scene) || 'auto',
      JSON.stringify(data.tags ?? JSON.parse(existing.tags || '[]')),
      JSON.stringify(data.client_options ?? JSON.parse(existing.client_options || '{}')),
      JSON.stringify(photos),
      d1(data.main_photo ?? existing.main_photo) || photos[0] || null,
      d1(data.status ?? existing.status) || 'draft',
      data.show_on_site !== undefined ? (data.show_on_site ? 1 : 0) : (existing.show_on_site ? 1 : 0),
      now,
      id
    ).run();

    return json({ ok: true });
  } catch (e) {
    console.error('[UpdateProduct]', e);
    return json({ ok: false, error: 'Ошибка БД: ' + (e.message || String(e)) }, 500);
  }
}

async function handleDeleteProduct(path, env) {
  const id = path.split('/').pop();
  await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function handleToggleStatus(path, request, env) {
  const id = path.split('/')[3]; // /api/products/:id/status
  const { status } = await request.json();
  await env.DB.prepare("UPDATE products SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id).run();
  return json({ ok: true });
}

// ─── Upload Photo ────────────────────────────────────────

async function handleUploadPhoto(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ ok: false, error: 'No file' }, 400);

  // R2 отключен — конвертируем файл в data URL (временное решение)
  // Для продакшена нужно настроить реальный хостинг изображений
  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = file.type || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;
    
    const id = crypto.randomUUID();
    console.log('Photo uploaded as data URL, size:', base64.length, 'bytes');
    
    return json({ ok: true, url: dataUrl, id });
  } catch (error) {
    console.error('Upload error:', error);
    return json({ ok: false, error: 'Upload failed: ' + error.message }, 500);
  }
}

async function handleDeletePhoto(path, env) {
  const id = path.split('/').pop();
  // R2 отключен — NordRouter не поддерживает удаление файлов через API
  // Просто возвращаем успех (файлы на NordRouter остаются, но это не критично)
  return json({ ok: true });
}

// ─── Helpers ─────────────────────────────────────────────

function parseProduct(row) {
  return {
    ...row,
    composition: JSON.parse(row.composition || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    client_options: JSON.parse(row.client_options || '{}'),
    photos: JSON.parse(row.photos || '[]'),
    show_on_site: !!row.show_on_site
  };
}


