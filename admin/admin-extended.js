// VigSharm Admin - Extended Functions
// Добавляем дополнительные методы в app

Object.assign(app, {
  // === Photo Upload ===
  setupPhotoUpload() {
    const dropzone = document.getElementById('photo-dropzone');
    const input = document.getElementById('photo-input');
    if (!dropzone || !input) return;
    const zone = dropzone.querySelector('.upload-zone') || dropzone;

    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
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
    if (!container) return;
    if (this.currentProduct.photos.length === 0) { container.innerHTML = ''; return; }
    
    container.innerHTML = this.currentProduct.photos.map((photo, index) => `
      <div class="photo-item ${index === 0 ? 'main' : ''}">
        <img src="${photo.url}" alt="Фото ${index + 1}"/>
        ${index === 0 ? '<span class="badge-main">Главное</span>' : ''}
        <div class="actions">
          <button onclick="app.setMainPhoto(${index})" title="Сделать главным">★</button>
          <button onclick="app.removePhoto(${index})" title="Удалить">✕</button>
        </div>
      </div>
    `).join('');
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

  // === Scene Selector ===
  setupSceneSelector() {
    const container = document.getElementById('scene-selector');
    if (!container) return;
    
    container.innerHTML = SCENES.map(scene => `
      <div class="scene-option">
        <input type="radio" name="scene" value="${scene.value}" id="scene-${scene.value}" ${scene.value === 'auto' ? 'checked' : ''}/>
        <label for="scene-${scene.value}">
          <span class="title">${scene.title}</span>
          <span class="desc">${scene.desc}</span>
        </label>
      </div>
    `).join('');
    
    container.querySelectorAll('input[name="scene"]').forEach(input => {
      input.addEventListener('change', () => { this.currentProduct.scene = input.value; });
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
        headers: { 'Content-Type': 'application/json' },
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
    if (card.title) document.getElementById('product-title').value = card.title;
    if (card.article) document.getElementById('product-article').value = card.article;
    if (card.price) document.getElementById('product-price').value = card.price;
    if (card.short_description) document.getElementById('product-short-desc').value = card.short_description;
    if (card.full_description) document.getElementById('product-full-desc').value = card.full_description;
    if (card.composition) document.getElementById('product-composition').value = card.composition.join('\n');
    if (card.category) document.getElementById('product-category').value = card.category;
    if (card.seo_title) document.getElementById('product-seo-title').value = card.seo_title;
    if (card.seo_description) document.getElementById('product-seo-desc').value = card.seo_description;
    if (card.slug) document.getElementById('product-slug').value = card.slug;
    
    if (card.tags) {
      card.tags.forEach(tag => {
        const cb = document.querySelector(`input[type="checkbox"][value="${tag}"]`);
        if (cb) cb.checked = true;
      });
    }
    
    if (card.client_options) {
      if (card.client_options.available_on_request) document.getElementById('opt-available').checked = true;
      if (card.client_options.number_choice) document.getElementById('opt-number').checked = true;
      if (card.client_options.personal_inscription) document.getElementById('opt-inscription').checked = true;
      if (card.client_options.photozone_rental) document.getElementById('opt-rental').checked = true;
    }
  },

  // === Studio Pro ===
  async processStudioPro() {
    if (this.currentProduct.photos.length === 0) { this.toast('Загрузите фото', 'error'); return; }
    
    const btn = document.getElementById('process-studio-btn');
    const statusEl = document.getElementById('studio-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Обработка...';
    
    try {
      for (let i = 0; i < this.currentProduct.photos.length; i++) {
        const photo = this.currentProduct.photos[i];
        statusEl.textContent = `Обработка ${i + 1}/${this.currentProduct.photos.length}...`;
        
        let imageUrl = photo.url;
        if (!photo.uploaded) {
          const uploadResult = await this.uploadPhoto(photo.file);
          if (uploadResult.ok) {
            imageUrl = uploadResult.url;
            photo.url = imageUrl;
            photo.uploaded = true;
          }
        }
        
        const res = await fetch(`${this.workerUrl}/api/studio/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: imageUrl, scene: this.currentProduct.scene })
        });
        
        const data = await res.json();
        if (data.ok && data.job_id) {
          const result = await this.pollStudioStatus(data.job_id, statusEl, i + 1);
          if (result) { photo.url = result; photo.uploaded = true; }
        }
      }
      
      this.renderPhotos();
      statusEl.textContent = '✓ Все фото обработаны';
      this.toast('Фото обработаны', 'success');
    } catch (e) {
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ Обработать фото через Studio Pro';
    }
  },

  async pollStudioStatus(jobId, statusEl, current) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const res = await fetch(`${this.workerUrl}/api/studio/status/${jobId}`);
      const data = await res.json();
      if (data.ok && data.status === 'done' && data.result_url) return data.result_url;
      if (data.status === 'failed') throw new Error('Обработка не удалась');
      statusEl.textContent = `Обработка ${current}... (${i * 3}с)`;
    }
    throw new Error('Таймаут обработки');
  },

  async uploadPhoto(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${this.workerUrl}/api/upload/photo`, { method: 'POST', body: formData });
    return await res.json();
  },

  // === Form Data Collection ===
  collectFormData() {
    const tags = [];
    document.querySelectorAll('#tags-for-who input:checked, #tags-occasion input:checked, #tags-dates input:checked, #tags-type input:checked')
      .forEach(cb => tags.push(cb.value));

    const titleValue = document.getElementById('product-title').value.trim();
    const composition = document.getElementById('product-composition').value
      .split('\n').filter(l => l.trim()).map(l => l.trim());

    return {
      id: this.currentProduct.id || undefined,
      title: titleValue,
      article: document.getElementById('product-article').value.trim() || this.nextArticle(),
      price: parseInt(document.getElementById('product-price').value) || 0,
      short_description: document.getElementById('product-short-desc').value.trim(),
      full_description: document.getElementById('product-full-desc').value.trim(),
      composition: composition,
      category: document.getElementById('product-category').value,
      character: document.getElementById('product-character')?.value.trim() || null,
      age_group: document.getElementById('product-age')?.value || 'Для любого возраста',
      budget: document.getElementById('product-budget')?.value.trim() || null,
      series_name: document.getElementById('product-series')?.value.trim() || null,
      seo_title: document.getElementById('product-seo-title').value.trim(),
      seo_description: document.getElementById('product-seo-desc').value.trim(),
      slug: document.getElementById('product-slug').value.trim() || this.slugify(titleValue),
      scene: this.currentProduct.scene,
      tags: tags,
      client_options: {
        available_on_request: document.getElementById('opt-available')?.checked || false,
        number_choice: document.getElementById('opt-number')?.checked || false,
        personal_inscription: document.getElementById('opt-inscription')?.checked || false,
        photozone_rental: document.getElementById('opt-rental')?.checked || false
      },
      photos: this.currentProduct.photos.map(p => p.url),
      main_photo: this.currentProduct.photos[0]?.url || null,
      show_on_site: document.getElementById('show-on-site')?.checked || false
    };
  },

  resetForm() {
    this.currentStep = 1;
    this.currentProduct = { photos: [], scene: 'auto', tags: [], client_options: {} };

    const form = document.getElementById('product-form');
    if (form) form.reset();

    const autoScene = document.querySelector('input[name="scene"][value="auto"]');
    if (autoScene) autoScene.checked = true;

    const articleEl = document.getElementById('product-article');
    if (articleEl) articleEl.value = this.nextArticle();

    const hero = document.querySelector('#tab-create .hero-section h1');
    if (hero) hero.textContent = 'Новая карточка за минуту';

    this.renderPhotos();
    this.updateSteps();
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
    this.currentStep = 1;
    this.updateSteps();

    const hero = document.querySelector('#tab-create .hero-section h1');
    if (hero) hero.textContent = 'Редактирование — ' + (data.product.title || '');
    this.toast('Товар загружен для редактирования', 'success');
  } catch (e) { this.toast('Ошибка: ' + e.message, 'error'); }
};

// === Load Product to Form ===
app.loadProductToForm = function(product) {
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
  document.querySelectorAll('input[name="scene"]').forEach(input => {
    input.checked = input.value === this.currentProduct.scene;
  });

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

  // Опции клиента
  const opts = product.client_options || {};
  const opt = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  opt('opt-available', opts.available_on_request);
  opt('opt-number', opts.number_choice);
  opt('opt-inscription', opts.personal_inscription);
  opt('opt-rental', opts.photozone_rental);
  opt('show-on-site', product.show_on_site);
};

console.log('✓ VigSharm Admin Extended Functions loaded');


