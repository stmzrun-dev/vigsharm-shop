// VigSharm Admin - Studio Pro
// Remove BG → Canvas на эталон → AI-доводка (nano-banana) → Master → ручные рамки #2/#3 → Cloudinary

Object.assign(app, {
  MASTER_SIZE: 2048,
  WEBP_QUALITY: 1.0,
  DEFAULT_REFERENCE_BG: '../assets/reference/reference-background.png',

  studioMasterDataUrl: null,
  cropFrames: null,
  _cropDrag: null,

  isWallOnlyScene(scene) {
    return ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  },

  getReferenceBackgroundUrl() {
    return this.studioReferenceBackgroundUrl || this.DEFAULT_REFERENCE_BG;
  },

  // === НАСТРОЙКИ ПОЗИЦИОНИРОВАНИЯ (ближе к стене / плинтусу) ===
  getProductPositioning(scene, productWidth, productHeight, canvasSize) {
    const positioning = {
      floor: {
        targetWidth: 0.70,
        centerX: 0.5,
        floorY: 0.74,
        useFloorAlignment: true,
        maxHeight: 0.88,
        description: 'Напольная — у стены у плинтуса'
      },

      unit_balloon: {
        targetWidth: 0.55,
        centerX: 0.5,
        centerY: 0.50,
        useFloorAlignment: false,
        maxHeight: 0.80,
        description: 'Шар поштучно - только стена'
      },

      handheld_bouquet: {
        targetWidth: 0.58,
        centerX: 0.5,
        centerY: 0.46,
        useFloorAlignment: false,
        maxHeight: 0.74,
        description: 'Букет в руке - стена, место снизу под руку'
      },

      wall_only: {
        targetWidth: 0.66,
        centerX: 0.5,
        centerY: 0.48,
        useFloorAlignment: false,
        maxHeight: 0.82,
        description: 'Только стена'
      },

      photozone: {
        targetWidth: 0.82,
        centerX: 0.5,
        floorY: 0.76,
        useFloorAlignment: true,
        maxHeight: 0.90,
        description: 'Фотозона у стены'
      },

      auto: {
        targetWidth: 0.70,
        centerX: 0.5,
        floorY: 0.74,
        useFloorAlignment: true,
        maxHeight: 0.88,
        description: 'Авто = напольная у стены'
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

    let drawX, drawY;

    if (config.useFloorAlignment && config.floorY !== undefined) {
      drawX = (canvasSize * config.centerX) - (drawWidth / 2);
      drawY = (canvasSize * config.floorY) - drawHeight;
    } else {
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

  analyzeAlphaChannel(imageData) {
    const { data, width, height } = imageData;
    const totalPixels = width * height;
    let opaque = 0, partial = 0, transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      const a = data[i];
      if (a >= 250) opaque++;
      else if (a <= 5) transparent++;
      else partial++;
    }
    return {
      percentageOpaque: (opaque / totalPixels) * 100,
      percentagePartial: (partial / totalPixels) * 100,
      percentageTransparent: (transparent / totalPixels) * 100
    };
  },

  hardenAlphaChannel(imageData, { solidAt = 48, killBelow = 24 } = {}) {
    const { data } = imageData;
    for (let i = 3; i < data.length; i += 4) {
      const a = data[i];
      if (a >= solidAt) data[i] = 255;
      else if (a <= killBelow) {
        data[i] = 0;
        data[i - 3] = 0;
        data[i - 2] = 0;
        data[i - 1] = 0;
      }
    }
    return imageData;
  },

  getAlphaBoundingBox(imageData, threshold = 32) {
    const { data, width, height } = imageData;
    let minX = width, minY = height, maxX = 0, maxY = 0, foundPixel = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a > threshold) {
          foundPixel = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!foundPixel) return { x: 0, y: 0, width, height };

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
    this.hideCropEditor();

    try {
      const scene = this.currentProduct.scene || 'floor';
      const bgUrl = this.getReferenceBackgroundUrl();
      console.log('[Studio Pro] ====== START ======', { scene, bgUrl });

      if (!bgUrl) {
        throw new Error('Эталонный фон не найден');
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

      // 2) Canvas на эталон
      statusEl.textContent = '🖼️ Композиция на эталонном фоне...';
      let masterImageUrl = await this.composeWithBackground(
        transparentPngDataUrl,
        bgUrl,
        scene
      );
      console.log('[Studio Pro] Canvas master ready');

      // 3) AI-доводка
      statusEl.textContent = '✨ AI-доводка (свет, тени, без ореола)...';
      try {
        masterImageUrl = await this.enhanceMasterWithAI(masterImageUrl, scene, statusEl);
        console.log('[Studio Pro] AI enhance done');
      } catch (enhanceErr) {
        console.warn('[Studio Pro] AI enhance failed, keep canvas master:', enhanceErr);
        this.toast('AI-доводка не удалась — оставлен canvas. Задеплойте Worker, если 404.', 'error');
      }

      this.studioMasterDataUrl = masterImageUrl;
      this.resetCropFrames(false);
      this.showCropEditor(masterImageUrl);

      // Превью Master сразу (кропы #2/#3 — после «Применить»)
      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: masterImageUrl, uploaded: false, type: 'master' }
      ];
      this.renderPhotos();

      statusEl.textContent = '✅ Master готов — настройте рамки #2/#3 и нажмите «Применить кропы»';
      this.toast('Master готов — выберите рамки кропов', 'success');
      document.getElementById('crop-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
      console.error('[Studio Pro] ❌', error);
      statusEl.textContent = '❌ Ошибка: ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Обработать фото через Studio Pro';
    }
  },

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

          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          tempCanvas.width = productImg.width;
          tempCanvas.height = productImg.height;
          tempCtx.drawImage(productImg, 0, 0);

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
            console.warn('[DIAGNOSTIC] ⚠️ WARNING: Less than 1% transparent pixels!');
          }

          const boundingBox = this.getAlphaBoundingBox(imageData);
          console.log(`[Canvas] Alpha bounding box: x=${boundingBox.x} y=${boundingBox.y} width=${boundingBox.width} height=${boundingBox.height}`);

          const croppedCanvas = document.createElement('canvas');
          const croppedCtx = croppedCanvas.getContext('2d');
          croppedCanvas.width = boundingBox.width;
          croppedCanvas.height = boundingBox.height;

          croppedCtx.drawImage(
            tempCanvas,
            boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
            0, 0, boundingBox.width, boundingBox.height
          );

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

          const finalCanvas = document.createElement('canvas');
          const finalCtx = finalCanvas.getContext('2d');
          finalCanvas.width = MASTER_SIZE;
          finalCanvas.height = MASTER_SIZE;

          finalCtx.imageSmoothingEnabled = true;
          finalCtx.imageSmoothingQuality = 'high';

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
          resolve(finalCanvas.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0));
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

  // === Авто-параметры рамок (нормализованные 0..1) ===
  getDefaultCropFrames(scene) {
    const wallOnly = this.isWallOnlyScene(scene);
    if (wallOnly) {
      return {
        photo2: { x: 0.225, y: 0.18, size: 0.55 },
        photo3: { x: 0.15, y: 0.20, size: 0.70 }
      };
    }
    if (scene === 'photozone') {
      return {
        photo2: { x: 0.225, y: 0.12, size: 0.55 },
        photo3: { x: 0.14, y: 0.28, size: 0.72 }
      };
    }
    return {
      photo2: { x: 0.24, y: 0.12, size: 0.52 },
      photo3: { x: 0.14, y: 0.28, size: 0.72 }
    };
  },

  showCropEditor(masterUrl) {
    const editor = document.getElementById('crop-editor');
    const img = document.getElementById('crop-master-img');
    if (!editor || !img) return;

    editor.classList.remove('hidden');
    img.onload = () => {
      this.syncCropFrameDom();
      this.setupCropFrameInteractions();
    };
    img.src = masterUrl;
    if (img.complete) {
      this.syncCropFrameDom();
      this.setupCropFrameInteractions();
    }
  },

  hideCropEditor() {
    const editor = document.getElementById('crop-editor');
    if (editor) editor.classList.add('hidden');
    this.studioMasterDataUrl = null;
    this.cropFrames = null;
    this._cropDrag = null;
  },

  resetCropFrames(syncDom = true) {
    const scene = this.currentProduct?.scene || 'floor';
    this.cropFrames = this.getDefaultCropFrames(scene);
    if (syncDom) this.syncCropFrameDom();
    const status = document.getElementById('crop-status');
    if (status) status.textContent = 'Авто-рамки восстановлены';
  },

  syncCropFrameDom() {
    if (!this.cropFrames) return;
    ['2', '3'].forEach(n => {
      const el = document.getElementById(`crop-frame-${n}`);
      const f = this.cropFrames[`photo${n}`];
      if (!el || !f) return;
      el.style.left = (f.x * 100) + '%';
      el.style.top = (f.y * 100) + '%';
      el.style.width = (f.size * 100) + '%';
      el.style.height = (f.size * 100) + '%';
    });
  },

  setupCropFrameInteractions() {
    const stage = document.getElementById('crop-stage');
    if (!stage || stage.dataset.cropWired === '1') return;
    stage.dataset.cropWired = '1';

    const onMove = (clientX, clientY) => {
      if (!this._cropDrag || !this.cropFrames) return;
      const rect = stage.getBoundingClientRect();
      const dx = (clientX - this._cropDrag.startX) / rect.width;
      const dy = (clientY - this._cropDrag.startY) / rect.height;
      const key = `photo${this._cropDrag.frame}`;
      const start = this._cropDrag.startFrame;

      if (this._cropDrag.mode === 'move') {
        let x = start.x + dx;
        let y = start.y + dy;
        x = Math.max(0, Math.min(x, 1 - start.size));
        y = Math.max(0, Math.min(y, 1 - start.size));
        this.cropFrames[key] = { ...start, x, y };
      } else if (this._cropDrag.mode === 'resize') {
        const delta = Math.max(dx, dy);
        let size = Math.max(0.25, Math.min(1, start.size + delta));
        let x = start.x;
        let y = start.y;
        if (x + size > 1) size = 1 - x;
        if (y + size > 1) size = 1 - y;
        this.cropFrames[key] = { x, y, size };
      }
      this.syncCropFrameDom();
    };

    const endDrag = () => { this._cropDrag = null; };

    stage.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.crop-handle');
      const frameEl = e.target.closest('.crop-frame');
      if (!frameEl || !this.cropFrames) return;
      e.preventDefault();
      const frame = frameEl.dataset.frame;
      const key = `photo${frame}`;
      this._cropDrag = {
        frame,
        mode: handle ? 'resize' : 'move',
        startX: e.clientX,
        startY: e.clientY,
        startFrame: { ...this.cropFrames[key] }
      };
      frameEl.setPointerCapture?.(e.pointerId);
    });

    stage.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
  },

  /**
   * Вырезать квадрат по нормализованной рамке → WebP max quality, размер MASTER_SIZE
   */
  cropFromFrame(img, frame) {
    const MASTER_SIZE = this.MASTER_SIZE || 2048;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const size = Math.min(w, h) * frame.size;
    const sx = frame.x * w;
    const sy = frame.y * h;

    const canvas = document.createElement('canvas');
    canvas.width = MASTER_SIZE;
    canvas.height = MASTER_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, size, size, 0, 0, MASTER_SIZE, MASTER_SIZE);
    return canvas.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
  },

  async applyCropFrames() {
    if (!this.studioMasterDataUrl || !this.cropFrames) {
      this.toast('Сначала запустите Studio Pro', 'error');
      return;
    }

    const btn = document.getElementById('apply-crops-btn');
    const statusEl = document.getElementById('crop-status');
    const studioStatus = document.getElementById('studio-status');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = '✂️ Экспорт кропов...';

    try {
      const img = await this.loadImage(this.studioMasterDataUrl);
      const photo2 = this.cropFromFrame(img, this.cropFrames.photo2);
      const photo3 = this.cropFromFrame(img, this.cropFrames.photo3);

      if (statusEl) statusEl.textContent = '☁️ Загрузка 3 фото в Cloudinary...';
      if (studioStatus) studioStatus.textContent = '☁️ Загрузка 3 фото в Cloudinary...';

      const urls = await this.ensurePhotosOnCloudinary([
        this.studioMasterDataUrl,
        photo2,
        photo3
      ]);

      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: urls[0], uploaded: true, type: 'master' },
        { id: Date.now() + '_crop2', url: urls[1], uploaded: true, type: 'crop' },
        { id: Date.now() + '_crop3', url: urls[2], uploaded: true, type: 'crop' }
      ];

      this.renderPhotos();
      if (statusEl) statusEl.textContent = '✅ Кропы применены';
      if (studioStatus) studioStatus.textContent = '✅ Готово! 3 фото созданы';
      this.toast('Studio Pro: 3 фото созданы', 'success');
    } catch (error) {
      console.error('[Crops]', error);
      if (statusEl) statusEl.textContent = '❌ ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
      img.src = src;
    });
  },

  // Совместимость: старый автокроп (если где-то ещё вызывается)
  async createCropPhotos(masterImageDataUrl) {
    const img = await this.loadImage(masterImageDataUrl);
    const frames = this.cropFrames || this.getDefaultCropFrames(this.currentProduct?.scene || 'floor');
    return {
      photo2: this.cropFromFrame(img, frames.photo2),
      photo3: this.cropFromFrame(img, frames.photo3)
    };
  },

  cropSquareAt(img, width, height, { focusY = 0.5, scale = 0.6, alignBottom = false } = {}) {
    const sizeNorm = scale;
    let x = (1 - sizeNorm) / 2;
    let y;
    if (alignBottom) y = 1 - sizeNorm;
    else y = Math.max(0, Math.min(focusY - sizeNorm / 2, 1 - sizeNorm));
    return this.cropFromFrame(img, { x, y, size: sizeNorm });
  },

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

console.log('✓ Studio Pro (Remove BG + Canvas + AI enhance + manual crops) loaded');
