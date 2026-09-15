// VigSharm Admin - Studio Pro (NEW FLOW: Remove BG + Canvas Composition)
// исходное фото → Cloudinary → Remove BG → transparent PNG → Canvas → reference background → Master 1024×1024

Object.assign(app, {
  // === НАСТРОЙКИ ПОЗИЦИОНИРОВАНИЯ (легко изменяемые) ===
  // Новая версия: учитывает реальные границы объекта после обрезки прозрачности
  getProductPositioning(scene, productWidth, productHeight, canvasSize) {
    // Все значения в процентах или коэффициентах
    // Можно легко менять после визуального теста
    
    const positioning = {
      floor: {
        targetWidth: 0.65,   // Целевая ширина товара относительно canvas (65% от canvas)
        centerX: 0.5,        // Центр по X (0.5 = 50% = центр)
        floorY: 0.93,        // Y-координата "пола" (93% от верха = нижний край canvas)
        useFloorAlignment: true,  // Использовать выравнивание по нижней границе объекта
        description: 'Напольная композиция - товар стоит на полу'
      },
      
      unit_balloon: {
        targetWidth: 0.55,
        centerX: 0.5,
        centerY: 0.60,
        useFloorAlignment: false,
        description: 'Шар поштучно - только стена, без пола'
      },
      
      handheld_bouquet: {
        targetWidth: 0.60,
        centerX: 0.5,
        centerY: 0.65,
        useFloorAlignment: false,
        description: 'Букет в руке - центр на стене'
      },
      
      wall_only: {
        targetWidth: 0.55,
        centerX: 0.5,
        centerY: 0.55,
        useFloorAlignment: false,
        description: 'Только стена - верхняя треть'
      },
      
      photozone: {
        targetWidth: 0.70,
        centerX: 0.5,
        centerY: 0.65,
        useFloorAlignment: false,
        description: 'Фотозона - полный интерьер'
      },
      
      auto: {
        targetWidth: 0.65,
        centerX: 0.5,
        centerY: 0.65,
        useFloorAlignment: false,
        description: 'Автоопределение - универсальное позиционирование'
      }
    };
    
    const config = positioning[scene] || positioning.floor;
    
    // Рассчитываем финальные pixel-координаты
    const aspectRatio = productWidth / productHeight;
    let drawWidth, drawHeight;
    
    // Вычисляем размер с сохранением пропорций (по ширине)
    drawWidth = canvasSize * config.targetWidth;
    drawHeight = drawWidth / aspectRatio;
    
    // Если высота превышает разумные пределы, масштабируем по высоте
    if (drawHeight > canvasSize * 0.85) {
      drawHeight = canvasSize * 0.85;
      drawWidth = drawHeight * aspectRatio;
    }
    
    // Вычисляем позицию
    let drawX, drawY;
    
    if (config.useFloorAlignment && config.floorY !== undefined) {
      // Для floor: выравниваем нижнюю границу товара по floorY
      drawX = (canvasSize * config.centerX) - (drawWidth / 2);
      drawY = (canvasSize * config.floorY) - drawHeight;
    } else {
      // Для остальных: центрируем по centerY
      drawX = (canvasSize * config.centerX) - (drawWidth / 2);
      drawY = (canvasSize * config.centerY) - (drawHeight / 2);
    }
    
    return {
      drawX,
      drawY,
      drawWidth,
      drawHeight,
      config,
      debug: {
        scene,
        targetWidth: config.targetWidth,
        centerX: config.centerX,
        centerY: config.centerY,
        floorY: config.floorY,
        useFloorAlignment: config.useFloorAlignment,
        productAspectRatio: aspectRatio.toFixed(2),
        description: config.description
      }
    };
  },
  
  // === ДИАГНОСТИКА: АНАЛИЗ ALPHA-КАНАЛА ===
  // Собирает статистику по прозрачности изображения
  analyzeAlphaChannel(imageData) {
    const { data, width, height } = imageData;
    const totalPixels = width * height;
    
    let minAlpha = 255;
    let maxAlpha = 0;
    let countAlpha0 = 0;        // Полностью прозрачные (alpha = 0)
    let countAlpha255 = 0;      // Полностью непрозрачные (alpha = 255)
    let countAlphaPartial = 0;  // Полупрозрачные (0 < alpha < 255)
    
    for (let i = 0; i < totalPixels; i++) {
      const alpha = data[i * 4 + 3];
      
      if (alpha < minAlpha) minAlpha = alpha;
      if (alpha > maxAlpha) maxAlpha = alpha;
      
      if (alpha === 0) {
        countAlpha0++;
      } else if (alpha === 255) {
        countAlpha255++;
      } else {
        countAlphaPartial++;
      }
    }
    
    return {
      totalPixels,
      minAlpha,
      maxAlpha,
      countAlpha0,
      countAlpha255,
      countAlphaPartial,
      percentageTransparent: (countAlpha0 / totalPixels) * 100,
      percentageOpaque: (countAlpha255 / totalPixels) * 100,
      percentagePartial: (countAlphaPartial / totalPixels) * 100
    };
  },
  
  
  // === СКАНИРОВАНИЕ ALPHA-КАНАЛА И ОПРЕДЕЛЕНИЕ BOUNDING BOX ===
  // Находит реальные границы непрозрачного объекта в transparent PNG
  getAlphaBoundingBox(imageData) {
    const { data, width, height } = imageData;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let foundPixel = false;
    
    // Сканируем все пиксели
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        
        // Если пиксель не полностью прозрачный (alpha > 10 для защиты от шума)
        if (alpha > 10) {
          foundPixel = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    // Если не нашли ни одного непрозрачного пикселя, возвращаем весь canvas
    if (!foundPixel) {
      return { x: 0, y: 0, width, height };
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  },


  // === Studio Pro - НОВЫЙ FLOW ===
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
      console.log('[Frontend NEW] ====== STARTING NEW FLOW ======');
      console.log('[Frontend NEW] Reference BG URL:', this.studioReferenceBackgroundUrl || '(not set)');
      
      // Проверка эталонного фона
      if (!this.studioReferenceBackgroundUrl) {
        throw new Error('Эталонный фон не загружен. Перейдите в "Настройки" → "Эталонный фон"');
      }
      
      // 1. Берём ТОЛЬКО ПЕРВОЕ ФОТО (оригинал)
      const originalPhoto = this.currentProduct.photos[0];
      
      // 2. Если фото не загружено в Cloudinary - загружаем
      let imageUrl = originalPhoto.url;
      if (!originalPhoto.uploaded && originalPhoto.file) {
        statusEl.textContent = '☁️ Загрузка в Cloudinary...';
        console.log('[Frontend NEW] 📤 Загружаем фото в Cloudinary...');
        
        const uploadResult = await this.uploadPhoto(originalPhoto.file);
        
        if (!uploadResult.ok) {
          throw new Error(`Cloudinary upload failed: ${uploadResult.error}`);
        }
        
        imageUrl = uploadResult.url;
        originalPhoto.url = imageUrl;
        originalPhoto.uploaded = true;
        
        console.log('[Frontend NEW] ✅ Cloudinary upload successful:', imageUrl);
      }
      
      statusEl.textContent = '🎨 Удаление фона (Remove BG)...';
      console.log('[Frontend NEW] 📸 Отправка на Remove BG:', imageUrl);
      
      // 3. Отправляем на Remove BG
      const res = await fetch(`${this.workerUrl}/api/studio/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ 
          image_url: imageUrl,
          scene: this.currentProduct.scene || 'floor',
          prompt: ''
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Frontend NEW] ❌ Remove BG API error:', res.status, errorText);
        throw new Error(`Remove BG API error (${res.status}): ${errorText}`);
      }
      
      const data = await res.json();
      if (!data.ok || !data.job_id) {
        throw new Error(data.error || 'Не удалось запустить Remove BG');
      }
      
      console.log('[Frontend NEW] ✅ Remove BG job created:', data.job_id);
      console.log('[Frontend NEW] Scene:', data.scene);
      
      // 4. Опрос статуса Remove BG
      statusEl.textContent = '⏳ Обработка Remove BG... (30-60 секунд)';
      const transparentPngDataUrl = await this.pollStudioStatusSimple(data.job_id);
      
      console.log('[Frontend NEW] ✅ Transparent PNG received (length):', transparentPngDataUrl.length);
      
      // 5. Canvas композиция
      statusEl.textContent = '🖼️ Композиция с эталонным фоном...';
      const masterImageUrl = await this.composeWithBackground(
        transparentPngDataUrl, 
        this.studioReferenceBackgroundUrl,
        data.scene || this.currentProduct.scene || 'floor'
      );
      
      console.log('[Frontend NEW] ✅ Master image composed');
      
      // 6. Создать Photo #2 и Photo #3
      statusEl.textContent = '✂️ Создание crop-фотографий...';
      const { photo2, photo3 } = await this.createCropPhotos(masterImageUrl);
      
      // 7. Заменить все фото
      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: masterImageUrl, uploaded: true, type: 'master' },
        { id: Date.now() + '_crop2', url: photo2, uploaded: true, type: 'crop' },
        { id: Date.now() + '_crop3', url: photo3, uploaded: true, type: 'crop' }
      ];
      
      this.renderPhotos();
      statusEl.textContent = '✅ Готово! 3 фото созданы';
      this.toast('Studio Pro: 3 фото созданы успешно', 'success');
      
    } catch (error) {
      console.error('[Frontend NEW] ❌ Studio Pro error:', error);
      statusEl.textContent = '❌ Ошибка: ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🎨 Запустить Studio Pro';
    }
  },
  
  
  // Canvas композиция: transparent PNG + reference background → 1024×1024 WebP
  // НОВЫЙ АЛГОРИТМ: сканирование alpha-канала → обрезка → масштабирование → композиция
  async composeWithBackground(transparentPngDataUrl, backgroundUrl, scene) {
    return new Promise((resolve, reject) => {
      const MASTER_SIZE = 1024;
      
      const bgImg = new Image();
      const productImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      productImg.crossOrigin = 'anonymous';
      
      let bgLoaded = false;
      let productLoaded = false;
      
      const tryCompose = () => {
        if (!bgLoaded || !productLoaded) return;
        try {
          console.log('[Canvas] ====== НАЧАЛО КОМПОЗИЦИИ ======');
          console.log(`[Canvas] Transparent PNG: ${productImg.width}x${productImg.height}`);
          
          // ШАГ 1: Загружаем transparent PNG во временный canvas для сканирования alpha
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          tempCanvas.width = productImg.width;
          tempCanvas.height = productImg.height;
          tempCtx.drawImage(productImg, 0, 0);
          
          // ШАГ 2: Получаем imageData и сканируем alpha-канал
          const imageData = tempCtx.getImageData(0, 0, productImg.width, productImg.height);
          
          // === ДИАГНОСТИКА 5: Анализ alpha-канала ===
          console.log('[DIAGNOSTIC] 🔍 Starting alpha channel analysis...');
          const alphaStats = this.analyzeAlphaChannel(imageData);
          console.log('[DIAGNOSTIC] 🔍 Alpha statistics:');
          console.log('  - Image dimensions:', productImg.width, 'x', productImg.height);
          console.log('  - Total pixels:', alphaStats.totalPixels);
          console.log('  - minAlpha:', alphaStats.minAlpha);
          console.log('  - maxAlpha:', alphaStats.maxAlpha);
          console.log('  - countAlpha0 (transparent):', alphaStats.countAlpha0);
          console.log('  - countAlpha255 (opaque):', alphaStats.countAlpha255);
          console.log('  - countAlphaPartial (semi-transparent):', alphaStats.countAlphaPartial);
          console.log('  - percentageTransparent:', alphaStats.percentageTransparent.toFixed(2) + '%');
          console.log('  - percentageOpaque:', alphaStats.percentageOpaque.toFixed(2) + '%');
          console.log('  - percentagePartial:', alphaStats.percentagePartial.toFixed(2) + '%');
          
          if (alphaStats.percentageTransparent < 1) {
            console.warn('[DIAGNOSTIC] ⚠️ WARNING: Less than 1% transparent pixels! Image may not have proper transparency.');
          }
          
          const boundingBox = this.getAlphaBoundingBox(imageData);
          console.log(`[Canvas] Alpha bounding box: x=${boundingBox.x} y=${boundingBox.y} width=${boundingBox.width} height=${boundingBox.height}`);
          
          // ШАГ 3: Создаем обрезанный canvas с только реальным объектом
          const croppedCanvas = document.createElement('canvas');
          const croppedCtx = croppedCanvas.getContext('2d');
          croppedCanvas.width = boundingBox.width;
          croppedCanvas.height = boundingBox.height;
          
          // Копируем только область с объектом
          croppedCtx.drawImage(
            productImg,
            boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
            0, 0, boundingBox.width, boundingBox.height
          );
          console.log(`[Canvas] Cropped product: ${boundingBox.width}x${boundingBox.height}`);
          
          // ШАГ 4: Вычисляем позиционирование на основе РЕАЛЬНОГО размера объекта
          const positioning = this.getProductPositioning(
            scene, 
            boundingBox.width,  // Используем размеры обрезанного объекта
            boundingBox.height, 
            MASTER_SIZE
          );
          
          console.log(`[Canvas] Final product: ${Math.round(positioning.drawWidth)}x${Math.round(positioning.drawHeight)}`);
          console.log(`[Canvas] Position: x=${Math.round(positioning.drawX)} y=${Math.round(positioning.drawY)}`);
          if (positioning.config.useFloorAlignment) {
            console.log(`[Canvas] FloorY: ${Math.round(MASTER_SIZE * positioning.config.floorY)}`);
          }
          console.log('[Canvas] Scene config:', positioning.debug);
          
          // ШАГ 5: Создаем финальный canvas и композицию
          const finalCanvas = document.createElement('canvas');
          const finalCtx = finalCanvas.getContext('2d');
          finalCanvas.width = MASTER_SIZE;
          finalCanvas.height = MASTER_SIZE;
          
          // Рисуем эталонный фон
          finalCtx.drawImage(bgImg, 0, 0, MASTER_SIZE, MASTER_SIZE);
          
          // Рисуем обрезанный товар с правильным масштабом и позицией
          finalCtx.drawImage(
            croppedCanvas,
            positioning.drawX, 
            positioning.drawY, 
            positioning.drawWidth, 
            positioning.drawHeight
          );
          
          console.log('[Canvas] ====== КОМПОЗИЦИЯ ЗАВЕРШЕНА ======');
          
          resolve(finalCanvas.toDataURL('image/webp', 0.92));
        } catch (error) {
          console.error('[Canvas] Ошибка композиции:', error);
          reject(error);
        }
      };
      
      bgImg.onload = () => { bgLoaded = true; tryCompose(); };
      bgImg.onerror = () => reject(new Error('Не удалось загрузить эталонный фон'));
      productImg.onload = () => { productLoaded = true; tryCompose(); };
      productImg.onerror = () => reject(new Error('Не удалось загрузить transparent PNG'));
      
      bgImg.src = backgroundUrl;
      productImg.src = transparentPngDataUrl;
    });
  },
  
  async pollStudioStatusSimple(jobId) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const res = await fetch(`${this.workerUrl}/api/studio/status/${jobId}`, { headers: this.authHeaders() });
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Ошибка проверки статуса');
      if (data.status === 'done' && data.result_url) return data.result_url;
      if (data.status === 'failed') throw new Error('Обработка не удалась');
    }
    throw new Error('Таймаут обработки');
  },
  
  async createCropPhotos(masterImageDataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const photo2 = this.cropImage(img, img.width, img.height, 0, 0.5);
          const photo3 = this.cropImage(img, img.width, img.height, 0, 0.7);
          resolve({ photo2, photo3 });
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Не удалось загрузить Master Image'));
      img.src = masterImageDataUrl;
    });
  },
  
  cropImage(img, width, height, startYRatio = 0, heightRatio = 0.5) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const cropHeight = height * heightRatio;
    const size = Math.min(width, cropHeight);
    canvas.width = size;
    canvas.height = size;
    const sx = (width - size) / 2;
    const sy = startYRatio * height;
    ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
    return canvas.toDataURL('image/webp', 0.92);
  }
});

console.log('✓ Studio Pro NEW FLOW (Remove BG + Canvas) loaded');
