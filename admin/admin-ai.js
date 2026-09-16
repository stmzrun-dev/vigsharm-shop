// VigSharm Admin - AI Metadata Generation
// Кнопка доступна только после: фото + цена > 0 + состав

Object.assign(app, {
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
    return hasPhoto && price > 0 && composition.length > 0;
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
      const userComposition = (compEl?.value || '').trim();
      const priceHint = parseInt(priceEl?.value, 10) || 0;
      const sceneHint = this.currentProduct.scene || 'floor';

      statusEl.textContent = '🤖 ИИ заполняет карточку...';

      const res = await fetch(`${this.workerUrl}/api/ai/generate-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({
          image_url: imageUrl,
          title_hint: titleHint,
          price: priceHint,
          composition_raw: userComposition,
          description: userComposition,
          scene: sceneHint
        })
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok || !result.ok || !result.data) {
        throw new Error(result.error || `Не удалось сгенерировать метаданные (${res.status})`);
      }

      const data = result.data;

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

      if (data.ask_character) {
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
