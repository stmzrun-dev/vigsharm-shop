// VigSharm Admin - Cloudinary Integration
// Загрузка фото напрямую в Cloudinary из браузера

window.CloudinaryUploader = {
  /**
   * @param {File|Blob} file
   * @param {string} cloudName
   * @param {string} uploadPreset
   * @param {{ onProgress?: (pct: number) => void }} [opts]
   */
  async uploadPhoto(file, cloudName, uploadPreset, opts = {}) {
    if (!cloudName || !uploadPreset) {
      throw new Error('Cloudinary не настроен. Укажите Cloud Name и Upload Preset в настройках.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'vigsharm-products');

    console.log('📤 Cloudinary Upload:', { cloudName, uploadPreset, fileName: file.name, fileSize: file.size });

    try {
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable || typeof opts.onProgress !== 'function') return;
          const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
          opts.onProgress(pct);
        };
        xhr.onload = () => {
          let body = null;
          try { body = JSON.parse(xhr.responseText || '{}'); } catch { body = {}; }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body);
            return;
          }
          const msg = body?.error?.message || `HTTP ${xhr.status}`;
          const err = new Error(msg);
          err.body = body;
          reject(err);
        };
        xhr.onerror = () => reject(new Error('Сеть: не удалось загрузить в Cloudinary'));
        xhr.send(formData);
      });

      console.log('✅ CLOUDINARY UPLOAD SUCCESS');
      console.log('secure_url:', data.secure_url);
      console.log('public_id:', data.public_id);

      if (typeof opts.onProgress === 'function') opts.onProgress(100);

      return {
        ok: true,
        url: data.secure_url,
        publicId: data.public_id,
        width: data.width,
        height: data.height,
        format: data.format
      };
    } catch (error) {
      console.error('❌ Cloudinary upload error:', error);
      const message = error?.message || String(error);

      if (message.includes('Upload preset must be whitelisted')) {
        return {
          ok: false,
          error:
            `Upload preset "${uploadPreset}" не настроен как UNSIGNED.\n\n` +
            `Решение:\n` +
            `1. Откройте https://console.cloudinary.com/\n` +
            `2. Settings → Upload → Upload Presets\n` +
            `3. Найдите preset "${uploadPreset}"\n` +
            `4. Убедитесь что Signing Mode = Unsigned\n` +
            `5. Или создайте новый UNSIGNED preset`
        };
      }

      if (message.includes('Invalid cloud_name')) {
        return {
          ok: false,
          error:
            `Неверный Cloud Name: "${cloudName}".\n\n` +
            `Решение: Проверьте Cloud Name на Cloudinary Dashboard`
        };
      }

      return {
        ok: false,
        error: message || 'Ошибка загрузки в Cloudinary'
      };
    }
  },

  getOptimizedUrl(publicId, cloudName, options = {}) {
    const { width, height, quality = 'auto', format = 'auto' } = options;
    let transformations = `q_${quality},f_${format}`;

    if (width) transformations += `,w_${width}`;
    if (height) transformations += `,h_${height},c_fill`;

    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformations}/${publicId}`;
  }
};

console.log('✓ Cloudinary Uploader loaded');
