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

const CARD_TAGS = [...AUDIENCE_CATEGORIES, ...TYPE_TAGS];

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
    composition_raw
  } = body;
  const rawComposition = String(composition_raw || description || '').trim();
  const typeHint = sceneTypeHint(scene || 'floor');
  const priceNum = Number(price) || 0;

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
${TYPE_TAGS.join(', ')}

BUDGET (ровно одно):
${BUDGET_OPTIONS.join(' | ')}

НАЗВАНИЯ — критично:
- Стиль эталона: «Герой Готэма», «Тёмный рыцарь», «Качок», «Готик-шифр», «Выше облаков», «Большая прогулка»
- Это бренд-крючок / настроение / шутка / метафора — НЕ перечень того, что на фото
- ЗАПРЕЩЕНО: «Набор с…», «Композиция …», «… с зайчиком», «… на крестины», «Фонтан из шаров…», просто имя героя одним словом без крючка
- Персонаж и повод — в character / category / tags, не в title
- title_alts: ещё 1–2 крючка в том же духе, не пересказ состава
- ЦИФРА НА ФОТО (1, 2, 6… на фольге) — это ПРИМЕР. Клиент выберет любую цифру 0–9.
  • ЗАПРЕЩЕНО в title и title_alts любая привязка к конкретной цифре или возрасту:
    «шестилетка», «на 6 лет», «Модный шестой», «Стильная шестёрка», «1 годик», «пятёрка», цифры 0–9 в тексте и т.п.
  • Крючок про героя / стиль / настроение (LOL, дива, модница) — БЕЗ числа и возраста

ПРОЧИЕ ПРАВИЛА:
- category = аудитория (Для мальчика…), НЕ тип изделия
- тип изделия — только в tags
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
- occasion: НЕ «День рождения». Пусто, если повод не узкий
- composition: оформи ТОЛЬКО сырой состав пользователя.
  • НЕ добавляй позиции, которых нет во входе
  • НЕ добавляй цвет (жёлтых/синих…), если пользователь цвет не написал → «5 латексных шаров», не «5 жёлтых шаров»
  • фольгированный персонаж: «фольгированная фигура Пикачу» — ок; это НЕ «фигура из шаров»
  • НЕ считай и НЕ дополняй с фото
  • КОРОБКА: если в составе есть «коробка» / «коробка-сюрприз» — оформи пункт так:
    «коробка 70x70x70 с индивидуальной надписью и декором»
    (если пользователь указал другой размер — сохрани его, напр. «коробка 60x60x60 с индивидуальной надписью и декором»)
  • ОРФОГРАФИЯ: исправь опечатки и ошибки в словах пользователя (падежи, «надписью», «звезда», «сердце», «баблс/бабл»), смысл и числа не меняй
- Во всех текстовых полях (title, descriptions, composition, seo): грамотный русский, без орфографических ошибок
- budget: только из BUDGET по цене пользователя
- НЕ возвращай article и price`;

  const userPrompt = `Сгенерируй карточку:
Подсказка названия: ${title_hint || 'не указано'}
Цена (₽): ${priceNum > 0 ? priceNum : 'не указана'}
Сырой состав от пользователя (оформи красиво, исправь орфографию, числа сохрани): ${rawComposition || 'не указан'}
Сцена Studio Pro: ${scene || 'floor'}
Подсказка типа изделия для tags: ${typeHint || 'по фото'}
${image_url ? 'Фото приложено — ОБЯЗАТЕЛЬНО определи персонажа и тематическую серию по визуальным признакам (цвета, паутина, фигуры, принты). Если сомневаешься — confidence medium/low и дай alts. Логотипы магазинов игнорируй. Имена/возраст на табличке — пример персонализации, не в title.' : ''}`;

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

  data = sanitizeCardMetadata(data, scene || 'floor', priceNum, rawComposition);
  return json({ ok: true, data });
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

function sanitizeCardMetadata(data, scene = 'floor', price = 0, rawComposition = '') {
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
    category = hit || AUDIENCE_CATEGORIES.find((a) => tags.includes(a)) || 'Для девочки';
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
  if (category && !tags.includes(category)) tags.unshift(category);
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
    else data.age_group = 'Для любого возраста';
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
Категории: Для девочки, Для мальчика, Для неё, Для мамы, Для него, Геймерам, Юбилей, 1 годик, Крещение, Гендер-пати, На выписку, Свадьба и девичник, Выпускной, Новый год, 14 февраля, 23 февраля, 8 марта, 1 сентября, Фигуры из шаров, Напольные композиции, Букет из шаров, Цветы из шаров, Крафтовый букет, Шар-сюрприз, Коробка-сюрприз, Фотозона, Арка из шаров, Шары поштучно.`
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
- entire original product; exact balloon count, shapes, sizes, colors, positions, overlaps
- ALL decorative text that is PART OF THE PRODUCT PRINT on balloons (character art, foil prints, custom names/numbers meant to stay on the item) — copy exactly, never retype or autocorrect
- characters, foil figures, chrome/metallic surfaces, ribbons, knots, product stickers that belong to the item
- do NOT add, remove, redraw, simplify or beautify any product element (except the ALLOWED EXCEPTION below)
- when uncertain about a product print, keep it — do NOT guess`;

  const logoClean = `ALLOWED EXCEPTION — REMOVE supplier / marketplace packaging overlays and watermarks (critical for catalog photos, especially «шары поштучно» / unit balloons from Sima-land and similar):
REMOVE completely (inpaint as if never there):
- Corner and floating badges/boxes: brand logos (MARVEL, Disney, etc. as separate rectangular stickers on the photo), size labels («12" / 30 CM», «18"», diameter), usage labels («ДЛЯ ГЕЛИЯ И ВОЗДУХА», «для гелия», «воздух», helium/air icons)
- Marketplace / shop watermarks and URLs anywhere on the image: sima-land.ru, wildberries, ozon, sharomem.ru, sharomen.ru, Instagram/VK handles, translucent stamps, shop names, banners
- Small © copyright stamps and supplier URL text overlaid on or near balloons that are NOT part of the balloon's own printed design
- Any colored pill/rectangle with white text glued onto the catalog photo (packaging chrome), not printed into the latex/foil artwork
- Circular / round hang tags and brand discs on ribbons or wrap (shop logos like «МАИК», heart+name discs, cardboard circle tags, plastic logo badges dangling from the bouquet)
Inpaint the wall / balloon / ribbon surface underneath cleanly — no blur blotches, no leftover letters or half a circle.
KEEP: Spider-Man / character art printed ON the balloon latex or foil; decorative words that are clearly part of that print (e.g. «HERO» baked into the balloon design); bubble lettering and custom personalization on the product itself; foil heart texts that are printed ON the balloon face.`;

  const forbidden = `FORBIDDEN: sticker/cutout appearance, white or dark halo, invented text, changed colors, plastic CGI look, furniture, window, curtains from the original room, melting ribbons, harsh cast shadows, yellow/orange color cast, duplicate objects, collage, dark moody look, evening lighting, underexposure, extra balloons, new foreground balloon clusters, objects not present in the original, store watermarks, supplier packaging badges, size/helium labels, marketplace URL overlays (sima-land.ru etc.), leftover half-erased text, circular shop hang-tags on ribbons`;

  const light = `LIGHTING: soft even professional studio product photography. Remove harsh window backlight. Match exposure and white balance to the studio room. Real photograph, not CGI render.`;

  const brightLight = `LIGHTING — BRIGHT DAYLIGHT STUDIO (critical):
- Bright, well-lit catalog photo — NOT dark, NOT evening, NOT underexposed
- High-key soft daylight; lift exposure on the product so balloons and foil look vivid
- Neutral white balance; wall and floor must read as light beige-grey, not taupe or muddy
- Remove window backlight but KEEP the product bright — do not darken the whole scene
- Soft diffuse studio light; no dramatic shadows, no moody cinematic grade`;

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
      return `Edit the provided photozone on an EASEL (~1.8 m tall) with polystyrene circle for a square VigSharm catalog card. Change ONLY the room background and lighting.

${lock}

${logoClean}

Use the SECOND reference image as the real VigSharm photozone studio — full room: warm beige-grey wall, white baseboard, grey-beige laminate floor with horizontal planks. Match that reference background as closely as possible.

SCALE — easel photozone height ~1.8 meters:
- Tall floor installation on a wooden easel with a round board — NOT a small tabletop prop
- Product must fill approximately 78–90% of the frame HEIGHT — minimal empty wall above
- Keep full width visible; do NOT shrink into a tiny object in the center
- Preserve human-scale proportions: a person standing next to it would see ~180 cm height

Only minimal soft contact shadows where objects genuinely touch the floor.

${brightLight}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo, easel photozone (~1.8 m) large in frame, bright and vivid.`;
    }

    return `Edit the provided ROUND FRAME photozone (circular arch / hoop on a metal frame) for a square VigSharm catalog card. Change ONLY the room background and lighting.

${lock}

${logoClean}

Use the SECOND reference image as the real VigSharm photozone studio — full room: warm beige-grey wall, white baseboard, grey-beige laminate floor with horizontal planks. Match that reference background as closely as possible.

SCALE — CRITICAL: round frame diameter is about 3 METERS (huge party installation):
- This is a MASSIVE circular photozone frame filling most of a room — NOT a small wreath, NOT a 1 m hoop
- The circle/arch must dominate the catalog frame: fill approximately 88–96% of WIDTH and HEIGHT
- Minimal empty wall/floor around the ring; edges of the frame may come close to the photo borders
- Preserve real 3 m human scale — two adults could stand inside the circle comfortably
- FORBIDDEN: miniaturizing the hoop, floating small ring in empty room, making it look under ~2 m

Only minimal soft contact shadows where the frame base genuinely touches the floor.

${brightLight}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo — round Ø3 m photozone frame nearly filling the frame, bright and vivid.`;
  }

  if (scene === 'balloon_figures') {
    return `Edit the provided balloon FIGURE / sculpture photo (скрутка «фигуры из шаров») for a square VigSharm catalog card. Change ONLY the room background and lighting.

${lock}

${logoClean}

Use the SECOND reference image as the real VigSharm studio environment — match it as closely as possible: warm beige-grey wall, white baseboard, grey-beige laminate floor with horizontal planks.

Keep the real base/feet and natural floor position from the original. Only minimal soft contact shadow where the figure genuinely touches the floor.

SCALE — CRITICAL for balloon figures (typically 1 m tall and taller):
- This is a LARGE human-scale balloon sculpture standing on the floor — NOT a small toy, NOT a tabletop prop
- The figure must fill approximately 80–92% of the frame HEIGHT — dominate the catalog card
- Minimal empty wall above the head/top; do NOT shrink the figure into a tiny object in the middle of the room
- Preserve real proportions: a person standing next to it would see a figure about 1–1.5+ meters tall
- FORBIDDEN: miniaturizing, floating tiny figure, excessive empty floor/wall that makes it look under ~1 m

${brightLight}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo — balloon figure LARGE and bright in frame, human scale ≥1 m.`;
  }

  return `Edit the provided floor-standing balloon composition photo for a square VigSharm catalog card. Change ONLY the room background and lighting.

${lock}

${logoClean}

Use the SECOND reference image as the real VigSharm studio environment — match it as closely as possible: warm beige-grey wall, white baseboard, grey-beige laminate floor with horizontal planks.

Keep the real base/support and natural floor position from the original. Only minimal soft contact shadow where the product genuinely touches the floor.

SCALE: floor composition should fill approximately 70–85% of frame height — not a small object floating in empty room.

${brightLight}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo, composition large and bright in frame.`;
}

function buildRephotographAttempts(imageUrl, referenceUrl, prompt, resolution = '2K', prefer = 'quality') {
  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';
  const refFields = [
    { reference_image: referenceUrl },
    { reference: referenceUrl },
    { image2: referenceUrl },
    { reference_images: [referenceUrl] }
  ];
  const wallHint = '\n\nTarget room: VigSharm studio wall from the SECOND reference — LIGHT bright beige-grey plaster, high-key professional catalog studio lighting (softboxes). Copy reference wall luminance; do NOT darken into taupe/muddy grey. NO invented mottled/smudged wall.';
  const attempts = [];

  const pushBanana = () => {
    for (const ref of refFields) {
      attempts.push({
        model: 'image/nano-banana-2',
        input: { prompt, image: imageUrl, aspect_ratio: '1:1', ...ref }
      });
    }
    for (const ref of refFields.slice(0, 2)) {
      attempts.push({
        model: 'image/nano-banana-pro',
        input: { prompt, image: imageUrl, ...ref }
      });
      attempts.push({
        model: 'image/nano-banana-edit',
        input: { prompt, image: imageUrl, ...ref }
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
      prompt: prompt + wallHint,
      image: imageUrl,
      reference_image: referenceUrl,
      aspect_ratio: '1:1',
      resolution: res
    }
  });
  attempts.push({
    model: 'image/flux2-pro-edit',
    input: {
      prompt: prompt + wallHint,
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
  const attempts = buildRephotographAttempts(image_url, reference_url, prompt, resolution, prefer);

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

SCENE: large photozone on laminate near baseboard. Contact shadow under the base. Keep full structure and LARGE real-world scale (round frame ~3 m diameter OR easel ~1.8 m — do not miniaturize).`;
  }

  if (scene === 'balloon_figures') {
    return `${base}

SCENE: large balloon FIGURE sculpture (≥1 m tall) on laminate near baseboard. Keep LARGE human scale in frame — do not shrink. Medium contact shadow under feet/base.`;
  }

  return `${base}

SCENE: floor composition on laminate near baseboard. Medium contact shadow under balloon cluster on the floor — not a flat oval, but shadows where spheres touch the surface.`;
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
 * Rewrite ONLY the plaque/sign lettering on an existing Master.
 * Text comes from the operator (line1/line2) — model must not invent spelling.
 */
async function handleStudioSignText(request, env) {
  const body = await request.json();
  const {
    image_url,
    line1 = '',
    line2 = '',
    region = null,
    resolution = '2K'
  } = body;

  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const l1 = String(line1 || '').trim();
  const l2 = String(line2 || '').trim();
  if (!l1 && !l2) {
    return json({ ok: false, error: 'Укажите текст для таблички (line1 и/или line2)' }, 400);
  }

  const exactText = [l1, l2].filter(Boolean).join('\n');
  let regionHint = 'Focus on the white circular plaque / sign board already in the photo (usually among the balloons).';
  if (region && typeof region.x === 'number' && typeof region.y === 'number' && typeof region.size === 'number') {
    const cx = Math.round((region.x + region.size / 2) * 100);
    const cy = Math.round((region.y + region.size / 2) * 100);
    const sz = Math.round(region.size * 100);
    regionHint = `The plaque is near ${cx}% from left, ${cy}% from top, roughly ${sz}% of frame size — edit ONLY that white disk.`;
  }

  const prompt = `Edit this square VigSharm catalog photo. Change ONLY the lettering on the existing white circular plaque/sign.

TASK:
1. Erase the old wrong text on that white disk (wrong name/spelling/age).
2. Paint the NEW text EXACTLY as given below — same language, letters, punctuation, line breaks.
3. Keep the same white circular board, wood easel/frame if visible, perspective, lighting, soft shadows.

NEW TEXT (copy exactly, do NOT autocorrect or invent):
---
${exactText}
---

${regionHint}

LOCKED — do not change:
- Spider-Man / character foil figures, chrome, latex balloons, balloon COUNT and positions
- foil number balloons (e.g. red "3") — leave number foil as-is
- floor, wall, baseboard, overall composition and camera framing
- do NOT add balloons, stars, or any new objects
- do NOT replace the plaque with a flat digital sticker or perfect vector circle
- text must look hand-lettered / printed ON the physical plaque, not a floating overlay

FORBIDDEN: changing the room, inventing different name/age, extra foreground balloons, CGI plaque, cropping the product out.

OUTPUT: same square 1:1 photo, only plaque lettering corrected.`;

  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';
  const attempts = [
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1' } },
    { model: 'image/nano-banana-edit', input: { prompt, image: image_url } },
    { model: 'image/nano-banana-2', input: { prompt, image: image_url, resolution: res } }
  ];

  let generateResp = null;
  for (const attempt of attempts) {
    console.log('[Studio SignText] try', attempt.model);
    generateResp = await nordRequest('/media/generate', 'POST', {
      model: attempt.model,
      input: attempt.input
    }, env);
    if (!generateResp.error && generateResp.id) break;
    console.warn('[Studio SignText] failed', attempt.model, generateResp.error || generateResp);
  }

  if (generateResp?.error || !generateResp?.id) {
    return json({
      ok: false,
      error: 'Ошибка sign-text: ' + JSON.stringify(generateResp?.error || generateResp)
    }, 500);
  }

  console.log('[Studio SignText] job_id=', generateResp.id, 'text=', exactText);
  return json({ ok: true, job_id: generateResp.id, status: 'processing' });
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


