// VigSharm Admin Panel - V3
const CATEGORIES = ['Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для мамы', 'Для него', 'Геймерам', 'Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник', 'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября', 'Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров', 'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров', 'Шары поштучно'];

const TAGS = {
  forWho: ['Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для мамы', 'Для него', 'Геймерам'],
  occasion: ['Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник'],
  dates: ['Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'],
  type: ['Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров', 'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров', 'Шары поштучно']
};

/** Полки-поводы/даты: возраст ставится автоматически; персонаж/серия нужны везде */
const OCCASION_SHELVES = [...TAGS.occasion, ...TAGS.dates];

/** Праздничные категории: в составе пишите метку в скобках, напр. (1 сентября) — в состав клиенту не попадёт. */
const HOLIDAY_CATEGORIES = ['Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'];
/** Тематики для метки в скобках: аудитория / повод / праздник (не тип изделия). */
const THEME_CATEGORIES = [...TAGS.forWho, ...TAGS.occasion, ...TAGS.dates];
/** Пока не ставим на карточки — отдельный раздел позже */
const DEFERRED_TYPE_TAGS = ['Шар-сюрприз'];

const SCENES = [
  { value: 'auto', icon: '✨', title: 'Автоматически', short: 'Авто', desc: 'ИИ определит по содержимому' },
  { value: 'unit_balloon', icon: '🎈', title: 'Шар поштучно', short: 'Поштучно', desc: 'Один шар у стены, без пола' },
  { value: 'handheld_bouquet', icon: '💐', title: 'Букет в руке', short: 'Букет', desc: 'Букет в руке, без бирок' },
  { value: 'wall_only', icon: '🖼️', title: 'Только стена', short: 'Стена', desc: 'Композиция на стене, без пола' },
  { value: 'floor', icon: '🪵', title: 'Напольная композиция', short: 'Пол', desc: 'Стоит на полу: стена + плинтус + ламинат' },
  { value: 'balloon_figures', icon: '🧸', title: 'Фигуры из шаров', short: 'Фигуры', desc: 'Крупная фигура из шаров на полу' },
  { value: 'photozone', icon: '🎪', title: 'Фотозона', short: 'Фотозона', desc: 'Каркас или мольберт' }
];

/** Типы фотозоны → что в аренде */
const PHOTOZONE_TYPES = {
  frame: {
    value: 'frame',
    title: 'На каркасе',
    hint: 'Каркас сдаётся только в аренду',
    rental_item: 'Каркас фотозоны'
  },
  easel: {
    value: 'easel',
    title: 'На мольберте с кругом',
    hint: 'Мольберт + круг из полистирола (с надписью) — только аренда',
    rental_item: 'Мольберт с кругом из полистирола',
    has_inscription: true
  }
};

/** Тип напольной: опциональный чип «заказ за 1–2 дня» (не выбирается сам). */
const FLOOR_TYPES = {
  air: {
    value: 'air',
    title: 'Заказ за 1–2 дня',
    hint: 'Напольная «под заказ» — клиент видит бейдж заранее',
    advance_order: true
  }
};

/** Подтип сцены «Букет»: опциональный чип «Цветы» (не выбирается сам). */
const BOUQUET_TYPES = {
  flowers: {
    value: 'flowers',
    title: 'Цветы',
    hint: 'Как букет: сцена и заказ за 1–2 дня, без надписи; в составе — «цветы из шаров»',
    type_tag: 'Цветы из шаров'
  }
};

/** Подтип «Шары поштучно»: полка каталога + размер у фольги. */
const UNIT_BALLOON_TYPES = {
  latex: { value: 'latex', title: 'Латекс', tag: 'Латексные шары' },
  print: { value: 'print', title: 'С рисунком', tag: 'Шары с рисунком', hasWho: true, hasHoliday: true },
  foil: { value: 'foil', title: 'Фольга', tag: 'Фольгированные фигуры', hasSize: true, hasWho: true, hasHoliday: true },
  walker: { value: 'walker', title: 'Ходячие', tag: 'Ходячие фигуры', hasWho: true, hasHoliday: true },
  shapes: { value: 'shapes', title: 'Круги и звёзды', tag: 'Круги, звёзды и сердца', hasHoliday: true }
};

/** Праздник у поштучных с рисунком / фольги / ходячих / кругов — та же полка, что у готовых работ. */
const UNIT_HOLIDAYS = ['Новый год', '14 февраля', '23 февраля', '8 марта', '9 мая', 'Выпускной', '1 сентября', 'День учителя', 'Хэллоуин'];

/** «Для кого» только у поштучных с рисунком / фольги — тег = якорь в каталоге. */
const UNIT_WHO_PICKS = [
  { label: 'Для неё', tag: 'Для неё' },
  { label: 'Для него', tag: 'Для него' },
  { label: 'Девочкам', tag: 'Для девочки' },
  { label: 'Мальчикам', tag: 'Для мальчика' },
  { label: 'Геймерам', tag: 'Геймерам' },
  { label: 'Выписка', tag: 'На выписку' },
  { label: 'Свадьба&Девичник', tag: 'Свадьба и девичник' },
  { label: '1 годик', tag: '1 годик' }
];
const PHOTOZONE_RENTAL_DAYS = 3;
const PHOTOZONE_RENTAL_EXTRA_PER_DAY = 500;

/** Группы списка товаров (как в старой админке / витрине) — свёрнуты по умолчанию */
const LIST_GROUPS = [
  { id: 'ready', title: 'Готовые решения', note: 'Композиции для любого повода', icon: '🎁' },
  { id: 'characters', title: 'Персонажи', note: 'Любимые герои детей', icon: '🦸' },
  { id: 'unit', title: 'Шары поштучно', note: 'Отдельные шары и фигуры', icon: '🎈' },
  { id: 'holidays', title: 'Праздники', note: 'Сезонные коллекции', icon: '✨' }
];
const LIST_HOLIDAYS = ['Новый год', '14 февраля', '23 февраля', '8 марта', '9 мая', 'Выпускной', '1 сентября', 'День учителя', 'Хэллоуин'];

const app = {
  workerUrl: 'https://api.vigsharm.ru',
  studioReferenceBackgroundUrl: '',
  studioReferenceHandUrl: '',
  adminApiKey: '',
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
  imgbbApiKey: '',

  // Заголовок авторизации для admin-only запросов к Worker (создание/изменение/удаление
  // товаров, загрузка фото, ИИ-генерация, Studio Pro). Публичное чтение каталога
  // (GET /api/products) авторизации не требует.
  authHeaders() {
    return this.adminApiKey ? { 'Authorization': 'Bearer ' + this.adminApiKey } : {};
  },

  currentStep: 1,
  products: [],
  listPageSize: 20,
  listVisible: 20,
  /** Какие группы раскрыты: { ready: true, ... } — по умолчанию все свёрнуты */
  listExpandedGroups: {},
  /** Полки внутри группы: { 'ready::Для него': true } */
  listExpandedSubgroups: {},
  /** Лимит строк внутри раскрытой группы */
  listGroupVisible: {},
  currentProduct: { photos: [], scene: 'auto', tags: [], client_options: {} },

  init() {
    const refreshedWhileOpen = this.consumeEditorOpenFlag();
    this.loadSettings();
    this.setupTabs();
    this.setupPhotoUpload();
    this.setupSceneSelector();
    this.syncStudioModeHint?.();
    this.setupAIFillGate?.();
    this.setupRequiredFieldHighlights?.();
    this.setupFormEvents();
    this.renderCategories();
    this.renderTags();
    this.wireFormHelpers();
    this.wireFilters();
    this.switchTab('products');
    this.installAuthGate();
    document.getElementById('admin-logout')?.addEventListener('click', () => this.logoutAdmin());
    document.getElementById('admin-gate-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitAdminGate();
    });
    if (!this.adminApiKey) this.showAdminGate();
    else this.loadProducts();
    this.restoreStorefrontDirty?.();
    if (refreshedWhileOpen) this.saveOpenEditorAsDraftAfterRefresh?.();
    this.setupEditorAutosave?.();
    this.updateParkedDraftBanner?.();
    this.updateLastTemplateButton?.();
    window.addEventListener('pagehide', () => {
      if (!document.body.classList.contains('admin-editor-open')) return;
      this.parkEditorDraft?.(true);
      this.markEditorOpen(true);
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        if (document.body.classList.contains('admin-editor-open')) {
          e.preventDefault();
          this.parkEditorDraft?.(true);
          this.saveDraft?.({ andNew: false });
        }
        return;
      }
      if (e.key === 'Escape') {
        const lightbox = document.getElementById('photo-lightbox');
        if (lightbox && !lightbox.classList.contains('hidden')) {
          e.preventDefault();
          if (typeof this.closeLightbox === 'function') this.closeLightbox();
          return;
        }
        const review = document.getElementById('ai-review-overlay');
        if (review && !review.classList.contains('hidden')) {
          e.preventDefault();
          this.closeAiReviewOverlay?.();
          return;
        }
        if (document.body.classList.contains('admin-editor-open')) this.cancelProductEdit();
      }
    });
  },

  /** Напоминание: Worker уже обновлён, а data/products.json на витрине — ещё нет */
  restoreStorefrontDirty() {
    try {
      const raw = sessionStorage.getItem('vigsharm_storefront_dirty');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.dirty) {
        this._storefrontDirty = true;
        this._storefrontDirtyReason = data.reason || '';
        this.updateStorefrontSyncUi();
      }
    } catch { /* ignore */ }
  },

  markStorefrontDirty(reason = '') {
    this._storefrontDirty = true;
    this._storefrontDirtyReason = reason || '';
    try {
      sessionStorage.setItem(
        'vigsharm_storefront_dirty',
        JSON.stringify({ dirty: true, reason: this._storefrontDirtyReason, at: Date.now() })
      );
    } catch { /* ignore */ }
    this.updateStorefrontSyncUi();
  },

  clearStorefrontDirty() {
    this._storefrontDirty = false;
    this._storefrontDirtyReason = '';
    try { sessionStorage.removeItem('vigsharm_storefront_dirty'); } catch { /* ignore */ }
    this.updateStorefrontSyncUi();
  },

  dismissStorefrontDirty() {
    this.clearStorefrontDirty();
    this.toast('Напоминание скрыто. Кнопка «Обновить каталог» остаётся в шапке списка', 'info');
  },

  updateStorefrontSyncUi() {
    const banner = document.getElementById('storefront-sync-banner');
    const reasonEl = document.getElementById('storefront-sync-reason');
    const btn = document.getElementById('export-storefront-btn');
    const dirty = !!this._storefrontDirty;
    if (banner) {
      banner.classList.toggle('hidden', !dirty);
      banner.hidden = !dirty;
    }
    if (reasonEl && dirty) {
      const map = {
        published: 'Только что опубликовали товар — без снимка на витрине останется старое.',
        unpublished: 'Сняли с сайта — обновите products.json, чтобы карточка пропала с витрины.',
        price: 'Цена на сайте в Worker изменилась — обновите снимок для витрины.',
        deleted: 'Товар удалён в Worker — обновите снимок, чтобы убрать его с витрины.',
        updated: 'Опубликованный товар изменили — витрине нужен свежий products.json.'
      };
      reasonEl.textContent = map[this._storefrontDirtyReason] ||
        'Скачайте products.json и положите в data/ — иначе на сайте останется старое.';
    }
    if (btn) {
      btn.classList.toggle('is-attention', dirty);
      btn.textContent = dirty ? 'Обновить каталог · нужно' : 'Обновить каталог для сайта';
    }
  },

  async offerStorefrontExportAfterPublish() {
    const ok = confirm(
      'Товар сохранён в Worker.\n\nСкачать products.json для витрины сейчас?\n(Положите файл в data/products.json и задеплойте сайт.)'
    );
    if (ok) await this.exportStorefrontSnapshot({ quiet: true });
  },

  showPhotoUploadProgress(pct, text) {
    const wrap = document.getElementById('photo-upload-progress');
    const fill = document.getElementById('photo-upload-progress-fill');
    const label = document.getElementById('photo-upload-progress-text');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    wrap.hidden = false;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
    if (label && text) label.textContent = text;
  },

  hidePhotoUploadProgress() {
    const wrap = document.getElementById('photo-upload-progress');
    const fill = document.getElementById('photo-upload-progress-fill');
    if (!wrap) return;
    wrap.classList.add('hidden');
    wrap.hidden = true;
    if (fill) fill.style.width = '0%';
  },

  LAST_TEMPLATE_KEY: 'vigsharm_last_product_template',

  rememberLastProductTemplate(data) {
    try {
      const tags = Array.isArray(data?.tags) ? data.tags : [];
      const checks = {};
      document.querySelectorAll(
        '#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input, #product-form input[type="checkbox"]'
      ).forEach((cb) => {
        if (cb.id) checks[cb.id] = !!cb.checked;
      });
      const payload = {
        v: 1,
        savedAt: Date.now(),
        category: data?.category || '',
        scene: data?.scene || this.currentProduct?.scene || 'auto',
        tags,
        checks,
        client_options: data?.client_options && typeof data.client_options === 'object'
          ? { ...data.client_options }
          : {},
        title: data?.title || ''
      };
      localStorage.setItem(this.LAST_TEMPLATE_KEY, JSON.stringify(payload));
      this.updateLastTemplateButton();
    } catch (e) {
      if (this.isStorageQuotaError?.(e)) {
        try { localStorage.removeItem(this.LAST_TEMPLATE_KEY); } catch { /* ignore */ }
      } else {
        console.warn('[last template]', e);
      }
    }
  },

  readLastProductTemplate() {
    try {
      const raw = localStorage.getItem(this.LAST_TEMPLATE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.v === 1 ? data : null;
    } catch {
      return null;
    }
  },

  updateLastTemplateButton() {
    const btn = document.getElementById('template-from-last-btn');
    if (!btn) return;
    const t = this.readLastProductTemplate();
    btn.hidden = !t;
    if (t) {
      const label = (t.title || t.category || 'прошлый').slice(0, 28);
      btn.title = `Категория, сцена и теги как у «${label}»`;
    }
  },

  applyLastProductTemplate(opts = {}) {
    const t = this.readLastProductTemplate();
    if (!t) {
      this.toast('Пока нет шаблона — сохраните хотя бы один товар', 'info');
      return;
    }
    const tagsOnly = !!opts.tagsOnly;

    if (!tagsOnly) {
      const cat = document.getElementById('product-category');
      if (cat && t.category) cat.value = t.category;
      if (t.scene) {
        this.setScene?.(t.scene);
      }
    }

    const tagSet = new Set(Array.isArray(t.tags) ? t.tags : []);
    document.querySelectorAll(
      '#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input'
    ).forEach((cb) => {
      cb.checked = tagSet.has(cb.value) || !!(t.checks && t.checks[cb.id]);
    });

    if (!tagsOnly && t.checks) {
      Object.entries(t.checks).forEach(([id, checked]) => {
        if (id.startsWith('tags-') || id.includes('tag')) return;
        const el = document.getElementById(id);
        if (el && el.type === 'checkbox' && !el.closest('#tags-for-who, #tags-occasion, #tags-dates, #tags-type')) {
          // Не трогаем show-on-site и прочие критичные — только клиентские опции
          if (id === 'show-on-site') return;
          el.checked = !!checked;
        }
      });
    }

    this.currentProduct.tags = Array.isArray(t.tags) ? [...t.tags] : [];
    this.toast(tagsOnly ? 'Теги как у прошлого' : 'Категория и теги как у прошлого', 'success');
  },

  // === Локальный черновик формы (выход без потери + автосейв) ===
  EDITOR_PARK_KEY: 'vigsharm_editor_park',
  EDITOR_OPEN_FLAG: 'vigsharm_editor_open',

  valById(id) {
    return document.getElementById(id)?.value ?? '';
  },

  editorHasMeaningfulContent() {
    const title = this.valById('product-title').trim();
    const price = this.valById('product-price').trim();
    const composition = this.valById('product-composition').trim();
    const photos = this.currentProduct?.photos?.length || 0;
    return !!(title || price || composition || photos || this.currentProduct?.id);
  },

  collectEditorParkPayload() {
    if (!this.editorHasMeaningfulContent()) return null;
    const fieldIds = [
      'product-title', 'product-article', 'product-slug', 'product-price', 'product-budget',
      'product-category', 'product-composition', 'product-short-desc', 'product-full-desc',
      'product-seo-title', 'product-seo-desc', 'product-character', 'product-age', 'product-series',
      'rental-item', 'scene-select', 'unit-balloon-size'
    ];
    const fields = {};
    fieldIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) fields[id] = el.value;
    });
    const checks = {};
    document.querySelectorAll(
      '#tags-for-who input, #tags-occasion input, #tags-dates input, #tags-type input, #product-form input[type="checkbox"]'
    ).forEach((cb) => {
      if (cb.id) checks[cb.id] = !!cb.checked;
    });
    const photos = (this.currentProduct?.photos || []).map((p) => {
      const url = this.parkableMediaUrl(p.url);
      return {
        id: p.id,
        url,
        uploaded: !!p.uploaded,
        type: p.type || undefined
      };
    });
    return {
      v: 1,
      savedAt: Date.now(),
      productId: this.currentProduct?.id || null,
      status: this.currentProduct?.status || 'draft',
      scene: this.currentProduct?.scene || fields['scene-select'] || 'auto',
      tags: this.currentProduct?.tags || [],
      client_options: this.currentProduct?.client_options || {},
      unit_type: this.getUnitBalloonType?.() || '',
      fields,
      checks,
      photos,
      studio: {
        sourceUrl: this.parkableMediaUrl(this.studioSourceUrl),
        masterUrl: this.parkableMediaUrl(this.studioMasterDataUrl || this.studioCompare?.master),
        originalUrl: this.parkableMediaUrl(this.studioCompare?.original),
        hasIdbDraft: !this.currentProduct?.id
      },
      title: fields['product-title'] || 'Без названия'
    };
  },

  /** Только короткие http(s) — data-URL в localStorage раздувают квоту. Master живёт в IndexedDB. */
  parkableMediaUrl(url) {
    const s = String(url || '');
    if (!/^https?:\/\//i.test(s)) return '';
    if (s.length > 4000) return '';
    return s;
  },

  isStorageQuotaError(e) {
    const name = String(e?.name || '');
    const msg = String(e?.message || e || '');
    return name === 'QuotaExceededError'
      || name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || e?.code === 22
      || /quota|exceeded/i.test(msg);
  },

  slimEditorParkPayload(payload, level) {
    const base = {
      ...payload,
      photos: [],
      studio: { hasIdbDraft: true }
    };
    if (level !== 'http') return base;
    base.photos = (payload.photos || [])
      .map((p) => ({
        id: p.id,
        url: this.parkableMediaUrl(p.url),
        uploaded: !!p.uploaded,
        type: p.type || undefined
      }))
      .filter((p) => p.url);
    const st = payload.studio || {};
    base.studio = {
      sourceUrl: this.parkableMediaUrl(st.sourceUrl),
      masterUrl: this.parkableMediaUrl(st.masterUrl),
      originalUrl: this.parkableMediaUrl(st.originalUrl),
      hasIdbDraft: true
    };
    return base;
  },

  writeEditorParkPayload(payload) {
    const attempts = [
      payload,
      this.slimEditorParkPayload(payload, 'http'),
      this.slimEditorParkPayload(payload, 'meta')
    ];
    let lastErr = null;
    for (const body of attempts) {
      try {
        localStorage.setItem(this.EDITOR_PARK_KEY, JSON.stringify(body));
        return true;
      } catch (e) {
        lastErr = e;
        if (!this.isStorageQuotaError(e)) break;
        try { localStorage.removeItem(this.EDITOR_PARK_KEY); } catch { /* ignore */ }
      }
    }
    if (this.isStorageQuotaError(lastErr)) {
      console.warn('[editor park] квота localStorage — поля без тяжёлых фото (Master в IndexedDB)');
    } else if (lastErr) {
      console.warn('[editor park]', lastErr);
    }
    return false;
  },

  parkEditorDraft(silent = false) {
    const payload = this.collectEditorParkPayload();
    if (!payload) {
      if (!silent) this.discardParkedEditorDraft(false);
      return false;
    }
    if (this.writeEditorParkPayload(payload)) {
      this._editorParkedAt = payload.savedAt;
      this.updateEditorAutosaveHint(payload.savedAt);
      this.updateParkedDraftBanner();
      return true;
    }
    if (!silent) this.toast('Не удалось сохранить локальный черновик (мало места?)', 'error');
    return false;
  },

  readParkedEditorDraft() {
    try {
      const raw = localStorage.getItem(this.EDITOR_PARK_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.v === 1 ? data : null;
    } catch {
      return null;
    }
  },

  hasParkedEditorDraft() {
    return !!this.readParkedEditorDraft();
  },

  discardParkedEditorDraft(toast = false) {
    try { localStorage.removeItem(this.EDITOR_PARK_KEY); } catch { /* ignore */ }
    this._editorParkedAt = null;
    this.updateParkedDraftBanner();
    this.updateEditorAutosaveHint('');
    if (toast) this.toast('Локальный черновик удалён', 'info');
  },

  updateParkedDraftBanner() {
    const banner = document.getElementById('editor-park-banner');
    const reason = document.getElementById('editor-park-reason');
    const draft = this.readParkedEditorDraft();
    const show = !!draft && !document.body.classList.contains('admin-editor-open');
    if (banner) {
      banner.classList.toggle('hidden', !show);
      banner.hidden = !show;
    }
    if (reason && draft) {
      const when = new Date(draft.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const label = (draft.title || 'Без названия').slice(0, 48);
      reason.textContent = `«${label}» · автосейв ${when}. Не на сервере — «Продолжить» или сохраните черновиком из редактора`;
    }
  },

  updateEditorAutosaveHint(ts) {
    let el = document.getElementById('editor-autosave-hint');
    if (!el) {
      const anchor = document.getElementById('editor-progress') || document.querySelector('.editor-header');
      if (!anchor) return;
      el = document.createElement('p');
      el.id = 'editor-autosave-hint';
      el.className = 'editor-autosave-hint';
      anchor.insertAdjacentElement('afterend', el);
    }
    if (!ts) {
      el.textContent = 'Ctrl+S — черновик на сервер · автосейв локально';
      return;
    }
    const when = new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.textContent = `Локальный автосейв ${when} · Ctrl+S — на сервер`;
  },

  setupEditorAutosave() {
    if (this._editorAutosaveWired) return;
    this._editorAutosaveWired = true;
    const form = document.getElementById('product-form');
    if (form) {
      form.addEventListener('input', () => {
        clearTimeout(this._editorParkDebounce);
        this._editorParkDebounce = setTimeout(() => {
          if (document.body.classList.contains('admin-editor-open')) this.parkEditorDraft(true);
        }, 1200);
      });
      form.addEventListener('change', () => {
        if (document.body.classList.contains('admin-editor-open')) this.parkEditorDraft(true);
      });
    }
    setInterval(() => {
      if (document.body.classList.contains('admin-editor-open') && this.editorHasMeaningfulContent()) {
        this.parkEditorDraft(true);
      }
    }, 30000);
    this.updateEditorAutosaveHint('');
  },

  consumeEditorOpenFlag() {
    try {
      const open = sessionStorage.getItem(this.EDITOR_OPEN_FLAG) === '1';
      sessionStorage.removeItem(this.EDITOR_OPEN_FLAG);
      return open;
    } catch {
      return false;
    }
  },

  markEditorOpen(open) {
    try {
      if (open) sessionStorage.setItem(this.EDITOR_OPEN_FLAG, '1');
      else sessionStorage.removeItem(this.EDITOR_OPEN_FLAG);
    } catch { /* ignore */ }
  },

  /** Обновление при открытом редакторе: сохранить на сервер черновиком и не открывать окно снова. */
  async saveOpenEditorAsDraftAfterRefresh() {
    if (this._flushingRefreshDraft) return;
    this._flushingRefreshDraft = true;
    try {
      const parked = this.readParkedEditorDraft();
      const studio = await this.loadActiveStudioDraft?.();
      if (!parked && !studio?.masterUrl) return;

      if (parked) await this.restoreParkedEditorDraft({ keepClosed: true });
      const snap = {
        title: document.getElementById('product-title')?.value || '',
        price: document.getElementById('product-price')?.value || '',
        composition: document.getElementById('product-composition')?.value || ''
      };
      const needsStudio = !!(studio?.masterUrl) && !(this.currentProduct?.photos || []).some((p) => p.url);
      if (needsStudio || (!parked && studio?.masterUrl)) {
        await this.restoreActiveStudioDraftIfAny?.({ keepClosed: true });
        const put = (id, value) => {
          const el = document.getElementById(id);
          if (el && value) el.value = value;
        };
        put('product-title', snap.title);
        put('product-price', snap.price);
        put('product-composition', snap.composition);
      }
      if (!this.editorHasMeaningfulContent?.()) return;

      const titleEl = document.getElementById('product-title');
      if (titleEl && !titleEl.value.trim()) titleEl.value = 'Черновик';

      const status = this.currentProduct?.status === 'published' ? 'published' : 'draft';
      await this.saveProduct(status, { andNew: false });
    } catch (err) {
      console.warn('[editor] refresh draft save failed:', err);
      this.toast('Не удалось убрать карточку в черновик. Она в зелёном баннере — «Продолжить».', 'error');
    } finally {
      this._flushingRefreshDraft = false;
    }
  },

  async restoreParkedEditorDraft(opts = {}) {
    const keepClosed = !!opts.keepClosed;
    const draft = this.readParkedEditorDraft();
    if (!draft) {
      this.toast('Локальный черновик не найден', 'error');
      this.updateParkedDraftBanner();
      return;
    }
    this.resetForm({ preserveStudioDraft: true });
    this.currentProduct = {
      id: draft.productId || null,
      status: draft.status || 'draft',
      photos: [],
      scene: draft.scene || 'auto',
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      client_options: draft.client_options && typeof draft.client_options === 'object'
        ? { ...draft.client_options }
        : {}
    };

    Object.entries(draft.fields || {}).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el && value != null) el.value = value;
    });
    Object.entries(draft.checks || {}).forEach(([id, checked]) => {
      const el = document.getElementById(id);
      if (el && el.type === 'checkbox') el.checked = !!checked;
    });

    const sceneSelect = document.getElementById('scene-select');
    if (sceneSelect) sceneSelect.value = draft.scene || 'auto';
    this.currentProduct.scene = draft.scene || 'auto';
    this.syncSceneRailUi?.(this.currentProduct.scene);

    this.currentProduct.photos = (draft.photos || [])
      .filter((p) => p.url)
      .map((p) => ({
        id: p.id || Date.now() + Math.random(),
        url: p.url,
        uploaded: !!p.uploaded,
        type: p.type
      }));

    if (draft.studio) {
      this.studioSourceUrl = draft.studio.sourceUrl || draft.studio.originalUrl || null;
      this.studioMasterDataUrl = draft.studio.masterUrl || null;
      this.studioMasterBackupUrl = draft.studio.masterUrl || null;
      this.studioMasterBaseUrl = draft.studio.masterUrl || null;
      this.studioCompare = {
        original: draft.studio.originalUrl || draft.studio.sourceUrl || null,
        master: draft.studio.masterUrl || null
      };
    }

    this.renderPhotos?.();
    this.renderStudioCompare?.();
    this.syncStudioModeHint?.();
    this.setUnitBalloonType?.(draft.unit_type || draft.client_options?.unit_type || '');
    this.setUnitBalloonWho?.(draft.unit_who || draft.client_options?.unit_who || '');
    this.setUnitHoliday?.(draft.client_options?.unit_holiday || '');
    this.syncEditorSteps?.();
    this.syncAIFillGate?.();
    this.syncAdvanceOrderFromScene?.();
    this.syncRequiredFieldHighlights?.();
    this.syncEditorTitle?.(draft.fields?.['product-title'] || '');

    if (!draft.productId) {
      const hasMaster = !!(draft.studio?.masterUrl || this.hasStudioMasterReady?.());
      const hasPhotos = (this.currentProduct.photos || []).length > 0;
      if (hasMaster || (draft.fields?.['product-composition'] || draft.fields?.['product-price'])) {
        this.goStep1Phase?.('c', { skipGate: true });
      } else {
        this.goStep1Phase?.('a', { skipGate: true });
      }
    }

    const modeLabel = document.getElementById('editor-mode-label');
    if (modeLabel) modeLabel.textContent = draft.productId ? 'РЕДАКТИРОВАНИЕ' : 'СОЗДАНИЕ';
    const titleEl = document.getElementById('editor-title');
    if (titleEl) titleEl.textContent = draft.title || 'Черновик';

    if (!keepClosed) this.switchTab('create');
    this.updateParkedDraftBanner();

    if (!draft.productId && draft.studio?.hasIdbDraft && !this.currentProduct.photos.length) {
      await this.restoreActiveStudioDraftIfAny?.({ keepClosed });
    }

    this.updateEditorAutosaveHint(draft.savedAt);
    if (!keepClosed) this.toast('Локальный черновик восстановлен', 'success');
  },

  // === Автозаполнение: артикул и slug ===
  wireFormHelpers() {
    const titleEl = document.getElementById('product-title');
    const slugEl = document.getElementById('product-slug');
    if (titleEl && slugEl) {
      titleEl.addEventListener('blur', () => {
        if (!slugEl.value.trim()) slugEl.value = this.slugify(titleEl.value);
      });
    }
    const articleEl = document.getElementById('product-article');
    if (articleEl && !articleEl.value) this.assignFreshArticle();

    const catEl = document.getElementById('product-category');
    if (catEl && !catEl.dataset.articleWired) {
      catEl.dataset.articleWired = '1';
      catEl.addEventListener('change', () => {
        if (!this.currentProduct?.id) this.assignFreshArticle();
        this.syncUnitBalloonForm?.(true);
        this.syncAdvanceOrderFromScene?.();
      });
    }

    const priceEl = document.getElementById('product-price');
    if (priceEl && !priceEl.dataset.budgetWired) {
      priceEl.dataset.budgetWired = '1';
      priceEl.addEventListener('change', () => {
        this.syncBudgetFromPrice?.();
        this.scheduleSaveActiveStudioDraft?.();
      });
      priceEl.addEventListener('input', () => {
        this.syncBudgetFromPrice?.();
        this.scheduleSaveActiveStudioDraft?.();
      });
    }

    const compEl = document.getElementById('product-composition');
    if (compEl && !compEl.dataset.optsWired) {
      compEl.dataset.optsWired = '1';
      const syncOpts = () => {
        this.syncAdvanceOrderFromScene?.();
        this.scheduleSaveActiveStudioDraft?.();
      };
      compEl.addEventListener('input', syncOpts);
      compEl.addEventListener('change', syncOpts);
    }

    ['product-title', 'product-short-desc', 'product-full-desc'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.optsWired) return;
      el.dataset.optsWired = '1';
      const syncOpts = () => this.syncAdvanceOrderFromScene?.();
      el.addEventListener('input', syncOpts);
      el.addEventListener('change', syncOpts);
    });

    this.syncUnitBalloonForm?.(false);
  },

  isUnitBalloonMode() {
    return (document.getElementById('product-category')?.value || '') === 'Шары поштучно';
  },

  syncUnitBalloonForm(fromUser = false) {
    const form = document.getElementById('product-form');
    const titleEl = document.getElementById('product-title');
    const catEl = document.getElementById('product-category');
    const sceneEl = document.getElementById('scene-select');

    // Сцена «Шар поштучно» → категория
    if (fromUser && sceneEl?.value === 'unit_balloon' && catEl && catEl.value !== 'Шары поштучно') {
      catEl.value = 'Шары поштучно';
      if (!this.currentProduct?.id) this.assignFreshArticle?.();
    }

    const unit = this.isUnitBalloonMode();
    if (form) form.classList.toggle('is-unit-balloon', unit);

    if (unit) {
      if (this.currentProduct) this.currentProduct.scene = 'unit_balloon';
      if (sceneEl && sceneEl.value !== 'unit_balloon') sceneEl.value = 'unit_balloon';
      if (titleEl) titleEl.placeholder = 'Точное название как у поставщика';
      if (!this.currentProduct?.id) this.assignFreshArticle?.();
      this.syncStudioModeHint?.();
      this.syncUnitCharacterWrap?.();
      this.syncUnitHolidayControl?.();
      this.scheduleUnitCharacterDetect?.();
    } else {
      if (fromUser && sceneEl?.value === 'unit_balloon') {
        if (this.currentProduct) this.currentProduct.scene = 'auto';
        sceneEl.value = 'auto';
      }
      if (titleEl) titleEl.placeholder = 'Например: Тёмный рыцарь';
      this.syncUnitCharacterWrap?.();
      this.syncUnitHolidayControl?.();
    }
    this.syncEditorSteps?.();
  },

  wireFilters() {
    ['search-products', 'filter-category', 'filter-status'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const resetAndRender = () => {
        this.listVisible = this.listPageSize;
        this.listGroupVisible = {};
        this.renderProducts();
      };
      el.addEventListener('input', resetAndRender);
      el.addEventListener('change', resetAndRender);
    });
  },

  showMoreProducts(groupId) {
    if (groupId) {
      const cur = this.listGroupVisible[groupId] || this.listPageSize;
      this.listGroupVisible[groupId] = cur + this.listPageSize;
    } else {
      this.listVisible += this.listPageSize;
    }
    this.renderProducts();
  },

  /** Полка внутри группы. Праздники — по дате, персонажи — по герою, поштучные — по подтипу. */
  productShelfLabel(groupId, product) {
    if (groupId === 'holidays') {
      const tags = [product.category].concat(product.tags || []).filter(Boolean);
      return LIST_HOLIDAYS.find((h) => tags.includes(h)) || product.category || 'Другое';
    }
    if (groupId === 'characters') {
      return String(product.character || product.character_name || '').trim() || 'Без имени';
    }
    if (groupId === 'unit') {
      const UNIT_SHELF_ORDER = ['Шары с рисунком', 'Ходячие фигуры', 'Круги, звёзды и сердца', 'Фольгированные фигуры', 'Латексные шары'];
      const allTags = [product.category].concat(product.tags || []).filter(Boolean);
      const found = UNIT_SHELF_ORDER.find((s) => allTags.includes(s));
      if (found) return found;
      if (LIST_HOLIDAYS.includes(product.category)) return product.category;
      return 'Разное';
    }
    return product.category || 'Без категории';
  },

  renderGroupBody(groupId, items, searching) {
    if (!items.length) return '';

    // Для праздников и поштучных — всегда раскладываем по полкам
    const alwaysShelve = !searching && (groupId === 'holidays' || groupId === 'unit');
    if (alwaysShelve) {
      const UNIT_SHELF_ORDER = ['Шары с рисунком', 'Ходячие фигуры', 'Круги, звёзды и сердца', 'Фольгированные фигуры', 'Латексные шары'];
      const shelfOrder = groupId === 'holidays' ? LIST_HOLIDAYS : [...UNIT_SHELF_ORDER, ...LIST_HOLIDAYS, 'Разное'];
      const buckets = new Map();
      items.forEach((p) => {
        const label = this.productShelfLabel(groupId, p);
        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label).push(p);
      });
      const sorted = [...buckets.entries()].sort((a, b) => {
        const ai = shelfOrder.indexOf(a[0]);
        const bi = shelfOrder.indexOf(b[0]);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a[0].localeCompare(b[0], 'ru');
      });
      if (sorted.length <= 1) return items.map((p) => this.renderProductRow(p)).join('');
      return sorted.map(([label, shelfItems]) => {
        const key = `${groupId}::${label}`;
        const subOpen = !!(this.listExpandedSubgroups && this.listExpandedSubgroups[key]);
        const labelJs = String(label).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const rows = subOpen ? shelfItems.map((p) => this.renderProductRow(p)).join('') : '';
        return `
          <section class="product-subgroup${subOpen ? ' is-open' : ''}">
            <button type="button" class="product-subgroup-header" onclick="app.toggleListSubgroup('${groupId}', '${labelJs}')" aria-expanded="${subOpen}">
              <strong>${this.escapeHtml(label)}</strong>
              <span class="product-subgroup-count">${shelfItems.length}</span>
              <span class="product-subgroup-toggle" aria-hidden="true">${subOpen ? '−' : '+'}</span>
            </button>
            <div class="product-subgroup-body${subOpen ? '' : ' hidden'}">${rows}</div>
          </section>`;
      }).join('');
    }

    // Остальные группы: первые 20 плоско, дальше по полкам
    const freshCount = 20;
    const split = !searching && items.length > freshCount;
    const fresh = split ? items.slice(0, freshCount) : items;
    const rest = split ? items.slice(freshCount) : [];
    const freshHtml = (split ? '<p class="product-fresh-label">Новые</p>' : '')
      + fresh.map((p) => this.renderProductRow(p)).join('');
    if (!rest.length) return freshHtml;

    const buckets = new Map();
    rest.forEach((p) => {
      const label = this.productShelfLabel(groupId, p);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(p);
    });
    const shelves = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
    const shelvesHtml = shelves.map(([label, shelfItems]) => {
      const key = `${groupId}::${label}`;
      const subOpen = !!(this.listExpandedSubgroups && this.listExpandedSubgroups[key]);
      const labelJs = String(label).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const rows = subOpen ? shelfItems.map((p) => this.renderProductRow(p)).join('') : '';
      return `
        <section class="product-subgroup${subOpen ? ' is-open' : ''}">
          <button type="button" class="product-subgroup-header" onclick="app.toggleListSubgroup('${groupId}', '${labelJs}')" aria-expanded="${subOpen}">
            <strong>${this.escapeHtml(label)}</strong>
            <span class="product-subgroup-count">${shelfItems.length}</span>
            <span class="product-subgroup-toggle" aria-hidden="true">${subOpen ? '−' : '+'}</span>
          </button>
          <div class="product-subgroup-body${subOpen ? '' : ' hidden'}">${rows}</div>
        </section>`;
    }).join('');
    return freshHtml + shelvesHtml;
  },

  toggleListSubgroup(groupId, label) {
    const key = `${groupId}::${label}`;
    this.listExpandedSubgroups = this.listExpandedSubgroups || {};
    this.listExpandedSubgroups[key] = !this.listExpandedSubgroups[key];
    this.renderProducts();
  },

  toggleListGroup(groupId) {
    this.listExpandedGroups = this.listExpandedGroups || {};
    const opening = !this.listExpandedGroups[groupId];
    if (opening) {
      Object.keys(this.listExpandedGroups).forEach((id) => {
        if (id !== groupId) this.listExpandedGroups[id] = false;
      });
    }
    this.listExpandedGroups[groupId] = opening;
    if (opening && !this.listGroupVisible[groupId]) {
      this.listGroupVisible[groupId] = this.listPageSize;
    }
    this.renderProducts();
  },

  productListGroupId(p) {
    const tags = [p.category].concat(p.tags || []).filter(Boolean);
    const isUnit = p.category === 'Шары поштучно' || tags.includes('Шары поштучно');
    const isHoliday = tags.some((t) => LIST_HOLIDAYS.includes(t));
    const hasChar = !!(String(p.character || p.character_name || '').trim());
    if (isUnit) return 'unit';
    if (isHoliday) return 'holidays';
    if (hasChar) return 'characters';
    return 'ready';
  },

  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  nextArticle(category) {
    const prefix = this.articlePrefixFor(category || document.getElementById('product-category')?.value);
    const used = new Set(
      (this.products || []).map((p) => String(p.article || '').trim().toUpperCase()).filter(Boolean)
    );
    let n = 1;
    let candidate;
    do {
      candidate = `${prefix}-${String(n).padStart(3, '0')}`;
      n += 1;
    } while (used.has(candidate) && n < 10000);
    return candidate;
  },

  articlePrefixFor(category) {
    const map = {
      'Для мальчика': 'BOY',
      'Для девочки': 'GRL',
      'Универсальные': 'UNI',
      'Для неё': 'HER',
      'Для мамы': 'MOM',
      'Для него': 'HIM',
      'Геймерам': 'GMR',
      'Юбилей': 'JUB',
      '1 годик': 'Y1',
      'Крещение': 'CHR',
      'Гендер-пати': 'GND',
      'На выписку': 'BAB',
      'Свадьба и девичник': 'WED',
      'Выпускной': 'GRD',
      'Новый год': 'NY',
      '14 февраля': 'V14',
      '23 февраля': 'F23',
      '8 марта': 'M8',
      '1 сентября': 'S1',
      'Фигуры из шаров': 'FIG',
      'Напольные композиции': 'FLR',
      'Букет из шаров': 'BQT',
      'Цветы из шаров': 'FLW',
      'Крафтовый букет': 'CRF',
      'Шар-сюрприз': 'SUR',
      'Коробка-сюрприз': 'BOX',
      'Фотозона': 'PHT',
      'Арка из шаров': 'ARK',
      'Шары поштучно': 'UNT'
    };
    return map[category] || 'DG';
  },

  assignFreshArticle() {
    const articleEl = document.getElementById('product-article');
    if (!articleEl) return;
    // При редактировании существующего — не меняем артикул
    if (this.currentProduct?.id && articleEl.value.trim()) return;
    const cat = document.getElementById('product-category')?.value || '';
    articleEl.value = this.nextArticle(cat);
  },

  slugify(str) {
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    return String(str || '').toLowerCase().split('')
      .map(ch => (map[ch] !== undefined ? map[ch] : ch)).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  },

  newProduct() {
    if (this.hasParkedEditorDraft?.()) {
      const keep = confirm(
        'Есть локальный черновик (ещё не на сервере).\n\nОК — продолжить его\nОтмена — оставить его в баннере и открыть новую пустую карточку'
      );
      if (keep) {
        this.restoreParkedEditorDraft();
        return;
      }
      // Не удаляем parked — баннер останется; просто новая пустая форма
    }
    this.resetForm();
    this.switchTab('create');
    this.updateParkedDraftBanner?.();
    this.toast('Новая карточка', 'info');
  },

  /** Отложить текущее локально и сразу открыть новую карточку (без удаления parked). */
  parkAndNewProduct() {
    if (document.getElementById('product-form')?.classList.contains('is-studio-busy')) {
      this.toast('Дождитесь окончания Master — потом можно отложить', 'info');
      return;
    }
    if (this.editorHasMeaningfulContent?.()) {
      this.parkEditorDraft?.(true);
    }
    this.clearActiveStudioDraft?.();
    this.resetForm();
    this.switchTab('create');
    this.updateParkedDraftBanner?.();
    this.toast('Отложено локально. Новая карточка — прежнюю вернёте из зелёного баннера', 'success');
  },

  readAdminSettings() {
    try {
      const saved = localStorage.getItem('vigsharm_admin_settings');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  },

  writeAdminSettings(patch = {}) {
    const settings = { ...this.readAdminSettings(), ...patch };
    localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
    return settings;
  },

  loadSettings() {
    try {
      const settings = this.readAdminSettings();
      const legacyWorker = 'https://vigsharm-api.vigsharm.workers.dev';
      const savedWorker = String(settings.workerUrl || '').replace(/\/$/, '');
      this.workerUrl = (!savedWorker || savedWorker === legacyWorker)
        ? (this.workerUrl || 'https://api.vigsharm.ru')
        : savedWorker;
      if (savedWorker === legacyWorker) {
        settings.workerUrl = this.workerUrl;
        localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
      }
      this.adminApiKey = settings.adminApiKey || '';
      this.cloudinaryCloudName = settings.cloudinaryCloudName || '';
      this.cloudinaryUploadPreset = settings.cloudinaryUploadPreset || '';
      this.imgbbApiKey = settings.imgbbApiKey || '';

      // Миграция: удаляем старый небезопасный ключ
      if (settings.nordrouterKey) {
        delete settings.nordrouterKey;
        localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
        console.warn('⚠️ NordRouter API ключ удалён из localStorage (теперь хранится в Worker secrets)');
      }

      // Загружаем эталонный фон и руку
      this.studioReferenceBackgroundUrl = settings.studioReferenceBackgroundUrl || '';
      this.studioReferenceHandUrl = settings.studioReferenceHandUrl || '';
      this.studioReferenceHandVersion = settings.studioReferenceHandVersion || '';

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };
      setVal('worker-url', this.workerUrl);
      setVal('admin-api-key', this.adminApiKey);
      setVal('cloudinary-cloud-name', this.cloudinaryCloudName);
      setVal('cloudinary-upload-preset', this.cloudinaryUploadPreset);
      setVal('imgbb-api-key', this.imgbbApiKey);
    } catch (e) {}
  },

  saveSettings() {
    this.workerUrl = document.getElementById('worker-url')?.value.trim() || this.workerUrl || '';
    this.adminApiKey = document.getElementById('admin-api-key')?.value.trim() || '';
    this.cloudinaryCloudName = document.getElementById('cloudinary-cloud-name')?.value.trim() || '';
    this.cloudinaryUploadPreset = document.getElementById('cloudinary-upload-preset')?.value.trim() || '';
    this.imgbbApiKey = document.getElementById('imgbb-api-key')?.value.trim() || '';
    try {
      // Важно: merge, а не замена объекта — иначе Cloudinary/эталоны сбрасываются
      this.writeAdminSettings({
        workerUrl: this.workerUrl,
        adminApiKey: this.adminApiKey,
        cloudinaryCloudName: this.cloudinaryCloudName,
        cloudinaryUploadPreset: this.cloudinaryUploadPreset,
        imgbbApiKey: this.imgbbApiKey,
        studioReferenceBackgroundUrl: this.studioReferenceBackgroundUrl || '',
        studioReferenceHandUrl: this.studioReferenceHandUrl || '',
        studioReferenceHandVersion: this.studioReferenceHandVersion || ''
      });
      this.toast('Настройки сохранены', 'success');
    } catch (e) {
      this.toast('Ошибка сохранения', 'error');
    }
  },

  installAuthGate() {
    if (this._authGateInstalled) return;
    this._authGateInstalled = true;
    const orig = window.fetch.bind(window);
    const self = this;
    window.fetch = async function (input, init) {
      const res = await orig(input, init);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (res.status === 401 && self.workerUrl && String(url).indexOf(self.workerUrl) === 0) {
          self.showAdminGate(true);
        }
      } catch (e) { /* ignore */ }
      return res;
    };
  },

  showAdminGate(badKey) {
    const gate = document.getElementById('admin-gate');
    const err = document.getElementById('admin-gate-error');
    const input = document.getElementById('admin-gate-key');
    if (!gate) return;
    if (err) err.hidden = !badKey;
    if (input && !badKey) input.value = '';
    gate.classList.remove('hidden');
    input?.focus();
  },

  hideAdminGate() {
    document.getElementById('admin-gate')?.classList.add('hidden');
    const err = document.getElementById('admin-gate-error');
    if (err) err.hidden = true;
  },

  submitAdminGate() {
    const value = document.getElementById('admin-gate-key')?.value.trim() || '';
    if (!value) return;
    this.adminApiKey = value;
    this.writeAdminSettings({ adminApiKey: value });
    const field = document.getElementById('admin-api-key');
    if (field) field.value = value;
    this.hideAdminGate();
    this.loadProducts();
    this.toast('Ключ сохранён', 'success');
  },

  logoutAdmin() {
    this.adminApiKey = '';
    this.writeAdminSettings({ adminApiKey: '' });
    const field = document.getElementById('admin-api-key');
    if (field) field.value = '';
    this.showAdminGate(false);
  },

  clearSettings() {
    if (!confirm('Удалить настройки подключения (Worker, ключ, Cloudinary)? Черновики товаров не трогаем.')) return;
    try {
      localStorage.removeItem('vigsharm_admin_settings');
    } catch (e) { /* ignore */ }
    this.workerUrl = 'https://api.vigsharm.ru';
    this.adminApiKey = '';
    this.cloudinaryCloudName = '';
    this.cloudinaryUploadPreset = '';
    this.imgbbApiKey = '';
    this.studioReferenceBackgroundUrl = '';
    this.studioReferenceHandUrl = '';
    this.studioReferenceHandVersion = '';
    this.loadSettings();
    this.updateReferenceBackgroundUI?.();
    this.updateReferenceHandUI?.();
    this.toast('Настройки очищены', 'success');
  },

  setupTabs() {
    document.querySelectorAll('.header-link[data-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(link.dataset.tab);
      });
    });
  },

  switchTab(tab) {
    document.querySelectorAll('.header-link[data-tab]').forEach(l => {
      l.classList.toggle('active', l.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      const on = c.id === `tab-${tab}`;
      c.classList.toggle('hidden', !on);
      // native [hidden] — страховка, если CSS-класс .hidden перебьют
      if (on) c.removeAttribute('hidden');
      else c.setAttribute('hidden', '');
      c.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    if (tab !== 'create') {
      document.body.classList.remove('admin-editor-open');
      this.markEditorOpen?.(false);
      this.updateParkedDraftBanner?.();
    } else {
      document.body.classList.add('admin-editor-open');
      this.markEditorOpen?.(true);
      this.updateParkedDraftBanner?.();
      this.updateEditorAutosaveHint?.(this._editorParkedAt || '');
      window.scrollTo(0, 0);
    }
    if (tab === 'orders') this.loadOrders?.();
    if (tab === 'price') this.loadPriceList?.();
  },

  async loadProductsSnapshot() {
    const res = await fetch('../data/products.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data && data.products);
    if (!Array.isArray(list) || !list.length) throw new Error('пустой снимок');
    return list;
  },

  async loadProducts() {
    const container = document.getElementById('products-list');
    const showSnapshot = async () => {
      const list = await this.loadProductsSnapshot();
      this.products = list;
      this.catalogFromSnapshot = true;
      this.renderProducts();
      this.toast('Каталог из снимка сайта (API недоступен). Сохранение заработает, когда API ответит.', 'info');
    };
    if (!this.workerUrl) {
      try {
        await showSnapshot();
      } catch (e) {
        if (container) container.innerHTML = '<div class="empty-state"><div class="icon">🔗</div><div class="title">Worker не настроен</div><p class="text-muted mt-1">Укажите Worker API URL во вкладке «Настройки»</p></div>';
      }
      return;
    }
    try {
      const res = await fetch(`${this.workerUrl}/api/products`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 401 ? ' — нужен ключ администратора' : ''));
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Ответ API без ok');
      this.catalogFromSnapshot = false;
      this.products = data.products || [];
      this.renderProducts();
    } catch (e) {
      console.error('Failed to load products', e);
      try {
        await showSnapshot();
      } catch (snapErr) {
        const msg = (e && (e.name === 'TimeoutError' || e.name === 'AbortError'))
          ? 'сервер не ответил'
          : (e && e.message ? e.message : 'неизвестная ошибка');
        if (container) {
          container.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div class="title">Загрузка не удалась</div><p class="text-muted mt-1">' + this.escapeHtml(msg) + '</p></div>';
        }
      }
    }
  },

  /**
   * Снимок каталога для витрины (data/products.json).
   * Браузер не пишет в репозиторий — скачивает файл; дальше положить в data/ или:
   *   node scripts/export-products-snapshot.mjs
   */
  async exportStorefrontSnapshot(opts = {}) {
    const quiet = !!opts.quiet;
    const btn = document.getElementById('export-storefront-btn');
    const prev = btn ? btn.textContent : '';
    if (!this.workerUrl) {
      alert('Укажите Worker API URL во вкладке «Настройки».');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Выгрузка…';
    }
    try {
      const res = await fetch(`${this.workerUrl}/api/products?full=1`, {
        cache: 'no-store',
        headers: this.authHeaders()
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data || data.ok !== true || !Array.isArray(data.products) || !data.products.length) {
        throw new Error('Пустой или неверный ответ API');
      }
      const blob = new Blob(
        [JSON.stringify({ ok: true, products: data.products }, null, 2) + '\n'],
        { type: 'application/json;charset=utf-8' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'products.json';
      a.click();
      URL.revokeObjectURL(a.href);
      this.clearStorefrontDirty();
      if (quiet) {
        this.toast(`Скачан products.json (${data.products.length} товаров) → data/`, 'success');
      } else {
        alert(
          `Скачан products.json (${data.products.length} товаров).\n\n` +
            'Положите файл в data/products.json в репозитории и задеплойте сайт.\n' +
            'Или из корня проекта: node scripts/export-products-snapshot.mjs'
        );
      }
    } catch (e) {
      console.error(e);
      alert(
        'Не удалось выгрузить каталог.\n' +
          (e.message || e) +
          '\nЕсли Worker недоступен (РФ) — включите VPN или запустите скрипт с машины с доступом.'
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        // clearStorefrontDirty уже выставил текст; если ошибка — вернём prev через update
        this.updateStorefrontSyncUi();
        if (!this._storefrontDirty && prev && !prev.includes('нужно') && prev !== 'Выгрузка…') {
          btn.textContent = prev.includes('Обновить') ? 'Обновить каталог для сайта' : prev;
        }
      }
    }
  },

  getFilteredProducts() {
    const q = (document.getElementById('search-products')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('filter-category')?.value || '';
    const status = document.getElementById('filter-status')?.value || '';
    return this.products.filter(p => {
      if (cat && p.category !== cat) return false;
      if (status && (p.status || 'draft') !== status) return false;
      if (q) {
        const hay = ((p.title || '') + ' ' + (p.article || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  budgetLabelFromPrice(price) {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1000) return 'до 1 000 ₽';
    if (n < 2000) return '1 000–2 000 ₽';
    if (n < 3500) return '2 000–3 500 ₽';
    if (n < 5000) return '3 500–5 000 ₽';
    if (n < 8000) return '5 000–8 000 ₽';
    return 'от 8 000 ₽';
  },

  thumbUrl(url) {
    if (!url || url.indexOf('res.cloudinary.com') === -1 || url.indexOf('/image/upload/') === -1) return url;
    const marker = '/image/upload/';
    const i = url.indexOf(marker);
    const rest = url.slice(i + marker.length);
    if (/^[a-z]{1,3}_/.test(rest)) return url;
    return url.slice(0, i) + marker + 'f_auto,q_auto,w_200,c_limit/' + rest;
  },

  renderProductRow(p) {
    const published = p.status === 'published';
    const idJs = String(p.id ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const title = this.escapeHtml(p.title || 'Без названия');
    const article = this.escapeHtml(p.article || '—');
    const category = this.escapeHtml(p.category || '—');
    const priceNum = Number(p.price || 0);
    const fullPhoto = p.main_photo
      || (Array.isArray(p.photos) && (typeof p.photos[0] === 'string' ? p.photos[0] : p.photos[0]?.url))
      || '';
    const photo = this.thumbUrl(fullPhoto);
    const thumb = photo
      ? `<img src="${this.escapeHtml(photo)}" data-full="${this.escapeHtml(fullPhoto)}" alt="" loading="lazy" decoding="async"/>`
      : '<span class="thumb-fallback" aria-hidden="true">🎈</span>';
    const nextStatus = published ? 'draft' : 'published';
    const thumbAttrs = photo
      ? ` role="button" tabindex="0" title="Увеличить фото" class="product-row-thumb is-zoomable" onclick="event.stopPropagation();app.openLightbox(this.querySelector('img')?.dataset?.full||'')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`
      : ' class="product-row-thumb"';
    return `
      <article class="product-row" data-id="${this.escapeHtml(String(p.id ?? ''))}">
        <div${thumbAttrs}>${thumb}</div>
        <div class="product-row-info">
          <div class="product-row-title">${title}</div>
          <div class="product-row-meta">${article} · ${category}</div>
        </div>
        <div class="product-row-price">
          <label class="product-row-price-edit">
            <input type="number" class="product-row-price-input" inputmode="numeric" min="1" step="1"
              value="${priceNum > 0 ? priceNum : ''}"
              aria-label="Цена, рубли"
              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
              onblur="app.updateListPrice('${idJs}', this.value, this)"/>
            <span aria-hidden="true">₽</span>
          </label>
        </div>
        <div class="product-row-status">
          <button type="button" class="badge ${published ? 'success' : 'warning'} product-row-status-btn"
            title="${published ? 'Снять с сайта' : 'Опубликовать на сайте'}"
            onclick="app.toggleStatus('${idJs}', '${nextStatus}')">${published ? 'На сайте' : 'Черновик'}</button>
        </div>
        <div class="product-row-actions">
          <button type="button" class="btn sm primary" onclick="app.editProduct('${idJs}')">Изменить</button>
          <button type="button" class="btn sm outline" onclick="app.duplicateProduct('${idJs}')" title="Копия как черновик">Дубль</button>
          <button type="button" class="btn sm outline" onclick="app.toggleStatus('${idJs}', '${nextStatus}')">${published ? 'Снять' : 'Опубл.'}</button>
          <button type="button" class="btn sm danger" onclick="app.deleteProduct('${idJs}')">Удалить</button>
        </div>
      </article>`;
  },

  renderProducts() {
    const container = document.getElementById('products-list');
    if (!container) return;
    const list = this.getFilteredProducts();
    const countEl = document.getElementById('products-count');
    if (countEl) countEl.textContent = `${list.length} из ${this.products.length}`;

    if (list.length === 0) {
      container.innerHTML = this.products.length === 0
        ? '<div class="empty-state"><div class="icon">🎈</div><div class="title">Нет товаров</div></div>'
        : '<div class="empty-state"><div class="icon">🔍</div><div class="title">Ничего не найдено</div></div>';
      this.renderStats();
      return;
    }

    const q = (document.getElementById('search-products')?.value || '').trim();
    const byGroup = {};
    LIST_GROUPS.forEach((g) => { byGroup[g.id] = []; });
    list.forEach((p) => {
      const gid = this.productListGroupId(p);
      if (!byGroup[gid]) byGroup[gid] = [];
      byGroup[gid].push(p);
    });

    // При поиске — сразу раскрываем группы, где есть совпадения
    if (q) {
      this.listExpandedGroups = this.listExpandedGroups || {};
      LIST_GROUPS.forEach((g) => {
        if ((byGroup[g.id] || []).length) this.listExpandedGroups[g.id] = true;
      });
    }

    const html = LIST_GROUPS.map((g) => {
      const items = byGroup[g.id] || [];
      if (!items.length && q) return '';
      const open = !!(this.listExpandedGroups && this.listExpandedGroups[g.id]);
      const body = open
        ? (this.renderGroupBody(g.id, items, !!q) || '<p class="product-group-empty">Пока пусто</p>')
        : '';
      return `
        <section class="product-group${open ? ' is-open' : ''}" data-group="${g.id}">
          <button type="button" class="product-group-header" onclick="app.toggleListGroup('${g.id}')" aria-expanded="${open}">
            <span class="product-group-icon" aria-hidden="true">${g.icon}</span>
            <span class="product-group-text">
              <strong>${this.escapeHtml(g.title)}</strong>
              <small>${this.escapeHtml(g.note)}</small>
            </span>
            <span class="product-group-count">${items.length}</span>
            <span class="product-group-toggle" aria-hidden="true">${open ? '−' : '+'}</span>
          </button>
          <div class="product-group-body${open ? '' : ' hidden'}">
            ${body}
          </div>
        </section>`;
    }).filter(Boolean).join('');

    container.innerHTML = html || '<div class="empty-state"><div class="icon">🔍</div><div class="title">Ничего не найдено</div></div>';
    this.renderStats();
  },

  renderStats() {
    const total = this.products.length;
    const published = this.products.filter(p => p.status === 'published').length;
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('stats-total', total);
    set('stats-published', published);
    set('stats-drafts', total - published);
  },

  async toggleStatus(id, status) {
    try {
      const res = await fetch(`${this.workerUrl}/api/products/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.ok) {
        const local = this.products.find((p) => String(p.id) === String(id));
        const wasPublished = local && local.status === 'published';
        if (local) local.status = status;
        this.toast(status === 'published' ? 'Товар опубликован' : 'Снят с публикации', 'success');
        this.markStorefrontDirty(status === 'published' ? 'published' : 'unpublished');
        this.renderProducts();
        if (status === 'published' && !wasPublished) this.offerStorefrontExportAfterPublish();
      } else throw new Error(data.error || 'Ошибка');
    } catch (e) {
      this.toast('Ошибка: ' + e.message, 'error');
    }
  },

  async updateListPrice(id, raw, inputEl) {
    const price = parseInt(String(raw ?? '').replace(/\s/g, ''), 10);
    const local = this.products.find((p) => String(p.id) === String(id));
    const prev = local ? Number(local.price || 0) : 0;
    if (!Number.isFinite(price) || price <= 0) {
      this.toast('Цена должна быть больше 0', 'error');
      if (inputEl) inputEl.value = prev > 0 ? String(prev) : '';
      return;
    }
    if (price === prev) return;
    if (inputEl) inputEl.disabled = true;
    try {
      const budget = this.budgetLabelFromPrice(price);
      const res = await fetch(`${this.workerUrl}/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ price, budget })
      });
      let data;
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (local) {
        local.price = price;
        if (budget) local.budget = budget;
      }
      this.toast(`Цена: ${price.toLocaleString('ru-RU')} ₽`, 'success');
      if (local && local.status === 'published') this.markStorefrontDirty('price');
    } catch (e) {
      this.toast('Не удалось сохранить цену: ' + e.message, 'error');
      if (inputEl) inputEl.value = prev > 0 ? String(prev) : '';
    } finally {
      if (inputEl) inputEl.disabled = false;
    }
  },

  async duplicateProduct(id) {
    if (!confirm('Создать копию товара как черновик?')) return;
    this.toast('Копирую…', 'info');
    try {
      const res = await fetch(`${this.workerUrl}/api/products/${id}`);
      const data = await res.json();
      if (!res.ok || !data.ok || !data.product) throw new Error(data.error || 'Товар не найден');
      const src = data.product;
      const photos = Array.isArray(src.photos) ? src.photos.filter(Boolean) : [];
      const composition = Array.isArray(src.composition)
        ? src.composition
        : (typeof src.composition === 'string' && src.composition.trim()
          ? src.composition.split('\n').map((l) => l.trim()).filter(Boolean)
          : []);
      const tags = Array.isArray(src.tags) ? src.tags : [];
      const clientOptions = src.client_options && typeof src.client_options === 'object'
        ? { ...src.client_options }
        : {};
      const baseTitle = String(src.title || 'Товар').replace(/\s*\(копия(?:\s*\d+)?\)\s*$/i, '').trim() || 'Товар';
      const payload = {
        title: `${baseTitle} (копия)`,
        article: '',
        slug: '',
        price: Number(src.price) || 0,
        short_description: src.short_description || '',
        full_description: src.full_description || '',
        composition,
        category: src.category || '',
        character: src.character || '',
        age_group: src.age_group || '',
        budget: src.budget || this.budgetLabelFromPrice(src.price) || '',
        series_name: src.series_name || '',
        occasion: src.occasion || '',
        target_audience: src.target_audience || '',
        seo_title: '',
        seo_description: '',
        scene: src.scene || 'auto',
        tags,
        client_options: clientOptions,
        photos,
        main_photo: src.main_photo || photos[0] || null,
        status: 'draft',
        show_on_site: false
      };
      const create = await fetch(`${this.workerUrl}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify(payload)
      });
      let created;
      try { created = await create.json(); } catch { created = {}; }
      if (!create.ok || !created.ok) throw new Error(created.error || `HTTP ${create.status}`);
      this.toast('Копия создана как черновик', 'success');
      await this.loadProducts();
      if (created.id && typeof this.editProduct === 'function') {
        await this.editProduct(created.id);
      }
    } catch (e) {
      this.toast('Не удалось скопировать: ' + e.message, 'error');
    }
  },

  renderCategories() {
    const deferred = (typeof DEFERRED_TYPE_TAGS !== 'undefined' && DEFERRED_TYPE_TAGS) || ['Шар-сюрприз'];
    const options = CATEGORIES
      .filter((cat) => !deferred.includes(cat))
      .map(cat => `<option value="${cat}">${cat}</option>`).join('');
    const filter = document.getElementById('filter-category');
    if (filter) filter.innerHTML = '<option value="">Все категории</option>' + options;
    const formSelect = document.getElementById('product-category');
    if (formSelect) formSelect.innerHTML = '<option value="">— Выберите категорию —</option>' + options;
  },

  toast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    const ms = (type === 'info' && String(msg).length > 50) ? 7000 : 3000;
    setTimeout(() => toast.className = `toast ${type}`, ms);
  },

  /** Разрешение на системные уведомления (один раз, при старте Master). */
  ensureNotifyPermission() {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (_) { /* ignore */ }
    // Разблокировать AudioContext жестом «старт Master»
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._notifyAudioCtx) this._notifyAudioCtx = new AC();
      if (this._notifyAudioCtx.state === 'suspended') this._notifyAudioCtx.resume().catch(() => {});
    } catch (_) { /* ignore */ }
  },

  playNotifyChime(kind = 'ok') {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._notifyAudioCtx) this._notifyAudioCtx = new AC();
      const ctx = this._notifyAudioCtx;
      const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
      resume.then(() => {
        const now = ctx.currentTime;
        const tones = kind === 'error'
          ? [{ f: 420, t: 0 }, { f: 280, t: 0.14 }]
          : [{ f: 880, t: 0 }, { f: 1175, t: 0.12 }];
        tones.forEach(({ f, t }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0.0001, now + t);
          gain.gain.exponentialRampToValueAtTime(0.12, now + t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + t);
          osc.stop(now + t + 0.2);
        });
      }).catch(() => {});
    } catch (_) { /* ignore */ }
  },

  /**
   * Звук + (если вкладка в фоне) системное уведомление.
   * @param {'ok'|'error'} kind
   */
  notifyMasterDone(kind = 'ok', opts = {}) {
    const title = opts.title || (kind === 'error' ? 'Master не готов' : 'Master готов');
    const body = opts.body || (kind === 'error'
      ? 'Ошибка генерации — откройте админку'
      : 'Фото обработано — можно продолжить карточку');
    this.playNotifyChime(kind);
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      // В фоне — всегда; на активной вкладке хватает toast + звука
      if (!document.hidden && !opts.force) return;
      const n = new Notification(title, {
        body,
        icon: '../favicon.svg',
        tag: 'vigsharm-master',
        renotify: true
      });
      n.onclick = () => {
        try { window.focus(); } catch (_) { /* ignore */ }
        n.close();
      };
      setTimeout(() => { try { n.close(); } catch (_) { /* ignore */ } }, 12000);
    } catch (_) { /* ignore */ }
  },

  // === Сохранение / публикация ===
  async saveProduct(status, opts = {}) {
    const andNew = !!opts.andNew;
    const data = this.collectFormData();
    const isDraft = status === 'draft';

    if (this.currentProduct.photos.length === 0) {
      if (isDraft) {
        this.parkEditorDraft?.(true);
        this.resetForm({ preserveStudioDraft: true });
        this.switchTab('products');
        this.updateParkedDraftBanner?.();
        this.toast('Без фото — только локально. Для черновика на сервере загрузите фото', 'info');
        return;
      }
      this.toast('Загрузите фото', 'error');
      this.goStep1Phase?.('b', { skipGate: true });
      document.getElementById('block-photos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (data.scene === 'unit_balloon') {
      if (!data.title) {
        this.toast('Введите название как у поставщика', 'error');
        document.getElementById('product-title')?.focus();
        return;
      }
      const unitType = data.client_options?.unit_type || '';
      if (!unitType) {
        this.toast('На сцене выберите подтип: с рисунком или фольга', 'error');
        this.goStep1Phase?.('a');
        return;
      }
      if (unitType === 'foil' && !data.client_options?.balloon_size) {
        this.toast('Укажите размер фольги в см', 'error');
        document.getElementById('unit-balloon-size')?.focus();
        return;
      }
    }

    if (isDraft) {
      if (!data.title) {
        const fromComp = String(data.composition || '').trim().split(/\n/)[0].replace(/\s+/g, ' ').slice(0, 48);
        let autoTitle = fromComp || `Черновик ${new Date().toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        })}`;
        let n = 2;
        while (this.findSimilarCatalogTitle?.(autoTitle)) {
          autoTitle = `${(fromComp || 'Черновик').slice(0, 40)} · ${n}`;
          n += 1;
          if (n > 20) break;
        }
        data.title = autoTitle;
        const titleEl = document.getElementById('product-title');
        if (titleEl) titleEl.value = autoTitle;
        this.syncEditorTitle?.(autoTitle);
      } else {
        const titleClash = this.findSimilarCatalogTitle?.(data.title);
        if (titleClash) {
          this.toast(`Название похоже на «${titleClash.title}» — придумайте другое`, 'error');
          this.goEditorStep2?.();
          document.getElementById('product-title')?.focus();
          return;
        }
      }
      if (!data.price || data.price <= 0) data.price = 0;
      // категория для черновика необязательна
    } else {
      if (!data.title) {
        this.toast('Введите название', 'error');
        document.getElementById('product-title')?.focus();
        document.getElementById('block-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const titleClash = this.findSimilarCatalogTitle?.(data.title);
      if (titleClash) {
        this.toast(`Название похоже на «${titleClash.title}» — придумайте другое`, 'error');
        document.getElementById('product-title')?.focus();
        document.getElementById('block-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (!data.price || data.price <= 0) {
        this.toast('Укажите цену', 'error');
        document.getElementById('product-price')?.focus();
        this.goStep1Phase?.('c', { skipGate: true });
        return;
      }
      if (!data.category) {
        this.toast('Выберите категорию', 'error');
        document.getElementById('product-category')?.focus();
        document.getElementById('block-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    if (status === 'published') {
      const gaps = typeof this.getPublishSoftGaps === 'function' ? this.getPublishSoftGaps() : [];
      if (gaps.length && !this._publishGapsAck) {
        this._publishGapsAck = true;
        this.toast(
          `Не заполнено: ${gaps.join(', ')}. Нажмите «Опубликовать» ещё раз, чтобы продолжить`,
          'info'
        );
        return;
      }
    }

    // Новый товар: всегда свежий свободный артикул (избегаем UNIQUE)
    if (!this.currentProduct.id) {
      this.assignFreshArticle();
      data.article = document.getElementById('product-article')?.value.trim() || this.nextArticle(data.category);
    }

    const isEdit = !!this.currentProduct.id;
    const wasPublished = isEdit && (
      this.currentProduct.status === 'published' ||
      this.products.find((p) => String(p.id) === String(this.currentProduct.id))?.status === 'published'
    );
    if (status === 'published') {
      data.show_on_site = true;
      const showEl = document.getElementById('show-on-site');
      if (showEl) showEl.checked = true;
    }
    this.toast(status === 'published' ? 'Публикация...' : 'Сохранение...', '');

    try {
      // Загружаем локальные файлы И data:/blob: URL (после Studio Pro / AI)
      for (let i = 0; i < this.currentProduct.photos.length; i++) {
        const photo = this.currentProduct.photos[i];
        const needsUpload = (!photo.uploaded && photo.file) ||
          (photo.url && (photo.url.startsWith('data:') || photo.url.startsWith('blob:')));

        if (!needsUpload) continue;

        if (photo.file && !photo.url?.startsWith('https://')) {
          const uploadResult = await this.uploadPhoto(photo.file);
          if (!uploadResult.ok) throw new Error('Не удалось загрузить фото');
          photo.url = uploadResult.url;
        } else if (photo.url && (photo.url.startsWith('data:') || photo.url.startsWith('blob:'))) {
          if (typeof this.ensureHttpsPhotoUrl === 'function') {
            photo.url = await this.ensureHttpsPhotoUrl(photo.url, `product-${i + 1}.webp`);
          } else {
            throw new Error('Фото ещё в dataURL — перезапустите Studio Pro или обновите страницу');
          }
        }
        photo.uploaded = true;
      }

      data.photos = this.currentProduct.photos.map(p => p.url).filter(Boolean);
      data.main_photo = data.photos[0] || null;

      // ─── Thumbnail: WebP 480px / 0.82 из локального File-объекта (без CORS) ───
      // Генерируем только если главное фото — новый локальный файл.
      // При редактировании без смены фото thumb_photo берётся из collectFormData (currentProduct).
      const mainFile = this.currentProduct.photos[0]?.file;
      if (mainFile && typeof this.generateAndUploadThumb === 'function') {
        try {
          const thumbUrl = await this.generateAndUploadThumb(mainFile);
          if (thumbUrl) {
            data.thumb_photo = thumbUrl;
            this.currentProduct.thumb_photo = thumbUrl;
          }
        } catch (e) {
          console.warn('[saveProduct] thumb generation skipped:', e);
        }
      }

      // data: URL — это нормальный запасной путь без Cloudinary (Worker хранит
      // сжатое фото прямо в товаре). Отклоняем только совсем огромные файлы —
      // они раздуют карточку и базу товаров.
      const MAX_DATA_URL_LEN = 700 * 1024; // ~500 КБ реального файла в base64
      const tooBig = data.photos.find(u => String(u).startsWith('data:') && u.length > MAX_DATA_URL_LEN);
      if (tooBig) {
        throw new Error('Фото слишком большое для сохранения без Cloudinary. Уменьшите фото (сжатие уже применяется автоматически) и попробуйте снова.');
      }

      this.renderPhotos();

      const res = await fetch(
        isEdit ? `${this.workerUrl}/api/products/${this.currentProduct.id}` : `${this.workerUrl}/api/products`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
          body: JSON.stringify({ ...data, status })
        }
      );

      let result;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Сервер ответил ${res.status} без JSON. Проверьте Admin API Key и Worker.`);
      }
      if (!res.ok || !result.ok) {
        throw new Error(result.error || `Ошибка сохранения (HTTP ${res.status})`);
      }

      this._publishGapsAck = false;
      if (status === 'published') {
        this.markStorefrontDirty(wasPublished ? 'updated' : 'published');
      } else if (wasPublished) {
        this.markStorefrontDirty('unpublished');
      }
      this.discardParkedEditorDraft(false);
      this.clearActiveStudioDraft?.();
      this.rememberLastProductTemplate?.(data);

      if (isDraft && andNew) {
        this.toast('Черновик на сервере. Новая карточка', 'success');
        this.resetForm();
        this.switchTab('create');
        this.loadProducts();
        this.updateParkedDraftBanner?.();
        return;
      }

      this.toast(
        isEdit ? 'Товар обновлён' : (status === 'published' ? 'Товар опубликован!' : 'Черновик сохранён на сервере'),
        'success'
      );
      this.resetForm();
      this.switchTab('products');
      this.loadProducts();
      this.updateParkedDraftBanner?.();
      if (status === 'published' && !wasPublished) await this.offerStorefrontExportAfterPublish();
    } catch (e) {
      this.toast('Ошибка: ' + e.message, 'error');
      console.error('[saveProduct]', e);
    }
  },

  async publishProduct() {
    return this.saveProduct('published');
  },

  async saveDraft(opts = {}) {
    this._publishGapsAck = false;
    const hasPhotos = (this.currentProduct?.photos || []).length > 0;
    const andNew = opts.andNew != null ? !!opts.andNew : hasPhotos;
    return this.saveProduct('draft', { andNew });
  },

  async deleteProduct(id) {
    if (confirm('Удалить товар?')) {
      try {
        const local = this.products.find((p) => String(p.id) === String(id));
        const wasPublished = local && local.status === 'published';
        const res = await fetch(`${this.workerUrl}/api/products/${id}`, { method: 'DELETE', headers: this.authHeaders() });
        const data = await res.json();
        if (data.ok) {
          this.toast('Товар удалён', 'success');
          if (wasPublished) this.markStorefrontDirty('deleted');
          this.loadProducts();
        } else {
          this.toast('Ошибка удаления', 'error');
        }
      } catch (e) {
        this.toast('Ошибка удаления', 'error');
      }
    }
  },

};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
