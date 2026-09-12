// VigSharm API — Cloudflare Worker
// Хранит ключ NordRouter, проксирует запросы, управляет D1 + R2

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Router
      if (path === '/api/ai/generate-card' && method === 'POST')
        return handleGenerateCard(request, env);
      if (path === '/api/ai/suggest-category' && method === 'POST')
        return handleSuggestCategory(request, env);
      if (path === '/api/studio/process' && method === 'POST')
        return handleStudioProcess(request, env);
      if (path.startsWith('/api/studio/status/') && method === 'GET')
        return handleStudioStatus(path, env);
      if (path === '/api/studio/upload' && method === 'POST')
        return handleStudioUpload(request, env);
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
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
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
  return resp.json();
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

  const systemPrompt = `Ты — помощник создания карточек для интернет-магазина шаров и композиций VigSharm (г. Армавир).
На основе переданной информации предложи структурированные данные карточки.
Верни ТОЛЬКО JSON без markdown без текста без комментариев.

Схема ответа:
{
  "title": "название",
  "article": "DG-XXX",
  "short_description": "1-2 предложения",
  "full_description": "3-5 предложений",
  "composition": ["• компонент 1;", "• компонент 2;"],
  "category": "одна категория из списка",
  "seo_title": "название — заказать шары в Армавире | VigSharm",
  "seo_description": "2-3 предложения для SEO",
  "slug": "url-safe-slug",
  "tags": ["тег1", "тег2"],
  "client_options": {
    "available_on_request": true,
    "number_choice": false,
    "personal_inscription": false,
    "photozone_rental": false
  }
}

Доступные категории: Для девочки, Для мальчика, Для неё, Для мамы, Для него, Геймерам, Юбилей, 1 годик, Крещение, Гендер-пати, На выписку, Свадьба и девичник, Выпускной, Новый год, 14 февраля, 23 февраля, 8 марта, 1 сентября, Фигуры из шаров, Напольные композиции, Букет из шаров, Цветы из шаров, Крафтовый букет, Шар-сюрприз, Коробка-сюрприз, Фотозона, Арка из шаров, Шары поштучно.

Правила:
- Артикул: DG-XXX (уникальный, следующий свободный)
- Slug: транслитерация названия, дефисы, без спецсимволов
- Состав: список компонентов через точку с запятой
- Категория: строго из списка, одну наиболее подходящую
- Теги: дополнительные разделы каталога (можно несколько)
- НЕ придумывай компоненты которых нет в описании`;

  const userMsg = `Название: ${title_hint || 'без названия'}
Цена: ${price} ₽
Описание: ${description || 'нет описания'}
Сцена: ${scene || 'auto'}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMsg }
  ];

  // Используем GPT через NordRouter
  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'openai/gpt-4o-mini',
    messages,
    temperature: 0.3
  }, env);

  const text = aiResp.choices?.[0]?.message?.content || '';
  let card;
  try {
    // Убираем markdown обёртку если есть
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    card = JSON.parse(cleaned);
  } catch {
    return json({ ok: false, error: 'AI вернул некорректный JSON: ' + text.slice(0, 200) });
  }

  // Получаем следующий свободный артикул
  const lastArticle = await env.DB.prepare(
    "SELECT article FROM products WHERE article LIKE 'DG-%' ORDER BY article DESC LIMIT 1"
  ).first();
  if (!card.article || card.article === 'DG-XXX') {
    const nextNum = lastArticle
      ? parseInt(lastArticle.article.replace('DG-', '')) + 1
      : 1;
    card.article = 'DG-' + String(nextNum).padStart(3, '0');
  }

  return json({ ok: true, card });
}

// ─── AI: Suggest Category ────────────────────────────────

async function handleSuggestCategory(request, env) {
  const { description, title } = await request.json();

  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'openai/gpt-4o-mini',
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

  const text = aiResp.choices?.[0]?.message?.content || '';
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);
    return json({ ok: true, ...result });
  } catch {
    return json({ ok: false, error: 'AI error' });
  }
}

// ─── Studio Pro: Process ─────────────────────────────────

const STUDIO_PROMPTS = {
  floor: `Сцена: напольная. Стена — светлая нейтральная бежево-серая с мягкой текстурой. Белый аккуратный плинтус. Серо-бежевый ламинатный пол. Мягкие натуральные тени. Студийное освещение без желтизны.`,
  wall_only: `Сцена: только стена. Строжайший запрет пола, плинтуса, ламината. Только бежево-серая стена с мягкой текстурой.`,
  photozone: `Сцена: фотозона. Полный интерьер: бежево-серая стена со всех сторон (создаёт глубину), белый плинтус, серо-бежевый ламинат.`,
  unit_balloon: `Сцена: один шар. Чистый бежево-серый фон. Убрать водяные знаки/лого поставщиков. Принт шара не трогать.`,
  handheld_bouquet: `Сцена: букет в руках. Без пола. Не превращать в напольную стойку. Бежево-серый фон.`
};

async function handleStudioProcess(request, env) {
  const { image_url, scene, prompt: userPrompt } = await request.json();

  const basePrompt = STUDIO_PROMPTS[scene] || STUDIO_PROMPTS.floor;
  const fullPrompt = `Профессиональная ретушь фото для каталога шаров VigSharm.
${basePrompt}

СТРОГИЕ ПРАВИЛА:
1. ТОВАР НЕИЗМЕНЕН: количество, форма, надписи, ленты, пропорции — ВСЁ как на фото. Обрезанное НЕ дорисовывать.
2. НЕ добавлять элементов которых нет на оригинальном фото.
3. Формат: квадрат или близкий к квадрату. НЕ обрезать товар.
4. Глянец шаров естественный (не стекло/пластик).
5. Тени мягкие натуральные, без 3D-рендера.
${userPrompt ? '\nДополнительно: ' + userPrompt : ''}`;

  const job = await nordRequest('/media/generate', 'POST', {
    model: 'image/nano-banana-edit',
    input: { prompt: fullPrompt, image: image_url }
  }, env);

  if (!job.id) {
    return json({ ok: false, error: 'NordRouter не создал задачу: ' + JSON.stringify(job) });
  }

  return json({ ok: true, job_id: job.id, status: 'processing' });
}

// ─── Studio Pro: Status ──────────────────────────────────

async function handleStudioStatus(path, env) {
  const jobId = path.split('/').pop();
  const result = await nordRequest('/media/job/' + jobId, 'GET', null, env);

  if (result.status === 'done' && result.result_url) {
    // Скачиваем результат и загружаем в R2
    const imgResp = await fetch(result.result_url, {
      headers: { 'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY }
    });
    const blob = await imgResp.blob();

    // Конвертируем в WebP через Cloudflare Image Resizing (или просто сохраняем как есть)
    const id = crypto.randomUUID();
    const key = 'products/' + id + '.webp';
    await env.R2.put(key, blob, { contentType: 'image/webp' });

    const r2Url = env.R2_PUBLIC_URL + '/' + key;
    return json({ ok: true, status: 'done', result_url: r2Url, r2_key: key });
  }

  return json({ ok: true, status: result.status || 'processing' });
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
  const data = await request.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`INSERT INTO products (
    id, title, article, price, short_description, full_description, composition,
    category, character, age_group, budget, series_name, occasion, target_audience,
    seo_title, seo_description, slug, scene, tags, client_options, photos, main_photo,
    status, show_on_site, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, data.title, data.article, data.price || 0,
    data.short_description, data.full_description,
    JSON.stringify(data.composition || []),
    data.category, data.character, data.age_group, data.budget,
    data.series_name, data.occasion, data.target_audience,
    data.seo_title, data.seo_description, data.slug,
    data.scene || 'auto',
    JSON.stringify(data.tags || []),
    JSON.stringify(data.client_options || {}),
    JSON.stringify(data.photos || []),
    data.main_photo || (data.photos && data.photos[0]) || null,
    data.status || 'draft', data.show_on_site ? 1 : 0,
    now, now
  ).run();

  return json({ ok: true, id });
}

async function handleUpdateProduct(path, request, env) {
  const id = path.split('/').pop();
  const data = await request.json();
  const now = new Date().toISOString();

  // Не перезаписываем поля которые не переданы
  const existing = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!existing) return json({ ok: false, error: 'Not found' }, 404);

  await env.DB.prepare(`UPDATE products SET
    title = ?, article = ?, price = ?, short_description = ?, full_description = ?,
    composition = ?, category = ?, character = ?, age_group = ?, budget = ?,
    series_name = ?, occasion = ?, target_audience = ?,
    seo_title = ?, seo_description = ?, slug = ?, scene = ?,
    tags = ?, client_options = ?, photos = ?, main_photo = ?,
    status = ?, show_on_site = ?, updated_at = ?
  WHERE id = ?`).bind(
    data.title ?? existing.title,
    data.article ?? existing.article,
    data.price ?? existing.price,
    data.short_description ?? existing.short_description,
    data.full_description ?? existing.full_description,
    JSON.stringify(data.composition ?? JSON.parse(existing.composition || '[]')),
    data.category ?? existing.category,
    data.character ?? existing.character,
    data.age_group ?? existing.age_group,
    data.budget ?? existing.budget,
    data.series_name ?? existing.series_name,
    data.occasion ?? existing.occasion,
    data.target_audience ?? existing.target_audience,
    data.seo_title ?? existing.seo_title,
    data.seo_description ?? existing.seo_description,
    data.slug ?? existing.slug,
    data.scene ?? existing.scene,
    JSON.stringify(data.tags ?? JSON.parse(existing.tags || '[]')),
    JSON.stringify(data.client_options ?? JSON.parse(existing.client_options || '{}')),
    JSON.stringify(data.photos ?? JSON.parse(existing.photos || '[]')),
    data.main_photo ?? existing.main_photo,
    data.status ?? existing.status,
    data.show_on_site !== undefined ? (data.show_on_site ? 1 : 0) : existing.show_on_site,
    now, id
  ).run();

  return json({ ok: true });
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

  const id = crypto.randomUUID();
  const ext = file.type.includes('webp') ? 'webp' : file.type.includes('png') ? 'png' : 'jpg';
  const key = 'products/' + id + '.' + ext;

  await env.R2.put(key, file, { contentType: file.type });

  const url = env.R2_PUBLIC_URL + '/' + key;
  return json({ ok: true, url, id });
}

async function handleDeletePhoto(path, env) {
  const id = path.split('/').pop();
  // Удаляем все варианты файла
  for (const ext of ['webp', 'jpg', 'png']) {
    await env.R2.delete('products/' + id + '.' + ext);
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
