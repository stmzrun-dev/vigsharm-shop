// Fix Cloudinary Upload в admin-extended.js
// Заменяет старый uploadPhoto на заглушку (настоящая версия в cloudinary-patch.js)

(function() {
  console.log('🔧 Applying Cloudinary upload fix...');
  
  if (typeof app === 'undefined') {
    console.error('❌ app не найден. Загрузите admin.js сначала.');
    return;
  }
  
  // Переопределяем uploadPhoto на правильную заглушку
  // Настоящая реализация будет в cloudinary-patch.js
  const originalUploadPhoto = app.uploadPhoto;
  
  app.uploadPhoto = async function(file) {
    console.warn('⚠️ uploadPhoto вызван, но Cloudinary может быть не настроен');
    
    // Проверяем, переопределён ли метод в cloudinary-patch.js
    if (this.cloudinaryCloudName && this.cloudinaryUploadPreset) {
      // Cloudinary настроен, вызываем через CloudinaryUploader
      if (window.CloudinaryUploader) {
        return await window.CloudinaryUploader.uploadPhoto(
          file,
          this.cloudinaryCloudName,
          this.cloudinaryUploadPreset
        );
      }
    }
    
    return {
      ok: false,
      error: 'Cloudinary не настроен. Перейдите в Настройки и укажите Cloud Name и Upload Preset.'
    };
  };
  
  console.log('✅ Cloudinary upload fix applied');
})();
