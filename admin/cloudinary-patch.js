// VigSharm Admin - Cloudinary Patch
// Переопределяем функцию uploadPhoto для работы с Cloudinary

(function() {
  // Ждем загрузки app
  const initCloudinary = () => {
    if (typeof app === 'undefined') {
      setTimeout(initCloudinary, 100);
      return;
    }

    // Добавляем поля Cloudinary в app
    app.cloudinaryCloudName = app.cloudinaryCloudName || '';
    app.cloudinaryUploadPreset = app.cloudinaryUploadPreset || '';

    // Переопределяем функцию uploadPhoto
    app.uploadPhoto = async function(file) {
      // Проверяем настройки Cloudinary
      if (!this.cloudinaryCloudName || !this.cloudinaryUploadPreset) {
        return {
          ok: false,
          error: 'Cloudinary не настроен. Перейдите в Настройки и укажите Cloud Name и Upload Preset.'
        };
      }

      try {
        const result = await window.CloudinaryUploader.uploadPhoto(
          file, 
          this.cloudinaryCloudName, 
          this.cloudinaryUploadPreset
        );
        return result;
      } catch (error) {
        console.error('Upload error:', error);
        return {
          ok: false,
          error: error.message || 'Ошибка загрузки фото'
        };
      }
    };

    // Обновляем loadSettings для Cloudinary
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

    // Обновляем saveSettings для Cloudinary
    const originalSaveSettings = app.saveSettings;
    app.saveSettings = function() {
      this.cloudinaryCloudName = document.getElementById('cloudinary-cloud-name')?.value.trim() || '';
      this.cloudinaryUploadPreset = document.getElementById('cloudinary-upload-preset')?.value.trim() || '';
      
      try {
        const saved = localStorage.getItem('vigsharm_admin_settings');
        const settings = saved ? JSON.parse(saved) : {};
        settings.cloudinaryCloudName = this.cloudinaryCloudName;
        settings.cloudinaryUploadPreset = this.cloudinaryUploadPreset;
        settings.workerUrl = this.workerUrl;
        // Примечание: NordRouter-ключ больше НЕ хранится в localStorage — он живёт только
        // в Worker secrets (см. миграцию в admin.js loadSettings()). Поле nordrouterKey
        // на app отсутствует, поэтому строка settings.nordrouterKey = ... была удалена.

        localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
        this.toast('Настройки сохранены', 'success');
      } catch (e) {
        this.toast('Ошибка сохранения', 'error');
      }
    };

    console.log('✓ Cloudinary integration enabled');
  };

  initCloudinary();
})();
