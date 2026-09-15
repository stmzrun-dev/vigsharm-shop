// VigSharm Admin Panel - V3
const CATEGORIES = ['Для девочки', 'Для мальчика', 'Для неё', 'Для мамы', 'Для него', 'Геймерам', 'Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник', 'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября', 'Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров', 'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров', 'Шары поштучно'];

const TAGS = {
  forWho: ['Для девочки', 'Для мальчика', 'Для неё', 'Для мамы', 'Для него', 'Геймерам'],
  occasion: ['Юбилей', '1 годик', 'Крещение', 'Гендер-пати', 'На выписку', 'Свадьба и девичник'],
  dates: ['Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'],
  type: ['Фигуры из шаров', 'Напольные композиции', 'Букет из шаров', 'Цветы из шаров', 'Крафтовый букет', 'Шар-сюрприз', 'Коробка-сюрприз', 'Фотозона', 'Арка из шаров', 'Шары поштучно']
};

const SCENES = [
  { value: 'auto', title: '🤖 Автоматически', desc: 'ИИ определит по содержимому' },
  { value: 'unit_balloon', title: '🎈 Шар поштучно', desc: 'Только стена, без пола' },
  { value: 'handheld_bouquet', title: '💐 Букет в руке', desc: 'Только стена, без пола' },
  { value: 'wall_only', title: '🧱 Только стена', desc: 'Строгий запрет пола' },
  { value: 'floor', title: '🏠 Напольная сцена', desc: 'Стена + плинтус + ламинат' },
  { value: 'photozone', title: '📸 Фотозона', desc: 'Полный интерьер' }
];

const app = {
  workerUrl: 'https://vigsharm-api.vigsharm.workers.dev',
  studioReferenceBackgroundUrl: '',
  adminApiKey: '',

  // Заголовок авторизации для admin-only запросов к Worker (создание/изменение/удаление
  // товаров, загрузка фото, ИИ-генерация, Studio Pro). Публичное чтение каталога
  // (GET /api/products) авторизации не требует.
  authHeaders() {
    return this.adminApiKey ? { 'Authorization': 'Bearer ' + this.adminApiKey } : {};
  },

  currentStep: 1,
  products: [],
  currentProduct: { photos: [], scene: 'auto', tags: [], client_options: {} },

  init() {
    this.loadSettings();
    this.setupTabs();
    this.setupSteps();
    this.setupPhotoUpload();
    this.setupSceneSelector();
    this.setupFormEvents();
    this.renderCategories();
    this.renderTags();
    this.wireFormHelpers();
    this.wireFilters();
    this.updateSteps();
    this.loadProducts();
  },

  // === Навигация по шагам визарда ===
  setupSteps() {
    document.querySelectorAll('#steps-nav .step').forEach(step => {
      step.addEventListener('click', () => {
        this.currentStep = parseInt(step.dataset.step, 10) || 1;
        this.updateSteps();
      });
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
    if (articleEl && !articleEl.value) articleEl.value = this.nextArticle();
  },

  wireFilters() {
    ['search-products', 'filter-category', 'filter-status'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this.renderProducts());
      el.addEventListener('change', () => this.renderProducts());
    });
  },

  nextArticle() {
    const used = this.products.map(p => p.article).filter(Boolean);
    let n = this.products.length + 1;
    while (used.includes('DG-' + String(n).padStart(3, '0'))) n++;
    return 'DG-' + String(n).padStart(3, '0');
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
        
        // Загружаем эталонный фон
        this.studioReferenceBackgroundUrl = settings.studioReferenceBackgroundUrl || '';
        
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
    document.querySelectorAll('.header-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    if (tab === 'create') this.updateSteps();
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

  renderProducts() {
    const container = document.getElementById('products-list');
    if (!container) return;
    const list = this.getFilteredProducts();

    if (list.length === 0) {
      container.innerHTML = this.products.length === 0
        ? '<div class="empty-state"><div class="icon">🎈</div><div class="title">Нет товаров</div></div>'
        : '<div class="empty-state"><div class="icon">🔍</div><div class="title">Ничего не найдено</div></div>';
      this.renderStats();
      return;
    }

    container.innerHTML = list.map(p => {
      const published = p.status === 'published';
      return `
      <div class="product-card">
        <div class="thumb">${p.main_photo ? `<img src="${p.main_photo}" alt="${p.title}"/>` : '<div style="padding:40px;text-align:center">🎈</div>'}</div>
        <div class="title">${p.title}</div>
        <div class="meta"><span>${p.article || '—'}</span> <span>${p.category || '—'}</span></div>
        <div class="price">${p.price} ₽</div>
        <div class="status-row">
          <span class="badge ${published ? 'success' : 'warning'}">${published ? 'Опубликован' : 'Черновик'}</span>
        </div>
        <div class="actions">
          <button class="btn sm primary" onclick="app.editProduct('${p.id}')">Редактировать</button>
          <button class="btn sm outline" onclick="app.toggleStatus('${p.id}', '${published ? 'draft' : 'published'}')">${published ? 'Снять' : 'Опубликовать'}</button>
          <button class="btn sm danger" onclick="app.deleteProduct('${p.id}')">Удалить</button>
        </div>
      </div>`;
    }).join('');

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
    const options = CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    const filter = document.getElementById('filter-category');
    if (filter) filter.innerHTML = '<option value="">Все категории</option>' + options;
    const formSelect = document.getElementById('product-category');
    if (formSelect) formSelect.innerHTML = '<option value="">— Выберите категорию —</option>' + options;
  },

  toast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.className = `toast ${type}`, 3000);
  },

  // === Сохранение / публикация ===
  async saveProduct(status) {
    const data = this.collectFormData();

    if (!data.title) { this.toast('Введите название', 'error'); this.showStep(3); return; }
    if (this.currentProduct.photos.length === 0) { this.toast('Загрузите фото', 'error'); this.showStep(1); return; }
    if (!data.category) { this.toast('Выберите категорию', 'error'); this.showStep(4); return; }

    const isEdit = !!this.currentProduct.id;
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
    return this.saveProduct('draft');
  },

  showStep(n) {
    this.currentStep = n;
    this.updateSteps();
    document.querySelector('#tab-create .card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  nextStep() {
    if (this.currentStep < 8) this.showStep(this.currentStep + 1);
  },

  prevStep() {
    if (this.currentStep > 1) this.showStep(this.currentStep - 1);
  },

  updateSteps() {
    document.querySelectorAll('.form-step').forEach(step => {
      const n = parseInt(step.dataset.step, 10) || 0;
      step.classList.toggle('active', n === this.currentStep);
    });
    document.querySelectorAll('#steps-nav .step').forEach(step => {
      const n = parseInt(step.dataset.step, 10) || 0;
      step.classList.toggle('active', n === this.currentStep);
      step.classList.toggle('completed', n < this.currentStep);
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
