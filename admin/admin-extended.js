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
      this.syncAIFillGate?.();
      this.refreshSourceWorkPreview?.();
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
    this.toast('Черновик сохранён локально — можно продолжить из списка', 'info');
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

  // === Scene Selector (компактный select как в старой админке) ===
  setupSceneSelector() {
    const container = document.getElementById('scene-selector');
    if (!container) return;

    const current = this.currentProduct?.scene || 'auto';
    container.innerHTML = `
      <label class="scene-select-label">Сцена Studio Pro
        <select id="scene-select">
          ${SCENES.map(s => `<option value="${s.value}" ${s.value === current ? 'selected' : ''}>${s.title}</option>`).join('')}
        </select>
      </label>
    `;

    const select = container.querySelector('#scene-select');
    if (select) {
      select.addEventListener('change', () => {
        this.currentProduct.scene = select.value;
        this.syncStudioModeHint?.();
        this.syncUnitBalloonForm?.(true);
        this.syncAdvanceOrderFromScene?.();
        this.scheduleSaveActiveStudioDraft?.();
      });
    }
    this.syncUnitBalloonForm?.(false);
    this.wirePhotozoneTypeControls?.();
    this.wireFloorTypeControls?.();
    this.wireOccasionShelfControls?.();
    this.syncAdvanceOrderFromScene?.();
    this.syncOccasionShelfFields?.();
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
      // (цифра) | (1 цифра) | (2 цифры) | (цифры)
      if (/^(?:\d\s*)?цифр/.test(key) || /^две\s+цифр/.test(key) || /^одн[аоуы]\s+цифр/.test(key)) {
        if (/^2\b/.test(key) || /^две\b/.test(key) || /^цифры/.test(key)) digitCount = 2;
        else digitCount = digitCount === 2 ? 2 : 1;
      }
      const hit = this.matchHolidayCategory(raw);
      if (hit) holiday = hit;
      return ' ';
    })
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[,\s;]+|[,\s;]+$/gm, '')
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
      || c === 'Универсальные' || c === 'Геймерам' || c === 'Фотозона' || c === 'Коробка-сюрприз') {
      return 'Для детей';
    }
    if (c === 'Выпускной') return 'Для подростков';
    if (c === 'Для неё' || c === 'Для него' || c === 'Для мамы' || c === 'Юбилей'
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
    if (occasion) {
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
      // При ручном выборе полки-повода — только эта метка в доп. разделах
      const cat = document.getElementById('product-category')?.value || '';
      if (!cat) return;
      document.querySelectorAll('#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input')
        .forEach((cb) => { cb.checked = cb.value === cat; });
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
      this.currentProduct.composition_hints = hints;
    } else if (!String(before || '').trim()) {
      this.currentProduct.composition_hints = [];
      this.currentProduct.digit_from_marker = 0;
    }
    if (digitCount > 0) {
      this.currentProduct.digit_from_marker = digitCount;
    }
    if (holiday) {
      this.applyHolidayOnlyMode(holiday);
    } else if (hints.length) {
      // Новые скобки без тематики — сбросить holiday_only только если явно не тематика
      const stillTheme = (this.currentProduct.composition_hints || [])
        .some((h) => this.matchHolidayCategory?.(h));
      if (!stillTheme) this.currentProduct.holiday_only = '';
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
        || /(?:^|[^а-яa-z0-9])одн[аоуы]\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(t)) {
        fromText = 1;
      } else if (/(?:^|[^а-яa-z0-9])цифры(?:[^а-яa-z0-9]|$)/.test(t)) {
        fromText = 2;
      } else if (/(?:^|[^а-яa-z0-9])цифр[ауы](?:[^а-яa-z0-9]|$)/.test(t)
        || /фольг\w*\s+цифр/.test(t)) {
        fromText = 1;
      }
    }
    return Math.max(fromMarker, fromText);
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
      const isBouquet = scene === 'handheld_bouquet'
        || cat === 'Букет из шаров'
        || cat === 'Крафтовый букет'
        || cat === 'Цветы из шаров';
      const isPhotozone = scene === 'photozone' || cat === 'Фотозона';
      const isWallOnly = scene === 'wall_only';
      const isWallOrFloor = isFloor || isWallOnly || isFigures;
      const hasInscriptionInComp = this.compositionHasPersonalInscription(composition);
      const digitCount = this.compositionDigitCount(composition);
      const pzHintText = [composition, titleText, shortDesc, fullDesc].join(' ');
      const pzFromComp = this.compositionPhotozoneType(pzHintText);
      const floorFromComp = this.compositionFloorType(pzHintText);

      // Тип фотозоны из состава («на мольберте» / «на каркасе»)
      if (isPhotozone && pzFromComp) {
        this.setPhotozoneType?.(pzFromComp);
        const rentalItemEl = document.getElementById('rental-item');
        if (rentalItemEl) rentalItemEl.dataset.autoFill = '1';
      }

      // Тип напольной из состава («с воздухом» / «гелий»)
      if (isFloor && floorFromComp) {
        this.setFloorType?.(floorFromComp);
      }

      const pzType = this.getPhotozoneType?.() || 'frame';
      const pzMeta = (typeof PHOTOZONE_TYPES !== 'undefined' && PHOTOZONE_TYPES[pzType]) || null;
      const floorType = this.getFloorType?.() || 'air';
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
      if (floorBlock) floorBlock.classList.toggle('hidden', !isFloor);

      // Фигуры и букеты — заранее за 1–2 дня
      if ((isFigures || isBouquet) && advanceEl) advanceEl.checked = true;
      // Напольные: с воздухом — заранее; гелиевые — без галочки
      if (isFloor && advanceEl) {
        advanceEl.checked = floorMeta ? !!floorMeta.advance_order : floorType !== 'helium';
      }
      // Букеты — персональная надпись (текст на сердцах / по желанию клиента)
      if (isBouquet && inscriptionEl) inscriptionEl.checked = true;
      // В составе «… с надписью» / «коробка … с индивидуальной надписью» → «Персональная надпись»
      if (hasInscriptionInComp && inscriptionEl) inscriptionEl.checked = true;

      // В составе «1 цифра» / «2 цифры» → галочка «Выбор цифры».
      // Полка «1 годик» — исключение: цифра фиксированная, выбор клиенту не предлагаем.
      const isFirstBirthday = cat === '1 годик'
        || this.currentProduct?.holiday_only === '1 годик';
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
    return checked?.value || 'air';
  },

  setFloorType(type) {
    const value = (typeof FLOOR_TYPES !== 'undefined' && FLOOR_TYPES[type])
      ? type
      : (type === 'helium' ? 'helium' : 'air');
    document.querySelectorAll('input[name="floor-type"], input[name="floor-type-early"]').forEach((el) => {
      el.checked = el.value === value;
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
      const val = e?.target?.value || this.getFloorType();
      this.setFloorType(val);
      this.syncAdvanceOrderFromScene?.();
      this.syncStudioModeHint?.();
      this.scheduleSaveActiveStudioDraft?.();
    };
    document.querySelectorAll('input[name="floor-type"], input[name="floor-type-early"]').forEach((el) => {
      el.addEventListener('change', sync);
    });
  },

  // === Form Events ===
  setupFormEvents() {
    // ОТКЛЮЧЕНО: кнопка "Сгенерировать данные через ИИ" использует onclick="app.generateAIMetadata()"
    // из HTML (admin-ai.js). Раньше здесь же вешался ещё и addEventListener на generateAICard(),
    // из-за чего один клик отправлял ДВА запроса к ИИ одновременно (нарушение "1 карточка = 1 запрос").

    // const aiBtn = document.getElementById('generate-ai-btn');
    // if (aiBtn) aiBtn.addEventListener('click', () => this.generateAICard());

    // ОТКЛЮЧЕНО: теперь кнопка Studio Pro использует onclick="app.processStudioProNew()" из HTML

    // const studioBtn = document.getElementById('process-studio-btn');
    // if (studioBtn) studioBtn.addEventListener('click', () => this.processStudioPro());
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

  // === AI Generation ===
  async generateAICard() {
    if (this.currentProduct.photos.length === 0) { this.toast('Загрузите фото', 'error'); return; }
    
    const aiBtn = document.getElementById('generate-ai-btn');
    const statusEl = document.getElementById('ai-status');
    aiBtn.disabled = true;
    aiBtn.innerHTML = '<span class="spinner"></span> Генерация...';
    statusEl.textContent = 'Отправка запроса...';
    
    try {
      let imageUrl = this.currentProduct.photos[0].url;
      if (!this.currentProduct.photos[0].uploaded) {
        statusEl.textContent = 'Загрузка фото...';
        const uploadResult = await this.uploadPhoto(this.currentProduct.photos[0].file);
        if (uploadResult.ok) {
          imageUrl = uploadResult.url;
          this.currentProduct.photos[0].url = imageUrl;
          this.currentProduct.photos[0].uploaded = true;
        }
      }
      
      statusEl.textContent = 'Генерация через ИИ...';
      const res = await fetch(`${this.workerUrl}/api/ai/generate-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({
          image_url: imageUrl,
          scene: this.currentProduct.scene,
          price: document.getElementById('product-price').value || 0
        })
      });
      
      const data = await res.json();
      if (data.ok && data.card) {
        this.fillFormWithAIData(data.card);
        statusEl.textContent = '✓ Данные сгенерированы';
        this.toast('Карточка сгенерирована', 'success');
      } else throw new Error(data.error || 'Ошибка генерации');
    } catch (e) {
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка: ' + e.message, 'error');
    } finally {
      aiBtn.disabled = false;
      aiBtn.innerHTML = '🤖 Сгенерировать данные через ИИ';
    }
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
        this.currentProduct.composition_hints = meta.hints;
      }
      if (meta.digitCount > 0) {
        this.currentProduct.digit_from_marker = meta.digitCount;
      }
      if (meta.holiday) {
        this.currentProduct.holiday_only = meta.holiday;
      }
    }
    const holidayOnly = this.currentProduct?.holiday_only
      || this.matchHolidayCategory?.(card.category)
      || null;
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
      card.tags.forEach((tag) => {
        if (deferred.includes(tag)) return;
        // Праздник/тематика: в доп. разделах только она, без типов/аудитории
        if (holidayOnly && tag !== holidayOnly) return;
        if (holidayOnly && typeSet.has(tag)) return;
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
    } else if (this.isOccasionShelf?.(card.category)) {
      this.applyAgeFromCategory?.(card.category);
      this.syncOccasionShelfFields?.();
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

  async uploadPhoto(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${this.workerUrl}/api/upload/photo`, { method: 'POST', headers: this.authHeaders(), body: formData });
    return await res.json();
  },

  // === Form Data Collection ===
  collectFormData() {
    const tags = [];
    document.querySelectorAll('#tags-for-who input:checked, #tags-occasion input:checked, #tags-dates input:checked, #tags-type input:checked')
      .forEach(cb => tags.push(cb.value));

    const titleValue = document.getElementById('product-title').value.trim();
    const unit = this.isUnitBalloonMode?.() || false;
    let holidayOnly = null;
    const composition = unit
      ? []
      : (() => {
          const raw = document.getElementById('product-composition').value;
          const meta = this.parseCompositionHolidayMeta?.(raw) || {
            cleanText: raw, holiday: null, hints: [], digitCount: 0
          };
          holidayOnly = meta.holiday || null;
          this.currentProduct = this.currentProduct || {};
          if (meta.hints?.length) {
            this.currentProduct.composition_hints = meta.hints;
          }
          if (meta.digitCount > 0) {
            this.currentProduct.digit_from_marker = meta.digitCount;
          }
          if (meta.holiday) this.applyHolidayOnlyMode?.(meta.holiday);
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
    const isBouquet = !unit && !holidayOnly && !isBox && (
      scene === 'handheld_bouquet'
      || category === 'Букет из шаров'
      || this.compositionLooksLikeBouquet?.(compText)
    );
    const isFigures = !unit && !holidayOnly && !isBox && (
      scene === 'balloon_figures'
      || category === 'Фигуры из шаров'
      || this.compositionLooksLikeBalloonFigure?.(compText)
    );
    const isPhotozone = !unit && !holidayOnly && !isBox && (
      scene === 'photozone'
      || category === 'Фотозона'
    );
    const isFloorSave = !unit && !holidayOnly && !isBox && (
      scene === 'floor'
      || category === 'Напольные композиции'
    );
    const pzType = isPhotozone ? (this.getPhotozoneType?.() || 'frame') : null;
    const pzMeta = pzType && typeof PHOTOZONE_TYPES !== 'undefined' ? PHOTOZONE_TYPES[pzType] : null;
    const floorType = isFloorSave ? (this.getFloorType?.() || 'air') : null;
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
    if (rentalChecked) {
      clientOptions.rental = {
        enabled: true,
        item: rentalItem || 'Элемент фотозоны',
        days: typeof PHOTOZONE_RENTAL_DAYS !== 'undefined' ? PHOTOZONE_RENTAL_DAYS : 3,
        keep_price_delta: typeof PHOTOZONE_RENTAL_EXTRA_PER_DAY !== 'undefined' ? PHOTOZONE_RENTAL_EXTRA_PER_DAY : 500
      };
    }

    if (category === '1 годик' || holidayOnly === '1 годик') {
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

    // XOR: тематика из скобок ИЛИ один тип (коробка / букет / фигуры / фотозона) — не смешивать с аудиторией
    let finalTags = [...tags];
    const occasionShelf = !unit && !holidayOnly && !isBox && !isBouquet && !isFigures && !isPhotozone
      && (typeof OCCASION_SHELVES !== 'undefined' ? OCCASION_SHELVES.includes(category) : false);
    if (holidayOnly) {
      category = holidayOnly;
      finalTags = [holidayOnly];
    } else if (isBox) {
      category = 'Коробка-сюрприз';
      finalTags = ['Коробка-сюрприз'];
    } else if (isBouquet) {
      category = 'Букет из шаров';
      finalTags = ['Букет из шаров'];
    } else if (isFigures) {
      category = 'Фигуры из шаров';
      finalTags = ['Фигуры из шаров'];
    } else if (isPhotozone) {
      category = 'Фотозона';
      finalTags = ['Фотозона'];
    } else if (occasionShelf) {
      finalTags = [category];
    } else {
      if (isPhotozone && !finalTags.includes('Фотозона')) finalTags.push('Фотозона');
      if (!unit && scene === 'balloon_figures' && !finalTags.includes('Фигуры из шаров')) {
        finalTags.push('Фигуры из шаров');
      }
    }

    const deferred = (typeof DEFERRED_TYPE_TAGS !== 'undefined' && DEFERRED_TYPE_TAGS) || ['Шар-сюрприз'];
    finalTags = finalTags.filter((t) => !deferred.includes(t));
    if (deferred.includes(category)) category = finalTags[0] || '';

    const skipCharSeries = !!unit;
    if (!unit && (holidayOnly || occasionShelf || this.isOccasionShelf?.(category))) {
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
      character: skipCharSeries ? null : (document.getElementById('product-character')?.value.trim() || null),
      age_group: ageVal,
      budget: unit ? null : (document.getElementById('product-budget')?.value.trim() || null),
      series_name: skipCharSeries ? null : (document.getElementById('product-series')?.value.trim() || null),
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
      form.classList.remove('is-studio-busy', 'is-editor-step-2');
      form.classList.add('is-editor-step-1');
    }

    const alts = document.getElementById('title-alts');
    if (alts) { alts.classList.add('hidden'); alts.innerHTML = ''; }
    ['character-alts', 'series-alts'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
    });

    const sceneSelect = document.getElementById('scene-select');
    if (sceneSelect) sceneSelect.value = 'auto';

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
    this.setPhotozoneType?.('frame');
    this.setFloorType?.('air');
    const rentalItemEl = document.getElementById('rental-item');
    if (rentalItemEl) {
      rentalItemEl.value = '';
      rentalItemEl.dataset.autoFill = '1';
    }
    this.wirePhotozoneTypeControls?.();
    this.wireFloorTypeControls?.();
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
  const studioOrig = this.currentProduct.client_options.studio_original_url || null;
  const masterUrl = this.currentProduct.photos[0]?.url || null;
  this.studioSourceUrl = studioOrig || null;
  this.studioMasterDataUrl = masterUrl;
  this.studioMasterBackupUrl = masterUrl;
  this.studioMasterBaseUrl = masterUrl;
  this.studioCompare = {
    original: studioOrig || null,
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
  const floorTypeSaved = opts.floor_type === 'helium' || opts.floor_type === 'air'
    ? opts.floor_type
    : (advanceWasOn ? 'air' : 'helium');
  this.setFloorType?.(floorTypeSaved);
  this.wirePhotozoneTypeControls?.();
  this.wireFloorTypeControls?.();
  this.wireOccasionShelfControls?.();
  this.syncAIFillGate?.();
  this.syncUnitBalloonForm?.(false);
  this.syncAdvanceOrderFromScene?.();
  this.syncOccasionShelfFields?.();
  this._publishGapsAck = false;
  this.syncEditorSteps?.();
  this.syncRequiredFieldHighlights?.();
  // При редактировании уважаем сохранённый текст аренды, если он был
  if (rentalItemEl && rental.item) {
    rentalItemEl.value = rental.item;
    rentalItemEl.dataset.autoFill = '0';
  }
};

console.log('✓ VigSharm Admin Extended Functions loaded');


