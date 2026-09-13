// VigSharm Admin - Cloudinary Integration
// Загрузка фото напрямую в Cloudinary из браузера

window.CloudinaryUploader = {
  // Загрузка одного файла в Cloudinary
  async uploadPhoto(file, cloudName, uploadPreset) {
    if (!cloudName || !uploadPreset) {
      throw new Error('Cloudinary не настроен. Укажите Cloud Name и Upload Preset в настройках.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'vigsharm-products'); // Папка в Cloudinary

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Ошибка загрузки в Cloudinary');
      }

      const data = await response.json();
      
      return {
        ok: true,
        url: data.secure_url,
        publicId: data.public_id,
        width: data.width,
        height: data.height,
        format: data.format
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return {
        ok: false,
        error: error.message
      };
    }
  },

  // Получить оптимизированный URL для разных размеров
  getOptimizedUrl(publicId, cloudName, options = {}) {
    const { width, height, quality = 'auto', format = 'auto' } = options;
    let transformations = `q_${quality},f_${format}`;
    
    if (width) transformations += `,w_${width}`;
    if (height) transformations += `,h_${height},c_fill`;
    
    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformations}/${publicId}`;
  }
};

console.log('✓ Cloudinary Uploader loaded');
