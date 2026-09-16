// VigSharm Admin - Studio Pro
// Стена / бабл / хром: эталон + cutout. Напольная / фотозона: AI-пересъёмка → Master.
// Кривой текст на табличке: программный слой (Canvas) поверх Master Base — буквы из полей, без AI.

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
  studioCompare: { original: null, master: null },
  studioSourceUrl: null,
  studioMasterBackupUrl: null,
  studioMasterBaseUrl: null,
  signTextFrame: null,
  _signDrag: null,
  _studioDraftKey: null,
  cropFrames: null,
  _cropDrag: null,
  _placementDrag: null,
  _cropPreviewRaf: null,
  _cropPreviewSrc: null,

  isWallOnlyScene(scene) {
    return ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  },

  /** Wall/bubble/chrome: composite on YOUR reference (stable background, no AI rewrite) */
  usesCompositeMode(scene) {
    return this.isWallOnlyScene(scene);
  },

  /** Floor/photozone: AI rephotograph in studio */
  usesRephotographMode(scene) {
    return ['floor', 'photozone', 'auto'].includes(scene || 'floor');
  },

  syncStudioModeHint() {
    const el = document.getElementById('studio-mode-hint');
    if (!el) return;
    const scene = this.currentProduct?.scene || 'floor';
    if (this.usesCompositeMode(scene)) {
      el.textContent = 'Режим: эталон + cutout (текст/хром/ленты сохраняются, фон = ваш файл).';
    } else if (scene === 'photozone') {
      el.textContent = 'Режим: AI-пересъёмка фотозоны. Кривые буквы — блок «Надпись»: текст из полей, без AI.';
    } else {
      el.textContent = 'Режим: AI-пересъёмка напольной сцены. Кривые буквы — «Надпись» из полей (без AI).';
    }
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
        targetWidth: 0.88,
        centerX: 0.5,
        floorY: 0.78,
        useFloorAlignment: true,
        maxHeight: 0.92,
        description: 'Фотозона ~180 см — крупно в кадре'
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
      originalUrl: this.studioSourceUrl || this.studioCompare?.original || this.currentProduct?.photos?.[0]?.url || null,
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
    this.studioMasterBackupUrl = null;
    this.studioMasterBaseUrl = null;
    this.signTextFrame = null;
    this.studioCompare = { original: null, master: null };
    this.studioSourceUrl = null;
    this.hidePlacementEditor(true);
    this.hideCropEditor?.();
    this.hideSignTextEditor?.();
    this.renderStudioCompare();
    await this.refreshStudioCheckpointUi();
    const statusEl = document.getElementById('studio-status');
    if (statusEl) statusEl.textContent = 'Cutout сброшен — запустите Studio Pro заново';
    this.toast('Checkpoint cutout очищен', 'info');
  },

  async refreshStudioCheckpointUi() {
    const retryBtn = document.getElementById('studio-retry-btn');
    const src = this.studioSourceUrl || this.studioCompare?.original;
    retryBtn?.classList.toggle('hidden', !src);
  },

  async ensureReferenceHttpsUrl() {
    let url = this.getReferenceBackgroundUrl();
    if (!url) throw new Error('Эталонный фон не найден');
    if (url.startsWith('https://') || url.startsWith('http://')) return url;

    const blobRes = await fetch(url);
    if (!blobRes.ok) throw new Error('Не удалось загрузить эталонный фон');
    const blob = await blobRes.blob();
    const file = new File([blob], 'vigsharm-reference.webp', { type: blob.type || 'image/webp' });
    const uploadResult = await this.uploadPhoto(file);
    if (!uploadResult.ok) {
      throw new Error(uploadResult.error || 'Не удалось загрузить эталон в Cloudinary');
    }
    this.studioReferenceBackgroundUrl = uploadResult.url;
    this.saveReferenceBackgroundUrl?.();
    return uploadResult.url;
  },

  async callRephotographMaster(imageUrl, scene, statusEl) {
    // Без restore: лишний шаг (часто content-policy на персонажах) и +1–3 мин.
    const referenceUrl = await this.ensureReferenceHttpsUrl();
    if (statusEl) statusEl.textContent = '📸 AI переснимает в студии (яркий свет, крупный кадр)...';

    const res = await fetch(`${this.workerUrl}/api/studio/rephotograph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({
        image_url: imageUrl,
        reference_url: referenceUrl,
        scene,
        resolution: '2K'
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.job_id) {
      throw new Error(data.error || `Rephotograph HTTP ${res.status}`);
    }

    if (statusEl) statusEl.textContent = '⏳ Master... (1–2 мин, nano-banana-2 → fallback)';
    return await this.pollStudioStatusSimple(data.job_id);
  },

  finishMasterWorkflow(masterImageUrl, statusEl) {
    this.studioMasterBackupUrl = masterImageUrl;
    this.studioMasterBaseUrl = masterImageUrl;
    this.studioMasterDataUrl = masterImageUrl;
    this.studioCompare.master = masterImageUrl;
    this.renderStudioCompare();
    this.hidePlacementEditor(true);
    this.resetCropFrames(false);
    this.showCropEditor(masterImageUrl);
    this.showSignTextEditor();

    this.currentProduct.photos = [
      { id: Date.now() + '_master', url: masterImageUrl, uploaded: false, type: 'master' }
    ];
    this.renderPhotos();

    if (statusEl) statusEl.textContent = '✅ Master готов — проверьте текст, при необходимости «Надпись»';
    this.toast('Master готов — проверьте надпись на табличке', 'success');
    document.getElementById('studio-compare')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  async callCompositeMaster(imageUrl, scene, statusEl) {
    if (statusEl) statusEl.textContent = '🎨 Удаление фона...';
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

    if (statusEl) statusEl.textContent = '⏳ Remove BG... (30–60 сек)';
    const transparentPng = await this.pollStudioStatusSimple(data.job_id);

    if (statusEl) statusEl.textContent = '✂️ Cutout + ваш эталон...';
    const cutout = await this.prepareCutoutFromPng(transparentPng);
    const MASTER_SIZE = this.MASTER_SIZE || 2048;
    const pos = this.getProductPositioning(scene, cutout.width, cutout.height, MASTER_SIZE);
    const placement = this.clampPlacementInset({
      x: pos.drawX / MASTER_SIZE,
      y: pos.drawY / MASTER_SIZE,
      w: pos.drawWidth / MASTER_SIZE,
      h: pos.drawHeight / MASTER_SIZE
    }, this.isWallOnlyScene(scene) ? 0.07 : 0.05);

    const bgUrl = await this.ensureReferenceHttpsUrl();
    return await this.composeWithBackground(cutout.dataUrl, bgUrl, scene, placement, { alreadyCropped: true });
  },

  async createMasterForScene(imageUrl, scene, statusEl) {
    if (this.usesCompositeMode(scene)) {
      return await this.callCompositeMaster(imageUrl, scene, statusEl);
    }
    return await this.callRephotographMaster(imageUrl, scene, statusEl);
  },

  async retryStudioMaster() {
    const src = this.studioSourceUrl || this.studioCompare?.original;
    if (!src) {
      this.toast('Сначала создайте Master', 'error');
      return;
    }

    const btn = document.getElementById('studio-retry-btn');
    const statusEl = document.getElementById('studio-status');
    if (btn) btn.disabled = true;

    const keptMaster = this.studioMasterDataUrl || this.studioMasterBackupUrl || this.studioCompare?.master;
    this.studioMasterBackupUrl = keptMaster || this.studioMasterBackupUrl;

    try {
      const scene = this.currentProduct?.scene || 'floor';
      if (statusEl) statusEl.textContent = '↻ Новый Master… предыдущий сохранён до успеха';
      const masterImageUrl = await this.createMasterForScene(src, scene, statusEl);
      this.finishMasterWorkflow(masterImageUrl, statusEl);
    } catch (err) {
      console.error('[Studio Pro] retry', err);
      if (keptMaster) {
        this.studioMasterDataUrl = keptMaster;
        this.studioCompare.master = keptMaster;
        this.renderStudioCompare();
        this.showCropEditor(keptMaster);
        this.showSignTextEditor();
        if (statusEl) statusEl.textContent = '❌ Новый Master не вышел — оставлен предыдущий';
        this.toast('Ошибка — предыдущий Master сохранён', 'error');
      } else {
        if (statusEl) statusEl.textContent = '❌ ' + err.message;
        this.toast(err.message, 'error');
      }
    } finally {
      if (btn) btn.disabled = false;
      await this.refreshStudioCheckpointUi();
    }
  },

  renderStudioCompare() {
    const root = document.getElementById('studio-compare');
    if (!root) return;
    const slots = [
      { key: 'original', imgId: 'studio-compare-original', emptyId: 'studio-compare-original-empty', emptyText: '—' },
      { key: 'master', imgId: 'studio-compare-master', emptyId: 'studio-compare-master-empty', emptyText: '—' }
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

  // === Studio Pro FLOW (Manus-style rephotograph) ===
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
    this.hideSignTextEditor?.();
    this.signTextFrame = null;
    this.studioMasterBaseUrl = null;
    this.studioCompare = { original: null, master: null };
    this.renderStudioCompare();

    try {
      const scene = this.currentProduct.scene || 'floor';
      const mode = this.usesCompositeMode(scene) ? 'composite' : 'rephotograph';
      console.log('[Studio Pro] ====== START ======', { scene, mode });
      this.syncStudioModeHint();

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

      this.studioSourceUrl = imageUrl;
      this.studioCompare.original = imageUrl;

      const masterImageUrl = await this.createMasterForScene(imageUrl, scene, statusEl);
      this.finishMasterWorkflow(masterImageUrl, statusEl);
    } catch (error) {
      console.error('[Studio Pro] ❌', error);
      statusEl.textContent = '❌ Ошибка: ' + error.message;
      this.toast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Создать Master';
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
      if (data.status === 'failed') {
        throw new Error(data.error || 'Обработка не удалась (модель отклонила задачу)');
      }
      if (!data.ok && data.error) throw new Error(data.error);
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
        photo2: { x: 0.04, y: 0.10, size: 0.54 },
        photo3: { x: 0.36, y: 0.05, size: 0.44 }
      };
    }
    return {
      photo2: { x: 0.03, y: 0.12, size: 0.56 },
      photo3: { x: 0.38, y: 0.06, size: 0.42 }
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
    if (clearMaster) this.hideSignTextEditor();
  },

  getDefaultSignTextFrame() {
    return { x: 0.36, y: 0.20, size: 0.28 };
  },

  showSignTextEditor() {
    const editor = document.getElementById('sign-text-editor');
    const img = document.getElementById('sign-text-master-img');
    const masterUrl = this.studioMasterDataUrl || this.studioCompare?.master;
    if (!editor || !img || !masterUrl) return;
    if (this.usesCompositeMode(this.currentProduct?.scene || 'floor')) {
      editor.classList.add('hidden');
      return;
    }

    if (!this.signTextFrame) this.signTextFrame = this.getDefaultSignTextFrame();
    editor.classList.remove('hidden');

    const sync = () => {
      this.syncSignTextDom();
      this.setupSignTextInteractions();
    };
    img.onload = sync;
    img.src = masterUrl;
    if (img.complete && img.naturalWidth) sync();
  },

  hideSignTextEditor() {
    const editor = document.getElementById('sign-text-editor');
    if (editor) editor.classList.add('hidden');
    this._signDrag = null;
  },

  syncSignTextDom() {
    const el = document.getElementById('sign-text-frame');
    const f = this.signTextFrame;
    if (!el || !f) return;
    el.style.left = (f.x * 100) + '%';
    el.style.top = (f.y * 100) + '%';
    el.style.width = (f.size * 100) + '%';
    el.style.height = (f.size * 100) + '%';
  },

  resetSignTextFrame() {
    this.signTextFrame = this.getDefaultSignTextFrame();
    this.syncSignTextDom();
    const status = document.getElementById('sign-text-status');
    if (status) status.textContent = 'Рамка таблички сброшена';
  },

  setupSignTextInteractions() {
    const stage = document.getElementById('sign-text-stage');
    const frame = document.getElementById('sign-text-frame');
    if (!stage || !frame || frame.dataset.signWired === '1') return;
    frame.dataset.signWired = '1';

    const onMove = (clientX, clientY) => {
      if (!this._signDrag || !this.signTextFrame) return;
      const rect = stage.getBoundingClientRect();
      const dx = (clientX - this._signDrag.startX) / rect.width;
      const dy = (clientY - this._signDrag.startY) / rect.height;
      const start = this._signDrag.startFrame;
      if (this._signDrag.mode === 'resize') {
        const size = Math.max(0.12, Math.min(0.55, start.size + Math.max(dx, dy)));
        this.signTextFrame = { x: start.x, y: start.y, size };
      } else {
        let x = start.x + dx;
        let y = start.y + dy;
        const size = start.size;
        x = Math.max(0, Math.min(x, 1 - size));
        y = Math.max(0, Math.min(y, 1 - size));
        this.signTextFrame = { x, y, size };
      }
      this.syncSignTextDom();
    };

    frame.addEventListener('pointerdown', (e) => {
      if (!this.signTextFrame) return;
      e.preventDefault();
      const handle = e.target.closest('.crop-handle');
      this._signDrag = {
        mode: handle ? 'resize' : 'move',
        startX: e.clientX,
        startY: e.clientY,
        startFrame: { ...this.signTextFrame }
      };
      frame.setPointerCapture?.(e.pointerId);
    });
    frame.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
    frame.addEventListener('pointerup', () => { this._signDrag = null; });
    frame.addEventListener('pointercancel', () => { this._signDrag = null; });
  },

  getSignTextLines() {
    const line1 = (document.getElementById('sign-text-line1')?.value || '').trim();
    const line2 = (document.getElementById('sign-text-line2')?.value || '').trim();
    return { line1, line2 };
  },

  getInscriptionStyle() {
    const sizePct = Number(document.getElementById('sign-text-size')?.value ?? 16);
    const rotation = Number(document.getElementById('sign-text-rotation')?.value ?? -3);
    const color = document.getElementById('sign-text-color')?.value || '#8B1A1A';
    return {
      sizePct: Math.max(8, Math.min(28, sizePct)),
      rotation: Math.max(-20, Math.min(20, rotation)),
      color
    };
  },

  commitMasterImage(dataUrl, statusMsg) {
    this.studioMasterDataUrl = dataUrl;
    this.studioMasterBackupUrl = dataUrl;
    this.studioCompare.master = dataUrl;
    this.renderStudioCompare();
    this.showCropEditor(dataUrl);
    this.showSignTextEditor();
    this.currentProduct.photos = [
      { id: Date.now() + '_master', url: dataUrl, uploaded: false, type: 'master' }
    ];
    this.renderPhotos();
    const studioStatus = document.getElementById('studio-status');
    if (studioStatus) studioStatus.textContent = statusMsg;
  },

  /** Soft-wash lettering inside circular plaque — keep disk lighting, no hard white sticker */
  softWashPlaqueDisk(ctx, sourceCanvas, cx, cy, r) {
    const dpr = 1;
    const size = Math.max(32, Math.ceil(r * 2 * dpr));
    const tmp = document.createElement('canvas');
    tmp.width = size;
    tmp.height = size;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(sourceCanvas, cx - r, cy - r, r * 2, r * 2, 0, 0, size, size);

    // Multi-pass blur to dissolve glyphs while keeping warm disk tone
    const blur = document.createElement('canvas');
    blur.width = size;
    blur.height = size;
    const bctx = blur.getContext('2d');
    bctx.filter = `blur(${Math.max(6, Math.round(size * 0.045))}px)`;
    bctx.drawImage(tmp, 0, 0);
    bctx.filter = 'none';
    bctx.globalAlpha = 0.55;
    bctx.fillStyle = 'rgba(255, 252, 247, 0.85)';
    bctx.beginPath();
    bctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    bctx.fill();
    bctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(blur, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  },

  drawInscriptionLines(ctx, lines, cx, cy, diskR, style) {
    const maxW = diskR * 2 * 0.72;
    let fontSize = Math.round(diskR * 2 * (style.sizePct / 100));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fitFont = (text, startSize) => {
      let size = startSize;
      do {
        ctx.font = `600 ${size}px "Georgia", "Times New Roman", "PT Serif", serif`;
        if (ctx.measureText(text).width <= maxW) return size;
        size -= 2;
      } while (size > 14);
      return size;
    };

    const sizes = lines.map((t) => fitFont(t, fontSize));
    const lineGap = Math.round(Math.max(...sizes) * 1.18);
    const blockH = lineGap * (lines.length - 1);
    const y0 = cy - blockH / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((style.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    lines.forEach((text, i) => {
      const size = sizes[i];
      const y = y0 + i * lineGap;
      ctx.font = `600 ${size}px "Georgia", "Times New Roman", "PT Serif", serif`;
      ctx.fillStyle = 'rgba(60,30,20,0.16)';
      ctx.fillText(text, cx + 1.5, y + 1.5);
      ctx.fillStyle = style.color;
      ctx.fillText(text, cx, y);
    });
    ctx.restore();
  },

  async restoreMasterBaseWithoutText() {
    const base = this.studioMasterBaseUrl;
    if (!base) {
      this.toast('Нет Master Base — сначала создайте Master', 'error');
      return;
    }
    this.commitMasterImage(base, '✅ Master без программной надписи');
    if (this.currentProduct) this.currentProduct.inscription = null;
    const statusEl = document.getElementById('sign-text-status');
    if (statusEl) statusEl.textContent = 'Сброшено к Master Base';
    this.toast('Надпись снята — снова Master Base', 'info');
  },

  async applySignTextOnMaster() {
    const baseUrl = this.studioMasterBaseUrl || this.studioMasterDataUrl || this.studioCompare?.master;
    const { line1, line2 } = this.getSignTextLines();
    if (!baseUrl || !this.signTextFrame) {
      this.toast('Сначала создайте Master', 'error');
      return;
    }
    if (!line1 && !line2) {
      this.toast('Введите имя и/или строку возраста', 'error');
      return;
    }

    const btn = document.getElementById('apply-sign-text-btn');
    const statusEl = document.getElementById('sign-text-status');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = '🖍 Надпись поверх Master Base...';

    try {
      if (!this.studioMasterBaseUrl) this.studioMasterBaseUrl = baseUrl;

      const masterImg = await this.loadImage(baseUrl);
      const MASTER_SIZE = this.MASTER_SIZE || 2048;
      const out = document.createElement('canvas');
      out.width = MASTER_SIZE;
      out.height = MASTER_SIZE;
      const ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(masterImg, 0, 0, MASTER_SIZE, MASTER_SIZE);

      const rect = this.stageFrameToImageRect({ width: MASTER_SIZE, height: MASTER_SIZE }, this.signTextFrame);
      const dw = Math.max(8, Math.round(rect.sw));
      const dx = Math.round(rect.sx);
      const dy = Math.round(rect.sy);
      const cx = dx + dw / 2;
      const cy = dy + dw / 2;
      const r = dw / 2;

      this.softWashPlaqueDisk(ctx, out, cx, cy, r);

      const lines = [line1, line2].filter(Boolean);
      const style = this.getInscriptionStyle();
      this.drawInscriptionLines(ctx, lines, cx, cy, r, style);

      const inscription = {
        enabled: true,
        target: 'plaque',
        text: lines.join('\n'),
        line1,
        line2,
        font: 'Georgia',
        fontSizePct: style.sizePct,
        color: style.color,
        rotation: style.rotation,
        x: this.signTextFrame.x,
        y: this.signTextFrame.y,
        size: this.signTextFrame.size
      };
      if (this.currentProduct) this.currentProduct.inscription = inscription;

      const merged = out.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
      this.commitMasterImage(merged, '✅ Master Final: надпись из полей (без AI)');
      if (statusEl) statusEl.textContent = '✅ Надпись нанесена — можно кропать или править и нанести снова';
      this.toast('Надпись нанесена программно', 'success');
    } catch (err) {
      console.error('[Inscription]', err);
      if (statusEl) statusEl.textContent = '❌ ' + err.message;
      this.toast(err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /** Map square-stage frame (object-fit:contain) → image pixel rect */
  stageFrameToImageRect(img, frame) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.min(1 / iw, 1 / ih);
    const ox = (1 - iw * scale) / 2;
    const oy = (1 - ih * scale) / 2;
    let sx = (frame.x - ox) / scale;
    let sy = (frame.y - oy) / scale;
    let sw = frame.size / scale;
    let sh = frame.size / scale;
    sx = Math.max(0, Math.min(sx, iw - 1));
    sy = Math.max(0, Math.min(sy, ih - 1));
    sw = Math.max(1, Math.min(sw, iw - sx));
    sh = Math.max(1, Math.min(sh, ih - sy));
    return { sx, sy, sw, sh };
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
      // Manus: кропы только deterministic resize из Master — без AI-upscale
      const allowCropUpscale = false;

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
