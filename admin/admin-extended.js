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
    this.resetForm();
    this.switchTab('products');
  },

  setMainPhoto(index) {
    if (index !== 0) {
      const [photo] = this.currentProduct.photos.splice(index, 1);
      this.currentProduct.photos.unshift(photo);
      this.renderPhotos();
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
      });
    }
    this.syncUnitBalloonForm?.(false);
    this.wirePhotozoneTypeControls?.();
    this.syncAdvanceOrderFromScene?.();
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
    const list = (typeof HOLIDAY_CATEGORIES !== 'undefined' && HOLIDAY_CATEGORIES.length)
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
      'выпускной': 'Выпускной'
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
   * Метка праздника в скобках: «(1 сентября)», «(Новый год)».
   * В клиентский состав не входит — только категория/тег.
   */
  parseCompositionHolidayMeta(text) {
    const src = String(text || '');
    let holiday = null;
    const clean = src.replace(/\(([^)]{1,40})\)/g, (full, inner) => {
      const hit = this.matchHolidayCategory(inner);
      if (hit) {
        holiday = hit;
        return ' ';
      }
      return full;
    })
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[,\s;]+|[,\s;]+$/gm, '')
      .trim();
    return { holiday, cleanText: clean };
  },

  applyHolidayOnlyMode(holiday) {
    if (!holiday) return;
    const catEl = document.getElementById('product-category');
    if (catEl) catEl.value = holiday;

    // Доп. разделы: только тематика-праздник, без аудитории/повода/типа
    document.querySelectorAll('#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input')
      .forEach((cb) => { cb.checked = false; });
    const dateCb = document.querySelector(`#tags-dates input[value="${CSS.escape(holiday)}"]`);
    if (dateCb) dateCb.checked = true;

    const clearIds = ['product-character', 'product-age', 'product-occasion', 'product-audience', 'product-series'];
    clearIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this.renderCharacterAlts?.('', [], '');
    this.renderSeriesAlts?.('', [], '');
    this.currentProduct = this.currentProduct || {};
    this.currentProduct.holiday_only = holiday;
  },

  syncHolidayFromComposition() {
    const el = document.getElementById('product-composition');
    if (!el) return null;
    const { holiday, cleanText } = this.parseCompositionHolidayMeta(el.value);
    if (!holiday) {
      if (this.currentProduct) this.currentProduct.holiday_only = '';
      return null;
    }
    this.applyHolidayOnlyMode(holiday);
    // Убрать метку из поля состава, чтобы не ушла клиенту
    if (cleanText !== el.value.trim()) {
      const pos = el.selectionStart;
      el.value = cleanText;
      try { el.setSelectionRange(Math.min(pos, cleanText.length), Math.min(pos, cleanText.length)); } catch (_) { /* ignore */ }
    }
    return holiday;
  },

  /** Сколько фольгированных цифр в составе: 1 / 2 / 0 если не указано. */
  compositionDigitCount(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return 0;
    // «2 цифры», «2 фольгированные цифры», «две цифры»
    if (/(?:^|[^\d])2\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(t)
      || /(?:^|[^а-яa-z0-9])две\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(t)) {
      return 2;
    }
    // «1 цифра», «1 фольгированная цифра», «одна/одну цифру»
    if (/(?:^|[^\d])1\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(t)
      || /(?:^|[^а-яa-z0-9])одн[аоуы]\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(t)) {
      return 1;
    }
    // просто «цифры» (мн.ч. без числа) → две
    if (/(?:^|[^а-яa-z0-9])цифры(?:[^а-яa-z0-9]|$)/.test(t)) return 2;
    // «цифра» / «цифру» / «фольгированная цифра» без числа → одна
    if (/цифр[ауы]/.test(t)) return 1;
    return 0;
  },

  /** Тип фотозоны из состава/описания: easel | frame | null. */
  compositionPhotozoneType(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (!t) return null;
    if (/мольбер|полистирол|круг\s+на\s+мольбер/.test(t)) return 'easel';
    if (/каркас|кругл\w*\s+рам|рамк\w*\s+фотозон|обруч|hoop|frame/.test(t)) return 'frame';
    return null;
  },

  syncAdvanceOrderFromScene() {
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

    // Тип фотозоны из состава («на мольберте» / «на каркасе»)
    if (isPhotozone && pzFromComp) {
      this.setPhotozoneType?.(pzFromComp);
      const rentalItemEl = document.getElementById('rental-item');
      if (rentalItemEl) rentalItemEl.dataset.autoFill = '1';
    }

    const pzType = this.getPhotozoneType?.() || 'frame';
    const pzMeta = (typeof PHOTOZONE_TYPES !== 'undefined' && PHOTOZONE_TYPES[pzType]) || null;

    const advanceEl = document.getElementById('opt-advance');
    const inscriptionEl = document.getElementById('opt-inscription');
    const numberEl = document.getElementById('opt-number');
    const numberHint = document.getElementById('opt-number-hint');
    const rentalEl = document.getElementById('opt-rental');
    const rentalItemEl = document.getElementById('rental-item');
    const pzBlock = document.getElementById('photozone-type-block');

    if (pzBlock) pzBlock.classList.toggle('hidden', !isPhotozone);

    // Напольные, фигуры и букеты — заранее за 1–2 дня
    if ((isFloor || isFigures || isBouquet) && advanceEl) advanceEl.checked = true;
    // Букеты — персональная надпись (текст на сердцах / по желанию клиента)
    if (isBouquet && inscriptionEl) inscriptionEl.checked = true;
    // В составе «… с надписью» / «коробка … с индивидуальной надписью» → «Персональная надпись»
    if (hasInscriptionInComp && inscriptionEl) inscriptionEl.checked = true;

    // В составе «1 цифра» / «2 цифры» (любая сцена) → галочка «Выбор цифры»
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
        numberHint.textContent = 'Укажите в составе «1 цифра» или «2 цифры» — галочка поставится сама.';
      }
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
  },

  getPhotozoneType() {
    const checked = document.querySelector('input[name="photozone-type"]:checked');
    return checked?.value || 'frame';
  },

  setPhotozoneType(type) {
    const value = PHOTOZONE_TYPES[type] ? type : 'frame';
    const el = document.querySelector(`input[name="photozone-type"][value="${value}"]`);
    if (el) el.checked = true;
  },

  wirePhotozoneTypeControls() {
    if (this._photozoneTypeWired) return;
    this._photozoneTypeWired = true;
    document.querySelectorAll('input[name="photozone-type"]').forEach((el) => {
      el.addEventListener('change', () => {
        const rentalItemEl = document.getElementById('rental-item');
        if (rentalItemEl) rentalItemEl.dataset.autoFill = '1';
        this.syncAdvanceOrderFromScene?.();
        this.syncStudioModeHint?.();
      });
    });
    const rentalItemEl = document.getElementById('rental-item');
    if (rentalItemEl) {
      rentalItemEl.addEventListener('input', () => {
        rentalItemEl.dataset.autoFill = '0';
      });
    }
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
    this.renderTagGroup('tags-type', TAGS.type);
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
      const meta = this.parseCompositionHolidayMeta?.(comp) || { cleanText: comp, holiday: null };
      const el = document.getElementById('product-composition');
      if (el) el.value = meta.cleanText;
      if (meta.holiday) {
        this.currentProduct = this.currentProduct || {};
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
      card.tags.forEach((tag) => {
        // Праздник: в доп. разделах только тематика (сам праздник), без типов/аудитории
        if (holidayOnly && tag !== holidayOnly) return;
        if (holidayOnly && typeSet.has(tag)) return;
        const cb = document.querySelector(
          `#tags-for-who input[value="${CSS.escape(tag)}"], #tags-occasion input[value="${CSS.escape(tag)}"], #tags-dates input[value="${CSS.escape(tag)}"], #tags-type input[value="${CSS.escape(tag)}"]`
        ) || document.querySelector(`input[type="checkbox"][value="${CSS.escape(tag)}"]`);
        if (cb) cb.checked = true;
      });
    }

    if (card.character != null && !holidayOnly) {
      const el = document.getElementById('product-character');
      if (el) el.value = card.character || '';
    }
    if (card.age_group && !holidayOnly) {
      const el = document.getElementById('product-age');
      if (el) el.value = card.age_group;
    }
    if ('occasion' in card && !holidayOnly) {
      const el = document.getElementById('product-occasion');
      if (el) el.value = card.occasion || '';
    }
    if (card.target_audience && !holidayOnly) {
      const el = document.getElementById('product-audience');
      if (el) el.value = card.target_audience;
    }
    if (card.series_name != null && !holidayOnly) {
      const el = document.getElementById('product-series');
      if (el) el.value = card.series_name || '';
    }
    if (holidayOnly) this.applyHolidayOnlyMode(holidayOnly);
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
  },

  // === Studio Pro ===
  // Актуальная реализация — processStudioProNew() в admin-studio-pro.js (вызывается через
  // onclick="app.processStudioProNew()" из HTML). Старый цикл processStudioPro()/pollStudioStatus()
  // (обрабатывал фото по одному через /api/studio/process) был не задействован и удалён как мёртвый код.

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
    const composition = unit
      ? []
      : (() => {
          const raw = document.getElementById('product-composition').value;
          const meta = this.parseCompositionHolidayMeta?.(raw) || { cleanText: raw, holiday: null };
          if (meta.holiday) this.applyHolidayOnlyMode?.(meta.holiday);
          return String(meta.cleanText || '')
            .split('\n').filter((l) => l.trim()).map((l) => l.trim());
        })();

    let shortDesc = document.getElementById('product-short-desc').value.trim();
    if (unit && !shortDesc && titleValue) shortDesc = titleValue.slice(0, 110);

    const category = document.getElementById('product-category').value || (unit ? 'Шары поштучно' : '');
    const scene = unit ? 'unit_balloon' : (this.currentProduct.scene || 'floor');
    if (unit && !tags.includes('Шары поштучно')) tags.push('Шары поштучно');

    // Перед сохранением ещё раз синкнем опции (стена/напольные/фотозона)
    if (!unit) this.syncAdvanceOrderFromScene?.();

    const isPhotozone = !unit && (scene === 'photozone' || category === 'Фотозона');
    const pzType = isPhotozone ? (this.getPhotozoneType?.() || 'frame') : null;
    const pzMeta = pzType && typeof PHOTOZONE_TYPES !== 'undefined' ? PHOTOZONE_TYPES[pzType] : null;
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
      available_on_request: document.getElementById('opt-available')?.checked || false,
      advance_order_1_2_days: document.getElementById('opt-advance')?.checked || false,
      number_choice: document.getElementById('opt-number')?.checked || false,
      personal_inscription: document.getElementById('opt-inscription')?.checked || false,
      photozone_rental: rentalChecked
    };

    if (isPhotozone && pzType) {
      clientOptions.photozone_type = pzType;
    }
    if (rentalChecked) {
      clientOptions.rental = {
        enabled: true,
        item: rentalItem || 'Элемент фотозоны',
        days: typeof PHOTOZONE_RENTAL_DAYS !== 'undefined' ? PHOTOZONE_RENTAL_DAYS : 3,
        keep_price_delta: typeof PHOTOZONE_RENTAL_EXTRA_PER_DAY !== 'undefined' ? PHOTOZONE_RENTAL_EXTRA_PER_DAY : 500
      };
    }

    if (clientOptions.number_choice) {
      const fromComp = this.compositionDigitCount?.(
        Array.isArray(composition) ? composition.join('\n') : String(composition || '')
      ) || 0;
      const count = Math.min(2, Math.max(1, fromComp || 1));
      clientOptions.digit_choice = {
        enabled: true,
        count_on_photo: count
      };
    }

    if (isPhotozone && !tags.includes('Фотозона')) tags.push('Фотозона');
    if (!unit && scene === 'balloon_figures' && !tags.includes('Фигуры из шаров')) {
      tags.push('Фигуры из шаров');
    }

    return {
      id: this.currentProduct.id || undefined,
      title: titleValue,
      article: document.getElementById('product-article').value.trim() || this.nextArticle(category),
      price: parseInt(document.getElementById('product-price').value) || 0,
      short_description: shortDesc,
      full_description: unit ? '' : document.getElementById('product-full-desc').value.trim(),
      composition: composition,
      category: isPhotozone && !category ? 'Фотозона' : category,
      character: unit ? null : (document.getElementById('product-character')?.value.trim() || null),
      age_group: unit ? 'Для любого возраста' : (document.getElementById('product-age')?.value || 'Для любого возраста'),
      budget: unit ? null : (document.getElementById('product-budget')?.value.trim() || null),
      series_name: unit ? null : (document.getElementById('product-series')?.value.trim() || null),
      occasion: unit ? null : (document.getElementById('product-occasion')?.value.trim() || null),
      target_audience: unit ? null : (document.getElementById('product-audience')?.value.trim() || null),
      seo_title: unit ? '' : document.getElementById('product-seo-title').value.trim(),
      seo_description: unit ? '' : document.getElementById('product-seo-desc').value.trim(),
      slug: document.getElementById('product-slug').value.trim() || this.slugify(titleValue),
      scene,
      tags: tags,
      client_options: clientOptions,
      photos: this.currentProduct.photos.map(p => p.url),
      main_photo: this.currentProduct.photos[0]?.url || null,
      show_on_site: unit ? true : (document.getElementById('show-on-site')?.checked || false)
    };
  },

  resetForm() {
    this.currentProduct = { photos: [], scene: 'auto', tags: [], client_options: {} };
    this.resetStudioDraftKey?.();
    this.studioCutoutDataUrl = null;
    this.studioPlacement = null;
    this.studioCompare = { original: null, master: null };
    this.studioSourceUrl = null;
    if (typeof this.hideCropEditor === 'function') this.hideCropEditor();
    if (typeof this.hidePlacementEditor === 'function') this.hidePlacementEditor(true);
    if (typeof this.renderStudioCompare === 'function') this.renderStudioCompare();

    const form = document.getElementById('product-form');
    if (form) form.reset();

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
    this.setPhotozoneType?.('frame');
    const rentalItemEl = document.getElementById('rental-item');
    if (rentalItemEl) {
      rentalItemEl.value = '';
      rentalItemEl.dataset.autoFill = '1';
    }
    this.wirePhotozoneTypeControls?.();
    this.syncAdvanceOrderFromScene?.();
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

  // Фото
  this.currentProduct.photos = (product.photos || []).map(url => ({
    id: Date.now() + Math.random(),
    url: url,
    uploaded: true
  }));
  this.renderPhotos();

  // Сцена
  this.currentProduct.scene = product.scene || 'auto';
  const sceneSelect = document.getElementById('scene-select');
  if (sceneSelect) sceneSelect.value = this.currentProduct.scene;
  this.syncStudioModeHint?.();
  this.refreshStudioCheckpointUi?.();

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
  set('product-occasion', product.occasion);
  set('product-audience', product.target_audience);

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
  opt('opt-available', opts.available_on_request || nestedOn(opts.available_on_request));
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
  this.wirePhotozoneTypeControls?.();
  this.syncAIFillGate?.();
  this.syncUnitBalloonForm?.(false);
  this.syncAdvanceOrderFromScene?.();
  // При редактировании уважаем сохранённый текст аренды, если он был
  if (rentalItemEl && rental.item) {
    rentalItemEl.value = rental.item;
    rentalItemEl.dataset.autoFill = '0';
  }
};

console.log('✓ VigSharm Admin Extended Functions loaded');


