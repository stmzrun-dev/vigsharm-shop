// VigSharm Admin - Extended Functions
// Добавляем дополнительные методы в app

Object.assign(app, {
  // === Photo Upload ===
  setupPhotoUpload() {
    const dropzone = document.getElementById('photo-dropzone');
    const input = document.getElementById('photo-input');
    if (!dropzone || !input || input.dataset.wired === '1') return;
    input.dataset.wired = '1';
    const zone = dropzone.querySelector('.upload-zone') || dropzone;

    zone.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.photo-item') || e.target === input) return;
      input.click();
    });
    zone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      input.click();
    });
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.length) this.handlePhotoFiles(files);
    });

    ['dragenter','dragover'].forEach(ev => {
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); });
    });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('drag'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
      const dt = e.dataTransfer;
      const dropped = dt?.files?.length
        ? Array.from(dt.files)
        : Array.from(dt?.items || []).map((item) => item.kind === 'file' ? item.getAsFile() : null).filter(Boolean);
      if (dropped.length) this.handlePhotoFiles(dropped);
    });
  },

  /** JPG/PNG/WebP даже без расширения и без типа от Windows (image_10). */
  async fileLooksLikeImage(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('image/')) return true;
    const name = String(file.name || '').toLowerCase();
    if (/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/.test(name)) return true;
    try {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (head.length < 3) return false;
      if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return true;
      if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return true;
      if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return true;
      if (head[0] === 0x42 && head[1] === 0x4D) return true;
      const ascii = (from, to) => String.fromCharCode(...head.slice(from, to));
      if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return true;
      if (head.length >= 8 && ascii(4, 8) === 'ftyp') return true;
    } catch { /* не картинка */ }
    return false;
  },

  photoFileSig(file) {
    if (!file) return '';
    return [file.name, file.size, file.lastModified].join(':');
  },

  /** Поле не очищаем, пока картинка не прочитана: иначе Chrome отдаёт пустой файл без ошибки. */
  startPhotoRead(file, onLoad) {
    const gen = this._photoReadGen || 0;
    const reader = new FileReader();
    this._photoReaders = this._photoReaders || [];
    this._photoReaders.push(reader);
    reader.onload = () => {
      this._photoReaders = (this._photoReaders || []).filter((r) => r !== reader);
      if (gen !== this._photoReadGen) return;
      const url = String(reader.result || '');
      if (!url.startsWith('data:')) {
        this.toast('Не удалось прочитать фото', 'error');
        return;
      }
      onLoad(url, file);
    };
    reader.onerror = () => {
      this._photoReaders = (this._photoReaders || []).filter((r) => r !== reader);
      if (gen !== this._photoReadGen) return;
      this.toast('Не удалось прочитать фото', 'error');
    };
    reader.readAsDataURL(file);
  },

  cancelPhotoReads() {
    this._photoReadGen = (this._photoReadGen || 0) + 1;
    (this._photoReaders || []).forEach((reader) => {
      try { reader.abort(); } catch (_) { /* уже дочитан */ }
    });
    this._photoReaders = [];
    const input = document.getElementById('photo-input');
    if (input) input.value = '';
  },

  ensurePhotoList() {
    if (!this.currentProduct) {
      this.currentProduct = { photos: [], scene: 'auto', tags: [], client_options: {} };
    }
    if (!Array.isArray(this.currentProduct.photos)) this.currentProduct.photos = [];
  },

  handlePhotoFiles(files) {
    if (!files || files.length === 0) return;
    this.ensurePhotoList();
    const maxPhotos = 6;
    const list = Array.from(files);

    const acceptPhoto = (file) => {
      if (!file) return null;
      if (file.size > 10 * 1024 * 1024) {
        this.toast('Файл слишком большой (макс. 10 МБ)', 'error');
        return null;
      }
      const type = String(file.type || '').toLowerCase();
      const name = String(file.name || '').toLowerCase();
      const namedImage = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/.test(name);
      if (type && !type.startsWith('image/') && !namedImage) {
        this.toast('Это не фото. Нужен JPG, PNG или WebP', 'error');
        return null;
      }
      return file;
    };

    if (this._replaceMainPhotoOnce) {
      this._replaceMainPhotoOnce = false;
      const file = acceptPhoto(list[0]);
      if (!file) return;
      this.startPhotoRead(file, (url, stableFile) => {
        const next = {
          id: Date.now() + Math.random(),
          url,
          file: stableFile,
          uploaded: false
        };
        if (!this.currentProduct.photos.length) this.currentProduct.photos = [next];
        else this.currentProduct.photos[0] = next;
        this.studioMasterDataUrl = null;
        this.studioMasterBackupUrl = null;
        this.studioMasterBaseUrl = null;
        this.studioCompare = { original: null, master: null };
        this.studioSourceUrl = null;
        this.renderStudioCompare?.();
        this.renderPhotos();
        this.goStep1Phase?.('a', { skipGate: true });
        this.toast('Главное фото заменено — выберите сцену и нажмите «Далее»', 'success');
      });
      return;
    }

    const remainingSlots = maxPhotos - this.currentProduct.photos.length;
    if (remainingSlots === 0) { this.toast('Максимум 6 фото', 'error'); return; }

    const seen = new Set(
      (this.currentProduct.photos || []).map((p) => this.photoFileSig(p.file)).filter(Boolean)
    );
    for (const raw of list.slice(0, remainingSlots)) {
      const file = acceptPhoto(raw);
      if (!file) continue;
      const sig = this.photoFileSig(file);
      if (sig && seen.has(sig)) continue;
      if (sig) seen.add(sig);
      this.startPhotoRead(file, (url, stableFile) => {
        if ((this.currentProduct.photos || []).some((p) => this.photoFileSig(p.file) === sig && sig)) return;
        if ((this.currentProduct.photos || []).length >= maxPhotos) return;
        this.currentProduct.photos.push({
          id: Date.now() + Math.random(),
          url,
          file: stableFile,
          uploaded: false
        });
        this.renderPhotos();
      });
    }
  },

  renderPhotos() {
    const container = document.getElementById('photos-grid');
    const emptyZone = document.getElementById('upload-zone-empty');
    if (!container) return;

    if (this.currentProduct.photos.length === 0) {
      container.innerHTML = '';
      if (emptyZone) emptyZone.classList.remove('hidden');
      this._step1PhotoCount = 0;
      this._photoDupSig = '';
      this.clearPhotoDuplicateNote?.();
      this.syncAIFillGate?.();
      this.refreshSourceWorkPreview?.();
      this.syncStep1WizardUi?.();
      if (
        this._step1Phase === 'c'
        && !document.getElementById('product-form')?.classList.contains('is-editor-step-2')
        && !this.currentProduct?.id
      ) {
        this.goStep1Phase?.('a', { skipGate: true });
      }
      return;
    }

    if (emptyZone) emptyZone.classList.add('hidden');

    container.innerHTML = this.currentProduct.photos.map((photo, index) => `
      <div class="photo-item ${index === 0 ? 'main' : ''}">
        <img src="${photo.url}" alt="Фото ${index + 1}" class="zoomable" data-photo-index="${index}"/>
        ${index === 0 ? '<span class="badge-main">Главное</span>' : `<span class="badge-main">Фото ${index + 1}</span>`}
        <div class="actions">
          ${index > 0 ? `<button type="button" data-move="-1" data-idx="${index}" title="Влево">←</button>` : ''}
          ${index < this.currentProduct.photos.length - 1 ? `<button type="button" data-move="1" data-idx="${index}" title="Вправо">→</button>` : ''}
          <button type="button" data-main="${index}" title="Сделать главным">★</button>
          <button type="button" class="delete" data-remove="${index}" title="Удалить">✕</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('img.zoomable').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = Number(img.dataset.photoIndex);
        const url = this.currentProduct.photos[i]?.url;
        if (url) this.openLightbox(url);
      });
    });
    container.querySelectorAll('[data-main]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setMainPhoto(Number(btn.dataset.main));
      });
    });
    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removePhoto(Number(btn.dataset.remove));
      });
    });
    container.querySelectorAll('[data-move]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.movePhoto(Number(btn.dataset.idx), Number(btn.dataset.move));
      });
    });
    this.syncAIFillGate?.();
    this.refreshSourceWorkPreview?.();
    this.syncStep1WizardUi?.();
    this.schedulePhotoDuplicateCheck?.();
    const count = this.currentProduct.photos.length;
    this._step1PhotoCount = count;
    // Сцены появляются на том же экране — проскроллим к ним
    if (
      count > 0
      && (this._step1Phase || 'a') === 'a'
      && !document.getElementById('product-form')?.classList.contains('is-editor-step-2')
      && !this.currentProduct?.id
    ) {
      setTimeout(() => {
        document.getElementById('step1-after-photo')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    }
  },

  clearPhotoDuplicateNote() {
    const note = document.getElementById('photo-duplicate-note');
    if (!note) return;
    note.hidden = true;
    note.textContent = '';
    note.classList.remove('is-busy');
  },

  schedulePhotoDuplicateCheck() {
    const file = this.currentProduct?.photos?.[0]?.file;
    if (!file) {
      this._pendingPhotoDhash = '';
      this.clearPhotoDuplicateNote();
      return;
    }
    const sig = [file.name, file.size, file.lastModified].join(':');
    if (this._photoDupSig === sig && this._pendingPhotoDhash) {
      this.showPhotoDuplicateMatches(this._pendingPhotoDhash);
      return;
    }
    this._photoDupSig = sig;
    const gen = (this._photoDupGen || 0) + 1;
    this._photoDupGen = gen;
    this.runPhotoDuplicateCheck(file, gen);
  },

  photoClientOptions(product) {
    let opts = product?.client_options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { opts = {}; }
    }
    return opts || {};
  },

  async photoDhashFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('image'));
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 9;
      canvas.height = 8;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 9, 8);
      const data = ctx.getImageData(0, 0, 9, 8).data;
      let hex = '';
      let nibble = 0;
      let bits = 0;
      const pushBit = (bit) => {
        nibble = (nibble << 1) | (bit ? 1 : 0);
        bits += 1;
        if (bits === 4) {
          hex += nibble.toString(16);
          nibble = 0;
          bits = 0;
        }
      };
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const i = (y * 9 + x) * 4;
          const j = i + 4;
          const left = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const right = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
          pushBit(left > right);
        }
      }
      return hex;
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  photoDhashDistance(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    let n = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) {
        n += x & 1;
        x >>= 1;
      }
    }
    return n;
  },

  loadPhotoDhashCache() {
    if (this._photoDhashCache) return this._photoDhashCache;
    try {
      this._photoDhashCache = JSON.parse(localStorage.getItem('vig-photo-dhash-v1') || '{}') || {};
    } catch {
      this._photoDhashCache = {};
    }
    return this._photoDhashCache;
  },

  savePhotoDhashCache() {
    try {
      localStorage.setItem('vig-photo-dhash-v1', JSON.stringify(this._photoDhashCache || {}));
    } catch { /* кэш необязателен */ }
  },

  async catalogPhotoDhash(url) {
    const cache = this.loadPhotoDhashCache();
    if (cache[url]) return cache[url];
    const proxyRes = await fetch(`${this.workerUrl}/api/admin/proxy-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ url })
    });
    if (!proxyRes.ok) throw new Error('proxy ' + proxyRes.status);
    const hash = await this.photoDhashFromBlob(await proxyRes.blob());
    cache[url] = hash;
    return hash;
  },

  validPhotoDhash(value) {
    return /^[0-9a-f]{16}$/.test(String(value || '').toLowerCase()) ? String(value).toLowerCase() : '';
  },

  /** Совпадение только по кодам, которые уже есть у карточек. Без скачивания каталога. */
  showPhotoDuplicateMatches(mine) {
    const hash = this.validPhotoDhash(mine);
    if (!hash) {
      this.clearPhotoDuplicateNote();
      return;
    }
    const note = document.getElementById('photo-duplicate-note');
    if (!note) return;
    const currentId = this.currentProduct?.id;
    const matches = (this.products || []).filter((p) => {
      if (currentId && String(p.id) === String(currentId)) return false;
      if (p.status && p.status !== 'published') return false;
      if (p.show_on_site === false) return false;
      const stored = this.validPhotoDhash(this.photoClientOptions(p).photo_dhash);
      return stored && this.photoDhashDistance(hash, stored) <= 8;
    });
    if (!matches.length) {
      this.clearPhotoDuplicateNote();
      return;
    }
    const label = (p) => {
      const title = String(p.title || 'Карточка').trim();
      const article = String(p.article || '').trim();
      return article ? `${title}, ${article}` : title;
    };
    const shown = matches.slice(0, 2).map(label).join(' · ');
    const extra = matches.length > 2 ? ` и ещё ${matches.length - 2}` : '';
    note.hidden = false;
    note.classList.remove('is-busy');
    note.textContent = `Это фото уже есть: ${shown}${extra}`;
  },

  async runPhotoDuplicateCheck(file, gen) {
    let mine = '';
    try {
      mine = await this.photoDhashFromBlob(file);
    } catch {
      if (this._photoDupGen === gen) this.clearPhotoDuplicateNote();
      return;
    }
    if (this._photoDupGen !== gen) return;
    this._pendingPhotoDhash = mine;
    const opts = this.photoClientOptions(this.currentProduct);
    if (this.currentProduct) {
      this.currentProduct.client_options = { ...opts, photo_dhash: mine };
    }
    this.showPhotoDuplicateMatches(mine);
  },

  hydratePhotoDhashesFromCache() {
    const cache = this.loadPhotoDhashCache();
    let dirty = false;
    for (const product of this.products || []) {
      const opts = this.photoClientOptions(product);
      const url = opts.studio_original_url;
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
      const stored = this.validPhotoDhash(opts.photo_dhash);
      if (stored) {
        if (cache[url] !== stored) {
          cache[url] = stored;
          dirty = true;
        }
        continue;
      }
      const cached = this.validPhotoDhash(cache[url]);
      if (!cached) continue;
      product.client_options = { ...opts, photo_dhash: cached };
    }
    if (dirty) this.savePhotoDhashCache();
  },

  startPhotoDhashBackfill() {
    const gen = (this._dhashBackfillGen || 0) + 1;
    this._dhashBackfillGen = gen;
    this.runPhotoDhashBackfill(gen);
  },

  /** Старые карточки без кода: один тихий проход, не в момент загрузки нового фото. */
  async runPhotoDhashBackfill(gen) {
    if (!this.workerUrl || !this.adminApiKey) return;
    const pending = (this.products || []).filter((p) => {
      if (p.status && p.status !== 'published') return false;
      if (p.show_on_site === false) return false;
      const opts = this.photoClientOptions(p);
      if (this.validPhotoDhash(opts.photo_dhash)) return false;
      return typeof opts.studio_original_url === 'string' && /^https?:\/\//i.test(opts.studio_original_url);
    });
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        if (this._dhashBackfillGen !== gen) return;
        const product = pending[cursor];
        cursor += 1;
        const url = this.photoClientOptions(product).studio_original_url;
        try {
          const hash = this.validPhotoDhash(await this.catalogPhotoDhash(url));
          if (this._dhashBackfillGen !== gen) return;
          if (!hash) continue;
          const opts = this.photoClientOptions(product);
          product.client_options = { ...opts, photo_dhash: hash };
          await this.persistPhotoDhash(product.id, hash);
          if (this._pendingPhotoDhash) this.showPhotoDuplicateMatches(this._pendingPhotoDhash);
        } catch { /* это фото пропустим */ }
        if (cursor % 8 === 0) this.savePhotoDhashCache();
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, pending.length) }, () => worker()));
    if (this._dhashBackfillGen === gen) this.savePhotoDhashCache();
  },

  async persistPhotoDhash(id, hash) {
    if (!id || !this.workerUrl || !this.adminApiKey) return;
    try {
      await fetch(`${this.workerUrl}/api/products/${encodeURIComponent(id)}/photo-dhash`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ photo_dhash: hash })
      });
    } catch { /* код уже в браузере, повтор при следующем открытии */ }
  },

  async ensureCurrentPhotoDhash() {
    const file = this.currentProduct?.photos?.find((p) => p?.file)?.file;
    if (!file) return;
    try {
      const hash = this.validPhotoDhash(await this.photoDhashFromBlob(file));
      if (!hash) return;
      this._pendingPhotoDhash = hash;
      const opts = this.photoClientOptions(this.currentProduct);
      this.currentProduct.client_options = { ...opts, photo_dhash: hash };
    } catch { /* без кода карточка всё равно сохранится */ }
  },

  movePhoto(index, dir) {
    const next = index + dir;
    if (next < 0 || next >= this.currentProduct.photos.length) return;
    const arr = this.currentProduct.photos;
    [arr[index], arr[next]] = [arr[next], arr[index]];
    this.renderPhotos();
  },

  openLightbox(src) {
    if (!src) return;
    const box = document.getElementById('photo-lightbox');
    const img = document.getElementById('lightbox-img');
    if (!box || !img) return;
    img.src = src;
    box.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  openLightboxFromCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    this.openLightbox(canvas.toDataURL('image/webp', 0.95));
  },

  closeLightbox(event) {
    if (event && event.target && event.target.id === 'lightbox-img') return;
    const box = document.getElementById('photo-lightbox');
    if (box) box.classList.add('hidden');
    document.body.style.overflow = '';
  },

  syncEditorTitle(value) {
    const el = document.getElementById('editor-title');
    if (el) el.textContent = (value && value.trim()) || 'Новый товар';
  },

  cancelProductEdit() {
    this.parkEditorDraft?.();
    this.resetForm({ preserveStudioDraft: true });
    this.switchTab('products');
    this.updateParkedDraftBanner?.();
    this.toast('Отложено локально. «Продолжить» в баннере или «+ Добавить» → Отмена для новой', 'info');
  },

  setMainPhoto(index) {
    if (index !== 0) {
      const [photo] = this.currentProduct.photos.splice(index, 1);
      this.currentProduct.photos.unshift(photo);
      // Новое главное без type=master — исходник для следующего Master
      if (photo && photo.type !== 'master') {
        this.studioSourceUrl = photo.url?.startsWith('http') ? photo.url : this.studioSourceUrl;
        if (this.studioCompare) this.studioCompare.original = this.studioSourceUrl || this.studioCompare.original;
      }
      this.renderPhotos();
      this.refreshStudioCheckpointUi?.();
      this.toast('Главное фото изменено', 'success');
    }
  },

  removePhoto(index) {
    const photos = this.currentProduct?.photos;
    if (!Array.isArray(photos) || index < 0 || index >= photos.length) return;
    this.cancelPhotoReads?.();
    photos.splice(index, 1);
    if (!photos.length) {
      this.studioMasterDataUrl = null;
      this.studioMasterBackupUrl = null;
      this.studioMasterBaseUrl = null;
      this.studioSourceUrl = null;
      this.studioCompare = { original: null, master: null };
      this._pendingPhotoDhash = '';
      this._photoDupSig = '';
      this.renderStudioCompare?.();
    }
    this.renderPhotos();
    this.toast('Фото удалено', 'success');
  },

  /** Заменить главное фото (после Master / на шаге состава). */
  replaceMainPhoto() {
    if (document.getElementById('product-form')?.classList.contains('is-studio-busy')) {
      this.toast('Дождитесь окончания Master', 'info');
      return;
    }
    this._replaceMainPhotoOnce = true;
    this.invalidateAiAutoFill?.({ clearFilled: true });
    const input = document.getElementById('photo-input');
    if (input) {
      input.value = '';
      input.click();
    }
  },

  // === Scene Selector ===
  setupSceneSelector() {
    const container = document.getElementById('scene-selector');
    if (!container) return;

    const current = this.currentProduct?.scene || 'auto';
    const escAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    container.innerHTML = `
      <div class="scene-rail scene-rail-stack" role="radiogroup" aria-label="Сцена для фото">
        ${SCENES.map((s) => `
          <button type="button" class="scene-rail-btn${s.value === current ? ' is-active' : ''}"
            data-scene="${s.value}"
            title="${escAttr((s.icon ? s.icon + ' ' : '') + s.title + ' — ' + s.desc)}"
            aria-pressed="${s.value === current ? 'true' : 'false'}">
            <span class="scene-rail-icon" aria-hidden="true">${escAttr(s.icon || '•')}</span>
            <span class="scene-rail-short">${escAttr(s.short || s.title)}</span>
          </button>
        `).join('')}
      </div>
      <select id="scene-select" class="scene-select-mirror" aria-hidden="true" tabindex="-1">
        ${SCENES.map((s) => `<option value="${s.value}" ${s.value === current ? 'selected' : ''}>${s.title}</option>`).join('')}
      </select>
    `;

    if (!container.dataset.railWired) {
      container.dataset.railWired = '1';
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.scene-rail-btn');
        if (!btn || btn.disabled) return;
        this.setScene?.(btn.dataset.scene);
      });
    }

    const select = container.querySelector('#scene-select');
    if (select && !select.dataset.wired) {
      select.dataset.wired = '1';
      select.addEventListener('change', () => this.setScene?.(select.value));
    }

    this.syncSceneRailUi?.(current);
    this.syncUnitBalloonForm?.(false);
    this.wirePhotozoneTypeControls?.();
    this.wireFloorTypeControls?.();
    this.wireBouquetTypeControls?.();
    this.wireSurprisePoseControls?.();
    this.wireUnitBalloonTypeControls?.();
    this.wireOccasionShelfControls?.();
    this.syncAdvanceOrderFromScene?.();
    this.syncOccasionShelfFields?.();
  },

  /** Подтип остаётся только у выбранной сцены. Чужие чипы снимаются. */
  clearOtherSceneSubtypes(scene) {
    if (scene !== 'unit_balloon') {
      this.setUnitBalloonType?.('');
      this.setUnitBalloonWho?.('');
      this.setLetterInk?.('');
      this.setUnitHoliday?.('');
      const sizeEl = document.getElementById('unit-balloon-size');
      if (sizeEl) sizeEl.value = '';
    }
    if (scene !== 'floor') this.setFloorType?.('');
    if (scene !== 'handheld_bouquet') this.setBouquetType?.('');
    if (scene !== 'surprise') {
      this.setSurprisePose?.('stand');
      this.setSurpriseMoney?.(false);
    }
    if (scene !== 'photozone') this.setPhotozoneType?.('frame');
  },

  setScene(value) {
    const scene = value || 'auto';
    if (!this.currentProduct) this.currentProduct = { photos: [], scene: 'auto', tags: [], client_options: {} };
    const prev = this.currentProduct.scene || 'auto';
    if (scene !== 'unit_balloon') this.releaseUnitSceneLock?.();
    if (prev !== scene) this.clearOtherSceneSubtypes?.(scene);
    this.currentProduct.scene = scene;
    const select = document.getElementById('scene-select');
    if (select && select.value !== scene) select.value = scene;
    this.syncUnitBalloonForm?.(true);
    const sceneNow = this.currentProduct?.scene || scene;
    this.syncSceneRailUi?.(sceneNow);
    this.syncStudioModeHint?.();
    this.syncAdvanceOrderFromScene?.();
    this.scheduleSaveActiveStudioDraft?.();
    this.syncStep1WizardUi?.();
  },

  syncSceneRailUi(sceneValue) {
    const scene = sceneValue || this.currentProduct?.scene || document.getElementById('scene-select')?.value || 'auto';
    document.querySelectorAll('.scene-rail-btn').forEach((btn) => {
      const on = btn.dataset.scene === scene;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const meta = (typeof SCENES !== 'undefined' ? SCENES : []).find((s) => s.value === scene);
    const label = document.getElementById('scene-active-label');
    if (label) {
      label.textContent = meta
        ? `${meta.icon ? meta.icon + ' ' : ''}${meta.title}`
        : '';
    }
  },

  /** В составе: «коробка», «… с надписью», «с индивидуальной надписью» и т.п. */
  compositionHasPersonalInscription(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    return /надпис|индивидуальн|коробк/.test(t);
  },

  normalizeHolidayKey(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[.\u00a0]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  matchHolidayCategory(raw) {
    const key = this.normalizeHolidayKey(raw);
    if (!key) return null;
    const list = (typeof THEME_CATEGORIES !== 'undefined' && THEME_CATEGORIES.length)
      ? THEME_CATEGORIES
      : (typeof HOLIDAY_CATEGORIES !== 'undefined' && HOLIDAY_CATEGORIES.length)
        ? HOLIDAY_CATEGORIES
        : ['Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'];
    const aliases = {
      '1 сентября': '1 сентября',
      '1сентября': '1 сентября',
      '1 сент': '1 сентября',
      'первое сентября': '1 сентября',
      'новый год': 'Новый год',
      'новогод': 'Новый год',
      'нг': 'Новый год',
      '14 февраля': '14 февраля',
      '14февраля': '14 февраля',
      'валентин': '14 февраля',
      '23 февраля': '23 февраля',
      '23февраля': '23 февраля',
      '8 марта': '8 марта',
      '8марта': '8 марта',
      'выпускной': 'Выпускной',
      'для нее': 'Для неё',
      'для него': 'Для него',
      'для девочки': 'Для девочки',
      'для мальчика': 'Для мальчика',
      'универсальные': 'Универсальные',
      'универсальн': 'Универсальные',
      'для мамы': 'Для мамы',
      'на выписку': 'На выписку',
      'выписка': 'На выписку',
      'выписку': 'На выписку',
      'из роддома': 'На выписку',
      'роддом': 'На выписку'
    };
    for (const [alias, canon] of Object.entries(aliases)) {
      if (key === alias || key.includes(alias)) return canon;
    }
    for (const h of list) {
      const hk = this.normalizeHolidayKey(h);
      if (key === hk || key.includes(hk) || hk.includes(key)) return h;
    }
    return null;
  },

  holidayFromHints(hints) {
    if (!Array.isArray(hints)) return null;
    for (const h of hints) {
      const hit = this.matchHolidayCategory?.(h);
      if (hit) return hit;
    }
    return null;
  },

  /**
   * Всё в скобках состава — подсказки для ИИ, в клиентский состав не входят.
   * Спец.авто: (цифра)/(1|2 цифры) → галочка; (На выписку)/(1 сентября)… → категория.
   */
  parseCompositionHolidayMeta(text) {
    const src = String(text || '');
    let holiday = null;
    let digitCount = 0;
    const hints = [];
    const clean = src.replace(/\(([^)]{1,80})\)/g, (full, inner) => {
      const raw = String(inner || '').trim();
      if (!raw) return ' ';
      const key = raw.toLowerCase().replace(/ё/g, 'е');
      hints.push(raw);
      // (цифра) | (1 цифра) | (2 цифры). Голое «цифры» = 1, не 2.
      if (/^(?:\d\s*)?цифр/.test(key) || /^две\s+цифр/.test(key) || /^одн[аоуы]\s+цифр/.test(key)) {
        if (/^2\b/.test(key) || /^две\b/.test(key)) digitCount = 2;
        else digitCount = digitCount === 2 ? 2 : 1;
      }
      const hit = this.matchHolidayCategory(raw);
      if (hit) holiday = hit;
      return ' ';
    })
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { holiday, digitCount, hints, cleanText: clean };
  },

  applyHolidayOnlyMode(holiday) {
    if (!holiday) return;
    const catEl = document.getElementById('product-category');
    if (catEl) catEl.value = holiday;

    // Доп. разделы: только тематика, без других аудиторий/поводов/типов
    document.querySelectorAll('#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input')
      .forEach((cb) => { cb.checked = false; });
    const themeCb = document.querySelector(
      `#tags-for-who input[value="${CSS.escape(holiday)}"], #tags-occasion input[value="${CSS.escape(holiday)}"], #tags-dates input[value="${CSS.escape(holiday)}"]`
    );
    if (themeCb) themeCb.checked = true;

    this.currentProduct = this.currentProduct || {};
    this.currentProduct.holiday_only = holiday;
    this.applyAgeFromCategory?.(holiday);
    this.syncOccasionShelfFields?.();
  },

  ageFromCategory(cat) {
    const c = String(cat || '').trim();
    if (!c) return '';
    if (c === 'На выписку' || c === '1 годик' || c === 'Крещение') return 'Для малышей';
    if (c === 'Гендер-пати' || c === '1 сентября' || c === 'Для девочки' || c === 'Для мальчика'
      || c === 'Геймерам' || c === 'Фотозона' || c === 'Коробка-сюрприз') {
      return 'Для детей';
    }
    // «Универсальные» и «Юбилей» — возраст не авто; задаёт ИИ/оператор по фото
    if (c === 'Выпускной') return 'Для подростков';
    if (c === 'Для неё' || c === 'Для него' || c === 'Для мамы'
      || c === 'Свадьба и девичник' || c === '8 марта' || c === '14 февраля' || c === '23 февраля') {
      return 'Для взрослых';
    }
    if (c === 'Новый год') return 'Для любого возраста';
    return '';
  },

  applyAgeFromCategory(cat) {
    const age = this.ageFromCategory(cat || document.getElementById('product-category')?.value);
    const ageEl = document.getElementById('product-age');
    if (ageEl && age) ageEl.value = age;
    return age;
  },

  isOccasionShelf(cat) {
    const c = String(cat || document.getElementById('product-category')?.value || '').trim();
    const list = (typeof OCCASION_SHELVES !== 'undefined' && OCCASION_SHELVES) || [];
    if (list.includes(c)) return true;
    const h = this.currentProduct?.holiday_only;
    return !!(h && h === c);
  },

  /** Полки-поводы: возраст авто; персонаж/серия всегда видны. */
  syncOccasionShelfFields() {
    const cat = document.getElementById('product-category')?.value || '';
    const list = (typeof OCCASION_SHELVES !== 'undefined' && OCCASION_SHELVES) || [];
    if (this.currentProduct?.holiday_only && cat && this.currentProduct.holiday_only !== cat && !list.includes(cat)) {
      this.currentProduct.holiday_only = '';
    }
    const occasion = this.isOccasionShelf(cat);
    const charGroup = document.getElementById('product-character')?.closest('.form-group');
    const seriesGroup = document.getElementById('product-series')?.closest('.form-group');
    if (charGroup) charGroup.classList.remove('hidden');
    if (seriesGroup) seriesGroup.classList.remove('hidden');
    if (occasion && cat !== 'Юбилей') {
      this.applyAgeFromCategory?.(cat || this.currentProduct?.holiday_only);
    }
    this.syncRequiredFieldHighlights?.();
  },

  wireOccasionShelfControls() {
    if (this._occasionShelfWired) return;
    this._occasionShelfWired = true;
    document.getElementById('product-category')?.addEventListener('change', () => {
      this.syncOccasionShelfFields?.();
      if (!this.isOccasionShelf?.()) return;
      // Полка-повод: отметить повод/дату; аудиторию «для кого» не сбрасывать
      const cat = document.getElementById('product-category')?.value || '';
      if (!cat) return;
      document.querySelectorAll('#tags-occasion input, #tags-dates input')
        .forEach((cb) => { cb.checked = cb.value === cat; });
      document.querySelectorAll('#tags-type input')
        .forEach((cb) => {
          if (cb.value === 'Фотозона' && this.isPhotozoneContext?.()) return;
          cb.checked = false;
        });
    });
  },

  /** XOR тип изделия без тематики в скобках: только этот type-тег. */
  applyTypeOnlyMode(typeTag) {
    if (!typeTag || this.currentProduct?.holiday_only) return;
    const catEl = document.getElementById('product-category');
    if (catEl) catEl.value = typeTag;
    document.querySelectorAll('#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input')
      .forEach((cb) => { cb.checked = false; });
    const typeCb = document.querySelector(`#tags-type input[value="${CSS.escape(typeTag)}"]`);
    if (typeCb) typeCb.checked = true;
  },

  applyBouquetOnlyMode() { this.applyTypeOnlyMode('Букет из шаров'); },
  applyBalloonFlowersOnlyMode() { this.applyTypeOnlyMode('Цветы из шаров'); },

  isBalloonFlowersMode() {
    const cat = document.getElementById('product-category')?.value || '';
    const typeOn = [...document.querySelectorAll('#tags-type input:checked')]
      .some((cb) => cb.value === 'Цветы из шаров');
    return this.getBouquetType?.() === 'flowers'
      || cat === 'Цветы из шаров'
      || typeOn;
  },
  applyFiguresOnlyMode() { this.applyTypeOnlyMode('Фигуры из шаров'); },
  applyBoxOnlyMode() { this.applyTypeOnlyMode('Коробка-сюрприз'); },
  applyPhotozoneOnlyMode() {
    this.applyTypeOnlyMode('Фотозона');
    // Сохранить выбранный тип каркас/мольберт в обоих блоках UI
    this.setPhotozoneType?.(this.getPhotozoneType?.() || 'frame');
  },

  compositionLooksLikeBouquet(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return false;
    if (/крафтов/.test(t)) return false;
    if (/цвет\w*\s+из\s+шар/.test(t)) return false;
    return /букет/.test(t);
  },

  compositionLooksLikeBalloonFigure(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return false;
    if (/фольг\w*\s+фигур/.test(t)) return false;
    return /фигур[аыуе]?(?:\s+\w+){0,2}\s+из\s+шар/.test(t)
      || /скрутк\w*\s+из\s+шар/.test(t);
  },

  compositionLooksLikePhotozone(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return false;
    return /фотозон|мольбер|полистирол|круг\s+на\s+мольбер|каркас|кругл\w*\s+рам|рамк\w*\s+фотозон|обруч|\bhoop\b|\beasel\b/.test(t);
  },

  isPhotozoneContext() {
    const scene = this.currentProduct?.scene || document.getElementById('scene-select')?.value || '';
    const cat = document.getElementById('product-category')?.value || '';
    const typeOn = [...document.querySelectorAll('#tags-type input:checked')]
      .some((cb) => cb.value === 'Фотозона');
    const comp = document.getElementById('product-composition')?.value || '';
    return scene === 'photozone'
      || cat === 'Фотозона'
      || typeOn
      || !!this.compositionPhotozoneType?.(comp)
      || this.compositionLooksLikePhotozone?.(comp);
  },

  ensurePhotozoneTagFromCard(card) {
    const tags = Array.isArray(card?.tags) ? card.tags : [];
    const comp = Array.isArray(card?.composition)
      ? card.composition.join('\n')
      : String(card?.composition || document.getElementById('product-composition')?.value || '');
    const scene = this.currentProduct?.scene || '';
    const hit = scene === 'photozone'
      || tags.includes('Фотозона')
      || card?.category === 'Фотозона'
      || this.compositionLooksLikePhotozone?.(comp)
      || !!this.compositionPhotozoneType?.(comp);
    if (!hit) return;
    const cb = document.querySelector('#tags-type input[value="Фотозона"]');
    if (cb) cb.checked = true;
  },

  compositionLooksLikeSurpriseBox(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return false;
    return /коробк/.test(t);
  },

  syncHolidayFromComposition() {
    const el = document.getElementById('product-composition');
    if (!el) return null;
    const before = el.value;
    const { holiday, digitCount, hints, cleanText } = this.parseCompositionHolidayMeta(before);
    this.currentProduct = this.currentProduct || {};
    // Скобки уже сняты с прошлого ввода — не затираем сохранённые подсказки
    if (hints.length) {
      const prev = this.currentProduct.composition_hints || [];
      this.currentProduct.composition_hints = [...new Set([...prev, ...hints])];
    } else if (!String(before || '').trim()) {
      this.currentProduct.composition_hints = [];
      this.currentProduct.digit_from_marker = 0;
    }
    if (digitCount > 0) {
      this.currentProduct.digit_from_marker = digitCount;
    }
    if (holiday) {
      this.applyHolidayOnlyMode(holiday);
    } else {
      const storedHoliday = this.holidayFromHints?.(this.currentProduct.composition_hints)
        || this.currentProduct.holiday_only
        || null;
      // (цифра) и прочие скобки не отменяют уже заданный «Новый год»
      if (storedHoliday) this.applyHolidayOnlyMode(storedHoliday);
    }
    // Убрать ВСЕ скобки из поля состава — клиенту не уходят
    if (cleanText !== String(before || '').trim()) {
      const pos = el.selectionStart;
      el.value = cleanText;
      try { el.setSelectionRange(Math.min(pos, cleanText.length), Math.min(pos, cleanText.length)); } catch (_) { /* ignore */ }
    }
    // Не вызывать syncAdvanceOrderFromScene здесь — он сам зовёт этот метод (иначе stack overflow)
    this.syncRequiredFieldHighlights?.();
    return holiday || this.currentProduct.holiday_only || null;
  },

  /** Сколько фольгированных цифр в составе: 1 / 2 / 0 если не указано. */
  compositionDigitCount(text) {
    const fromMarker = Number(this.currentProduct?.digit_from_marker) || 0;
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    let fromText = 0;
    if (t) {
      // «2 цифры», «2 фольгированные цифры», «две цифры»
      if (/(?:^|[^\d])2\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(t)
        || /(?:^|[^а-яa-z0-9])две\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(t)) {
        fromText = 2;
      } else if (/(?:^|[^\d])1\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(t)
        || /(?:^|[^а-яa-z0-9])одн[аоуы]\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(t)
        || /(?:^|[^а-яa-z0-9])цифр/.test(t)
        || /фольг\w*\s+цифр/.test(t)) {
        fromText = 1;
      }
    }
    return Math.max(fromMarker, fromText);
  },

  /** ИИ не повышает 1→2, если в сыром составе не было «2/две цифры». */
  sanitizeAiDigitLines(lines, rawComposition) {
    const raw = String(rawComposition || '').toLowerCase().replace(/ё/g, 'е');
    const userMentionedDigit = /цифр/.test(raw);
    const userAskedTwo = /(?:^|[^\d])2\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(raw)
      || /(?:^|[^а-яa-z0-9])две\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(raw);
    const arr = Array.isArray(lines) ? lines : String(lines || '').split(/\n/);
    return arr.map((line) => String(line || '').trim()).filter(Boolean).flatMap((line) => {
      const t = line.toLowerCase().replace(/ё/g, 'е');
      if (!/цифр/.test(t)) return [line];
      if (!userMentionedDigit) return [];
      if (userAskedTwo) return ['2 цифры'];
      return ['цифра'];
    });
  },

  /** Тип фотозоны из состава/описания: easel | frame | null. */
  compositionPhotozoneType(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return null;
    if (/мольбер|полистирол|круг\s+на\s+мольбер/.test(t)) return 'easel';
    if (/каркас|кругл\w*\s+рам|рамк\w*\s+фотозон|обруч|hoop|frame/.test(t)) return 'frame';
    return null;
  },

  /** Тип напольной из состава/описания: air | helium | null. */
  compositionFloorType(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return null;
    if (/с\s+воздух|на\s+воздух|воздушн\w*\s+наполн|без\s+гели/.test(t)) return 'air';
    if (/гели|helium|с\s+гелием/.test(t)) return 'helium';
    return null;
  },

  syncAdvanceOrderFromScene() {
    if (this._syncingClientOpts) return;
    this._syncingClientOpts = true;
    try {
      this.syncHolidayFromComposition?.();

      const scene = this.currentProduct?.scene || document.getElementById('scene-select')?.value || '';
      const cat = document.getElementById('product-category')?.value || '';
      const composition = document.getElementById('product-composition')?.value || '';
      const titleText = document.getElementById('product-title')?.value || '';
      const shortDesc = document.getElementById('product-short-desc')?.value || '';
      const fullDesc = document.getElementById('product-full-desc')?.value || '';
      const isFloor = scene === 'floor' || cat === 'Напольные композиции';
      const isFigures = scene === 'balloon_figures' || cat === 'Фигуры из шаров';
      const isBalloonFlowers = this.getBouquetType?.() === 'flowers' || cat === 'Цветы из шаров';
      const isBouquet = scene === 'handheld_bouquet'
        || cat === 'Букет из шаров'
        || cat === 'Крафтовый букет'
        || isBalloonFlowers;
      const isPhotozone = this.isPhotozoneContext?.()
        || scene === 'photozone'
        || cat === 'Фотозона';
      const isWallOnly = scene === 'wall_only';
      const isWallOrFloor = isFloor || isWallOnly || isFigures;
      const hasInscriptionInComp = this.compositionHasPersonalInscription(composition);
      const digitCount = this.compositionDigitCount(composition);
      const pzHintText = [composition, titleText, shortDesc, fullDesc].join(' ');
      const pzFromComp = this.compositionPhotozoneType(pzHintText);
      const hasBox = this.compositionLooksLikeSurpriseBox?.(composition);

      // Тип фотозоны из состава («на мольберте» / «на каркасе»)
      if (isPhotozone && pzFromComp) {
        this.setPhotozoneType?.(pzFromComp);
        const rentalItemEl = document.getElementById('rental-item');
        if (rentalItemEl) rentalItemEl.dataset.autoFill = '1';
      }

      // Коробка в составе → заказ за 1–2 дня (на полу — тот же чип типа)
      if (hasBox) {
        if (isFloor) this.setFloorType?.('air');
      }

      const pzType = this.getPhotozoneType?.() || 'frame';
      const pzMeta = (typeof PHOTOZONE_TYPES !== 'undefined' && PHOTOZONE_TYPES[pzType]) || null;
      const floorType = this.getFloorType?.() || '';
      const floorMeta = (typeof FLOOR_TYPES !== 'undefined' && FLOOR_TYPES[floorType]) || null;

      const advanceEl = document.getElementById('opt-advance');
      const inscriptionEl = document.getElementById('opt-inscription');
      const numberEl = document.getElementById('opt-number');
      const numberHint = document.getElementById('opt-number-hint');
      const rentalEl = document.getElementById('opt-rental');
      const rentalItemEl = document.getElementById('rental-item');
      const pzBlock = document.getElementById('photozone-type-block');
      const floorBlock = document.getElementById('floor-type-block');

      if (pzBlock) pzBlock.classList.toggle('hidden', !isPhotozone);
      if (floorBlock) floorBlock.classList.add('hidden');

      // Фигуры и букеты — заранее за 1–2 дня
      if ((isFigures || isBouquet) && advanceEl) advanceEl.checked = true;
      // Коробка — всегда заранее
      if (hasBox && advanceEl) advanceEl.checked = true;
      // Напольные: чип типа «Заказ за 1–2 дня» (не авто при выборе «Пол»)
      if (isFloor && advanceEl && !hasBox) {
        advanceEl.checked = !!(floorMeta && floorMeta.advance_order);
      }
      // Букеты — персональная надпись; подтип «Цветы» — без галочки (если в составе нет «с надписью»)
      if (isBouquet && inscriptionEl && !isBalloonFlowers) inscriptionEl.checked = true;
      if (isBalloonFlowers && inscriptionEl && !hasInscriptionInComp) inscriptionEl.checked = false;
      // В составе «… с надписью» / «коробка … с индивидуальной надписью» → «Персональная надпись»
      if (hasInscriptionInComp && inscriptionEl) inscriptionEl.checked = true;

      // В составе «1 цифра» / «2 цифры» → галочка «Выбор цифры».
      // Полка «1 годик» — исключение: цифра фиксированная, выбор клиенту не предлагаем.
      const isFirstBirthday = (cat === '1 годик'
        || this.currentProduct?.holiday_only === '1 годик') && !isPhotozone;
      const numberBadge = document.getElementById('opt-number-badge');
      const numberCard = document.getElementById('opt-number-card');
      if (isFirstBirthday) {
        if (numberEl) {
          numberEl.checked = false;
          numberEl.disabled = true;
        }
        if (numberHint) {
          numberHint.textContent = 'Полка «1 годик» — цифра на фото фиксированная, выбор цифры не нужен.';
        }
        if (numberBadge) {
          numberBadge.textContent = '';
          numberBadge.classList.add('hidden');
          numberBadge.classList.remove('is-two');
        }
        if (numberCard) {
          numberCard.classList.add('hidden');
          numberCard.classList.remove('is-digit-active');
        }
      } else {
        if (numberEl) numberEl.disabled = false;
        if (numberCard) numberCard.classList.remove('hidden');
        if (digitCount > 0 && numberEl) {
          numberEl.checked = true;
        }
        if (numberHint) {
          if (digitCount === 2) {
            numberHint.textContent = isWallOrFloor
              ? 'По составу: 2 цифры. Клиент выбирает обе, менять количество нельзя.'
              : 'По составу: 2 цифры. Клиент выбирает обе.';
          } else if (digitCount === 1) {
            numberHint.textContent = isWallOrFloor
              ? 'По составу: 1 цифра. Клиент выбирает одну, менять количество нельзя.'
              : 'По составу: 1 цифра. Клиент выбирает цифру.';
          } else {
            numberHint.textContent = 'Укажите в составе «1 цифра» или «2 цифры» — галочка и бейдж появятся сами.';
          }
        }
        if (numberBadge) {
          if (digitCount === 2) {
            numberBadge.textContent = '2 цифры';
            numberBadge.classList.remove('hidden');
            numberBadge.classList.add('is-two');
          } else if (digitCount === 1) {
            numberBadge.textContent = '1 цифра';
            numberBadge.classList.remove('hidden');
            numberBadge.classList.remove('is-two');
          } else {
            numberBadge.textContent = '';
            numberBadge.classList.add('hidden');
            numberBadge.classList.remove('is-two');
          }
        }
        if (numberCard) numberCard.classList.toggle('is-digit-active', digitCount > 0);
      }

      // Фотозоны: всегда заранее + аренда; тип задаёт предмет аренды и надпись на круге
      if (isPhotozone) {
        if (advanceEl) advanceEl.checked = true;
        if (rentalEl) rentalEl.checked = true;
        if (pzMeta?.has_inscription && inscriptionEl) inscriptionEl.checked = true;
        if (rentalItemEl && (!rentalItemEl.value.trim() || rentalItemEl.dataset.autoFill === '1')) {
          rentalItemEl.value = pzMeta?.rental_item || 'Каркас фотозоны';
          rentalItemEl.dataset.autoFill = '1';
        }
      }
      this.syncRequiredFieldHighlights?.();
    } finally {
      this._syncingClientOpts = false;
    }
  },

  getPhotozoneType() {
    const checked = document.querySelector('input[name="photozone-type"]:checked')
      || document.querySelector('input[name="photozone-type-early"]:checked');
    return checked?.value || 'frame';
  },

  /** Снять выбор radio-группы. checked=false на текущем пункте браузер часто не отпускает. */
  clearRadioGroup(name) {
    const nodes = [...document.querySelectorAll(`input[type="radio"][name="${name}"]`)];
    nodes.forEach((el) => {
      el.defaultChecked = false;
      el.checked = false;
    });
    const stuck = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
    if (!stuck) return;
    const prev = stuck.name;
    stuck.name = '';
    stuck.checked = false;
    stuck.defaultChecked = false;
    stuck.name = prev;
  },

  setPhotozoneType(type) {
    const value = (typeof PHOTOZONE_TYPES !== 'undefined' && PHOTOZONE_TYPES[type]) ? type : (type === 'easel' ? 'easel' : 'frame');
    document.querySelectorAll('input[name="photozone-type"], input[name="photozone-type-early"]').forEach((el) => {
      el.defaultChecked = el.value === 'frame';
      el.checked = el.value === value;
    });
  },

  getFloorType() {
    const checked = document.querySelector('input[name="floor-type"]:checked')
      || document.querySelector('input[name="floor-type-early"]:checked');
    return checked?.value === 'air' ? 'air' : '';
  },

  setFloorType(type) {
    const on = type === 'air';
    document.querySelectorAll('input[name="floor-type"], input[name="floor-type-early"]').forEach((el) => {
      el.defaultChecked = false;
      el.checked = on && el.value === 'air';
    });
  },

  wirePhotozoneTypeControls() {
    if (this._photozoneTypeWired) return;
    this._photozoneTypeWired = true;
    const sync = (e) => {
      const val = e?.target?.value || this.getPhotozoneType();
      this.setPhotozoneType(val);
      const rentalItemEl = document.getElementById('rental-item');
      if (rentalItemEl) rentalItemEl.dataset.autoFill = '1';
      this.syncAdvanceOrderFromScene?.();
      this.syncStudioModeHint?.();
    };
    document.querySelectorAll('input[name="photozone-type"], input[name="photozone-type-early"]').forEach((el) => {
      el.addEventListener('change', sync);
    });
    const rentalItemEl = document.getElementById('rental-item');
    if (rentalItemEl) {
      rentalItemEl.addEventListener('input', () => {
        rentalItemEl.dataset.autoFill = '0';
      });
    }
  },

  wireFloorTypeControls() {
    if (this._floorTypeWired) return;
    this._floorTypeWired = true;
    const sync = (e) => {
      const el = e?.target;
      const on = !!(el && el.checked && el.value === 'air');
      this.setFloorType(on ? 'air' : '');
      this.syncAdvanceOrderFromScene?.();
      this.syncStudioModeHint?.();
      this.scheduleSaveActiveStudioDraft?.();
    };
    document.querySelectorAll('input[name="floor-type"], input[name="floor-type-early"]').forEach((el) => {
      el.addEventListener('change', sync);
    });
  },

  getSurprisePose() {
    const checked = document.querySelector('input[name="surprise-pose-early"]:checked');
    return checked?.value === 'hang' ? 'hang' : 'stand';
  },

  setSurprisePose(pose) {
    const value = pose === 'hang' ? 'hang' : 'stand';
    document.querySelectorAll('input[name="surprise-pose-early"]').forEach((el) => {
      el.defaultChecked = el.value === 'stand';
      el.checked = el.value === value;
    });
  },

  surpriseMoneyOn() {
    return !!document.getElementById('surprise-money-early')?.checked;
  },

  setSurpriseMoney(on) {
    const el = document.getElementById('surprise-money-early');
    if (!el) return;
    el.defaultChecked = false;
    el.checked = !!on;
  },

  wireSurprisePoseControls() {
    if (this._surprisePoseWired) return;
    this._surprisePoseWired = true;
    const sync = () => {
      this.syncStudioModeHint?.();
      this.scheduleSaveActiveStudioDraft?.();
    };
    document.querySelectorAll('input[name="surprise-pose-early"]').forEach((el) => {
      el.addEventListener('change', sync);
    });
    document.getElementById('surprise-money-early')?.addEventListener('change', sync);
  },

  getBouquetType() {
    const checked = document.querySelector('input[name="bouquet-type-early"]:checked');
    return checked?.value === 'flowers' ? 'flowers' : '';
  },

  setBouquetType(type) {
    const on = type === 'flowers';
    document.querySelectorAll('input[name="bouquet-type-early"]').forEach((el) => {
      el.defaultChecked = false;
      el.checked = on && el.value === 'flowers';
    });
    this.syncArchPriceLabel?.();
  },

  isArchForm() {
    const cat = document.getElementById('product-category')?.value || '';
    const archTag = document.querySelector('#tags-type input[value="Арка из шаров"]')?.checked;
    const reviewCat = document.getElementById('ai-review-category')?.value || '';
    return cat === 'Арка из шаров' || reviewCat === 'Арка из шаров' || !!archTag;
  },

  syncArchPriceLabel() {
    const flowers = document.querySelector('input[name="bouquet-type-early"]:checked')?.value === 'flowers';
    const arch = !flowers && this.isArchForm?.();
    const label = document.getElementById('essentials-price-label');
    if (label) {
      label.innerHTML = flowers
        ? 'Цена за штуку, ₽ <span class="req">*</span>'
        : (arch ? 'Цена за метр, ₽ <span class="req">*</span>' : 'Цена, ₽ <span class="req">*</span>');
    }
    const review = document.querySelector('label[for="ai-review-price"]');
    if (review) review.textContent = arch ? 'Цена за метр, ₽' : 'Цена, ₽';
    if (!this._archPriceWired) {
      this._archPriceWired = true;
      document.getElementById('product-category')?.addEventListener('change', () => this.syncArchPriceLabel());
      document.getElementById('ai-review-category')?.addEventListener('change', () => this.syncArchPriceLabel());
      document.getElementById('tags-type')?.addEventListener('change', () => this.syncArchPriceLabel());
    }
  },

  wireBouquetTypeControls() {
    if (this._bouquetTypeWired) return;
    this._bouquetTypeWired = true;
    const sync = (e) => {
      const el = e?.target;
      const on = !!(el && el.checked && el.value === 'flowers');
      this.setBouquetType(on ? 'flowers' : '');
      if (on) this.applyBalloonFlowersOnlyMode?.();
      else if ((this.currentProduct?.scene || document.getElementById('scene-select')?.value) === 'handheld_bouquet') {
        this.applyBouquetOnlyMode?.();
      }
      this.syncAdvanceOrderFromScene?.();
      this.syncStudioModeHint?.();
      this.scheduleSaveActiveStudioDraft?.();
    };
    document.querySelectorAll('input[name="bouquet-type-early"]').forEach((el) => {
      el.addEventListener('change', sync);
    });
  },

  getUnitBalloonType() {
    const checked = document.querySelector('input[name="unit-balloon-type-early"]:checked');
    const val = checked?.value || '';
    return (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[val]) ? val : '';
  },

  getLetterInk() {
    const checked = document.querySelector('input[name="unit-letter-ink"]:checked');
    return checked?.value === 'dark' ? 'dark' : (checked?.value === 'light' ? 'light' : '');
  },

  setLetterInk(value) {
    const ink = value === 'dark' || value === 'light' ? value : '';
    document.querySelectorAll('input[name="unit-letter-ink"]').forEach((el) => {
      el.defaultChecked = false;
      el.checked = !!ink && el.value === ink;
    });
    if (!ink) this.clearRadioGroup?.('unit-letter-ink');
  },

  setUnitBalloonType(type) {
    this.renderUnitWhoChips?.();
    const value = (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[type]) ? type : '';
    document.querySelectorAll('input[name="unit-balloon-type-early"]').forEach((el) => {
      el.defaultChecked = false;
      el.checked = !!value && el.value === value;
    });
    if (!value) this.clearRadioGroup?.('unit-balloon-type-early');
    const meta = UNIT_BALLOON_TYPES[value];
    const wrap = document.getElementById('unit-balloon-size-wrap');
    if (wrap) wrap.classList.toggle('hidden', !meta?.hasSize);
    if (!meta?.hasSize) {
      const sizeEl = document.getElementById('unit-balloon-size');
      if (sizeEl && !value) sizeEl.value = '';
    }
    const inkWrap = document.getElementById('unit-letter-ink-wrap');
    if (inkWrap) inkWrap.classList.toggle('hidden', !meta?.hasInk);
    if (!meta?.hasInk) this.setLetterInk?.('');
    const whoWrap = document.getElementById('unit-balloon-who-wrap');
    const hideWho = !value || !!meta?.plainShelf;
    if (whoWrap) whoWrap.classList.toggle('hidden', hideWho);
    if (hideWho) {
      document.querySelectorAll('input[name="unit-balloon-who-early"]').forEach((el) => {
        el.defaultChecked = false;
        el.checked = false;
      });
    }
    this.syncUnitCharacterWrap?.();
    this.syncUnitHolidayControl?.();
    this.scheduleUnitCharacterDetect?.();
  },

  unitHolidayAllowed() {
    if (!this.isUnitBalloonMode?.()) return false;
    const type = this.getUnitBalloonType?.() || '';
    if (!type) return true;
    return !!(typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[type]?.hasHoliday);
  },

  renderUnitHolidayMenu() {
    const chips = document.getElementById('unit-holiday-chips');
    if (!chips || chips.dataset.ready === '1') return;
    const list = (typeof UNIT_HOLIDAYS !== 'undefined' && UNIT_HOLIDAYS) || [];
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    chips.innerHTML = list.map((name) =>
      `<button type="button" class="unit-holiday-chip" data-unit-holiday="${esc(name)}">${esc(name)}</button>`
    ).join('') + '<button type="button" class="unit-holiday-chip unit-holiday-chip-clear" data-unit-holiday="">Без праздника</button>';
    chips.dataset.ready = '1';
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-unit-holiday]');
      if (!btn) return;
      e.preventDefault();
      this.setUnitHoliday(btn.getAttribute('data-unit-holiday') || '');
    });
  },

  syncUnitHolidayControl() {
    const wrap = document.getElementById('unit-holiday-wrap');
    const show = this.unitHolidayAllowed();
    if (wrap) {
      wrap.classList.toggle('hidden', !show);
      wrap.hidden = !show;
      if (show) this.renderUnitHolidayMenu?.();
    }
    if (!show && this.getUnitBalloonType?.() && !UNIT_BALLOON_TYPES[this.getUnitBalloonType()]?.hasHoliday) {
      this.setUnitHoliday?.('');
    }
    this.paintUnitHolidayToggle?.();
    const topPub = document.getElementById('unit-step1-publish-btn');
    if (topPub) topPub.hidden = true;
    this.syncUnitPublishEnabled?.();
  },

  syncUnitPublishEnabled() {
    const btn = document.getElementById('publish-product-btn');
    const form = document.getElementById('product-form');
    if (!btn || !form) return;
    const unitStep = !!this.isUnitBalloonMode?.() && !form.classList.contains('is-editor-step-2');
    if (!unitStep) {
      if (btn.dataset.unitPriceLock) {
        btn.disabled = false;
        delete btn.dataset.unitPriceLock;
      }
      return;
    }
    const price = parseInt(document.getElementById('product-price')?.value, 10) || 0;
    btn.disabled = price <= 0;
    btn.dataset.unitPriceLock = '1';
  },

  paintUnitHolidayToggle() {
    const holiday = this.getUnitHoliday?.() || '';
    document.querySelectorAll('#unit-holiday-chips [data-unit-holiday]').forEach((el) => {
      const val = el.getAttribute('data-unit-holiday');
      el.classList.toggle('is-on', holiday ? val === holiday : val === '');
    });
  },

  toggleUnitHolidayPop() { /* устарело — чипы встроены в форму */ },
  closeUnitHolidayPop() { /* устарело */ },

  getUnitHoliday() {
    const list = (typeof UNIT_HOLIDAYS !== 'undefined' && UNIT_HOLIDAYS) || [];
    const value = this.currentProduct?.client_options?.unit_holiday || this.currentProduct?.holiday_only || '';
    return list.includes(value) ? value : '';
  },

  setUnitHoliday(name) {
    const list = (typeof UNIT_HOLIDAYS !== 'undefined' && UNIT_HOLIDAYS) || [];
    const value = list.includes(name) ? name : '';
    this.currentProduct = this.currentProduct || { photos: [], scene: 'auto', tags: [], client_options: {} };
    this.currentProduct.client_options = this.currentProduct.client_options || {};
    if (value) this.currentProduct.client_options.unit_holiday = value;
    else delete this.currentProduct.client_options.unit_holiday;
    this.currentProduct.holiday_only = value;
    this.paintUnitHolidayToggle?.();
    this.scheduleSaveActiveStudioDraft?.();
  },

  toggleUnitHolidayPop(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.renderUnitHolidayMenu?.();
    const menu = document.getElementById('unit-holiday-menu');
    if (!menu) return;
    const open = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
    menu.hidden = !open;
    this.paintUnitHolidayToggle?.();
  },

  closeUnitHolidayPop() {
    const menu = document.getElementById('unit-holiday-menu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.hidden = true;
  },

  /** Персонаж/серия видны для поштучных с рисунком или фольгой (не простой латекс). */
  syncUnitCharacterWrap() {
    const wrap = document.getElementById('unit-character-wrap');
    if (!wrap) return;
    const unit = this.isUnitBalloonMode?.();
    if (!unit) {
      wrap.classList.remove('hidden');
      return;
    }
    const type = this.getUnitBalloonType?.() || '';
    const meta = (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[type]) || null;
    wrap.classList.toggle('hidden', type === 'latex' || !!meta?.plainShelf);
  },

  getUnitBalloonWhoList() {
    const list = (typeof UNIT_WHO_PICKS !== 'undefined' && UNIT_WHO_PICKS) || [];
    const allowed = new Set(list.map((x) => x.tag));
    return [...document.querySelectorAll('input[name="unit-balloon-who-early"]:checked')]
      .map((el) => el.value)
      .filter((tag) => allowed.has(tag));
  },

  getUnitBalloonWho() {
    return this.getUnitBalloonWhoList?.()[0] || '';
  },

  setUnitBalloonWho(tag) {
    const type = this.getUnitBalloonType?.() || '';
    const meta = (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[type]) || null;
    if (meta?.plainShelf) tag = [];
    const raw = Array.isArray(tag) ? tag : (tag ? [tag] : []);
    this.renderUnitWhoChips?.();
    const list = (typeof UNIT_WHO_PICKS !== 'undefined' && UNIT_WHO_PICKS) || [];
    const allowed = new Set(raw.filter((t) => list.some((x) => x.tag === t)));
    document.querySelectorAll('input[name="unit-balloon-who-early"]').forEach((el) => {
      el.defaultChecked = false;
      el.checked = allowed.has(el.value);
    });
  },

  inferUnitBalloonWho(product) {
    const opts = product?.client_options || {};
    const list = (typeof UNIT_WHO_PICKS !== 'undefined' && UNIT_WHO_PICKS) || [];
    const allowed = new Set(list.map((x) => x.tag));
    const fromOpt = Array.isArray(opts.unit_who) ? opts.unit_who : (opts.unit_who ? [opts.unit_who] : []);
    const hay = [product?.category].concat(product?.tags || [], fromOpt);
    return [...new Set(hay.filter((t) => allowed.has(t)))];
  },

  renderUnitWhoChips() {
    const row = document.getElementById('unit-who-row');
    if (!row || row.dataset.ready === '1') return;
    const list = (typeof UNIT_WHO_PICKS !== 'undefined' && UNIT_WHO_PICKS) || [];
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    row.innerHTML = list.map((item, i) => `
      <label class="scene-subchip">
        <input type="checkbox" name="unit-balloon-who-early" id="unit-who-${i}" value="${esc(item.tag)}"/>
        <span>${esc(item.label)}</span>
      </label>
    `).join('');
    row.dataset.ready = '1';
  },

  inferUnitBalloonType(product) {
    const opts = product?.client_options || {};
    if (opts.unit_type && typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[opts.unit_type]) {
      return opts.unit_type;
    }
    const hay = [product?.category].concat(product?.tags || []);
    if (hay.includes('Шары с рисунком')) return 'print';
    if (hay.includes('Ходячие фигуры')) return 'walker';
    if (hay.includes('Круги, звёзды и сердца')) return 'shapes';
    if (hay.includes('Фольгированные цифры')) return 'digit';
    if (hay.includes('Фольгированные фигуры')) return 'foil';
    if (hay.includes('Шары с конфетти')) return 'confetti';
    if (hay.includes('Шары хром')) return 'chrome';
    if (hay.includes('Шары Brush')) return 'brush';
    if (hay.includes('Шары Super Agate')) return 'agate';
    if (hay.includes('Шары Bubble')) return 'bubble';
    if (hay.includes('Именные шары')) return 'named';
    if (hay.includes('Латексные шары')) return 'latex';
    return '';
  },

  wireUnitBalloonTypeControls() {
    if (this._unitBalloonTypeWired) return;
    this._unitBalloonTypeWired = true;
    this.renderUnitWhoChips?.();
    const sync = (e) => {
      const val = e?.target?.checked === false ? '' : (e?.target?.value || this.getUnitBalloonType());
      this.setUnitBalloonType(val);
      this.scheduleSaveActiveStudioDraft?.();
    };
    document.querySelectorAll('input[name="unit-balloon-type-early"]').forEach((el) => {
      el.addEventListener('change', sync);
    });
    const sizeEl = document.getElementById('unit-balloon-size');
    if (sizeEl) {
      sizeEl.addEventListener('input', () => this.scheduleSaveActiveStudioDraft?.());
    }
    document.querySelectorAll('input[name="unit-letter-ink"]').forEach((el) => {
      el.addEventListener('change', () => this.scheduleSaveActiveStudioDraft?.());
    });
    document.querySelectorAll('input[name="unit-balloon-who-early"]').forEach((el) => {
      el.addEventListener('change', () => this.scheduleSaveActiveStudioDraft?.());
    });
  },

  // === Form Events ===
  setupFormEvents() {
    // Кнопки ИИ и Studio Pro используют onclick="..." прямо из HTML (admin-ai.js, admin-studio-pro.js).
    // Слушатели здесь не нужны — иначе один клик отправлял бы ДВА запроса.
  },

  // === Tags ===
  renderTags() {
    this.renderTagGroup('tags-for-who', TAGS.forWho);
    this.renderTagGroup('tags-occasion', TAGS.occasion);
    this.renderTagGroup('tags-dates', TAGS.dates);
    const deferred = (typeof DEFERRED_TYPE_TAGS !== 'undefined' && DEFERRED_TYPE_TAGS) || ['Шар-сюрприз'];
    this.renderTagGroup('tags-type', TAGS.type.filter((t) => !deferred.includes(t)));
  },

  renderTagGroup(containerId, tags) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = tags.map((tag, i) => `
      <div class="chip">
        <input type="checkbox" id="${containerId}-${i}" value="${tag}"/>
        <label for="${containerId}-${i}">${tag}</label>
      </div>
    `).join('');
  },

  fillFormWithAIData(card) {
    if (card.title != null) {
      const el = document.getElementById('product-title');
      if (el) el.value = card.title || '';
    }
    // article / price — только вручную (артикул DG-XXX ставит generateAIMetadata через nextArticle)
    if (card.short_description) {
      const el = document.getElementById('product-short-desc');
      if (el) el.value = card.short_description;
    }
    if (card.full_description) {
      const el = document.getElementById('product-full-desc');
      if (el) el.value = card.full_description;
    }
    if (card.composition) {
      const comp = Array.isArray(card.composition) ? card.composition.join('\n') : String(card.composition);
      const meta = this.parseCompositionHolidayMeta?.(comp) || { cleanText: comp, holiday: null, hints: [], digitCount: 0 };
      const el = document.getElementById('product-composition');
      if (el) el.value = meta.cleanText;
      this.currentProduct = this.currentProduct || {};
      if (meta.hints?.length) {
        const prev = this.currentProduct.composition_hints || [];
        this.currentProduct.composition_hints = [...new Set([...prev, ...meta.hints])];
      }
      if (meta.digitCount > 0) {
        this.currentProduct.digit_from_marker = meta.digitCount;
      }
      if (meta.holiday) {
        this.currentProduct.holiday_only = meta.holiday;
      }
    }
    const holidayOnly = (() => {
      const raw = this.currentProduct?.holiday_only
        || this.matchHolidayCategory?.(card.holiday_only)
        || this.holidayFromHints?.(this.currentProduct?.composition_hints)
        || null;
      const list = (typeof OCCASION_SHELVES !== 'undefined' && OCCASION_SHELVES) || [];
      return raw && list.includes(raw) ? raw : null;
    })();
    if (!holidayOnly && card.category) {
      const el = document.getElementById('product-category');
      if (el) el.value = card.category;
    }
    if (card.seo_title) {
      const el = document.getElementById('product-seo-title');
      if (el) el.value = card.seo_title;
    }
    if (card.seo_description) {
      const el = document.getElementById('product-seo-desc');
      if (el) el.value = card.seo_description;
    }
    if (card.slug) {
      const el = document.getElementById('product-slug');
      if (el) el.value = card.slug;
    }

    if (card.tags) {
      if (card._replaceTags) {
        document.querySelectorAll('#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input')
          .forEach((cb) => { cb.checked = false; });
      }
      const typeSet = new Set((typeof TAGS !== 'undefined' && TAGS.type) || []);
      const deferred = (typeof DEFERRED_TYPE_TAGS !== 'undefined' && DEFERRED_TYPE_TAGS) || ['Шар-сюрприз'];
      const sceneNow = this.currentProduct?.scene || '';
      const skipFloorTag = sceneNow === 'wall_only' || sceneNow === 'unit_balloon';
      card.tags.forEach((tag) => {
        if (deferred.includes(tag)) return;
        // Праздник/тематика: в доп. разделах только она, без типов/аудитории
        if (holidayOnly && tag !== holidayOnly && tag !== 'Фотозона') return;
        if (holidayOnly && typeSet.has(tag) && tag !== 'Фотозона') return;
        if (skipFloorTag && tag === 'Напольные композиции') return;
        const cb = document.querySelector(
          `#tags-for-who input[value="${CSS.escape(tag)}"], #tags-occasion input[value="${CSS.escape(tag)}"], #tags-dates input[value="${CSS.escape(tag)}"], #tags-type input[value="${CSS.escape(tag)}"]`
        ) || document.querySelector(`input[type="checkbox"][value="${CSS.escape(tag)}"]`);
        if (cb) cb.checked = true;
      });
    }

    if (card.character != null) {
      const el = document.getElementById('product-character');
      if (el) el.value = card.character || '';
    }
    if (card.age_group || holidayOnly || this.isOccasionShelf?.(card.category)) {
      const el = document.getElementById('product-age');
      if (el) {
        const v = String(card.age_group || this.ageFromCategory?.(card.category || holidayOnly) || '').trim();
        const opts = [...el.options].map((o) => o.value || o.textContent);
        if (v && opts.includes(v)) el.value = v;
        else el.value = '';
      }
    }
    if (card.series_name != null) {
      const el = document.getElementById('product-series');
      if (el) el.value = card.series_name || '';
    }
    if (holidayOnly && !(card.id && card.category)) {
      this.applyHolidayOnlyMode(holidayOnly);
      this.ensurePhotozoneTagFromCard?.(card);
    } else if (card.id && card.category) {
      if (card.category === 'Цветы из шаров') this.setBouquetType?.('flowers');
      else this.setBouquetType?.('');
    } else if (this.isOccasionShelf?.(card.category)) {
      if (card.category !== 'Юбилей') this.applyAgeFromCategory?.(card.category);
      this.syncOccasionShelfFields?.();
      this.ensurePhotozoneTagFromCard?.(card);
    } else {
      const scene = this.currentProduct?.scene || document.getElementById('scene-select')?.value || '';
      const tags = Array.isArray(card.tags) ? card.tags : [];
      const compText = Array.isArray(card.composition)
        ? card.composition.join('\n')
        : String(card.composition || document.getElementById('product-composition')?.value || '');
      if (scene === 'surprise') {
        this.applyTypeOnlyMode?.('Шар-сюрприз');
      } else if (
        card.category === 'Коробка-сюрприз'
        || tags.includes('Коробка-сюрприз')
        || this.compositionLooksLikeSurpriseBox?.(compText)
      ) {
        this.applyBoxOnlyMode?.();
        const ageEl = document.getElementById('product-age');
        if (ageEl && !ageEl.value) ageEl.value = 'Для детей';
      } else if (
        this.getBouquetType?.() === 'flowers'
        || card.category === 'Цветы из шаров'
        || tags.includes('Цветы из шаров')
      ) {
        this.applyBalloonFlowersOnlyMode?.();
        this.setBouquetType?.('flowers');
      } else if (
        scene === 'handheld_bouquet'
        || card.category === 'Букет из шаров'
        || (tags.includes('Букет из шаров') && (scene === 'handheld_bouquet' || this.compositionLooksLikeBouquet?.(compText)))
        || this.compositionLooksLikeBouquet?.(compText)
      ) {
        this.applyBouquetOnlyMode?.();
      } else if (
        scene === 'balloon_figures'
        || card.category === 'Фигуры из шаров'
        || this.compositionLooksLikeBalloonFigure?.(compText)
      ) {
        this.applyFiguresOnlyMode?.();
      } else if (scene === 'photozone' || card.category === 'Фотозона' || tags.includes('Фотозона')) {
        this.applyPhotozoneOnlyMode?.();
      }
    }
    if (card.budget) {
      const el = document.getElementById('product-budget');
      if (el) {
        const opts = [...el.options].map((o) => o.value);
        el.value = opts.includes(card.budget) ? card.budget : '';
        if (!el.value) this.syncBudgetFromPrice?.();
      }
    }
    if (card.title) this.syncEditorTitle(card.title);
    this.syncAIFillGate?.();
    this.syncAdvanceOrderFromScene?.();
    this.syncOccasionShelfFields?.();
    this.syncRequiredFieldHighlights?.();
  },

  async uploadPhoto(file, opts = {}) {
    // Порядок: Worker/R2 → ImgBB → Cloudinary. Патч в cloudinary-patch.js
    // переопределяет эту функцию; здесь — тот же порядок на случай, если патч не загрузился.
    let uploadFile = file;
    try {
      if (typeof this.compressImageFile === 'function') {
        uploadFile = await this.compressImageFile(file);
      }
    } catch (e) {
      console.warn('Сжатие фото не удалось, отправляю оригинал:', e);
      uploadFile = file;
    }

    const label = file?.name || 'фото';
    const onProgress = (pct) => {
      this.showPhotoUploadProgress?.(pct, `Загрузка: ${label} · ${pct}%`);
      if (typeof opts.onProgress === 'function') opts.onProgress(pct);
    };
    const isHttps = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
    const finish = (result) => {
      if (result?.ok) this.showPhotoUploadProgress?.(100, 'Готово');
      else this.hidePhotoUploadProgress?.();
      setTimeout(() => this.hidePhotoUploadProgress?.(), result?.ok ? 600 : 0);
      return result;
    };

    if (this.workerUrl) {
      try {
        this.showPhotoUploadProgress?.(0, `Загрузка на сервер: ${label}`);
        const formData = new FormData();
        formData.append('file', uploadFile);
        const res = await fetch(`${this.workerUrl}/api/upload/photo`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: formData
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result?.ok && isHttps(result.url) && result.storage !== 'data-url') {
          return finish(result);
        }
      } catch (error) {
        console.warn('Worker upload error:', error);
      }
    }

    if (this.imgbbApiKey && window.ImgbbUploader?.uploadPhoto) {
      try {
        this.showPhotoUploadProgress?.(0, `Загрузка ImgBB: ${label}`);
        const result = await window.ImgbbUploader.uploadPhoto(uploadFile, this.imgbbApiKey, { onProgress });
        if (result?.ok) return finish(result);
        this.hidePhotoUploadProgress?.();
      } catch (error) {
        console.error('ImgBB upload error:', error);
        this.hidePhotoUploadProgress?.();
      }
    }

    const cloud = this.cloudinaryCloudName || '';
    const preset = this.cloudinaryUploadPreset || '';
    if (cloud && preset && window.CloudinaryUploader?.uploadPhoto) {
      try {
        this.showPhotoUploadProgress?.(0, `Загрузка Cloudinary: ${label}`);
        const result = await window.CloudinaryUploader.uploadPhoto(uploadFile, cloud, preset, { onProgress });
        return finish(result);
      } catch (error) {
        console.error('Cloudinary upload error:', error);
        this.hidePhotoUploadProgress?.();
        return { ok: false, error: error.message || 'Ошибка загрузки в Cloudinary' };
      }
    }

    this.hidePhotoUploadProgress?.();
    return {
      ok: false,
      error: 'Нет рабочего хранилища фото. Настройте Yandex (scripts/setup-yandex-storage.ps1) или ImgBB API Key.'
    };
  },

  // ─── Thumbnail (превью для витрины) ───────────────────────────────────────
  /**
   * Генерирует Blob-превью WebP max 480px / 0.82 из локального File-объекта.
   * Работает без CORS — читает с локального File напрямую через canvas.
   * @param {File} file
   * @param {number} maxWidth
   * @param {number} quality
   * @returns {Promise<Blob|null>}
   */
  generateThumbBlob(file, maxWidth = 480, quality = 0.82) {
    return new Promise((resolve) => {
      if (!file || !file.type?.startsWith('image/')) { resolve(null); return; }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob || null), 'image/webp', quality);
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  },

  /**
   * Генерирует WebP-превью из File-объекта и загружает как products-thumb/<uuid>.webp.
   * Возвращает публичный URL превью или null при ошибке/отсутствии хранилища.
   * @param {File} file
   * @returns {Promise<string|null>}
   */
  async generateAndUploadThumb(file) {
    const blob = await this.generateThumbBlob(file);
    if (!blob) return null;
    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2));
    const thumbFile = new File([blob], `${uuid}.webp`, { type: 'image/webp' });
    try {
      const formData = new FormData();
      formData.append('file', thumbFile);
      const res = await fetch(`${this.workerUrl}/api/upload/thumb`, {
        method: 'POST',
        headers: this.authHeaders(),
        body: formData
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result?.ok && result.url) return result.url;
      console.warn('[thumb] upload returned:', result);
    } catch (e) {
      console.warn('[thumb] upload error:', e);
    }
    return null;
  },

  // Пережимает фото в браузере (canvas). 1400px / 0.88 — резко лучше текст на коробках,
  // при этом файл обычно 200–400 КБ (хватает и для Yandex, и для ImgBB).
  compressImageFile(file, maxWidth = 1400, quality = 0.88) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        resolve(file);
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            // Если сжатая версия почему-то больше оригинала — берём оригинал.
            if (blob.size >= file.size) { resolve(file); return; }
            const name = (file.name || 'photo').replace(/\.[a-zA-Z0-9]+$/, '') + '.jpg';
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          }, 'image/jpeg', quality);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  },

  // === Form Data Collection ===
  collectFormData() {
    const tags = [];
    document.querySelectorAll('#tags-for-who input:checked, #tags-occasion input:checked, #tags-dates input:checked, #tags-type input:checked')
      .forEach(cb => tags.push(cb.value));

    const titleValue = document.getElementById('product-title').value.trim();
    const unit = this.isUnitBalloonMode?.() || false;
    let holidayOnly = null;
    let composition = unit
      ? []
      : (() => {
          const raw = document.getElementById('product-composition').value;
          const meta = this.parseCompositionHolidayMeta?.(raw) || {
            cleanText: raw, holiday: null, hints: [], digitCount: 0
          };
          holidayOnly = meta.holiday || null;
          this.currentProduct = this.currentProduct || {};
          if (meta.hints?.length) {
            const prev = this.currentProduct.composition_hints || [];
            this.currentProduct.composition_hints = [...new Set([...prev, ...meta.hints])];
          }
          if (meta.digitCount > 0) {
            this.currentProduct.digit_from_marker = meta.digitCount;
          }
          if (!holidayOnly) {
            holidayOnly = this.holidayFromHints?.(this.currentProduct.composition_hints) || null;
          }
          if (holidayOnly && !document.getElementById('product-category')?.value) {
            this.applyHolidayOnlyMode?.(holidayOnly);
          }
          return String(meta.cleanText || '')
            .split('\n').filter((l) => l.trim()).map((l) => l.trim());
        })();
    if (!holidayOnly) holidayOnly = this.currentProduct?.holiday_only || null;

    let shortDesc = document.getElementById('product-short-desc').value.trim();
    if (unit && !shortDesc && titleValue) shortDesc = titleValue.slice(0, 110);

    let category = document.getElementById('product-category').value || (unit ? 'Шары поштучно' : '');
    const scene = unit ? 'unit_balloon' : (this.currentProduct.scene || 'floor');
    if (unit && !tags.includes('Шары поштучно')) tags.push('Шары поштучно');

    // Перед сохранением ещё раз синкнем опции (стена/напольные/фотозона)
    if (!unit) this.syncAdvanceOrderFromScene?.();

    const compText = Array.isArray(composition) ? composition.join('\n') : String(composition || '');
    const isSurprise = !unit && scene === 'surprise';
    const isBox = !unit && !holidayOnly && !isSurprise && (
      category === 'Коробка-сюрприз'
      || this.compositionLooksLikeSurpriseBox?.(compText)
    );
    const typeNames = (typeof TAGS !== 'undefined' && TAGS.type) || [];
    const otherTypeTag = tags.some((t) => typeNames.includes(t) && t !== 'Цветы из шаров');
    const flowersExplicit = category === 'Цветы из шаров' || tags.includes('Цветы из шаров');
    const keepOperatorChoice = !unit && (!!this.currentProduct?.id || !!String(category || '').trim());
    const isBalloonFlowers = !keepOperatorChoice && !unit && !holidayOnly && !isBox && !otherTypeTag && (
      flowersExplicit || (this.getBouquetType?.() === 'flowers' && !category)
    );
    const isBouquet = !unit && !holidayOnly && !isBox && !isBalloonFlowers && (
      scene === 'handheld_bouquet'
      || category === 'Букет из шаров'
      || this.compositionLooksLikeBouquet?.(compText)
    );
    const isFigures = !unit && !holidayOnly && !isBox && (
      scene === 'balloon_figures'
      || category === 'Фигуры из шаров'
      || this.compositionLooksLikeBalloonFigure?.(compText)
    );
    const isPhotozone = !unit && !isBox && (
      scene === 'photozone'
      || category === 'Фотозона'
      || tags.includes('Фотозона')
      || this.compositionLooksLikePhotozone?.(compText)
      || !!this.compositionPhotozoneType?.(compText)
    );
    const isFloorSave = !unit && !isBox && (
      scene === 'floor'
      || category === 'Напольные композиции'
    );
    const pzType = isPhotozone ? (this.getPhotozoneType?.() || 'frame') : null;
    const pzMeta = pzType && typeof PHOTOZONE_TYPES !== 'undefined' ? PHOTOZONE_TYPES[pzType] : null;
    const floorType = isFloorSave ? (this.getFloorType?.() || '') : null;
    const rentalChecked = !unit && (document.getElementById('opt-rental')?.checked || false);
    const rentalItem = (document.getElementById('rental-item')?.value || '').trim()
      || pzMeta?.rental_item
      || '';

    const clientOptions = unit ? {
      available_on_request: false,
      advance_order_1_2_days: false,
      number_choice: false,
      personal_inscription: false,
      photozone_rental: false
    } : {
      available_on_request: false,
      advance_order_1_2_days: document.getElementById('opt-advance')?.checked || false,
      number_choice: document.getElementById('opt-number')?.checked || false,
      personal_inscription: document.getElementById('opt-inscription')?.checked || false,
      photozone_rental: rentalChecked
    };

    // Исходник Studio Pro — чтобы после закрытия карточки можно было пересоздать Master
    const studioOrig = String(
      this.studioSourceUrl
      || this.studioCompare?.original
      || this.currentProduct?.client_options?.studio_original_url
      || ''
    ).trim();
    if (/^https?:\/\//i.test(studioOrig)) {
      clientOptions.studio_original_url = studioOrig;
    }
    const photoHash = this.validPhotoDhash?.(
      this._pendingPhotoDhash || this.photoClientOptions(this.currentProduct).photo_dhash
    );
    if (photoHash && (clientOptions.studio_original_url || this.currentProduct?.photos?.some((p) => p?.file))) {
      clientOptions.photo_dhash = photoHash;
    }

    if (isPhotozone && pzType) {
      clientOptions.photozone_type = pzType;
    }
    if (isFloorSave && floorType) {
      clientOptions.floor_type = floorType;
    }
    if ((category === 'Цветы из шаров' || tags.includes('Цветы из шаров')) && !otherTypeTag) {
      clientOptions.bouquet_type = 'flowers';
    }
    if (scene === 'surprise') {
      clientOptions.surprise_pose = this.getSurprisePose?.() === 'hang' ? 'hang' : 'stand';
      if (clientOptions.surprise_pose !== 'hang' && this.surpriseMoneyOn?.()) clientOptions.surprise_money = true;
    }
    if (unit) {
      const unitType = this.getUnitBalloonType?.() || '';
      const unitMeta = (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[unitType]) || null;
      if (unitMeta) {
        clientOptions.unit_type = unitType;
        if (unitMeta.hasSize) {
          const raw = (document.getElementById('unit-balloon-size')?.value || '').replace(/[^\d.,]/g, '').replace(',', '.');
          const cm = raw ? String(Math.round(parseFloat(raw))) : '';
          if (cm && cm !== 'NaN') clientOptions.balloon_size = `${cm} см`;
        }
        if (unitMeta.hasInk) {
          const ink = this.getLetterInk?.() || '';
          if (ink === 'light' || ink === 'dark') clientOptions.letter_ink = ink;
        }
        const whoList = this.getUnitBalloonWhoList?.() || [];
        if (whoList.length) clientOptions.unit_who = whoList;
        if (unitMeta.hasHoliday) {
          const unitHoliday = this.getUnitHoliday?.() || '';
          if (unitHoliday) clientOptions.unit_holiday = unitHoliday;
        }
        if (unitMeta.hasDigit) clientOptions.number_choice = true;
      }
    }
    if (rentalChecked) {
      clientOptions.rental = {
        enabled: true,
        item: rentalItem || 'Элемент фотозоны',
        days: typeof PHOTOZONE_RENTAL_DAYS !== 'undefined' ? PHOTOZONE_RENTAL_DAYS : 3,
        keep_price_delta: typeof PHOTOZONE_RENTAL_EXTRA_PER_DAY !== 'undefined' ? PHOTOZONE_RENTAL_EXTRA_PER_DAY : 500
      };
    }

    if ((category === '1 годик' || holidayOnly === '1 годик') && !isPhotozone) {
      clientOptions.number_choice = false;
      delete clientOptions.digit_choice;
    } else if (clientOptions.number_choice) {
      const fromComp = this.compositionDigitCount?.(compText) || 0;
      const unitDigit = unit && this.getUnitBalloonType?.() === 'digit';
      const count = unitDigit ? 1 : Math.min(2, Math.max(1, fromComp || 1));
      clientOptions.digit_choice = {
        enabled: true,
        count_on_photo: count
      };
    }

    // Тематика/повод может соседствовать с типом «Фотозона»; коробка/букет/фигуры — по-прежнему XOR
    let finalTags = [...tags];
    const occasionShelf = !unit && !holidayOnly && !isBox && !isBouquet && !isBalloonFlowers && !isFigures
      && (typeof OCCASION_SHELVES !== 'undefined' ? OCCASION_SHELVES.includes(category) : false);
    if (!keepOperatorChoice) {
      if (isSurprise) {
        category = 'Шар-сюрприз';
        finalTags = ['Шар-сюрприз'];
      } else if (holidayOnly && !unit) {
        category = holidayOnly;
        finalTags = [holidayOnly];
        if (isPhotozone && !finalTags.includes('Фотозона')) finalTags.push('Фотозона');
      } else if (isBox) {
        category = 'Коробка-сюрприз';
        finalTags = ['Коробка-сюрприз'];
      } else if (isBalloonFlowers) {
        category = 'Цветы из шаров';
        finalTags = ['Цветы из шаров'];
      } else if (isBouquet) {
        category = 'Букет из шаров';
        finalTags = ['Букет из шаров'];
      } else if (isFigures) {
        category = 'Фигуры из шаров';
        finalTags = ['Фигуры из шаров'];
      } else if (occasionShelf) {
        const forWho = (typeof TAGS !== 'undefined' && TAGS.forWho) || [];
        const audience = tags.filter((t) => forWho.includes(t) && t !== category);
        finalTags = [category, ...audience];
        if (isPhotozone && !finalTags.includes('Фотозона')) finalTags.push('Фотозона');
      } else if (isPhotozone) {
        category = 'Фотозона';
        finalTags = ['Фотозона'];
      } else if (!unit && scene === 'balloon_figures' && !finalTags.includes('Фигуры из шаров')) {
        finalTags.push('Фигуры из шаров');
      }
    }

    const deferred = (typeof DEFERRED_TYPE_TAGS !== 'undefined' && DEFERRED_TYPE_TAGS) || ['Шар-сюрприз'];
    finalTags = finalTags.filter((t) => !deferred.includes(t));
    if (category === 'Арка из шаров' || finalTags.includes('Арка из шаров')) {
      if (!finalTags.includes('Арка из шаров')) finalTags.push('Арка из шаров');
      if (!finalTags.includes('Цена за метр')) finalTags.push('Цена за метр');
    }
    if (scene === 'wall_only' || scene === 'unit_balloon') {
      finalTags = finalTags.filter((t) => t !== 'Напольные композиции');
    }
    if (unit) {
      const unitType = this.getUnitBalloonType?.() || '';
      const unitMeta = (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[unitType]) || null;
      const shelfTags = (typeof UNIT_BALLOON_TYPES !== 'undefined')
        ? Object.values(UNIT_BALLOON_TYPES).map((t) => t.tag).filter(Boolean)
        : [];
      finalTags = finalTags.filter((t) => !shelfTags.includes(t));
      if (!finalTags.includes('Шары поштучно')) finalTags.push('Шары поштучно');
      if (unitMeta?.tag) finalTags.push(unitMeta.tag);
      (this.getUnitBalloonWhoList?.() || []).forEach((who) => {
        if (who && !finalTags.includes(who)) finalTags.push(who);
      });
      const unitHoliday = (unitMeta?.hasHoliday || !unitType) ? (this.getUnitHoliday?.() || '') : '';
      if (unitHoliday) {
        category = unitHoliday;
        if (!finalTags.includes(unitHoliday)) finalTags.push(unitHoliday);
        clientOptions.unit_holiday = unitHoliday;
      }
    }
    if (deferred.includes(category)) category = finalTags[0] || '';

    if (!unit && !document.getElementById('product-age')?.value && category !== 'Юбилей' && (holidayOnly || occasionShelf || this.isOccasionShelf?.(category))) {
      this.applyAgeFromCategory?.(category || holidayOnly);
    }
    const ageVal = unit
      ? 'Для любого возраста'
      : (document.getElementById('product-age')?.value
        || this.ageFromCategory?.(category || holidayOnly)
        || 'Для любого возраста');

    return {
      id: this.currentProduct.id || undefined,
      title: titleValue,
      article: document.getElementById('product-article').value.trim() || this.nextArticle(category),
      price: parseInt(document.getElementById('product-price').value) || 0,
      short_description: shortDesc,
      full_description: unit ? '' : document.getElementById('product-full-desc').value.trim(),
      composition: composition,
      category: category || (isPhotozone ? 'Фотозона' : category),
      character: document.getElementById('product-character')?.value.trim() || null,
      age_group: ageVal,
      budget: unit ? null : (document.getElementById('product-budget')?.value.trim() || null),
      series_name: document.getElementById('product-series')?.value.trim() || null,
      occasion: null,
      target_audience: null,
      seo_title: unit ? '' : document.getElementById('product-seo-title').value.trim(),
      seo_description: unit ? '' : document.getElementById('product-seo-desc').value.trim(),
      slug: document.getElementById('product-slug').value.trim() || this.slugify(titleValue),
      scene,
      tags: finalTags,
      client_options: clientOptions,
      photos: this.currentProduct.photos.map(p => p.url),
      main_photo: this.currentProduct.photos[0]?.url || null,
      thumb_photo: this.currentProduct.thumb_photo || null,
      show_on_site: unit ? true : (document.getElementById('show-on-site')?.checked || false)
    };
  },

  /** Новая карточка: категория, сцена и подтипы как при первой загрузке страницы. */
  clearNewCardSceneState() {
    const cat = document.getElementById('product-category');
    if (cat) cat.value = '';
    if (this.currentProduct) {
      this.currentProduct.scene = 'auto';
      this.currentProduct.holiday_only = '';
      this.currentProduct.client_options = {};
    }
    const sceneSelect = document.getElementById('scene-select');
    if (sceneSelect) sceneSelect.value = 'auto';
    this.setPhotozoneType?.('frame');
    this.setFloorType?.('');
    this.setBouquetType?.('');
    this.setSurprisePose?.('stand');
    this.setSurpriseMoney?.(false);
    this.setUnitBalloonType?.('');
    this.setUnitBalloonWho?.('');
    this.setLetterInk?.('');
    this.setUnitHoliday?.('');
    const unitSizeEl = document.getElementById('unit-balloon-size');
    if (unitSizeEl) unitSizeEl.value = '';
    const rentalItemEl = document.getElementById('rental-item');
    if (rentalItemEl) {
      rentalItemEl.value = '';
      rentalItemEl.dataset.autoFill = '1';
    }
    const form = document.getElementById('product-form');
    if (form) form.classList.remove('is-unit-balloon');
    this.syncSceneRailUi?.('auto');
    this.syncStudioModeHint?.();
  },

  resetForm(opts = {}) {
    const preserveStudioDraft = !!opts.preserveStudioDraft;
    this._resettingForm = true;
    try {
    this.currentProduct = { photos: [], scene: 'auto', tags: [], client_options: {} };
    this._publishGapsAck = false;
    this.resetStudioDraftKey?.();
    if (!preserveStudioDraft) this.clearActiveStudioDraft?.();
    this.studioCutoutDataUrl = null;
    this.studioPlacement = null;
    this.studioCompare = { original: null, master: null };
    this.studioSourceUrl = null;
    this.studioMasterDataUrl = null;
    this.studioMasterBaseUrl = null;
    this.studioMasterBackupUrl = null;
    if (typeof this.hideCropEditor === 'function') this.hideCropEditor();
    if (typeof this.hidePlacementEditor === 'function') this.hidePlacementEditor(true);
    if (typeof this.renderStudioCompare === 'function') this.renderStudioCompare();
    this.hideSourceWorkPreview?.();

    const form = document.getElementById('product-form');
    if (form) {
      form.reset();
      form.classList.remove('is-studio-busy', 'is-editor-step-2', 'is-step1-b', 'is-step1-c', 'has-ai-card', 'is-ai-review-detail');
      form.classList.add('is-editor-step-1', 'is-step1-a');
    }
    this._step1Phase = 'a';
    this._step1PhotoCount = 0;
    this._pendingPhotoDhash = '';
    this._photoDupSig = '';
    this._aiCardFilled = false;
    this._lastAiCardData = null;
    this.resetAiAutoFillState?.();
    this.resetUnitCharacterDetectState?.();
    this.closeAiReviewOverlay?.({ skipSync: true });
    const alts = document.getElementById('title-alts');
    if (alts) { alts.classList.add('hidden'); alts.innerHTML = ''; }
    ['character-alts', 'series-alts'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
    });

    const sceneSelect = document.getElementById('scene-select');
    if (sceneSelect) sceneSelect.value = 'auto';
    this.syncSceneRailUi?.('auto');

    const articleEl = document.getElementById('product-article');
    if (articleEl) {
      if (typeof this.assignFreshArticle === 'function') this.assignFreshArticle();
      else articleEl.value = this.nextArticle();
    }

    const modeLabel = document.getElementById('editor-mode-label');
    if (modeLabel) modeLabel.textContent = 'СОЗДАНИЕ';
    const titleEl = document.getElementById('editor-title');
    if (titleEl) titleEl.textContent = 'Новый товар';

    this.renderPhotos();
    this.refreshStudioCheckpointUi?.();
    this.syncAIFillGate?.();
    this.syncEditorSteps?.();
    this.syncStep1WizardUi?.();
    this.wirePhotozoneTypeControls?.();
    this.wireFloorTypeControls?.();
    this.wireBouquetTypeControls?.();
    this.wireSurprisePoseControls?.();
    this.wireUnitBalloonTypeControls?.();
    this.clearNewCardSceneState?.();
    this.syncRequiredFieldHighlights?.();
    this.updateEditorAutosaveHint?.('');
    } finally {
      this._resettingForm = false;
    }
  }
});

// === Bulk Thumb Generation ===
Object.assign(app, {

  // ─── Показать прогресс-оверлей ────────────────────────────────────────────
  showThumbGenProgress(done, total, currentName) {
    const overlay = document.getElementById('bulk-thumb-overlay');
    if (overlay) { overlay.classList.remove('hidden'); overlay.hidden = false; }
    this.updateThumbGenProgress(done, total, currentName);
  },

  updateThumbGenProgress(done, total, currentName) {
    const fill = document.getElementById('bulk-thumb-fill');
    const status = document.getElementById('bulk-thumb-status');
    const current = document.getElementById('bulk-thumb-current');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (fill) fill.style.width = `${pct}%`;
    const n = total;
    const suffix = n === 1 ? 'а' : (n < 5 ? 'ов' : 'ов');
    if (status) status.textContent = `Обработано ${done} из ${n} товар${suffix}`;
    if (current) current.textContent = currentName || '';
  },

  hideThumbGenProgress() {
    const overlay = document.getElementById('bulk-thumb-overlay');
    if (overlay) { overlay.classList.add('hidden'); overlay.hidden = true; }
  },

  abortBulkThumbs() {
    if (!this._bulkThumbRunning) { this.hideThumbGenProgress(); return; }
    this._bulkThumbAbort = true;
    const current = document.getElementById('bulk-thumb-current');
    if (current) current.textContent = 'Прерываю после текущего товара…';
  },

  // ─── Пакетная генерация превью ────────────────────────────────────────────
  async bulkGenerateThumbs() {
    if (this._bulkThumbRunning) {
      this.toast('Оптимизация уже идёт', 'info');
      return;
    }
    if (!this.workerUrl) {
      this.toast('Настройте Worker URL во вкладке «Настройки»', 'error');
      return;
    }

    // Подбираем товары без thumb_photo, у которых есть фото-URL
    const getMainUrl = (p) =>
      p.main_photo
      || (Array.isArray(p.photos) && (
        typeof p.photos[0] === 'string' ? p.photos[0] : p.photos[0]?.url
      ))
      || '';

    const toProcess = this.products.filter((p) => !p.thumb_photo && !!getMainUrl(p));

    if (!toProcess.length) {
      this.toast('У всех товаров с фото уже есть превью 👍', 'info');
      return;
    }

    const n = toProcess.length;
    const approxSec = Math.ceil(n * 0.6);
    const confirmed = confirm(
      `Сгенерировать WebP-превью (480px) для ${n} товар${n === 1 ? 'а' : 'ов'} без превью?\n\n` +
      `• Скачивает оригинал по URL фото\n` +
      `• Сжимает через canvas → WebP 480px / 0.82\n` +
      `• Загружает как thumb_photo\n\n` +
      `Примерное время: ~${approxSec} сек. Если CORS заблокирован — товар пропускается.`
    );
    if (!confirmed) return;

    this._bulkThumbRunning = true;
    this._bulkThumbAbort = false;
    const btn = document.getElementById('bulk-thumb-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Идёт оптимизация…'; }

    this.showThumbGenProgress(0, n, '');

    let done = 0, success = 0, skipped = 0;

    for (const product of toProcess) {
      if (this._bulkThumbAbort) break;

      const mainUrl = getMainUrl(product);
      const label = (product.title || `#${product.id}`).slice(0, 48);
      this.updateThumbGenProgress(done, n, label);

      try {
        // 1. Скачиваем оригинал через прокси-воркер (обходим CORS Yandex/любого хранилища)
        let blob;
        try {
          const proxyRes = await fetch(`${this.workerUrl}/api/admin/proxy-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
            body: JSON.stringify({ url: mainUrl })
          });
          if (!proxyRes.ok) throw new Error(`Proxy HTTP ${proxyRes.status}`);
          blob = await proxyRes.blob();
        } catch (fetchErr) {
          console.warn(`[bulkThumb] пропуск ${product.id} — proxy failed:`, fetchErr.message);
          skipped++;
          done++;
          this.updateThumbGenProgress(done, n, '');
          continue;
        }

        // 2. Canvas → WebP 480px / 0.82
        const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
        const thumbBlob = await this.generateThumbBlob(file);
        if (!thumbBlob) {
          console.warn(`[bulkThumb] пропуск ${product.id} — generateThumbBlob вернул null`);
          skipped++;
          done++;
          this.updateThumbGenProgress(done, n, '');
          continue;
        }

        // 3. Загружаем превью на /api/upload/thumb
        const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : (Date.now().toString(36) + Math.random().toString(36).slice(2));
        const thumbFile = new File([thumbBlob], `${uuid}.webp`, { type: 'image/webp' });
        const formData = new FormData();
        formData.append('file', thumbFile);

        const upRes = await fetch(`${this.workerUrl}/api/upload/thumb`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: formData
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok || !upData.ok || !upData.url) {
          throw new Error(upData.error || `Upload failed: HTTP ${upRes.status}`);
        }

        // 4. Сохраняем thumb_photo в товаре через PUT
        const putRes = await fetch(`${this.workerUrl}/api/products/${product.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
          body: JSON.stringify({ thumb_photo: upData.url })
        });
        const putData = await putRes.json().catch(() => ({}));
        if (!putRes.ok || !putData.ok) {
          throw new Error(putData.error || `PUT failed: HTTP ${putRes.status}`);
        }

        // 5. Обновляем локальный кеш
        const local = this.products.find((p) => String(p.id) === String(product.id));
        if (local) local.thumb_photo = upData.url;

        success++;
      } catch (err) {
        console.warn(`[bulkThumb] ошибка для ${product.id}:`, err);
        skipped++;
      }

      done++;
      this.updateThumbGenProgress(done, n, '');

      // Небольшая пауза, чтобы не перегружать сеть и Worker
      if (!this._bulkThumbAbort) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    this._bulkThumbRunning = false;
    this.hideThumbGenProgress();
    if (btn) { btn.disabled = false; btn.textContent = '🖼 Оптимизировать фото'; }

    const aborted = this._bulkThumbAbort;
    const msg = aborted
      ? `Прервано. Готово: ${success}, пропущено: ${skipped}`
      : skipped === 0
        ? `Готово! Превью сгенерированы для ${success} товар${success === 1 ? 'а' : 'ов'} 🎉`
        : `Готово: ${success} превью. Пропущено (CORS/ошибка): ${skipped}`;
    this.toast(msg, success > 0 ? 'success' : 'info');

    if (success > 0) this.markStorefrontDirty('updated');
  },

});

// === Publish / Save — реализованы в admin.js (app.saveProduct, app.publishProduct, app.saveDraft) ===

app.editProduct = async function(id) {
  this.toast('Загрузка товара...', '');
  try {
    const res = await fetch(`${this.workerUrl}/api/products/${id}`);
    const data = await res.json();
    if (!data.ok || !data.product) throw new Error('Товар не найден');

    this.resetForm();
    this.loadProductToForm(data.product);
    this.switchTab('create');

    const modeLabel = document.getElementById('editor-mode-label');
    if (modeLabel) modeLabel.textContent = 'РЕДАКТИРОВАНИЕ';
    const titleEl = document.getElementById('editor-title');
    if (titleEl) titleEl.textContent = data.product.title || 'Товар';
    this.toast('Товар загружен для редактирования', 'success');
    this.focusAuditField?.();
  } catch (e) { this.toast('Ошибка: ' + e.message, 'error'); }
};

// === Load Product to Form ===
app.loadProductToForm = function(product) {
  this.resetStudioDraftKey?.();
  this.studioCutoutDataUrl = null;
  this.studioPlacement = null;
  this.studioCompare = { original: null, master: null };
  this.studioSourceUrl = null;
  if (typeof this.hidePlacementEditor === 'function') this.hidePlacementEditor(true);
  if (typeof this.hideCropEditor === 'function') this.hideCropEditor();
  if (typeof this.renderStudioCompare === 'function') this.renderStudioCompare();

  this.currentProduct.id = product.id || null;
  this.currentProduct.client_options = product.client_options && typeof product.client_options === 'object'
    ? { ...product.client_options }
    : {};
  this.currentProduct.thumb_photo = product.thumb_photo || null;

  // Фото
  this.currentProduct.photos = (product.photos || []).map((url, i) => ({
    id: Date.now() + Math.random(),
    url: url,
    uploaded: true,
    type: i === 0 ? 'master' : undefined
  }));
  this.renderPhotos();

  // Сцена + Studio Pro: восстановить оригинал для «Пересоздать Master»
  this.currentProduct.scene = product.scene || 'auto';
  const sceneSelect = document.getElementById('scene-select');
  if (sceneSelect) sceneSelect.value = this.currentProduct.scene;
  this.syncSceneRailUi?.(this.currentProduct.scene);
  const studioOrig = this.currentProduct.client_options.studio_original_url || null;
  const masterUrl = this.currentProduct.photos[0]?.url || null;
  this.studioSourceUrl = studioOrig || masterUrl || null;
  this.studioMasterDataUrl = masterUrl;
  this.studioMasterBackupUrl = masterUrl;
  this.studioMasterBaseUrl = masterUrl;
  this.studioCompare = {
    original: studioOrig || masterUrl || null,
    master: masterUrl || null
  };
  this.renderStudioCompare?.();
  this.syncStudioModeHint?.();
  this.refreshStudioCheckpointUi?.();
  if (studioOrig || masterUrl) {
    this.showSignTextEditor?.();
  }

  // Основные данные
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  };
  set('product-title', product.title);
  set('product-article', product.article);
  set('product-price', product.price);
  set('product-short-desc', product.short_description);
  set('product-full-desc', product.full_description);
  set('product-composition', (product.composition || []).join('\n'));
  set('product-category', product.category);
  set('product-character', product.character);
  set('product-age', product.age_group);
  set('product-budget', product.budget);
  set('product-series', product.series_name);

  // SEO
  set('product-seo-title', product.seo_title);
  set('product-seo-desc', product.seo_description);
  set('product-slug', product.slug);

  // Теги
  const tags = product.tags || [];
  document.querySelectorAll('#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input')
    .forEach(cb => { cb.checked = tags.includes(cb.value); });

  // Опции клиента (новый flat + legacy nested)
  const opts = product.client_options || {};
  const opt = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  const nestedOn = (v) => !!(v === true || v === 1 || (v && typeof v === 'object' && v.enabled));
  opt('opt-advance', opts.advance_order_1_2_days || nestedOn(opts.advance_order));
  opt('opt-number', opts.number_choice || nestedOn(opts.digit_choice));
  opt('opt-inscription', opts.personal_inscription || nestedOn(opts.inscription));
  opt('opt-rental', opts.photozone_rental || nestedOn(opts.rental));
  opt('show-on-site', product.show_on_site);

  const rental = opts.rental && typeof opts.rental === 'object' ? opts.rental : {};
  const rentalItemEl = document.getElementById('rental-item');
  if (rentalItemEl) {
    rentalItemEl.value = rental.item || opts.rental_item || '';
    rentalItemEl.dataset.autoFill = rentalItemEl.value ? '0' : '1';
  }
  this.setPhotozoneType?.(opts.photozone_type || (String(rental.item || '').toLowerCase().includes('мольбер') ? 'easel' : 'frame'));
  const advanceWasOn = !!(opts.advance_order_1_2_days || nestedOn(opts.advance_order));
  const sceneNow = product.scene || '';
  let floorTypeSaved = '';
  if (opts.floor_type === 'air') floorTypeSaved = 'air';
  else if (opts.floor_type === 'helium') floorTypeSaved = '';
  else if (advanceWasOn && sceneNow === 'floor') floorTypeSaved = 'air';
  this.setFloorType?.(floorTypeSaved);
  const bouquetTypeSaved = product.category === 'Цветы из шаров' ? 'flowers' : '';
  this.setBouquetType?.(bouquetTypeSaved);
  const surprisePoseSaved = opts.surprise_pose === 'hang' ? 'hang' : 'stand';
  this.setSurprisePose?.(surprisePoseSaved);
  this.setSurpriseMoney?.(!!opts.surprise_money);
  this.setUnitBalloonType?.(this.inferUnitBalloonType?.(product) || '');
  this.setUnitBalloonWho?.(this.inferUnitBalloonWho?.(product) || '');
  const holidayList = (typeof UNIT_HOLIDAYS !== 'undefined' && UNIT_HOLIDAYS) || [];
  const savedHoliday = opts.unit_holiday || (holidayList.includes(product.category) ? product.category : '');
  this.setUnitHoliday?.(holidayList.includes(savedHoliday) ? savedHoliday : '');
  const unitSizeEl = document.getElementById('unit-balloon-size');
  if (unitSizeEl) unitSizeEl.value = opts.balloon_size || '';
  this.setLetterInk?.(opts.letter_ink === 'dark' || opts.letter_ink === 'light' ? opts.letter_ink : '');
  this.wirePhotozoneTypeControls?.();
  this.wireFloorTypeControls?.();
  this.wireBouquetTypeControls?.();
  this.wireUnitBalloonTypeControls?.();
  this.wireOccasionShelfControls?.();
  this.syncAIFillGate?.();
  this.syncUnitBalloonForm?.(false);
  this.syncAdvanceOrderFromScene?.();
  this.syncOccasionShelfFields?.();
  this.syncArchPriceLabel?.();
  this._publishGapsAck = false;
  this._aiCardFilled = true;
  this.syncEditorSteps?.();
  this.syncStep2AiCardUi?.();
  this.syncRequiredFieldHighlights?.();
  // При редактировании уважаем сохранённый текст аренды, если он был
  if (rentalItemEl && rental.item) {
    rentalItemEl.value = rental.item;
    rentalItemEl.dataset.autoFill = '0';
  }
};



