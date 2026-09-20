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
    return this.hasStudioMasterReady() && price > 0 && composition.length > 0;
  },

  hasStudioMasterReady() {
    // Сверяем все места, где Master может жить после генерации/ретрая/автосейва
    if (this.studioMasterDataUrl || this.studioMasterBackupUrl || this.studioMasterBaseUrl) return true;
    if (this.studioCompare?.master) return true;
    const photos = this.currentProduct?.photos || [];
    if (photos.some((p) => p.type === 'master')) return true;
    // Главное фото уже Master (https после upload), а type потерялся — считаем готовым, если есть сравнение
    if (photos.length && this.studioCompare?.original && photos[0]?.url && photos[0].url !== this.studioCompare.original) {
      return true;
    }
    return false;
  },

  getStep2Blockers() {
    if (this.currentProduct?.id) return [];
    const gaps = [];
    const price = parseInt(document.getElementById('product-price')?.value, 10) || 0;
    const composition = (document.getElementById('product-composition')?.value || '').trim();
    if (this.isUnitBalloonMode?.()) {
      if (!(this.currentProduct?.photos || []).length) gaps.push('фото');
      if (!(price > 0)) gaps.push('цена');
      return gaps;
    }
    if (!this.hasStudioMasterReady()) gaps.push('Master');
    if (!(price > 0)) gaps.push('цена');
    if (!composition) gaps.push('состав');
    return gaps;
  },

  canUnlockEditorStep2() {
    if (this.currentProduct?.id) return true;
    return this.getStep2Blockers().length === 0;
  },

  goEditorStep2() {
    if (document.getElementById('product-form')?.classList.contains('is-studio-busy')) {
      this.toast('Подождите, пока Master закончит генерацию', 'info');
      return false;
    }
    this.ensureMasterPhotoFlag?.();
    this.syncEditorSteps?.();
    const gaps = this.getStep2Blockers();
    if (gaps.length) {
      this.toast(`Ещё нужно: ${gaps.join(', ')}`, 'info');
      if (gaps.includes('состав')) document.getElementById('product-composition')?.focus();
      else if (gaps.includes('цена')) document.getElementById('product-price')?.focus();
      else if (gaps.includes('Master') || gaps.includes('фото')) this.goStep1Phase?.('a');
      return false;
    }
    document.getElementById('block-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('product-title')?.focus({ preventScroll: true });
    this.toast('Шаг 2: название и ИИ', 'success');
    return true;
  },

  getStep1Phase() {
    const form = document.getElementById('product-form');
    if (form?.classList.contains('is-step1-c')) return 'c';
    return this._step1Phase === 'c' ? 'c' : 'a';
  },

  goStep1Phase(phase, opts = {}) {
    const form = document.getElementById('product-form');
    const busy = form?.classList.contains('is-studio-busy');
    // b больше нет — сведена к a (фото+сцена на одном экране)
    let next = phase === 'c' ? 'c' : 'a';
    if (phase === 'b') next = 'a';
    if (busy && next !== 'c' && !opts.force) {
      this.toast('Подождите, пока Master закончит генерацию', 'info');
      return false;
    }
    const photos = this.currentProduct?.photos || [];
    if (next === 'c' && !opts.skipGate && !photos.length && !this.hasStudioMasterReady?.()) {
      this.toast('Сначала загрузите фото', 'info');
      this.goStep1Phase('a', { skipGate: true });
      return false;
    }
    this._step1Phase = next;
    this.syncStep1WizardUi?.();
    if (next === 'c') {
      this.refreshSourceWorkPreview?.();
      this.toggleSourceWorkPreviewExpand?.(true);
      setTimeout(() => {
        document.getElementById('step1-phase-c')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const comp = document.getElementById('product-composition');
        if (comp && !this.isUnitBalloonMode?.()) comp.focus({ preventScroll: true });
        else document.getElementById('product-price')?.focus({ preventScroll: true });
      }, 60);
    } else {
      setTimeout(() => {
        document.getElementById('block-photos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
    return true;
  },

  /** «Далее» после выбора сцены: Master → экран состава (или сразу цена для поштучных). */
  startMasterFromWizard() {
    const photos = this.currentProduct?.photos || [];
    if (!photos.length) {
      this.toast('Сначала загрузите фото', 'info');
      return false;
    }
    if (this.isUnitBalloonMode?.()) {
      this.goStep1Phase('c', { skipGate: true });
      return true;
    }
    return this.processStudioProNew?.();
  },

  syncStep1WizardUi() {
    const form = document.getElementById('product-form');
    if (!form) return;
    const step2 = form.classList.contains('is-editor-step-2');
    let phase = this._step1Phase || 'a';
    if (phase === 'b') phase = 'a';
    if (!['a', 'c'].includes(phase)) phase = 'a';
    this._step1Phase = phase;

    if (step2 || this.currentProduct?.id) {
      form.classList.remove('is-step1-a', 'is-step1-b', 'is-step1-c');
    } else {
      form.classList.remove('is-step1-b');
      form.classList.toggle('is-step1-a', phase === 'a');
      form.classList.toggle('is-step1-c', phase === 'c');
    }

    const photoCount = (this.currentProduct?.photos || []).length;
    const hasPhotos = photoCount > 0;
    form.classList.toggle('has-step1-photos', hasPhotos);

    const editorCard = document.querySelector('#tab-create .product-editor');
    const quietChrome = !step2 && !this.currentProduct?.id;
    const uploadFocus = quietChrome && phase === 'a' && !hasPhotos;
    if (editorCard) {
      editorCard.classList.toggle('is-upload-focus', uploadFocus);
      editorCard.classList.toggle('is-quiet-chrome', quietChrome && !uploadFocus);
    }
    document.body.classList.toggle('admin-upload-focus', uploadFocus);

    const grid = document.getElementById('step1-photo-scene-grid');
    if (grid) grid.classList.toggle('has-photos', hasPhotos && phase === 'a' && !step2);

    const after = document.getElementById('step1-after-photo');
    if (after) {
      after.hidden = !hasPhotos || phase === 'c' || step2;
    }
    const composeCta = document.getElementById('step1-compose-cta');
    if (composeCta) {
      composeCta.hidden = !hasPhotos || phase === 'c' || step2;
    }
    const photoActions = document.getElementById('step1-photo-actions');
    if (photoActions) {
      // Показывать смену фото и на шаге состава / после Master / на шаге 2
      const showActions = hasPhotos && (phase === 'a' || phase === 'c' || step2);
      photoActions.hidden = !showActions;
    }
    // На шаге состава блок фото скрыт CSS — кнопка «Изменить фото» в nav фазы C

    const mark = (id, done, active) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('is-done', !!done);
      el.classList.toggle('is-active', !!active);
    };
    const p = step2 ? 'done' : phase;
    mark('step1-wiz-a', p === 'c' || p === 'done', p === 'a');
    mark('step1-wiz-c', p === 'done', p === 'c');

    const scene = this.currentProduct?.scene || document.getElementById('scene-select')?.value || 'auto';
    const meta = (typeof SCENES !== 'undefined' ? SCENES : []).find((s) => s.value === scene);
    const sceneLabel = meta ? meta.title : scene;
    const cChip = document.getElementById('step1-phase-c-scene');
    if (cChip) cChip.textContent = sceneLabel;

    const wiz = document.getElementById('step1-wizard-progress');
    if (wiz) wiz.hidden = !!step2 || quietChrome;

    const nextA = document.getElementById('step1-a-next');
    if (nextA) {
      nextA.disabled = !hasPhotos;
      nextA.textContent = this.isUnitBalloonMode?.() ? 'Далее: цена →' : 'Далее: состав →';
    }

    const backC = document.getElementById('step1-c-back');
    if (backC) {
      const busy = form.classList.contains('is-studio-busy');
      backC.disabled = busy;
      backC.title = busy ? 'Дождитесь окончания Master' : '';
    }
  },

  ensureMasterPhotoFlag() {
    if (!this.hasStudioMasterReady()) return;
    const masterUrl = this.studioMasterDataUrl
      || this.studioMasterBackupUrl
      || this.studioCompare?.master
      || null;
    if (!this.currentProduct) return;
    const photos = this.currentProduct.photos || [];
    if (!photos.length && masterUrl) {
      this.currentProduct.photos = [{ id: Date.now() + '_master', url: masterUrl, uploaded: /^https?:/i.test(masterUrl), type: 'master' }];
      this.renderPhotos?.();
      return;
    }
    if (photos[0] && photos[0].type !== 'master' && masterUrl && photos[0].url === masterUrl) {
      photos[0].type = 'master';
    } else if (photos[0] && !photos[0].type && this.studioCompare?.master) {
      photos[0].type = 'master';
      if (!photos[0].url) photos[0].url = this.studioCompare.master;
    }
    if (masterUrl && !this.studioMasterDataUrl) this.studioMasterDataUrl = masterUrl;
  },

  syncEditorSteps() {
    const form = document.getElementById('product-form');
    if (!form) return;
    this.ensureMasterPhotoFlag?.();
    const wasStep2 = form.classList.contains('is-editor-step-2');
    const step2 = this.canUnlockEditorStep2();
    form.classList.toggle('is-editor-step-1', !step2);
    form.classList.toggle('is-editor-step-2', step2);
    const s1 = document.getElementById('editor-progress-1');
    const s2 = document.getElementById('editor-progress-2');
    if (s1) {
      s1.classList.toggle('is-active', !step2);
      s1.classList.toggle('is-done', step2);
    }
    if (s2) {
      s2.classList.toggle('is-active', step2);
      s2.classList.toggle('is-done', false);
    }
    const hint = document.getElementById('step1-next-hint');
    const btn = document.getElementById('step1-next-btn');
    const wrap = document.getElementById('step1-next-wrap');
    const gaps = this.getStep2Blockers();
    const busy = form.classList.contains('is-studio-busy');
    if (wrap) {
      wrap.classList.toggle('is-ready', step2 && !busy);
      wrap.classList.toggle('is-waiting', busy);
    }
    if (hint) {
      if (busy) {
        hint.textContent = 'Master ещё генерируется — состав и цену можно заполнять';
      } else if (step2) {
        hint.textContent = 'Шаг 1 готов — можно к названию и ИИ';
      } else {
        hint.textContent = gaps.length ? `Чтобы продолжить, нужно: ${gaps.join(', ')}` : '';
      }
    }
    if (btn) {
      if (busy) {
        btn.disabled = true;
        btn.textContent = 'Ждём Master…';
      } else {
        btn.disabled = false;
        btn.textContent = step2 ? 'Дальше: название и ИИ →' : 'Проверить шаг 1';
      }
    }
    if (step2) {
      this.hideSourceWorkPreview?.();
      if (!wasStep2) {
        setTimeout(() => {
          document.getElementById('block-main')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    } else {
      this.refreshSourceWorkPreview?.();
    }
    this.syncStep1WizardUi?.();
  },

  showSourceWorkPreview(url) {
    const panel = document.getElementById('source-work-preview');
    const img = document.getElementById('source-work-preview-img');
    if (!panel || !img || !url) return;
    img.src = url;
    this._sourceWorkPreviewUrl = url;
    panel.classList.add('is-expanded');
    panel.classList.remove('hidden');
    document.getElementById('block-essentials')?.classList.add('is-preview-expanded');
  },

  hideSourceWorkPreview() {
    const panel = document.getElementById('source-work-preview');
    const img = document.getElementById('source-work-preview-img');
    if (panel) {
      panel.classList.add('hidden');
      panel.classList.add('is-expanded');
    }
    if (img) img.removeAttribute('src');
    this._sourceWorkPreviewUrl = null;
    document.getElementById('block-essentials')?.classList.remove('is-preview-expanded');
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
      this.showSourceWorkPreview(master);
    } else if (original) {
      this.showSourceWorkPreview(original);
    } else {
      this.hideSourceWorkPreview();
    }
  },

  isSourceWorkPreviewExpanded() {
    return !!document.getElementById('source-work-preview')?.classList.contains('is-expanded');
  },

  syncSourceWorkPreviewExpandUi() {
    const panel = document.getElementById('source-work-preview');
    const layout = document.getElementById('block-essentials');
    const visible = !!panel && !panel.classList.contains('hidden');
    if (panel && visible) panel.classList.add('is-expanded');
    if (layout) layout.classList.toggle('is-preview-expanded', visible);
  },

  toggleSourceWorkPreviewExpand(force) {
    // Превью всегда крупное — свернуть/увеличить убраны из UI
    const panel = document.getElementById('source-work-preview');
    if (!panel || panel.classList.contains('hidden')) return;
    if (force === false) return;
    panel.classList.add('is-expanded');
    this.syncSourceWorkPreviewExpandUi();
  },

  setStudioBusy(busy) {
    const form = document.getElementById('product-form');
    if (form) form.classList.toggle('is-studio-busy', !!busy);
    if (busy) this.goStep1Phase?.('c', { skipGate: true });
    this.refreshSourceWorkPreview?.();
    if (busy) this.toggleSourceWorkPreviewExpand?.(true);
    this.syncStudioBusyUi?.(!!busy);
  },

  syncStudioBusyUi(busy) {
    const banner = document.getElementById('studio-busy-banner');
    const detail = document.getElementById('studio-busy-detail');
    const timerEl = document.getElementById('studio-busy-timer');
    const stageEl = document.getElementById('studio-busy-stage');
    const scene = document.getElementById('scene-select');
    const uploadBtn = document.getElementById('photo-upload-btn');
    const retryBtn = document.getElementById('studio-retry-btn');
    const processBtn = document.getElementById('process-studio-btn');
    document.querySelectorAll('.scene-rail-btn').forEach((btn) => { btn.disabled = !!busy; });

    if (banner) {
      banner.classList.toggle('hidden', !busy);
      banner.hidden = !busy;
    }
    if (scene) scene.disabled = !!busy;
    if (uploadBtn) uploadBtn.disabled = !!busy;
    if (processBtn && busy) processBtn.disabled = true;
    if (retryBtn && busy) retryBtn.disabled = true;

    if (busy) {
      if (detail) {
        detail.textContent = this.isUnitBalloonMode?.()
          ? 'Обычно 1–3 минуты. Цену можно указать сейчас.'
          : 'Состав и цену можно заполнять сейчас — не ждите конца.';
      }
      if (stageEl && !stageEl.textContent) stageEl.textContent = 'Запуск…';
      if (!this._studioBusyStartedAt) this._studioBusyStartedAt = Date.now();
      this.tickStudioBusyTimer?.();
      clearInterval(this._studioBusyTimer);
      this._studioBusyTimer = setInterval(() => this.tickStudioBusyTimer?.(), 1000);
      this.syncEditorSteps?.();
      const comp = document.getElementById('product-composition');
      const price = document.getElementById('product-price');
      const active = document.activeElement;
      if (comp && active !== comp && active !== price) {
        setTimeout(() => {
          if (document.getElementById('product-form')?.classList.contains('is-studio-busy')) {
            document.getElementById('step1-phase-c')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            comp.focus({ preventScroll: true });
          }
        }, 400);
      }
    } else {
      clearInterval(this._studioBusyTimer);
      this._studioBusyTimer = null;
      this._studioBusyStartedAt = null;
      if (timerEl) timerEl.textContent = '0:00';
      if (stageEl) stageEl.textContent = '';
      if (detail) {
        delete detail.dataset.longWait;
        detail.textContent = 'Состав и цену можно заполнять сейчас — не ждите конца.';
      }
      if (retryBtn) retryBtn.disabled = false;
      this.syncEditorSteps?.();
    }
  },

  tickStudioBusyTimer() {
    const timerEl = document.getElementById('studio-busy-timer');
    if (!timerEl || !this._studioBusyStartedAt) return;
    const sec = Math.max(0, Math.floor((Date.now() - this._studioBusyStartedAt) / 1000));
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;

    const statusRaw = (document.getElementById('studio-status')?.textContent || '').trim();
    const stageEl = document.getElementById('studio-busy-stage');
    if (stageEl && statusRaw) {
      stageEl.textContent = statusRaw.replace(/^[⏳✅❌☁️🎨✂️🔎📎✏️↻]+\s*/u, '').trim() || statusRaw;
    }

    if (sec >= 180) {
      const detail = document.getElementById('studio-busy-detail');
      if (detail && !detail.dataset.longWait) {
        detail.dataset.longWait = '1';
        detail.textContent = 'Уже дольше обычного — можно продолжать состав. Master появится сам.';
      }
    }
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
      const kick = () => {
        this.ensureMasterPhotoFlag?.();
        this.syncAIFillGate();
      };
      el.addEventListener('input', kick);
      el.addEventListener('change', kick);
      el.addEventListener('blur', kick);
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

    if (!unit && !composition) gaps.push('состав');
    if (!unit && !shortDesc) gaps.push('краткое описание');
    if (!unit && !budget) gaps.push('бюджет');
    if (!unit && (!age || age === 'Для любого возраста')) gaps.push('возраст');
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
      age: !unit && (!age || age === 'Для любого возраста')
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
      'product-short-desc', 'product-budget', 'product-age'
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
      this.currentProduct.occasion = '';
      this.currentProduct.target_audience = '';
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
