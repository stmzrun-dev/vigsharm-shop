/* VigSharm admin: publish products straight to the GitHub Pages repo via REST API */
(function () {
  'use strict';

  var API = 'https://api.github.com';
  var IMG_PATH = 'api/images/products';
  var JSON_PATH = 'assets/products.json';

  var CATEGORIES = [
    '������������ �������', '������� �������', '���������', '���� ��������',
    '���������� ���������', '������ �� �����', '����� �� �����', '����',
    '���-�������', '��������� �����', '�������-�������', '������-����', '����� �� �����'
  ];

  var OCCASIONS = [
    '���� ��������', '1 �����', '�� �������', '��� ��������', '��� �������',
    '��� ����', '��� ����', '��� ��', '��������', '����� �� �����',
    '������-����', '�������', '����� ���', '14 �������', '23 �������',
    '8 �����', '���������', '�������'
  ];

  var OPTIONS = [
    { key: 'opt-order', label: '�������� ��� �����' },
    { key: 'opt-digit', label: '����� ����� (0-9)' },
    { key: 'opt-inscription', label: '�������������� �������' }
  ];

  var state = {
    owner: '', repo: '', branch: 'main', token: '', nordKey: '',
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
    btn.innerHTML = on ? '<span class="spin"></span> ���������' : '������������ �����';
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
  function applySettings(s) {
    s = s || {};
    state.owner = s.owner || '';
    state.repo = s.repo || '';
    state.branch = s.branch || 'main';
    state.token = s.token || '';
    state.nordKey = s.nordKey || '';
    if (s.owner) val('gh-owner', s.owner);
    if (s.repo) val('gh-repo', s.repo);
    if (s.branch) val('gh-branch', s.branch);
    if (s.token) val('gh-token', s.token);
    if (s.nordKey) val('nord-key', s.nordKey);
    renderConnection();
  }
  function renderConnection() {
    var badge = $('gh-badge');
    var ok = !!(state.owner && state.repo && state.token);
    badge.className = 'badge ' + (ok ? 'on' : 'off');
    badge.textContent = ok ? '����������' : '�� ����������';
    var count = $('gh-count');
    if (count) count.textContent = (state.products || []).length;
  }

  /* ---------- utils ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  var TRANSLIT = { '�':'a','�':'b','�':'v','�':'g','�':'d','�':'e','�':'e','�':'zh','�':'z','�':'i','�':'y','�':'k','�':'l','�':'m','�':'n','�':'o','�':'p','�':'r','�':'s','�':'t','�':'u','�':'f','�':'h','�':'ts','�':'ch','�':'sh','�':'sch','�':'','�':'y','�':'','�':'e','�':'yu','�':'ya' };
  function slugify(s) {
    var out = '';
    String(s || '').toLowerCase().split('').forEach(function (ch) { out += TRANSLIT[ch] || ch; });
    out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return out || 'product';
  }
  function budgetGroup(price) {
    if (price < 1000) return '�� 1 000 ?';
    if (price <= 2000) return '1 000�2 000 ?';
    if (price <= 3500) return '2 000�3 500 ?';
    if (price <= 5000) return '3 500�5 000 ?';
    if (price <= 8000) return '5 000�8 000 ?';
    return '�� 8 000 ?';
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
      fr.onerror = function () { reject(new Error('�� ������� ��������� ����')); };
      fr.readAsDataURL(blob);
    });
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' �';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' ��';
    return (bytes / 1048576).toFixed(1) + ' ��';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function nordKey() {
    var s = loadSettings() || {};
    return (s.nordKey || state.nordKey || '').trim();
  }
  function publicImageUrl(key) {
    if (!key) return '';
    if (key.indexOf('http') === 0) return key;
    var path = (key.charAt(0) === '/' ? key : 'api/images/' + key).replace(/^\/+/, '');
    return 'https://raw.githubusercontent.com/' + state.owner + '/' + state.repo + '/' + encodeURIComponent(state.branch) + '/' + path;
  }
  function resizeImage(blob, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!blob) { reject(new Error('��� �����������')); return; }
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var longSide = Math.max(w, h);
        var scale = longSide > maxSide ? maxSide / longSide : 1;
        var tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(img, 0, 0, tw, th);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (out) {
          if (!out) { reject(new Error('�� ������� �������� ������')); return; }
          resolve(out);
        }, blob.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.95);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('�� ������� ������� �����������')); };
      img.src = url;
    });
  }
  function imageBlobToWebp(blob, quality) {
    return new Promise(function (resolve, reject) {
      if (!blob) { reject(new Error('��� �����������')); return; }
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (out) {
          if (!out) { reject(new Error('������� �� ���� ������� WebP')); return; }
          resolve(out);
        }, 'image/webp', quality || 0.92);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('�� ������� ������� �����������')); };
      img.src = url;
    });
  }

  /* ---------- image compression (WebP, long side 2000, quality 0.92, soft bicubic) ---------- */
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('���� �� ������')); return; }
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
          if (!blob) { reject(new Error('������� �� ���� ������� WebP')); return; }
          resolve({ blob: blob, width: tw, height: th, original: file.size });
        }, 'image/webp', 0.92);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('�� ������� ������� �����������')); };
      img.src = url;
    });
  }

    async function callStudioApi(imageUrl, statusEl) {
    var key = nordKey();
    if (!key) throw new Error('NordRouter API Key �� �����. �������� ���������.');

    setStatus(statusEl, '? �������� � NordRouter...', 'info');
    var prompt = '��������� �������� �����, ��������� �� ��������� ������-����� ��� � ����� ���������, ������ ����, ��� ��������� ����� �������, ��� ��������� ����� ����� � ��������';
    var reqBody = JSON.stringify({ model: 'image/nano-banana-edit', input: { prompt: prompt, image: imageUrl } });
    console.log('[StudioPro] POST /media/generate', reqBody);

    var jobResp = await fetch('https://nordrouter.com/media/generate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: reqBody
    });
    var job = await jobResp.json();
    console.log('[StudioPro] Job:', job);
    if (!job.id) throw new Error('NordRouter �� ������ ������: ' + JSON.stringify(job));

    // Polling
    setStatus(statusEl, '? ���������...', 'info');
    var result, attempt = 0;
    while (attempt < 60) {
      await new Promise(function(r) { setTimeout(r, 3000); });
      var res = await fetch('https://nordrouter.com/media/job/' + job.id, {
        headers: { 'Authorization': 'Bearer ' + key }
      });
      result = await res.json();
      console.log('[StudioPro] Status:', result.status);
      if (result.status === 'done') break;
      if (result.status === 'failed') throw new Error('NordRouter: ��������� �� �������');
      attempt++;
      setStatus(statusEl, '? ���������... (' + (attempt * 3) + ' ���)', 'info');
    }
    if (!result || result.status !== 'done') throw new Error('NordRouter: ������� �������� (>3 ���)');

    // Download result
    setStatus(statusEl, '? ���������� ����������...', 'info');
    var imgResp = await fetch(result.result_url, { headers: { 'Authorization': 'Bearer ' + key } });
    if (!imgResp.ok) throw new Error('�� ������� �������: HTTP ' + imgResp.status);
    var blob = await imgResp.blob();
    console.log('[StudioPro] Result:', blob.size, 'bytes', blob.type);
    if (blob.size < 1000) throw new Error('��������� ������ (' + blob.size + ' bytes)');
    return blob;
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
  async function ghDeleteFile(path, message, sha) {
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
        await ghDeleteFile(path, '������� ����: ' + product.title + ' (' + product.sku + ')');
        deleted++;
      } catch (e) { /* ignore � an orphan file is harmless; keep going */ }
    }
    return deleted;
  }
  function renderProducts() {
    var box = $('products-list');
    var items = state.products || [];
    $('products-count').textContent = items.length + ' ��.';
    if (!items.length) {
      box.innerHTML = '<div class="products-empty">���� ��� �������������� �������. �������� ������ ���������� ���� � ��� �������� �����.</div>';
      return;
    }
    box.innerHTML = '<div class="products-grid">' + items.map(productTile).join('') + '</div>';
  }
  function productTile(p) {
    var key = (p.image_keys && p.image_keys[0]) || '';
    var thumb = key
      ? '<div class="thumb"><img src="' + esc(imgSrc(key)) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async"/></div>'
      : '<div class="thumb"><span class="ph" aria-hidden="true">??</span></div>';
    return '<article class="product-tile" data-id="' + esc(p.id) + '">' +
      thumb +
      '<h3>' + esc(p.title) + '</h3>' +
      '<div class="meta"><b>' + esc(p.sku || '') + '</b><span>' + esc(p.category || '') + '</span></div>' +
      '<div class="price-row">' +
        '<label>����, ?<input type="number" min="0" step="1" inputmode="numeric" value="' + esc(p.price) + '" data-price/></label>' +
        '<button type="button" class="btn" data-save>���������</button>' +
      '</div>' +
      '<div class="actions">' +
        '<a class="btn" href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '" target="_blank" rel="noreferrer">�������� �� �����</a>' +
        '<button type="button" class="btn-studio" onclick="retouchProduct(\'' + esc(p.sku) + '\')">������������</button>' +
        '<button type="button" class="btn danger" data-delete>�������</button>' +
      '</div>' +
    '</article>';
  }

  /* Retouch a published product's photo via the Studio Pro workflow */
  async function retouchProduct(sku) {
    var statusEl = $('studio-status');
    if (!state.owner || !state.repo || !state.token) {
      setStatus(statusEl, '������� ������������ � GitHub', 'err');
      toast('������� ������������ � GitHub', 'err');
      return;
    }
    var items = state.products || [];
    var product = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].sku === sku) { product = items[i]; break; }
    }
    if (!product) { toast('����� � ��������� �' + sku + '� �� ������', 'err'); return; }
    var key = (product.image_keys && product.image_keys[0]) || product.image || product.src || '';
    if (!key) { toast('� ������ ��� ����������� ��� ���������', 'err'); return; }
    if (!nordKey()) {
      setStatus(statusEl, '������� NordRouter API Key � ����������!', 'err');
      toast('������� NordRouter API Key � ����������!', 'err');
      return;
    }
    try {
      var blob = await callStudioApi(publicImageUrl(key), statusEl);
      setStatus(statusEl, '? ��������� ���������...', 'info');
      var resized = await resizeImage(blob, 2048);
      var webp = await imageBlobToWebp(resized, 0.82);
      var name = uuid() + '.webp';
      var path = IMG_PATH + '/' + name;
      var newKey = 'products/' + name;
      await ghPutFile(path, 'Studio Pro: ��������� ���� ��� ' + product.title + ' (' + product.sku + ')', await blobToB64(webp), null);
      var products = state.products.slice();
      for (var i = 0; i < products.length; i++) {
        if (products[i].sku === sku) {
          products[i].image_keys = [newKey];
          break;
        }
      }
      await writeCatalog(products, 'Studio Pro: �������� ���� ' + product.title + ' (' + product.sku + ')');
      state.products = products;
      renderProducts();
      setStatus(statusEl, '? ���� ���������� � ����������� � ������', 'ok');
      toast('Studio Pro: ���� ��������� ?', 'ok');
    } catch (e) {
      console.error('[StudioPro retouch]', e);
      setStatus(statusEl, '? ' + e.message, 'err');
      toast('������: ' + e.message, 'err');
    }
  }
  async function savePrice(product, tile) {
    if (state.busy) return;
    var input = tile.querySelector('[data-price]');
    var price = parseInt(input.value, 10);
    if (isNaN(price) || price < 0) { toast('������� ���������� ����', 'err'); return; }
    if (price === product.price) { toast('���� �� ����������', ''); return; }
    if (!state.owner || !state.repo || !state.token) { toast('������� ������������ � GitHub', 'err'); return; }
    var btn = tile.querySelector('[data-save]');
    btn.disabled = true; btn.textContent = '�';
    try {
      var products = state.products.slice();
      var target = null;
      for (var i = 0; i < products.length; i++) if (products[i].id === product.id) { target = products[i]; break; }
      if (!target) throw new Error('����� �� ������');
      target.price = price;
      target.budget_group = budgetGroup(price);
      await writeCatalog(products, '�������� ����: ' + product.title + ' (' + product.sku + ')');
      state.products = products;
      renderProducts();
      toast('���� ��������� ?', 'ok');
    } catch (e) {
      toast('�� ������� ��������� ����: ' + ((e && e.message) || '������'), 'err');
      btn.disabled = false; btn.textContent = '���������';
    }
  }
  async function deleteProduct(product, btn) {
    if (!state.owner || !state.repo || !state.token) { toast('������� ������������ � GitHub', 'err'); return; }
    var imageKeys = productImageKeys(product);
    var note = imageKeys.length ? ' ���� ����� ����� ������� �� �����������.' : '';
    if (!confirm('������� ����� �' + product.title + '� (' + product.sku + ')?' + note)) return;
    btn.disabled = true; btn.textContent = '�';
    try {
      var products = (state.products || []).filter(function (o) { return o.id !== product.id; });
      await writeCatalog(products, '������� �����: ' + product.title + ' (' + product.sku + ')');
      state.products = products;
      computeNext(products);
      $('gh-count').textContent = products.length;
      renderProducts();

      var deletedPhotos = await deleteProductImages(product);
      toast(deletedPhotos > 0 ? '����� � ���� ������� ?' : '����� ����� ?', 'ok');
    } catch (e) {
      toast('�� ������� �������: ' + ((e && e.message) || '������'), 'err');
      btn.disabled = false; btn.textContent = '�������';
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
    if (optOrder) tags.push('��� �����');

    var audience = '';
    if (occasions.indexOf('��� ��������') >= 0) audience = '��� ���������';
    else if (occasions.indexOf('��� �������') >= 0) audience = '��� �������';
    else if (occasions.indexOf('��� ����') >= 0) audience = '��� ����';
    else if (occasions.indexOf('��� ��') >= 0) audience = '��� ��';
    else if (occasions.indexOf('��� ����') >= 0) audience = '��� ����';
    else if (occasions.indexOf('�������') >= 0 || occasions.indexOf('1 �����') >= 0 || occasions.indexOf('�� �������') >= 0) audience = '��� �����';

    return {
      id: state.nextId,
      slug: slugify(title),
      sku: state.nextSku,
      title: title,
      price: price,
      short_description: short || title,
      description: desc || short || title,
      composition: comp || '� ' + (category || '����������') + ';',
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
      seo_title: title + ' � �������� ���� � �������� | VigSharm',
      seo_description: (short || title).slice(0, 160),
      allow_color_change: false
    };
  }
  function validate() {
    if (!state.owner || !state.repo || !state.token) return '������� ������� ���������, ����������� � �����.';
    if (!val('p-title').trim()) return '������� �������� ����������.';
    var price = parseInt(val('p-price'), 10);
    if (isNaN(price) || price <= 0) return '������� ���������� ����.';
    if (!val('p-category')) return '�������� �������� ���������.';
    if (!state.webpBlob) return '�������� ���� �� ���� ����.';
    return null;
  }

  /* ---------- publish ---------- */
  async function publish() {
    var err = validate();
    if (err) { setStatus($('publish-status'), err, 'err'); toast(err, 'err'); return; }
    setBusy(true);
    setStatus($('publish-status'), '������� ����', '');
    try {
      var webpBlob = state.webpBlob;
      if (!webpBlob) { webpBlob = (await compressImage(state.imageBlob)).blob; }
      var imageB64 = await blobToB64(webpBlob);
      var imageName = uuid() + '.webp';
      var imagePath = IMG_PATH + '/' + imageName;
      state.webpKey = 'products/' + imageName;

      setStatus($('publish-status'), '��������� ���� ' + imageName + '�', '');
      await ghPutFile(imagePath, '�������� ����: ' + val('p-title').trim(), imageB64, null);

      setStatus($('publish-status'), '������ �������', '');
      var products = await fetchCatalog();
      var product = buildProduct();
      products.push(product);

      setStatus($('publish-status'), '��������� ' + product.sku + '�', '');
      await writeCatalog(products, '�������� �����: ' + product.title + ' (' + product.sku + ')');

      state.products = products;
      computeNext(products);
      $('gh-count').textContent = products.length;
      renderProducts();
      setStatus($('publish-status'), '������������ ?', 'ok');
      toast('������������: ' + product.title + ' (' + product.sku + ')', 'ok');
      resetForm();
    } catch (e) {
      var msg = (e && e.message) ? e.message : '����������� ������';
      setStatus($('publish-status'), '������: ' + msg, 'err');
      toast('�� ������� ������������: ' + msg, 'err');
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
    $('p-category').innerHTML = '<option value="">� �������� �</option>' + CATEGORIES.map(function (c) {
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
    if (file.type && file.type.indexOf('image/') !== 0) { toast('�������� ���� �����������', 'err'); return; }
    state.imageBlob = file;
    state.webpKey = '';
    compressImage(file).then(function (r) {
      state.webpBlob = r.blob; state.webpMeta = r;
      var url = URL.createObjectURL(r.blob);
      var img = $('p-preview-img');
      img.onload = function () { URL.revokeObjectURL(url); };
      img.src = url;
      $('p-preview-meta').innerHTML = '<span>' + r.width + '?' + r.height + 'px � WebP</span><span>' + formatSize(r.original) + ' > ' + formatSize(r.blob.size) + '</span>';
      $('p-preview').classList.remove('hidden');
      toast('���� ������ (' + formatSize(r.blob.size) + ')', 'ok');
    }).catch(function (e) {
      toast((e && e.message) || '�� ������� ���������� ����', 'err');
    });
  }

  /* ---------- studio pro ---------- */
  async function processStudioPro() {
    var sEl = $('studio-status');
    if (!state.webpBlob && !state.imageBlob) {
      var noPhoto = '������� ��������� ����.';
      setStatus(sEl, noPhoto, 'err'); toast(noPhoto, 'err'); return;
    }
    if (!state.webpKey) {
      toast('������� ����������� �����!', 'err');
      return;
    }
    if (!state.nordKey) {
      toast('������� NordRouter API Key � ����������!', 'err');
      return;
    }
    try {
      var blob = await callStudioApi(imgSrc(state.webpKey), sEl);
      var resized = await resizeImage(blob, 2048);
      var webpBlob = await imageBlobToWebp(resized, 0.82);
      setStatus(sEl, '? ���������� ����������...', 'info');
      var webpKey = 'api/images/products/' + state.webpKey + '.webp';
      await ghPutFile(webpKey, webpBlob, 'Studio Pro: ' + state.webpKey);
      state.webpBlob = webpBlob;
      state.webpKey = webpKey;
      var products = await fetchCatalog() || {};
      if (!products[state.webpKey]) {
        products[state.webpKey] = state.product || {};
        products[state.webpKey].slug = state.webpKey.split('/').pop().replace(/\.webp$/, '');
        products[state.webpKey].title = state.product.title || '�����';
      }
      products[state.webpKey].webp = webpKey;
      await ghPutFile('api/products.json', JSON.stringify(products, null, 2), 'Update catalog');
      renderProducts();
      setStatus(sEl, '? ���� ���������� � ���������!', 'ok');
      toast('Studio Pro ������!', 'ok');
    } catch (e) {
      console.error('[StudioPro]', e);
      setStatus(sEl, '? ' + e.message, 'err');
      toast('������: ' + e.message, 'err');
    }
  }
  async function connect() {
    var s = saveSettings();
    state.owner = s.owner; state.repo = s.repo; state.branch = s.branch; state.token = s.token;
    if (!state.token || !state.owner || !state.repo) { renderConnection(); toast('��������� ���������, ����������� � �����', 'err'); return; }
    setStatus($('gh-status'), '��������� ������', '');
    try {
      var products = await fetchCatalog();
      state.products = products;
      computeNext(products);
      $('gh-count').textContent = products.length;
      renderProducts();
      renderConnection();
      setStatus($('gh-status'), '���������� � �������: ' + products.length, 'ok');
      toast('���������� � GitHub ?', 'ok');
    } catch (e) {
      renderConnection();
      setStatus($('gh-status'), '������: ' + ((e && e.message) || '��� �������'), 'err');
      toast('�� ������� ������������: ' + ((e && e.message) || '��� �������'), 'err');
    }
  }

  /* ---------- events + init ---------- */
  function wireEvents() {
    $('gh-save').addEventListener('click', connect);
    $('gh-clear').addEventListener('click', function () { clearToken(); renderConnection(); setStatus($('gh-status'), '����� ����� �� ����� ��������.', ''); });
    $('p-photo').addEventListener('change', function () { handlePhoto(this.files && this.files[0]); });
    $('nord-key').addEventListener('input', saveNordKey);
    $('studio-pro').addEventListener('click', processStudioPro);

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
    wireEvents();
    computeNext([]);
    renderProducts();
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.closest && t.closest('.product-tile .thumb')) {
        var ph = document.createElement('span');
        ph.className = 'ph';
        ph.setAttribute('aria-hidden', 'true');
        ph.textContent = '??';
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
        setStatus($('gh-status'), '������� �������� � �������: ' + products.length, 'ok');
      }).catch(function () {});
    }
  }

  window.retouchProduct = retouchProduct;

  init();
})();



