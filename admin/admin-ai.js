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
    document.getElementById('block-essentials')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('generate-ai-btn')?.focus({ preventScroll: true });
    this.toast('Шаг 2: ИИ заполнит карточку', 'success');
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
          this.autosizeCompositionField?.();
          document.getElementById('generate-ai-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      } else {
        this.autosizeCompositionField?.();
      }
    } else {
      this.refreshSourceWorkPreview?.();
      this.autosizeCompositionField?.();
    }
    this.syncStep1WizardUi?.();
    this.syncStep2AiCardUi?.();
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
    const retryBtns = this.studioRetryButtons?.() || [];
    const processBtn = document.getElementById('process-studio-btn');
    document.querySelectorAll('.scene-rail-btn').forEach((btn) => { btn.disabled = !!busy; });

    if (banner) {
      banner.classList.toggle('hidden', !busy);
      banner.hidden = !busy;
    }
    if (scene) scene.disabled = !!busy;
    if (uploadBtn) uploadBtn.disabled = !!busy;
    if (processBtn && busy) processBtn.disabled = true;
    retryBtns.forEach((btn) => { if (busy) btn.disabled = true; });

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
      retryBtns.forEach((btn) => { btn.disabled = false; });
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
    this.syncStep2AiCardUi?.();
  },

  /** Шаг 2: поля карточки только после ИИ (или при редактировании / поштучно). */
  syncStep2AiCardUi() {
    const form = document.getElementById('product-form');
    if (!form) return;
    const unit = this.isUnitBalloonMode?.();
    const editing = !!this.currentProduct?.id;
    const titled = !!(document.getElementById('product-title')?.value || '').trim();
    const shorted = !!(document.getElementById('product-short-desc')?.value || '').trim();
    const done = !!(this._aiCardFilled || unit || editing || (titled && shorted));
    form.classList.toggle('has-ai-card', done);
    const editBtn = document.getElementById('edit-card-btn');
    if (editBtn) {
      const show = done && form.classList.contains('is-editor-step-2');
      editBtn.classList.toggle('hidden', !show);
      editBtn.hidden = !show;
    }
    this.autosizeCompositionField?.();
  },

  autosizeCompositionField() {
    const el = document.getElementById('product-composition');
    if (!el) return;
    const onStep2 = document.getElementById('product-form')?.classList.contains('is-editor-step-2');
    if (!onStep2) {
      el.style.height = '';
      el.style.overflow = '';
      return;
    }
    el.style.height = 'auto';
    el.style.overflow = 'hidden';
    el.style.height = `${Math.max(el.scrollHeight, 112)}px`;
  },

  markAiCardFilled(filled = true) {
    this._aiCardFilled = !!filled;
    this.syncStep2AiCardUi?.();
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
        if (id === 'product-composition') this.autosizeCompositionField?.();
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

    this.ensureNotifyPermission?.();

    const btn = document.getElementById('generate-ai-btn');
    const statusEl = document.getElementById('ai-status');

    if (!btn || !statusEl) {
      console.error('AI UI elements not found');
      return;
    }

    btn.disabled = true;
    btn.classList.add('is-busy');
    btn.innerHTML = '<span class="spinner"></span> Генерация...';
    statusEl.textContent = '✨ Анализ фото...';

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
      const occasionList = (typeof OCCASION_SHELVES !== 'undefined' && OCCASION_SHELVES) || [];
      const compositionHints = (holidayMeta.hints && holidayMeta.hints.length)
        ? holidayMeta.hints
        : (this.currentProduct.composition_hints || []).filter((h) => {
          const hit = this.matchHolidayCategory?.(h);
          return hit && occasionList.includes(hit);
        });
      if (holidayMeta.digitCount > 0) {
        this.currentProduct.digit_from_marker = holidayMeta.digitCount;
      }
      if (compositionHints.length) {
        this.currentProduct.composition_hints = compositionHints;
      }
      const holidayFlagRaw = holidayMeta.holiday
        || this.holidayFromHints?.(holidayMeta.hints || [])
        || '';
      let holidayFlag = occasionList.includes(holidayFlagRaw) ? holidayFlagRaw : '';
      if (!holidayFlag && occasionList.includes(this.currentProduct.holiday_only)) {
        holidayFlag = this.currentProduct.holiday_only;
      }
      if (holidayFlag) {
        this.currentProduct.holiday_only = holidayFlag;
        if (compEl && compEl.value !== userComposition) compEl.value = userComposition;
        this.applyHolidayOnlyMode?.(holidayFlag);
      } else {
        this.currentProduct.holiday_only = '';
        if (compEl && userComposition !== rawComposition) compEl.value = userComposition;
      }
      const priceHint = parseInt(priceEl?.value, 10) || 0;
      const sceneHint = this.currentProduct.scene || 'floor';
      const existingTitles = this.getExistingCatalogTitles?.() || [];

      let foilDigits = '';
      if (imageUrl) {
        statusEl.textContent = '🔢 ИИ читает цифры на фото...';
        try {
          const digitRes = await fetch(`${this.workerUrl}/api/ai/read-foil-digits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
            body: JSON.stringify({ image_url: imageUrl })
          });
          const digitJson = await digitRes.json().catch(() => ({}));
          if (digitRes.ok && digitJson.ok) {
            foilDigits = String(digitJson.foil_digits || '').replace(/\D/g, '').slice(0, 4);
          }
        } catch (digitErr) {
          console.warn('[AI] foil digits', digitErr);
        }
      }

      statusEl.textContent = foilDigits
        ? `✨ ИИ заполняет карточку... цифры ${foilDigits}`
        : '✨ ИИ заполняет карточку...';

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
          holiday_only: holidayFlag || '',
          foil_digits: foilDigits
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
      if (data.composition) {
        data.composition = this.sanitizeAiDigitLines?.(data.composition, userComposition) || data.composition;
      }
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

      this.markAiCardFilled?.(true);
      this._lastAiCardData = data;
      this.notifyMasterDone?.('ok', {
        title: 'Карточка заполнена',
        body: 'ИИ готов — проверьте и опубликуйте'
      });
      setTimeout(() => this.openAiReviewOverlay?.({ data, fresh: true }), 60);

      if (data.ask_title || !data.title) {
        statusEl.innerHTML = '✅ Карточка заполнена — <strong>придумайте уникальное название</strong> (похожие в каталоге уже заняты), затем сохраните';
        this.toast('Нужно уникальное название', '');
      } else if (data.ask_character) {
        statusEl.innerHTML = '✅ Карточка заполнена — <strong>уточните персонажа/серию</strong> и название, затем сохраните';
        this.toast('ИИ просит уточнить персонажа или серию', '');
      } else {
        statusEl.innerHTML = '✅ Карточка заполнена — проверьте в окне и опубликуйте';
        this.toast('ИИ заполнил карточку', 'success');
      }
      console.log('Generated metadata:', data);
    } catch (e) {
      console.error('AI generation error:', e);
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка AI: ' + e.message, 'error');
      this.notifyMasterDone?.('error', {
        title: 'ИИ не заполнил карточку',
        body: e.message || 'Ошибка генерации'
      });
    } finally {
      btn.classList.remove('is-busy');
      btn.innerHTML = '✨ ИИ заполнит карточку';
      this.syncAIFillGate();
    }
  },

  openAiReviewOverlay(opts = {}) {
    const overlay = document.getElementById('ai-review-overlay');
    if (!overlay) return;
    if (opts.data) this._lastAiCardData = opts.data;
    const form = document.getElementById('product-form');
    form?.classList.remove('is-ai-review-detail');
    const eyebrow = overlay.querySelector('.ai-review-eyebrow');
    if (eyebrow) eyebrow.textContent = opts.fresh ? 'После ИИ' : 'Правка';
    this.wireAiReviewOverlay?.();
    this.syncAiReviewFromForm?.(opts.data || this._lastAiCardData);
    overlay.hidden = false;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('ai-review-open');
    setTimeout(() => document.getElementById('ai-review-title')?.focus({ preventScroll: true }), 40);
  },

  closeAiReviewOverlay(opts = {}) {
    if (!opts.skipSync) this.syncAiReviewToForm?.();
    const overlay = document.getElementById('ai-review-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.hidden = true;
    }
    document.body.classList.remove('ai-review-open');
    if (!document.getElementById('photo-lightbox') || document.getElementById('photo-lightbox').classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
    const form = document.getElementById('product-form');
    if (opts.edit) {
      form?.classList.add('is-ai-review-detail');
      setTimeout(() => {
        document.getElementById('step2-after-ai')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('product-title')?.focus({ preventScroll: true });
      }, 40);
    }
  },

  wireAiReviewOverlay() {
    if (this._aiReviewWired) return;
    this._aiReviewWired = true;
    const map = [
      ['ai-review-title', 'product-title'],
      ['ai-review-price', 'product-price'],
      ['ai-review-composition', 'product-composition'],
      ['ai-review-category', 'product-category'],
      ['ai-review-age', 'product-age'],
      ['ai-review-character', 'product-character'],
      ['ai-review-series', 'product-series']
    ];
    map.forEach(([fromId, toId]) => {
      const el = document.getElementById(fromId);
      if (!el) return;
      const sync = () => {
        const target = document.getElementById(toId);
        if (target) target.value = el.value;
        if (fromId === 'ai-review-title') this.syncEditorTitle?.(el.value);
        if (fromId === 'ai-review-composition') {
          this.autosizeAiReviewComposition?.();
          this.syncHolidayFromComposition?.();
          this.syncAdvanceOrderFromScene?.();
          this.syncAiReviewDigitOpts?.();
        }
        if (fromId === 'ai-review-category') this.syncAiReviewDigitOpts?.();
        if (fromId === 'ai-review-price') this.syncBudgetFromPrice?.();
        this.syncRequiredFieldHighlights?.();
        this.scheduleSaveActiveStudioDraft?.();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    });

    const optMap = [
      ['ai-review-opt-advance', 'opt-advance'],
      ['ai-review-opt-inscription', 'opt-inscription'],
      ['ai-review-opt-rental', 'opt-rental']
    ];
    optMap.forEach(([fromId, toId]) => {
      const el = document.getElementById(fromId);
      if (!el) return;
      el.addEventListener('change', () => {
        const target = document.getElementById(toId);
        if (target) target.checked = el.checked;
        this.scheduleSaveActiveStudioDraft?.();
      });
    });
    const digit1 = document.getElementById('ai-review-opt-digit-1');
    const digit2 = document.getElementById('ai-review-opt-digit-2');
    const onDigit = (n) => {
      const d1 = document.getElementById('ai-review-opt-digit-1');
      const d2 = document.getElementById('ai-review-opt-digit-2');
      const on = n === 1 ? d1?.checked : d2?.checked;
      if (on) {
        if (n === 1 && d2) d2.checked = false;
        if (n === 2 && d1) d1.checked = false;
        this.currentProduct = this.currentProduct || {};
        this.currentProduct.digit_from_marker = n;
        const numberEl = document.getElementById('opt-number');
        if (numberEl) numberEl.checked = true;
      } else {
        const otherOn = n === 1 ? d2?.checked : d1?.checked;
        this.currentProduct = this.currentProduct || {};
        this.currentProduct.digit_from_marker = otherOn ? (n === 1 ? 2 : 1) : 0;
        const numberEl = document.getElementById('opt-number');
        if (numberEl) numberEl.checked = !!otherOn;
      }
      this.syncAdvanceOrderFromScene?.();
      this.scheduleSaveActiveStudioDraft?.();
    };
    digit1?.addEventListener('change', () => onDigit(1));
    digit2?.addEventListener('change', () => onDigit(2));
  },

  autosizeAiReviewComposition() {
    const comp = document.getElementById('ai-review-composition');
    if (!comp) return;
    comp.style.height = 'auto';
    comp.style.height = `${Math.max(comp.scrollHeight, 48)}px`;
  },

  syncAiReviewDigitOpts() {
    const d1 = document.getElementById('ai-review-opt-digit-1');
    const d2 = document.getElementById('ai-review-opt-digit-2');
    if (!d1 && !d2) return;
    const cat = document.getElementById('ai-review-category')?.value
      || document.getElementById('product-category')?.value
      || '';
    const isFirstBirthday = (cat === '1 годик'
      || this.currentProduct?.holiday_only === '1 годик')
      && !this.isPhotozoneContext?.();
    const comp = document.getElementById('ai-review-composition')?.value
      || document.getElementById('product-composition')?.value
      || '';
    const n = isFirstBirthday ? 0 : (this.compositionDigitCount?.(comp) || 0);
    if (d1) {
      d1.checked = n === 1;
      d1.disabled = isFirstBirthday;
    }
    if (d2) {
      d2.checked = n === 2;
      d2.disabled = isFirstBirthday;
    }
    const numberEl = document.getElementById('opt-number');
    if (numberEl) {
      numberEl.checked = !isFirstBirthday && n > 0;
      numberEl.disabled = isFirstBirthday;
    }
    if (!isFirstBirthday && n > 0) {
      this.currentProduct = this.currentProduct || {};
      this.currentProduct.digit_from_marker = n;
    }
  },

  renderAiReviewTagGroup(containerId, tags, sourceSelector) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const checked = new Set(
      [...document.querySelectorAll(`${sourceSelector} input:checked`)].map((el) => el.value)
    );
    container.innerHTML = (tags || []).map((tag, i) => {
      const id = `${containerId}-${i}`;
      const on = checked.has(tag);
      return `<div class="chip${on ? ' is-on' : ''}">
        <input type="checkbox" id="${id}" value="${this.escapeAttr(tag)}"${on ? ' checked' : ''}/>
        <label for="${id}">${this.escapeHtml(tag)}</label>
      </div>`;
    }).join('');
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const formCb = document.querySelector(`${sourceSelector} input[value="${CSS.escape(cb.value)}"]`);
        if (formCb) formCb.checked = cb.checked;
        cb.closest('.chip')?.classList.toggle('is-on', cb.checked);
        this.scheduleSaveActiveStudioDraft?.();
      });
    });
  },

  syncAiReviewFromForm(data) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val != null) el.value = val;
    };
    const copySelect = (srcId, dstId) => {
      const src = document.getElementById(srcId);
      const dst = document.getElementById(dstId);
      if (!src || !dst) return;
      if (dst.options.length < 2) dst.innerHTML = src.innerHTML;
      dst.value = src.value;
    };
    copySelect('product-category', 'ai-review-category');
    copySelect('product-age', 'ai-review-age');

    set('ai-review-title', document.getElementById('product-title')?.value || '');
    set('ai-review-price', document.getElementById('product-price')?.value || '');
    set('ai-review-composition', document.getElementById('product-composition')?.value || '');
    set('ai-review-character', document.getElementById('product-character')?.value || '');
    set('ai-review-series', document.getElementById('product-series')?.value || '');

    const img = document.getElementById('ai-review-img');
    const photoUrl = this.currentProduct?.photos?.[0]?.url
      || this.studioMasterDataUrl
      || this.studioCompare?.master
      || '';
    if (img) {
      if (photoUrl) img.src = photoUrl;
      else img.removeAttribute('src');
    }

    const article = document.getElementById('product-article')?.value || '';
    const meta = document.getElementById('ai-review-meta');
    if (meta) meta.textContent = article ? `Арт. ${article}` : '';

    const title = data?.title || document.getElementById('product-title')?.value || '';
    const titleAlts = (data?.title_alts || []).slice(0, 2);
    this.renderFieldAlts?.(
      'ai-review-title-alts',
      'ai-review-title',
      'Ещё варианты:',
      title,
      titleAlts,
      (val) => {
        const formTitle = document.getElementById('product-title');
        if (formTitle) formTitle.value = val;
        this.syncEditorTitle?.(val);
        this.renderTitleAlts?.(val, data?.title_alts || titleAlts);
      }
    );

    const conf = String(data?.character_confidence || this._lastAiCardData?.character_confidence || '').toLowerCase();
    const charDoubt = conf === 'low' || conf === 'medium';
    const charWrap = document.getElementById('ai-review-character-wrap');
    const doubtBadge = document.getElementById('ai-review-character-doubt');
    if (charWrap) {
      charWrap.classList.remove('hidden');
      charWrap.classList.toggle('is-doubt', charDoubt);
    }
    if (doubtBadge) doubtBadge.classList.toggle('hidden', !charDoubt);
    const char = data?.character || document.getElementById('product-character')?.value || '';
    const charAlts = data?.character_alts || this._lastAiCardData?.character_alts || [];
    this.renderFieldAlts?.(
      'ai-review-character-alts',
      'ai-review-character',
      charDoubt
        ? (conf === 'low' ? 'ИИ не уверен — выберите:' : 'Уточните персонажа:')
        : 'Варианты:',
      char,
      charAlts,
      (val) => {
        const el = document.getElementById('product-character');
        if (el) el.value = val;
      }
    );

    const seriesVal = (document.getElementById('product-series')?.value || '').trim();
    const charVal = (document.getElementById('product-character')?.value || '').trim();
    const showSeries = !!(seriesVal && (!charVal || seriesVal.toLowerCase() !== charVal.toLowerCase()));
    document.getElementById('ai-review-series-wrap')?.classList.toggle('hidden', !showSeries);

    const deferred = (typeof DEFERRED_TYPE_TAGS !== 'undefined' && DEFERRED_TYPE_TAGS) || ['Шар-сюрприз'];
    const typeTags = ((typeof TAGS !== 'undefined' && TAGS.type) || []).filter((t) => !deferred.includes(t));
    this.renderAiReviewTagGroup?.('ai-review-tags-for-who', TAGS?.forWho || [], '#tags-for-who');
    this.renderAiReviewTagGroup?.('ai-review-tags-occasion', TAGS?.occasion || [], '#tags-occasion');
    this.renderAiReviewTagGroup?.('ai-review-tags-dates', TAGS?.dates || [], '#tags-dates');
    this.renderAiReviewTagGroup?.('ai-review-tags-type', typeTags, '#tags-type');

    const syncOpt = (fromId, toId) => {
      const from = document.getElementById(fromId);
      const to = document.getElementById(toId);
      if (from && to) from.checked = !!to.checked;
    };
    syncOpt('ai-review-opt-advance', 'opt-advance');
    syncOpt('ai-review-opt-inscription', 'opt-inscription');
    syncOpt('ai-review-opt-rental', 'opt-rental');
    this.syncAiReviewDigitOpts?.();

    requestAnimationFrame(() => this.autosizeAiReviewComposition?.());
  },

  syncAiReviewToForm() {
    const pair = (fromId, toId) => {
      const from = document.getElementById(fromId);
      const to = document.getElementById(toId);
      if (from && to) to.value = from.value;
    };
    pair('ai-review-title', 'product-title');
    pair('ai-review-price', 'product-price');
    pair('ai-review-composition', 'product-composition');
    pair('ai-review-category', 'product-category');
    pair('ai-review-age', 'product-age');
    pair('ai-review-character', 'product-character');
    pair('ai-review-series', 'product-series');

    const optMap = [
      ['ai-review-opt-advance', 'opt-advance'],
      ['ai-review-opt-inscription', 'opt-inscription'],
      ['ai-review-opt-rental', 'opt-rental']
    ];
    optMap.forEach(([fromId, toId]) => {
      const from = document.getElementById(fromId);
      const to = document.getElementById(toId);
      if (from && to) to.checked = from.checked;
    });
    const d1 = document.getElementById('ai-review-opt-digit-1')?.checked;
    const d2 = document.getElementById('ai-review-opt-digit-2')?.checked;
    const n = d2 ? 2 : d1 ? 1 : 0;
    this.currentProduct = this.currentProduct || {};
    this.currentProduct.digit_from_marker = n;
    const numberEl = document.getElementById('opt-number');
    if (numberEl) {
      numberEl.checked = n > 0;
      numberEl.disabled = false;
    }

    // Теги уже синкаются по change; на всякий случай прогоним из оверлея
    [
      ['ai-review-tags-for-who', '#tags-for-who'],
      ['ai-review-tags-occasion', '#tags-occasion'],
      ['ai-review-tags-dates', '#tags-dates'],
      ['ai-review-tags-type', '#tags-type']
    ].forEach(([boxId, sel]) => {
      document.querySelectorAll(`#${boxId} input[type="checkbox"]`).forEach((cb) => {
        const formCb = document.querySelector(`${sel} input[value="${CSS.escape(cb.value)}"]`);
        if (formCb) formCb.checked = cb.checked;
      });
    });

    const showEl = document.getElementById('show-on-site');
    // при публикации выставится отдельно; в оверлее галочки нет
    void showEl;

    this.syncEditorTitle?.(document.getElementById('product-title')?.value || '');
    this.syncBudgetFromPrice?.();
    this.syncRequiredFieldHighlights?.();
    this.autosizeCompositionField?.();
  },

  async publishFromAiReview() {
    this.syncAiReviewToForm?.();
    const showEl = document.getElementById('show-on-site');
    if (showEl) showEl.checked = true;
    await this.publishProduct?.();
  },

  async saveDraftFromAiReview() {
    this.syncAiReviewToForm?.();
    await this.saveDraft?.({ andNew: false });
  }
});

console.log('✓ AI Metadata Generator loaded');
