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

  const systemPrompt = `Ты — профессиональный копирайтер для магазина воздушных шаров и подарков VigSharm (г. Армавир, Россия).
Генерируешь метаданные карточки товара на русском языке на основе предоставленной информации.
Верни ТОЛЬКО валидный JSON, без markdown, без пояснений.

Обязательная структура JSON:
{
  "title": "Краткое цепляющее название товара (макс 60 символов)",
  "article": "Уникальный SKU-код типа VIGSH-001",
  "short_description": "Краткое описание для каталога (макс 120 символов)",
  "full_description": "Подробное описание 2-3 абзаца с эмоциональным призывом",
  "composition": ["Шары", "Лента", "Коробка", "Открытка"],
  "category": "balloons|flowers|gifts|sweets",
  "character": "neutral|disney|marvel|anime|football|unicorn|bear",
  "age_group": "baby|child|teen|adult",
  "occasion": "birthday|wedding|anniversary|graduation|holiday",
  "target_audience": "boy|girl|man|woman|unisex",
  "seo_title": "SEO-оптимизированный заголовок (макс 70 символов)",
  "seo_description": "SEO мета-описание (макс 160 символов)",
  "slug": "url-friendly-slug",
  "tags": ["тег1", "тег2", "тег3"]
}

ВАЖНЫЕ ПРАВИЛА:
- Категория "balloons" для композиций из шаров
- character: определи по фото (marvel для Spider-Man, football для футбольных мячей, unicorn для единорогов и т.д.)
- age_group: определи по стилю композиции (baby для 1 годик, child для детских, teen для подростковых, adult для взрослых)
- occasion: определи повод (birthday для дней рождения с цифрами, wedding для свадебных, holiday для праздничных)
- target_audience: мальчик/девочка для детей, мужчина/женщина для взрослых, unisex для нейтральных
- composition: список компонентов (шары латексные, шары фольгированные, лента, коробка-сюрприз, баннер, подарок)
- slug: транслитерация названия латиницей через дефис
- tags: дополнительные теги для поиска (цвета, темы, персонажи)`;

  const userPrompt = `Сгенерируй карточку для композиции из шаров:
Подсказка названия: ${title_hint || 'не указано'}
Цена: ${price || 'не указана'} ₽
Описание: ${description || 'Композиция из воздушных шаров'}
Тип сцены: ${scene || 'standard'}
${image_url ? 'Изображение предоставлено для визуального анализа' : ''}`;

  // Запрос к NordRouter GPT-4o (с vision если есть image_url)
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  
  // Если есть изображение, добавляем его для анализа
  // Claude Sonnet 5 supports vision - добавляем изображение при наличии
  if (image_url) {
    messages[1].content = [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: image_url } }
    ];
  }

  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'claude-sonnet-5',
    messages,
    temperature: 0.7,
    response_format: { type: 'json_object' }
  }, env);

  // Проверяем ошибки от NordRouter API
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

  return json({ ok: true, data });
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
    scene: scene // Pass scene to frontend for canvas positioning
  });
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


