// VigSharm Admin - Extended Functions
// Добавляем дополнительные методы в app

Object.assign(app, {
  // === Photo Upload ===
  setupPhotoUpload() {
    const dropzone = document.getElementById('photo-dropzone');
    const input = document.getElementById('photo-input');
    if (!dropzone || !input) return;
    const zone = dropzone.querySelector('.upload-zone') || dropzone;

    zone.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.photo-item')) return;
      input.click();
    });
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', (e) => this.handlePhotoFiles(Array.from(e.target.files)));

    ['dragenter','dragover'].forEach(ev => {
      dropzone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); });
    });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('drag'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
      this.handlePhotoFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
    });
  },

  async handlePhotoFiles(files) {
    if (files.length === 0) return;
    const maxPhotos = 6;

    if (this._replaceMainPhotoOnce) {
      this._replaceMainPhotoOnce = false;
      const file = files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        this.toast('Файл слишком большой (макс. 10 МБ)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const next = {
          id: Date.now() + Math.random(),
          url: e.target.result,
          file,
          uploaded: false
        };
        if (!this.currentProduct.photos.length) this.currentProduct.photos = [next];
        else this.currentProduct.photos[0] = next;
        // Сброс Master — нужно пересоздать
        this.studioMasterDataUrl = null;
        this.studioMasterBackupUrl = null;
        this.studioMasterBaseUrl = null;
        this.studioCompare = { original: null, master: null };
        this.studioSourceUrl = null;
        this.renderStudioCompare?.();
        this.renderPhotos();
        this.goStep1Phase?.('a', { skipGate: true });
        this.toast('Главное фото заменено — выберите сцену и нажмите «Далее»', 'success');
      };
      reader.readAsDataURL(file);
      return;
    }

    const remainingSlots = maxPhotos - this.currentProduct.photos.length;
    if (remainingSlots === 0) { this.toast('Максимум 6 фото', 'error'); return; }
    
    for (const file of files.slice(0, remainingSlots)) {
      if (file.size > 10 * 1024 * 1024) { this.toast('Файл слишком большой (макс. 10 МБ)', 'error'); continue; }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.currentProduct.photos.push({
          id: Date.now() + Math.random(),
          url: e.target.result,
          file: file,
          uploaded: false
        });
        this.renderPhotos();
      };
      reader.readAsDataURL(file);
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
    this.currentProduct.photos.splice(index, 1);
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
    this.wireUnitBalloonTypeControls?.();
    this.wireOccasionShelfControls?.();
    this.syncAdvanceOrderFromScene?.();
    this.syncOccasionShelfFields?.();
  },

  setScene(value) {
    const scene = value || 'auto';
    if (!this.currentProduct) this.currentProduct = { photos: [], scene: 'auto', tags: [], client_options: {} };
    this.currentProduct.scene = scene;
    const select = document.getElementById('scene-select');
    if (select && select.value !== scene) select.value = scene;
    this.syncSceneRailUi?.(scene);
    this.syncStudioModeHint?.();
    this.syncUnitBalloonForm?.(true);
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

  setPhotozoneType(type) {
    const value = (typeof PHOTOZONE_TYPES !== 'undefined' && PHOTOZONE_TYPES[type]) ? type : (type === 'easel' ? 'easel' : 'frame');
    document.querySelectorAll('input[name="photozone-type"], input[name="photozone-type-early"]').forEach((el) => {
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

  getBouquetType() {
    const checked = document.querySelector('input[name="bouquet-type-early"]:checked');
    return checked?.value === 'flowers' ? 'flowers' : '';
  },

  setBouquetType(type) {
    const on = type === 'flowers';
    document.querySelectorAll('input[name="bouquet-type-early"]').forEach((el) => {
      el.checked = on && el.value === 'flowers';
    });
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

  setUnitBalloonType(type) {
    this.renderUnitWhoChips?.();
    const value = (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[type]) ? type : '';
    document.querySelectorAll('input[name="unit-balloon-type-early"]').forEach((el) => {
      el.checked = !!value && el.value === value;
    });
    const meta = UNIT_BALLOON_TYPES[value];
    const wrap = document.getElementById('unit-balloon-size-wrap');
    if (wrap) wrap.classList.toggle('hidden', !meta?.hasSize);
    if (!meta?.hasSize) {
      const sizeEl = document.getElementById('unit-balloon-size');
      if (sizeEl && !value) sizeEl.value = '';
    }
    const whoWrap = document.getElementById('unit-balloon-who-wrap');
    if (whoWrap) whoWrap.classList.toggle('hidden', !value);
    this.syncUnitCharacterWrap?.();
    this.scheduleUnitCharacterDetect?.();
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
    // Пока тип не выбран или print/foil — показываем; latex — скрываем
    wrap.classList.toggle('hidden', type === 'latex');
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
    const raw = Array.isArray(tag) ? tag : (tag ? [tag] : []);
    this.renderUnitWhoChips?.();
    const list = (typeof UNIT_WHO_PICKS !== 'undefined' && UNIT_WHO_PICKS) || [];
    const allowed = new Set(raw.filter((t) => list.some((x) => x.tag === t)));
    document.querySelectorAll('input[name="unit-balloon-who-early"]').forEach((el) => {
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
    if (hay.includes('Фольгированные фигуры')) return 'foil';
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
    if (holidayOnly) {
      this.applyHolidayOnlyMode(holidayOnly);
      this.ensurePhotozoneTagFromCard?.(card);
    } else if (this.isOccasionShelf?.(card.category)) {
      if (card.category !== 'Юбилей') this.applyAgeFromCategory?.(card.category);
      this.syncOccasionShelfFields?.();
      this.ensurePhotozoneTagFromCard?.(card);
    } else {
      const scene = this.currentProduct?.scene || '';
      const tags = Array.isArray(card.tags) ? card.tags : [];
      const compText = Array.isArray(card.composition)
        ? card.composition.join('\n')
        : String(card.composition || document.getElementById('product-composition')?.value || '');
      if (
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
          if (holidayOnly) this.applyHolidayOnlyMode?.(holidayOnly);
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
    const isBox = !unit && !holidayOnly && (
      category === 'Коробка-сюрприз'
      || this.compositionLooksLikeSurpriseBox?.(compText)
    );
    const isBalloonFlowers = !unit && !holidayOnly && !isBox && (
      this.getBouquetType?.() === 'flowers'
      || category === 'Цветы из шаров'
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

    if (isPhotozone && pzType) {
      clientOptions.photozone_type = pzType;
    }
    if (isFloorSave && floorType) {
      clientOptions.floor_type = floorType;
    }
    if (isBalloonFlowers || (scene === 'handheld_bouquet' && this.getBouquetType?.() === 'flowers')) {
      clientOptions.bouquet_type = 'flowers';
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
        const whoList = this.getUnitBalloonWhoList?.() || [];
        if (whoList.length) clientOptions.unit_who = whoList;
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
      const count = Math.min(2, Math.max(1, fromComp || 1));
      clientOptions.digit_choice = {
        enabled: true,
        count_on_photo: count
      };
    }

    // Тематика/повод может соседствовать с типом «Фотозона»; коробка/букет/фигуры — по-прежнему XOR
    let finalTags = [...tags];
    const occasionShelf = !unit && !holidayOnly && !isBox && !isBouquet && !isBalloonFlowers && !isFigures
      && (typeof OCCASION_SHELVES !== 'undefined' ? OCCASION_SHELVES.includes(category) : false);
    if (holidayOnly) {
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
    } else {
      if (!unit && scene === 'balloon_figures' && !finalTags.includes('Фигуры из шаров')) {
        finalTags.push('Фигуры из шаров');
      }
    }

    const deferred = (typeof DEFERRED_TYPE_TAGS !== 'undefined' && DEFERRED_TYPE_TAGS) || ['Шар-сюрприз'];
    finalTags = finalTags.filter((t) => !deferred.includes(t));
    if (scene === 'wall_only' || scene === 'unit_balloon') {
      finalTags = finalTags.filter((t) => t !== 'Напольные композиции');
    }
    if (unit) {
      const unitType = this.getUnitBalloonType?.() || '';
      const unitMeta = (typeof UNIT_BALLOON_TYPES !== 'undefined' && UNIT_BALLOON_TYPES[unitType]) || null;
      if (unitMeta?.tag && !finalTags.includes(unitMeta.tag)) finalTags.push(unitMeta.tag);
      (this.getUnitBalloonWhoList?.() || []).forEach((who) => {
        if (who && !finalTags.includes(who)) finalTags.push(who);
      });
    }
    if (deferred.includes(category)) category = finalTags[0] || '';

    if (!unit && category !== 'Юбилей' && (holidayOnly || occasionShelf || this.isOccasionShelf?.(category))) {
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
      show_on_site: unit ? true : (document.getElementById('show-on-site')?.checked || false)
    };
  },

  resetForm(opts = {}) {
    const preserveStudioDraft = !!opts.preserveStudioDraft;
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
    this.syncStudioModeHint?.();
    this.refreshStudioCheckpointUi?.();
    this.syncAIFillGate?.();
    this.syncUnitBalloonForm?.(false);
    this.syncEditorSteps?.();
    this.syncStep1WizardUi?.();
    this.setPhotozoneType?.('frame');
    this.setFloorType?.('');
    this.setBouquetType?.('');
    this.setUnitBalloonType?.('');
    this.setUnitBalloonWho?.('');
    const unitSizeEl = document.getElementById('unit-balloon-size');
    if (unitSizeEl) unitSizeEl.value = '';
    const rentalItemEl = document.getElementById('rental-item');
    if (rentalItemEl) {
      rentalItemEl.value = '';
      rentalItemEl.dataset.autoFill = '1';
    }
    this.wirePhotozoneTypeControls?.();
    this.wireFloorTypeControls?.();
    this.wireBouquetTypeControls?.();
    this.wireUnitBalloonTypeControls?.();
    this.syncAdvanceOrderFromScene?.();
    this.syncRequiredFieldHighlights?.();
    this.updateEditorAutosaveHint?.('');
  }
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
  const bouquetTypeSaved = (opts.bouquet_type === 'flowers'
    || product.category === 'Цветы из шаров'
    || (product.tags || []).includes('Цветы из шаров')) ? 'flowers' : '';
  this.setBouquetType?.(bouquetTypeSaved);
  this.setUnitBalloonType?.(this.inferUnitBalloonType?.(product) || '');
  this.setUnitBalloonWho?.(this.inferUnitBalloonWho?.(product) || '');
  const unitSizeEl = document.getElementById('unit-balloon-size');
  if (unitSizeEl) unitSizeEl.value = opts.balloon_size || '';
  this.wirePhotozoneTypeControls?.();
  this.wireFloorTypeControls?.();
  this.wireBouquetTypeControls?.();
  this.wireUnitBalloonTypeControls?.();
  this.wireOccasionShelfControls?.();
  this.syncAIFillGate?.();
  this.syncUnitBalloonForm?.(false);
  this.syncAdvanceOrderFromScene?.();
  this.syncOccasionShelfFields?.();
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



