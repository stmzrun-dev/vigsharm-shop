// Fix admin.js - replace broken processStudioPro
const fs = require('fs');
const path = 'assets/admin.js';
let code = fs.readFileSync(path, 'utf8');

// Fix 1: callStudioApi - already done by previous edits (key variable)

// Fix 2: processStudioPro - replace entire function
const oldProcessStudioPro = `  /* ---------- studio pro ---------- */
  async function processStudioPro() {
    var sEl = $('studio-status');
    if (!state.webpBlob && !state.imageBlob) {
      var noPhoto = 'Сначала загрузите фото.';
      setStatus(sEl, noPhoto, 'err'); toast(noPhoto, 'err'); return;
    }
    if (!state.webpKey) {
      toast('Сначала опубликуйте товар!', 'err');
      return;
    }
    if (!state.nordKey) {
      toast('Введите NordRouter API Key в Настройках!', 'err');
      return;
    }
    try {
      var blob = await callStudioApi(imgSrc(state.webpKey), sEl);
      var resized = await resizeImage(blob, 2048);
      var webpBlob = await imageBlobToWebp(resized, 0.82);
      setStatus(sEl, '⏳ Сохранение результата...', 'info');
      var webpKey = 'api/images/products/' + state.webpKey + '.webp';
      await ghPutFile(webpKey, webpBlob, 'Studio Pro: ' + state.webpKey);
      state.webpBlob = webpBlob;
      state.webpKey = webpKey;
      var products = await fetchCatalog() || {};
      if (!products[state.webpKey]) {
        products[state.webpKey] = state.product || {};
        products[state.webpKey].slug = state.webpKey.split('/').pop().replace(/\\.webp$/, '');
        products[state.webpKey].title = state.product.title || 'Товар';
      }
      products[state.webpKey].webp = webpKey;
      await ghPutFile('api/products.json', JSON.stringify(products, null, 2), 'Update catalog');
      renderProducts();
      setStatus(sEl, '✅ Фото обработано и сохранено!', 'ok');
      toast('Studio Pro готово!', 'ok');
    } catch (e) {
      console.error('[StudioPro]', e);
      setStatus(sEl, '❌ ' + e.message, 'err');
      toast('Ошибка: ' + e.message, 'err');
    }
  }`;

const newProcessStudioPro = `  /* ---------- studio pro ---------- */
  async function processStudioPro() {
    var sEl = $('studio-status');
    if (!state.imageBlob && !state.webpBlob) {
      setStatus(sEl, 'Сначала загрузите фото.', 'err');
      toast('Сначала загрузите фото.', 'err');
      return;
    }
    if (!state.owner || !state.repo || !state.token) {
      setStatus(sEl, 'Сначала подключитесь к GitHub', 'err');
      toast('Сначала подключитесь к GitHub', 'err');
      return;
    }
    if (!nordKey()) {
      setStatus(sEl, 'Введите NordRouter API Key в Настройках!', 'err');
      toast('Введите NordRouter API Key в Настройках!', 'err');
      return;
    }
    var btn = $('studio-pro');
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Обработка…';
    try {
      var sourceKey = state.webpKey;
      var createdSource = false;
      if (!sourceKey) {
        setStatus(sEl, '⏳ Загружаем фото в репозиторий…', 'info');
        var webp = state.webpBlob || (await compressImage(state.imageBlob)).blob;
        var name = uuid() + '.webp';
        await ghPutFile(IMG_PATH + '/' + name, 'Фото для Studio Pro: ' + (val('p-title').trim() || name), await blobToB64(webp), null);
        sourceKey = 'products/' + name;
        state.webpBlob = webp;
        state.webpKey = sourceKey;
        createdSource = true;
      }
      var blob = await callStudioApi(publicImageUrl(sourceKey), sEl);
      setStatus(sEl, '⏳ Сохраняем результат...', 'info');
      var resized = await resizeImage(blob, 2048);
      var webp = await imageBlobToWebp(resized, 0.82);
      var name = uuid() + '.webp';
      var path = IMG_PATH + '/' + name;
      var key = 'products/' + name;
      await ghPutFile(path, 'Studio Pro: обработано фото для ' + sourceKey, await blobToB64(webp), null);
      if (createdSource) {
        await ghDeleteFile(IMG_PATH + '/' + sourceKey.replace(/^products\\//, ''), 'Studio Pro: удалён временный файл', null);
      }
      state.webpBlob = webp;
      state.webpKey = key;
      var url = URL.createObjectURL(webp);
      var img = $('p-preview-img');
      img.onload = function () { URL.revokeObjectURL(url); };
      img.src = url;
      $('p-preview-meta').innerHTML = '<span>WebP</span><span>' + formatSize(webp.size) + '</span>';
      setStatus(sEl, '✅ Фото обработано! Нажмите «Опубликовать товар».', 'ok');
      toast('Studio Pro готово ✓', 'ok');
    } catch (e) {
      console.error('[StudioPro]', e);
      setStatus(sEl, '❌ ' + e.message, 'err');
      toast('Ошибка: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }`;

code = code.replace(oldProcessStudioPro, newProcessStudioPro);

// Fix 3: ghDeleteFile signature (add sha parameter)
code = code.replace(
  'async function ghDeleteFile(path, message) {',
  'async function ghDeleteFile(path, message, sha) {'
);
code = code.replace(
  '  async function ghDeleteFile(path, message) {\n    var file = await ghGetFile(path);',
  '  async function ghDeleteFile(path, message, sha) {\n    var file = sha ? null : await ghGetFile(path);'
);

fs.writeFileSync(path, code, 'utf8');
console.log('✓ Fixed admin.js');
