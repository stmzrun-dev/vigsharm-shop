// VigSharm Admin - Studio Pro (NEW ARCHITECTURE)
// ONE AI REQUEST → ONE MASTER → THREE CROPS

Object.assign(app, {
  // === Studio Pro - НОВАЯ АРХИТЕКТУРА ===
  async processStudioProNew() {
    if (this.currentProduct.photos.length === 0) { 
      this.toast('Загрузите хотя бы одно фото', 'error'); 
      return; 
    }
    
    const btn = document.getElementById('process-studio-btn');
    const statusEl = document.getElementById('studio-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Обработка...';
    
    try {
      // НОВАЯ АРХИТЕКТУРА: ONE AI REQUEST → ONE MASTER → THREE CROPS
      
      // 1. Берём ТОЛЬКО ПЕРВОЕ ФОТО (оригинал)
      const originalPhoto = this.currentProduct.photos[0];
      
      // 2. Если фото не загружено в Cloudinary - загружаем
      let imageUrl = originalPhoto.url;
      if (!originalPhoto.uploaded && originalPhoto.file) {
        statusEl.textContent = '☁️ Загрузка в Cloudinary...';
        console.log('📤 Загружаем фото в Cloudinary...');
        
        const uploadResult = await this.uploadPhoto(originalPhoto.file);
        
        if (!uploadResult.ok) {
          throw new Error(`Cloudinary upload failed: ${uploadResult.error}`);
        }
        
        imageUrl = uploadResult.url;
        originalPhoto.url = imageUrl;
        originalPhoto.uploaded = true;
        
        console.log('✅ Cloudinary upload successful:', imageUrl);
      }
      
      statusEl.textContent = '📸 Отправка в Studio Pro...';
      console.log('📸 Отправка в Studio Pro:', imageUrl);
      
      // 3. Отправляем на обработку
      const res = await fetch(`${this.workerUrl}/api/studio/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image_url: imageUrl,
          scene: this.currentProduct.scene || 'floor',
          prompt: '' // Дополнительные инструкции (пока пусто)
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Studio Pro API error:', res.status, errorText);
        throw new Error(`Studio Pro API error (${res.status}): ${errorText}`);
      }
      
      const data = await res.json();
      if (!data.ok || !data.job_id) {
        throw new Error(data.error || 'Не удалось запустить обработку');
      }
      
      console.log('✅ Job created:', data.job_id);
      
      // 4. Опрос статуса (используем старую функцию pollStudioStatus)
      statusEl.textContent = '⏳ Обработка через AI... (это может занять 1-2 минуты)';
      const masterImageUrl = await this.pollStudioStatusSimple(data.job_id);
      
      console.log('✅ Master image received:', masterImageUrl.substring(0, 100));
      
      // 5. Создать Photo #2 и Photo #3 из Master (локально, без AI)
      statusEl.textContent = '✂️ Создание crop-фотографий...';
      const { photo2, photo3 } = await this.createCropPhotos(masterImageUrl);
      
      // 5. Заменить все фото на новые (3 фото)
      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: masterImageUrl, uploaded: true, type: 'master' },
        { id: Date.now() + '_crop2', url: photo2, uploaded: true, type: 'crop' },
        { id: Date.now() + '_crop3', url: photo3, uploaded: true, type: 'crop' }
      ];
      
      // 6. Сохранить оригинал (опционально, в metadata)
      this.currentProduct.originalPhoto = originalPhoto.url;
      
      this.renderPhotos();
      statusEl.innerHTML = '✅ Готово! 1 Master + 2 crop-фото созданы';
      this.toast('Studio Pro завершён успешно!', 'success');
      
    } catch (e) {
      console.error('Studio Pro error:', e);
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ Обработать фото через Studio Pro';
    }
  },
  
  // Опрос статуса (упрощенная версия)
  async pollStudioStatusSimple(jobId) {
    const maxAttempts = 60; // 60 попыток × 3 сек = 3 минуты
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Ждем 3 секунды
      
      const res = await fetch(`${this.workerUrl}/api/studio/status/${jobId}`);
      const data = await res.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Ошибка проверки статуса');
      }
      
      if (data.status === 'done' && data.result_url) {
        console.log('✅ Получен result_url:', {
          length: data.result_url.length,
          preview: data.result_url.substring(0, 100),
          format: data.format
        });
        return data.result_url; // Возвращаем Master Image
      }
      
      if (data.status === 'failed') {
        throw new Error('Обработка не удалась на стороне AI');
      }
      
      // Продолжаем опрос
      console.log(`Studio Pro: опрос ${i + 1}/${maxAttempts}, статус: ${data.status}`);
    }
    
    throw new Error('Таймаут обработки (превышено 3 минуты)');
  },
  
  // Создать Photo #2 и Photo #3 из Master Image (БЕЗ AI)
  async createCropPhotos(masterImageDataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          const width = img.width;
          const height = img.height;
          
          console.log(`Master Image размер: ${width}x${height}`);
          
          // Photo #2: Только стена (верхняя половина)
          const photo2 = this.cropImage(img, width, height, 0, 0.5);
          
          // Photo #3: Стена + пол (верхние 70%)
          const photo3 = this.cropImage(img, width, height, 0, 0.7);
          
          console.log('Crop фотографии созданы успешно');
          resolve({ photo2, photo3 });
        } catch (error) {
          console.error('Ошибка при создании crop:', error);
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Не удалось загрузить Master Image для crop'));
      };
      
      img.src = masterImageDataUrl;
    });
  },
  
  // Crop изображения
  cropImage(img, width, height, startYRatio = 0, heightRatio = 0.5) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Вычисляем размер crop области
    const cropHeight = height * heightRatio;
    const size = Math.min(width, cropHeight);
    
    canvas.width = size;
    canvas.height = size;
    
    // Центрируем по горизонтали, crop сверху
    const sx = (width - size) / 2;
    const sy = startYRatio * height;
    
    ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
    
    return canvas.toDataURL('image/webp', 0.92);
  }
});

console.log('✓ Studio Pro NEW ARCHITECTURE loaded');
