// VigSharm Admin — порядок загрузки фото:
// 1) Worker → Yandex Object Storage (основной)
// 2) ImgBB (временный запасной https для Studio Pro)
// 3) Cloudinary (legacy)

(function() {
  let tries = 0;

  function isPublicHttps(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  const initUploadPatch = () => {
    if (typeof app === 'undefined') {
      tries += 1;
      if (tries > 50) {
        console.error('app не загрузился — uploadPhoto patch пропущен');
        return;
      }
      setTimeout(initUploadPatch, 100);
      return;
    }

    app.cloudinaryCloudName = app.cloudinaryCloudName || '';
    app.cloudinaryUploadPreset = app.cloudinaryUploadPreset || '';

    app.uploadPhoto = async function(file, opts = {}) {
      if (!file) {
        return { ok: false, error: 'Нет файла для загрузки' };
      }

      let uploadFile = file;
      try {
        if (typeof this.compressImageFile === 'function') {
          uploadFile = await this.compressImageFile(file);
        }
      } catch (e) {
        console.warn('Сжатие фото не удалось, отправляю оригинал:', e);
        uploadFile = file;
      }

      const label = file.name || 'фото';
      const onProgress = (pct) => {
        this.showPhotoUploadProgress?.(pct, `Загрузка: ${label} · ${pct}%`);
        if (typeof opts.onProgress === 'function') opts.onProgress(pct);
      };

      const finishOk = (result) => {
        if (result?.ok) this.showPhotoUploadProgress?.(100, 'Готово');
        else this.hidePhotoUploadProgress?.();
        setTimeout(() => this.hidePhotoUploadProgress?.(), result?.ok ? 600 : 0);
        return result;
      };

      // 1) Worker → R2 (основной путь после своего домена)
      if (this.workerUrl) {
        try {
          this.showPhotoUploadProgress?.(0, `Загрузка на сервер: ${label}`);
          const formData = new FormData();
          formData.append('file', uploadFile);
          const res = await fetch(`${this.workerUrl}/api/upload/photo`, {
            method: 'POST',
            headers: this.authHeaders(),
            body: formData
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result?.ok && isPublicHttps(result.url) && result.storage !== 'data-url') {
            console.log('✅ Worker/R2 upload', result.url);
            return finishOk(result);
          }
          if (result?.storage === 'data-url' || (result?.url && String(result.url).startsWith('data:'))) {
            console.warn('Worker вернул data-URL (R2 ещё не готов) — пробуем запасной хостинг');
          } else if (!res.ok || !result?.ok) {
            console.warn('Worker upload failed:', result?.error || res.status);
          }
        } catch (error) {
          console.warn('Worker upload error, fallback:', error);
        }
      }

      // 2) ImgBB — публичный https, пока R2/домен не готовы
      if (this.imgbbApiKey && window.ImgbbUploader?.uploadPhoto) {
        try {
          this.showPhotoUploadProgress?.(0, `Загрузка ImgBB: ${label}`);
          const result = await window.ImgbbUploader.uploadPhoto(uploadFile, this.imgbbApiKey, { onProgress });
          if (result?.ok && isPublicHttps(result.url)) {
            console.log('✅ ImgBB upload (fallback)', result.url);
            return finishOk(result);
          }
          this.hidePhotoUploadProgress?.();
        } catch (error) {
          console.error('ImgBB upload error:', error);
          this.hidePhotoUploadProgress?.();
        }
      }

      // 3) Cloudinary — только legacy, если поля ещё заполнены
      const cloudReady = !!(
        this.cloudinaryCloudName &&
        this.cloudinaryUploadPreset &&
        window.CloudinaryUploader?.uploadPhoto
      );
      if (cloudReady) {
        try {
          this.showPhotoUploadProgress?.(0, `Загрузка Cloudinary: ${label}`);
          const result = await window.CloudinaryUploader.uploadPhoto(
            uploadFile, this.cloudinaryCloudName, this.cloudinaryUploadPreset, { onProgress }
          );
          return finishOk(result);
        } catch (error) {
          console.error('Cloudinary upload error:', error);
          this.hidePhotoUploadProgress?.();
          return { ok: false, error: error.message || 'Ошибка загрузки в Cloudinary' };
        }
      }

      this.hidePhotoUploadProgress?.();
      return {
        ok: false,
        error: 'Нет рабочего хранилища фото. Включите R2 (Worker) или укажите ImgBB API Key в Настройках.'
      };
    };

    console.log('✓ Photo upload: Worker/Yandex → ImgBB → Cloudinary');
  };

  initUploadPatch();
})();
