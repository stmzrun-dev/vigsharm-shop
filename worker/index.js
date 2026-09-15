﻿// VigSharm API вЂ” Cloudflare Worker
// РҐСЂР°РЅРёС‚ РєР»СЋС‡ NordRouter, РїСЂРѕРєСЃРёСЂСѓРµС‚ Р·Р°РїСЂРѕСЃС‹, СѓРїСЂР°РІР»СЏРµС‚ D1 + R2

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

// в”Ђв”Ђв”Ђ CORS в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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

// в”Ђв”Ђв”Ђ NordRouter в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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

// в”Ђв”Ђв”Ђ AI: Generate Card в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function handleGenerateCard(request, env) {
  const { title_hint, price, description, scene, image_url } = await request.json();

  const systemPrompt = `РўС‹ вЂ” РїСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅС‹Р№ РєРѕРїРёСЂР°Р№С‚РµСЂ РґР»СЏ РјР°РіР°Р·РёРЅР° РІРѕР·РґСѓС€РЅС‹С… С€Р°СЂРѕРІ Рё РїРѕРґР°СЂРєРѕРІ VigSharm (Рі. РђСЂРјР°РІРёСЂ, Р РѕСЃСЃРёСЏ).
Р“РµРЅРµСЂРёСЂСѓРµС€СЊ РјРµС‚Р°РґР°РЅРЅС‹Рµ РєР°СЂС‚РѕС‡РєРё С‚РѕРІР°СЂР° РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ РЅР° РѕСЃРЅРѕРІРµ РїСЂРµРґРѕСЃС‚Р°РІР»РµРЅРЅРѕР№ РёРЅС„РѕСЂРјР°С†РёРё.
Р’РµСЂРЅРё РўРћР›Р¬РљРћ РІР°Р»РёРґРЅС‹Р№ JSON, Р±РµР· markdown, Р±РµР· РїРѕСЏСЃРЅРµРЅРёР№.

РћР±СЏР·Р°С‚РµР»СЊРЅР°СЏ СЃС‚СЂСѓРєС‚СѓСЂР° JSON:
{
  "title": "РљСЂР°С‚РєРѕРµ С†РµРїР»СЏСЋС‰РµРµ РЅР°Р·РІР°РЅРёРµ С‚РѕРІР°СЂР° (РјР°РєСЃ 60 СЃРёРјРІРѕР»РѕРІ)",
  "article": "РЈРЅРёРєР°Р»СЊРЅС‹Р№ SKU-РєРѕРґ С‚РёРїР° VIGSH-001",
  "short_description": "РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ РґР»СЏ РєР°С‚Р°Р»РѕРіР° (РјР°РєСЃ 120 СЃРёРјРІРѕР»РѕРІ)",
  "full_description": "РџРѕРґСЂРѕР±РЅРѕРµ РѕРїРёСЃР°РЅРёРµ 2-3 Р°Р±Р·Р°С†Р° СЃ СЌРјРѕС†РёРѕРЅР°Р»СЊРЅС‹Рј РїСЂРёР·С‹РІРѕРј",
  "composition": ["РЁР°СЂС‹", "Р›РµРЅС‚Р°", "РљРѕСЂРѕР±РєР°", "РћС‚РєСЂС‹С‚РєР°"],
  "category": "balloons|flowers|gifts|sweets",
  "character": "neutral|disney|marvel|anime|football|unicorn|bear",
  "age_group": "baby|child|teen|adult",
  "occasion": "birthday|wedding|anniversary|graduation|holiday",
  "target_audience": "boy|girl|man|woman|unisex",
  "seo_title": "SEO-РѕРїС‚РёРјРёР·РёСЂРѕРІР°РЅРЅС‹Р№ Р·Р°РіРѕР»РѕРІРѕРє (РјР°РєСЃ 70 СЃРёРјРІРѕР»РѕРІ)",
  "seo_description": "SEO РјРµС‚Р°-РѕРїРёСЃР°РЅРёРµ (РјР°РєСЃ 160 СЃРёРјРІРѕР»РѕРІ)",
  "slug": "url-friendly-slug",
  "tags": ["С‚РµРі1", "С‚РµРі2", "С‚РµРі3"]
}

Р’РђР–РќР«Р• РџР РђР’РР›Рђ:
- РљР°С‚РµРіРѕСЂРёСЏ "balloons" РґР»СЏ РєРѕРјРїРѕР·РёС†РёР№ РёР· С€Р°СЂРѕРІ
- character: РѕРїСЂРµРґРµР»Рё РїРѕ С„РѕС‚Рѕ (marvel РґР»СЏ Spider-Man, football РґР»СЏ С„СѓС‚Р±РѕР»СЊРЅС‹С… РјСЏС‡РµР№, unicorn РґР»СЏ РµРґРёРЅРѕСЂРѕРіРѕРІ Рё С‚.Рґ.)
- age_group: РѕРїСЂРµРґРµР»Рё РїРѕ СЃС‚РёР»СЋ РєРѕРјРїРѕР·РёС†РёРё (baby РґР»СЏ 1 РіРѕРґРёРє, child РґР»СЏ РґРµС‚СЃРєРёС…, teen РґР»СЏ РїРѕРґСЂРѕСЃС‚РєРѕРІС‹С…, adult РґР»СЏ РІР·СЂРѕСЃР»С‹С…)
- occasion: РѕРїСЂРµРґРµР»Рё РїРѕРІРѕРґ (birthday РґР»СЏ РґРЅРµР№ СЂРѕР¶РґРµРЅРёСЏ СЃ С†РёС„СЂР°РјРё, wedding РґР»СЏ СЃРІР°РґРµР±РЅС‹С…, holiday РґР»СЏ РїСЂР°Р·РґРЅРёС‡РЅС‹С…)
- target_audience: РјР°Р»СЊС‡РёРє/РґРµРІРѕС‡РєР° РґР»СЏ РґРµС‚РµР№, РјСѓР¶С‡РёРЅР°/Р¶РµРЅС‰РёРЅР° РґР»СЏ РІР·СЂРѕСЃР»С‹С…, unisex РґР»СЏ РЅРµР№С‚СЂР°Р»СЊРЅС‹С…
- composition: СЃРїРёСЃРѕРє РєРѕРјРїРѕРЅРµРЅС‚РѕРІ (С€Р°СЂС‹ Р»Р°С‚РµРєСЃРЅС‹Рµ, С€Р°СЂС‹ С„РѕР»СЊРіРёСЂРѕРІР°РЅРЅС‹Рµ, Р»РµРЅС‚Р°, РєРѕСЂРѕР±РєР°-СЃСЋСЂРїСЂРёР·, Р±Р°РЅРЅРµСЂ, РїРѕРґР°СЂРѕРє)
- slug: С‚СЂР°РЅСЃР»РёС‚РµСЂР°С†РёСЏ РЅР°Р·РІР°РЅРёСЏ Р»Р°С‚РёРЅРёС†РµР№ С‡РµСЂРµР· РґРµС„РёСЃ
- tags: РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ С‚РµРіРё РґР»СЏ РїРѕРёСЃРєР° (С†РІРµС‚Р°, С‚РµРјС‹, РїРµСЂСЃРѕРЅР°Р¶Рё)`;

  const userPrompt = `РЎРіРµРЅРµСЂРёСЂСѓР№ РєР°СЂС‚РѕС‡РєСѓ РґР»СЏ РєРѕРјРїРѕР·РёС†РёРё РёР· С€Р°СЂРѕРІ:
РџРѕРґСЃРєР°Р·РєР° РЅР°Р·РІР°РЅРёСЏ: ${title_hint || 'РЅРµ СѓРєР°Р·Р°РЅРѕ'}
Р¦РµРЅР°: ${price || 'РЅРµ СѓРєР°Р·Р°РЅР°'} в‚Ѕ
РћРїРёСЃР°РЅРёРµ: ${description || 'РљРѕРјРїРѕР·РёС†РёСЏ РёР· РІРѕР·РґСѓС€РЅС‹С… С€Р°СЂРѕРІ'}
РўРёРї СЃС†РµРЅС‹: ${scene || 'standard'}
${image_url ? 'РР·РѕР±СЂР°Р¶РµРЅРёРµ РїСЂРµРґРѕСЃС‚Р°РІР»РµРЅРѕ РґР»СЏ РІРёР·СѓР°Р»СЊРЅРѕРіРѕ Р°РЅР°Р»РёР·Р°' : ''}`;

  // Р—Р°РїСЂРѕСЃ Рє NordRouter GPT-4o (СЃ vision РµСЃР»Рё РµСЃС‚СЊ image_url)
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  
  // Р•СЃР»Рё РµСЃС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ, РґРѕР±Р°РІР»СЏРµРј РµРіРѕ РґР»СЏ Р°РЅР°Р»РёР·Р°
  // Claude Sonnet 5 supports vision - добавляем изображение для анализа
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

  // РџСЂРѕРІРµСЂСЏРµРј РѕС€РёР±РєРё РѕС‚ NordRouter API
  if (aiResp.error) {
    console.error('NordRouter API error:', aiResp.error);
    return json({ ok: false, error: 'NordRouter API РѕС€РёР±РєР°: ' + (aiResp.error.message || JSON.stringify(aiResp.error)) });
  }

  const text = aiResp.choices?.[0]?.message?.content || '';
  if (!text) {
    return json({ ok: false, error: 'AI РЅРµ РІРµСЂРЅСѓР» РѕС‚РІРµС‚' });
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'AI РІРµСЂРЅСѓР» РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ JSON: ' + text.slice(0, 200) });
  }

  return json({ ok: true, data });
}

// в”Ђв”Ђв”Ђ AI: Suggest Category в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function handleSuggestCategory(request, env) {
  const { description, title } = await request.json();

  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'claude-sonnet-5',
    messages: [
      {
        role: 'system',
        content: `РћРїСЂРµРґРµР»Рё РєР°С‚РµРіРѕСЂРёСЋ Рё С‚РµРіРё РґР»СЏ РєР°СЂС‚РѕС‡РєРё С‚РѕРІР°СЂР° РјР°РіР°Р·РёРЅР° С€Р°СЂРѕРІ.
Р’РµСЂРЅРё РўРћР›Р¬РљРћ JSON: { "category": "...", "tags": ["..."] }
РљР°С‚РµРіРѕСЂРёРё: Р”Р»СЏ РґРµРІРѕС‡РєРё, Р”Р»СЏ РјР°Р»СЊС‡РёРєР°, Р”Р»СЏ РЅРµС‘, Р”Р»СЏ РјР°РјС‹, Р”Р»СЏ РЅРµРіРѕ, Р“РµР№РјРµСЂР°Рј, Р®Р±РёР»РµР№, 1 РіРѕРґРёРє, РљСЂРµС‰РµРЅРёРµ, Р“РµРЅРґРµСЂ-РїР°С‚Рё, РќР° РІС‹РїРёСЃРєСѓ, РЎРІР°РґСЊР±Р° Рё РґРµРІРёС‡РЅРёРє, Р’С‹РїСѓСЃРєРЅРѕР№, РќРѕРІС‹Р№ РіРѕРґ, 14 С„РµРІСЂР°Р»СЏ, 23 С„РµРІСЂР°Р»СЏ, 8 РјР°СЂС‚Р°, 1 СЃРµРЅС‚СЏР±СЂСЏ, Р¤РёРіСѓСЂС‹ РёР· С€Р°СЂРѕРІ, РќР°РїРѕР»СЊРЅС‹Рµ РєРѕРјРїРѕР·РёС†РёРё, Р‘СѓРєРµС‚ РёР· С€Р°СЂРѕРІ, Р¦РІРµС‚С‹ РёР· С€Р°СЂРѕРІ, РљСЂР°С„С‚РѕРІС‹Р№ Р±СѓРєРµС‚, РЁР°СЂ-СЃСЋСЂРїСЂРёР·, РљРѕСЂРѕР±РєР°-СЃСЋСЂРїСЂРёР·, Р¤РѕС‚РѕР·РѕРЅР°, РђСЂРєР° РёР· С€Р°СЂРѕРІ, РЁР°СЂС‹ РїРѕС€С‚СѓС‡РЅРѕ.`
      },
      { role: 'user', content: `РќР°Р·РІР°РЅРёРµ: ${title}\nРћРїРёСЃР°РЅРёРµ: ${description}` }
    ],
    temperature: 0.2
  }, env);

  // РџСЂРѕРІРµСЂСЏРµРј РѕС€РёР±РєРё РѕС‚ NordRouter API
  if (aiResp.error) {
    console.error('NordRouter API error:', aiResp.error);
    return json({ ok: false, error: 'NordRouter API РѕС€РёР±РєР°: ' + (aiResp.error.message || JSON.stringify(aiResp.error)) });
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

// ─── Studio Pro: Process (NEW FLOW - Remove BG + Canvas) ───────────────────────────────────────

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
  
  console.log('[Studio Pro NEW] ✅ Remove BG job created:', generateResp.id);
  console.log('[Studio Pro NEW] ✅ Returning job_id to frontend:', generateResp.id);
  
  return json({ 
    ok: true, 
    job_id: generateResp.id, 
    status: 'processing',
    scene: scene // Pass scene to frontend for canvas positioning
  });
}


// в”Ђв”Ђв”Ђ Studio Pro: Status в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function handleStudioStatus(path, env) {
  const jobId = path.split('/').pop();
  console.log('[Studio Status] 📊 Checking job:', jobId);
  
  try {
    const result = await nordRequest('/media/job/' + jobId, 'GET', null, env);

  console.log('[Studio Status] 📊 Job:', jobId, '→ Status:', result.status);

  if (result.status === 'done' && result.result_url) {
    // РЎРєР°С‡РёРІР°РµРј СЂРµР·СѓР»СЊС‚Р°С‚ Рё Р·Р°РіСЂСѓР¶Р°РµРј РІ R2
    const imgResp = await fetch(result.result_url, {
      headers: { 'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY }
    });
    
    if (!imgResp.ok) {
      console.error('[Studio Status] ❌ Failed to download result:', imgResp.status);
      return json({ ok: false, error: `Ошибка скачивания: ${imgResp.status}` }, 500);
    }
    
    // === ДИАГНОСТИКА 1: Content-Type ответа NordRouter ===
    const contentType = imgResp.headers.get('Content-Type') || 'unknown';
    console.log('[DIAGNOSTIC] 📦 Content-Type from NordRouter:', contentType);
    
    const blob = await imgResp.blob();
    console.log('[Studio Status] 📥 Downloaded:', blob.size, 'bytes');
    console.log('[DIAGNOSTIC] 📦 Blob type:', blob.type);


    // R2 РѕС‚РєР»СЋС‡РµРЅ вЂ” РІРѕР·РІСЂР°С‰Р°РµРј СЂРµР·СѓР»СЊС‚Р°С‚ РєР°Рє base64
    const arrayBuffer = await blob.arrayBuffer();
    
    // === ДИАГНОСТИКА 2: Размер и сигнатура файла ===
    console.log('[DIAGNOSTIC] 📦 ArrayBuffer size:', arrayBuffer.byteLength);
    
    const bytes = new Uint8Array(arrayBuffer);
    
    // Выводим первые 16 байт (сигнатура файла)
    const signature = Array.from(bytes.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log('[DIAGNOSTIC] 📦 File signature (first 16 bytes):', signature);
    
    // Проверяем PNG сигнатуру: 89 50 4E 47 0D 0A 1A 0A
    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isWebP = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    console.log('[DIAGNOSTIC] 📦 Format detection: PNG=' + isPNG + ', WebP=' + isWebP);
    
    // Определяем правильный MIME type
    let detectedMimeType = 'image/png';
    if (isWebP) {
      detectedMimeType = 'image/webp';
    } else if (!isPNG) {
      console.warn('[DIAGNOSTIC] ⚠️ Unknown image format! Using PNG as fallback');
    }
    console.log('[DIAGNOSTIC] 📦 Detected MIME type:', detectedMimeType);
    
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binaryString);
    const dataUrl = 'data:' + detectedMimeType + ';base64,' + base64;
    
    console.log('[Studio Status] ✅ Returning result for job:', jobId);
    console.log('[DIAGNOSTIC] 📦 Data URL MIME:', detectedMimeType);
    return json({ ok: true, status: 'done', result_url: dataUrl, format: 'base64' });
  }

  return json({ ok: true, status: result.status || 'processing' });
  } catch (error) {
    console.error('[Studio Status] ❌ Error checking job:', jobId, error);
    return json({ ok: false, error: error.message || 'Status check failed' }, 500);
  }
}

// в”Ђв”Ђв”Ђ Studio Pro: Upload в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function handleStudioUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ ok: false, error: 'No file' });

  const result = await nordUpload(file, env);
  if (!result.url) return json({ ok: false, error: 'Upload failed' });

  return json({ ok: true, url: result.url });
}

// в”Ђв”Ђв”Ђ Products CRUD в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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

  // РќРµ РїРµСЂРµР·Р°РїРёСЃС‹РІР°РµРј РїРѕР»СЏ РєРѕС‚РѕСЂС‹Рµ РЅРµ РїРµСЂРµРґР°РЅС‹
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

// в”Ђв”Ђв”Ђ Upload Photo в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function handleUploadPhoto(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ ok: false, error: 'No file' }, 400);

  // R2 РѕС‚РєР»СЋС‡РµРЅ вЂ” РєРѕРЅРІРµСЂС‚РёСЂСѓРµРј С„Р°Р№Р» РІ data URL (РІСЂРµРјРµРЅРЅРѕРµ СЂРµС€РµРЅРёРµ)
  // Р”Р»СЏ РїСЂРѕРґР°РєС€РµРЅР° РЅСѓР¶РЅРѕ РЅР°СЃС‚СЂРѕРёС‚СЊ СЂРµР°Р»СЊРЅС‹Р№ С…РѕСЃС‚РёРЅРі РёР·РѕР±СЂР°Р¶РµРЅРёР№
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
  // R2 РѕС‚РєР»СЋС‡РµРЅ вЂ” NordRouter РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ СѓРґР°Р»РµРЅРёРµ С„Р°Р№Р»РѕРІ С‡РµСЂРµР· API
  // РџСЂРѕСЃС‚Рѕ РІРѕР·РІСЂР°С‰Р°РµРј СѓСЃРїРµС… (С„Р°Р№Р»С‹ РЅР° NordRouter РѕСЃС‚Р°СЋС‚СЃСЏ, РЅРѕ СЌС‚Рѕ РЅРµ РєСЂРёС‚РёС‡РЅРѕ)
  return json({ ok: true });
}

// в”Ђв”Ђв”Ђ Helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

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


