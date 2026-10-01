// Ключ публикации: одно фото → кадры поста/сторис + подписи → ZIP
Object.assign(app, {
  publishSource: null,
  publishMasterUrl: null,
  publishPack: null,
  _jszipPromise: null,

  setupPublishKey() {
    if (this._publishKeyBound) return;
    this._publishKeyBound = true;
    const zone = document.getElementById('publish-dropzone');
    const input = document.getElementById('publish-file');
    if (!zone || !input) return;

    const pick = () => input.click();
    zone.addEventListener('click', pick);
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.loadPublishFile(file);
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this.loadPublishFile(file);
      input.value = '';
    });
  },

  async loadPublishFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      this.toast?.('Нужно изображение', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    if (this.publishSource?.url) URL.revokeObjectURL(this.publishSource.url);
    this.publishSource = { file, url, name: file.name };
    this.publishMasterUrl = null;
    this.publishPack = null;
    const zipBtn = document.getElementById('publish-zip-btn');
    const packBtn = document.getElementById('publish-build-btn');
    const signBtn = document.getElementById('publish-sign-btn');
    if (zipBtn) zipBtn.disabled = true;
    if (packBtn) packBtn.disabled = true;
    if (signBtn) signBtn.disabled = true;
    this.showPublishPreview(url, 'Исходник')?.catch?.(() => {});
    const status = document.getElementById('publish-status');
    if (status) status.textContent = file.name;
  },

  samePublishPhoto(a, b) {
    const norm = (u) => String(u || '').trim().split('?')[0];
    const left = norm(a);
    return !!(left && left === norm(b));
  },

  showPublishPreview(src, alt) {
    const preview = document.getElementById('publish-source-preview');
    if (!preview || !src) return Promise.resolve();
    const isMaster = alt === 'Master';
    const labelText = isMaster ? 'Master' : 'Исходник';
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.alt = labelText;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Новое фото не открылось'));
      img.src = src;
    }).then((img) => {
      preview.replaceChildren(img);
      preview.classList.remove('hidden');
      preview.hidden = false;
      const label = document.getElementById('publish-shot-label');
      if (label) {
        label.textContent = labelText;
        label.classList.toggle('is-master', isMaster);
        label.classList.remove('hidden');
        label.hidden = false;
      }
      this.setPublishSourceUi?.(true);
      preview.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  },

  getPublishScene() {
    return document.querySelector('input[name="publish-scene"]:checked')?.value || 'floor';
  },

  setPublishBusy(busy) {
    ['publish-master-btn', 'publish-sign-btn', 'publish-build-btn', 'publish-zip-btn'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'publish-master-btn') el.disabled = !!busy;
      if (id === 'publish-sign-btn') el.disabled = busy || !this.publishMasterUrl;
      if (id === 'publish-build-btn') el.disabled = busy || !this.publishMasterUrl;
      if (id === 'publish-zip-btn') el.disabled = busy || !this.publishPack;
    });
  },

  async createPublishMaster() {
    if (!this.publishSource?.file && !this.publishSource?.url) {
      this.toast?.('Сначала загрузите фото', 'error');
      return;
    }
    if (!this.workerUrl) {
      this.toast?.('Укажите Worker API URL в Настройках', 'error');
      return;
    }
    if (!this.adminApiKey) {
      this.toast?.('Укажите ключ админки в Настройках', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    const masterBtn = document.getElementById('publish-master-btn');
    this.setPublishBusy(true);
    if (masterBtn) masterBtn.innerHTML = '<span class="spinner"></span> Master…';
    try {
      let imageUrl = this.publishSource.httpsUrl;
      if (!imageUrl) {
        if (status) status.textContent = '☁️ Загрузка в Cloudinary…';
        const file = this.publishSource.file;
        if (!file) throw new Error('Нет файла для загрузки');
        const uploadResult = await this.uploadPhoto(file);
        if (!uploadResult?.ok) throw new Error(uploadResult?.error || 'Cloudinary: не загрузилось');
        imageUrl = uploadResult.url;
        this.publishSource.httpsUrl = imageUrl;
      }
      const scene = this.getPublishScene();
      if (status) status.textContent = '📸 ИИ переснимает в студии, как в карточке…';
      const masterUrl = String(await this.createMasterForScene(imageUrl, scene, status) || '').trim();
      if (!masterUrl) throw new Error('Модель не вернула фото');
      if (this.samePublishPhoto(masterUrl, imageUrl)) {
        throw new Error('Модель вернула то же фото — кадр не изменился');
      }
      await this.showPublishPreview(masterUrl, 'Master');
      this.publishMasterUrl = masterUrl;
      const sign = (document.getElementById('publish-sign-text')?.value || '').trim();
      if (sign) {
        if (status) status.textContent = '✏️ Правлю надпись…';
        const fixed = await this.fixBalloonInscription({
          masterUrl,
          exact: sign,
          statusEl: status,
          skipCommit: true
        });
        if (fixed && !this.samePublishPhoto(fixed, masterUrl)) {
          await this.showPublishPreview(fixed, 'Master');
          this.publishMasterUrl = fixed;
        }
      }
      if (status) status.textContent = 'Master готов. Можно исправить надпись или собрать пачку.';
      this.toast?.('Master готов', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось создать Master', 'error');
      if (status) status.textContent = e.message || 'Ошибка Master';
    } finally {
      if (masterBtn) masterBtn.textContent = 'Создать Master';
      this.setPublishBusy(false);
    }
  },

  async fixPublishInscription() {
    const sign = (document.getElementById('publish-sign-text')?.value || '').trim();
    if (!this.publishMasterUrl) {
      this.toast?.('Сначала создайте Master', 'error');
      return;
    }
    if (!sign) {
      this.toast?.('Впишите текст на шаре', 'error');
      document.getElementById('publish-sign-text')?.focus();
      return;
    }
    const status = document.getElementById('publish-status');
    this.setPublishBusy(true);
    try {
      const fixed = await this.fixBalloonInscription({
        masterUrl: this.publishMasterUrl,
        exact: sign,
        statusEl: status,
        skipCommit: true
      });
      if (fixed) {
        this.publishMasterUrl = fixed;
        this.publishPack = null;
        await this.showPublishPreview(fixed, 'Master');
      }
    } catch (e) {
      /* toast already in fixBalloonInscription */
    } finally {
      this.setPublishBusy(false);
    }
  },

  /** Не перетирает Studio Pro loadImage: CORS только для http(s). */
  loadPublishImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = src;
    });
  },

  async getPublishBackgroundImage() {
    const local = this.DEFAULT_REFERENCE_BG || '../assets/reference/reference-background.png';
    const src = this.getReferenceBackgroundUrl?.() || local;
    const tryLoad = async (url) => {
      try {
        return await this.loadPublishImage(url);
      } catch (e) {
        return null;
      }
    };
    let img = await tryLoad(src);
    if (img) return img;
    if (src !== local) img = await tryLoad(local);
    return img;
  },

  clampPublish(n, min, max) {
    return Math.min(max, Math.max(min, n));
  },

  /** Cover-crop в нужный размер. zoom > 1 — ближе; offsetY < 0 — выше. */
  drawCoverCrop(ctx, img, tw, th, zoom, offsetX, offsetY) {
    const z = Math.max(1, zoom || 1);
    const ir = img.width / img.height;
    const tr = tw / th;
    let sw;
    let sh;
    if (ir > tr) {
      sh = img.height / z;
      sw = sh * tr;
    } else {
      sw = img.width / z;
      sh = sw / tr;
    }
    let sx = (img.width - sw) / 2 + (offsetX || 0) * img.width;
    let sy = (img.height - sh) / 2 + (offsetY || 0) * img.height;
    sx = this.clampPublish(sx, 0, Math.max(0, img.width - sw));
    sy = this.clampPublish(sy, 0, Math.max(0, img.height - sh));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
  },

  drawContain(ctx, img, x, y, w, h) {
    const ir = img.width / img.height;
    const br = w / h;
    let dw = w;
    let dh = h;
    if (ir > br) dh = w / ir;
    else dw = h * ir;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  },

  /** Фрагмент фото целиком внутри кадра. alignTop — прижать вверх, низ остаётся пустым. */
  drawRegionContain(ctx, img, tw, th, region, alignTop, topFrac, maxHFrac, padXFrac) {
    const x0 = region?.x0 ?? 0;
    const y0 = region?.y0 ?? 0;
    const x1 = region?.x1 ?? 1;
    const y1 = region?.y1 ?? 1;
    const sx = img.width * x0;
    const sy = img.height * y0;
    const sw = Math.max(1, img.width * (x1 - x0));
    const sh = Math.max(1, img.height * (y1 - y0));
    const pad = tw * (padXFrac ?? 0.04);
    const maxW = tw - pad * 2;
    const maxH = th * (maxHFrac ?? 0.92);
    const ir = sw / sh;
    let dw = maxW;
    let dh = dw / ir;
    if (dh > maxH) {
      dh = maxH;
      dw = dh * ir;
    }
    const dx = (tw - dw) / 2;
    const dy = alignTop ? th * (topFrac ?? 0.04) : (th - dh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  },

  blurPublishBehind(ctx, srcImg, tw, th) {
    ctx.save();
    ctx.filter = 'blur(28px)';
    this.drawCoverCrop(ctx, srcImg, tw, th, 1.2, 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(232, 228, 220, 0.3)';
    ctx.fillRect(0, 0, tw, th);
  },

  renderPublishFrame(srcImg, bgImg, tw, th, spec) {
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ebe4da';
    ctx.fillRect(0, 0, tw, th);

    if (spec.cover) {
      const region = spec.region || { x0: 0, y0: 0, x1: 1, y1: 1 };
      const sx = srcImg.width * (region.x0 ?? 0);
      const sy = srcImg.height * (region.y0 ?? 0);
      const sw = Math.max(1, srcImg.width * ((region.x1 ?? 1) - (region.x0 ?? 0)));
      const sh = Math.max(1, srcImg.height * ((region.y1 ?? 1) - (region.y0 ?? 0)));
      const dh = th * (spec.maxH ?? 0.7);
      const dw = dh * (sw / sh);
      const dx = (tw - dw) / 2;
      const dy = th * (spec.top ?? 0);
      ctx.drawImage(srcImg, sx, sy, sw, sh, dx, dy, dw, dh);
    } else if (spec.contain || spec.story) {
      if (!spec.flat) this.blurPublishBehind(ctx, srcImg, tw, th);
      this.drawRegionContain(
        ctx, srcImg, tw, th, spec.region,
        !!(spec.story || spec.alignTop), spec.top, spec.maxH, spec.padX
      );
    } else if (spec.onBg && bgImg) {
      this.drawCoverCrop(ctx, bgImg, tw, th, 1, 0, 0);
      this.drawRegionContain(ctx, srcImg, tw, th, spec.region, false, spec.top, spec.maxH, spec.padX);
    } else {
      this.drawCoverCrop(ctx, srcImg, tw, th, spec.zoom, spec.ox, spec.oy);
    }

    return canvas.toDataURL('image/jpeg', 0.92);
  },

  dataUrlToBlob(dataUrl) {
    const [head, body] = dataUrl.split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  },

  buildPublishCaptions() {
    const title = (document.getElementById('publish-title')?.value || '').trim();
    const occasion = (document.getElementById('publish-occasion')?.value || '').trim();
    const priceRaw = (document.getElementById('publish-price')?.value || '').trim();
    const digits = priceRaw.replace(/[^\d]/g, '');
    const priceLine = digits ? digits + ' ₽' : '';
    const heading = title || 'Вигшарм · Армавир';
    const cta = 'Армавир и доставка рядом. Написать в директ или на сайте vigsharm.ru';

    const igBody = [heading, occasion, priceLine, '', cta, '', '#вигшарм #армавир #шарыармавир #аэродизайн #доставкашаров']
      .filter((line, i, arr) => line !== '' || (arr[i - 1] && arr[i - 1] !== ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');

    const tg = [heading, occasion, priceLine, 'Заявка в сообщении или на vigsharm.ru'].filter(Boolean).join('\n');

    const vk = [heading, occasion, priceLine, 'Пишите в сообщения сообщества или оставьте заявку на сайте.', '#Вигшарм #Армавир #Шары']
      .filter(Boolean)
      .join('\n');

    return '=== INSTAGRAM ===\n' + igBody + '\n\n=== TELEGRAM ===\n' + tg + '\n\n=== VK ===\n' + vk + '\n';
  },

  renderPublishThumbs(pack) {
    const posts = document.getElementById('publish-posts');
    const stories = document.getElementById('publish-stories');
    if (posts) {
      posts.innerHTML = pack.posts.map((item) => (
        '<figure><img alt="' + item.label + '" src="' + item.dataUrl + '"/><figcaption>' + item.label + '</figcaption></figure>'
      )).join('');
    }
    if (stories) {
      stories.innerHTML = pack.stories.map((item) => (
        '<figure><img alt="' + item.label + '" src="' + item.dataUrl + '"/><figcaption>' + item.label + '</figcaption></figure>'
      )).join('');
    }
    const ta = document.getElementById('publish-captions');
    if (ta) ta.value = pack.captions;
  },

  async buildPublishPack() {
    if (!this.publishMasterUrl) {
      this.toast?.('Сначала создайте Master', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    this.setPublishBusy(true);
    if (status) status.textContent = 'Собираем кадры из Master…';
    try {
      const srcImg = await this.loadPublishImage(this.publishMasterUrl);
      const posts = [
        { file: 'post-01-full.jpg', label: 'Пост · весь кадр', contain: true, flat: true, maxH: 1, padX: 0 },
        { file: 'post-02-top.jpg', label: 'Пост · верх', contain: true, flat: true, alignTop: true, top: 0, region: { x0: 0, y0: 0, x1: 1, y1: 0.62 }, maxH: 0.74, padX: 0 },
        { file: 'post-03-bottom.jpg', label: 'Пост · низ', contain: true, flat: true, region: { x0: 0, y0: 0.4, x1: 1, y1: 1 }, maxH: 0.8, padX: 0 }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, null, 1080, 1350, spec)
      }));
      const stories = [
        { file: 'story-01-full.jpg', label: 'Сторис · сцена', story: true, flat: true, top: 0, maxH: 0.58, padX: 0 },
        { file: 'story-02-top.jpg', label: 'Сторис · верх', story: true, flat: true, region: { x0: 0, y0: 0, x1: 1, y1: 0.62 }, top: 0, maxH: 0.4, padX: 0 },
        { file: 'story-03-close.jpg', label: 'Сторис · крупно', story: true, flat: true, cover: true, top: 0, maxH: 0.7, padX: 0 }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, null, 1080, 1920, spec)
      }));
      const captions = this.buildPublishCaptions();
      this.publishPack = { posts, stories, captions };
      this.renderPublishThumbs(this.publishPack);
      if (status) status.textContent = 'Готово: 3 поста и 3 сторис с Master. Можно скачать ZIP.';
      this.toast?.('Пачка собрана', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось собрать пачку', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      this.setPublishBusy(false);
    }
  },

  loadJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (this._jszipPromise) return this._jszipPromise;
    this._jszipPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error('Не загрузился JSZip'));
      document.head.appendChild(s);
    });
    return this._jszipPromise;
  },

  async downloadPublishZip() {
    if (!this.publishPack) {
      this.toast?.('Сначала соберите пачку', 'error');
      return;
    }
    const ta = document.getElementById('publish-captions');
    if (ta) this.publishPack.captions = ta.value;
    try {
      const JSZip = await this.loadJsZip();
      const zip = new JSZip();
      const folder = zip.folder('vigsharm-key');
      for (const item of this.publishPack.posts) {
        folder.file(item.file, this.dataUrlToBlob(item.dataUrl));
      }
      for (const item of this.publishPack.stories) {
        folder.file(item.file, this.dataUrlToBlob(item.dataUrl));
      }
      folder.file('captions.txt', this.publishPack.captions);
      folder.file('kak-vylozhit.txt',
        'Пост: post-01 вся связка без обрезки, post-02 верх, post-03 низ (4:5).\n' +
        'Сторис: story-01 вся связка сверху, story-02 крупнее, story-03 верх (9:16). Низ пустой — для текста.\n' +
        'Instagram / Telegram / VK: вставьте текст из captions.txt.\n' +
        'Музыку к сторис добавьте в приложении сети — через сайт её подставить нельзя.\n' +
        'Чужой логотип на исходном фото пачка не убирает — нужен кадр без чужого бренда.\n'
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'vigsharm-publish-key.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      this.toast?.(e.message || 'ZIP не собрался', 'error');
    }
  }
});

window.app = app;
app._publishSamePhotoCheck = true;
app._publishFrameSet = 3;
if (document.getElementById('publish-dropzone')) {
  app.setupPublishKey();
}
