// VigSharm Admin - Studio Pro
// Remove BG → ручная постановка на эталон → AI «пересъёмка» (свет/тень) → Master → live-кропы #2/#3 → Cloudinary

Object.assign(app, {
  MASTER_SIZE: 2048,
  WEBP_QUALITY: 1.0,
  DEFAULT_REFERENCE_BG: '../assets/reference/reference-background.png',

  studioMasterDataUrl: null,
  studioCutoutDataUrl: null,
  studioPlacement: null,
  studioPlacementAspect: 1,
  cropFrames: null,
  _cropDrag: null,
  _placementDrag: null,
  _cropPreviewRaf: null,
  _cropPreviewSrc: null,

  isWallOnlyScene(scene) {
    return ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  },

  getReferenceBackgroundUrl() {
    return this.studioReferenceBackgroundUrl || this.DEFAULT_REFERENCE_BG;
  },

  // === НАСТРОЙКИ ПОЗИЦИОНИРОВАНИЯ (стартовые для ручной постановки) ===
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
    let drawWidth = canvasSize * config.targetWidth;
    let drawHeight = drawWidth / aspectRatio;

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

  /** Harden alpha + crop to opaque bbox → PNG data URL */
  async prepareCutoutFromPng(transparentPngDataUrl) {
    const productImg = await this.loadImage(transparentPngDataUrl);
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = productImg.width;
    tempCanvas.height = productImg.height;
    tempCtx.drawImage(productImg, 0, 0);

    let imageData = tempCtx.getImageData(0, 0, productImg.width, productImg.height);
    this.hardenAlphaChannel(imageData);
    tempCtx.putImageData(imageData, 0, 0);

    const boundingBox = this.getAlphaBoundingBox(imageData);
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = boundingBox.width;
    croppedCanvas.height = boundingBox.height;
    croppedCanvas.getContext('2d').drawImage(
      tempCanvas,
      boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
      0, 0, boundingBox.width, boundingBox.height
    );

    return {
      dataUrl: croppedCanvas.toDataURL('image/png'),
      width: boundingBox.width,
      height: boundingBox.height
    };
  },

  async getDisplayBackgroundUrl(scene) {
    const bgUrl = this.getReferenceBackgroundUrl();
    if (!this.isWallOnlyScene(scene)) return bgUrl;

    const bgImg = await this.loadImage(bgUrl);
    const wallH = Math.round(bgImg.height * 0.58);
    const c = document.createElement('canvas');
    c.width = bgImg.width;
    c.height = wallH;
    c.getContext('2d').drawImage(bgImg, 0, 0, bgImg.width, wallH, 0, 0, bgImg.width, wallH);
    return c.toDataURL('image/png');
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
    this.hidePlacementEditor();

    try {
      const scene = this.currentProduct.scene || 'floor';
      const bgUrl = this.getReferenceBackgroundUrl();
      console.log('[Studio Pro] ====== START ======', { scene, bgUrl });

      if (!bgUrl) throw new Error('Эталонный фон не найден');

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

      // 0) Restore phone photo (fail-soft)
      try {
        statusEl.textContent = '🔦 Улучшение исходника (свет, шум, резкость)...';
        imageUrl = await this.restoreSourcePhoto(imageUrl, statusEl);
        console.log('[Studio Pro] Restore OK');
      } catch (restoreErr) {
        console.warn('[Studio Pro] Restore skipped:', restoreErr);
        statusEl.textContent = '⚠️ Restore пропущен — продолжаем с исходником';
      }

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

      statusEl.textContent = '✂️ Подготовка cutout...';
      const cutout = await this.prepareCutoutFromPng(transparentPngDataUrl);
      this.studioCutoutDataUrl = cutout.dataUrl;
      this.studioPlacementAspect = cutout.width / cutout.height;

      const MASTER_SIZE = this.MASTER_SIZE || 2048;
      const pos = this.getProductPositioning(scene, cutout.width, cutout.height, MASTER_SIZE);
      this.studioPlacement = {
        x: pos.drawX / MASTER_SIZE,
        y: pos.drawY / MASTER_SIZE,
        w: pos.drawWidth / MASTER_SIZE,
        h: pos.drawHeight / MASTER_SIZE
      };

      await this.showPlacementEditor(scene);
      statusEl.textContent = '📐 Расставьте товар на эталоне → «Готово → AI-доводка»';
      this.toast('Cutout готов — поставьте на эталон', 'success');
      document.getElementById('placement-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      console.error('[Studio Pro] ❌', error);
      statusEl.textContent = '❌ Ошибка: ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Подготовить фото Studio Pro';
    }
  },

  async confirmPlacementAndEnhance() {
    if (!this.studioCutoutDataUrl || !this.studioPlacement) {
      this.toast('Сначала запустите Studio Pro', 'error');
      return;
    }

    const btn = document.getElementById('confirm-placement-btn');
    const statusEl = document.getElementById('studio-status');
    const placeStatus = document.getElementById('placement-status');
    if (btn) btn.disabled = true;

    try {
      const scene = this.currentProduct.scene || 'floor';
      const bgUrl = this.getReferenceBackgroundUrl();

      if (statusEl) statusEl.textContent = '🖼️ Композиция на эталоне...';
      if (placeStatus) placeStatus.textContent = 'Композиция...';

      let masterImageUrl = await this.composeWithBackground(
        this.studioCutoutDataUrl,
        bgUrl,
        scene,
        this.studioPlacement,
        { alreadyCropped: true }
      );

      if (statusEl) statusEl.textContent = '✨ AI «переснимает» свет и тени...';
      try {
        masterImageUrl = await this.enhanceMasterWithAI(masterImageUrl, scene, statusEl);
      } catch (enhanceErr) {
        console.warn('[Studio Pro] AI enhance failed, keep canvas master:', enhanceErr);
        this.toast('AI-доводка не удалась — оставлен canvas. Задеплойте Worker, если 404.', 'error');
      }

      this.studioMasterDataUrl = masterImageUrl;
      this.hidePlacementEditor(false);
      this.resetCropFrames(false);
      this.showCropEditor(masterImageUrl);

      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: masterImageUrl, uploaded: false, type: 'master' }
      ];
      this.renderPhotos();

      if (statusEl) statusEl.textContent = '✅ Master готов — настройте рамки #2/#3';
      if (placeStatus) placeStatus.textContent = '';
      this.toast('Master готов — выберите рамки кропов', 'success');
      document.getElementById('crop-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      console.error('[Studio Pro] placement→enhance', error);
      if (statusEl) statusEl.textContent = '❌ ' + error.message;
      if (placeStatus) placeStatus.textContent = '❌ ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // === Placement editor ===
  async showPlacementEditor(scene) {
    const editor = document.getElementById('placement-editor');
    const bgEl = document.getElementById('placement-bg');
    const cutEl = document.getElementById('placement-cutout');
    const scaleEl = document.getElementById('placement-scale');
    if (!editor || !bgEl || !cutEl) return;

    const displayBg = await this.getDisplayBackgroundUrl(scene);
    bgEl.src = displayBg;
    cutEl.src = this.studioCutoutDataUrl;

    editor.classList.remove('hidden');
    this.syncPlacementDom();
    this.setupPlacementInteractions();

    if (scaleEl && this.studioPlacement) {
      scaleEl.value = Math.round(this.studioPlacement.w * 100);
    }
  },

  hidePlacementEditor(clearCutout = true) {
    const editor = document.getElementById('placement-editor');
    if (editor) editor.classList.add('hidden');
    this._placementDrag = null;
    if (clearCutout) {
      this.studioCutoutDataUrl = null;
      this.studioPlacement = null;
    }
  },

  syncPlacementDom() {
    const cutEl = document.getElementById('placement-cutout');
    const p = this.studioPlacement;
    if (!cutEl || !p) return;
    cutEl.style.left = (p.x * 100) + '%';
    cutEl.style.top = (p.y * 100) + '%';
    cutEl.style.width = (p.w * 100) + '%';
    cutEl.style.height = (p.h * 100) + '%';
  },

  resetPlacement() {
    if (!this.studioCutoutDataUrl || !this.studioPlacementAspect) return;
    const scene = this.currentProduct?.scene || 'floor';
    const MASTER_SIZE = this.MASTER_SIZE || 2048;
    const fakeW = 1000;
    const fakeH = fakeW / this.studioPlacementAspect;
    const pos = this.getProductPositioning(scene, fakeW, fakeH, MASTER_SIZE);
    this.studioPlacement = {
      x: pos.drawX / MASTER_SIZE,
      y: pos.drawY / MASTER_SIZE,
      w: pos.drawWidth / MASTER_SIZE,
      h: pos.drawHeight / MASTER_SIZE
    };
    this.syncPlacementDom();
    const scaleEl = document.getElementById('placement-scale');
    if (scaleEl) scaleEl.value = Math.round(this.studioPlacement.w * 100);
    const status = document.getElementById('placement-status');
    if (status) status.textContent = 'Стартовая позиция восстановлена';
  },

  onPlacementScaleInput(value) {
    if (!this.studioPlacement || !this.studioPlacementAspect) return;
    let w = Math.max(0.25, Math.min(0.95, Number(value) / 100));
    let h = w / this.studioPlacementAspect;
    if (h > 0.95) {
      h = 0.95;
      w = h * this.studioPlacementAspect;
    }
    const cx = this.studioPlacement.x + this.studioPlacement.w / 2;
    const cy = this.studioPlacement.y + this.studioPlacement.h / 2;
    let x = cx - w / 2;
    let y = cy - h / 2;
    x = Math.max(0, Math.min(x, 1 - w));
    y = Math.max(0, Math.min(y, 1 - h));
    this.studioPlacement = { x, y, w, h };
    this.syncPlacementDom();
  },

  setupPlacementInteractions() {
    const stage = document.getElementById('placement-stage');
    const cutEl = document.getElementById('placement-cutout');
    if (!stage || !cutEl || stage.dataset.placeWired === '1') return;
    stage.dataset.placeWired = '1';

    const onMove = (clientX, clientY) => {
      if (!this._placementDrag || !this.studioPlacement) return;
      const rect = stage.getBoundingClientRect();
      const dx = (clientX - this._placementDrag.startX) / rect.width;
      const dy = (clientY - this._placementDrag.startY) / rect.height;
      const start = this._placementDrag.start;
      let x = start.x + dx;
      let y = start.y + dy;
      x = Math.max(0, Math.min(x, 1 - start.w));
      y = Math.max(0, Math.min(y, 1 - start.h));
      this.studioPlacement = { ...start, x, y };
      this.syncPlacementDom();
    };

    const endDrag = () => { this._placementDrag = null; };

    cutEl.addEventListener('pointerdown', (e) => {
      if (!this.studioPlacement) return;
      e.preventDefault();
      this._placementDrag = {
        startX: e.clientX,
        startY: e.clientY,
        start: { ...this.studioPlacement }
      };
      cutEl.setPointerCapture?.(e.pointerId);
    });

    stage.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
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

  async restoreSourcePhoto(imageUrl, statusEl) {
    const res = await fetch(`${this.workerUrl}/api/studio/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ image_url: imageUrl, resolution: '2K' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.job_id) {
      throw new Error(data.error || `Restore HTTP ${res.status}`);
    }
    if (statusEl) statusEl.textContent = '⏳ Restore исходника... (1–2 мин)';
    return await this.pollStudioStatusSimple(data.job_id);
  },

  async upscaleCropPhoto(imageUrl, statusEl, label = 'кроп') {
    const res = await fetch(`${this.workerUrl}/api/studio/upscale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ image_url: imageUrl, resolution: '2K' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.job_id) {
      throw new Error(data.error || `Upscale HTTP ${res.status}`);
    }
    if (statusEl) statusEl.textContent = `⏳ AI-upscale ${label}...`;
    return await this.pollStudioStatusSimple(data.job_id);
  },

  async enhanceMasterWithAI(masterDataUrl, scene, statusEl) {
    statusEl.textContent = '☁️ Загрузка Master для AI...';
    const httpsUrl = await this.uploadDataUrlToCloudinary(masterDataUrl, 'studio-compose.webp');

    statusEl.textContent = '✨ AI переснимает в комнате (2K)...';
    const res = await fetch(`${this.workerUrl}/api/studio/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ image_url: httpsUrl, scene, resolution: '2K' })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.job_id) {
      throw new Error(data.error || `Enhance HTTP ${res.status}`);
    }

    statusEl.textContent = '⏳ AI-доводка 2K... (1–2 мин)';
    return await this.pollStudioStatusSimple(data.job_id);
  },

  /**
   * @param placement normalized {x,y,w,h} optional — if set, used instead of auto floorY
   * @param opts.alreadyCropped if true, skip harden+bbox (cutout already prepared)
   */
  async composeWithBackground(transparentPngDataUrl, backgroundUrl, scene, placement = null, opts = {}) {
    const MASTER_SIZE = this.MASTER_SIZE || 2048;
    const bgImg = await this.loadImage(backgroundUrl);
    const productImg = await this.loadImage(transparentPngDataUrl);

    let croppedCanvas;
    let boxW, boxH;

    if (opts.alreadyCropped) {
      croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = productImg.width;
      croppedCanvas.height = productImg.height;
      croppedCanvas.getContext('2d').drawImage(productImg, 0, 0);
      boxW = productImg.width;
      boxH = productImg.height;
    } else {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = productImg.width;
      tempCanvas.height = productImg.height;
      tempCtx.drawImage(productImg, 0, 0);
      let imageData = tempCtx.getImageData(0, 0, productImg.width, productImg.height);
      this.hardenAlphaChannel(imageData);
      tempCtx.putImageData(imageData, 0, 0);
      const boundingBox = this.getAlphaBoundingBox(imageData);
      croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = boundingBox.width;
      croppedCanvas.height = boundingBox.height;
      croppedCanvas.getContext('2d').drawImage(
        tempCanvas,
        boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
        0, 0, boundingBox.width, boundingBox.height
      );
      boxW = boundingBox.width;
      boxH = boundingBox.height;
    }

    let drawX, drawY, drawWidth, drawHeight;
    if (placement) {
      drawX = placement.x * MASTER_SIZE;
      drawY = placement.y * MASTER_SIZE;
      drawWidth = placement.w * MASTER_SIZE;
      drawHeight = placement.h * MASTER_SIZE;
    } else {
      const positioning = this.getProductPositioning(scene, boxW, boxH, MASTER_SIZE);
      drawX = positioning.drawX;
      drawY = positioning.drawY;
      drawWidth = positioning.drawWidth;
      drawHeight = positioning.drawHeight;
    }

    console.log('[Canvas] placement', { drawX, drawY, drawWidth, drawHeight, manual: !!placement });

    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');
    finalCanvas.width = MASTER_SIZE;
    finalCanvas.height = MASTER_SIZE;
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';

    if (this.isWallOnlyScene(scene)) {
      const wallH = Math.round(bgImg.height * 0.58);
      finalCtx.drawImage(bgImg, 0, 0, bgImg.width, wallH, 0, 0, MASTER_SIZE, MASTER_SIZE);
    } else {
      finalCtx.drawImage(bgImg, 0, 0, MASTER_SIZE, MASTER_SIZE);
    }

    finalCtx.drawImage(croppedCanvas, drawX, drawY, drawWidth, drawHeight);
    return finalCanvas.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
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

  // === Crop frames + live preview ===
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
    this._cropPreviewSrc = null;
    this._cropPreviewImg = null;

    const onReady = () => {
      this.syncCropFrameDom();
      this.setupCropFrameInteractions();
      this.scheduleCropPreviews();
    };

    img.onload = onReady;
    img.src = masterUrl;
    if (img.complete && img.naturalWidth) onReady();
  },

  hideCropEditor(clearMaster = true) {
    const editor = document.getElementById('crop-editor');
    if (editor) editor.classList.add('hidden');
    if (clearMaster) this.studioMasterDataUrl = null;
    this.cropFrames = null;
    this._cropDrag = null;
    this._cropPreviewImg = null;
    this._cropPreviewSrc = null;
    if (this._cropPreviewRaf) {
      cancelAnimationFrame(this._cropPreviewRaf);
      this._cropPreviewRaf = null;
    }
  },

  resetCropFrames(syncDom = true) {
    const scene = this.currentProduct?.scene || 'floor';
    this.cropFrames = this.getDefaultCropFrames(scene);
    if (syncDom) {
      this.syncCropFrameDom();
      this.scheduleCropPreviews();
    }
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

  scheduleCropPreviews() {
    if (this._cropPreviewRaf) cancelAnimationFrame(this._cropPreviewRaf);
    this._cropPreviewRaf = requestAnimationFrame(() => {
      this._cropPreviewRaf = null;
      this.updateCropPreviews();
    });
  },

  async updateCropPreviews() {
    if (!this.cropFrames || !this.studioMasterDataUrl) return;
    const c2 = document.getElementById('crop-preview-2');
    const c3 = document.getElementById('crop-preview-3');
    if (!c2 || !c3) return;

    try {
      if (!this._cropPreviewImg || this._cropPreviewSrc !== this.studioMasterDataUrl) {
        this._cropPreviewImg = await this.loadImage(this.studioMasterDataUrl);
        this._cropPreviewSrc = this.studioMasterDataUrl;
      }
      const img = this._cropPreviewImg;
      this.drawCropPreview(c2, img, this.cropFrames.photo2);
      this.drawCropPreview(c3, img, this.cropFrames.photo3);
    } catch (e) {
      console.warn('[Crop preview]', e);
    }
  },

  drawCropPreview(canvas, img, frame) {
    const size = 160;
    canvas.width = size;
    canvas.height = size;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const cropSize = Math.min(w, h) * frame.size;
    const sx = frame.x * w;
    const sy = frame.y * h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
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
      this.scheduleCropPreviews();
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

  /** Экспорт кропа 1:1 из Master — без апскейла canvas. AI-upscale — отдельно. */
  cropFromFrame(img, frame) {
    const MAX_SIZE = this.MASTER_SIZE || 2048;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const cropPx = Math.round(Math.min(w, h) * frame.size);
    const sx = frame.x * w;
    const sy = frame.y * h;
    const outSize = Math.min(cropPx, MAX_SIZE);

    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = outSize < cropPx;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, cropPx, cropPx, 0, 0, outSize, outSize);
    return {
      dataUrl: canvas.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0),
      size: outSize
    };
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
      let crop2 = this.cropFromFrame(img, this.cropFrames.photo2);
      let crop3 = this.cropFromFrame(img, this.cropFrames.photo3);

      const UPSCALE_BELOW = 1600;
      let photo2Url = crop2.dataUrl;
      let photo3Url = crop3.dataUrl;

      if (crop2.size < UPSCALE_BELOW || crop3.size < UPSCALE_BELOW) {
        if (statusEl) statusEl.textContent = '☁️ Загрузка кропов для AI-upscale...';
        const uploaded = await this.ensurePhotosOnCloudinary([photo2Url, photo3Url]);
        photo2Url = uploaded[0];
        photo3Url = uploaded[1];

        if (crop2.size < UPSCALE_BELOW) {
          try {
            if (statusEl) statusEl.textContent = '✨ AI-upscale кропа #2 → 2K...';
            photo2Url = await this.upscaleCropPhoto(photo2Url, statusEl, '#2');
          } catch (e) {
            console.warn('[Crops] upscale #2 skipped', e);
          }
        }
        if (crop3.size < UPSCALE_BELOW) {
          try {
            if (statusEl) statusEl.textContent = '✨ AI-upscale кропа #3 → 2K...';
            photo3Url = await this.upscaleCropPhoto(photo3Url, statusEl, '#3');
          } catch (e) {
            console.warn('[Crops] upscale #3 skipped', e);
          }
        }
      }

      if (statusEl) statusEl.textContent = '☁️ Загрузка 3 фото в Cloudinary...';
      if (studioStatus) studioStatus.textContent = '☁️ Загрузка 3 фото в Cloudinary...';

      const urls = await this.ensurePhotosOnCloudinary([
        this.studioMasterDataUrl,
        photo2Url,
        photo3Url
      ]);

      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: urls[0], uploaded: true, type: 'master' },
        { id: Date.now() + '_crop2', url: urls[1], uploaded: true, type: 'crop' },
        { id: Date.now() + '_crop3', url: urls[2], uploaded: true, type: 'crop' }
      ];

      this.renderPhotos();
      this.hideCropEditor(false);
      if (statusEl) statusEl.textContent = '✅ Кропы готовы (натив + AI-upscale при необходимости)';
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

  async createCropPhotos(masterImageDataUrl) {
    const img = await this.loadImage(masterImageDataUrl);
    const frames = this.cropFrames || this.getDefaultCropFrames(this.currentProduct?.scene || 'floor');
    return {
      photo2: this.cropFromFrame(img, frames.photo2).dataUrl,
      photo3: this.cropFromFrame(img, frames.photo3).dataUrl
    };
  },

  cropSquareAt(img, width, height, { focusY = 0.5, scale = 0.6, alignBottom = false } = {}) {
    const sizeNorm = scale;
    let x = (1 - sizeNorm) / 2;
    let y;
    if (alignBottom) y = 1 - sizeNorm;
    else y = Math.max(0, Math.min(focusY - sizeNorm / 2, 1 - sizeNorm));
    return this.cropFromFrame(img, { x, y, size: sizeNorm }).dataUrl;
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

console.log('✓ Studio Pro (manual placement + live crops + AI enhance) loaded');
