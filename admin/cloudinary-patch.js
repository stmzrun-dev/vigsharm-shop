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
      if (!file) {
        return { ok: false, error: 'Нет файла для загрузки' };
      }

      // Сжимаем перед отправкой — и для Cloudinary, и для запасного пути.
      let uploadFile = file;
      try {
        if (typeof this.compressImageFile === 'function') {
          uploadFile = await this.compressImageFile(file);
        }
      } catch (e) {
        console.warn('Сжатие фото не удалось, отправляю оригинал:', e);
        uploadFile = file;
      }

      const cloudinaryUploader = window.CloudinaryUploader;
      const cloudReady = !!(this.cloudinaryCloudName && this.cloudinaryUploadPreset && cloudinaryUploader?.uploadPhoto);
      const imgbbReady = !cloudReady && !!(this.imgbbApiKey && window.ImgbbUploader?.uploadPhoto);

      const label = file.name || 'фото';
      const onProgress = (pct) => {
        this.showPhotoUploadProgress?.(pct, `Загрузка: ${label} · ${pct}%`);
        if (typeof opts.onProgress === 'function') opts.onProgress(pct);
      };

      if (cloudReady) {
        try {
          this.showPhotoUploadProgress?.(0, `Загрузка: ${label}`);
          const result = await cloudinaryUploader.uploadPhoto(
            uploadFile, this.cloudinaryCloudName, this.cloudinaryUploadPreset, { onProgress }
          );
          if (result?.ok) this.showPhotoUploadProgress?.(100, 'Готово');
          else this.hidePhotoUploadProgress?.();
          setTimeout(() => this.hidePhotoUploadProgress?.(), result?.ok ? 600 : 0);
          return result;
        } catch (error) {
          console.error('Cloudinary upload error:', error);
          this.hidePhotoUploadProgress?.();
          return { ok: false, error: error.message || 'Ошибка загрузки в Cloudinary' };
        }
      }

      // Без Cloudinary, но с ключом ImgBB: бесплатный хостинг с настоящей
      // публичной https-ссылкой — подходит и для витрины, и для ИИ-пересъёмки
      // Studio Pro (NordRouter скачивает фото по этой ссылке).
      if (imgbbReady) {
        try {
          this.showPhotoUploadProgress?.(0, `Загрузка: ${label}`);
          const result = await window.ImgbbUploader.uploadPhoto(uploadFile, this.imgbbApiKey, { onProgress });
          if (result?.ok) this.showPhotoUploadProgress?.(100, 'Готово');
          else this.hidePhotoUploadProgress?.();
          setTimeout(() => this.hidePhotoUploadProgress?.(), result?.ok ? 600 : 0);
          return result;
        } catch (error) {
          console.error('ImgBB upload error:', error);
          this.hidePhotoUploadProgress?.();
          return { ok: false, error: error.message || 'Ошибка загрузки в ImgBB' };
        }
      }

      // Нет ни Cloudinary, ни ImgBB: последний запасной путь — Worker сохраняет
      // сжатое фото как data URL прямо в товаре. Это НЕ публичная https-ссылка,
      // поэтому ИИ-пересъёмка (Studio Pro) так работать не может — можно только
      // сохранить фото как есть, без AI-фона.
      try {
        const formData = new FormData();
        formData.append('file', uploadFile);
        const res = await fetch(`${this.workerUrl}/api/upload/photo`, {
          method: 'POST',
          headers: this.authHeaders(),
          body: formData
        });
        return await res.json();
      } catch (error) {
        console.error('Fallback upload error:', error);
        return { ok: false, error: error.message || 'Ошибка загрузки фото' };
      }
    };

    // Cloud Name / Upload Preset уже в app.loadSettings / saveSettings (merge в localStorage).
    // Здесь только подтягиваем значения ещё раз после патча uploadPhoto.
    try { app.loadSettings(); } catch (e) { /* ignore */ }

    console.log('✓ Cloudinary integration enabled');
  };

  initCloudinary();
})();
