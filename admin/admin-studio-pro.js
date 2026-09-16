// VigSharm Admin - Studio Pro
// Manus AI-пересъёмка: стена / бабл / букет в руке / напольная / фотозона → Master.
// Букет в руке: стена без пола + рука. Стена/бабл: стена без пола, без руки.
// Кривой текст на табличке: программный слой (Canvas) поверх Master Base — буквы из полей, без AI.
// После Master — одно фото. Кропы #2/#3 отключены.

Object.assign(app, {
  MASTER_SIZE: 2048,
  WEBP_QUALITY: 1.0,
  DEFAULT_REFERENCE_BG: '../assets/reference/reference-background.png',
  /** Chroma-green plate: fist gripping bouquet base (composited under ribbons) */
  DEFAULT_REFERENCE_HAND: '../assets/reference/reference-hand-bouquet.png',
  /** Bump when replacing hand PNG — forces Cloudinary re-upload */
  REFERENCE_HAND_VERSION: 'v4',
  STUDIO_CHECKPOINT_DB: 'vigsharm_studio_pro',
  STUDIO_CHECKPOINT_STORE: 'checkpoints',
  _handPlateCanvas: null,

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
  _placementDrag: null,

  isWallOnlyScene(scene) {
    return ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  },

  /** Legacy cutout path — unused while all scenes use Manus rephotograph */
  usesCompositeMode(scene) {
    return false;
  },

  /** All catalog scenes: AI rephotograph (Manus-style) against studio reference */
  usesRephotographMode(scene) {
    return ['floor', 'photozone', 'auto', 'handheld_bouquet', 'wall_only', 'unit_balloon'].includes(scene || 'floor');
  },

  syncStudioModeHint() {
    const el = document.getElementById('studio-mode-hint');
    if (!el) return;
    const scene = this.currentProduct?.scene || 'floor';
    if (scene === 'handheld_bouquet') {
      el.textContent = 'Режим Manus: букет + женская рука (короткое запястье). Бирки/логотипы на лентах снимаются.';
    } else if (scene === 'wall_only' || scene === 'unit_balloon') {
      el.textContent = 'Режим Manus: AI-пересъёмка — только стена (без пола, без руки). Товар LOCK, без cutout.';
    } else if (scene === 'photozone') {
      el.textContent = 'Режим Manus: AI-пересъёмка фотозоны. Кривые буквы — блок «Надпись» из полей.';
    } else {
      el.textContent = 'Режим Manus: AI-пересъёмка напольной сцены. Кривые буквы — «Надпись» из полей.';
    }
  },

  getReferenceBackgroundUrl() {
    return this.studioReferenceBackgroundUrl || this.DEFAULT_REFERENCE_BG;
  },

  getReferenceHandUrl() {
    return this.studioReferenceHandUrl || this.DEFAULT_REFERENCE_HAND;
  },

  saveReferenceHandUrl() {
    try {
      const saved = localStorage.getItem('vigsharm_admin_settings');
      const settings = saved ? JSON.parse(saved) : {};
      settings.studioReferenceHandUrl = this.studioReferenceHandUrl || '';
      settings.studioReferenceHandVersion = this.studioReferenceHandVersion || '';
      localStorage.setItem('vigsharm_admin_settings', JSON.stringify(settings));
    } catch (e) {
      console.error('Ошибка сохранения эталона руки:', e);
    }
  },

  /** HTTPS URL for hand plate (Cloudinary) — required for canvas on file:// */
  async ensureReferenceHandHttpsUrl(statusEl) {
    const ver = this.REFERENCE_HAND_VERSION || 'v1';
    if (this.studioReferenceHandVersion && this.studioReferenceHandVersion !== ver) {
      this.studioReferenceHandUrl = '';
      this._handPlateCanvas = null;
    }

    let url = this.getReferenceHandUrl();
    if (url && (url.startsWith('https://') || url.startsWith('http://')) && this.studioReferenceHandVersion === ver) {
      return url;
    }

    if (location.protocol === 'file:') {
      throw new Error(
        'Новый эталон руки v4: Настройки → удалите старую руку → загрузите assets/reference/reference-hand-bouquet.png'
      );
    }

    if (statusEl) statusEl.textContent = '✋ Загрузка эталона руки v4 в Cloudinary...';
    const blobRes = await fetch(this.DEFAULT_REFERENCE_HAND);
    if (!blobRes.ok) throw new Error('Не удалось прочитать reference-hand-bouquet.png');
    const blob = await blobRes.blob();
    const file = new File([blob], 'vigsharm-reference-hand-v4.png', { type: blob.type || 'image/png' });
    const uploadResult = await this.uploadPhoto(file);
    if (!uploadResult.ok) {
      throw new Error(uploadResult.error || 'Не удалось загрузить эталон руки в Cloudinary');
    }
    this.studioReferenceHandUrl = uploadResult.url;
    this.studioReferenceHandVersion = ver;
    this._handPlateCanvas = null;
    this.saveReferenceHandUrl();
    return uploadResult.url;
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
        description: 'Напольная композиция — у стены у плинтуса'
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
        targetWidth: 0.54,
        centerX: 0.5,
        centerY: 0.42,
        useFloorAlignment: false,
        maxHeight: 0.72,
        description: 'Букет в руке — стена + плита руки снизу'
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

  /** Green-screen plate → transparent canvas (runtime, no AI) */
  chromaKeyGreenPlate(imageData) {
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isGreen = g > 90 && g > r * 1.25 && g > b * 1.25 && (g - Math.max(r, b)) > 28;
      if (isGreen) {
        data[i + 3] = 0;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        continue;
      }
      // Spill kill on edges: pull green toward skin/neutral
      if (g > r + 18 && g > b + 18) {
        data[i + 1] = Math.min(g, Math.round((r + b) / 2 + 8));
      }
    }
    return imageData;
  },

  async loadHandPlateCanvas() {
    if (this._handPlateCanvas) return this._handPlateCanvas;
    const url = await this.ensureReferenceHandHttpsUrl();
    const img = await this.loadImage(url);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    let imageData = ctx.getImageData(0, 0, c.width, c.height);

    // Already transparent PNG → skip chroma; green-screen JPEG/PNG → key out
    let transparent = 0;
    const sample = Math.min(imageData.data.length, 4000);
    for (let i = 3; i < sample; i += 4) {
      if (imageData.data[i] < 8) transparent++;
    }
    if (transparent < 20) {
      this.chromaKeyGreenPlate(imageData);
    }
    this.hardenAlphaChannel(imageData, { solidAt: 64, killBelow: 10 });
    ctx.putImageData(imageData, 0, 0);

    const box = this.getAlphaBoundingBox(imageData, 18);
    if (!box || box.width < 8 || box.height < 8) {
      throw new Error('Эталон руки: после chroma-key пусто — проверьте reference-hand-bouquet.png');
    }
    const cropped = document.createElement('canvas');
    cropped.width = box.width;
    cropped.height = box.height;
    cropped.getContext('2d').drawImage(
      c, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height
    );
    this._handPlateCanvas = cropped;
    return cropped;
  },

  /** Place hand under ribbon knot — bouquet sits in the grip */
  getHandDrawRect(drawX, drawY, drawWidth, drawHeight, handW, handH) {
    const targetW = drawWidth * 0.38;
    const scale = targetW / handW;
    const w = handW * scale;
    const h = handH * scale;
    // Top of fist aligns with gathered ribbons; most of hand below bouquet
    const gripY = drawY + drawHeight * 0.88;
    const x = drawX + drawWidth / 2 - w / 2;
    const y = gripY - h * 0.22;
    return { x, y, w, h };
  },

  /** Soft fade at forearm bottom — kills hard plate crop */
  drawHandPlateFaded(ctx, handCanvas, x, y, w, h) {
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(w));
    tmp.height = Math.max(1, Math.round(h));
    const tctx = tmp.getContext('2d');
    tctx.drawImage(handCanvas, 0, 0, tmp.width, tmp.height);
    const fadeFrom = tmp.height * 0.55;
    const grad = tctx.createLinearGradient(0, fadeFrom, 0, tmp.height);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    tctx.globalCompositeOperation = 'destination-in';
    tctx.fillStyle = grad;
    tctx.fillRect(0, fadeFrom, tmp.width, tmp.height - fadeFrom);
    ctx.drawImage(tmp, x, y, w, h);
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
    const startJob = async (prefer) => {
      const res = await fetch(`${this.workerUrl}/api/studio/rephotograph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({
          image_url: imageUrl,
          reference_url: referenceUrl,
          scene,
          resolution: '2K',
          prefer
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.job_id) {
        throw new Error(data.error || `Rephotograph HTTP ${res.status}`);
      }
      return data;
    };

    if (statusEl) {
      statusEl.textContent = scene === 'handheld_bouquet'
        ? '✋ Manus: AI переснимает букет — стена + рука...'
        : (scene === 'wall_only' || scene === 'unit_balloon')
          ? '🧱 Manus: gpt/flux → при сбое banana...'
          : '📸 AI переснимает в студии (gpt → banana)...';
    }

    // 1) quality (gpt/flux). Short poll — if hang/fail → banana with longer wait.
    const preferFirst = 'quality';
    let data = await startJob(preferFirst);
    if (statusEl) {
      statusEl.textContent = `⏳ Master (${data.model || preferFirst})...`;
    }
    try {
      return await this.pollStudioStatusSimple(data.job_id, {
        maxAttempts: 40,
        statusEl,
        label: data.model || 'quality'
      });
    } catch (err) {
      const msg = String(err?.message || err);
      const genFail = /не удалось сгенерировать|возвращены на баланс|обработка не удалась|модель отклонила|таймаут обработки/i.test(msg);
      // Do NOT match bare "failed" — that catches "Failed to fetch" (503/CORS) incorrectly
      if (!genFail) throw err;
      console.warn('[Studio Pro] quality job failed, fallback banana:', msg);
      if (statusEl) statusEl.textContent = '↻ gpt/flux упал/таймаут — fallback nano-banana (до ~5 мин)...';
      this.toast('Дорогая модель не выдала кадр — пробуем banana', 'info');
      data = await startJob('banana');
      if (statusEl) statusEl.textContent = `⏳ Master fallback (${data.model || 'banana'})...`;
      return await this.pollStudioStatusSimple(data.job_id, {
        maxAttempts: 100,
        statusEl,
        label: data.model || 'banana'
      });
    }
  },

  finishMasterWorkflow(masterImageUrl, statusEl) {
    this.studioMasterBackupUrl = masterImageUrl;
    this.studioMasterBaseUrl = masterImageUrl;
    this.studioMasterDataUrl = masterImageUrl;
    this.studioCompare.master = masterImageUrl;
    this.renderStudioCompare();
    this.hidePlacementEditor(true);
    // Блок «Надпись на табличку» отключён

    this.currentProduct.photos = [
      { id: Date.now() + '_master', url: masterImageUrl, uploaded: false, type: 'master' }
    ];
    this.renderPhotos();

    if (statusEl) statusEl.textContent = '✅ Master готов — укажите цену и состав, затем ИИ';
    this.toast('Master готов — одно фото в карточке', 'success');
    this.syncAIFillGate?.();
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

    // Hand plate composite disabled — handheld uses Manus AI rephotograph instead
    finalCtx.drawImage(croppedCanvas, drawX, drawY, drawWidth, drawHeight);

    return finalCanvas.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
  },

  async pollStudioStatusSimple(jobId, opts = {}) {
    const maxAttempts = opts.maxAttempts || 90; // ~4.5 min default
    const statusEl = opts.statusEl || null;
    const label = opts.label || 'Master';
    let netFails = 0;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (statusEl && i > 0 && i % 10 === 0) {
        const min = Math.round((i * 3) / 60 * 10) / 10;
        statusEl.textContent = `⏳ ${label}... (~${min} мин)`;
      }
      let res;
      try {
        res = await fetch(`${this.workerUrl}/api/studio/status/${jobId}`, { headers: this.authHeaders() });
        netFails = 0;
      } catch (netErr) {
        netFails++;
        console.warn('[Studio Pro] status network error', netFails, netErr?.message);
        if (netFails >= 5) throw new Error(netErr?.message || 'Failed to fetch status');
        continue;
      }
      if (res.status === 503 || res.status === 502 || res.status === 504) {
        netFails++;
        console.warn('[Studio Pro] status', res.status, '— retry', netFails);
        if (netFails >= 8) throw new Error(`Status check failed: ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
      const data = await res.json();
      if (!data.ok && data.status !== 'failed') throw new Error(data.error || 'Ошибка проверки статуса');
      if (data.status === 'done' && data.result_url) return data.result_url;
      if (data.status === 'failed') {
        throw new Error(data.error || 'Обработка не удалась (модель отклонила задачу)');
      }
    }
    throw new Error('Таймаут обработки');
  },

  hideCropEditor(clearMaster = true) {
    if (clearMaster) this.studioMasterDataUrl = null;
    if (clearMaster) this.hideSignTextEditor();
  },

  showSignTextEditor() {
    this.hideSignTextEditor();
  },

  hideSignTextEditor() {
    const editor = document.getElementById('sign-text-editor');
    if (editor) editor.classList.add('hidden');
    this._signDrag = null;
  },

  commitMasterImage(dataUrl, statusMsg) {
    this.studioMasterDataUrl = dataUrl;
    this.studioMasterBackupUrl = dataUrl;
    this.studioCompare.master = dataUrl;
    this.renderStudioCompare();
    this.currentProduct.photos = [
      { id: Date.now() + '_master', url: dataUrl, uploaded: false, type: 'master' }
    ];
    this.renderPhotos();
    const studioStatus = document.getElementById('studio-status');
    if (studioStatus) studioStatus.textContent = statusMsg;
    this.syncAIFillGate?.();
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

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const absoluteHttp = /^https?:\/\//i.test(src);
      // crossOrigin only for remote URLs — on file:// it breaks local assets
      if (absoluteHttp) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
      img.src = src;
    });
  },

});

console.log('✓ Studio Pro (Manus rephotograph → one Master photo) loaded');
