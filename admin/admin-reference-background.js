// VigSharm Admin - Reference Background Manager
// Управление эталонным фоном Studio Pro

Object.assign(app, {
  // Инициализация UI эталонного фона
  initReferenceBackground() {
    const fileInput = document.getElementById('reference-bg-file');
    const uploadBtn = document.getElementById('upload-reference-bg-btn');
    const preview = document.getElementById('reference-bg-preview');
    const status = document.getElementById('reference-bg-status');
    
    if (!fileInput || !uploadBtn) return;
    
    // Обновить UI при загрузке
    this.updateReferenceBackgroundUI();
    
    // Клик на кнопку открывает выбор файла
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    // Выбор файла -> загрузка
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.uploadReferenceBackground(file);
      }
    });
  },
  
  // Загрузка эталонного фона
  async uploadReferenceBackground(file) {
    const uploadBtn = document.getElementById('upload-reference-bg-btn');
    const status = document.getElementById('reference-bg-status');
    const fileInput = document.getElementById('reference-bg-file');
    
    // Проверка настроек Cloudinary
    if (!this.cloudinaryCloudName || !this.cloudinaryUploadPreset) {
      this.toast('Сначала настройте Cloudinary (Cloud Name и Upload Preset)', 'error');
      return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner"></span> Загрузка...';
    status.textContent = '☁️ Загрузка в Cloudinary...';
    
    try {
      // Валидация файла
      if (!file.type.startsWith('image/')) {
        throw new Error('Файл должен быть изображением (JPG, PNG, WebP)');
      }
      
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Размер файла не должен превышать 10 МБ');
      }
      
      console.log('📤 Загружаем эталонный фон в Cloudinary:', file.name);
      
      // Загрузка через существующий модуль
      const result = await window.CloudinaryUploader.uploadPhoto(
        file,
        this.cloudinaryCloudName,
        this.cloudinaryUploadPreset
      );
      
      if (!result.ok) {
        throw new Error(result.error || 'Ошибка загрузки в Cloudinary');
      }
      
      // Сохранить URL
      this.studioReferenceBackgroundUrl = result.url;
      
      // Сохранить в localStorage
      this.saveReferenceBackgroundUrl();
      
      console.log('✅ Эталонный фон сохранён:', result.url);
      
      // Обновить UI
      this.updateReferenceBackgroundUI();
      
      status.textContent = '✅ Эталонный фон успешно сохранён';
      this.toast('Эталонный фон сохранён успешно!', 'success');
      
      // Очистить input
      fileInput.value = '';
      
    } catch (error) {
      console.error('❌ Ошибка загрузки эталонного фона:', error);
      status.textContent = '✗ ' + error.message;
      this.toast('Ошибка: ' + error.message, 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = '📤 Загрузить фон';
    }
  },

  
  // Сохранение URL эталонного фона в localStorage
  saveReferenceBackgroundUrl() {
    try {
      const saved = localStorage.getItem('vigsharm_admin_settings');
      const settings = saved ? JSON.parse(saved) : {};
      settings.studioReferenceBackgroundUrl = this.studioReferenceBackgroundUrl;
      localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
    } catch (e) {
      console.error('Ошибка сохранения эталонного фона:', e);
    }
  },
  
  // Загрузка URL эталонного фона из localStorage
  loadReferenceBackgroundUrl() {
    try {
      const saved = localStorage.getItem('vigsharm_admin_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.studioReferenceBackgroundUrl = settings.studioReferenceBackgroundUrl || '';
      }
    } catch (e) {
      console.error('Ошибка загрузки эталонного фона:', e);
    }
  },
  
  // Обновление UI эталонного фона
  updateReferenceBackgroundUI() {
    const preview = document.getElementById('reference-bg-preview');
    const status = document.getElementById('reference-bg-status');
    const replaceBtn = document.getElementById('replace-reference-bg-btn');
    
    if (!preview || !status) return;
    
    if (this.studioReferenceBackgroundUrl) {
      // Показать preview
      preview.innerHTML = `
        <img src="${this.studioReferenceBackgroundUrl}" alt="Эталонный фон" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #ddd;"/>
      `;
      preview.style.display = 'block';
      
      status.innerHTML = '✅ <strong>Эталонный фон сохранён</strong>';
      status.style.color = '#27ae60';
      
      // Показать кнопку замены
      if (replaceBtn) {
        replaceBtn.style.display = 'inline-block';
      }
    } else {
      // Фон не установлен
      preview.innerHTML = '';
      preview.style.display = 'none';
      
      status.innerHTML = '⚠️ Эталонный фон ещё не загружен';
      status.style.color = '#95a5a6';
      
      // Скрыть кнопку замены
      if (replaceBtn) {
        replaceBtn.style.display = 'none';
      }
    }
  },
  
  // Заменить эталонный фон
  replaceReferenceBackground() {
    const fileInput = document.getElementById('reference-bg-file');
    if (fileInput) {
      fileInput.click();
    }
  },
  
  // Удалить эталонный фон
  removeReferenceBackground() {
    if (!confirm('Удалить текущий эталонный фон?')) {
      return;
    }
    
    this.studioReferenceBackgroundUrl = '';
    this.saveReferenceBackgroundUrl();
    this.updateReferenceBackgroundUI();
    this.toast('Эталонный фон удалён', 'info');
  }
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  // Загружаем URL из настроек
  if (typeof app !== 'undefined') {
    app.loadReferenceBackgroundUrl();
    app.initReferenceBackground();
    console.log('✓ Reference Background Manager loaded');
  }
});
