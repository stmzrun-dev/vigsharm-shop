// VigSharm Admin - Studio Pro
// Remove BG → ручная постановка на эталон → AI «пересъёмка» (свет/тень) → Master → live-кропы #2/#3 → Cloudinary

Object.assign(app, {
  MASTER_SIZE: 2048,
  WEBP_QUALITY: 1.0,
  DEFAULT_REFERENCE_BG: '../assets/reference/reference-background.png',
  STUDIO_CHECKPOINT_DB: 'vigsharm_studio_pro',
  STUDIO_CHECKPOINT_STORE: 'checkpoints',

  studioMasterDataUrl: null,
  studioCutoutDataUrl: null,
  studioPlacement: null,
  studioPlacementAspect: 1,
  studioCanvasMasterDataUrl: null,
  studioCompare: { original: null, canvas: null, ai: null },
  studioAiEnhanceEnabled: true,
  _studioDraftKey: null,
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
        targetWidth: 0.50,
        centerX: 0.5,
        centerY: 0.50,
        useFloorAlignment: false,
        maxHeight: 0.75,
        description: 'Шар поштучно - только стена'
      },
      handheld_bouquet: {
        targetWidth: 0.52,
        centerX: 0.5,
        centerY: 0.46,
        useFloorAlignment: false,
        maxHeight: 0.70,
        description: 'Букет в руке - стена, место снизу под руку'
      },
      wall_only: {
        targetWidth: 0.58,
        centerX: 0.5,
        centerY: 0.48,
        useFloorAlignment: false,
        maxHeight: 0.76,
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

  hardenAlphaChannel(imageData, { solidAt = 72, killBelow = 12 } = {}) {
    // Softer than before: keep partial alpha for ribbons/chrome edges (was 48/24 → cut spheres flat)
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

  getAlphaBoundingBox(imageData, threshold = 16) {
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

    // Padding so sphere edges / ribbons aren't flush-cropped (straight-cut artifact)
    const pad = Math.max(4, Math.round(Math.min(width, height) * 0.02));
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  },

  /** Soft alpha + padded bbox → PNG (preserve chrome edges & ribbons) */
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

  /** Keep product inset from canvas edges — prevents flat clipped sphere edges */
  clampPlacementInset(placement, inset = 0.06) {
    if (!placement) return placement;
    let { x, y, w, h } = placement;
    w = Math.min(w, 1 - inset * 2);
    h = Math.min(h, 1 - inset * 2);
    x = Math.max(inset, Math.min(x, 1 - inset - w));
    y = Math.max(inset, Math.min(y, 1 - inset - h));
    return { x, y, w, h };
  },

  /** Canvas contact shadow (no AI) — safe for text/chrome/ribbons */
  drawSoftContactShadow(ctx, sourceCanvas, drawX, drawY, drawWidth, drawHeight, { wall = false } = {}) {
    ctx.save();
    ctx.globalAlpha = wall ? 0.22 : 0.28;
    if (wall) {
      ctx.shadowColor = 'rgba(40,35,30,0.45)';
      ctx.shadowBlur = Math.max(12, drawWidth * 0.04);
      ctx.shadowOffsetX = drawWidth * 0.012;
      ctx.shadowOffsetY = drawHeight * 0.01;
    } else {
      ctx.shadowColor = 'rgba(30,25,20,0.55)';
      ctx.shadowBlur = Math.max(18, drawWidth * 0.05);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(6, drawHeight * 0.015);
    }
    ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  },

  needsGentleEnhance(scene) {
    return this.isWallOnlyScene(scene);
  },

  /** Wall always off; floor/photozone follow toggle */
  shouldSkipAiEnhance(scene) {
    if (this.isWallOnlyScene(scene)) return true;
    return !this.isStudioAiEnhanceEnabled();
  },

  isStudioAiEnhanceEnabled() {
    const el = document.getElementById('studio-ai-enhance');
    if (el) return !!el.checked;
    return this.studioAiEnhanceEnabled !== false;
  },

  onStudioAiToggle() {
    const el = document.getElementById('studio-ai-enhance');
    if (this.isWallOnlyScene(this.currentProduct?.scene || 'floor')) {
      this.syncStudioAiToggleUi();
      return;
    }
    this.studioAiEnhanceEnabled = el ? !!el.checked : true;
  },

  syncStudioAiToggleUi() {
    const scene = this.currentProduct?.scene || 'floor';
    const wrap = document.getElementById('studio-ai-toggle-wrap');
    const el = document.getElementById('studio-ai-enhance');
    const wall = this.isWallOnlyScene(scene);
    if (wrap) {
      wrap.classList.toggle('hidden', wall);
      wrap.classList.toggle('is-disabled', wall);
    }
    if (el) {
      el.disabled = wall;
      // Wall forces UI off without changing saved preference
      el.checked = wall ? false : (this.studioAiEnhanceEnabled !== false);
    }
  },

  getStudioProductKey() {
    if (this.currentProduct?.id) return 'id:' + this.currentProduct.id;
    if (!this._studioDraftKey) this._studioDraftKey = 'draft:' + Date.now();
    return this._studioDraftKey;
  },

  resetStudioDraftKey() {
    this._studioDraftKey = null;
  },

  openStudioCheckpointDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.STUDIO_CHECKPOINT_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STUDIO_CHECKPOINT_STORE)) {
          db.createObjectStore(this.STUDIO_CHECKPOINT_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  },

  async saveStudioCheckpoint(extra = {}) {
    if (!this.studioCutoutDataUrl) return null;
    const record = {
      key: this.getStudioProductKey(),
      productId: this.currentProduct?.id || null,
      scene: this.currentProduct?.scene || 'floor',
      cutoutDataUrl: this.studioCutoutDataUrl,
      aspect: this.studioPlacementAspect,
      placement: this.studioPlacement ? { ...this.studioPlacement } : null,
      originalUrl: this.studioCompare?.original || this.currentProduct?.photos?.[0]?.url || null,
      ts: Date.now(),
      ...extra
    };
    try {
      const db = await this.openStudioCheckpointDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STUDIO_CHECKPOINT_STORE, 'readwrite');
        tx.objectStore(this.STUDIO_CHECKPOINT_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      await this.refreshStudioCheckpointUi();
      return record;
    } catch (err) {
      console.warn('[Studio Pro] checkpoint save failed:', err);
      this.toast('Cutout в памяти, но checkpoint не сохранился', 'error');
      return null;
    }
  },

  async loadStudioCheckpoint(key = null) {
    const k = key || this.getStudioProductKey();
    try {
      const db = await this.openStudioCheckpointDb();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STUDIO_CHECKPOINT_STORE, 'readonly');
        const req = tx.objectStore(this.STUDIO_CHECKPOINT_STORE).get(k);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return record;
    } catch (err) {
      console.warn('[Studio Pro] checkpoint load failed:', err);
      return null;
    }
  },

  async clearStudioCheckpoint() {
    const k = this.getStudioProductKey();
    try {
      const db = await this.openStudioCheckpointDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STUDIO_CHECKPOINT_STORE, 'readwrite');
        tx.objectStore(this.STUDIO_CHECKPOINT_STORE).delete(k);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (err) {
      console.warn('[Studio Pro] checkpoint clear failed:', err);
    }
    this.studioCutoutDataUrl = null;
    this.studioPlacement = null;
    this.studioPlacementAspect = 1;
    this.studioCanvasMasterDataUrl = null;
    this.studioMasterDataUrl = null;
    this.studioCompare = { original: null, canvas: null, ai: null };
    this.hidePlacementEditor(true);
    this.hideCropEditor?.();
    this.renderStudioCompare();
    await this.refreshStudioCheckpointUi();
    const statusEl = document.getElementById('studio-status');
    if (statusEl) statusEl.textContent = 'Cutout сброшен — запустите Studio Pro заново';
    this.toast('Checkpoint cutout очищен', 'info');
  },

  async refreshStudioCheckpointUi() {
    const contBtn = document.getElementById('studio-continue-btn');
    const clearBtn = document.getElementById('studio-clear-checkpoint-btn');
    const hasMemory = !!this.studioCutoutDataUrl;
    let hasStored = false;
    try {
      const cp = await this.loadStudioCheckpoint();
      hasStored = !!(cp && cp.cutoutDataUrl);
    } catch (_) { /* ignore */ }
    const show = hasMemory || hasStored;
    contBtn?.classList.toggle('hidden', !show);
    clearBtn?.classList.toggle('hidden', !show);
  },

  async continueFromStudioCheckpoint() {
    const statusEl = document.getElementById('studio-status');
    try {
      let cutout = this.studioCutoutDataUrl;
      let aspect = this.studioPlacementAspect;
      let placement = this.studioPlacement;
      let originalUrl = this.studioCompare?.original;

      if (!cutout) {
        const cp = await this.loadStudioCheckpoint();
        if (!cp?.cutoutDataUrl) {
          this.toast('Нет сохранённого cutout', 'error');
          return;
        }
        cutout = cp.cutoutDataUrl;
        aspect = cp.aspect || 1;
        placement = cp.placement || null;
        originalUrl = cp.originalUrl || originalUrl;
        if (cp.scene && this.currentProduct) {
          this.currentProduct.scene = cp.scene;
          const sceneSelect = document.getElementById('scene-select');
          if (sceneSelect) sceneSelect.value = cp.scene;
        }
      }

      this.studioCutoutDataUrl = cutout;
      this.studioPlacementAspect = aspect || 1;
      this.studioCompare = {
        original: originalUrl || this.currentProduct?.photos?.[0]?.url || null,
        canvas: null,
        ai: null
      };

      const scene = this.currentProduct?.scene || 'floor';
      if (!placement) {
        const MASTER_SIZE = this.MASTER_SIZE || 2048;
        const fakeW = 1000;
        const fakeH = fakeW / this.studioPlacementAspect;
        const pos = this.getProductPositioning(scene, fakeW, fakeH, MASTER_SIZE);
        placement = this.clampPlacementInset({
          x: pos.drawX / MASTER_SIZE,
          y: pos.drawY / MASTER_SIZE,
          w: pos.drawWidth / MASTER_SIZE,
          h: pos.drawHeight / MASTER_SIZE
        });
      }
      this.studioPlacement = placement;

      this.syncStudioAiToggleUi();
      await this.showPlacementEditor(scene);
      if (statusEl) statusEl.textContent = '↩ Cutout из checkpoint — расставьте и «Готово → Master» (без Remove BG)';
      this.toast('Продолжаем с последнего cutout', 'success');
      document.getElementById('placement-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      await this.refreshStudioCheckpointUi();
    } catch (err) {
      console.error('[Studio Pro] continue checkpoint', err);
      if (statusEl) statusEl.textContent = '❌ ' + err.message;
      this.toast(err.message, 'error');
    }
  },

  renderStudioCompare() {
    const root = document.getElementById('studio-compare');
    if (!root) return;
    const slots = [
      { key: 'original', imgId: 'studio-compare-original', emptyId: 'studio-compare-original-empty', emptyText: '—' },
      { key: 'canvas', imgId: 'studio-compare-canvas', emptyId: 'studio-compare-canvas-empty', emptyText: '—' },
      { key: 'ai', imgId: 'studio-compare-ai', emptyId: 'studio-compare-ai-empty', emptyText: 'откл' }
    ];
    let any = false;
    for (const s of slots) {
      const url = this.studioCompare?.[s.key] || null;
      const img = document.getElementById(s.imgId);
      const empty = document.getElementById(s.emptyId);
      if (url) {
        any = true;
        if (img) {
          img.src = url;
          img.classList.remove('hidden');
        }
        empty?.classList.add('hidden');
      } else {
        if (img) {
          img.removeAttribute('src');
          img.classList.add('hidden');
        }
        if (empty) {
          empty.textContent = s.emptyText;
          empty.classList.remove('hidden');
        }
      }
    }
    root.classList.toggle('hidden', !any);
  },

  openStudioCompareSlot(key) {
    const url = this.studioCompare?.[key];
    if (!url) return;
    this.openLightbox(url);
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
    this.hidePlacementEditor(true);
    this.studioCanvasMasterDataUrl = null;
    this.studioCompare = { original: null, canvas: null, ai: null };
    this.renderStudioCompare();
    this.syncStudioAiToggleUi();

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

      // True original for compare strip (before restore/AI)
      this.studioCompare.original = imageUrl;

      // 0) Restore — skip for wall/fountain scenes (rewrites chrome colors & text)
      const skipRestore = this.isWallOnlyScene(scene);
      if (!skipRestore && this.isStudioAiEnhanceEnabled()) {
        try {
          statusEl.textContent = '🔦 Улучшение исходника (свет, шум, резкость)...';
          imageUrl = await this.restoreSourcePhoto(imageUrl, statusEl);
          console.log('[Studio Pro] Restore OK');
        } catch (restoreErr) {
          console.warn('[Studio Pro] Restore skipped:', restoreErr);
          statusEl.textContent = '⚠️ Restore пропущен — продолжаем с исходником';
        }
      } else if (skipRestore) {
        console.log('[Studio Pro] Restore skipped for wall-only scene (protect chrome/text)');
        statusEl.textContent = '🛡️ Wall-сцена: restore пропущен (сохраняем цвета и текст)';
      } else {
        console.log('[Studio Pro] Restore skipped (AI toggle off)');
        statusEl.textContent = 'AI выкл — restore пропущен';
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
      this.studioPlacement = this.clampPlacementInset({
        x: pos.drawX / MASTER_SIZE,
        y: pos.drawY / MASTER_SIZE,
        w: pos.drawWidth / MASTER_SIZE,
        h: pos.drawHeight / MASTER_SIZE
      });

      await this.saveStudioCheckpoint();
      await this.showPlacementEditor(scene);
      statusEl.textContent = '📐 Cutout сохранён — расставьте на эталоне → «Готово → Master»';
      this.toast('Cutout готов — поставьте на эталон', 'success');
      document.getElementById('placement-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      console.error('[Studio Pro] ❌', error);
      statusEl.textContent = '❌ Ошибка: ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Подготовить фото Studio Pro';
      await this.refreshStudioCheckpointUi();
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
      this.studioPlacement = this.clampPlacementInset(this.studioPlacement, this.isWallOnlyScene(scene) ? 0.07 : 0.05);

      if (statusEl) statusEl.textContent = '🖼️ Композиция на эталоне...';
      if (placeStatus) placeStatus.textContent = 'Композиция...';

      const canvasMasterUrl = await this.composeWithBackground(
        this.studioCutoutDataUrl,
        bgUrl,
        scene,
        this.studioPlacement,
        { alreadyCropped: true }
      );

      this.studioCanvasMasterDataUrl = canvasMasterUrl;
      this.studioCompare = {
        original: this.studioCompare?.original || this.currentProduct?.photos?.[0]?.url || null,
        canvas: canvasMasterUrl,
        ai: null
      };

      let masterImageUrl = canvasMasterUrl;
      const skipAi = this.shouldSkipAiEnhance(scene);

      if (skipAi) {
        const reason = this.isWallOnlyScene(scene)
          ? 'Wall-сцена: AI отключён (текст/хром/края)'
          : 'AI выкл — Master = canvas';
        if (statusEl) statusEl.textContent = '🛡️ ' + reason;
        this.toast(reason, 'info');
      } else {
        if (statusEl) statusEl.textContent = '✨ AI «переснимает» свет и тени...';
        try {
          masterImageUrl = await this.enhanceMasterWithAI(canvasMasterUrl, scene, statusEl, { gentle: false });
          this.studioCompare.ai = masterImageUrl;
        } catch (enhanceErr) {
          console.warn('[Studio Pro] AI enhance failed, keep canvas master:', enhanceErr);
          this.toast('AI-доводка не удалась — оставлен canvas. Задеплойте Worker, если 404.', 'error');
          this.studioCompare.ai = null;
        }
      }

      this.renderStudioCompare();
      await this.saveStudioCheckpoint({ placement: { ...this.studioPlacement } });

      this.studioMasterDataUrl = masterImageUrl;
      this.hidePlacementEditor(false);
      this.resetCropFrames(false);
      this.showCropEditor(masterImageUrl);

      this.currentProduct.photos = [
        { id: Date.now() + '_master', url: masterImageUrl, uploaded: false, type: 'master' }
      ];
      this.renderPhotos();

      if (statusEl) statusEl.textContent = '✅ Master готов — настройте рамки #2/#3 · сравнение выше';
      if (placeStatus) placeStatus.textContent = '';
      this.toast('Master готов — выберите рамки кропов', 'success');
      document.getElementById('studio-compare')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      console.error('[Studio Pro] placement→enhance', error);
      if (statusEl) statusEl.textContent = '❌ ' + error.message;
      if (placeStatus) placeStatus.textContent = '❌ ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
      await this.refreshStudioCheckpointUi();
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
    this.syncStudioAiToggleUi();
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
    this.studioPlacement = this.clampPlacementInset({
      x: pos.drawX / MASTER_SIZE,
      y: pos.drawY / MASTER_SIZE,
      w: pos.drawWidth / MASTER_SIZE,
      h: pos.drawHeight / MASTER_SIZE
    });
    this.syncPlacementDom();
    const scaleEl = document.getElementById('placement-scale');
    if (scaleEl) scaleEl.value = Math.round(this.studioPlacement.w * 100);
    const status = document.getElementById('placement-status');
    if (status) status.textContent = 'Стартовая позиция восстановлена';
  },

  onPlacementScaleInput(value) {
    if (!this.studioPlacement || !this.studioPlacementAspect) return;
    let w = Math.max(0.25, Math.min(0.86, Number(value) / 100));
    let h = w / this.studioPlacementAspect;
    if (h > 0.86) {
      h = 0.86;
      w = h * this.studioPlacementAspect;
    }
    const cx = this.studioPlacement.x + this.studioPlacement.w / 2;
    const cy = this.studioPlacement.y + this.studioPlacement.h / 2;
    let x = cx - w / 2;
    let y = cy - h / 2;
    this.studioPlacement = this.clampPlacementInset({ x, y, w, h });
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
      this.studioPlacement = this.clampPlacementInset({
        ...start,
        x: start.x + dx,
        y: start.y + dy
      });
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

  async enhanceMasterWithAI(masterDataUrl, scene, statusEl, opts = {}) {
    const gentle = !!opts.gentle || this.isWallOnlyScene(scene);
    statusEl.textContent = '☁️ Загрузка Master для AI...';
    const httpsUrl = await this.uploadDataUrlToCloudinary(masterDataUrl, 'studio-compose.webp');

    statusEl.textContent = gentle
      ? '✨ AI: только шов и тень (геометрия locked)...'
      : '✨ AI переснимает в комнате (2K)...';
    const res = await fetch(`${this.workerUrl}/api/studio/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({
        image_url: httpsUrl,
        scene,
        resolution: gentle ? '2K' : '2K',
        mode: gentle ? 'gentle' : 'rephotograph'
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.job_id) {
      throw new Error(data.error || `Enhance HTTP ${res.status}`);
    }

    statusEl.textContent = gentle ? '⏳ Лёгкая AI-доводка...' : '⏳ AI-доводка 2K... (1–2 мин)';
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
      this.drawSoftContactShadow(finalCtx, croppedCanvas, drawX, drawY, drawWidth, drawHeight, { wall: true });
    } else {
      finalCtx.drawImage(bgImg, 0, 0, MASTER_SIZE, MASTER_SIZE);
      this.drawSoftContactShadow(finalCtx, croppedCanvas, drawX, drawY, drawWidth, drawHeight, { wall: false });
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
      const scene = this.currentProduct?.scene || 'floor';
      // Wall/fountain: skip AI crop upscale — it melts ribbons and flattens sphere edges
      const allowCropUpscale = !this.isWallOnlyScene(scene);

      if (allowCropUpscale && (crop2.size < UPSCALE_BELOW || crop3.size < UPSCALE_BELOW)) {
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
