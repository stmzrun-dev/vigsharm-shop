/* VigSharm admin: publish products straight to the GitHub Pages repo via REST API */
(function () {
  'use strict';

  var API = 'https://api.github.com';
  var IMG_PATH = 'api/images/products';
  var JSON_PATH = 'assets/products.json';

  var CATEGORIES = [
    'Оригинальные подарки', 'Готовые решения', 'Персонажи', 'Шары поштучно',
    'Оформление праздника', 'Фигуры из шаров', 'Цветы из шаров', 'Арки',
    'Шар-сюрприз', 'Крафтовый букет', 'Коробка-сюрприз', 'Гендер-пати', 'Букет из шаров'
  ];

  var OCCASIONS = [
    'День рождения', '1 годик', 'На выписку', 'Для мальчика', 'Для девочки',
    'Для мамы', 'Для него', 'Для неё', 'Фотозона', 'Букет из шаров',
    'Гендер-пати', 'Свадьба', 'Новый год', '14 февраля', '23 февраля',
    '8 марта', 'Выпускной', 'Детские'
  ];

  var OPTIONS = [
    { key: 'opt-order', label: 'Доступен под заказ' },
    { key: 'opt-digit', label: 'Выбор цифры (0-9)' },
    { key: 'opt-inscription', label: 'Индивидуальная надпись' }
  ];

  /* ---------- Studio Pro ---------- */
  var STUDIO_MODEL = 'google/gemini-3.1-flash-image-preview'; // Nano Banana (editing)
  var STUDIO_ENDPOINT = 'https://nordrouter.com/v1/chat/completions';
  var SCENES = [
    { id: 'floor', label: 'Напольная сцена (студийный пол + стена)', path: 'assets/studio-bg-floor.jpg', mode: 'FLOOR' },
    { id: 'wall', label: 'Только стена (WALL_ONLY, без пола и плинтуса)', path: 'assets/studio-bg-wall.jpg', mode: 'WALL_ONLY' },
    { id: 'photozone', label: 'Фотозона (просторный зал)', path: 'assets/studio-bg-photozone.jpg', mode: 'PHOTOZONE' },
    { id: 'original', label: 'Оставить оригинальный фон (только цветокоррекция и резкость)', path: '', mode: 'ORIGINAL' }
  ];
  var STUDIO_SYSTEM = 'Ты — ретушёр товарных фото студии VigSharm. ЖЁСТКОЕ СИСТЕМНОЕ ПРАВИЛО PRODUCT IMMUTABLE: товар (букеты, композиции из шаров, цветы, цифры, надписи) неприкосновенен — запрещено перерисовывать, менять цвета, форму, количество, пропорции или расположение элементов товара. Единственная задача — перенести товар целиком на предоставленный эталонный фон и добавить естественную студийную тень, сохранив товар узнаваемым до мелочей. Не добавляй и не убирай элементы товара. Верни только итоговое изображение без текста, подписей и рамок.';

  var state = {
    owner: '', repo: '', branch: 'main', token: '', nordKey: '',
    nextId: 1, nextSku: 'BM-001',
    imageBlob: null, webpBlob: null, webpMeta: null, webpKey: '',
    studioBlob: null, studioMeta: null,
    products: [], busy: false
  };

  /* ---------- dom helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function val(id, v) {
    var el = $(id);
    if (v !== undefined) { el.value = v; }
    return el.value;
  }
  function setStatus(el, msg, kind) {
    el.textContent = msg;
    el.className = 'status ' + (kind || '');
  }
  function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast ' + (kind || ''); }, 3600);
  }
  function setBusy(on) {
    state.busy = on;
    var btn = $('publish');
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spin"></span> Публикуем…' : 'Опубликовать товар';
  }

  /* ---------- settings storage ---------- */
  function saveSettings() {
    var s = { owner: val('gh-owner').trim(), repo: val('gh-repo').trim(), branch: val('gh-branch').trim() || 'main', token: val('gh-token').trim(), nordKey: val('nord-key').trim() };
    try { localStorage.setItem('vigsharm.admin.settings', JSON.stringify(s)); } catch (e) {}
    return s;
  }
  function saveNordKey() {
    var s = loadSettings() || {};
    s.nordKey = val('nord-key').trim();
    state.nordKey = s.nordKey;
    try { localStorage.setItem('vigsharm.admin.settings', JSON.stringify(s)); } catch (e) {}
  }
  function loadSettings() {
    try {
      var raw = localStorage.getItem('vigsharm.admin.settings');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearToken() {
    var s = loadSettings() || {};
    s.token = '';
    try { localStorage.setItem('vigsharm.admin.settings', JSON.stringify(s)); } catch (e) {}
    state.token = '';
    val('gh-token', '');
  }

  /* ---------- utils ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  var TRANSLIT = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  function slugify(s) {
    var out = '';
    String(s || '').toLowerCase().split('').forEach(function (ch) { out += TRANSLIT[ch] || ch; });
    out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return out || 'product';
  }
  function budgetGroup(price) {
    if (price < 1000) return 'До 1 000 ₽';
    if (price <= 2000) return '1 000–2 000 ₽';
    if (price <= 3500) return '2 000–3 500 ₽';
    if (price <= 5000) return '3 500–5 000 ₽';
    if (price <= 8000) return '5 000–8 000 ₽';
    return 'От 8 000 ₽';
  }
  function pad3(n) { return ('00' + n).slice(-3); }
  function computeNext(products) {
    var maxId = 0, maxNum = 0;
    (products || []).forEach(function (p) {
      if (typeof p.id === 'number' && p.id > maxId) maxId = p.id;
      var m = /^BM-(\d+)$/.exec(p.sku || '');
      if (m) { var n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    });
    state.nextId = maxId + 1;
    state.nextSku = 'BM-' + pad3(maxNum + 1);
    val('p-sku', state.nextSku);
  }
  function b64ToUtf8(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
      fr.readAsDataURL(blob);
    });
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' КБ';
    return (bytes / 1048576).toFixed(1) + ' МБ';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- image compression (WebP, long side 2000, quality 0.92, soft bicubic) ---------- */
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('Файл не выбран')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width || 1;
        var h = img.naturalHeight || img.height || 1;
        var MAX = 2000;
        var longSide = Math.max(w, h);
        var scale = longSide > MAX ? MAX / longSide : 1;
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));

        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tw, th);

        // Progressive 50% downscale steps give softer, sharper bicubic results than one big jump.
        var src = img, curW = w, curH = h;
        while (curW * 0.5 >= tw && curH * 0.5 >= th) {
          curW = Math.max(1, Math.round(curW * 0.5));
          curH = Math.max(1, Math.round(curH * 0.5));
          var step = document.createElement('canvas');
          step.width = curW; step.height = curH;
          var sctx = step.getContext('2d');
          sctx.imageSmoothingEnabled = true;
          sctx.imageSmoothingQuality = 'high';
          sctx.fillStyle = '#FFFFFF';
          sctx.fillRect(0, 0, curW, curH);
          sctx.drawImage(src, 0, 0, curW, curH);
          src = step;
        }
        ctx.drawImage(src, 0, 0, tw, th);

        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Браузер не смог создать WebP')); return; }
          resolve({ blob: blob, width: tw, height: th, original: file.size });
        }, 'image/webp', 0.92);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение')); };
      img.src = url;
    });
  }

  /* ---------- studio image helpers ---------- */
  function clamp8(v) { return v < 0 ? 0 : (v > 255 ? 255 : Math.round(v)); }
  function loadImageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото')); };
      img.src = url;
    });
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('Браузер не смог создать изображение'));
        else resolve(blob);
      }, type || 'image/webp', quality || 0.92);
    });
  }
  function blobToWebpDataUrl(blob, maxSide) {
    maxSide = maxSide || 1600;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth || img.width || 1;
        var h = img.naturalHeight || img.height || 1;
        var longSide = Math.max(w, h);
        var scale = longSide > maxSide ? maxSide / longSide : 1;
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(img, 0, 0, tw, th);
        resolve(canvas.toDataURL('image/webp', 0.92));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть фото')); };
      img.src = url;
    });
  }
  function imageUrlToWebpBlob(url, maxSide) {
    maxSide = maxSide || 2000;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width || 1;
        var h = img.naturalHeight || img.height || 1;
        var longSide = Math.max(w, h);
        var scale = longSide > maxSide ? maxSide / longSide : 1;
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(img, 0, 0, tw, th);
        canvas.toBlob(function (blob) {
          if (!blob) reject(new Error('Браузер не смог создать WebP'));
          else resolve({ blob: blob, width: tw, height: th });
        }, 'image/webp', 0.92);
      };
      img.onerror = function () { reject(new Error('Не удалось открыть изображение')); };
      img.src = url;
    });
  }
  async function loadReferenceDataUrl(path, maxSide) {
    var res = await fetch(path);
    if (!res.ok) throw new Error('Не удалось загрузить эталонный фон');
    var blob = await res.blob();
    return blobToWebpDataUrl(blob, maxSide || 1024);
  }

  function applyCanvasCorrection(img) {
    var w = img.naturalWidth || img.width || 1;
    var h = img.naturalHeight || img.height || 1;
    var side = Math.min(w, h);
    var sx = Math.max(0, Math.floor((w - side) / 2));
    var sy = Math.max(0, Math.floor((h - side) / 2));

    var canvas = document.createElement('canvas');
    canvas.width = side; canvas.height = side;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);

    var imageData = ctx.getImageData(0, 0, side, side);
    var px = imageData.data;

    // Auto white balance (gray world) with bounded channel gains.
    var sumR = 0, sumG = 0, sumB = 0, count = px.length / 4;
    for (var i = 0; i < px.length; i += 4) { sumR += px[i]; sumG += px[i + 1]; sumB += px[i + 2]; }
    var gray = (sumR + sumG + sumB) / (3 * count);
    var kr = gray / ((sumR / count) || 1), kg = gray / ((sumG / count) || 1), kb = gray / ((sumB / count) || 1);
    kr = Math.max(0.8, Math.min(1.25, kr));
    kg = Math.max(0.8, Math.min(1.25, kg));
    kb = Math.max(0.8, Math.min(1.25, kb));

    var contrast = 1.06;
    for (var j = 0; j < px.length; j += 4) {
      var r = px[j] * kr, g = px[j + 1] * kg, b = px[j + 2] * kb;
      px[j] = clamp8((r - 128) * contrast + 128);
      px[j + 1] = clamp8((g - 128) * contrast + 128);
      px[j + 2] = clamp8((b - 128) * contrast + 128);
    }
    ctx.putImageData(imageData, 0, 0);

    sharpenCanvas(ctx, side, side);
    return canvas;
  }

  function sharpenCanvas(ctx, w, h) {
    var src = ctx.getImageData(0, 0, w, h);
    var blurred = new Uint8ClampedArray(src.data.length);
    var half = 1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var rs = 0, gs = 0, bs = 0, n = 0;
        for (var dy = -half; dy <= half; dy++) {
          for (var dx = -half; dx <= half; dx++) {
            var yy = y + dy, xx = x + dx;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            var idx = (yy * w + xx) * 4;
            rs += src.data[idx]; gs += src.data[idx + 1]; bs += src.data[idx + 2]; n++;
          }
        }
        var idx2 = (y * w + x) * 4;
        blurred[idx2] = rs / n; blurred[idx2 + 1] = gs / n; blurred[idx2 + 2] = bs / n; blurred[idx2 + 3] = 255;
      }
    }
    var amount = 0.6;
    for (var k = 0; k < src.data.length; k += 4) {
      for (var c = 0; c < 3; c++) {
        src.data[k + c] = clamp8(src.data[k + c] + amount * (src.data[k + c] - blurred[k + c]));
      }
    }
    ctx.putImageData(src, 0, 0);
  }

  function extractImageFromResponse(data) {
    // Gemini-native response: candidates[].content.parts[].inlineData / inline_data
    var candidates = (data && data.candidates) || [];
    for (var c = 0; c < candidates.length; c++) {
      var content = (candidates[c] && candidates[c].content) || {};
      var parts = content.parts || [];
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p] || {};
        var inline = part.inlineData || part.inline_data;
        if (inline && inline.data) {
          return 'data:' + (inline.mimeType || inline.mime_type || 'image/webp') + ';base64,' + inline.data;
        }
        var fd = part.fileData || part.file_data;
        if (fd && (fd.fileUri || fd.file_uri)) return fd.fileUri || fd.file_uri;
        if (typeof part.text === 'string' && part.text.indexOf('data:image/') === 0) return part.text;
      }
    }

    var choices = (data && data.choices) || [];
    for (var i = 0; i < choices.length; i++) {
      var msg = choices[i].message || {};
      if (Array.isArray(msg.images)) {
        for (var j = 0; j < msg.images.length; j++) {
          var im = msg.images[j];
          if (im && im.image_url && im.image_url.url) return im.image_url.url;
        }
      }
      if (Array.isArray(msg.content)) {
        for (var k = 0; k < msg.content.length; k++) {
          var part = msg.content[k];
          if (part && part.image_url && part.image_url.url) return part.image_url.url;
        }
      }
      if (typeof msg.content === 'string') {
        var m = /(data:image\/[^)"\s]+)/.exec(msg.content);
        if (m) return m[1];
      }
    }
    if (Array.isArray(data && data.data)) {
      for (var d = 0; d < data.data.length; d++) {
        if (data.data[d].b64_json) return 'data:image/png;base64,' + data.data[d].b64_json;
        if (data.data[d].url) return data.data[d].url;
      }
    }
    return null;
  }

  function studioPrompt(scene) {
    var placement;
    if (scene.mode === 'WALL_ONLY') placement = 'на эталонном фоне «только стена»: ровная стена без пола и плинтуса, товар стоит/висит на фоне стены, мягкая контактная тень на стене';
    else if (scene.mode === 'PHOTOZONE') placement = 'в просторном зале-фотозоне: товар красиво расположен в пространстве, естественная перспектива, мягкая студийная тень';
    else placement = 'на эталонном фоне «студийный пол + стена»: товар стоит на полу, реалистичная контактная тень на полу, чистая стена позади';
    return 'Первое изображение — товар (НЕПРИКОСНОВЕНЕН, PRODUCT IMMUTABLE). Второе изображение — эталонный фон. Перенеси товар целиком ' + placement + '. Сохрани товар пиксельно точным: цвета, форма, количество и расположение шаров, надписи и цифры без изменений. Верни только итоговую картинку.';
  }

  function dataUrlToInlinePart(dataUrl) {
    var m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('Не удалось разобрать изображение в base64');
    return { mimeType: m[1], data: m[2] };
  }

  async function callStudioApi(productDataUrl, bgDataUrl, scene) {
    var product = dataUrlToInlinePart(productDataUrl);
    var bg = dataUrlToInlinePart(bgDataUrl);
    var requestBody = {
      model: STUDIO_MODEL,
      systemInstruction: { parts: [{ text: STUDIO_SYSTEM }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: studioPrompt(scene) },
            { inlineData: { mimeType: product.mimeType, data: product.data } },
            { inlineData: { mimeType: bg.mimeType, data: bg.data } }
          ]
        }
      ]
    };
    console.log('NordRouter request:', JSON.stringify(requestBody));
    var res = await fetch(STUDIO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + state.nordKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var msg = (data && data.error && (data.error.message || data.error)) || (data && data.message) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    var imgUrl = extractImageFromResponse(data);
    if (!imgUrl) throw new Error('Модель не вернула изображение');
    return imgUrl;
  }

  /* ---------- github api ---------- */
  function ghRequest(path, opts) {
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Authorization': 'Bearer ' + state.token,
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      }).catch(function () {
        return { ok: res.ok, status: res.status, data: {} };
      });
    });
  }
  async function ghGetFile(path) {
    var r = await ghRequest('/repos/' + state.owner + '/' + state.repo + '/contents/' + path + '?ref=' + encodeURIComponent(state.branch));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error((r.data && r.data.message) || ('HTTP ' + r.status));
    return r.data;
  }
  async function ghPutFile(path, message, contentB64, sha) {
    var body = { message: message, content: contentB64, branch: state.branch };
    if (sha) body.sha = sha;
    var r = await ghRequest('/repos/' + state.owner + '/' + state.repo + '/contents/' + path, { method: 'PUT', body: body });
    if (!r.ok) throw new Error((r.data && r.data.message) || ('HTTP ' + r.status));
    return r.data;
  }
  async function ghDeleteFile(path, message) {
    var file = await ghGetFile(path);
    if (!file) return null;
    var r = await ghRequest('/repos/' + state.owner + '/' + state.repo + '/contents/' + path, {
      method: 'DELETE',
      body: { message: message, sha: file.sha, branch: state.branch }
    });
    if (!r.ok) throw new Error((r.data && r.data.message) || ('HTTP ' + r.status));
    return r.data;
  }
  async function fetchCatalog() {
    var file = await ghGetFile(JSON_PATH);
    if (!file) return [];
    var data = JSON.parse(b64ToUtf8(file.content));
    return Array.isArray(data.products) ? data.products : [];
  }
  async function writeCatalog(products, message) {
    var jsonText = JSON.stringify({ products: products }, null, 2);
    var jsonB64 = utf8ToB64(jsonText);
    var file = await ghGetFile(JSON_PATH);
    await ghPutFile(JSON_PATH, message, jsonB64, file ? file.sha : null);
  }

  /* ---------- published products list ---------- */
  function findProduct(id) {
    var items = state.products || [];
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function imgSrc(key) {
    if (!key) return '';
    if (key.indexOf('http') === 0 || key.charAt(0) === '/') return key;
    return 'api/images/' + key;
  }
  function productImageKeys(p) {
    var out = [];
    (p.image_keys || []).forEach(function (k) { if (k && out.indexOf(k) < 0) out.push(k); });
    var dm = p.digit_images;
    if (dm && typeof dm === 'object') {
      Object.keys(dm).forEach(function (d) {
        var k = dm[d];
        if (k && out.indexOf(k) < 0) out.push(k);
      });
    }
    return out;
  }
  async function deleteProductImages(product) {
    var keys = productImageKeys(product);
    var deleted = 0;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.indexOf('http') === 0) continue;
      var path = (key.charAt(0) === '/' ? key : 'api/images/' + key).replace(/^\/+/, '');
      try {
        await ghDeleteFile(path, 'Удалить фото: ' + product.title + ' (' + product.sku + ')');
        deleted++;
      } catch (e) { /* ignore — an orphan file is harmless; keep going */ }
    }
    return deleted;
  }
  function renderProducts() {
    var box = $('products-list');
    var items = state.products || [];
    $('products-count').textContent = items.length + ' шт.';
    if (!items.length) {
      box.innerHTML = '<div class="products-empty">Пока нет опубликованных товаров. Добавьте первую композицию выше — она появится здесь.</div>';
      return;
    }
    box.innerHTML = '<div class="products-grid">' + items.map(productTile).join('') + '</div>';
  }
  function productTile(p) {
    var key = (p.image_keys && p.image_keys[0]) || '';
    var thumb = key
      ? '<div class="thumb"><img src="' + esc(imgSrc(key)) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async"/></div>'
      : '<div class="thumb"><span class="ph" aria-hidden="true">🎈</span></div>';
    return '<article class="product-tile" data-id="' + esc(p.id) + '">' +
      thumb +
      '<h3>' + esc(p.title) + '</h3>' +
      '<div class="meta"><b>' + esc(p.sku || '') + '</b><span>' + esc(p.category || '') + '</span></div>' +
      '<div class="price-row">' +
        '<label>Цена, ₽<input type="number" min="0" step="1" inputmode="numeric" value="' + esc(p.price) + '" data-price/></label>' +
        '<button type="button" class="btn" data-save>Сохранить</button>' +
      '</div>' +
      '<div class="actions">' +
        '<a class="btn" href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '" target="_blank" rel="noreferrer">Смотреть на сайте</a>' +
        '<button type="button" class="btn danger" data-delete>Удалить</button>' +
      '</div>' +
    '</article>';
  }
  async function savePrice(product, tile) {
    if (state.busy) return;
    var input = tile.querySelector('[data-price]');
    var price = parseInt(input.value, 10);
    if (isNaN(price) || price < 0) { toast('Укажите корректную цену', 'err'); return; }
    if (price === product.price) { toast('Цена не изменилась', ''); return; }
    if (!state.owner || !state.repo || !state.token) { toast('Сначала подключитесь к GitHub', 'err'); return; }
    var btn = tile.querySelector('[data-save]');
    btn.disabled = true; btn.textContent = '…';
    try {
      var products = state.products.slice();
      var target = null;
      for (var i = 0; i < products.length; i++) if (products[i].id === product.id) { target = products[i]; break; }
      if (!target) throw new Error('Товар не найден');
      target.price = price;
      target.budget_group = budgetGroup(price);
      await writeCatalog(products, 'Обновить цену: ' + product.title + ' (' + product.sku + ')');
      state.products = products;
      renderProducts();
      toast('Цена обновлена ✓', 'ok');
    } catch (e) {
      toast('Не удалось сохранить цену: ' + ((e && e.message) || 'ошибка'), 'err');
      btn.disabled = false; btn.textContent = 'Сохранить';
    }
  }
  async function deleteProduct(product, btn) {
    if (!state.owner || !state.repo || !state.token) { toast('Сначала подключитесь к GitHub', 'err'); return; }
    var imageKeys = productImageKeys(product);
    var note = imageKeys.length ? ' Фото также будет удалено из репозитория.' : '';
    if (!confirm('Удалить товар «' + product.title + '» (' + product.sku + ')?' + note)) return;
    btn.disabled = true; btn.textContent = '…';
    try {
      var products = (state.products || []).filter(function (o) { return o.id !== product.id; });
      await writeCatalog(products, 'Удалить товар: ' + product.title + ' (' + product.sku + ')');
      state.products = products;
      computeNext(products);
      $('gh-count').textContent = products.length;
      renderProducts();

      var deletedPhotos = await deleteProductImages(product);
      toast(deletedPhotos > 0 ? 'Товар и фото удалены ✓' : 'Товар удалён ✓', 'ok');
    } catch (e) {
      toast('Не удалось удалить: ' + ((e && e.message) || 'ошибка'), 'err');
      btn.disabled = false; btn.textContent = 'Удалить';
    }
  }

  /* ---------- build product ---------- */
  function checkedValues(sel) {
    var out = [];
    document.querySelectorAll(sel).forEach(function (el) { out.push(el.value); });
    return out;
  }
  function buildProduct() {
    var title = val('p-title').trim();
    var price = parseInt(val('p-price'), 10);
    var category = val('p-category');
    var occasions = checkedValues('#p-occasions input:checked');
    var optOrder = $('opt-order').checked;
    var optDigit = $('opt-digit').checked;
    var optInscription = $('opt-inscription').checked;
    var short = val('p-short').trim();
    var desc = val('p-desc').trim();
    var comp = val('p-composition').trim();

    var tags = occasions.slice();
    if (optOrder) tags.push('Под заказ');

    var audience = '';
    if (occasions.indexOf('Для мальчика') >= 0) audience = 'Для мальчиков';
    else if (occasions.indexOf('Для девочки') >= 0) audience = 'Для девочек';
    else if (occasions.indexOf('Для него') >= 0) audience = 'Для него';
    else if (occasions.indexOf('Для неё') >= 0) audience = 'Для неё';
    else if (occasions.indexOf('Для мамы') >= 0) audience = 'Для мамы';
    else if (occasions.indexOf('Детские') >= 0 || occasions.indexOf('1 годик') >= 0 || occasions.indexOf('На выписку') >= 0) audience = 'Для детей';

    return {
      id: state.nextId,
      slug: slugify(title),
      sku: state.nextSku,
      title: title,
      price: price,
      short_description: short || title,
      description: desc || short || title,
      composition: comp || '• ' + (category || 'Композиция') + ';',
      category: category,
      character_name: '',
      age_group: '',
      tags: tags,
      image_keys: [state.webpKey],
      budget_group: budgetGroup(price),
      has_digit_choice: optDigit,
      digit_count_on_photo: 1,
      is_floor_composition: false,
      has_inscription: optInscription,
      inscription_price: 0,
      has_rental: false,
      rental_days: 3,
      keep_price_delta: 500,
      rental_item: '',
      series: '',
      occasion: occasions[0] || '',
      audience: audience,
      seo_title: title + ' — заказать шары в Армавире | VigSharm',
      seo_description: (short || title).slice(0, 160),
      allow_color_change: false
    };
  }
  function validate() {
    if (!state.owner || !state.repo || !state.token) return 'Сначала укажите владельца, репозиторий и токен.';
    if (!val('p-title').trim()) return 'Введите название композиции.';
    var price = parseInt(val('p-price'), 10);
    if (isNaN(price) || price <= 0) return 'Укажите корректную цену.';
    if (!val('p-category')) return 'Выберите основную категорию.';
    if (!state.webpBlob) return 'Добавьте хотя бы одно фото.';
    return null;
  }

  /* ---------- publish ---------- */
  async function publish() {
    var err = validate();
    if (err) { setStatus($('publish-status'), err, 'err'); toast(err, 'err'); return; }
    setBusy(true);
    setStatus($('publish-status'), 'Сжимаем фото…', '');
    try {
      var webpBlob = state.studioBlob || state.webpBlob;
      if (!webpBlob) { webpBlob = (await compressImage(state.imageBlob)).blob; }
      var imageB64 = await blobToB64(webpBlob);
      var imageName = uuid() + '.webp';
      var imagePath = IMG_PATH + '/' + imageName;
      state.webpKey = 'products/' + imageName;

      setStatus($('publish-status'), 'Загружаем фото ' + imageName + '…', '');
      await ghPutFile(imagePath, 'Добавить фото: ' + val('p-title').trim(), imageB64, null);

      setStatus($('publish-status'), 'Читаем каталог…', '');
      var products = await fetchCatalog();
      var product = buildProduct();
      products.push(product);

      setStatus($('publish-status'), 'Сохраняем ' + product.sku + '…', '');
      await writeCatalog(products, 'Добавить товар: ' + product.title + ' (' + product.sku + ')');

      state.products = products;
      computeNext(products);
      $('gh-count').textContent = products.length;
      renderProducts();
      setStatus($('publish-status'), 'Опубликовано ✓', 'ok');
      toast('Опубликовано: ' + product.title + ' (' + product.sku + ')', 'ok');
      resetForm();
    } catch (e) {
      var msg = (e && e.message) ? e.message : 'Неизвестная ошибка';
      setStatus($('publish-status'), 'Ошибка: ' + msg, 'err');
      toast('Не удалось опубликовать: ' + msg, 'err');
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    ['p-title', 'p-price', 'p-short', 'p-desc', 'p-composition'].forEach(function (id) { val(id, ''); });
    val('p-photo', '');
    ['opt-order', 'opt-digit', 'opt-inscription'].forEach(function (id) { $(id).checked = false; });
    document.querySelectorAll('#p-occasions input:checked').forEach(function (el) { el.checked = false; });
    state.imageBlob = null; state.webpBlob = null; state.webpMeta = null; state.webpKey = '';
    val('p-scene', 'floor');
    renderScenePreview();
    clearStudioResult();
    $('p-preview').classList.add('hidden');
    $('p-preview-img').removeAttribute('src');
    val('p-sku', state.nextSku);
  }

  /* ---------- rendering ---------- */
  function renderCategory() {
    $('p-category').innerHTML = '<option value="">— выберите —</option>' + CATEGORIES.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');
  }
  function renderOccasions() {
    $('p-occasions').innerHTML = OCCASIONS.map(function (o) {
      return '<label class="chip"><input type="checkbox" value="' + o + '"/><span>' + o + '</span></label>';
    }).join('');
  }
  function renderOptions() {
    $('p-options').innerHTML = OPTIONS.map(function (o) {
      return '<label class="chip"><input type="checkbox" id="' + o.key + '"/><span>' + o.label + '</span></label>';
    }).join('');
  }

  /* ---------- photo handling ---------- */
  function handlePhoto(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('image/') !== 0) { toast('Выберите файл изображения', 'err'); return; }
    state.imageBlob = file;
    clearStudioResult();
    compressImage(file).then(function (r) {
      state.webpBlob = r.blob; state.webpMeta = r;
      var url = URL.createObjectURL(r.blob);
      var img = $('p-preview-img');
      img.onload = function () { URL.revokeObjectURL(url); };
      img.src = url;
      $('p-preview-meta').innerHTML = '<span>' + r.width + '×' + r.height + 'px · WebP</span><span>' + formatSize(r.original) + ' → ' + formatSize(r.blob.size) + '</span>';
      $('p-preview').classList.remove('hidden');
      toast('Фото готово (' + formatSize(r.blob.size) + ')', 'ok');
    }).catch(function (e) {
      toast((e && e.message) || 'Не удалось обработать фото', 'err');
    });
  }

  /* ---------- studio pro ---------- */
  function currentScene() {
    var id = val('p-scene') || 'floor';
    for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i];
    return SCENES[0];
  }
  function renderScenes() {
    $('p-scene').innerHTML = SCENES.map(function (s) {
      return '<option value="' + s.id + '">' + s.label + '</option>';
    }).join('');
    renderScenePreview();
  }
  function renderScenePreview() {
    var scene = currentScene();
    var box = $('scene-preview');
    if (scene && scene.path) {
      $('scene-preview-img').src = scene.path;
      $('scene-preview-title').textContent = scene.label;
      box.classList.remove('hidden');
    } else {
      box.classList.add('hidden');
    }
  }
  function clearStudioResult() {
    state.studioBlob = null;
    state.studioMeta = null;
    $('studio-result').classList.add('hidden');
    $('studio-result-img').removeAttribute('src');
    setStatus($('studio-status'), '', '');
  }
  function revertStudio() {
    clearStudioResult();
    toast('Исходное фото восстановлено', '');
  }
  async function processStudioPro() {
    if (!state.webpBlob && !state.imageBlob) {
      var noPhoto = 'Сначала загрузите фото.';
      setStatus($('studio-status'), noPhoto, 'err'); toast(noPhoto, 'err'); return;
    }
    var btn = $('studio-pro');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Обрабатываем…';
    setStatus($('studio-status'), '', '');
    try {
      var scene = currentScene();
      var sourceBlob = state.webpBlob || (await compressImage(state.imageBlob)).blob;
      if (state.nordKey && scene && scene.path) {
        setStatus($('studio-status'), 'Готовим фото и референс…', '');
        var productDataUrl = await blobToWebpDataUrl(sourceBlob, 1600);
        var bgDataUrl = await loadReferenceDataUrl(scene.path, 1024);
        setStatus($('studio-status'), 'Nano Banana переносит товар на эталонный фон…', '');
        var resultUrl = await callStudioApi(productDataUrl, bgDataUrl, scene);
        var r = await imageUrlToWebpBlob(resultUrl, 2000);
        state.studioBlob = r.blob;
        state.studioMeta = { width: r.width, height: r.height, method: 'Studio Pro · ' + scene.label };
      } else {
        setStatus($('studio-status'), 'Цветокоррекция на Canvas…', '');
        var img = await loadImageFromBlob(sourceBlob);
        var canvas = applyCanvasCorrection(img);
        var blob = await canvasToBlob(canvas, 'image/webp', 0.92);
        state.studioBlob = blob;
        state.studioMeta = { width: canvas.width, height: canvas.height, method: 'Автокоррекция Canvas · ' + scene.label };
      }
      var url = URL.createObjectURL(state.studioBlob);
      var rim = $('studio-result-img');
      rim.onload = function () { URL.revokeObjectURL(url); };
      rim.src = url;
      $('studio-result-meta').innerHTML = '<span>' + state.studioMeta.width + '×' + state.studioMeta.height + 'px · WebP</span><span>' + state.studioMeta.method + '</span>';
      $('studio-result').classList.remove('hidden');
      setStatus($('studio-status'), 'Готово ✓', 'ok');
      toast('Фото обработано в Studio Pro ✓', 'ok');
    } catch (e) {
      var msg = (e && e.message) || 'не удалось обработать';
      setStatus($('studio-status'), 'Ошибка: ' + msg, 'err');
      toast('Не удалось обработать: ' + msg, 'err');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ Обработать фото в Studio Pro';
    }
  }

  /* ---------- settings ---------- */
  function applySettings(s) {
    if (!s) return;
    state.owner = s.owner || ''; state.repo = s.repo || ''; state.branch = s.branch || 'main'; state.token = s.token || ''; state.nordKey = s.nordKey || '';
    val('gh-owner', state.owner); val('gh-repo', state.repo); val('gh-branch', state.branch); val('gh-token', state.token); val('nord-key', state.nordKey);
    renderConnection();
  }
  function renderConnection() {
    var badge = $('gh-badge');
    if (state.token && state.owner && state.repo) {
      badge.className = 'badge on'; badge.textContent = 'Подключено';
    } else {
      badge.className = 'badge off'; badge.textContent = 'Не подключено';
    }
  }
  async function connect() {
    var s = saveSettings();
    state.owner = s.owner; state.repo = s.repo; state.branch = s.branch; state.token = s.token;
    if (!state.token || !state.owner || !state.repo) { renderConnection(); toast('Заполните владельца, репозиторий и токен', 'err'); return; }
    setStatus($('gh-status'), 'Проверяем доступ…', '');
    try {
      var products = await fetchCatalog();
      state.products = products;
      computeNext(products);
      $('gh-count').textContent = products.length;
      renderProducts();
      renderConnection();
      setStatus($('gh-status'), 'Подключено · товаров: ' + products.length, 'ok');
      toast('Подключено к GitHub ✓', 'ok');
    } catch (e) {
      renderConnection();
      setStatus($('gh-status'), 'Ошибка: ' + ((e && e.message) || 'нет доступа'), 'err');
      toast('Не удалось подключиться: ' + ((e && e.message) || 'нет доступа'), 'err');
    }
  }

  /* ---------- events + init ---------- */
  function wireEvents() {
    $('gh-save').addEventListener('click', connect);
    $('gh-clear').addEventListener('click', function () { clearToken(); renderConnection(); setStatus($('gh-status'), 'Токен удалён из этого браузера.', ''); });
    $('p-photo').addEventListener('change', function () { handlePhoto(this.files && this.files[0]); });
    $('nord-key').addEventListener('input', saveNordKey);
    $('p-scene').addEventListener('change', renderScenePreview);
    $('studio-pro').addEventListener('click', processStudioPro);
    $('studio-revert').addEventListener('click', revertStudio);

    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handlePhoto(f);
    });

    $('publish').addEventListener('click', publish);

    $('products-list').addEventListener('click', function (e) {
      var tile = e.target && e.target.closest ? e.target.closest('.product-tile') : null;
      if (!tile) return;
      var product = findProduct(parseInt(tile.getAttribute('data-id'), 10));
      if (!product) return;
      var btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      if (btn.hasAttribute('data-delete')) deleteProduct(product, btn);
      else if (btn.hasAttribute('data-save')) savePrice(product, tile);
    });
  }

  function init() {
    renderCategory();
    renderOccasions();
    renderOptions();
    renderScenes();
    wireEvents();
    computeNext([]);
    renderProducts();
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.closest && t.closest('.product-tile .thumb')) {
        var ph = document.createElement('span');
        ph.className = 'ph';
        ph.setAttribute('aria-hidden', 'true');
        ph.textContent = '🎈';
        if (t.parentNode) t.parentNode.replaceChild(ph, t);
      }
    }, true);
    var s = loadSettings();
    applySettings(s);
    if (s && s.token && s.owner && s.repo) {
      fetchCatalog().then(function (products) {
        state.products = products;
        computeNext(products);
        $('gh-count').textContent = products.length;
        renderProducts();
        setStatus($('gh-status'), 'Каталог загружен · товаров: ' + products.length, 'ok');
      }).catch(function () {});
    }
  }

  init();
})();



