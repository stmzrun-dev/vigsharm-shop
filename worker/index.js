// VigSharm API — Cloudflare Worker
// Хранит ключ NordRouter, проксирует запросы, управляет D1 + R2 / Yandex Object Storage

import { AwsClient } from 'aws4fetch';

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
      return new Response(null, { headers: corsHeaders(request) });
    }

    try {
      // Sprint 2: динамический Open Graph для карточки товара.
      // Route на vigsharm.ru/product.html* (см. worker/OG_DNS_SETUP.md).
      // Люди — pass-through на GitHub Pages; боты — D1 + HTMLRewriter.
      if ((method === 'GET' || method === 'HEAD') && isProductPagePath(path)) {
        return handleProductPageOg(request, env, url);
      }

      // Публичное чтение каталога и медиа — доступно витрине без авторизации.
      // Всё остальное (создание/изменение/удаление товаров, загрузка фото,
      // ИИ-генерация, Studio Pro) требует заголовок Authorization: Bearer <ADMIN_API_KEY>.
      const isPublicMedia = method === 'GET' && /^\/api\/media\/[^/]+$/.test(path);
      const isPublicRead = method === 'GET' && (
        path === '/api/products' || /^\/api\/products\/[^/]+$/.test(path)
        || path === '/api/price-list'
        || path === '/api/delivery'
        || isPublicMedia
      );
      const isPublicOrder = path === '/api/orders' && method === 'POST';
      if (!isPublicRead && !isPublicOrder) {
        const authHeader = request.headers.get('Authorization') || '';
        const expected = 'Bearer ' + (env.ADMIN_API_KEY || '');
        if (!env.ADMIN_API_KEY || authHeader !== expected) {
          return json({ ok: false, error: 'Unauthorized' }, 401);
        }
      }

      if (isPublicMedia) {
        return handleGetMedia(path, env);
      }

      // Router
      if (path === '/api/ai/read-foil-digits' && method === 'POST')
        return handleReadFoilDigits(request, env);
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
      if (path === '/api/orders' && method === 'POST')
        return handleCreateOrder(request, env);
      if (path === '/api/orders' && method === 'GET')
        return handleListOrders(env);
      if (path.match(/^\/api\/orders\/[^/]+\/status$/) && method === 'PATCH')
        return handleOrderStatus(path, request, env);
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
      if (path === '/api/price-list' && method === 'GET')
        return handleGetPriceList(env);
      if (path === '/api/price-list' && method === 'PUT')
        return handlePutPriceList(request, env);
      if (path === '/api/price-list/reprice' && method === 'POST')
        return handleRepriceFromList(request, env);
      if (path === '/api/delivery' && method === 'GET')
        return handleGetDelivery(env);
      if (path === '/api/delivery' && method === 'PUT')
        return handlePutDelivery(request, env);
      if (path === '/api/upload/photo' && method === 'POST')
        return handleUploadPhoto(request, env);
      if (path.match(/^\/api\/upload\/photo\/[^/]+$/) && method === 'DELETE')
        return handleDeletePhoto(path, env);

      return json({ ok: false, error: 'Not found' }, 404);
    } catch (e) {
      console.error(e);
      const msg = e?.name === 'TimeoutError' || e?.name === 'AbortError'
        ? 'ИИ не ответил вовремя (таймаут). Нажмите ещё раз через несколько секунд.'
        : (e.message || String(e));
      return json({ ok: false, error: msg }, 500);
    }
  }
};

// ─── CORS ────────────────────────────────────────────────

function corsHeaders(request = _corsRequest) {
  const origin = request?.headers?.get('Origin');
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

async function nordRequest(endpoint, method, body, env, timeoutMs = 20000) {
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(timeoutMs)
  };
  if (body) opts.body = JSON.stringify(body);
  let resp;
  try {
    resp = await fetch('https://nordrouter.com' + endpoint, opts);
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error(`NordRouter таймаут ${Math.round(timeoutMs / 1000)}с (${endpoint}). Попробуйте ещё раз.`);
    }
    throw e;
  }

  const responseText = await resp.text();

  if (!resp.ok) {
    console.error('[NordRouter] HTTP ERROR', {
      endpoint,
      status: resp.status,
      body: responseText.slice(0, 500)
    });
    throw new Error(`NordRouter HTTP ${resp.status}: ${responseText.slice(0, 300)}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('NordRouter вернул не-JSON: ' + responseText.slice(0, 200));
  }
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
  'Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для мамы', 'Для него', 'Геймерам',
  'Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник',
  'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября',
  'Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров',
  'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров',
  'Шары поштучно'
];

/** Основная категория карточки — аудитория / явный повод (не тип изделия) */
const AUDIENCE_CATEGORIES = [
  'Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для мамы', 'Для него', 'Геймерам',
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

function holidayFromHints(hints) {
  if (!Array.isArray(hints)) return null;
  for (const h of hints) {
    const hit = matchHolidayCategory(h);
    if (hit) return hit;
  }
  return null;
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
    'универсальные': 'Универсальные',
    'универсальн': 'Универсальные',
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
  data.occasion = '';
  data.target_audience = '';
  // Доп. разделы: только тематика (персонаж/серия сохраняем)
  data.tags = [holiday];
  data.holiday_only = holiday;
  data.age_group = ageFromCategory(holiday) || 'Для любого возраста';
  return data;
}

/** Возраст по полке (для поводов/дат и fallback). */
function ageFromCategory(cat) {
  const c = String(cat || '').trim();
  if (!c) return '';
  if (c === 'На выписку' || c === '1 годик' || c === 'Крещение') return 'Для малышей';
  if (c === 'Гендер-пати' || c === '1 сентября' || c === 'Для девочки' || c === 'Для мальчика'
    || c === 'Геймерам' || c === 'Фотозона' || c === 'Коробка-сюрприз') {
    return 'Для детей';
  }
  // «Универсальные» и «Юбилей» — возраст НЕ авто: ИИ/оператор по фото
  if (c === 'Выпускной') return 'Для подростков';
  if (c === 'Для неё' || c === 'Для него' || c === 'Для мамы'
    || c === 'Свадьба и девичник' || c === '8 марта' || c === '14 февраля' || c === '23 февраля') {
    return 'Для взрослых';
  }
  if (c === 'Новый год') return 'Для любого возраста';
  return '';
}

/** Полки-поводы/даты: возраст из категории; персонаж/серия сохраняются. */
const OCCASION_SHELVES = [
  'Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник',
  'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'
];

/** Аудитория «для кого» — можно держать рядом с полкой-поводом (Юбилей + Для него). */
const FOR_WHO_TAGS = [
  'Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для мамы', 'Для него', 'Геймерам'
];

function pickAudienceTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  const out = [];
  for (const t of list) {
    if (FOR_WHO_TAGS.includes(t) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 1);
}

function pickKeptTypeTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  const out = [];
  for (const t of list) {
    if (t === 'Фотозона' && !out.includes(t)) out.push(t);
  }
  return out;
}

function compositionLooksLikePhotozone(text) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (!t) return false;
  return /фотозон|мольбер|полистирол|круг\s+на\s+мольбер|каркас|кругл\w*\s+рам|рамк\w*\s+фотозон|обруч|\bhoop\b|\beasel\b/.test(t);
}

function applyPhotozoneTypeTag(data, scene, rawComposition) {
  const tags = Array.isArray(data.tags) ? [...data.tags] : [];
  const hit = (scene || '') === 'photozone'
    || compositionLooksLikePhotozone(rawComposition)
    || tags.includes('Фотозона')
    || String(data.category || '') === 'Фотозона';
  if (!hit) return data;
  if (!tags.includes('Фотозона')) tags.push('Фотозона');
  data.tags = tags;
  return data;
}

function applyOccasionShelfCard(data) {
  const cat = String(data.category || '').trim();
  if (!OCCASION_SHELVES.includes(cat)) return data;
  if (cat !== 'Юбилей') {
    data.age_group = ageFromCategory(cat) || data.age_group || 'Для любого возраста';
  }
  const audience = pickAudienceTags(data.tags).filter((t) => t !== cat);
  const types = pickKeptTypeTags(data.tags);
  data.tags = [cat, ...audience, ...types];
  return data;
}

/** Круглые юбилейные числа на фольге (10, 20, … 90, 100). */
const JUBILEE_FOIL_NUMBERS = new Set(['10', '20', '30', '40', '50', '60', '70', '80', '90', '100']);

/** Нормализация foil_digits / foil_digit → строка цифр слева направо («1», «28», «20»). */
function takeFoilDigits(data) {
  const raw = data.foil_digits != null && String(data.foil_digits).trim() !== ''
    ? data.foil_digits
    : data.foil_digit;
  delete data.foil_digits;
  delete data.foil_digit;
  return String(raw ?? '').replace(/\D/g, '');
}

/** Взрослое число с отдельного чтения цифр не оставляем детской полкой и названием «на пять лет». */
function applyTrustedFoilReading(data, digits, opts = {}) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return data;
  const n = parseInt(d, 10);
  if (!Number.isFinite(n)) return data;
  const singleChild = d.length === 1;
  const jubilee = JUBILEE_FOIL_NUMBERS.has(d);
  const adultNumber = !singleChild && !jubilee && n >= 16;
  if (adultNumber && !opts.lockCategory) {
    if (data.category === 'Для девочки' || data.category === '1 годик') data.category = 'Для неё';
    else if (data.category === 'Для мальчика') data.category = 'Для него';
    else if (data.category === 'Юбилей') data.category = 'Универсальные';
    if (Array.isArray(data.tags)) {
      data.tags = data.tags
        .map((t) => {
          if (t === 'Для девочки' && data.category === 'Для неё') return 'Для неё';
          if (t === 'Для мальчика' && data.category === 'Для него') return 'Для него';
          if (t === '1 годик' || t === 'Юбилей') return '';
          return t;
        })
        .filter(Boolean);
      if ((data.category === 'Для неё' || data.category === 'Для него') && !data.tags.includes(data.category)) {
        data.tags.unshift(data.category);
      }
      data.tags = [...new Set(data.tags)].slice(0, 5);
    }
  }
  if (adultNumber) data.age_group = 'Для взрослых';
  if (d) {
    const badAgeTitle = (t) => /летн|годик|на \d+\s*лет|\d+\s*лет|(?<![а-яё])(шестнадцать|восемнадцать|тринадцать|четырнадцать|пятнадцать|семнадцать|девятнадцать|одиннадцать|двенадцать|двадцать|тридцать|сорок|пятьдесят)(?![а-яё])/i.test(String(t || ''));
    const alts = (Array.isArray(data.title_alts) ? data.title_alts : []).filter((t) => !badAgeTitle(t));
    if (badAgeTitle(data.title)) {
      data.title = alts[0] || '';
      data.title_alts = alts.slice(1, 3);
      if (!data.title) data.ask_title = true;
    } else {
      data.title_alts = alts.slice(0, 2);
    }
  }
  return data;
}

/** Только крупные фольгированные цифры слева направо. 4 и 5 → «45», не «5». */
async function handleReadFoilDigits(request, env) {
  const body = await request.json().catch(() => ({}));
  const image_url = body.image_url;
  if (!image_url) return json({ ok: false, error: 'Missing image_url' }, 400);

  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'claude-sonnet-5',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Ты читаешь ТОЛЬКО крупные фольгированные цифры на фото воздушного шара.
Верни ТОЛЬКО JSON: {"foil_digits":"45"}
- Смотри слева направо. Каждая отдельная цифра-шар — один символ.
- Два шара «4» и «5» → "45". Никогда не отбрасывай левую цифру и не возвращай одну «5», если рядом есть «4».
- Одна цифра → "5". Нет крупных цифр-шаров → "".
- Хвост, завиток и лента цифры — часть ЭТОГО шара, не вторая цифра. Золотая «6» или «9» с длинным хвостом — это "6" или "9", НЕ "16" и НЕ "19". "16" только если рядом стоят ДВА отдельных шара.
- Игнорируй мелкий текст, Happy Birthday, даты на бабле, цены, надписи на бутылке и звёздах.`
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Перечисли крупные фольгированные цифры слева направо.' },
          { type: 'image_url', image_url: { url: image_url } }
        ]
      }
    ]
  }, env, 45000);

  if (aiResp.error) {
    return json({ ok: false, error: 'NordRouter API ошибка: ' + (aiResp.error.message || JSON.stringify(aiResp.error)) });
  }
  const text = aiResp.choices?.[0]?.message?.content || '';
  let digits = '';
  try {
    digits = String(JSON.parse(text).foil_digits || '').replace(/\D/g, '').slice(0, 4);
  } catch {
    digits = String(text).replace(/\D/g, '').slice(0, 4);
  }
  return json({ ok: true, foil_digits: digits });
}

/** Крупная фольгированная «1» (одна цифра) → «1 годик». «10» сюда не попадает. */
function applyFirstBirthdayFromFoilDigit(data, digits) {
  const d = String(digits || '');
  if (d !== '1') return data;
  if (String(data.category || '') === 'На выписку') return data;
  data.category = '1 годик';
  return applyOccasionShelfCard(data);
}

/** Круглые 10/20/30… → «Юбилей». 18, 28, 35 и одиночные 2–9 — НЕ юбилей. */
function applyJubileeFromFoilDigits(data, digits) {
  const d = String(digits || '');
  if (JUBILEE_FOIL_NUMBERS.has(d)) {
    if (String(data.category || '') === 'На выписку') return data;
    data.category = 'Юбилей';
    return applyOccasionShelfCard(data);
  }
  // ИИ иногда ставит «Юбилей» на обычный ДР (28 и т.п.) — снимаем, если цифры известны и некруглые
  if (String(data.category || '') === 'Юбилей' && d && !JUBILEE_FOIL_NUMBERS.has(d)) {
    data.category = 'Универсальные';
  }
  return data;
}

function cardAgeBlob(data) {
  return [
    data.character, data.series_name,
    Array.isArray(data.tags) ? data.tags.join(' ') : '',
    data.title, data.short_description, data.full_description
  ].join(' ').toLowerCase().replace(/ё/g, 'е');
}

const KIDS_HERO_RE = /гарри\s*поттер|хогварт|поттер|для девочки|для мальчика|геймерам|мульт|пикачу|человек-паук|спайдер|миньон|lol|барби|единорог|щеняч|трактор|принцесс|\bdisney\b|\bmarvel\b/;

function jubileeLooksKids(data) {
  return KIDS_HERO_RE.test(cardAgeBlob(data));
}

function cardLooksLikeKidsHero(data) {
  if (jubileeLooksKids(data)) return true;
  const extra = Array.isArray(data.composition) ? data.composition.join(' ') : '';
  return KIDS_HERO_RE.test(String(extra).toLowerCase().replace(/ё/g, 'е'));
}

/** Детский герой и цифра до 16: «Для неё/него» — детская полка. Маму, свадьбу и праздники не трогаем. */
function applyKidsHeroChildDigit(data, digits, opts = {}) {
  if (opts.lockCategory) return data;
  const cat = String(data.category || '').trim();
  if (cat !== 'Для неё' && cat !== 'Для него') return data;
  if (OCCASION_SHELVES.includes(cat)) return data;
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return data;
  const n = parseInt(d, 10);
  if (!Number.isFinite(n)) return data;
  if (!(d.length === 1 || n < 16)) return data;
  if (JUBILEE_FOIL_NUMBERS.has(d)) return data;
  if (!cardLooksLikeKidsHero(data)) return data;

  const next = cat === 'Для неё' ? 'Для девочки' : 'Для мальчика';
  data.category = next;
  data.age_group = 'Для детей';
  const tags = Array.isArray(data.tags) ? data.tags.map((t) => (t === cat ? next : t)) : [];
  if (!tags.includes(next)) tags.unshift(next);
  data.tags = [...new Set(tags)].slice(0, 5);
  return data;
}

function jubileeLooksAdult(data) {
  const blob = cardAgeBlob(data);
  return /для неё|для него|для мамы|виски|коньяк|шампанск|вино\b|кубок|сигар|галстук/.test(blob);
}

/** Юбилей: возраст по фото, не «всегда взрослые». 10 → дети, если нет взрослого стиля; 20+ → взрослые, если нет детского героя. */
function applyJubileeAgeFromPhoto(data, digits) {
  if (String(data.category || '') !== 'Юбилей') return data;
  const d = String(digits || '');
  const kids = jubileeLooksKids(data);
  const adult = jubileeLooksAdult(data);
  if (kids && !adult) {
    data.age_group = 'Для детей';
  } else if (adult && !kids) {
    data.age_group = 'Для взрослых';
  } else if (d === '10') {
    data.age_group = kids || !adult ? 'Для детей' : 'Для взрослых';
  } else if (JUBILEE_FOIL_NUMBERS.has(d)) {
    data.age_group = adult || !kids ? 'Для взрослых' : 'Для детей';
  } else if (!data.age_group || data.age_group === 'Для любого возраста') {
    data.age_group = kids ? 'Для детей' : 'Для взрослых';
  }
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

/** Коробка / коробка-сюрприз в составе → тип «Коробка-сюрприз». */
function compositionLooksLikeSurpriseBox(text) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (!t) return false;
  return /коробк/.test(t);
}

const GENERIC_OCCASIONS = new Set([
  'день рождения', 'др', 'birthday', 'праздник', 'любой повод', 'без повода'
]);

function sceneTypeHint(scene) {
  switch (scene) {
    case 'unit_balloon': return 'Шары поштучно';
    case 'photozone': return 'Фотозона';
    case 'handheld_bouquet': return 'Букет из шаров';
    // wall_only: фольга/бабл на стене — НЕ «Фигуры» и НЕ авто-«Букет» (букет = сцена handheld)
    case 'wall_only': return '';
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
    holiday_only,
    foil_digits
  } = body;
  const trustedDigits = String(foil_digits || '').replace(/\D/g, '').slice(0, 4);
  const rawIn = String(composition_raw || description || '').trim();
  const holidayMeta = parseCompositionHolidayMeta(rawIn);
  const rawComposition = holidayMeta.cleanText || rawIn;
  const hintsFromBody = Array.isArray(composition_hints)
    ? composition_hints.map((h) => String(h || '').trim()).filter(Boolean)
    : [];
  const compositionHints = [...new Set([...(holidayMeta.hints || []), ...hintsFromBody])];
  const themeHit = matchHolidayCategory(holiday_only)
    || holidayMeta.holiday
    || holidayFromHints(compositionHints)
    || null;
  const holidayOnly = themeHit && OCCASION_SHELVES.includes(themeHit) ? themeHit : null;
  const typeHint = sceneTypeHint(scene || 'floor');
  const priceNum = Number(price) || 0;
  const takenTitles = normalizeExistingTitlesList(existing_titles);

  const hintsBlock = compositionHints.length
    ? `Подсказки оператора (из скобок в составе — НЕ пункты состава, учти при category/audience/occasion/age/опциях):\n${compositionHints.map((h) => `• ${h}`).join('\n')}`
    : '';

  const holidayRule = holidayOnly
    ? `
ТЕМАТИЧЕСКАЯ КАРТОЧКА (метка в скобках уже снята из состава; правило для ЛЮБОЙ сцены, в т.ч. balloon_figures): category = РОВНО «${holidayOnly}».
- Не ставь category/tags «Фигуры из шаров» / букет / фотозона — тип изделия не перебивает праздник
- ОБЯЗАТЕЛЬНО character по фото: скрутка И фольгированный герой (Дед Мороз, Снегурочка, снеговик, кошка, заяц, мишка, солдат, LOL…). series_name — по теме или пусто
- age_group можно не заполнять — система поставит сама по категории
- tags: ТОЛЬКО «${holidayOnly}» — без type-тегов («Букет из шаров», «Фигуры…» и т.п.), без других разделов
- composition: БЕЗ скобок и БЕЗ текста тематики — только физический состав шаров`
    : '';

  const boxOnly = !holidayOnly && compositionLooksLikeSurpriseBox(rawComposition);
  const bouquetOnly = !holidayOnly && !boxOnly && (
    (scene || '') === 'handheld_bouquet'
    || compositionLooksLikeBouquet(rawComposition)
  );
  const figuresOnly = !holidayOnly && !boxOnly && !bouquetOnly && (
    (scene || '') === 'balloon_figures'
    || compositionLooksLikeBalloonFigure(rawComposition)
  );
  const photozoneOnly = !holidayOnly && !boxOnly && !bouquetOnly && !figuresOnly
    && (scene || '') === 'photozone';

  const boxRule = boxOnly
    ? `
КОРОБКА-СЮРПРИЗ (в составе есть «коробка»; без тематики в скобках): category = РОВНО «Коробка-сюрприз».
- tags: ТОЛЬКО «Коробка-сюрприз» — БЕЗ «Для неё/него/девочки/мальчика» и прочих аудиторий/поводов
- ОБЯЗАТЕЛЬНО заполни age_group по фото (герои/цифры/дети → «Для детей»)
- ПЕРСОНАЖ НА КОРОБКЕ: смотри принт/наклейку/иллюстрацию на стенках и крышке коробки (не только фольгу).
  Узнаваемый герой на коробке → character ОБЯЗАТЕЛЕН (и series_name по франшизе, если есть).
  Сомнение → character_confidence medium/low + character_alts (2–3 варианта). НЕ оставляй character пустым, если герой на принте виден.
- target_audience и occasion оставь пустыми (пол/повод — не в этих полях)`
    : '';
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
ФОТОЗОНА (мольберт / каркас / круг; без тематики в скобках):
- В tags ВСЕГДА «Фотозона»
- Если на фото одна крупная фольгированная «1» (foil_digits = "1"): category = «1 годик», tags ["1 годик","Фотозона"] (+ пол если явный). НЕ ставь category «Фотозона» вместо «1 годик»
- Иначе: category = «Фотозона», tags только «Фотозона» (пол/повод не дублируй)
- ОБЯЗАТЕЛЬНО age_group по фото
- target_audience и occasion пустые
- character / series_name — по герою на фото`
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
  "tags": ["1–4 тега из списка"],
  "foil_digits": "крупные фольгированные цифры слева направо: «1», «28», «20» или пустая строка"
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
- ЦИФРЫ НА ФОТО:
  • foil_digits — крупные фольгированные цифры слева направо («1», «28», «20»), иначе ""
  • В title и title_alts ЗАПРЕЩЕНО писать цифру, возраст, «годик», «на N лет» и числительные («шесть», «шестнадцать», «восемнадцать») — крючок без числа
  • Клиент может сменить цифру при заказе — category от цифр всё равно по правилам ниже

ПРОЧИЕ ПРАВИЛА:
- category = ОДНА главная полка из AUDIENCE (аудитория ИЛИ явный повод), НЕ тип изделия
- ПРИОРИТЕТ category (важнее цвета, пола и «Универсальные»):
  1) «На выписку» — если на фото/в тексте признаки выписки из роддома: бабл/таблица с датой+временем+весом (гр)+ростом (см), следы ножек, «Добро пожаловать домой», «выписка», «из роддома», метрики новорождённого. Розовый/голубой и имя малыша НЕ отменяют выписку: category = «На выписку»
  2) «1 годик» — только ОДНА крупная фольгированная цифра «1» (foil_digits = "1"). НЕ путать с «10». НЕ ставь «Универсальные» / пол вместо «1 годик»
  3) «Юбилей» — ТОЛЬКО круглые даты foil_digits ∈ {10,20,30,40,50,60,70,80,90,100}. ЗАПРЕЩЕНО ставить «Юбилей» за 18, 25, 28, 35, 45, одну цифру 2–9 или любые некруглые пары
     • При category = полка-повод (Юбилей, 1 годик, Крещение, выписка, праздники…): в tags ВСЕГДА эта же category.
       Если на фото ЯВНЫЙ пол/адресат — ДОБАВЬ в tags ещё ОДИН тег аудитории.
       Пример: 40 + кубок + футбольный мяч → category «Юбилей», tags ["Юбилей","Для него"].
       Розовое/бантики на юбилее → tags ["Юбилей","Для неё"]. Без явного пола — только ["Юбилей"] или ["Юбилей","Универсальные"].
  4) Другой узкий повод (Крещение, Гендер-пати, Свадьба…) — если явно виден на фото/в подсказках
  5) Явный пол/стиль: «Для девочки» / «Для мальчика» / «Для неё» / «Для него» / «Для мамы» / «Геймерам»
     • ИМЯ НА НАДПИСИ (бабл / звезда / сердце / табличка) — сильный сигнал пола. Читай текст на фото.
       Мужские/мужские уменьшительные (Алекс, Александр, Саша→если явно муж., Максим, Иван, Дима, Артём…) → «Для него» (взрослый стиль) или «Для мальчика» (детский), НЕ «Для неё»
       Женские (Анна, Мария, Алина, Катя…) → «Для неё» / «Для девочки»
       Неоднозначные (Саша, Женя, Валя без других сигналов) → «Универсальные», не угадывай «Для неё»
     • ЗАПРЕЩЕНО ставить «Для неё» только из‑за золота, каллиграфии, звезды, чёрно-золотой палитры или «элегантного» вида — без явного женского имени/розового/сердечек этого мало
     • Имя на надписи — пример персонализации клиента: НЕ пиши это имя в title / title_alts / seo
     • ДЕТСКАЯ ПАЛИТРА (age_group «Для детей», нет полки-повода): цвет шаров — явный пол.
       Доминирует розовый / фуксия / бантики / сердечки → category «Для девочки» (не «Универсальные» и не «Для неё»).
       Доминирует голубой / синий → category «Для мальчика».
       Розовый вместе с голубым или нет одного цвета → «Универсальные».
       Розовый Хагги / Кисси Мисси — тоже «Для девочки». Синий Хагги без розовой палитры — «Для мальчика», если рядом нет розовых шаров.
  6) «Универсальные» — нейтральная композиция / цифры некруглые (напр. 28, 5+7) / нет явного пола, нет однозначного имени и нет доминирующего розового или голубого у детской карточки. НЕ оставляй category пустым
- тип изделия — только в tags
- «Букет из шаров» в tags — ТОЛЬКО если сцена handheld_bouquet или в составе явно «букет». Сцена wall_only сама по себе НЕ букет
- Сцена wall_only / unit_balloon: ЗАПРЕЩЕНО ставить тег «Напольные композиции» (это не полка «пол», а съёмка на стене)
- ЗАПРЕЩЕНО: тег и категория «Шар-сюрприз» — раздел пока не используется, не ставь никуда
- «Фигуры из шаров» — ТОЛЬКО скрутка/лепка из множества шаров, стоящая на полу. НЕ ставь этот тег для фольгированных персонажей (Пикачу, Гонщик, зайчик, жираф), баблов, фонтанов и композиций на стене
- Мольберт / пенопластовый круг / каркас-обруч (фотозона) → в tags «Фотозона». Если foil_digits = "1", category всё равно «1 годик», тег «Фотозона» рядом
- ПЕРСОНАЖ И СЕРИЯ — критично, определяй по фото:
  • Смотри фигуры (скрутка из шаров тоже!), принты/наклейки/иллюстрации на коробке и шарах, цвета, декор, паутину, логотипы, типичные сочетания
  • Принт на коробке-сюрпризе = тот же character, что и фольгированная фигура: герой на стенке/крышке коробки ОБЯЗАТЕЛЕН в character
  • Скрутка: красная шуба + белая борода + шапка + чёрные сапоги → character «Дед Мороз» (Санта). НЕ «принцесса», не «барышня», не «для девочки» только из‑за красного
  • Снегурочка, снеговик, кошка/заяц/мишка из шаров — тоже character, не пустая строка
  • УЭНСДЕЙ / СЕМЕЙКА АДДАМС — не оставляй character пустым при готике «в общем»:
    девочка с двумя косичками, чёрное платье с белым воротником, бледное лицо; и/или чёрно-фиолетовая палитра + готический декор на коробке/шарах → character «Уэнсдей Аддамс», series_name «Уэнсдей»
    НЕ только «готический крючок» в title без персонажа («Готическая загадка» ок в title, но character всё равно «Уэнсдей Аддамс»)
    сомнение → character_confidence medium + character_alts: «Уэнсдей Аддамс», «Семейка Аддамс»
  • БУБА — не оставляй character пустым при узнаваемом принте/фигуре:
    маленький бородатый зверёк (длинная борода, большие глаза, два крупных зуба, круглый нос), часто чёрно-белый контур на коробке; рядом часто сырные треугольники/кубики с дырками → character «Буба»
    фольгированная фигура Бубы или шар поштучно с ним — тоже character «Буба»
    сомнение → character_confidence medium/low + character_alts: «Буба»
  • КОШКА vs ЗАЯЦ (скрутка) — не ставь «зайчик» любому белому зверю:
    короткие/треугольные уши, усы, круглая морда, часто букет в лапах → character «Кошка» (не «Заяц»)
    длинные уши (торчат вверх/назад, длиннее головы) → «Заяц»
    сомнение → character_confidence medium/low, character_alts: «Кошка», «Заяц»; в title/title_alts НЕ пиши «зайка/заяц», если уши короткие
  • ХАГГИ ВАГГИ vs ЧЕШИРСКИЙ КОТ — розовое сердце с улыбкой НЕ значит «Чешир»:
    гладкое розовое или синее сердце/фигура-монстр, круглые глаза, широкая улыбка в ряд зубов, без полос, усов и кошачьих ушей → character «Хагги Вагги», series_name «Poppy Playtime». НЕ «Чеширский кот», НЕ «Алиса в стране чудес», НЕ «Кот»
    полосатый кот (розово-фиолетовые полосы), кошачьи уши, усы, морда кота → character «Чеширский кот», series_name «Алиса в стране чудес»
    сомнение → character_confidence medium, character_alts: «Хагги Вагги», «Чеширский кот»; не ставь high на Чешира без полос и ушей
  • СОЛДАТ vs МУЗЫКАНТ (скрутка): автомат/винтовка (приклад, ствол, магазин, ремень), пилотка/каска, сапоги, зелёная форма → character «Солдат». НЕ скрипач и не гитарист.
    Скрипка/гитара — корпус-резонатор, гриф с головкой, струны, смычок. «Палка в руках» без корпуса ≠ инструмент.
    title: армейский крючок («На посту», «Боевой расчёт»), НЕ «Скрипичный виртуоз» / «Струнный маэстро»
  • Примеры: красно-синие шары + паутина / звезда → character «Человек-паук», series_name «Человек-паук»
  • Миньоны, Единорог, LOL, Холодное сердце, Гонщик, Пикачу, Барби, Уэнсдей, Буба — по узнаваемым признакам
  • title при зимнем герое — зимний крючок («Зимний гость», «Мешок подарков»), НЕ «Красная принцесса» / «Алая барышня»
  • series_name = франшиза/тематика (Человек-паук, Marvel, Миньоны, Уэнсдей…), не «День рождения»
  • character = конкретный герой по-русски («Человек-паук», не Spider-Man; «Уэнсдей Аддамс», не Wednesday), если героя нет — пустая строка
  • character_confidence / series_confidence: high если уверен, medium если вероятнее всего, low если сомневаешься
  • При medium/low ОБЯЗАТЕЛЬНО заполни character_alts / series_alts (2–3 варианта для выбора оператором)
  • При high тоже можно дать 1 alt, если есть близкий синоним
  • НЕ выдумывай героя без признаков на фото
  • Мишка/зайчик/сердце на выписке — character = «Мишка»/«Зайчик» и т.п. (это персонаж карточки), не франшиза Marvel
  • На ЛЮБОЙ полке (включая «Универсальные», «1 годик», выписку, «Коробка-сюрприз», «Шары поштучно») — если на фото есть узнаваемый фольгированный зверёк/герой ИЛИ принт героя на коробке/шаре (в т.ч. один шар поштучно), character ОБЯЗАТЕЛЕН: карточка попадёт в раздел «Персонажи»
  • series_name — франшиза или та же тема; если франшизы нет — можно пусто или имя зверя
- age_group: ОБЯЗАТЕЛЬНО одно значение из списка:
  • выписка / 1 годик → «Для малышей»
  • для девочки|мальчика|геймерам / мультики / детский стиль → «Для детей»
  • детский герой (LOL, Барби, единорог, Пикачу, Человек-паук и т.п.) и цифра одна или меньше 16 → category «Для девочки» или «Для мальчика», age_group «Для детей». ЗАПРЕЩЕНО «Для неё», «Для него» и «Для взрослых». «Для мамы» и праздники не подменяй
  • юбилей (круглые 10/20/30…): category «Юбилей», возраст ПО ФОТО — не всегда «Для взрослых».
    10 + герои/мульт/Поттер/«Для девочки|мальчика» → «Для детей».
    20+ без детского героя → «Для взрослых». Кубок/виски/«Для него|неё» → «Для взрослых».
    НЕ ставь «Для взрослых» только из‑за полки «Юбилей»
  • «Универсальные»: возраст ПО ФОТО — детский стиль/звери/герои → «Для детей»; нейтральные шары или цифры возраста взрослого (18, 28, 35…) → «Для взрослых». НЕ ставь «Для детей» по умолчанию только из‑за полки «Универсальные»
  • «Для любого возраста» — только если совсем неоднозначно
- occasion и target_audience: ВСЕГДА оставляй пустыми (повод/аудитория — только category и tags; свободные поля в админке убраны)
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
- НЕ возвращай article и price${holidayRule}${boxRule}${bouquetRule}${figuresRule}${photozoneRule}`;

  const takenBlock = takenTitles.length
    ? `Уже занятые названия в каталоге (НЕ предлагай эти и похожие):\n${takenTitles.slice(0, 80).map((t) => `• ${t}`).join('\n')}`
    : 'Занятых названий пока нет.';

  const trustedNum = trustedDigits ? parseInt(trustedDigits, 10) : 0;
  const foilFact = trustedDigits
    ? `
ЦИФРЫ НА ФОТО УЖЕ ПРОЧИТАНЫ ОТДЕЛЬНО — это факт, не пересчитывай и не отбрасывай цифру:
foil_digits = "${trustedDigits}" (число ${trustedNum}).
Две фольгированные цифры — одно число слева направо: «4» и «5» = 45, это НЕ пять лет и НЕ одна цифра 5.
- title и title_alts БЕЗ числа, возраста, «лет», «пятилетний», «на ${trustedNum} лет», «шестнадцать» и любых числительных
- ${JUBILEE_FOIL_NUMBERS.has(trustedDigits)
      ? 'Круглая дата: category «Юбилей».'
      : trustedDigits === '1'
        ? 'Одна цифра 1: category «1 годик».'
        : trustedNum >= 16
          ? 'Взрослый возраст. ЗАПРЕЩЕНО «Для девочки», «Для мальчика», «1 годик» и «Юбилей». Розовый/сердечки → «Для неё», явный мужской стиль → «Для него», иначе «Универсальные». age_group = «Для взрослых».'
          : 'Детская цифра. НЕ ставь «Юбилей». Детский герой (LOL, Барби, единорог, мульт) → «Для девочки» или «Для мальчика», age_group «Для детей». ЗАПРЕЩЕНО «Для неё», «Для него» и «Для взрослых».'}`
    : '';

  const userPrompt = `Сгенерируй карточку:${foilFact}
Подсказка названия: ${title_hint || 'не указано'}
Цена (₽): ${priceNum > 0 ? priceNum : 'не указана'}
Сырой состав от пользователя (оформи красиво, исправь орфографию, числа сохрани; скобки-подсказки уже убраны): ${rawComposition || 'не указан'}
${hintsBlock}
Сцена Studio Pro: ${scene || 'floor'}
Подсказка типа изделия для tags: ${['wall_only', 'unit_balloon'].includes(scene) ? 'НЕ ставь «Напольные композиции»' : (typeHint || 'по фото')}
${holidayOnly ? `Праздничная/тематическая категория (обязательно): ${holidayOnly}` : ''}
${boxOnly ? 'В составе коробка — category и tags только «Коробка-сюрприз». age_group обязателен.' : ''}
${bouquetOnly ? 'Это букет из шаров без тематики в скобках — category и tags только «Букет из шаров».' : ''}
${figuresOnly ? 'Это фигура из шаров без тематики в скобках — category и tags только «Фигуры из шаров».' : ''}
${photozoneOnly ? 'Это фотозона. В tags всегда «Фотозона». Если foil_digits=1 — category «1 годик» + тег Фотозона, иначе category «Фотозона».' : ''}
${takenBlock}
${image_url
    ? (holidayOnly || boxOnly || bouquetOnly || figuresOnly
      ? 'Фото приложено — опиши товар в short/full description. ОБЯЗАТЕЛЬНО age_group. НЕ заполняй target_audience и occasion.'
      : (photozoneOnly
        ? 'Фото приложено — category/tags только «Фотозона». ОБЯЗАТЕЛЬНО age_group и character/series по фото. target_audience и occasion пустые. Имена/цифры на круге — пример персонализации, не в title.'
        : 'Фото приложено — ОБЯЗАТЕЛЬНО foil_digits. Имя на надписи учитывай для пола. Детская карточка без повода: розовая палитра → «Для девочки», голубая/синяя → «Для мальчика», смесь или без одного цвета → «Универсальные». Юбилей (10/20/40…) + явный мужской стиль (кубок, мяч…) → tags ["Юбилей","Для него"]; category остаётся «Юбилей». Некруглые цифры → не юбилей. Имя с шара НЕ в title. age_group обязателен. Персонаж/серия по фото. Сомневаешься — medium/low + alts. Логотипы игнорируй.'))
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
  }, env, image_url ? 55000 : 25000);

  if (aiResp.error) {
    console.error('NordRouter API error:', aiResp.error);
    return json({ ok: false, error: 'NordRouter API ошибка: ' + (aiResp.error.message || JSON.stringify(aiResp.error)) }, 502);
  }

  const text = aiResp.choices?.[0]?.message?.content || '';
  if (!text) {
    return json({ ok: false, error: 'AI не вернул ответ' }, 502);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'AI вернул некорректный JSON: ' + text.slice(0, 200) }, 502);
  }

  data = sanitizeCardMetadata(data, scene || 'floor', priceNum, rawComposition, takenTitles);
  if (holidayOnly) {
    applyHolidayOnlyCard(data, holidayOnly);
  } else if (boxOnly) {
    applyTypeOnlyCard(data, 'Коробка-сюрприз');
    if (!data.age_group || data.age_group === 'Для любого возраста') {
      data.age_group = 'Для детей';
    }
  } else if (bouquetOnly) {
    applyTypeOnlyCard(data, 'Букет из шаров');
  } else if (figuresOnly) {
    applyTypeOnlyCard(data, 'Фигуры из шаров');
  } else if (photozoneOnly) {
    applyTypeOnlyCard(data, 'Фотозона');
  } else {
    applyDischargeCategoryPriority(data, rawComposition);
  }
  // Отдельное чтение цифр важнее того, что карточка угадала сама
  if (trustedDigits) data.foil_digits = trustedDigits;
  // Цифра на фото не перебивает коробку/букет/фигуру
  const foilDigits = takeFoilDigits(data);
  if (!boxOnly && !bouquetOnly && !figuresOnly) {
    applyFirstBirthdayFromFoilDigit(data, foilDigits);
    applyJubileeFromFoilDigits(data, foilDigits);
  }
  applyOccasionShelfCard(data);
  applyJubileeAgeFromPhoto(data, foilDigits);
  applyPhotozoneTypeTag(data, scene || 'floor', rawComposition);
  // Свободные поля occasion / target_audience в админке убраны
  data.occasion = '';
  data.target_audience = '';
  if (!data.age_group || data.age_group === 'Для любого возраста') {
    const autoAge = ageFromCategory(data.category);
    if (autoAge) data.age_group = autoAge;
  }
  const foilLock = !!(holidayOnly || boxOnly || bouquetOnly || figuresOnly || photozoneOnly);
  applyTrustedFoilReading(data, trustedDigits || foilDigits, { lockCategory: foilLock });
  applyKidsHeroChildDigit(data, trustedDigits || foilDigits, { lockCategory: foilLock });
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

function sanitizeCompositionDigitLines(lines, rawComposition) {
  const raw = String(rawComposition || '').toLowerCase().replace(/ё/g, 'е');
  const userMentionedDigit = /цифр/.test(raw);
  const userAskedTwo = /(?:^|[^\d])2\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(raw)
    || /(?:^|[^а-яa-z0-9])две\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(raw);
  return (lines || []).map((line) => String(line || '').trim()).filter(Boolean).flatMap((line) => {
    const t = line.toLowerCase().replace(/ё/g, 'е');
    if (!/цифр/.test(t)) return [line];
    if (!userMentionedDigit) return [];
    if (userAskedTwo) return ['2 цифры'];
    return ['цифра'];
  });
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
  // Стена / поштучно — не полка «Напольные композиции»
  if (['wall_only', 'unit_balloon'].includes(scene)) {
    tags = tags.filter((t) => t !== 'Напольные композиции');
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
    data.composition = sanitizeCompositionDigitLines(data.composition, rawComposition);
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
    const autoAge = ageFromCategory(data.category);
    if (autoAge) data.age_group = autoAge;
    else {
      const tagBlob = (Array.isArray(data.tags) ? data.tags : []).join(' ');
      if (/Для девочки|Для мальчика|Универсальные|Коробка-сюрприз|Фотозона/.test(tagBlob)) {
        data.age_group = 'Для детей';
      }
    }
  }

  applyDischargeCategoryPriority(data, rawComposition);
  // Пустая category → «Универсальные» (не оставляем карточку без полки)
  if (!data.category) {
    const fromTags = (data.tags || []).find((t) => AUDIENCE_CATEGORIES.includes(t));
    data.category = fromTags || 'Универсальные';
  }
  if (data.category === 'Универсальные' && Array.isArray(data.tags)) {
    if (!data.tags.includes('Универсальные')) data.tags.unshift('Универсальные');
    data.tags = [...new Set(data.tags)].slice(0, 5);
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
Категории: Для девочки, Для мальчика, Универсальные, Для неё, Для мамы, Для него, Геймерам, Юбилей, 1 годик, Крещение, Гендер-пати, На выписку, Свадьба и девичник, Выпускной, Новый год, 14 февраля, 23 февраля, 8 марта, 1 сентября, Фигуры из шаров, Напольные композиции, Букет из шаров, Цветы из шаров, Крафтовый букет, Коробка-сюрприз, Фотозона, Арка из шаров, Шары поштучно.
Приоритет: выписка/метрики рождения/«добро пожаловать домой» → category «На выписку» (пол — в tags). Нейтральное детское без явного пола → «Универсальные». Не используй «Шар-сюрприз».`
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
  }, env, 30000);

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
- when uncertain about a product print or balloon count, keep the original — do NOT guess or embellish

GENDER / AUDIENCE PALETTE LOCK (critical — common failure):
- Keep the product's gender coding and color family EXACTLY as in the source
- Pink / lilac / rose / “для девочки” sets stay in that family — NEVER recolor toward blue/teal/navy “boy” tones
- Blue / teal / navy / green / “для мальчика” sets stay in that family — NEVER recolor toward pink/lilac/rose “girl” tones
- Character sets (Minions yellow-gold, Marvel, etc.) keep their franchise colors — do not “soften” into a different audience palette
- Recipient names and greetings on the box/balloons stay EXACTLY as printed — do not invent a different name or switch implied gender
- FORBIDDEN: flipping masculine↔feminine palette, “beautifying” by swapping audience colors, inventing a different birthday recipient`;

  const logoClean = `ALLOWED EXCEPTION — REMOVE supplier / marketplace packaging overlays and watermarks (critical for catalog photos, especially «шары поштучно» / unit balloons from Sima-land and similar):
REMOVE completely (inpaint as if never there):
- Corner and floating badges/boxes: brand logos (MARVEL, Disney, etc. as separate rectangular stickers on the photo), size labels («12" / 30 CM», «18"», diameter), usage labels («ДЛЯ ГЕЛИЯ И ВОЗДУХА», «для гелия», «воздух», helium/air icons)
- Marketplace / shop watermarks and URLs anywhere on the image: sima-land.ru, wildberries, ozon, sharomem.ru, sharomen.ru, Instagram/VK handles, translucent stamps, shop names, banners
- Small © copyright stamps and supplier URL text overlaid on or near balloons that are NOT part of the balloon's own printed design
- Any colored pill/rectangle with white text glued onto the catalog photo (packaging chrome), not printed into the latex/foil artwork
- Circular / round hang tags and brand discs on ribbons or wrap (shop logos like «МАИК», heart+name discs, cardboard circle tags, plastic logo badges dangling from the bouquet)
Erase each hang-tag IN PLACE (inpaint the ribbon or balloon that was already under it). NEVER relocate, reattach, or carry a tag onto another balloon, another ribbon, or a new spot in the frame. A moved tag is a failure.
Inpaint the wall / balloon / ribbon surface underneath cleanly — no blur blotches, no leftover letters or half a circle.
KEEP: Spider-Man / character art printed ON the balloon latex or foil; decorative words that are clearly part of that print (e.g. «HERO» baked into the balloon design); bubble lettering and custom personalization on the product itself; foil heart texts that are printed ON the balloon face.`;

  const peopleClean = `ALLOWED EXCEPTION — REMOVE REAL PEOPLE (critical for catalog):
REMOVE completely (inpaint as if they were never in the photo):
- Every real human: woman, man, child, model posing with balloons, photographer, bystander
- Face, hair, torso, legs, full body, silhouette, shadow of a person on wall/floor
- Clothes that belong to a person (dress, jeans, shoes) — not balloon wrap
KEEP the balloon product; fill the hole with studio wall / laminate / more of the same balloons already in the set.
Do NOT confuse: foil/latex balloon sculptures, printed cartoon characters ON balloons, and balloon “фигуры из шаров” are PRODUCT — keep them. Only living photographed people go.
FORBIDDEN leftover: ghost face, floating hair, half a dress, a person cropped at the edge.`;

  const forbidden = `FORBIDDEN: people / models / faces / full human bodies in the catalog photo, sticker/cutout appearance, white or dark halo, invented text, changed colors, gender/audience palette flip (pink↔blue, boy↔girl tones), plastic CGI look, furniture, mirrors, vanity light frames, window, curtains from the original room, melting ribbons, harsh cast shadows, yellow/orange color cast, duplicate objects, collage, copying mirror reflections as extra balloons, dark moody look, evening lighting, underexposure, extra balloons, denser balloon columns than the original, new mini filler balloons, new foreground balloon clusters, inventing extra foil hearts/figures, objects not present in the original, store watermarks, supplier packaging badges, size/helium labels, marketplace URL overlays (sima-land.ru etc.), leftover half-erased text, circular shop hang-tags on ribbons`;

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

  /** Зеркало: отражение ≠ товар. Не оставлять «фантомные» шары из стекла. */
  const mirrorHazard = `MIRROR / VANITY BEHIND THE PRODUCT — CRITICAL (common failure mode):
- Full-length mirrors, vanity mirrors with light bulbs, dressing tables, LED strip frames = ROOM BACKGROUND ONLY — REMOVE completely and replace with the VigSharm studio wall + laminate from the SECOND reference
- ONLY balloons that physically stand IN THE ROOM in front of the mirror are the real product (ribbons go down to weights on the real floor)
- Balloons that appear ONLY inside the mirror glass are REFLECTIONS — NOT product. Do NOT count them. Do NOT copy them into the studio scene
- Example: one red foil heart in front of the mirror + the same heart visible again in the reflection → output EXACTLY ONE heart (drop the reflection)
- Same for any foil figure / latex cluster: if a duplicate exists only as a reflection, discard the duplicate when removing the mirror
- Keep real product balloons pixel-faithful (shapes, colors, prints, ribbons, weights) — but count REAL items only, not mirror ghosts
- Do NOT “rebuild” or beautify the bouquet while removing the mirror — erase glass/frame/furniture, drop reflection-only balloons, inpaint studio wall behind the real product
- FORBIDDEN: inventing extra foil hearts/figures from the reflection; keeping two copies of an item that was one real + one reflection; changing Superman/chrome layout while clearing the mirror`;

  if (scene === 'handheld_bouquet') {
    return `Rephotograph this VigSharm balloon BOUQUET for a square catalog card — Manus style: bouquet held by a FEMALE HAND ONLY against the studio wall (no model, no face, no body).

TASK:
1. Replace the background with the SECOND reference image — VigSharm studio WALL ONLY (warm beige-grey plaster). NO floor, NO baseboard, NO laminate, NO furniture.
2. The PRODUCT is only the balloon bouquet: balloons, wrap, bow, and ribbons. DELETE every support and room prop from the source — easel, wooden tripod legs, crossbar, vase, glass, table, houseplant, mirror, vanity light bulbs, furniture, floor. Do NOT carry the stand or vase into the studio. The hand holds the bouquet itself.
3. The bouquet must be HELD by ONE realistic adult FEMALE hand (woman's hand only — never male, never child's) the way a person standing BESIDE the bouquet would hold a gift: hand enters from the LEFT or RIGHT at the wrap, fingers around the gathered stems under the bow. NOT a hand rising from the bottom. NOT a vertical stick grip. NOT a floating wrist with empty wall under it.
4. If the original shows a person (woman, girl, man, child) standing with the balloons: DELETE the entire person — face, hair, torso, legs, clothes. Keep ONLY a correct female HAND + short wrist at the bouquet base. Inpaint studio wall where the body was.
5. If a hand is already in the original: keep the grip idea but REPLACE with a correct female hand/wrist if the original looks male, CGI, crooked, or stretched. Fix lighting to match the studio.
6. If there is NO hand in the original, ADD one photoreal female hand holding the bouquet base — physically gripping the ribbons, same light as the product — NOT a sticker, NOT a separate cutout plate, NOT floating.
7. REMOVE any circular hang-tag / logo disc on the ribbons or wrap (shop brand tags). Replace with clean ribbons only.

FRAMING — ribbons fully inside, arm exits the side:
- Ribbon tails hang freely BELOW the hand and end in visible pointed tips. Leave about 8% empty wall under the lowest ribbon tip. Do not cut ribbons on the bottom edge.
- The hand and wrist are fully visible. The short forearm leaves through the LEFT or RIGHT edge, toward where the person would stand. It does NOT leave through the bottom and does NOT stop in mid-air above a wall band.
- If the bouquet is tall, SCALE IT DOWN so every ribbon tip stays inside. Do NOT zoom until the ribbons are cut off.

${lock}

${logoClean}

HAND — critical anatomy (allowed exception — only this may be added/replaced):
- ONE woman's hand only: feminine proportions, natural nails, soft skin — NEVER a man's hand
- Natural side hold: the person is cropped out, only the hand remains. Fingers wrap the gathered stems at the wrap, thumb on the near side. The bouquet hangs in the hand; ribbons fall past the fist.
- Forearm is SHORT and enters from the left or right side of the frame, roughly horizontal or a gentle diagonal, then the hand turns up to hold the stems. NEVER a vertical forearm rising from the bottom center. NEVER a long arm slashing in from a corner.
- Wrist and fingers stay fully inside. Only the forearm may leave the side edge.
- NEVER show a face, head, shoulders, torso, or full model posing next to the bouquet
- Correct perspective: hand size matches bouquet base
- No rubbery stretch, no liquid morphing, no extra-long forearm diagonally across the frame
- Match skin lighting to soft studio daylight on the balloons
- Do not cover balloon faces or printed foil text with fingers
- Optional plain sleeve at wrist OK; no logos on sleeve

${light}
Do NOT add artificial balloon shadows on the wall. Soft natural contact only where hand/ribbons need grounding.

FORBIDDEN: full person / model / face / body in frame, floor, baseboard, laminate, easel, wooden stand, tripod legs, vase, glass, table, houseplant, mirror, vanity lights, furniture, cropped ribbon tails, hand rising from the bottom, vertical stick grip, floating wrist with empty wall under it, sticker/cutout look, white halo, invented balloon text, changed balloon colors/counts, extra balloons, plastic CGI, collage of a pasted fist, dark moody grade, store watermarks, supplier logos, circular hang-tags, male hand, child's hand, stretched/elongated forearm, long diagonal arm from a corner, warped anatomy.

OUTPUT: one square 1:1 catalog photo — studio wall, bouquet held from the side by one female hand, forearm leaving the left or right edge, ribbon tails fully visible with wall under the tips, NO hand from the bottom, NO easel/vase/room props, NO person/face/body, no hang-tags, bright and sharp.`;
  }

  if (isWallOnlyScene(scene)) {
    const unit = scene === 'unit_balloon';
    return `Rephotograph this VigSharm balloon product for a square catalog card — Manus style: one REAL photograph shot by a professional product photographer in a commercial catalog studio (NOT a cutout/sticker composite, NOT a phone snap in a dark room).

TASK:
1. Replace ONLY the room/background with the SECOND reference image — VigSharm studio WALL section (warm light beige-grey plaster).
2. NO floor, NO baseboard, NO laminate, NO furniture, NO LED strips from the original room.
3. Keep the product as one continuous photograph in the new room — remove cutout halo, white fringe, hard sticker edges.
4. Do NOT add a hand. Do NOT add balloons, bows, or ribbons that were not in the original. REMOVE every real person from the source (model, child, photographer) — product and studio wall only.
${unit ? `5. UNIT / «шары поштучно» SOURCE PHOTOS often come from marketplace catalogs (Sima-land etc.) with heavy packaging overlays — you MUST strip ALL of them (MARVEL/Disney badge boxes, «ДЛЯ ГЕЛИЯ И ВОЗДУХА», size «12" / 30 CM», sima-land.ru / © stamps) while keeping the balloon artwork itself.` : ''}

STUDIO LOOK (critical — fix dark muddy walls):
- Shoot like a pro e-commerce session: softboxes + large soft daylight, high-key bright catalog lighting
- Wall must read as LIGHT bright beige-grey — lift wall exposure to match (or brighter than) the reference plaster; NOT taupe, NOT grey-brown, NOT underexposed
- Even illumination across the whole wall; no vignette, no muddy patches, no dirty fill artifacts
- Neutral white balance; foil/chrome stay vivid; bubble balloons stay clear and bright
- Clean commercial finish — as if for a premium balloon shop lookbook

${lock}

${logoClean}

${peopleClean}

EXTRA LOCK for bubble / chrome / tulle sets:
- Exact count of balloons INSIDE any clear bubble balloon
- Exact lettering on bubble balloons — every character identical
- Black tulle bows, mesh ribbons, curls — keep separate strands, do not melt or smear
- Sphere edges stay round — never flatten or clip

Minimal soft edge integration only — no graphic drop shadow on the wall.

FORBIDDEN: people / models / faces, dark/muddy/taupe wall, underexposed background, floor, baseboard, laminate, sticker/cutout look, white/dark halo, invented text, changed balloon counts (including inside bubbles), melting tulle, plastic CGI, adding a hand, dark moody cinematic grade, store watermarks, supplier packaging badges, size/helium labels, marketplace URLs, leftover half-erased text.

OUTPUT: one square 1:1 bright professional catalog photo — ${unit ? 'single balloon / small set' : 'full product'} large in frame on a LIGHT studio wall only${unit ? ', with zero packaging badges or marketplace watermarks' : ''}.`;
  }

  if (scene === 'photozone') {
    if (photozoneType === 'easel') {
      return `Edit the provided photozone on an EASEL (~1.8 m tall) with polystyrene circle for a square VigSharm catalog card. Change ONLY the room background, lighting, and distance to the wall.

${lock}

${logoClean}

${peopleClean}

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

${peopleClean}

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

${peopleClean}

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

  return `Edit the provided floor-standing balloon composition photo for a square VigSharm catalog card. Change ONLY the room background and lighting — NEVER rebuild the balloon product.

${lock}

${logoClean}

${peopleClean}

${mirrorHazard}

Use the SECOND reference image as the real VigSharm studio environment — match it as closely as possible: warm beige-grey wall, white baseboard, LIGHT pale-oak / light grey-beige laminate floor with horizontal planks.

WHAT MOVES INTO THE STUDIO — product only:
- Carry ONLY the product: balloons, ribbons, balloon weights that belong to those balloons, and a gift / surprise box when it is part of the composition (printed birthday box, open lid with balloons).
- Room props are NOT product. DELETE them in place — do NOT translate them with the composition: vase, glass, dried flowers, pampas grass, houseplant, random object on the floor, decor that is not tied to the balloons.
- Hang-tags / бирки: do not move them. Erase each tag where it already hangs (ribbon or balloon underneath) OR leave it pixel-locked on the SAME balloon. FORBIDDEN: a tag in a new position, on a different balloon, or dangling in empty space.

SUPPORT — remove furniture, keep the balloon base and any gift box that IS the product:
- REMOVE any non-balloon support under or around the composition: small table, stolik, glass table, wire stand, metal rack, stool, chair, crate, furniture legs — as if never there.
- A printed gift / surprise box that holds or presents the balloons is PRODUCT — keep it. Do NOT delete it as furniture.
- Place the EXISTING balloon base (green / bottom cluster already in the photo) DIRECTLY on the laminate floor.
- Soft contact shadow ONLY under those original base spheres that touch the floor — no large dark pool.
- Do NOT invent a new stand. Do NOT invent NEW balloons under the base.
- After removing the table: the lowest balloons that already existed must sit on the floor unchanged — zero added balloons below them.

${nearWall}
When sliding the product toward the wall, slide ONLY the product unit above. Leave room props behind and delete them. Do not drag a vase, pampas, plant, or stray floor object into the studio.

SCALE: floor composition should fill approximately 70–85% of frame height — not a small object floating in empty room.

${brightLight}

${brightFloor}

${forbidden}

OUTPUT: one square 1:1 professional catalog photo — SAME balloon product as source (exact counts), gift box kept if it is part of the set, studio room only, large near the wall on LIGHT laminate, no table or furniture under the base, no vase / pampas / stray floor props, no relocated hang-tags, natural catalog light.`;
}

/** Flux edit limit is 5000 characters. Keep this well under that. */
function buildFluxPrompt(scene) {
  const room = ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene)
    ? 'Replace the room with the SECOND reference: warm light beige-grey studio WALL only. No floor, no baseboard, no laminate.'
    : 'Replace the room with the SECOND reference: warm light beige-grey wall, white baseboard, LIGHT pale-oak laminate. Put the product close to the baseboard.';
  const extra = scene === 'handheld_bouquet'
    ? 'Bouquet held by one adult female hand from the left or right. No face, no body. Ribbon tips stay inside the frame.'
    : scene === 'unit_balloon'
      ? 'Single balloon or small set. Strip marketplace badges, size labels, and watermarks. Keep the balloon print.'
      : '';
  return `Edit this VigSharm catalog photo. Change only the room and lighting. Do not rebuild the product.

${room}
Square 1:1, bright natural catalog light, soft contact shadow only. Real photo, not CGI.

KEEP exactly: balloon count, colors, shapes, prints, foil characters, ribbons, and a gift box if it is part of the set.
Keep the same gender/audience palette as the source (no pink↔blue or boy↔girl color flip; names on the product stay identical).
DELETE in place, do not move: vase, glass, pampas, dried flowers, plants, stray floor objects, tables, chairs, mirrors, real people.
Hang-tags: erase where they hang or leave them on the same balloon. Never move a tag.
Do not add balloons. Do not copy mirror reflections.
${extra}`.trim();
}

function buildRephotographAttempts(imageUrl, referenceUrl, prompt, resolution = '2K', prefer = 'quality', scene = 'floor') {
  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';
  const wallOnly = ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  const wallHint = '\n\nTarget room: VigSharm studio wall from the SECOND reference — warm light beige-grey plaster, natural catalog softbox daylight (not overexposed wash). Copy reference wall tone; do NOT darken into taupe/muddy grey and do NOT blow out to pure white. NO invented mottled/smudged wall.';
  const floorHint = '\n\nTarget FLOOR from the SECOND reference — LIGHT pale oak / light grey-beige laminate matching reference brightness. Place ONLY the product CLOSE to the white baseboard (short floor strip only — not mid-room): balloons, ribbons, their weights, and a gift/surprise box if it is part of the composition. DELETE room props in place — do NOT move them with the product: vase, glass, dried flowers, pampas grass, houseplant, random floor object. Hang-tags: erase in place or keep pixel-locked on the same balloon — NEVER relocate a tag. Soft contact shadows only under the original balloon base. REMOVE any table, stolik, glass table, stool, chair, wire stand or other furniture from the source — the existing balloon base sits directly on the laminate. A printed gift box that presents the balloons is PRODUCT, not furniture — keep it. Do NOT invent new balloons under the base. FORBIDDEN: dark brown/charcoal laminate; large empty floor toward the wall; keeping a table under the product; carrying a vase/pampas/stray object into the studio; a hang-tag moved to a new spot or another balloon; any real people/models in the frame. If source has a person posing with balloons: erase them completely, keep only the balloon product. If source has a mirror/vanity: remove it; count ONLY real balloons on the floor in front of the glass — NEVER copy balloons that exist only as mirror reflections (e.g. one real heart + reflection → output one heart).';
  const roomHint = wallOnly ? wallHint : (wallHint + floorHint);
  const attempts = [];

  const pushBanana = () => {
    attempts.push({
      model: 'image/nano-banana-2',
      input: {
        prompt: prompt + (wallOnly ? '' : floorHint),
        image: imageUrl,
        aspect_ratio: '1:1',
        reference_image: referenceUrl
      }
    });
    attempts.push({
      model: 'image/nano-banana-edit',
      input: {
        prompt: prompt + (wallOnly ? '' : floorHint),
        image: imageUrl,
        reference_image: referenceUrl
      }
    });
  };

  // Mid-run fallback: Flux only. This model rejects prompts over 5000 characters.
  if (prefer === 'flux') {
    const fluxPrompt = buildFluxPrompt(scene);
    console.log('[Studio Rephotograph] flux prompt chars=', fluxPrompt.length);
    attempts.push({
      model: 'image/flux2-pro-edit',
      input: {
        prompt: fluxPrompt,
        image: imageUrl,
        reference_image: referenceUrl,
        aspect_ratio: '1:1',
        resolution: res === '4K' ? '2K' : res
      }
    });
    return attempts;
  }

  // Job-level fallback path: only proven banana (after gpt/flux failed mid-run)
  if (prefer === 'banana' || prefer === 'fast') {
    pushBanana();
    return attempts;
  }

  // One model per request. Client starts flux, then banana, if this job fails.
  // A long chain in one Worker call gets cut by Cloudflare (browser then shows a CORS error).
  attempts.push({
    model: 'image/gpt-image-2.5-sunburst-edit',
    input: {
      prompt: prompt + roomHint,
      image: imageUrl,
      reference_image: referenceUrl,
      aspect_ratio: '1:1',
      resolution: res
    }
  });
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
  return attempts;
}

async function handleStudioRephotograph(request, env) {
  const body = await request.json();
  const { image_url, reference_url, scene = 'floor', resolution = '2K' } = body;
  const prefer = body.prefer === 'banana' || body.prefer === 'fast'
    ? 'banana'
    : (body.prefer === 'flux' ? 'flux' : 'quality');
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
    try {
      generateResp = await nordRequest('/media/generate', 'POST', {
        model: attempt.model,
        input: attempt.input
      }, env);
    } catch (err) {
      generateResp = { error: { message: err.message || String(err) } };
    }

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

SCENE: ${scene === 'handheld_bouquet' ? 'wall only; FEMALE hand + short wrist ONLY — no face, no body, no full model; remove circular hang-tags on ribbons' : 'wall only — no floor, no people'}.`;
}

function buildEnhancePrompt(scene, mode = 'rephotograph') {
  if (mode === 'gentle') {
    return buildGentleEnhancePrompt(scene);
  }
  if (mode === 'bg_lock') {
    return `VigSharm balloon catalog — background integration ONLY.

This image is a composite: REAL product (foil balloons, gift box, latex) already cut and placed on the VigSharm studio reference room.

ABSOLUTE PRODUCT LOCK (copyright-safe — do not regenerate characters):
- Keep EVERY product pixel unchanged: foil figures, cartoon prints, gift-box lettering, ribbons, balloon colors/counts/shapes
- Do NOT redraw, restyle, beautify, or invent Disney/Marvel/cartoon characters
- Do NOT move or resize the product plate

ONLY change the ROOM around the product:
- Continuity of warm beige-grey wall + white baseboard + light pale-oak laminate (match a real studio photo)
- Remove white cutout halo / sticker fringe along the silhouette
- Soft realistic contact shadows on the floor under product contact points
- Match softbox catalog daylight on wall/floor only

FORBIDDEN: full rephotograph of the product, new balloons, text changes, plastic CGI rewrite of foil art, people/models.

SCENE: ${scene || 'floor'}. Output one square 1:1 real catalog photograph.`;
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
- If any real person remains in the frame (face, body, model posing): REMOVE them completely; keep only the balloon product in the studio
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
  const { image_url, scene = 'floor', resolution = '2K', reference_url = null } = body;
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
  const referenceUrl = reference_url || null;

  // bg_lock: models less likely to refuse characters; prefer banana/seedream/flux over GPT
  const enhanceAttempts = mode === 'bg_lock'
    ? [
        {
          model: 'image/nano-banana-2',
          input: {
            prompt,
            image: image_url,
            aspect_ratio: '1:1',
            ...(referenceUrl ? { reference_image: referenceUrl } : {})
          }
        },
        {
          model: 'image/nano-banana-edit',
          input: {
            prompt,
            image: image_url,
            ...(referenceUrl ? { reference_image: referenceUrl } : {})
          }
        },
        {
          model: 'image/seedream-5.0-pro-edit',
          input: { prompt, image: image_url, aspect_ratio: '1:1', quality: 'high' }
        },
        {
          model: 'image/flux2-pro-edit',
          input: {
            prompt: prompt.slice(0, 4800),
            image: image_url,
            aspect_ratio: '1:1',
            resolution: res === '4K' ? '2K' : res,
            ...(referenceUrl ? { reference_image: referenceUrl } : {})
          }
        },
        {
          model: 'image/qwen3-pro-edit',
          input: { prompt, image: image_url }
        }
      ]
    : mode === 'gentle'
    ? [
        { model: 'image/nano-banana-edit', input: { prompt, image: image_url } },
        { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
        { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url } },
        { model: 'image/nano-banana-pro', input: { prompt, image: image_url } }
      ]
    : [
        { model: 'image/gpt-image-2.5-sunburst-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
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
  const key = decodeURIComponent(path.split('/').pop() || '');
  const product = await getProductBySlugOrId(env, key);
  if (!product) return json({ ok: false, error: 'Not found' }, 404);
  return json({ ok: true, product });
}

/** Товар по slug (сначала) или по id. */
async function getProductBySlugOrId(env, key) {
  const k = String(key || '').trim();
  if (!k || !env.DB) return null;
  let row = await env.DB.prepare(
    'SELECT * FROM products WHERE slug = ? LIMIT 1'
  ).bind(k).first();
  if (!row) {
    row = await env.DB.prepare(
      'SELECT * FROM products WHERE id = ? LIMIT 1'
    ).bind(k).first();
  }
  if (!row) return null;
  return parseProduct(row);
}

async function handleCreateProduct(request, env) {
  try {
    const data = await request.json();

    const photos = Array.isArray(data.photos) ? data.photos : [];
    // Без Cloudinary фото хранятся прямо в товаре как dataURL — это ок, если
    // они уже сжаты на устройстве. Отклоняем только неадекватно большие файлы.
    const MAX_DATA_URL_LEN = 700 * 1024;
    const hugeDataUrl = photos.find(u => typeof u === 'string' && u.startsWith('data:') && u.length > MAX_DATA_URL_LEN);
    if (hugeDataUrl) {
      return json({
        ok: false,
        error: 'Фото слишком большое (без Cloudinary). Сожмите фото и загрузите заново.'
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

    const MAX_DATA_URL_LEN = 700 * 1024;
    const hugeDataUrlUpdate = photos.find(u => typeof u === 'string' && u.startsWith('data:') && u.length > MAX_DATA_URL_LEN);
    if (hugeDataUrlUpdate) {
      return json({
        ok: false,
        error: 'Фото слишком большое (без Cloudinary). Сожмите фото и загрузите заново.'
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
  const now = new Date().toISOString();
  // Publish from list → back on storefront. Draft → hide via status; keep show_on_site for re-publish.
  if (status === 'published') {
    await env.DB.prepare(
      'UPDATE products SET status = ?, show_on_site = 1, updated_at = ? WHERE id = ?'
    ).bind(status, now, id).run();
  } else {
    await env.DB.prepare(
      'UPDATE products SET status = ?, updated_at = ? WHERE id = ?'
    ).bind(status, now, id).run();
  }
  return json({ ok: true });
}

// ─── Upload Photo ────────────────────────────────────────

function mediaPublicBase(env, request) {
  const configured = String(env.PUBLIC_API_BASE || '').replace(/\/$/, '');
  if (configured) return configured;
  try {
    return new URL(request.url).origin;
  } catch {
    return 'https://vigsharm-api.vigsharm.workers.dev';
  }
}

function mediaObjectKey(id, mimeType, fileName) {
  const safeId = String(id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '');
  const fromName = String(fileName || '').split('.').pop()?.toLowerCase();
  const fromMime = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  }[String(mimeType || '').toLowerCase()];
  const ext = (fromMime || (fromName && /^[a-z0-9]{2,5}$/.test(fromName) ? fromName : 'jpg'));
  return `products/${safeId}.${ext}`;
}

function yandexConfigured(env) {
  return !!(
    env.YANDEX_ACCESS_KEY_ID &&
    env.YANDEX_SECRET_ACCESS_KEY &&
    env.YANDEX_BUCKET
  );
}

function yandexPublicUrl(env, key) {
  const base = String(env.YANDEX_PUBLIC_BASE || '').replace(/\/$/, '');
  if (base) return `${base}/${key}`;
  const bucket = env.YANDEX_BUCKET;
  return `https://storage.yandexcloud.net/${bucket}/${key}`;
}

/** PUT object в Yandex Object Storage (S3 API via aws4fetch). */
async function yandexPutObject(env, key, bytes, contentType) {
  const accessKey = env.YANDEX_ACCESS_KEY_ID;
  const secretKey = env.YANDEX_SECRET_ACCESS_KEY;
  const bucket = env.YANDEX_BUCKET;
  const region = env.YANDEX_REGION || 'ru-central1';

  const client = new AwsClient({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    service: 's3',
    region
  });

  // path-style: https://storage.yandexcloud.net/bucket/key
  const url = `https://storage.yandexcloud.net/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const res = await client.fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType || 'application/octet-stream'
    },
    body: bytes
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Yandex S3 PUT ${res.status}: ${text.slice(0, 400)}`);
  }
  return yandexPublicUrl(env, key);
}

async function handleUploadPhoto(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ ok: false, error: 'No file' }, 400);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const mimeType = file.type || 'image/jpeg';
    const id = crypto.randomUUID();
    const key = mediaObjectKey(id, mimeType, file.name);

    // 1) Yandex Object Storage — основной склад (РФ, до 5000+ карточек)
    if (yandexConfigured(env)) {
      const url = await yandexPutObject(env, key, bytes, mimeType);
      console.log('Photo uploaded to Yandex', key, 'bytes=', bytes.length);
      return json({ ok: true, url, id, key, storage: 'yandex' });
    }

    // 2) Cloudflare R2 (если когда-нибудь включат карту)
    if (env.PHOTOS) {
      const r2Key = key.includes('/') ? key.split('/').pop() : key;
      await env.PHOTOS.put(r2Key, bytes, {
        httpMetadata: {
          contentType: mimeType,
          cacheControl: 'public, max-age=31536000, immutable'
        }
      });
      const base = mediaPublicBase(env, request);
      const url = `${base}/api/media/${encodeURIComponent(r2Key)}`;
      console.log('Photo uploaded to R2', r2Key, 'bytes=', bytes.length);
      return json({ ok: true, url, id, key: r2Key, storage: 'r2' });
    }

    // 3) Fallback: data URL (Studio Pro так не работает)
    const base64 = bytesToBase64(bytes);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    console.warn('No Yandex/R2 — stored as data URL, size:', base64.length);
    return json({
      ok: true,
      url: dataUrl,
      id,
      storage: 'data-url',
      warning: 'Yandex Object Storage не настроен. Задайте секреты YANDEX_* (см. scripts/setup-yandex-storage.ps1).'
    });
  } catch (error) {
    console.error('Upload error:', error);
    return json({ ok: false, error: 'Upload failed: ' + error.message }, 500);
  }
}

async function handleGetMedia(path, env) {
  if (!env.PHOTOS) {
    return json({ ok: false, error: 'R2 not configured' }, 503);
  }
  const key = decodeURIComponent(path.replace(/^\/api\/media\//, '')).replace(/^\/+/, '');
  if (!key || key.includes('..') || key.includes('/') || key.length > 180) {
    return json({ ok: false, error: 'Bad key' }, 400);
  }

  const obj = await env.PHOTOS.get(key);
  if (!obj) return json({ ok: false, error: 'Not found' }, 404);

  const headers = new Headers();
  const ct = obj.httpMetadata?.contentType || 'image/jpeg';
  headers.set('Content-Type', ct);
  headers.set('Cache-Control', obj.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  if (obj.httpEtag) headers.set('ETag', obj.httpEtag);

  return new Response(obj.body, { status: 200, headers });
}

async function handleDeletePhoto(path, env) {
  const id = path.split('/').pop();
  if (env.PHOTOS && id) {
    const raw = decodeURIComponent(id);
    const candidates = [raw];
    if (!/\.[a-z0-9]+$/i.test(raw)) {
      candidates.push(`${raw}.jpg`, `${raw}.webp`, `${raw}.png`);
    }
    for (const key of candidates) {
      try { await env.PHOTOS.delete(key); } catch (_) { /* ignore */ }
    }
  }
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

// ─── Sprint 2: Dynamic Open Graph (product.html) ─────────

const SITE_ORIGIN_DEFAULT = 'https://vigsharm.ru';
/** Origin статики без петли Worker → GitHub Pages project site */
const STOREFRONT_ORIGIN_DEFAULT = 'https://stmzrun-dev.github.io/vigsharm-shop';

/** Только превьюеры/краулеры. Не трогаем in-app браузеры (иначе ломается CSS). */
const OG_BOT_UA_RE = /WhatsApp(?:\/|Bot)|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|vkShare|VKBot|Applebot|BingPreview|Embedly|Pinterest|Redditbot|SkypeUriPreview|Googlebot|bingbot|Yandex(?:Bot|Metrika|Images)|Baiduspider|DuckDuckBot|Bytespider|PetalBot|SemrushBot|AhrefsBot|ia_archiver|Slack-ImgProxy|meta-externalagent/i;

function isProductPagePath(path) {
  return path === '/product.html' || path === '/product.html/';
}

function siteOrigin(env) {
  return String(env.SITE_ORIGIN || SITE_ORIGIN_DEFAULT).replace(/\/$/, '');
}

function storefrontOrigin(env) {
  return String(env.STOREFRONT_ORIGIN || STOREFRONT_ORIGIN_DEFAULT).replace(/\/$/, '');
}

function isOgBot(request) {
  const ua = request.headers.get('User-Agent') || '';
  if (!ua) return false;
  return OG_BOT_UA_RE.test(ua);
}

function formatPriceRu(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  return Math.round(num).toLocaleString('ru-RU');
}

function formatCompositionDesc(product) {
  let parts = product && product.composition;
  if (Array.isArray(parts)) {
    parts = parts.map((s) => String(s || '').trim()).filter(Boolean);
  } else {
    parts = String(parts || '')
      .split(/\n+|•|;/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (parts.length) return parts.join(' · ').slice(0, 300);
  const short = String(product?.short_description || product?.seo_description || '').trim();
  return short.slice(0, 300);
}

function productMainImage(product, env) {
  const candidates = [];
  if (product?.main_photo) candidates.push(product.main_photo);
  if (Array.isArray(product?.photos)) {
    for (const p of product.photos) {
      if (typeof p === 'string') candidates.push(p);
      else if (p && typeof p.url === 'string') candidates.push(p.url);
    }
  }
  for (const raw of candidates) {
    const u = String(raw || '').trim();
    if (!u || u.startsWith('data:')) continue;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    const path = u.replace(/^\.\//, '').replace(/^(\.\.\/)+/, '');
    if (path.startsWith('/')) return siteOrigin(env) + path;
    return siteOrigin(env) + '/' + path;
  }
  return siteOrigin(env) + '/images/hero-balloon-character-party.webp';
}

function buildOgFields(product, slug, env) {
  const origin = siteOrigin(env);
  const canonicalSlug = String(product?.slug || slug || '').trim();
  const pageUrl = canonicalSlug
    ? origin + '/product.html?slug=' + encodeURIComponent(canonicalSlug)
    : origin + '/product.html';
  const titleName = String(product?.title || 'Композиция из шаров').trim();
  const priceLabel = formatPriceRu(product?.price);
  const ogTitle = titleName + ' — ' + priceLabel + ' ₽ | VigSharm';
  const ogDescription = formatCompositionDesc(product)
    || 'Композиция из воздушных шаров с доставкой по Армавиру от студии VigSharm.';
  const ogImage = productMainImage(product, env);
  return { ogTitle, ogDescription, ogImage, pageUrl, titleName };
}

function setMetaContent(el, value) {
  el.setAttribute('content', value);
}

/** Относительные ссылки меню/карточек → абсолютные на боевой домен. */
function absolutizeSiteHref(href, env) {
  const t = String(href || '').trim();
  if (!t) return href;
  if (
    t.startsWith('#')
    || t.startsWith('mailto:')
    || t.startsWith('tel:')
    || t.startsWith('javascript:')
    || t.startsWith('data:')
  ) {
    return href;
  }
  if (/^https?:\/\//i.test(t) || t.startsWith('//')) return href;
  try {
    return new URL(t, siteOrigin(env) + '/').href;
  } catch (_) {
    return href;
  }
}

function stripHopHeaders(res) {
  res.headers.delete('content-encoding');
  res.headers.delete('content-length');
  res.headers.set('Content-Type', 'text/html; charset=utf-8');
}

/**
 * Shell HTML всегда с github.io (другой host → нет петли Worker).
 * Для людей: <base> на github.io, чтобы CSS/JS не зависели от CF-прокси apex,
 * а <a href> переписываем на vigsharm.ru.
 */
async function fetchProductShell(request, env, url) {
  const origin = storefrontOrigin(env);
  const target = origin + '/product.html' + (url.search || '');
  const headers = new Headers();
  const ua = request.headers.get('User-Agent');
  const accept = request.headers.get('Accept');
  const acceptLang = request.headers.get('Accept-Language');
  if (ua) headers.set('User-Agent', ua);
  if (accept) headers.set('Accept', accept);
  if (acceptLang) headers.set('Accept-Language', acceptLang);
  headers.set('Accept-Encoding', 'identity');

  return fetch(target, {
    method: 'GET',
    headers,
    redirect: 'follow',
    cf: { cacheTtl: 120, cacheEverything: true }
  });
}

function rewriteHumanProductHtml(response, env) {
  const staticBase = storefrontOrigin(env) + '/';
  return new HTMLRewriter()
    .on('head', {
      element(el) {
        el.prepend('<base href="' + staticBase + '">', { html: true });
      }
    })
    .on('a[href]', {
      element(el) {
        const href = el.getAttribute('href');
        const next = absolutizeSiteHref(href, env);
        if (next && next !== href) el.setAttribute('href', next);
      }
    })
    .transform(response);
}

function rewriteProductOg(response, fields) {
  const { ogTitle, ogDescription, ogImage, pageUrl } = fields;
  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(ogTitle);
      }
    })
    .on('meta[name="description"]', {
      element(el) { setMetaContent(el, ogDescription); }
    })
    .on('meta[property="og:title"]', {
      element(el) { setMetaContent(el, ogTitle); }
    })
    .on('meta[property="og:description"]', {
      element(el) { setMetaContent(el, ogDescription); }
    })
    .on('meta[property="og:image"]', {
      element(el) { setMetaContent(el, ogImage); }
    })
    .on('meta[property="og:url"]', {
      element(el) { setMetaContent(el, pageUrl); }
    })
    .on('meta[property="og:type"]', {
      element(el) { setMetaContent(el, 'product'); }
    })
    .on('meta[property="og:image:width"]', {
      element(el) { el.remove(); }
    })
    .on('meta[property="og:image:height"]', {
      element(el) { el.remove(); }
    })
    .on('meta[property="og:image:type"]', {
      element(el) {
        const lower = ogImage.toLowerCase();
        if (lower.includes('.png')) setMetaContent(el, 'image/png');
        else if (lower.includes('.jpg') || lower.includes('.jpeg')) setMetaContent(el, 'image/jpeg');
        else if (lower.includes('.webp')) setMetaContent(el, 'image/webp');
        else el.remove();
      }
    })
    .on('link[rel="canonical"]', {
      element(el) { el.setAttribute('href', pageUrl); }
    })
    .transform(response);
}

async function handleProductPageOg(request, env, url) {
  // Люди: HTML с github.io + base на статику GH + ссылки на vigsharm.ru.
  // Не ходим на vigsharm.ru за CSS (избегаем SSL/прокси-петли на apex).
  if (!isOgBot(request)) {
    const shell = await fetchProductShell(request, env, url);
    const out = new Response(shell.body, {
      status: shell.status,
      statusText: shell.statusText,
      headers: shell.headers
    });
    stripHopHeaders(out);
    out.headers.set('X-Vig-OG', 'passthrough');
    out.headers.set('Cache-Control', 'public, max-age=60');
    return rewriteHumanProductHtml(out, env);
  }

  const slug = (url.searchParams.get('slug') || '').trim();
  const productPromise = slug
    ? getProductBySlugOrId(env, slug).catch((e) => {
        console.error('OG product lookup failed', e);
        return null;
      })
    : Promise.resolve(null);

  const [shell, product] = await Promise.all([
    fetchProductShell(request, env, url),
    productPromise
  ]);

  // Draft / не найден — дефолтные OG из shell.
  if (!product || (product.status && product.status !== 'published')) {
    const out = new Response(shell.body, shell);
    stripHopHeaders(out);
    out.headers.set('X-Vig-OG', product ? 'draft' : 'fallback');
    out.headers.set('Cache-Control', 'public, max-age=60');
    return out;
  }

  const fields = buildOgFields(product, slug, env);
  const base = new Response(shell.body, {
    status: shell.status,
    statusText: shell.statusText,
    headers: shell.headers
  });
  stripHopHeaders(base);
  base.headers.set('Cache-Control', 'public, max-age=300');
  base.headers.set('X-Vig-OG', 'rewritten');

  return rewriteProductOg(base, fields);
}

// ─── Storefront orders ───────────────────────────────────

async function ensureOrdersTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    public_code TEXT NOT NULL,
    product_id TEXT,
    product_slug TEXT,
    product_title TEXT,
    product_sku TEXT,
    quantity INTEGER DEFAULT 1,
    digit TEXT,
    digit2 TEXT,
    digit_delta INTEGER DEFAULT 0,
    inscription TEXT,
    fulfillment TEXT,
    address TEXT,
    order_date TEXT,
    order_time TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    total INTEGER DEFAULT 0,
    price_from INTEGER DEFAULT 0,
    message TEXT,
    status TEXT DEFAULT 'new',
    ip TEXT,
    created_at TEXT,
    updated_at TEXT
  )`).run();
}

function normalizeRuPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
  if (digits.length === 10) digits = '7' + digits;
  if (digits.length === 11 && digits[0] === '7') return digits;
  return null;
}

function shortOrderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function formatRuPhone(digits) {
  if (!digits || digits.length !== 11) return digits || '';
  return '+7 ' + digits.slice(1, 4) + ' ' + digits.slice(4, 7) + '-' + digits.slice(7, 9) + '-' + digits.slice(9);
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || 'unknown';
}

function orderNotifyText(order) {
  const phoneNice = formatRuPhone(order.customer_phone);
  return [
    'Новая заявка #' + order.public_code,
    order.customer_name ? ('Имя: ' + order.customer_name) : '',
    'Телефон: ' + phoneNice,
    '',
    order.message || ''
  ].filter(Boolean).join('\n').slice(0, 3900);
}

function splitSecretList(raw) {
  return String(raw || '').split(/[,;\s]+/).map((id) => id.trim()).filter(Boolean);
}

async function telegramChatIdFromUpdates(token) {
  const res = await fetch('https://api.telegram.org/bot' + token + '/getUpdates?limit=20');
  if (!res.ok) return '';
  const data = await res.json().catch(() => null);
  const updates = (data && data.ok && Array.isArray(data.result)) ? data.result : [];
  for (let i = updates.length - 1; i >= 0; i--) {
    const chat = updates[i] && (updates[i].message || updates[i].my_chat_member || updates[i].edited_message);
    const id = chat && chat.chat && chat.chat.id;
    if (id) return String(id);
  }
  return '';
}

async function notifyTelegram(env, order) {
  const tokens = splitSecretList(env.TELEGRAM_BOT_TOKEN);
  let chatIds = splitSecretList(env.TELEGRAM_CHAT_ID);
  if (!tokens.length) return { ok: false, skipped: true };
  if (!chatIds.length) {
    chatIds = [];
    for (const token of tokens) {
      const id = await telegramChatIdFromUpdates(token).catch(() => '');
      chatIds.push(id || '');
    }
  }
  if (chatIds.every((id) => !id)) return { ok: false, skipped: true };
  const text = orderNotifyText(order);
  let anyOk = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const chatId = chatIds[i] || chatIds[0];
    if (!token || !chatId) continue;
    try {
      const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true
        })
      });
      if (res.ok) anyOk = true;
      else console.error('Telegram notify failed', chatId, res.status, await res.text().catch(() => ''));
    } catch (e) {
      console.error('Telegram notify error', chatId, e);
    }
  }
  return { ok: anyOk };
}

async function notifyMax(env, order) {
  const token = String(env.MAX_BOT_TOKEN || '').trim();
  const userId = String(env.MAX_USER_ID || env.MAX_CHAT_ID || '').trim();
  if (!token || !userId) return { ok: false, skipped: true };
  const asChat = userId.startsWith('-') || (env.MAX_CHAT_ID && String(env.MAX_CHAT_ID) === userId);
  const url = 'https://platform-api2.max.ru/messages?' + (asChat
    ? ('chat_id=' + encodeURIComponent(userId))
    : ('user_id=' + encodeURIComponent(userId)));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: orderNotifyText(order),
        notify: true
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('MAX notify failed', res.status, errText);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('MAX notify error', e);
    return { ok: false, error: e.message };
  }
}

async function notifyShop(env, order) {
  const tg = await notifyTelegram(env, order);
  if (tg.ok) return tg;
  return notifyMax(env, order);
}

async function handleCreateOrder(request, env) {
  await ensureOrdersTable(env);
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'Некорректные данные' }, 400);
  }
  if (String(data.website || data.hp || '').trim()) {
    return json({ ok: true, code: 'OK' });
  }
  const phone = normalizeRuPhone(data.customer_phone || data.phone);
  if (!phone) return json({ ok: false, error: 'Укажите телефон в формате +7 …' }, 400);
  const fulfillment = String(data.fulfillment || '');
  if (!['pickup', 'armavir', 'nearby'].includes(fulfillment)) {
    return json({ ok: false, error: 'Выберите способ получения' }, 400);
  }
  const title = String(data.product_title || data.title || '').trim();
  if (!title) return json({ ok: false, error: 'Нет названия композиции' }, 400);
  const orderDate = String(data.order_date || '').trim();
  const orderTime = String(data.order_time || '').trim();
  if (!orderDate || !orderTime) return json({ ok: false, error: 'Укажите дату и время' }, 400);

  const ip = clientIp(request);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const counted = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM orders WHERE ip = ? AND created_at > ?'
  ).bind(ip, hourAgo).first();
  if ((counted && counted.n) >= 5) {
    return json({ ok: false, error: 'Слишком много заявок. Позвоните нам или напишите в WhatsApp.' }, 429);
  }

  const id = crypto.randomUUID();
  const publicCode = shortOrderCode();
  const now = new Date().toISOString();
  const name = String(data.customer_name || data.name || '').trim().slice(0, 80);
  const message = String(data.message || '').trim().slice(0, 4000);
  const total = Number(data.total);
  const row = {
    id,
    public_code: publicCode,
    product_id: d1(data.product_id),
    product_slug: d1(data.product_slug || data.slug),
    product_title: title.slice(0, 180),
    product_sku: d1(data.product_sku || data.sku),
    quantity: Math.max(1, Math.min(100, Number(data.quantity) || 1)),
    digit: d1(data.digit),
    digit2: d1(data.digit2),
    digit_delta: Number(data.digit_delta) || 0,
    inscription: d1(String(data.inscription || '').slice(0, 60)),
    fulfillment,
    address: d1(String(data.address || '').slice(0, 140)),
    order_date: orderDate.slice(0, 16),
    order_time: orderTime.slice(0, 40),
    customer_name: d1(name),
    customer_phone: phone,
    total: Number.isFinite(total) ? Math.round(total) : 0,
    price_from: data.price_from ? 1 : 0,
    message: d1(message),
    status: 'new',
    ip: d1(ip),
    created_at: now,
    updated_at: now
  };

  await env.DB.prepare(`INSERT INTO orders (
    id, public_code, product_id, product_slug, product_title, product_sku, quantity,
    digit, digit2, digit_delta, inscription, fulfillment, address, order_date, order_time,
    customer_name, customer_phone, total, price_from, message, status, ip, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    row.id, row.public_code, row.product_id, row.product_slug, row.product_title, row.product_sku, row.quantity,
    row.digit, row.digit2, row.digit_delta, row.inscription, row.fulfillment, row.address, row.order_date, row.order_time,
    row.customer_name, row.customer_phone, row.total, row.price_from, row.message, row.status, row.ip, row.created_at, row.updated_at
  ).run();

  const notified = await notifyShop(env, row);
  return json({ ok: true, code: publicCode, notified: !!notified.ok });
}

async function handleListOrders(env) {
  await ensureOrdersTable(env);
  const { results } = await env.DB.prepare(
    'SELECT id, public_code, product_id, product_slug, product_title, product_sku, quantity, digit, digit2, inscription, fulfillment, address, order_date, order_time, customer_name, customer_phone, total, price_from, message, status, created_at FROM orders ORDER BY created_at DESC LIMIT 150'
  ).all();
  return json({ ok: true, orders: results || [] });
}

async function handleOrderStatus(path, request, env) {
  await ensureOrdersTable(env);
  const id = path.split('/')[3];
  let data;
  try { data = await request.json(); } catch (e) {
    return json({ ok: false, error: 'Некорректные данные' }, 400);
  }
  const status = String(data.status || '');
  if (!['new', 'called', 'confirmed', 'cancelled'].includes(status)) {
    return json({ ok: false, error: 'Неизвестный статус' }, 400);
  }
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, id).run();
  return json({ ok: true });
}

const PRICE_LIST_SEED = [
  ['latex', 'latex', 1, 'Латексный шар', 140, 0, '', 'Шары поштучно', 'Латексный шар', ''],
  ['print', 'latex', 2, 'Шар с рисунком', 140, 0, '', 'Шары поштучно', 'Шар с рисунком', ''],
  ['confetti', 'latex', 3, 'Шар с конфетти', 180, 0, '', 'Шары поштучно', 'Шар с конфетти', ''],
  ['chrome', 'latex', 4, 'Шар хром', 180, 0, '', 'Шары поштучно', 'Шар хром', ''],
  ['agate', 'latex', 5, 'Шар супер-агат', 200, 0, '', 'Шары поштучно', 'Шар супер-агат', ''],
  ['brush', 'latex', 6, 'Шар браш', 150, 0, '', 'Шары поштучно', 'Шар браш', ''],
  ['foil-round', 'foil', 1, 'Круг, звезда или сердце', 300, 0, '', 'Шары поштучно', 'Круг, звезда или сердце', ''],
  ['foil-text', 'foil', 2, 'С надписью', 400, 0, '', 'Шары поштучно', 'С надписью', ''],
  ['foil-figure', 'foil', 3, 'Фольгированная фигура', 500, 1, '', 'Шары поштучно', 'Фольгированная фигура', ''],
  ['walker', 'foil', 4, 'Ходячая фигура', 300, 1, '', 'Шары поштучно', 'Ходячая фигура', ''],
  ['digit', 'foil', 5, 'Фольгированная цифра', 900, 0, '', 'Шары поштучно', 'Фольгированная цифра', ''],
  ['figure', 'special', 1, 'Фигура из шаров', 100, 1, '', 'Фигуры из шаров', 'Фигура из шаров', ''],
  ['flower', 'special', 2, 'Цветок из шаров', 80, 1, '', 'Цветы из шаров', 'Цветок из шаров', ''],
  ['gender', 'special', 3, 'Гендерный шар', 1600, 0, '', 'Гендер-пати', 'Гендерный шар', 'Коробки, баблс и сюрпризы'],
  ['surprise', 'special', 4, 'Шар-сюрприз', 1000, 1, '', 'Шар-сюрприз', 'Шар-сюрприз', ''],
  ['kraft', 'special', 5, 'Крафтовый букет', 1000, 1, '', 'Крафтовый букет', 'Крафтовый букет', ''],
  ['box', 'special', 6, 'Коробка-сюрприз', 1700, 0, '', 'Коробка-сюрприз', 'Коробка-сюрприз', ''],
  ['bubble', 'special', 7, 'Баблс с наполнением и надписью', 1600, 0, '', 'Шары поштучно', 'Баблс с наполнением и надписью', ''],
  ['glass-bubble', 'special', 8, 'Стеклянный баблс с надписью', 2000, 0, '', 'Шары поштучно', 'Стеклянный баблс с надписью', ''],
  ['arch-classic', 'decor', 1, 'Классическая арка', 650, 0, '/м', 'Арки', 'Классическая арка', ''],
  ['arch-organic', 'decor', 2, 'Разнокалиберная арка', 1200, 0, '/м', 'Арки', 'Разнокалиберная арка', '']
];

async function ensurePriceListTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS price_list (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    price_from INTEGER NOT NULL DEFAULT 0,
    unit TEXT DEFAULT '',
    catalog_category TEXT DEFAULT '',
    catalog_query TEXT DEFAULT '',
    subhead TEXT DEFAULT '',
    updated_at TEXT
  )`).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM price_list').first();
  if (Number(row?.n) > 0) return;
  const now = new Date().toISOString();
  for (const item of PRICE_LIST_SEED) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO price_list
        (id, group_id, sort_order, title, price, price_from, unit, catalog_category, catalog_query, subhead, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...item, now).run();
  }
}

function parsePriceRow(row) {
  return {
    id: row.id,
    group_id: row.group_id,
    sort_order: Number(row.sort_order) || 0,
    title: row.title,
    price: Number(row.price) || 0,
    price_from: Number(row.price_from) ? 1 : 0,
    unit: row.unit || '',
    catalog_category: row.catalog_category || '',
    catalog_query: row.catalog_query || '',
    subhead: row.subhead || '',
    updated_at: row.updated_at || ''
  };
}

async function handleGetPriceList(env) {
  await ensurePriceListTable(env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM price_list ORDER BY group_id, sort_order, id'
  ).all();
  return json({ ok: true, items: (results || []).map(parsePriceRow) });
}

async function handlePutPriceList(request, env) {
  await ensurePriceListTable(env);
  let data;
  try { data = await request.json(); } catch (e) {
    return json({ ok: false, error: 'Некорректные данные' }, 400);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return json({ ok: false, error: 'Пустой список' }, 400);
  const now = new Date().toISOString();
  for (const raw of items) {
    const id = String(raw.id || '').trim();
    if (!id) continue;
    const price = Math.max(0, Math.round(Number(raw.price) || 0));
    const priceFrom = raw.price_from ? 1 : 0;
    await env.DB.prepare(
      'UPDATE price_list SET price = ?, price_from = ?, updated_at = ? WHERE id = ?'
    ).bind(price, priceFrom, now, id).run();
  }
  const { results } = await env.DB.prepare(
    'SELECT * FROM price_list ORDER BY group_id, sort_order, id'
  ).all();
  return json({ ok: true, items: (results || []).map(parsePriceRow) });
}

const DELIVERY_DEFAULTS = { city: 200, nearby: 200, nearby_from: 1 };

async function ensureDeliverySettings(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT
  )`).run();
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries({
    delivery_city: String(DELIVERY_DEFAULTS.city),
    delivery_nearby: String(DELIVERY_DEFAULTS.nearby),
    delivery_nearby_from: String(DELIVERY_DEFAULTS.nearby_from)
  })) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)'
    ).bind(key, value, now).run();
  }
}

function parseDeliverySettings(rows) {
  const map = {};
  (rows || []).forEach((r) => { map[r.key] = r.value; });
  const city = Math.max(0, Math.round(Number(map.delivery_city)));
  const nearby = Math.max(0, Math.round(Number(map.delivery_nearby)));
  return {
    city: Number.isFinite(city) && map.delivery_city != null ? city : DELIVERY_DEFAULTS.city,
    nearby: Number.isFinite(nearby) && map.delivery_nearby != null ? nearby : DELIVERY_DEFAULTS.nearby,
    nearby_from: map.delivery_nearby_from === '0' ? 0 : 1
  };
}

async function readDelivery(env) {
  await ensureDeliverySettings(env);
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM site_settings WHERE key LIKE 'delivery_%'"
  ).all();
  return parseDeliverySettings(results);
}

async function handleGetDelivery(env) {
  const d = await readDelivery(env);
  return json({ ok: true, ...d });
}

async function handlePutDelivery(request, env) {
  await ensureDeliverySettings(env);
  let data;
  try { data = await request.json(); } catch (e) {
    return json({ ok: false, error: 'Некорректные данные' }, 400);
  }
  const city = Math.max(0, Math.round(Number(data.city)));
  const nearby = Math.max(0, Math.round(Number(data.nearby)));
  if (!Number.isFinite(city) || !Number.isFinite(nearby)) {
    return json({ ok: false, error: 'Укажите числа' }, 400);
  }
  const nearbyFrom = data.nearby_from ? 1 : 0;
  const now = new Date().toISOString();
  const pairs = [
    ['delivery_city', String(city)],
    ['delivery_nearby', String(nearby)],
    ['delivery_nearby_from', String(nearbyFrom)]
  ];
  for (const [key, value] of pairs) {
    await env.DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key, value, now).run();
  }
  return json({ ok: true, city, nearby, nearby_from: nearbyFrom });
}

function compositionLines(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  const t = raw.trim();
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return compositionLines(parsed);
    } catch (e) { /* text */ }
  }
  return t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
}

function matchCompositionLine(line) {
  let s = String(line || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/гирлянд|фотозон|мольберт|лестниц|табличк/.test(s)) return null;
  if (/\bарк/.test(s)) return null;

  let qty = 1;
  const qm = s.match(/^(\d+)\s+(.*)$/);
  if (qm) {
    qty = Math.max(1, Math.min(200, Number(qm[1]) || 1));
    s = qm[2];
  }

  const rules = [
    [/стеклянн.*бабл|бабл.*стеклян/, 'glass-bubble'],
    [/бабл/, 'bubble'],
    [/гендер/, 'gender'],
    [/коробк.*сюрприз|сюрприз.*коробк/, 'box'],
    [/шар[-\s]?сюрприз/, 'surprise'],
    [/крафтов/, 'kraft'],
    [/цвет(ок|ка|ы|ов|ков).*из шаров|из шаров.*цвет/, 'flower'],
    [/фигур.*из шаров|из шаров.*фигур/, 'figure'],
    [/ходяч/, 'walker'],
    [/конфетти/, 'confetti'],
    [/хром/, 'chrome'],
    [/агат/, 'agate'],
    [/браш|brush/, 'brush'],
    [/рисунк/, 'print'],
    [/цифр/, 'digit'],
    [/фольг.*фигур|фигур.*фольг/, 'foil-figure'],
    [/сердц|звезд|круг/, 'foil-round'],
    [/латекс/, 'latex'],
    [/гелиев/, 'latex']
  ];
  for (const [re, id] of rules) {
    if (re.test(s)) return { id, qty };
  }
  return null;
}

function productRepriceDelta(product, deltas) {
  const lines = compositionLines(product.composition);
  let add = 0;
  const hits = [];
  for (const line of lines) {
    const hit = matchCompositionLine(line);
    if (!hit) continue;
    const d = Number(deltas[hit.id] || 0);
    if (!d) continue;
    const part = d * hit.qty;
    add += part;
    hits.push({ id: hit.id, qty: hit.qty, delta: part, line });
  }
  const oldPrice = Number(product.price) || 0;
  const newPrice = Math.max(0, Math.round(oldPrice + add));
  return { add, hits, oldPrice, newPrice };
}

async function handleRepriceFromList(request, env) {
  let data;
  try { data = await request.json(); } catch (e) {
    return json({ ok: false, error: 'Некорректные данные' }, 400);
  }
  const rawDeltas = data && typeof data.deltas === 'object' ? data.deltas : {};
  const deltas = {};
  for (const [id, val] of Object.entries(rawDeltas)) {
    const n = Math.round(Number(val) || 0);
    if (!n || Math.abs(n) > 20000) continue;
    deltas[id] = n;
  }
  if (!Object.keys(deltas).length) {
    return json({ ok: true, changed: [], count: 0, applied: false });
  }

  const { results } = await env.DB.prepare(
    'SELECT id, title, article, price, composition, budget, status FROM products'
  ).all();
  const changed = [];
  for (const row of results || []) {
    const r = productRepriceDelta(row, deltas);
    if (!r.add) continue;
    changed.push({
      id: row.id,
      title: row.title,
      article: row.article,
      status: row.status,
      old_price: r.oldPrice,
      new_price: r.newPrice,
      add: r.add,
      hits: r.hits
    });
  }

  if (data.apply) {
    const now = new Date().toISOString();
    for (const row of changed) {
      await env.DB.prepare(
        'UPDATE products SET price = ?, budget = ?, updated_at = ? WHERE id = ?'
      ).bind(row.new_price, budgetFromPrice(row.new_price), now, row.id).run();
    }
  }

  return json({
    ok: true,
    applied: !!data.apply,
    count: changed.length,
    changed: changed.slice(0, 80)
  });
}


