// VigSharm Admin - ImgBB Integration
// Бесплатный запасной хостинг фото с публичными https-ссылками (нужны для
// ИИ-пересъёмки Studio Pro — NordRouter скачивает фото по ссылке).
// Используется, когда Cloudinary не настроен (Cloud Name / Upload Preset пустые),
// но задан ImgBB API Key в Настройках.

window.ImgbbUploader = {
  /**
   * @param {File|Blob} file
   * @param {string} apiKey
   * @param {{ onProgress?: (pct: number) => void }} [opts]
   */
  async uploadPhoto(file, apiKey, opts = {}) {
    if (!apiKey) {
      throw new Error('ImgBB не настроен. Укажите API Key в Настройках.');
    }

    const formData = new FormData();
    formData.append('image', file);

    console.log('📤 ImgBB Upload:', { fileName: file.name, fileSize: file.size });

    try {
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable || typeof opts.onProgress !== 'function') return;
          const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
          opts.onProgress(pct);
        };
        xhr.onload = () => {
          let body = null;
          try { body = JSON.parse(xhr.responseText || '{}'); } catch { body = {}; }
          if (xhr.status >= 200 && xhr.status < 300 && body?.success) {
            resolve(body.data);
            return;
          }
          const msg = body?.error?.message || body?.status_txt || `HTTP ${xhr.status}`;
          reject(new Error(msg));
        };
        xhr.onerror = () => reject(new Error('Сеть: не удалось загрузить в ImgBB'));
        xhr.send(formData);
      });

      console.log('✅ IMGBB UPLOAD SUCCESS', data.url);
      if (typeof opts.onProgress === 'function') opts.onProgress(100);

      return {
        ok: true,
        url: data.url, // прямая https-ссылка на картинку — годится для NordRouter и для витрины
        deleteUrl: data.delete_url,
        width: data.width,
        height: data.height
      };
    } catch (error) {
      console.error('❌ ImgBB upload error:', error);
      return { ok: false, error: error?.message || 'Ошибка загрузки в ImgBB' };
    }
  }
};

console.log('✓ ImgBB Uploader loaded');
