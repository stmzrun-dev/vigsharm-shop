// Ключ публикации: одно фото → кадры поста/сторис + подписи → ZIP
Object.assign(app, {
  publishSource: null,
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
    this.publishPack = null;
    const zipBtn = document.getElementById('publish-zip-btn');
    if (zipBtn) zipBtn.disabled = true;
    const preview = document.getElementById('publish-source-preview');
    if (preview) {
      preview.innerHTML = '<img alt="Исходник" src="' + url + '"/>';
      preview.classList.remove('hidden');
      preview.hidden = false;
    }
    const status = document.getElementById('publish-status');
    if (status) status.textContent = file.name;
  },

  async loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = src;
    });
  },

  async getPublishBackgroundImage() {
    const src = this.getReferenceBackgroundUrl?.() || this.DEFAULT_REFERENCE_BG || '../assets/reference/reference-background.png';
    try {
      return await this.loadImage(src);
    } catch (e) {
      return null;
    }
  },

  clamp(n, min, max) {
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
    sx = this.clamp(sx, 0, Math.max(0, img.width - sw));
    sy = this.clamp(sy, 0, Math.max(0, img.height - sh));
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

  renderPublishFrame(srcImg, bgImg, tw, th, spec) {
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(0, 0, tw, th);

    if (spec.onBg && bgImg) {
      this.drawCoverCrop(ctx, bgImg, tw, th, 1, 0, 0);
      const top = spec.story ? th * 0.08 : th * 0.06;
      const height = spec.story ? th * 0.62 : th * 0.88;
      const padX = tw * 0.06;
      this.drawContain(ctx, srcImg, padX, top, tw - padX * 2, height);
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
    const title = (document.getElementById('publish-title')?.value || '').trim() || 'Композиция из шаров';
    const occasion = (document.getElementById('publish-occasion')?.value || '').trim();
    const priceRaw = (document.getElementById('publish-price')?.value || '').trim();
    const price = priceRaw ? (priceRaw.replace(/[^\d]/g, '') + ' ₽') : '';
    const occasionLine = occasion ? 'Повод: ' + occasion + '.' : 'Соберём под ваш повод.';
    const priceLine = price ? 'Ориентир: ' + price + '.' : '';
    const cta = 'Армавир и доставка рядом. Написать в директ или на сайте vigsharm.ru';

    const ig = [
      title,
      '',
      occasionLine,
      priceLine,
      cta,
      '',
      '#вигшарм #армавир #шарыармавир #аэродизайн #доставкашаров'
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n').replace(/\n{3,}/g, '\n\n');

    const tg = [title, occasionLine, priceLine, 'Заявка в сообщении или на vigsharm.ru'].filter(Boolean).join('\n');

    const vk = [
      title,
      occasionLine,
      priceLine,
      'Пишите в сообщения сообщества или оставьте заявку на сайте.',
      '#Вигшарм #Армавир #Шары'
    ].filter(Boolean).join('\n');

    return '=== INSTAGRAM ===\n' + ig + '\n\n=== TELEGRAM ===\n' + tg + '\n\n=== VK ===\n' + vk + '\n';
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
    if (!this.publishSource?.url) {
      this.toast?.('Сначала загрузите фото', 'error');
      return;
    }
    const btn = document.getElementById('publish-build-btn');
    const status = document.getElementById('publish-status');
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Собираем кадры…';
    try {
      const srcImg = await this.loadImage(this.publishSource.url);
      const onBg = !!document.getElementById('publish-on-bg')?.checked;
      const bgImg = onBg ? await this.getPublishBackgroundImage() : null;
      const posts = [
        { file: 'post-01-full.jpg', label: 'Пост · весь кадр', zoom: 1.02, ox: 0, oy: -0.02, onBg, story: false },
        { file: 'post-02-close.jpg', label: 'Пост · ближе', zoom: 1.18, ox: 0, oy: -0.04, onBg, story: false },
        { file: 'post-03-shift.jpg', label: 'Пост · смещение', zoom: 1.1, ox: 0.04, oy: 0.02, onBg, story: false }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, bgImg, 1080, 1350, spec)
      }));
      const stories = [
        { file: 'story-01-full.jpg', label: 'Сторис · сцена', zoom: 1.04, ox: 0, oy: -0.08, onBg, story: true },
        { file: 'story-02-upper.jpg', label: 'Сторис · выше', zoom: 1.12, ox: 0, oy: -0.14, onBg, story: true },
        { file: 'story-03-close.jpg', label: 'Сторис · крупно', zoom: 1.28, ox: 0, oy: -0.1, onBg, story: true }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, bgImg, 1080, 1920, spec)
      }));
      const captions = this.buildPublishCaptions();
      this.publishPack = { posts, stories, captions };
      this.renderPublishThumbs(this.publishPack);
      const zipBtn = document.getElementById('publish-zip-btn');
      if (zipBtn) zipBtn.disabled = false;
      if (status) status.textContent = 'Готово: 3 поста и 3 сторис. Можно скачать ZIP.';
      this.toast?.('Пачка собрана', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось собрать пачку', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      if (btn) btn.disabled = false;
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
        'Пост: файлы post-01…03 (4:5).\n' +
        'Сторис: story-01…03 (9:16). Композицию держите в верхней части кадра.\n' +
        'Instagram / Telegram / VK: вставьте текст из captions.txt.\n' +
        'Музыку к сторис добавьте в приложении сети — через сайт её подставить нельзя.\n'
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

if (document.getElementById('publish-dropzone')) {
  app.setupPublishKey();
}
