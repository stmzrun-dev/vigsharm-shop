// Временный скрипт для проверки конфигурации модели image/nano-banana-edit
// Используется только для анализа, не для генерации

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Только GET /check-model
    if (path === '/check-model' && request.method === 'GET') {
      try {
        console.log('[Check Model] Fetching models list from NordRouter...');
        
        const resp = await fetch('https://nordrouter.com/media/models', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + env.NORDROUTER_API_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          console.error('[Check Model] Error:', resp.status, errorText);
          return new Response(JSON.stringify({ 
            ok: false, 
            error: `HTTP ${resp.status}: ${errorText}` 
          }), {
            status: resp.status,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        const data = await resp.json();
        console.log('[Check Model] Received models data');

        // Найти модель image/nano-banana-edit
        let targetModel = null;
        
        if (Array.isArray(data)) {
          targetModel = data.find(m => m.id === 'image/nano-banana-edit');
        } else if (data.models && Array.isArray(data.models)) {
          targetModel = data.models.find(m => m.id === 'image/nano-banana-edit');
        } else if (data['image/nano-banana-edit']) {
          targetModel = data['image/nano-banana-edit'];
        }

        console.log('[Check Model] Model found:', !!targetModel);

        return new Response(JSON.stringify({
          ok: true,
          model_found: !!targetModel,
          model_data: targetModel,
          total_models: Array.isArray(data) ? data.length : (data.models ? data.models.length : 'unknown'),
          response_structure: Array.isArray(data) ? 'array' : (data.models ? 'object_with_models_array' : 'object')
        }, null, 2), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } catch (error) {
        console.error('[Check Model] Exception:', error.message);
        return new Response(JSON.stringify({ 
          ok: false, 
          error: error.message 
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'Use GET /check-model' 
    }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
