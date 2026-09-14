// VigSharm API вЂ” Cloudflare Worker
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

// в”Ђв”Ђв”Ђ Studio Pro: Process в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const STUDIO_PROMPTS = {
  floor: `Р Р•Р–РРњ: РќР°РїРѕР»СЊРЅР°СЏ РєРѕРјРїРѕР·РёС†РёСЏ (РїРѕР»РЅР°СЏ СЃС†РµРЅР° РґР»СЏ С„РѕС‚РѕР·РѕРЅ Рё Р±СѓРєРµС‚РѕРІ РёР· С€Р°СЂРѕРІ)

Р­РўРђР›РћРќРќР«Р™ Р¤РћРќ VIGSHARM:
- РЎС‚РµРЅР°: СЃРІРµС‚Р»Р°СЏ С‚С‘РїР»Р°СЏ beige-grey (Р±РµР¶РµРІРѕ-СЃРµСЂР°СЏ) СЃ РјСЏРіРєРѕР№ С€С‚СѓРєР°С‚СѓСЂРЅРѕР№ С‚РµРєСЃС‚СѓСЂРѕР№
- РџР»РёРЅС‚СѓСЃ: Р±РµР»С‹Р№ РґРµРєРѕСЂР°С‚РёРІРЅС‹Р№
- РџРѕР»: СЃРІРµС‚Р»С‹Р№ oak (РґСѓР±РѕРІС‹Р№) Р»Р°РјРёРЅР°С‚ СЃ РІРёРґРёРјРѕР№ С‚РµРєСЃС‚СѓСЂРѕР№ РґРµСЂРµРІР°
- Р§РёСЃС‚Р°СЏ СЃС‚СѓРґРёСЏ Р±РµР· Р»РёС€РЅРёС… РїСЂРµРґРјРµС‚РѕРІ Рё РґРµРєРѕСЂР°

Р’РђР–РќРћ: РњСЏРіРєРёРµ РЅР°С‚СѓСЂР°Р»СЊРЅС‹Рµ С‚РµРЅРё РѕС‚ С€Р°СЂРѕРІ. РЎС‚СѓРґРёР№РЅРѕРµ РѕСЃРІРµС‰РµРЅРёРµ Р±РµР· Р¶РµР»С‚РёР·РЅС‹.
РЈРґР°Р»РёС‚СЊ РІСЃРµ Р»РѕРіРѕС‚РёРїС‹ РјР°РіР°Р·РёРЅРѕРІ (sharomem.ru, sharomen.ru) Рё РІРѕРґСЏРЅС‹Рµ Р·РЅР°РєРё.
РЎРѕС…СЂР°РЅРёС‚СЊ РґРёР·Р°Р№РЅ С€Р°СЂРѕРІ (Marvel, С„СѓС‚Р±РѕР»СЊРЅС‹Рµ РјСЏС‡Рё, РїСЂРёРЅС‚С‹).`,

  wall_only: `Р Р•Р–РРњ: РўРѕР»СЊРєРѕ СЃС‚РµРЅР° (РґР»СЏ Р±СѓРєРµС‚РѕРІ РёР· С€Р°СЂРѕРІ Р±РµР· РїРѕР»Р°)

РЎРўР РћР–РђР™РЁРР™ Р—РђРџР Р•Рў РїРѕР»Р°, РїР»РёРЅС‚СѓСЃР°, Р»Р°РјРёРЅР°С‚Р°!
РўРѕР»СЊРєРѕ СЃРІРµС‚Р»Р°СЏ Р±РµР¶РµРІРѕ-СЃРµСЂР°СЏ С‚РµРєСЃС‚СѓСЂРЅР°СЏ С€С‚СѓРєР°С‚СѓСЂРЅР°СЏ СЃС‚РµРЅР° СЃ РјСЏРіРєРёРј РіСЂР°РґРёРµРЅС‚РѕРј.

Р’РђР–РќРћ: РќР• РґРѕР±Р°РІР»СЏС‚СЊ РїРѕР» РґР°Р¶Рµ РµСЃР»Рё РµРіРѕ РЅРµС‚ РЅР° РѕСЂРёРіРёРЅР°Р»Рµ.
РЈРґР°Р»РёС‚СЊ Р»РѕРіРѕС‚РёРїС‹ РјР°РіР°Р·РёРЅРѕРІ Рё РІРѕРґСЏРЅС‹Рµ Р·РЅР°РєРё.
РЎРѕС…СЂР°РЅРёС‚СЊ РґРёР·Р°Р№РЅ С€Р°СЂРѕРІ.`,

  photozone: `Р Р•Р–РРњ: Р¤РѕС‚РѕР·РѕРЅР° (РїРѕР»РЅС‹Р№ РёРЅС‚РµСЂСЊРµСЂ РґР»СЏ РєРѕРјРїРѕР·РёС†РёР№ РёР· С€Р°СЂРѕРІ)

РџРѕР»РЅР°СЏ СѓРіР»РѕРІР°СЏ СЃС†РµРЅР°:
- Р‘РµР¶РµРІРѕ-СЃРµСЂР°СЏ СЃС‚РµРЅР° СЃ РјСЏРіРєРѕР№ С‚РµРєСЃС‚СѓСЂРѕР№ (СѓРіРѕР» РїРѕРјРµС‰РµРЅРёСЏ)
- Р‘РµР»С‹Р№ РґРµРєРѕСЂР°С‚РёРІРЅС‹Р№ РїР»РёРЅС‚СѓСЃ
- РЎРІРµС‚Р»С‹Р№ РґСѓР±РѕРІС‹Р№ Р»Р°РјРёРЅР°С‚ СЃ С‚РµРєСЃС‚СѓСЂРѕР№ РґРµСЂРµРІР°

Р’РђР–РќРћ: РќР• РїРµСЂРµРґРµР»С‹РІР°С‚СЊ С„РѕС‚РѕР·РѕРЅСѓ. РЎРѕС…СЂР°РЅРёС‚СЊ Р’РЎР• СЌР»РµРјРµРЅС‚С‹ РєРѕРЅСЃС‚СЂСѓРєС†РёРё С€Р°СЂРѕРІ.
РЈРґР°Р»РёС‚СЊ Р»РѕРіРѕС‚РёРїС‹ РјР°РіР°Р·РёРЅРѕРІ (sharomem.ru) СЃ Р±Р°РЅРЅРµСЂРѕРІ Рё РєРѕСЂРѕР±РѕРє.
РЎРѕС…СЂР°РЅРёС‚СЊ С†РёС„СЂС‹-С€Р°СЂС‹, РїРµСЂСЃРѕРЅР°Р¶РµР№ Рё РґРёР·Р°Р№РЅ С€Р°СЂРѕРІ.`,

  unit_balloon: `Р Р•Р–РРњ: РћРґРёРЅ С€Р°СЂ (СЃС‚СѓРґРёР№РЅРѕРµ С„РѕС‚Рѕ)

Р§РёСЃС‚С‹Р№ СЃРІРµС‚Р»С‹Р№ Р±РµР¶РµРІРѕ-СЃРµСЂС‹Р№ С„РѕРЅ Р±РµР· С‚РµРєСЃС‚СѓСЂ.
РЈР±СЂР°С‚СЊ РІРѕРґСЏРЅС‹Рµ Р·РЅР°РєРё/Р»РѕРіРѕС‚РёРїС‹ РїРѕСЃС‚Р°РІС‰РёРєРѕРІ (sharomem.ru, sharomen.ru).
РџСЂРёРЅС‚С‹ РЅР° С€Р°СЂР°С… (Marvel, Spider-Man, С„СѓС‚Р±РѕР»СЊРЅС‹Рµ РјСЏС‡Рё) РќР• С‚СЂРѕРіР°С‚СЊ.

Р’РђР–РќРћ: РќР• РјРµРЅСЏС‚СЊ С„РѕСЂРјСѓ С€Р°СЂР°. РќР• РґРѕР±Р°РІР»СЏС‚СЊ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹.`,

  handheld_bouquet: `Р Р•Р–РРњ: Р‘СѓРєРµС‚ РёР· С€Р°СЂРѕРІ РІ СЂСѓРєР°С…

РЎРІРµС‚Р»Р°СЏ Р±РµР¶РµРІРѕ-СЃРµСЂР°СЏ С‚РµРєСЃС‚СѓСЂРЅР°СЏ СЃС‚РµРЅР°.
РќР• РїРѕРєР°Р·С‹РІР°С‚СЊ РїРѕР».
РќР• РїСЂРµРІСЂР°С‰Р°С‚СЊ РІ РЅР°РїРѕР»СЊРЅСѓСЋ РєРѕРјРїРѕР·РёС†РёСЋ.

РЈРґР°Р»РёС‚СЊ Р»РѕРіРѕС‚РёРїС‹ РјР°РіР°Р·РёРЅРѕРІ.
РЎРѕС…СЂР°РЅРёС‚СЊ РґРёР·Р°Р№РЅ С€Р°СЂРѕРІ Рё РєРѕРјРїРѕР·РёС†РёСЋ.`
};

async function handleStudioProcess(request, env) {
  const { image_url, scene, prompt: userPrompt } = await request.json();
  // Р’Р°Р»РёРґР°С†РёСЏ С„РѕСЂРјР°С‚Р° РёР·РѕР±СЂР°Р¶РµРЅРёСЏ
  if (!image_url || !image_url.startsWith('data:image/')) {
    return json({ ok: false, error: 'Invalid image format. Expected data:image/... URL' }, 400);
  }

  const basePrompt = STUDIO_PROMPTS[scene] || STUDIO_PROMPTS.floor;
  
  // Р‘Р°Р·РѕРІС‹Рµ РїСЂР°РІРёР»Р° (РїСЂРёРјРµРЅСЏСЋС‚СЃСЏ Р’РЎР•Р“Р”Рђ)
  const coreRules = `РџСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅР°СЏ СЂРµС‚СѓС€СЊ С„РѕС‚Рѕ РґР»СЏ РєР°С‚Р°Р»РѕРіР° С€Р°СЂРѕРІ VigSharm.

РђР‘РЎРћР›Р®РўРќР«Р• РџР РђР’РР›Рђ (РќРђР РЈРЁР•РќРР• РќР•Р”РћРџРЈРЎРўРРњРћ):

1. РўРћР’РђР  РќР•РР—РњР•РќР•Рќ:
   - РљРѕР»РёС‡РµСЃС‚РІРѕ СЌР»РµРјРµРЅС‚РѕРІ (С€Р°СЂРѕРІ, С†РІРµС‚РѕРІ) - РЎРўР РћР“Рћ РєР°Рє РЅР° РѕСЂРёРіРёРЅР°Р»Рµ
   - Р¦РІРµС‚Р° - РЎРўР РћР“Рћ РєР°Рє РЅР° РѕСЂРёРіРёРЅР°Р»Рµ
   - Р¤РѕСЂРјР°, СЂР°Р·РјРµСЂ, РїСЂРѕРїРѕСЂС†РёРё - РЎРўР РћР“Рћ РєР°Рє РЅР° РѕСЂРёРіРёРЅР°Р»Рµ
   - РќР°РґРїРёСЃРё, С†РёС„СЂС‹, Р±СѓРєРІС‹ РќРђ РЁРђР РђРҐ - РЎРўР РћР“Рћ РєР°Рє РЅР° РѕСЂРёРіРёРЅР°Р»Рµ (Marvel, РїСЂРёРЅС‚С‹, РїРµСЂСЃРѕРЅР°Р¶Рё)
   - РџРµСЂСЃРѕРЅР°Р¶Рё, С„РёРіСѓСЂС‹ - РЎРўР РћР“Рћ РєР°Рє РЅР° РѕСЂРёРіРёРЅР°Р»Рµ
   - РљРѕРјРїРѕР·РёС†РёСЏ, СЂР°СЃРїРѕР»РѕР¶РµРЅРёРµ - РЎРўР РћР“Рћ РєР°Рє РЅР° РѕСЂРёРіРёРЅР°Р»Рµ

2. РћР‘РЇР—РђРўР•Р›Р¬РќРћ РЈР”РђР›РРўР¬:
   - Р›РѕРіРѕС‚РёРїС‹ РјР°РіР°Р·РёРЅРѕРІ Рё РїРѕСЃС‚Р°РІС‰РёРєРѕРІ (sharomem.ru, sharomen.ru Рё РїРѕРґРѕР±РЅС‹Рµ)
   - Р’РѕРґСЏРЅС‹Рµ Р·РЅР°РєРё СЃ С‚РµРєСЃС‚РѕРј/URL
   - РљРѕРЅС‚Р°РєС‚РЅСѓСЋ РёРЅС„РѕСЂРјР°С†РёСЋ РЅР° С„РѕС‚Рѕ
   - Р§СѓР¶РёРµ РЅР°РґРїРёСЃРё "РЎ Р”РЅС‘Рј Р РѕР¶РґРµРЅРёСЏ" СЃ РёРјРµРЅР°РјРё РЅР° Р±Р°РЅРЅРµСЂР°С…/РєРѕСЂРѕР±РєР°С… (РµСЃР»Рё СЌС‚Рѕ РќР• С‡Р°СЃС‚СЊ С€Р°СЂР°)
   
   РќРћ РЎРћРҐР РђРќРРўР¬:
   - Р”РёР·Р°Р№РЅ С€Р°СЂРѕРІ (Marvel, С„СѓС‚Р±РѕР»СЊРЅС‹Рµ РјСЏС‡Рё, Р·РІС‘Р·РґРѕС‡РєРё)
   - РџСЂРёРЅС‚С‹ Рё СЂРёСЃСѓРЅРєРё РЅР° С€Р°СЂР°С…
   - Р¦РёС„СЂС‹-С€Р°СЂС‹
   - РџРµСЂСЃРѕРЅР°Р¶РµР№ РёР· С€Р°СЂРѕРІ

3. Р—РђРџР Р•Р©Р•РќРћ:
   - Р”РѕР±Р°РІР»СЏС‚СЊ СЌР»РµРјРµРЅС‚С‹ РєРѕС‚РѕСЂС‹С… РЅРµС‚ РЅР° РѕСЂРёРіРёРЅР°Р»Рµ
   - РЈРґР°Р»СЏС‚СЊ С€Р°СЂС‹/СЌР»РµРјРµРЅС‚С‹ РєРѕРјРїРѕР·РёС†РёРё
   - РњРµРЅСЏС‚СЊ РєРѕР»РёС‡РµСЃС‚РІРѕ СЌР»РµРјРµРЅС‚РѕРІ
   - РњРµРЅСЏС‚СЊ С†РІРµС‚Р° С€Р°СЂРѕРІ
   - РР·РјРµРЅСЏС‚СЊ РєРѕРјРїРѕР·РёС†РёСЋ
   - Р Р°СЃС‚СЏРіРёРІР°С‚СЊ/РґРµС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РѕР±СЉРµРєС‚С‹
   - РћР±СЂРµР·Р°РЅРЅРѕРµ РќР• РґРѕСЂРёСЃРѕРІС‹РІР°С‚СЊ

4. Р РђР—Р Р•РЁР•РќРћ РњР•РќРЇРўР¬ РўРћР›Р¬РљРћ:
   - Р¤РѕРЅ (СЃС‚РµРЅР°, РїРѕР») СЃРѕРіР»Р°СЃРЅРѕ РІС‹Р±СЂР°РЅРЅРѕРјСѓ СЂРµР¶РёРјСѓ
   - РЈРґР°Р»СЏС‚СЊ Р»РѕРіРѕС‚РёРїС‹/РІРѕРґСЏРЅС‹Рµ Р·РЅР°РєРё РјР°РіР°Р·РёРЅРѕРІ
   - РћСЃРІРµС‰РµРЅРёРµ (РјСЏРіРєРѕРµ, РµСЃС‚РµСЃС‚РІРµРЅРЅРѕРµ)
   - Р¦РІРµС‚РѕРІРѕР№ Р±Р°Р»Р°РЅСЃ (РЅРµР№С‚СЂР°Р»СЊРЅС‹Р№, Р±РµР· Р¶РµР»С‚РёР·РЅС‹)

5. РљРђР§Р•РЎРўР’Рћ:
   - Р¤РѕС‚РѕРіСЂР°С„РёСЏ РґРѕР»Р¶РЅР° РІС‹РіР»СЏРґРµС‚СЊ Р Р•РђР›Р¬РќРћ, Р° РќР• РєР°Рє 3D render
   - Р‘РµР· РїР»Р°СЃС‚РёРєРѕРІРѕРіРѕ РіР»СЏРЅС†Р°
   - Р“Р»СЏРЅРµС† С€Р°СЂРѕРІ РµСЃС‚РµСЃС‚РІРµРЅРЅС‹Р№ (РЅРµ СЃС‚РµРєР»Рѕ/РїР»Р°СЃС‚РёРє)
   - РўРµРЅРё РјСЏРіРєРёРµ, РµСЃС‚РµСЃС‚РІРµРЅРЅС‹Рµ, Р±РµР· 3D-СЂРµРЅРґРµСЂР°
   - Р¤РѕСЂРјР°С‚: РєРІР°РґСЂР°С‚ РёР»Рё Р±Р»РёР·РєРёР№ Рє РєРІР°РґСЂР°С‚Сѓ
   - РќР• РѕР±СЂРµР·Р°С‚СЊ С‚РѕРІР°СЂ`;

  const fullPrompt = `${coreRules}

${basePrompt}${userPrompt ? '\n\nР”РћРџРћР›РќРРўР•Р›Р¬РќРћ: ' + userPrompt : ''}`;

  // РРЎРџР РђР’Р›Р•РќРР•: РСЃРїРѕР»СЊР·СѓРµРј vision API С‡РµСЂРµР· chat completions СЃ multimodal content
  // Р’РјРµСЃС‚Рѕ /media/generate РёСЃРїРѕР»СЊР·СѓРµРј /v1/chat/completions СЃ РїСЂР°РІРёР»СЊРЅРѕР№ СЃС‚СЂСѓРєС‚СѓСЂРѕР№
  // Р¨Р°Рі 1: РРЅР°Р»РёР· РёР·РѕР±СЂР°Р¶РµРЅРёСЏ С‡РµСЂРµР· vision API
  const aiResp = await nordRequest('/v1/chat/completions', 'POST', {
    model: 'claude-sonnet-5',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: fullPrompt
          },
          {
            type: 'image_url',
            image_url: {
              url: image_url
            }
          }
        ]
      }
    ],
    max_tokens: 4096
  }, env);

  console.log('Studio Pro: AI response received', {
    has_choices: !!aiResp.choices,
    choice_count: aiResp.choices?.length
  });

  if (!aiResp.choices || aiResp.choices.length === 0) {
    return json({ 
      ok: false, 
      error: 'NordRouter РЅРµ РІРµСЂРЅСѓР» СЂРµР·СѓР»СЊС‚Р°С‚: ' + JSON.stringify(aiResp) 
    }, 500);
  }

  const analysisText = aiResp.choices[0].message.content;
  console.log('Vision analysis (first 500 chars):', analysisText.substring(0, 500));
  
  // Р¨Р°Рі 2: Р"РµРЅРµСЂР°С†РёСЏ СѓР»СѓС‡С€РµРЅРЅРѕРіРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ С‡РµСЂРµР· /media/generate
  const enhancedPrompt = `${analysisText}\n\n${basePrompt}${userPrompt ? '\n\nР"РћРџРћР›РќРРўР•Р›Р¬РќРћ: ' + userPrompt : ''}`;
  
  const generateResp = await nordRequest('/media/generate', 'POST', {
    model: 'image/nano-banana-edit',
    input: {
      prompt: enhancedPrompt,
      image: image_url,
      scene: scene || 'wall_floor'
    }
  }, env);

  console.log('Studio Pro: Generation started', {
    job_id: generateResp.id,
    model: generateResp.model
  });

  if (generateResp.error) {
    return json({ 
      ok: false, 
      error: 'РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё: ' + (generateResp.error.message || JSON.stringify(generateResp.error))
    }, 500);
  }

  if (!generateResp.id) {
    return json({ 
      ok: false, 
      error: 'NordRouter РЅРµ РІРµСЂРЅСѓР» job_id: ' + JSON.stringify(generateResp)
    }, 500);
  }
  
  return json({ 
    ok: true, 
    job_id: generateResp.id, 
    status: 'processing'
  });
}

// в”Ђв”Ђв”Ђ Studio Pro: Status в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

async function handleStudioStatus(path, env) {
  const jobId = path.split('/').pop();
  const result = await nordRequest('/media/job/' + jobId, 'GET', null, env);

  if (result.status === 'done' && result.result_url) {
    // РЎРєР°С‡РёРІР°РµРј СЂРµР·СѓР»СЊС‚Р°С‚ Рё Р·Р°РіСЂСѓР¶Р°РµРј РІ R2
    const imgResp = await fetch(result.result_url, {
      headers: { 'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY }
    });
    const blob = await imgResp.blob();

    // R2 РѕС‚РєР»СЋС‡РµРЅ вЂ” РІРѕР·РІСЂР°С‰Р°РµРј СЂРµР·СѓР»СЊС‚Р°С‚ РєР°Рє base64
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataUrl = 'data:image/webp;base64,' + base64;
    
    return json({ ok: true, status: 'done', result_url: dataUrl, format: 'base64' });
  }

  return json({ ok: true, status: result.status || 'processing' });
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


