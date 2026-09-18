// VigSharm Admin - AI Metadata Generation
// Кнопка доступна только после: фото + цена > 0 + состав

Object.assign(app, {
  normalizeTitleKey(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  titlesTooSimilar(a, b) {
    const na = this.normalizeTitleKey(a);
    const nb = this.normalizeTitleKey(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length <= nb.length ? nb : na;
    if (shorter.length >= 6 && longer.includes(shorter) && shorter.length / longer.length >= 0.55) {
      return true;
    }
    const wa = na.split(' ').filter((w) => w.length > 1);
    const wb = nb.split(' ').filter((w) => w.length > 1);
    if (!wa.length || !wb.length) return false;
    if (wa.length === 1 && wb.length === 1) return wa[0] === wb[0];
    const setB = new Set(wb);
    let inter = 0;
    for (const w of wa) if (setB.has(w)) inter++;
    const union = wa.length + wb.length - inter;
    if (union > 0 && inter / union >= 0.75 && inter >= 2) return true;
    if (wa.length === wb.length && inter === wa.length) return true;
    return false;
  },

  /** Названия других карточек (текущую при редактировании пропускаем). */
  getExistingCatalogTitles() {
    const currentId = this.currentProduct?.id;
    const seen = new Set();
    const out = [];
    for (const p of this.products || []) {
      if (currentId && p.id === currentId) continue;
      const t = String(p.title || '').trim();
      if (!t) continue;
      const key = this.normalizeTitleKey(t);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  },

  findSimilarCatalogTitle(title) {
    const t = String(title || '').trim();
    if (!t) return null;
    const currentId = this.currentProduct?.id;
    for (const p of this.products || []) {
      if (currentId && p.id === currentId) continue;
      if (this.titlesTooSimilar(t, p.title)) return p;
    }
    return null;
  },

  filterTitlesAgainstCatalog(primary, alts = []) {
    const taken = this.getExistingCatalogTitles();
    const pool = [primary, ...(alts || [])].map((t) => String(t || '').trim()).filter(Boolean);
    const free = [];
    for (const t of pool) {
      if (taken.some((ex) => this.titlesTooSimilar(t, ex))) continue;
      if (free.some((f) => this.titlesTooSimilar(t, f))) continue;
      free.push(t);
    }
    return { title: free[0] || '', title_alts: free.slice(1, 3) };
  },

  syncBudgetFromPrice() {
    const price = parseInt(document.getElementById('product-price')?.value, 10) || 0;
    const budgetEl = document.getElementById('product-budget');
    if (!budgetEl || price <= 0) return;
    let label = '';
    if (price < 1000) label = 'до 1 000 ₽';
    else if (price < 2000) label = '1 000–2 000 ₽';
    else if (price < 3500) label = '2 000–3 500 ₽';
    else if (price < 5000) label = '3 500–5 000 ₽';
    else if (price < 8000) label = '5 000–8 000 ₽';
    else label = 'от 8 000 ₽';
    budgetEl.value = label;
  },

  canGenerateAICard() {
    const hasPhoto = (this.currentProduct?.photos || []).length > 0;
    const price = parseInt(document.getElementById('product-price')?.value, 10) || 0;
    const composition = (document.getElementById('product-composition')?.value || '').trim();
    const unit = this.isUnitBalloonMode?.();
    if (unit) return hasPhoto && price > 0;
    const hasMaster = !!(this.studioMasterDataUrl
      || (this.currentProduct?.photos || []).some((p) => p.type === 'master'));
    return hasMaster && price > 0 && composition.length > 0;
  },

  hasStudioMasterReady() {
    return !!(this.studioMasterDataUrl
      || (this.currentProduct?.photos || []).some((p) => p.type === 'master'));
  },

  canUnlockEditorStep2() {
    if (this.currentProduct?.id) return true;
    const hasPhoto = (this.currentProduct?.photos || []).length > 0;
    const price = parseInt(document.getElementById('product-price')?.value, 10) || 0;
    const composition = (document.getElementById('product-composition')?.value || '').trim();
    if (this.isUnitBalloonMode?.()) return hasPhoto && price > 0;
    return this.hasStudioMasterReady() && price > 0 && composition.length > 0;
  },

  syncEditorSteps() {
    const form = document.getElementById('product-form');
    if (!form) return;
    const step2 = this.canUnlockEditorStep2();
    form.classList.toggle('is-editor-step-1', !step2);
    form.classList.toggle('is-editor-step-2', step2);
    const hint = document.getElementById('step-1-hint');
    if (hint) {
      if (this.isUnitBalloonMode?.()) {
        hint.textContent = 'Шаг 1: фото и цена. Для «поштучно» остальное почти не нужно.';
      } else {
        hint.textContent = 'Шаг 1: фото → Master → цена и состав. Остальные поля откроются после этого.';
      }
    }
    if (step2) {
      this.hideSourceWorkPreview?.();
    } else {
      this.refreshSourceWorkPreview?.();
    }
  },

  showSourceWorkPreview(url, label) {
    const panel = document.getElementById('source-work-preview');
    const img = document.getElementById('source-work-preview-img');
    const labelEl = document.getElementById('source-work-preview-label');
    if (!panel || !img || !url) return;
    img.src = url;
    this._sourceWorkPreviewUrl = url;
    if (labelEl) labelEl.textContent = label || 'Оригинал — смотрите состав';
    panel.classList.remove('hidden');
    this.syncSourceWorkPreviewExpandUi?.();
  },

  hideSourceWorkPreview() {
    const panel = document.getElementById('source-work-preview');
    const img = document.getElementById('source-work-preview-img');
    if (panel) {
      panel.classList.add('hidden');
      panel.classList.remove('is-expanded');
    }
    if (img) img.removeAttribute('src');
    this._sourceWorkPreviewUrl = null;
    document.getElementById('product-form')?.classList.remove('is-studio-busy');
    document.getElementById('block-essentials')
      ?.querySelector('.essentials-layout')
      ?.classList.remove('is-preview-expanded');
    this.syncSourceWorkPreviewExpandUi?.();
  },

  refreshSourceWorkPreview() {
    if (this.canUnlockEditorStep2()) {
      this.hideSourceWorkPreview();
      return;
    }
    const master = this.studioMasterDataUrl
      || (this.currentProduct?.photos || []).find((p) => p.type === 'master')?.url;
    const original = this.studioCompare?.original
      || this.studioSourceUrl
      || this.currentProduct?.photos?.[0]?.url;
    if (master) {
      this.showSourceWorkPreview(master, 'Master — сверьте состав');
    } else if (original) {
      const busy = document.getElementById('product-form')?.classList.contains('is-studio-busy');
      this.showSourceWorkPreview(
        original,
        busy ? 'Оригинал (идёт Master) — пишите состав' : 'Оригинал — смотрите состав'
      );
    } else {
      this.hideSourceWorkPreview();
    }
  },

  isSourceWorkPreviewExpanded() {
    return !!document.getElementById('source-work-preview')?.classList.contains('is-expanded');
  },

  syncSourceWorkPreviewExpandUi() {
    const panel = document.getElementById('source-work-preview');
    const btn = document.getElementById('source-work-preview-zoom');
    const layout = document.querySelector('#block-essentials .essentials-layout');
    const expanded = !!panel?.classList.contains('is-expanded');
    if (layout) layout.classList.toggle('is-preview-expanded', expanded && !panel.classList.contains('hidden'));
    if (btn) btn.textContent = expanded ? 'Свернуть' : 'Увеличить';
  },

  toggleSourceWorkPreviewExpand(force) {
    const panel = document.getElementById('source-work-preview');
    if (!panel || panel.classList.contains('hidden')) return;
    const next = typeof force === 'boolean' ? force : !panel.classList.contains('is-expanded');
    panel.classList.toggle('is-expanded', next);
    this.syncSourceWorkPreviewExpandUi();
    if (next) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Фокус на состав — можно сразу печатать, глядя на крупное фото
      document.getElementById('product-composition')?.focus({ preventScroll: true });
    }
  },

  setStudioBusy(busy) {
    const form = document.getElementById('product-form');
    if (form) form.classList.toggle('is-studio-busy', !!busy);
    this.refreshSourceWorkPreview?.();
    // Во время генерации сразу крупно — писать состав удобнее без лишнего клика
    if (busy) this.toggleSourceWorkPreviewExpand?.(true);
  },

  syncAIFillGate() {
    const wrap = document.getElementById('ai-fill-wrap');
    const hint = document.getElementById('ai-fill-hint');
    const btn = document.getElementById('generate-ai-btn');
    const ready = this.canGenerateAICard();
    if (wrap) wrap.classList.toggle('hidden', !ready);
    if (hint) hint.classList.toggle('hidden', ready);
    if (btn && !btn.classList.contains('is-busy')) {
      btn.disabled = !ready;
    }
    this.syncEditorSteps?.();
    this.syncRequiredFieldHighlights?.();
  },

  setupAIFillGate() {
    if (this._aiFillGateWired) {
      this.syncAIFillGate();
      return;
    }
    this._aiFillGateWired = true;
    ['product-price', 'product-composition'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this.syncAIFillGate());
      el.addEventListener('change', () => this.syncAIFillGate());
    });
    this.syncAIFillGate();
  },

  getPublishSoftGaps() {
    const gaps = [];
    const unit = this.isUnitBalloonMode?.();
    const composition = (document.getElementById('product-composition')?.value || '').trim();
    const shortDesc = (document.getElementById('product-short-desc')?.value || '').trim();
    const budget = (document.getElementById('product-budget')?.value || '').trim();
    const age = (document.getElementById('product-age')?.value || '').trim();
    const occasion = (document.getElementById('product-occasion')?.value || '').trim();

    if (!unit && !composition) gaps.push('состав');
    if (!unit && !shortDesc) gaps.push('краткое описание');
    if (!unit && !budget) gaps.push('бюджет');
    if (!unit && (!age || age === 'Для любого возраста')) gaps.push('возраст');
    if (!unit && !occasion) gaps.push('повод');
    return gaps;
  },

  /** Пустые обязательные поля — коралловая обводка (персонаж/серия не входят). */
  getRequiredFieldStates() {
    const unit = this.isUnitBalloonMode?.();
    const price = parseInt(document.getElementById('product-price')?.value, 10) || 0;
    const age = (document.getElementById('product-age')?.value || '').trim();
    return {
      title: !(document.getElementById('product-title')?.value || '').trim(),
      category: !(document.getElementById('product-category')?.value || '').trim(),
      price: price <= 0,
      composition: !unit && !(document.getElementById('product-composition')?.value || '').trim(),
      short: !unit && !(document.getElementById('product-short-desc')?.value || '').trim(),
      budget: !unit && !(document.getElementById('product-budget')?.value || '').trim(),
      age: !unit && (!age || age === 'Для любого возраста'),
      occasion: !unit && !(document.getElementById('product-occasion')?.value || '').trim()
    };
  },

  syncRequiredFieldHighlights() {
    const states = this.getRequiredFieldStates?.() || {};
    document.querySelectorAll('[data-required-field]').forEach((el) => {
      const key = el.getAttribute('data-required-field');
      const empty = !!states[key];
      const group = el.closest('.form-group');
      if (group) group.classList.toggle('is-empty-required', empty);
      else el.classList.toggle('is-empty-required', empty);
    });
  },

  setupRequiredFieldHighlights() {
    if (this._requiredHighlightsWired) {
      this.syncRequiredFieldHighlights();
      return;
    }
    this._requiredHighlightsWired = true;
    const ids = [
      'product-title', 'product-category', 'product-price', 'product-composition',
      'product-short-desc', 'product-budget', 'product-age', 'product-occasion'
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this.syncRequiredFieldHighlights());
      el.addEventListener('change', () => this.syncRequiredFieldHighlights());
    });
    this.syncRequiredFieldHighlights();
  },

  renderTitleAlts(title, alts = []) {
    this.renderFieldAlts('title-alts', 'product-title', 'Варианты названия — выберите:', title, alts, (val) => {
      this.syncEditorTitle?.(val);
    });
  },

  renderCharacterAlts(character, alts = [], confidence = '') {
    const label = confidence === 'low' || confidence === 'medium'
      ? `Персонаж (${confidence === 'low' ? 'неуверен' : 'уточните'}) — выберите:`
      : 'Варианты персонажа — выберите:';
    this.renderFieldAlts('character-alts', 'product-character', label, character, alts);
  },

  renderSeriesAlts(series, alts = [], confidence = '') {
    const label = confidence === 'low' || confidence === 'medium'
      ? `Серия (${confidence === 'low' ? 'неуверен' : 'уточните'}) — выберите:`
      : 'Варианты серии — выберите:';
    this.renderFieldAlts('series-alts', 'product-series', label, series, alts);
  },

  renderFieldAlts(boxId, inputId, label, primary, alts = [], onPick) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const options = [primary, ...(alts || [])].map((t) => String(t || '').trim()).filter(Boolean);
    const uniq = [...new Set(options)];
    if (uniq.length <= 1 && !(label.includes('уточните') || label.includes('неуверен'))) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    if (!uniq.length) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `<span class="title-alts-label">${this.escapeHtml(label)}</span>` +
      uniq.map((t, i) =>
        `<button type="button" class="title-alt-btn${i === 0 ? ' is-active' : ''}" data-val="${this.escapeAttr(t)}">${this.escapeHtml(t)}</button>`
      ).join('') +
      ((label.includes('уточните') || label.includes('неуверен'))
        ? `<button type="button" class="title-alt-btn title-alt-btn-clear" data-val="">Нет / очистить</button>`
        : '');
    box.querySelectorAll('.title-alt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val') || '';
        const input = document.getElementById(inputId);
        if (input) input.value = val;
        if (typeof onPick === 'function') onPick(val);
        box.querySelectorAll('.title-alt-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });
  },

  escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  escapeAttr(s) {
    return this.escapeHtml(s).replace(/'/g, '&#39;');
  },

  async generateAIMetadata() {
    if (!this.canGenerateAICard()) {
      this.toast('Сначала фото, цена и состав', 'error');
      this.syncAIFillGate();
      return;
    }

    const btn = document.getElementById('generate-ai-btn');
    const statusEl = document.getElementById('ai-status');

    if (!btn || !statusEl) {
      console.error('AI UI elements not found');
      return;
    }

    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.innerHTML = '<span class="spinner"></span> Генерация...';
    statusEl.textContent = '🤖 Анализ фото...';

    try {
      const photo = this.currentProduct.photos[0];
      let imageUrl = photo.url;

      if (String(imageUrl).startsWith('data:')) {
        statusEl.textContent = '☁️ Загрузка фото для ИИ...';
        if (typeof this.ensureHttpsPhotoUrl === 'function') {
          imageUrl = await this.ensureHttpsPhotoUrl(imageUrl, 'ai-card.webp');
        } else if (photo.file) {
          const uploadResult = await this.uploadPhoto(photo.file);
          if (!uploadResult.ok) throw new Error(uploadResult.error || 'Cloudinary upload failed');
          imageUrl = uploadResult.url;
        } else {
          throw new Error('Нужен https URL фото');
        }
        photo.url = imageUrl;
        photo.uploaded = true;
        this.renderPhotos?.();
      }

      const titleEl = document.getElementById('product-title');
      const priceEl = document.getElementById('product-price');
      const compEl = document.getElementById('product-composition');
      const articleEl = document.getElementById('product-article');

      const titleHint = (titleEl?.value || this.currentProduct.title || '').trim();
      const rawComposition = (compEl?.value || '').trim();
      const holidayMeta = this.parseCompositionHolidayMeta?.(rawComposition) || {
        holiday: null, cleanText: rawComposition, hints: [], digitCount: 0
      };
      const userComposition = holidayMeta.cleanText || rawComposition;
      const compositionHints = (holidayMeta.hints && holidayMeta.hints.length)
        ? holidayMeta.hints
        : (this.currentProduct.composition_hints || []);
      if (holidayMeta.digitCount > 0) {
        this.currentProduct.digit_from_marker = holidayMeta.digitCount;
      }
      if (holidayMeta.hints?.length) {
        this.currentProduct.composition_hints = holidayMeta.hints;
      }
      if (holidayMeta.holiday) {
        this.currentProduct.holiday_only = holidayMeta.holiday;
        if (compEl && compEl.value !== userComposition) compEl.value = userComposition;
        this.applyHolidayOnlyMode?.(holidayMeta.holiday);
      } else if (compEl && userComposition !== rawComposition) {
        compEl.value = userComposition;
      }
      const priceHint = parseInt(priceEl?.value, 10) || 0;
      const sceneHint = this.currentProduct.scene || 'floor';
      const existingTitles = this.getExistingCatalogTitles?.() || [];

      statusEl.textContent = '🤖 ИИ заполняет карточку...';

      const res = await fetch(`${this.workerUrl}/api/ai/generate-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({
          image_url: imageUrl,
          title_hint: titleHint,
          price: priceHint,
          composition_raw: userComposition,
          composition_hints: compositionHints,
          description: userComposition,
          scene: sceneHint,
          existing_titles: existingTitles,
          holiday_only: holidayMeta.holiday || this.currentProduct.holiday_only || ''
        })
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok || !result.ok || !result.data) {
        throw new Error(result.error || `Не удалось сгенерировать метаданные (${res.status})`);
      }

      const data = result.data;
      const filtered = this.filterTitlesAgainstCatalog?.(data.title, data.title_alts || []) || {
        title: data.title,
        title_alts: data.title_alts || []
      };
      data.title = filtered.title;
      data.title_alts = filtered.title_alts;
      if (!data.title && (result.data.title || result.data.ask_title)) {
        data.ask_title = true;
      }

      this.currentProduct.title = data.title || this.currentProduct.title;
      this.currentProduct.short_description = data.short_description || this.currentProduct.short_description;
      this.currentProduct.full_description = data.full_description || this.currentProduct.full_description;
      // Состав: ИИ только оформляет ваш текст
      this.currentProduct.composition = data.composition || this.currentProduct.composition;
      this.currentProduct.category = data.category || this.currentProduct.category;
      this.currentProduct.character = data.character || this.currentProduct.character;
      this.currentProduct.age_group = data.age_group || this.currentProduct.age_group;
      this.currentProduct.occasion = data.occasion || '';
      this.currentProduct.target_audience = data.target_audience || this.currentProduct.target_audience;
      this.currentProduct.series_name = data.series_name || this.currentProduct.series_name;
      this.currentProduct.budget = data.budget || this.currentProduct.budget;
      this.currentProduct.seo_title = data.seo_title || this.currentProduct.seo_title;
      this.currentProduct.seo_description = data.seo_description || this.currentProduct.seo_description;
      this.currentProduct.slug = data.slug || this.currentProduct.slug;
      this.currentProduct.tags = data.tags || this.currentProduct.tags;

      this.fillFormWithAIData({
        ...data,
        article: undefined,
        price: undefined,
        _replaceTags: true
      });

      // Артикул после категории (BOY/GRL/…), не DG до заполнения
      if (!this.currentProduct.id) {
        this.assignFreshArticle?.();
      }

      this.renderTitleAlts(data.title, data.title_alts || []);
      this.renderCharacterAlts(data.character, data.character_alts || [], data.character_confidence || '');
      this.renderSeriesAlts(data.series_name, data.series_alts || [], data.series_confidence || '');

      if (data.ask_title || !data.title) {
        statusEl.innerHTML = '✅ Карточка заполнена — <strong>придумайте уникальное название</strong> (похожие в каталоге уже заняты), затем сохраните';
        this.toast('Нужно уникальное название', '');
        document.getElementById('product-title')?.focus();
      } else if (data.ask_character) {
        statusEl.innerHTML = '✅ Карточка заполнена — <strong>уточните персонажа/серию</strong> (кнопки под полями) и название, затем сохраните';
        this.toast('ИИ просит уточнить персонажа или серию', '');
      } else {
        statusEl.innerHTML = '✅ Карточка заполнена — выберите название при необходимости и сохраните';
        this.toast('ИИ заполнил карточку', 'success');
      }
      console.log('Generated metadata:', data);
    } catch (e) {
      console.error('AI generation error:', e);
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка AI: ' + e.message, 'error');
    } finally {
      btn.classList.remove('is-busy');
      btn.innerHTML = '🤖 ИИ заполнит карточку';
      this.syncAIFillGate();
    }
  }
});

console.log('✓ AI Metadata Generator loaded');
