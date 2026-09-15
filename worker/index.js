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
      if (path === '/api/studio/enhance' && method === 'POST')
        return handleStudioEnhance(request, env);
      if (path === '/api/studio/restore' && method === 'POST')
        return handleStudioRestore(request, env);
      if (path === '/api/studio/upscale' && method === 'POST')
        return handleStudioUpscale(request, env);
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

async function handleGenerateCard(request, env) {
  const { title_hint, price, description, scene, image_url } = await request.json();

  const systemPrompt = `Ты — копирайтер каталога VigSharm (воздушные шары, Армавир).
Пиши коротко, по делу, как в карточке товара. Без маркетинговой воды.
Верни ТОЛЬКО валидный JSON, без markdown, без пояснений.

Обязательная структура JSON:
{
  "title": "Короткое название товара (2-5 слов, макс 50 символов). Пример: Тёмный рыцарь",
  "article": "SKU вида VIGSH001",
  "short_description": "Одно предложение, факты с фото (макс 110 символов)",
  "full_description": "1-2 коротких предложения: что на фото + для какого повода. Без призывов купить",
  "composition": ["пункт состава", "пункт состава"],
  "category": "balloons|flowers|gifts|sweets",
  "character": "имя персонажа или нейтрально",
  "age_group": "baby|child|teen|adult",
  "occasion": "birthday|wedding|anniversary|graduation|holiday",
  "target_audience": "boy|girl|man|woman|unisex",
  "seo_title": "SEO-заголовок без эмодзи (макс 70 символов), можно с «Армавир»",
  "seo_description": "SEO-описание без эмодзи (макс 155 символов)",
  "slug": "url-friendly-slug-latin",
  "tags": ["тег1", "тег2", "тег3"]
}

ПРАВИЛА ТОНА:
- Как эталон: «Тёмный рыцарь» / «Эффектная напольная композиция с Бэтменом и цифрой с надписью.»
- НЕ пиши: «очаровательная», «нежная», «яркая эмоция», «заказать сейчас», «подарите радость»
- НЕ используй эмодзи ни в одном поле
- Не выдумывай цену
- composition: только то, что видно на фото (цифра, персонаж, цвета шаров, надпись)
- Если пользователь дал состав/описание — опирайся на него, не противоречь
- slug: транслит латиницей через дефис
- category для шаров: balloons`;

  const userPrompt = `Сгенерируй карточку по данным:
Подсказка названия: ${title_hint || 'не указано'}
Цена (не меняй, не выдумывай): ${price || 'не указана'} ₽
Состав / детали от пользователя: ${description || 'не указано'}
Тип сцены: ${scene || 'floor'}
${image_url ? 'Фото приложено — опиши только то, что видно.' : ''}`;

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
    temperature: 0.35,
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

  data = sanitizeCardMetadata(data);
  return json({ ok: true, data });
}

/** Убрать эмодзи и лишние пробелы из текстовых полей карточки */
function sanitizeCardMetadata(data) {
  const stripEmoji = (s) => String(s || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const fields = [
    'title', 'short_description', 'full_description',
    'seo_title', 'seo_description', 'character', 'slug', 'article'
  ];
  for (const key of fields) {
    if (data[key] != null) data[key] = stripEmoji(data[key]);
  }
  if (Array.isArray(data.composition)) {
    data.composition = data.composition.map(stripEmoji).filter(Boolean);
  }
  if (Array.isArray(data.tags)) {
    data.tags = data.tags.map(stripEmoji).filter(Boolean);
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

// ─── Studio Pro: Enhance (AI «как снято в студии») ───────

function buildEnhancePrompt(scene) {
  const base = `Rephotograph this VigSharm balloon product in the studio room — make it look like ONE real catalog photo taken in this space, not a cutout pasted on top.

The product is ALREADY placed correctly. Do NOT move, resize, or recompose it.

KEEP STRICTLY IDENTICAL:
- Every balloon: exact colors, counts, shapes, foil prints, text, numbers, names, characters
- Product arrangement and composition — pixel-accurate
- Room layout (wall, baseboard, laminate) — same geometry

REPHOTOGRAPH / INTEGRATE:
- Remove cutout halo, white fringe, hard sticker edges
- Match product lighting to soft daylight in the room (reduce harsh studio HDR on foil balloons)
- Real contact shadows where balloons meet floor/wall — soft ambient occlusion under each sphere
- Subtle bounce light from floor onto the bottom of the product
- Natural edge blending so the product feels physically in the room

Do NOT reposition to fix floating. Do NOT redesign the product. No plastic 3D render. No full background replacement.`;

  if (scene === 'handheld_bouquet') {
    return `${base}

SCENE: wall only (no floor). If needed, add one natural adult hand holding ribbons from below — do not cover balloons. Soft wall contact shadow.`;
  }

  if (scene === 'wall_only' || scene === 'unit_balloon') {
    return `${base}

SCENE: wall only. Soft natural shadow of the product on the wall plane behind it.`;
  }

  if (scene === 'photozone') {
    return `${base}

SCENE: large photozone on laminate near baseboard. Contact shadow under the base. Keep full structure.`;
  }

  return `${base}

SCENE: floor composition on laminate near baseboard. Medium contact shadow under balloon cluster on the floor — not a flat oval, but shadows where spheres touch the surface.`;
}

async function handleStudioEnhance(request, env) {
  const { image_url, scene = 'floor', resolution = '2K' } = await request.json();

  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const isDataUrl = String(image_url).startsWith('data:image/');
  const isHttpsUrl = String(image_url).startsWith('https://');
  if (!isDataUrl && !isHttpsUrl) {
    return json({ ok: false, error: 'Invalid image_url' }, 400);
  }

  const prompt = buildEnhancePrompt(scene);
  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '2K';

  // Models that accept resolution → try 2K first for catalog sharpness
  const enhanceAttempts = [
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res } },
    { model: 'image/flux2-pro-edit', input: { prompt, image: image_url, aspect_ratio: '1:1', resolution: res === '4K' ? '2K' : res } },
    { model: 'image/gpt-image-2-edit', input: { prompt, image: image_url } },
    { model: 'image/nano-banana-pro', input: { prompt, image: image_url } },
    { model: 'image/nano-banana-edit', input: { prompt, image: image_url } }
  ];

  let generateResp = null;
  for (const attempt of enhanceAttempts) {
    console.log('[Studio Enhance] scene=', scene, 'try model=', attempt.model, 'input keys=', Object.keys(attempt.input));
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
  return json({ ok: true, job_id: generateResp.id, status: 'processing', scene, resolution: res });
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

/** Upscale crop to 2K for sharp catalog zooms */
async function handleStudioUpscale(request, env) {
  const { image_url, resolution = '2K' } = await request.json();

  if (!image_url) {
    return json({ ok: false, error: 'Missing image_url' }, 400);
  }

  const prompt = `Upscale this square product crop to high resolution for an e-commerce catalog.

KEEP STRICTLY IDENTICAL: all balloons, colors, foil prints, text, numbers, characters, framing.
Only increase sharpness and resolution. No restyling, no plastic CGI look, no recomposition.`;

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
    // Скачиваем результат и загружаем в R2
    const imgResp = await fetch(result.result_url, {
      headers: { 'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY }
    });
    
    if (!imgResp.ok) {
      console.error('[Studio Status] ? Failed to download result:', imgResp.status);
      return json({ ok: false, error: `Ошибка скачивания: ${imgResp.status}` }, 500);
    }
    
    // === Диагностика 1: Content-Type от NordRouter ===
    const contentType = imgResp.headers.get('Content-Type') || 'unknown';
    console.log('[DIAGNOSTIC] ?? Content-Type from NordRouter:', contentType);
    
    const blob = await imgResp.blob();
    console.log('[Studio Status] ?? Downloaded:', blob.size, 'bytes');
    console.log('[DIAGNOSTIC] ?? Blob type:', blob.type);


    // R2 отключен — возвращаем результат как base64
    const arrayBuffer = await blob.arrayBuffer();
    
    // === Диагностика 2: размер и сигнатура файла ===
    console.log('[DIAGNOSTIC] ?? ArrayBuffer size:', arrayBuffer.byteLength);
    
    const bytes = new Uint8Array(arrayBuffer);
    
    // Первые 16 байт (сигнатура файла)
    const signature = Array.from(bytes.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log('[DIAGNOSTIC] ?? File signature (first 16 bytes):', signature);
    
    // Проверяем PNG сигнатуру: 89 50 4E 47 0D 0A 1A 0A
    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isWebP = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    console.log('[DIAGNOSTIC] ?? Format detection: PNG=' + isPNG + ', WebP=' + isWebP);
    
    // Определяем правильный MIME type
    let detectedMimeType = 'image/png';
    if (isWebP) {
      detectedMimeType = 'image/webp';
    } else if (!isPNG) {
      console.warn('[DIAGNOSTIC] ?? Unknown image format! Using PNG as fallback');
    }
    console.log('[DIAGNOSTIC] ?? Detected MIME type:', detectedMimeType);
    
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binaryString);
    const dataUrl = 'data:' + detectedMimeType + ';base64,' + base64;
    
    console.log('[Studio Status] ? Returning result for job:', jobId);
    console.log('[DIAGNOSTIC] ?? Data URL MIME:', detectedMimeType);
    return json({ ok: true, status: 'done', result_url: dataUrl, format: 'base64' });
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

    await env.DB.prepare(`INSERT INTO products (
      id, title, article, price, short_description, full_description, composition,
      category, character, age_group, budget, series_name, occasion, target_audience,
      seo_title, seo_description, slug, scene, tags, client_options, photos, main_photo,
      status, show_on_site, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id,
      d1(data.title),
      d1(data.article),
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
      d1(data.slug),
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

    await env.DB.prepare(`UPDATE products SET
      title = ?, article = ?, price = ?, short_description = ?, full_description = ?,
      composition = ?, category = ?, character = ?, age_group = ?, budget = ?,
      series_name = ?, occasion = ?, target_audience = ?,
      seo_title = ?, seo_description = ?, slug = ?, scene = ?,
      tags = ?, client_options = ?, photos = ?, main_photo = ?,
      status = ?, show_on_site = ?, updated_at = ?
    WHERE id = ?`).bind(
      d1(data.title ?? existing.title),
      d1(data.article ?? existing.article),
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
      d1(data.slug ?? existing.slug),
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


