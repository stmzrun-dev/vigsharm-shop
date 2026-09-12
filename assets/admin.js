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

  var state = {
    owner: '', repo: '', branch: 'main', token: '',
    nextId: 1, nextSku: 'BM-001',
    imageBlob: null, webpBlob: null, webpMeta: null, webpKey: '',
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
    var s = { owner: val('gh-owner').trim(), repo: val('gh-repo').trim(), branch: val('gh-branch').trim() || 'main', token: val('gh-token').trim() };
    try { localStorage.setItem('vigsharm.admin.settings', JSON.stringify(s)); } catch (e) {}
    return s;
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

  /* ---------- image compression (WebP, max width 1400, quality 0.85) ---------- */
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('Файл не выбран')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width || 1;
        var h = img.naturalHeight || img.height || 1;
        var MAX = 1400;
        var scale = w > MAX ? MAX / w : 1;
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(img, 0, 0, tw, th);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Браузер не смог создать WebP')); return; }
          resolve({ blob: blob, width: tw, height: th, original: file.size });
        }, 'image/webp', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение')); };
      img.src = url;
    });
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
  async function fetchCatalog() {
    var file = await ghGetFile(JSON_PATH);
    if (!file) return [];
    var data = JSON.parse(b64ToUtf8(file.content));
    return Array.isArray(data.products) ? data.products : [];
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
      var webpBlob = state.webpBlob;
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
      var jsonText = JSON.stringify({ products: products }, null, 2);
      var jsonB64 = utf8ToB64(jsonText);
      var file = await ghGetFile(JSON_PATH);

      setStatus($('publish-status'), 'Сохраняем ' + product.sku + '…', '');
      await ghPutFile(JSON_PATH, 'Добавить товар: ' + product.title + ' (' + product.sku + ')', jsonB64, file ? file.sha : null);

      state.products = products;
      computeNext(products);
      $('gh-count').textContent = products.length;
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

  /* ---------- settings ---------- */
  function applySettings(s) {
    if (!s) return;
    state.owner = s.owner || ''; state.repo = s.repo || ''; state.branch = s.branch || 'main'; state.token = s.token || '';
    val('gh-owner', state.owner); val('gh-repo', state.repo); val('gh-branch', state.branch); val('gh-token', state.token);
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
  }

  function init() {
    renderCategory();
    renderOccasions();
    renderOptions();
    wireEvents();
    computeNext([]);
    var s = loadSettings();
    applySettings(s);
    if (s && s.token && s.owner && s.repo) {
      fetchCatalog().then(function (products) {
        state.products = products;
        computeNext(products);
        $('gh-count').textContent = products.length;
        setStatus($('gh-status'), 'Каталог загружен · товаров: ' + products.length, 'ok');
      }).catch(function () {});
    }
  }

  init();
})();



