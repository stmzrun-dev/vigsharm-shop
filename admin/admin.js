// VigSharm Admin Panel - V3
const CATEGORIES = ['Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для мамы', 'Для него', 'Геймерам', 'Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник', 'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября', 'Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров', 'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров', 'Шары поштучно'];

const TAGS = {
  forWho: ['Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для мамы', 'Для него', 'Геймерам'],
  occasion: ['Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник'],
  dates: ['Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'],
  type: ['Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров', 'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров', 'Шары поштучно']
};

/** Праздничные категории: в составе пишите метку в скобках, напр. (1 сентября) — в состав клиенту не попадёт. */
const HOLIDAY_CATEGORIES = ['Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'];
/** Тематики для метки в скобках: аудитория / повод / праздник (не тип изделия). */
const THEME_CATEGORIES = [...TAGS.forWho, ...TAGS.occasion, ...TAGS.dates];
/** Пока не ставим на карточки — отдельный раздел позже */
const DEFERRED_TYPE_TAGS = ['Шар-сюрприз'];

const SCENES = [
  { value: 'auto', title: '🤖 Автоматически', desc: 'ИИ определит по содержимому' },
  { value: 'unit_balloon', title: '🎈 Шар поштучно', desc: 'Manus: стена, без пола' },
  { value: 'handheld_bouquet', title: '💐 Букет в руке', desc: 'Женская рука, без бирок' },
  { value: 'wall_only', title: '🧱 Только стена', desc: 'Manus: стена, без пола' },
  { value: 'floor', title: '🏠 Напольная композиция', desc: 'Стена + плинтус + ламинат' },
  { value: 'balloon_figures', title: '🧍 Фигуры из шаров', desc: 'Как напольная, масштаб ≥1 м' },
  { value: 'photozone', title: '📸 Фотозона', desc: 'Каркас или мольберт' }
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
  workerUrl: 'https://vigsharm-api.vigsharm.workers.dev',
  studioReferenceBackgroundUrl: '',
  studioReferenceHandUrl: '',
  adminApiKey: '',

  // Заголовок авторизации для admin-only запросов к Worker (создание/изменение/удаление
  // товаров, загрузка фото, ИИ-генерация, Studio Pro). Публичное чтение каталога
  // (GET /api/products) авторизации не требует.
  authHeaders() {
    return this.adminApiKey ? { 'Authorization': 'Bearer ' + this.adminApiKey } : {};
  },

  currentStep: 1,
  products: [],
  listPageSize: 60,
  listVisible: 60,
  /** Какие группы раскрыты: { ready: true, ... } — по умолчанию все свёрнуты */
  listExpandedGroups: {},
  /** Лимит строк внутри раскрытой группы */
  listGroupVisible: {},
  currentProduct: { photos: [], scene: 'auto', tags: [], client_options: {} },

  init() {
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
    this.loadProducts();
    this.restoreActiveStudioDraftIfAny?.();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (typeof this.closeLightbox === 'function') this.closeLightbox();
        if (document.body.classList.contains('admin-editor-open')) this.cancelProductEdit();
      }
    });
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
    const banner = document.getElementById('unit-mode-banner');
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
    if (banner) banner.classList.toggle('hidden', !unit);

    if (unit) {
      if (this.currentProduct) this.currentProduct.scene = 'unit_balloon';
      if (sceneEl && sceneEl.value !== 'unit_balloon') sceneEl.value = 'unit_balloon';
      if (titleEl) titleEl.placeholder = 'Точное название как у поставщика';
      if (!this.currentProduct?.id) this.assignFreshArticle?.();
      this.syncStudioModeHint?.();
    } else {
      if (fromUser && sceneEl?.value === 'unit_balloon') {
        if (this.currentProduct) this.currentProduct.scene = 'auto';
        sceneEl.value = 'auto';
      }
      if (titleEl) titleEl.placeholder = 'Например: Тёмный рыцарь';
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

  toggleListGroup(groupId) {
    this.listExpandedGroups = this.listExpandedGroups || {};
    this.listExpandedGroups[groupId] = !this.listExpandedGroups[groupId];
    if (this.listExpandedGroups[groupId] && !this.listGroupVisible[groupId]) {
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
    this.resetForm();
    this.switchTab('create');
    this.toast('Новая карточка', 'info');
  },

  loadSettings() {
    try {
      const saved = localStorage.getItem('vigsharm_admin_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.workerUrl = settings.workerUrl || '';
        this.adminApiKey = settings.adminApiKey || '';
        
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
        
        if (document.getElementById('worker-url')) document.getElementById('worker-url').value = this.workerUrl;
        if (document.getElementById('admin-api-key')) document.getElementById('admin-api-key').value = this.adminApiKey;
      }
    } catch (e) {}
  },

  saveSettings() {
    this.workerUrl = document.getElementById('worker-url').value.trim();
    this.adminApiKey = document.getElementById('admin-api-key')?.value.trim() || '';
    try {
      localStorage.setItem('vigsharm_admin_settings', JSON.stringify({
        workerUrl: this.workerUrl,
        adminApiKey: this.adminApiKey
      }));
      this.toast('Настройки сохранены', 'success');
    } catch (e) {
      this.toast('Ошибка сохранения', 'error');
    }
  },

  clearSettings() {
    if (confirm('Удалить все настройки?')) {
      localStorage.clear();
      this.toast('Настройки очищены', 'success');
    }
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
    } else {
      document.body.classList.add('admin-editor-open');
      window.scrollTo(0, 0);
    }
  },

  async loadProducts() {
    if (!this.workerUrl) {
      const container = document.getElementById('products-list');
      if (container) container.innerHTML = '<div class="empty-state"><div class="icon">🔗</div><div class="title">Worker не настроен</div><p class="text-muted mt-1">Укажите Worker API URL во вкладке «Настройки»</p></div>';
      return;
    }
    try {
      const res = await fetch(`${this.workerUrl}/api/products`);
      const data = await res.json();
      if (data.ok) {
        this.products = data.products || [];
        this.renderProducts();
      }
    } catch (e) {
      console.error('Failed to load products', e);
    }
  },

  /**
   * Снимок каталога для витрины (data/products.json).
   * Браузер не пишет в репозиторий — скачивает файл; дальше положить в data/ или:
   *   node scripts/export-products-snapshot.mjs
   */
  async exportStorefrontSnapshot() {
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
      const res = await fetch(`${this.workerUrl}/api/products`, { cache: 'no-store' });
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
      alert(
        `Скачан products.json (${data.products.length} товаров).\n\n` +
          'Положите файл в data/products.json в репозитории и задеплойте сайт.\n' +
          'Или из корня проекта: node scripts/export-products-snapshot.mjs'
      );
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
        btn.textContent = prev || 'Обновить каталог для сайта';
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

  renderProductRow(p) {
    const published = p.status === 'published';
    const idJs = String(p.id ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const title = this.escapeHtml(p.title || 'Без названия');
    const article = this.escapeHtml(p.article || '—');
    const category = this.escapeHtml(p.category || '—');
    const price = Number(p.price || 0).toLocaleString('ru-RU');
    const photo = p.main_photo || (Array.isArray(p.photos) && p.photos[0]) || '';
    const thumb = photo
      ? `<img src="${this.escapeHtml(photo)}" alt="" loading="lazy" decoding="async"/>`
      : '<span class="thumb-fallback" aria-hidden="true">🎈</span>';
    return `
      <article class="product-row">
        <div class="product-row-thumb">${thumb}</div>
        <div class="product-row-info">
          <div class="product-row-title">${title}</div>
          <div class="product-row-meta">${article} · ${category}</div>
        </div>
        <div class="product-row-price">${price} ₽</div>
        <div class="product-row-status">
          <span class="badge ${published ? 'success' : 'warning'}">${published ? 'На сайте' : 'Черновик'}</span>
        </div>
        <div class="product-row-actions">
          <button type="button" class="btn sm primary" onclick="app.editProduct('${idJs}')">Изменить</button>
          <button type="button" class="btn sm outline" onclick="app.toggleStatus('${idJs}', '${published ? 'draft' : 'published'}')">${published ? 'Снять' : 'Опубл.'}</button>
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
      const limit = this.listGroupVisible[g.id] || this.listPageSize;
      const visible = open ? items.slice(0, limit) : [];
      const remaining = open ? Math.max(0, items.length - visible.length) : 0;
      const rows = visible.map((p) => this.renderProductRow(p)).join('');
      const more = remaining > 0
        ? `<button type="button" class="btn outline block products-more" onclick="app.showMoreProducts('${g.id}')">Показать ещё ${Math.min(remaining, this.listPageSize)} из ${remaining}</button>`
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
            ${open ? (rows || '<p class="product-group-empty">Пока пусто</p>') + more : ''}
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
        this.toast(status === 'published' ? 'Товар опубликован' : 'Снят с публикации', 'success');
        this.loadProducts();
      } else throw new Error(data.error || 'Ошибка');
    } catch (e) {
      this.toast('Ошибка: ' + e.message, 'error');
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

  // === Сохранение / публикация ===
  async saveProduct(status) {
    const data = this.collectFormData();

    if (this.currentProduct.photos.length === 0) {
      this.toast('Загрузите фото', 'error');
      document.getElementById('block-photos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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
      return;
    }
    if (!data.category) {
      this.toast('Выберите категорию', 'error');
      document.getElementById('product-category')?.focus();
      return;
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

      if (data.photos.some(u => String(u).startsWith('data:'))) {
        throw new Error('Фото не загружены в облако (dataURL). Повторите Studio Pro или загрузите фото заново.');
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

      this.toast(
        isEdit ? 'Товар обновлён' : (status === 'published' ? 'Товар опубликован!' : 'Черновик сохранён'),
        'success'
      );
      this._publishGapsAck = false;
      this.resetForm();
      this.switchTab('products');
      this.loadProducts();
    } catch (e) {
      this.toast('Ошибка: ' + e.message, 'error');
      console.error('[saveProduct]', e);
    }
  },

  async publishProduct() {
    return this.saveProduct('published');
  },

  async saveDraft() {
    this._publishGapsAck = false;
    return this.saveProduct('draft');
  },

  async deleteProduct(id) {
    if (confirm('Удалить товар?')) {
      try {
        const res = await fetch(`${this.workerUrl}/api/products/${id}`, { method: 'DELETE', headers: this.authHeaders() });
        const data = await res.json();
        if (data.ok) {
          this.toast('Товар удалён', 'success');
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
