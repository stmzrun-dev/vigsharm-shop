// VigSharm Admin - Studio Pro
// Remove BG → Canvas на эталон → AI-доводка (nano-banana) → Master → crops

Object.assign(app, {
  MASTER_SIZE: 2048,
  WEBP_QUALITY: 0.92,

  isWallOnlyScene(scene) {
    return ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  },

  // === НАСТРОЙКИ ПОЗИЦИОНИРОВАНИЯ ===
  getProductPositioning(scene, productWidth, productHeight, canvasSize) {
    const positioning = {
      floor: {
        targetWidth: 0.65,
        centerX: 0.5,
        floorY: 0.93,
        useFloorAlignment: true,
        maxHeight: 0.85,
        description: 'Напольная композиция - товар стоит на полу'
      },
      
      unit_balloon: {
        targetWidth: 0.50,
        centerX: 0.5,
        centerY: 0.52,
        useFloorAlignment: false,
        maxHeight: 0.78,
        description: 'Шар поштучно - только стена'
      },
      
      handheld_bouquet: {
        targetWidth: 0.55,
        centerX: 0.5,
        centerY: 0.48,
        useFloorAlignment: false,
        maxHeight: 0.72,
        description: 'Букет в руке - стена, место снизу под руку'
      },
      
      wall_only: {
        targetWidth: 0.62,
        centerX: 0.5,
        centerY: 0.50,
        useFloorAlignment: false,
        maxHeight: 0.80,
        description: 'Только стена'
      },
      
      photozone: {
        targetWidth: 0.78,
        centerX: 0.5,
        floorY: 0.94,
        useFloorAlignment: true,
        maxHeight: 0.88,
        description: 'Фотозона в студии (масштаб в кадре)'
      },
      
      auto: {
        targetWidth: 0.65,
        centerX: 0.5,
        floorY: 0.93,
        useFloorAlignment: true,
        maxHeight: 0.85,
        description: 'Авто = напольная'
      }
    };
    
    const config = positioning[scene] || positioning.floor;
    
    const aspectRatio = productWidth / productHeight;
    let drawWidth, drawHeight;
    
    drawWidth = canvasSize * config.targetWidth;
    drawHeight = drawWidth / aspectRatio;
    
    const maxH = canvasSize * (config.maxHeight || 0.85);
    if (drawHeight > maxH) {
      drawHeight = maxH;
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
  
  
  // === HARDENING ALPHA (Recraft soft-matte → плотный силуэт) ===
  // Recraft часто отдаёт 0% fully-opaque пикселей → «призрак» после апскейла.
  hardenAlphaChannel(imageData, { solidAt = 48, killBelow = 24 } = {}) {
    const { data } = imageData;
    let hardened = 0;
    let killed = 0;

    for (let i = 3; i < data.length; i += 4) {
      const a = data[i];
      if (a >= solidAt) {
        if (a < 255) {
          data[i] = 255;
          hardened++;
        }
      } else if (a < killBelow) {
        if (a !== 0) {
          data[i] = 0;
          killed++;
        }
      } else {
        // Узкая кайма: поднимаем к непрозрачности, чтобы не было серой дымки
        data[i] = 255;
        hardened++;
      }
    }

    console.log(`[Canvas] Alpha harden: solidAt=${solidAt}, killBelow=${killBelow}, hardened=${hardened}, killed=${killed}`);
    return imageData;
  },

  // === СКАНИРОВАНИЕ ALPHA-КАНАЛА И ОПРЕДЕЛЕНИЕ BOUNDING BOX ===
  // Находит реальные границы непрозрачного объекта в transparent PNG
  getAlphaBoundingBox(imageData) {
    const { data, width, height } = imageData;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let foundPixel = false;
    
    // Сканируем все пиксели (после harden достаточно alpha > 0)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        
        if (alpha > 32) {
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


  // === Studio Pro FLOW ===
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
      const scene = this.currentProduct.scene || 'floor';
      console.log('[Studio Pro] ====== START ======', { scene });
      console.log('[Studio Pro] Reference BG:', this.studioReferenceBackgroundUrl || '(not set)');
      
      if (!this.studioReferenceBackgroundUrl) {
        throw new Error('Эталонный фон не загружен. Перейдите в "Настройки" → "Эталонный фон"');
      }
      
      const originalPhoto = this.currentProduct.photos[0];
      
      let imageUrl = originalPhoto.url;
      if (!originalPhoto.uploaded && originalPhoto.file) {
        statusEl.textContent = '☁️ Загрузка в Cloudinary...';
        const uploadResult = await this.uploadPhoto(originalPhoto.file);
        if (!uploadResult.ok) {
          throw new Error(`Cloudinary upload failed: ${uploadResult.error}`);
        }
        imageUrl = uploadResult.url;
        originalPhoto.url = imageUrl;
        originalPhoto.uploaded = true;
      }
      
      // 1) Remove BG
      statusEl.textContent = '🎨 Удаление фона...';
      const res = await fetch(`${this.workerUrl}/api/studio/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ image_url: imageUrl, scene, prompt: '' })
      });
      
      if (!res.ok) {
        throw new Error(`Remove BG API error (${res.status}): ${await res.text()}`);
      }
      
      const data = await res.json();
      if (!data.ok || !data.job_id) {
        throw new Error(data.error || 'Не удалось запустить Remove BG');
      }
      
      statusEl.textContent = '⏳ Remove BG... (30–60 сек)';
      const transparentPngDataUrl = await this.pollStudioStatusSimple(data.job_id);
      
      // 2) Canvas на эталон (кадр стены или полная сцена)
      statusEl.textContent = '🖼️ Композиция на эталонном фоне...';
      let masterImageUrl = await this.composeWithBackground(
        transparentPngDataUrl, 
        this.studioReferenceBackgroundUrl,
        scene
      );
      console.log('[Studio Pro] Canvas master ready');
      
      // 3) AI-доводка: «сфотографировано в студии», не наклейка
      statusEl.textContent = '✨ AI-доводка (свет, тени, без ореола)...';
      try {
        masterImageUrl = await this.enhanceMasterWithAI(masterImageUrl, scene, statusEl);
        console.log('[Studio Pro] AI enhance done');
      } catch (enhanceErr) {
        console.warn('[Studio Pro] AI enhance failed, keep canvas master:', enhanceErr);
        this.toast('AI-доводка не удалась — оставлен canvas. Задеплойте Worker, если 404.', 'error');
      }
      
      // 4) Crops
      statusEl.textContent = '✂️ Кропы фото #2 и #3...';
      const { photo2, photo3 } = await this.createCropPhotos(masterImageUrl);

      // 5) Обязательно HTTPS в Cloudinary — иначе сохранение карточки падает (огромный dataURL → 500)
      statusEl.textContent = '☁️ Загрузка 3 фото в Cloudinary...';
      const urls = await this.ensurePhotosOnCloudinary([masterImageUrl, photo2, photo3]);
      
      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: urls[0], uploaded: true, type: 'master' },
        { id: Date.now() + '_crop2', url: urls[1], uploaded: true, type: 'crop' },
        { id: Date.now() + '_crop3', url: urls[2], uploaded: true, type: 'crop' }
      ];
      
      this.renderPhotos();
      statusEl.textContent = '✅ Готово! 3 фото созданы';
      this.toast('Studio Pro: 3 фото созданы', 'success');
      
    } catch (error) {
      console.error('[Studio Pro] ❌', error);
      statusEl.textContent = '❌ Ошибка: ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🎨 Запустить Studio Pro';
    }
  },

  /** Загрузить dataURL/blob URL в Cloudinary → https URL */
  async uploadDataUrlToCloudinary(dataUrl, filename = 'studio-master.webp') {
    const blobRes = await fetch(dataUrl);
    const blob = await blobRes.blob();
    const file = new File([blob], filename, { type: blob.type || 'image/webp' });
    const uploadResult = await this.uploadPhoto(file);
    if (!uploadResult.ok) {
      throw new Error(uploadResult.error || 'Cloudinary upload failed');
    }
    return uploadResult.url;
  },

  /** Любой url: если data:/blob: — в Cloudinary, иначе как есть */
  async ensureHttpsPhotoUrl(url, filename = 'photo.webp') {
    if (!url) throw new Error('Пустой URL фото');
    if (url.startsWith('https://') || url.startsWith('http://')) return url;
    return this.uploadDataUrlToCloudinary(url, filename);
  },

  async ensurePhotosOnCloudinary(urls) {
    const out = [];
    for (let i = 0; i < urls.length; i++) {
      out.push(await this.ensureHttpsPhotoUrl(urls[i], `studio-${i + 1}.webp`));
    }
    return out;
  },

  /** AI-доводка Master через Worker → nano-banana */
  async enhanceMasterWithAI(masterDataUrl, scene, statusEl) {
    statusEl.textContent = '☁️ Загрузка Master для AI...';
    const httpsUrl = await this.uploadDataUrlToCloudinary(masterDataUrl, 'studio-compose.webp');

    statusEl.textContent = '✨ AI делает «как снято в студии»...';
    const res = await fetch(`${this.workerUrl}/api/studio/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ image_url: httpsUrl, scene })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.job_id) {
      throw new Error(data.error || `Enhance HTTP ${res.status}`);
    }

    statusEl.textContent = '⏳ AI-доводка... (1–2 мин)';
    return await this.pollStudioStatusSimple(data.job_id);
  },
  
  
  // Canvas композиция: transparent PNG + reference background → 2048×2048 WebP
  // Алгоритм: harden alpha → bbox → crop → scale → compose
  async composeWithBackground(transparentPngDataUrl, backgroundUrl, scene) {
    return new Promise((resolve, reject) => {
      const MASTER_SIZE = this.MASTER_SIZE || 2048;
      
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
          console.log(`[Canvas] Master size: ${MASTER_SIZE}x${MASTER_SIZE}`);

          if (Math.min(productImg.width, productImg.height) < 600) {
            console.warn('[Canvas] ⚠️ Исходник после Remove BG меньше 600px — возможна мягкость после апскейла');
          }
          
          // ШАГ 1: Загружаем transparent PNG во временный canvas для сканирования alpha
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          tempCanvas.width = productImg.width;
          tempCanvas.height = productImg.height;
          tempCtx.drawImage(productImg, 0, 0);
          
          // ШАГ 2: Получаем imageData, harden soft-matte, сканируем alpha
          let imageData = tempCtx.getImageData(0, 0, productImg.width, productImg.height);
          
          console.log('[DIAGNOSTIC] 🔍 Alpha before harden...');
          const alphaBefore = this.analyzeAlphaChannel(imageData);
          console.log('  - percentageOpaque:', alphaBefore.percentageOpaque.toFixed(2) + '%');
          console.log('  - percentagePartial:', alphaBefore.percentagePartial.toFixed(2) + '%');

          this.hardenAlphaChannel(imageData);
          tempCtx.putImageData(imageData, 0, 0);

          const alphaStats = this.analyzeAlphaChannel(imageData);
          console.log('[DIAGNOSTIC] 🔍 Alpha after harden:');
          console.log('  - percentageOpaque:', alphaStats.percentageOpaque.toFixed(2) + '%');
          console.log('  - percentagePartial:', alphaStats.percentagePartial.toFixed(2) + '%');
          console.log('  - percentageTransparent:', alphaStats.percentageTransparent.toFixed(2) + '%');
          
          if (alphaStats.percentageTransparent < 1) {
            console.warn('[DIAGNOSTIC] ⚠️ WARNING: Less than 1% transparent pixels! Image may not have proper transparency.');
          }
          
          const boundingBox = this.getAlphaBoundingBox(imageData);
          console.log(`[Canvas] Alpha bounding box: x=${boundingBox.x} y=${boundingBox.y} width=${boundingBox.width} height=${boundingBox.height}`);
          
          // ШАГ 3: Обрезанный canvas с hardened объектом
          const croppedCanvas = document.createElement('canvas');
          const croppedCtx = croppedCanvas.getContext('2d');
          croppedCanvas.width = boundingBox.width;
          croppedCanvas.height = boundingBox.height;
          
          croppedCtx.drawImage(
            tempCanvas,
            boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
            0, 0, boundingBox.width, boundingBox.height
          );
          console.log(`[Canvas] Cropped product: ${boundingBox.width}x${boundingBox.height}`);
          
          // ШАГ 4: Позиционирование
          const positioning = this.getProductPositioning(
            scene, 
            boundingBox.width,
            boundingBox.height, 
            MASTER_SIZE
          );
          
          console.log(`[Canvas] Final product: ${Math.round(positioning.drawWidth)}x${Math.round(positioning.drawHeight)}`);
          console.log(`[Canvas] Position: x=${Math.round(positioning.drawX)} y=${Math.round(positioning.drawY)}`);
          if (positioning.config.useFloorAlignment) {
            console.log(`[Canvas] FloorY: ${Math.round(MASTER_SIZE * positioning.config.floorY)}`);
          }
          console.log('[Canvas] Scene config:', positioning.debug);
          
          // ШАГ 5: Финальный canvas
          const finalCanvas = document.createElement('canvas');
          const finalCtx = finalCanvas.getContext('2d');
          finalCanvas.width = MASTER_SIZE;
          finalCanvas.height = MASTER_SIZE;
          
          finalCtx.imageSmoothingEnabled = true;
          finalCtx.imageSmoothingQuality = 'high';

          // Эталон: для wall/bouquet — только стена (верх эталона), иначе полная сцена
          const wallOnly = this.isWallOnlyScene(scene);
          if (wallOnly) {
            const wallH = Math.round(bgImg.height * 0.58);
            console.log(`[Canvas] Wall-only BG crop: 0,0,${bgImg.width}x${wallH}`);
            finalCtx.drawImage(
              bgImg,
              0, 0, bgImg.width, wallH,
              0, 0, MASTER_SIZE, MASTER_SIZE
            );
          } else {
            finalCtx.drawImage(bgImg, 0, 0, MASTER_SIZE, MASTER_SIZE);
          }
          
          finalCtx.drawImage(
            croppedCanvas,
            positioning.drawX, 
            positioning.drawY, 
            positioning.drawWidth, 
            positioning.drawHeight
          );
          
          console.log('[Canvas] ====== КОМПОЗИЦИЯ ЗАВЕРШЕНА ======');
          
          resolve(finalCanvas.toDataURL('image/webp', this.WEBP_QUALITY || 0.92));
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
  
  // Умные кропы под сцену
  async createCropPhotos(masterImageDataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scene = this.currentProduct?.scene || 'floor';
          const w = img.width;
          const h = img.height;
          const wallOnly = this.isWallOnlyScene(scene);

          let photo2, photo3;
          if (wallOnly) {
            photo2 = this.cropSquareAt(img, w, h, { focusY: 0.42, scale: 0.55 });
            photo3 = this.cropSquareAt(img, w, h, { focusY: 0.55, scale: 0.70 });
          } else if (scene === 'photozone') {
            photo2 = this.cropSquareAt(img, w, h, { focusY: 0.40, scale: 0.55 });
            photo3 = this.cropSquareAt(img, w, h, { focusY: 0.58, scale: 0.72, alignBottom: true });
          } else {
            photo2 = this.cropSquareAt(img, w, h, { focusY: 0.38, scale: 0.52 });
            photo3 = this.cropSquareAt(img, w, h, { focusY: 0.62, scale: 0.72, alignBottom: true });
          }

          console.log('[Canvas] Smart crops done for scene:', scene);
          resolve({ photo2, photo3 });
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Не удалось загрузить Master Image'));
      img.src = masterImageDataUrl;
    });
  },

  /**
   * Квадратный crop вокруг focusY (0..1). alignBottom — прижать низ окна к низу кадра.
   */
  cropSquareAt(img, width, height, { focusY = 0.5, scale = 0.6, alignBottom = false } = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = Math.min(width, height) * scale;
    canvas.width = Math.round(size);
    canvas.height = Math.round(size);

    const sx = (width - size) / 2;
    let sy;
    if (alignBottom) {
      sy = height - size;
    } else {
      sy = focusY * height - size / 2;
      sy = Math.max(0, Math.min(sy, height - size));
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', this.WEBP_QUALITY || 0.92);
  },

  // Совместимость со старым API (если где-то ещё вызывается)
  cropImage(img, width, height, startYRatio = 0, heightRatio = 0.5) {
    const cropHeight = height * heightRatio;
    const size = Math.min(width, cropHeight);
    const focusY = startYRatio + (size / height) / 2;
    return this.cropSquareAt(img, width, height, {
      focusY,
      scale: size / Math.min(width, height),
      alignBottom: false
    });
  }
});

console.log('✓ Studio Pro (Remove BG + Canvas + AI enhance) loaded');
