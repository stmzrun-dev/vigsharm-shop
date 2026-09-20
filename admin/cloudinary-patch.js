// VigSharm Admin - Cloudinary Patch
// Переопределяем функцию uploadPhoto для работы с Cloudinary

(function() {
  let tries = 0;
  const initCloudinary = () => {
    if (typeof app === 'undefined' || !window.CloudinaryUploader?.uploadPhoto) {
      tries += 1;
      if (tries > 50) {
        console.error('CloudinaryUploader не загрузился — проверьте cloudinary-upload.js');
        return;
      }
      setTimeout(initCloudinary, 100);
      return;
    }

    app.cloudinaryCloudName = app.cloudinaryCloudName || '';
    app.cloudinaryUploadPreset = app.cloudinaryUploadPreset || '';

    app.uploadPhoto = async function(file, opts = {}) {
      const uploader = window.CloudinaryUploader;
      if (!uploader || typeof uploader.uploadPhoto !== 'function') {
        return {
          ok: false,
          error: 'Модуль Cloudinary не загружен. Обновите страницу (Ctrl+F5).'
        };
      }
      if (!this.cloudinaryCloudName || !this.cloudinaryUploadPreset) {
        return {
          ok: false,
          error: 'Cloudinary не настроен. Перейдите в Настройки и укажите Cloud Name и Upload Preset.'
        };
      }
      if (!file) {
        return { ok: false, error: 'Нет файла для загрузки' };
      }

      try {
        const label = file.name || 'фото';
        this.showPhotoUploadProgress?.(0, `Загрузка: ${label}`);
        const result = await uploader.uploadPhoto(
          file,
          this.cloudinaryCloudName,
          this.cloudinaryUploadPreset,
          {
            onProgress: (pct) => {
              this.showPhotoUploadProgress?.(pct, `Загрузка: ${label} · ${pct}%`);
              if (typeof opts.onProgress === 'function') opts.onProgress(pct);
            }
          }
        );
        if (result?.ok) this.showPhotoUploadProgress?.(100, 'Готово');
        else this.hidePhotoUploadProgress?.();
        setTimeout(() => this.hidePhotoUploadProgress?.(), result?.ok ? 600 : 0);
        return result;
      } catch (error) {
        console.error('Upload error:', error);
        this.hidePhotoUploadProgress?.();
        return {
          ok: false,
          error: error.message || 'Ошибка загрузки фото'
        };
      }
    };

    const originalLoadSettings = app.loadSettings;
    app.loadSettings = function() {
      originalLoadSettings.call(this);
      try {
        const saved = localStorage.getItem('vigsharm_admin_settings');
        if (saved) {
          const settings = JSON.parse(saved);
          this.cloudinaryCloudName = settings.cloudinaryCloudName || '';
          this.cloudinaryUploadPreset = settings.cloudinaryUploadPreset || '';
          if (document.getElementById('cloudinary-cloud-name')) {
            document.getElementById('cloudinary-cloud-name').value = this.cloudinaryCloudName;
          }
          if (document.getElementById('cloudinary-upload-preset')) {
            document.getElementById('cloudinary-upload-preset').value = this.cloudinaryUploadPreset;
          }
        }
      } catch (e) {
        console.error('Failed to load Cloudinary settings:', e);
      }
    };

    const originalSaveSettings = app.saveSettings;
    app.saveSettings = function() {
      this.cloudinaryCloudName = document.getElementById('cloudinary-cloud-name')?.value.trim() || '';
      this.cloudinaryUploadPreset = document.getElementById('cloudinary-upload-preset')?.value.trim() || '';
      this.workerUrl = document.getElementById('worker-url')?.value.trim() || this.workerUrl;
      this.adminApiKey = document.getElementById('admin-api-key')?.value.trim() || '';

      try {
        const saved = localStorage.getItem('vigsharm_admin_settings');
        const settings = saved ? JSON.parse(saved) : {};
        settings.cloudinaryCloudName = this.cloudinaryCloudName;
        settings.cloudinaryUploadPreset = this.cloudinaryUploadPreset;
        settings.workerUrl = this.workerUrl;
        settings.adminApiKey = this.adminApiKey;
        localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
        this.toast('Настройки сохранены', 'success');
      } catch (e) {
        this.toast('Ошибка сохранения', 'error');
      }
    };

    try { app.loadSettings(); } catch (e) { /* ignore */ }

    console.log('✓ Cloudinary integration enabled');
  };

  initCloudinary();
})();
