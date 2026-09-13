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

  // Проверяем ошибки от NordRouter API
  if (aiResp.error) {
    console.error('NordRouter API error:', aiResp.error);
    return json({ ok: false, error: 'NordRouter API ошибка: ' + (aiResp.error.message || JSON.stringify(aiResp.error)) });
  }

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

// ─── Studio Pro: Process ─────────────────────────────────

const STUDIO_PROMPTS = {
  floor: `РЕЖИМ: Напольная композиция (полная сцена для фотозон и букетов)

ЭТАЛОННЫЙ ФОН VIGSHARM:
- Стена: светлая тёплая beige-grey (бежево-серая) с мягкой текстурой
- Плинтус: белый аккуратный
- Пол: светлый серо-бежевый ламинат
- Чистая студия без лишних предметов

ВАЖНО: Мягкие натуральные тени. Студийное освещение без желтизны.`,

  wall_only: `РЕЖИМ: Только стена (для настенных композиций)

СТРОЖАЙШИЙ ЗАПРЕТ пола, плинтуса, ламината!
Только светлая бежево-серая стена с мягкой текстурой.

ВАЖНО: НЕ добавлять пол даже если его нет на оригинале.`,

  photozone: `РЕЖИМ: Фотозона (полный интерьер)

Полная сцена:
- Бежево-серая стена со всех сторон (создаёт глубину)
- Белый плинтус
- Серо-бежевый ламинат

ВАЖНО: НЕ переделывать фотозону. Сохранить ВСЕ элементы конструкции.`,

  unit_balloon: `РЕЖИМ: Один шар (студийное фото)

Чистый бежево-серый фон.
Убрать водяные знаки/логотипы поставщиков (если есть).
Принт шара НЕ трогать.

ВАЖНО: НЕ менять форму товара. НЕ добавлять дополнительные элементы.`,

  handheld_bouquet: `РЕЖИМ: Букет в руках

Светлая нейтральная стена.
НЕ показывать пол.
НЕ превращать в напольную стойку.

Можно добавить естественную руку (если нужно для презентации).
Рука НЕ должна закрывать товар.`
};

async function handleStudioProcess(request, env) {
  const { image_url, scene, prompt: userPrompt } = await request.json();

  const basePrompt = STUDIO_PROMPTS[scene] || STUDIO_PROMPTS.floor;
  
  // Базовые правила (применяются ВСЕГДА)
  const coreRules = `Профессиональная ретушь фото для каталога шаров VigSharm.

АБСОЛЮТНЫЕ ПРАВИЛА (НАРУШЕНИЕ НЕДОПУСТИМО):

1. ТОВАР НЕИЗМЕНЕН:
   - Количество элементов (шаров, цветов) - СТРОГО как на оригинале
   - Цвета - СТРОГО как на оригинале
   - Форма, размер, пропорции - СТРОГО как на оригинале
   - Надписи, цифры, буквы - СТРОГО как на оригинале
   - Персонажи, фигуры - СТРОГО как на оригинале
   - Композиция, расположение - СТРОГО как на оригинале

2. ЗАПРЕЩЕНО:
   - Добавлять элементы которых нет на оригинале
   - Удалять элементы
   - Менять количество элементов
   - Менять цвета
   - Менять надписи/цифры/буквы
   - Изменять композицию
   - Растягивать/деформировать объекты
   - Обрезанное НЕ дорисовывать

3. РАЗРЕШЕНО МЕНЯТЬ ТОЛЬКО:
   - Фон (стена, пол) согласно выбранному режиму
   - Освещение (мягкое, естественное)
   - Цветовой баланс (нейтральный, без желтизны)

4. КАЧЕСТВО:
   - Фотография должна выглядеть РЕАЛЬНО, а НЕ как 3D render
   - Без пластикового глянца
   - Глянец шаров естественный (не стекло/пластик)
   - Тени мягкие, естественные, без 3D-рендера
   - Формат: квадрат или близкий к квадрату
   - НЕ обрезать товар`;

  const fullPrompt = `${coreRules}

${basePrompt}${userPrompt ? '\n\nДОПОЛНИТЕЛЬНО: ' + userPrompt : ''}`;

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

    // R2 отключен — возвращаем результат как base64
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataUrl = 'data:image/webp;base64,' + base64;
    
    return json({ ok: true, status: 'done', result_url: dataUrl, format: 'base64' });
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
