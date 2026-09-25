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
  /** Один незавершённый Master при создании (переживает F5) */
  STUDIO_ACTIVE_DRAFT_KEY: 'active-create',
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

  /** Cutout / «Персонаж» mode removed — quality ceiling too low for catalog */
  usesCompositeMode() {
    return false;
  },

  isWallOnlyScene(scene) {
    return ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
  },

  /** All catalog scenes: AI rephotograph (Manus-style) against studio reference */
  usesRephotographMode(scene) {
    return ['floor', 'balloon_figures', 'photozone', 'auto', 'handheld_bouquet', 'wall_only', 'unit_balloon'].includes(scene || 'floor');
  },

  syncStudioModeHint() {
    const el = document.getElementById('studio-mode-hint');
    const scene = this.currentProduct?.scene || 'floor';
    const earlyPz = document.getElementById('photozone-type-early');
    if (earlyPz) earlyPz.classList.toggle('hidden', scene !== 'photozone');
    const earlyFloor = document.getElementById('floor-type-early');
    if (earlyFloor) earlyFloor.classList.toggle('hidden', scene !== 'floor');
    const earlyBouquet = document.getElementById('bouquet-type-early');
    if (earlyBouquet) earlyBouquet.classList.toggle('hidden', scene !== 'handheld_bouquet');
    const earlyUnit = document.getElementById('unit-type-early');
    if (earlyUnit) earlyUnit.classList.toggle('hidden', scene !== 'unit_balloon');
    if (el) {
      el.hidden = true;
      el.textContent = '';
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
        targetWidth: 0.72,
        centerX: 0.5,
        floorY: 0.78,
        useFloorAlignment: true,
        maxHeight: 0.90,
        description: 'Напольная композиция — у стены у плинтуса'
      },
      balloon_figures: {
        targetWidth: 0.78,
        centerX: 0.5,
        floorY: 0.78,
        useFloorAlignment: true,
        maxHeight: 0.94,
        description: 'Фигура из шаров ≥1 м — крупно в кадре'
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
        targetWidth: 0.94,
        centerX: 0.5,
        floorY: 0.82,
        useFloorAlignment: true,
        maxHeight: 0.97,
        description: 'Фотозона на каркасе Ø3 м — почти во весь кадр'
      },
      photozone_frame: {
        targetWidth: 0.96,
        centerX: 0.5,
        floorY: 0.84,
        useFloorAlignment: true,
        maxHeight: 0.98,
        description: 'Круглая фотозона на каркасе Ø3 м'
      },
      photozone_easel: {
        targetWidth: 0.86,
        centerX: 0.5,
        floorY: 0.78,
        useFloorAlignment: true,
        maxHeight: 0.92,
        description: 'Фотозона на мольберте ~180 см'
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

    const posKey = scene === 'photozone'
      ? ((this.getPhotozoneType?.() || 'frame') === 'easel' ? 'photozone_easel' : 'photozone_frame')
      : scene;
    const config = positioning[posKey] || positioning[scene] || positioning.floor;
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

  /**
   * Catalog-grade cutout cleanup (no AI): white fringe / halo → soft edge like Manus masters.
   */
  refineCutoutAlpha(imageData) {
    const { data, width, height } = imageData;
    const w = width;
    const h = height;
    const a0 = new Uint8ClampedArray(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let a = data[i + 3];
        if (a <= 4) {
          data[i] = data[i + 1] = data[i + 2] = 0;
          data[i + 3] = 0;
          a0[y * w + x] = 0;
          continue;
        }
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const maxc = Math.max(r, g, b);
        const minc = Math.min(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = maxc - minc;
        // Pale fringe from old room / remove-bg halo
        const paleFringe = a < 250 && lum > 175 && sat < 42;
        const nearWhite = a < 230 && lum > 210 && sat < 28;
        if (nearWhite) a = Math.round(a * 0.15);
        else if (paleFringe) a = Math.round(a * 0.35);
        if (a < 18) a = 0;
        else if (a < 255) a = Math.min(255, Math.round(14 + a * 0.92));
        data[i + 3] = a;
        if (a === 0) data[i] = data[i + 1] = data[i + 2] = 0;
        a0[y * w + x] = a;
      }
    }

    // 1px erode on fringe + light blur → soft photographic edge
    const a1 = new Uint8ClampedArray(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const c = a0[idx];
        if (c === 0) { a1[idx] = 0; continue; }
        if (c === 255) {
          const minN = Math.min(a0[idx - 1], a0[idx + 1], a0[idx - w], a0[idx + w]);
          a1[idx] = minN < 200 ? Math.min(c, minN + 40) : c;
        } else {
          a1[idx] = Math.min(c, a0[idx - 1], a0[idx + 1], a0[idx - w], a0[idx + w]);
        }
      }
    }
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        const blur = Math.round(
          (a1[idx] * 4 + a1[idx - 1] + a1[idx + 1] + a1[idx - w] + a1[idx + w]) / 8
        );
        data[i + 3] = blur;
        if (blur < 8) {
          data[i] = data[i + 1] = data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
    }
    return imageData;
  },

  /** Soft alpha + padded bbox → PNG */
  async prepareCutoutFromPng(transparentPngDataUrl, opts = {}) {
    const catalogGrade = opts.catalogGrade !== false;
    const productImg = await this.loadImage(transparentPngDataUrl);
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = productImg.width;
    tempCanvas.height = productImg.height;
    tempCtx.drawImage(productImg, 0, 0);

    let imageData = tempCtx.getImageData(0, 0, productImg.width, productImg.height);
    if (catalogGrade) this.refineCutoutAlpha(imageData);
    else this.hardenAlphaChannel(imageData);
    tempCtx.putImageData(imageData, 0, 0);

    const boundingBox = this.getAlphaBoundingBox(imageData, catalogGrade ? 10 : 16);
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

  clampPlacementInset(placement, inset = 0.06) {
    if (!placement) return placement;
    let { x, y, w, h } = placement;
    w = Math.min(w, 1 - inset * 2);
    h = Math.min(h, 1 - inset * 2);
    x = Math.max(inset, Math.min(x, 1 - inset - w));
    y = Math.max(inset, Math.min(y, 1 - inset - h));
    return { x, y, w, h };
  },

  /**
   * Contact shadow like catalog masters: soft ellipse near the feet / base,
   * not a full-silhouette glow (that reads as "sticker").
   */
  drawSoftContactShadow(ctx, sourceCanvas, drawX, drawY, drawWidth, drawHeight, { wall = false, catalog = false } = {}) {
    if (catalog && !wall) {
      const cx = drawX + drawWidth * 0.5;
      const cy = drawY + drawHeight * 0.935;
      const rx = Math.max(28, drawWidth * 0.30);
      const ry = Math.max(10, drawHeight * 0.038);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(35,28,22,0.40)');
      g.addColorStop(0.5, 'rgba(35,28,22,0.14)');
      g.addColorStop(1, 'rgba(35,28,22,0)');
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      if (drawWidth > drawHeight * 0.85) {
        const cx2 = drawX + drawWidth * 0.62;
        ctx.save();
        ctx.translate(cx2, cy);
        ctx.scale(1, (ry * 0.9) / (rx * 0.7));
        const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.7);
        g2.addColorStop(0, 'rgba(35,28,22,0.24)');
        g2.addColorStop(1, 'rgba(35,28,22,0)');
        ctx.beginPath();
        ctx.arc(0, 0, rx * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = g2;
        ctx.fill();
        ctx.restore();
      }
      return;
    }
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

  collectActiveStudioDraftPayload(extra = {}) {
    const masterUrl = this.studioMasterDataUrl
      || this.studioCompare?.master
      || this.studioMasterBackupUrl
      || this.currentProduct?.photos?.[0]?.url
      || null;
    if (!masterUrl) return null;
    const priceEl = document.getElementById('product-price');
    const compEl = document.getElementById('product-composition');
    return {
      key: this.STUDIO_ACTIVE_DRAFT_KEY,
      masterUrl,
      originalUrl: this.studioSourceUrl || this.studioCompare?.original || null,
      scene: this.currentProduct?.scene || document.getElementById('scene-select')?.value || 'floor',
      price: priceEl?.value || '',
      composition: compEl?.value || '',
      composition_hints: Array.isArray(this.currentProduct?.composition_hints)
        ? this.currentProduct.composition_hints
        : [],
      digit_from_marker: Number(this.currentProduct?.digit_from_marker) || 0,
      holiday_only: this.currentProduct?.holiday_only || '',
      photozone_type: this.getPhotozoneType?.() || 'frame',
      floor_type: this.getFloorType?.() || '',
      bouquet_type: this.getBouquetType?.() || '',
      unit_type: this.getUnitBalloonType?.() || '',
      unit_who: this.getUnitBalloonWho?.() || '',
      balloon_size: document.getElementById('unit-balloon-size')?.value || '',
      ts: Date.now(),
      ...extra
    };
  },

  async saveActiveStudioDraft(extra = {}) {
    if (this._restoringStudioDraft || this._clearingStudioDraft) return null;
    if (this.currentProduct?.id) return null;
    const record = this.collectActiveStudioDraftPayload(extra);
    if (!record) return null;
    try {
      const db = await this.openStudioCheckpointDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STUDIO_CHECKPOINT_STORE, 'readwrite');
        tx.objectStore(this.STUDIO_CHECKPOINT_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return record;
    } catch (err) {
      console.warn('[Studio Pro] active draft save failed:', err);
      return null;
    }
  },

  scheduleSaveActiveStudioDraft() {
    if (this._restoringStudioDraft || this.currentProduct?.id) return;
    if (!(this.studioMasterDataUrl || this.studioCompare?.master || this.currentProduct?.photos?.[0]?.url)) {
      return;
    }
    clearTimeout(this._activeDraftSaveTimer);
    this._activeDraftSaveTimer = setTimeout(() => {
      this.saveActiveStudioDraft?.();
    }, 400);
  },

  async loadActiveStudioDraft() {
    try {
      const db = await this.openStudioCheckpointDb();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STUDIO_CHECKPOINT_STORE, 'readonly');
        const req = tx.objectStore(this.STUDIO_CHECKPOINT_STORE).get(this.STUDIO_ACTIVE_DRAFT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return record;
    } catch (err) {
      console.warn('[Studio Pro] active draft load failed:', err);
      return null;
    }
  },

  async clearActiveStudioDraft() {
    clearTimeout(this._activeDraftSaveTimer);
    this._clearingStudioDraft = true;
    try {
      const db = await this.openStudioCheckpointDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STUDIO_CHECKPOINT_STORE, 'readwrite');
        tx.objectStore(this.STUDIO_CHECKPOINT_STORE).delete(this.STUDIO_ACTIVE_DRAFT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (err) {
      console.warn('[Studio Pro] active draft clear failed:', err);
    } finally {
      this._clearingStudioDraft = false;
    }
  },

  async restoreActiveStudioDraftIfAny() {
    if (this.currentProduct?.id) return false;
    const draft = await this.loadActiveStudioDraft();
    if (!draft?.masterUrl) return false;

    this._restoringStudioDraft = true;
    try {
      this.currentProduct = this.currentProduct || {
        photos: [], scene: 'floor', tags: [], client_options: {}
      };
      const scene = draft.scene || 'floor';
      this.currentProduct.scene = scene;
      this.currentProduct.composition_hints = Array.isArray(draft.composition_hints)
        ? draft.composition_hints
        : [];
      this.currentProduct.digit_from_marker = Number(draft.digit_from_marker) || 0;
      this.currentProduct.holiday_only = draft.holiday_only || '';

      const sceneSelect = document.getElementById('scene-select');
      if (sceneSelect) sceneSelect.value = scene;
      this.syncSceneRailUi?.(scene);

      const isRemote = /^https?:\/\//i.test(draft.masterUrl);
      this.studioMasterDataUrl = draft.masterUrl;
      this.studioMasterBackupUrl = draft.masterUrl;
      this.studioMasterBaseUrl = draft.masterUrl;
      this.studioSourceUrl = draft.originalUrl || null;
      this.studioCompare = {
        original: draft.originalUrl || null,
        master: draft.masterUrl
      };
      this.currentProduct.photos = [{
        id: 'restored_master',
        url: draft.masterUrl,
        uploaded: isRemote,
        type: 'master'
      }];

      if (draft.photozone_type) this.setPhotozoneType?.(draft.photozone_type);
      if (draft.floor_type) this.setFloorType?.(draft.floor_type);
      this.setBouquetType?.(draft.bouquet_type || '');
      this.setUnitBalloonType?.(draft.unit_type || '');
      this.setUnitBalloonWho?.(draft.unit_who || '');
      const sizeEl = document.getElementById('unit-balloon-size');
      if (sizeEl && draft.balloon_size != null) sizeEl.value = draft.balloon_size;

      const priceEl = document.getElementById('product-price');
      if (priceEl && draft.price != null && draft.price !== '') {
        priceEl.value = draft.price;
        this.syncBudgetFromPrice?.();
      }
      const compEl = document.getElementById('product-composition');
      if (compEl && draft.composition != null) {
        compEl.value = draft.composition;
      }

      this.renderPhotos?.();
      this.renderStudioCompare?.();
      this.showSignTextEditor?.();
      this.setStudioBusy?.(false);
      this.showSourceWorkPreview?.(draft.masterUrl);
      this.syncStudioModeHint?.();
      this.syncEditorSteps?.();
      this.syncAIFillGate?.();
      this.syncAdvanceOrderFromScene?.();
      this.syncRequiredFieldHighlights?.();
      this.refreshStudioCheckpointUi?.();

      const statusEl = document.getElementById('studio-status');
      if (statusEl) {
        statusEl.textContent = '✅ Master восстановлен после обновления страницы — можно продолжить цену + состав → ИИ';
      }

      this.switchTab?.('create');
      this.toast('Master восстановлен после обновления', 'success');
      return true;
    } catch (err) {
      console.warn('[Studio Pro] active draft restore failed:', err);
      return false;
    } finally {
      this._restoringStudioDraft = false;
    }
  },

  getStudioRemasterSourceUrl() {
    return this.studioSourceUrl
      || this.studioCompare?.original
      || this.currentProduct?.client_options?.studio_original_url
      || this.currentProduct?.photos?.find((p) => p.type !== 'master')?.url
      || this.currentProduct?.photos?.[0]?.url
      || this.studioMasterDataUrl
      || this.studioCompare?.master
      || null;
  },

  studioRetryButtons() {
    return [...document.querySelectorAll('[data-studio-retry]')];
  },

  async refreshStudioCheckpointUi() {
    const src = this.getStudioRemasterSourceUrl?.();
    this.studioRetryButtons?.().forEach((btn) => btn.classList.toggle('hidden', !src));
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
      let lastErr = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`${this.workerUrl}/api/studio/rephotograph`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
            body: JSON.stringify({
              image_url: imageUrl,
              reference_url: referenceUrl,
              scene,
              photozone_type: scene === 'photozone' ? (this.getPhotozoneType?.() || 'frame') : undefined,
              resolution: '2K',
              prefer
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok || !data.job_id) {
            throw new Error(data.error || `Rephotograph HTTP ${res.status}`);
          }
          return data;
        } catch (err) {
          lastErr = err;
          const net = /failed to fetch|networkerror|load failed|connection/i.test(String(err?.message || err));
          if (!net || attempt === 2) throw err;
          console.warn('[Studio Pro] rephotograph fetch retry', attempt, err);
          if (statusEl) statusEl.textContent = `↻ Сеть сбойнула — повтор ${attempt + 1}/2…`;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
      throw lastErr;
    };

    if (statusEl) {
      statusEl.textContent = scene === 'handheld_bouquet'
        ? '✋ Manus: AI переснимает букет — стена + рука...'
        : (scene === 'wall_only' || scene === 'unit_balloon')
          ? '🧱 Manus: sunburst → banana → Flux...'
          : '📸 AI переснимает в студии (sunburst → banana → Flux)...';
    }

    // quality (sunburst/gpt) ждём дольше — часто медленная, но лучше Flux.
    // При сбое: banana (каталог), затем Flux как последний запасной.
    const genFailRe = /не удалось сгенерировать|возвращены на баланс|обработка не удалась|модель отклонила|таймаут обработки|failed to fetch|networkerror|load failed|rephotograph http|ошибка rephotograph|не вернул job_id|abort|content.?policy|copyright|авторск|safety|nsfw|moderation|rejected|violat/i;
    let data;
    try {
      data = await startJob('quality');
      if (statusEl) statusEl.textContent = `⏳ Master (${data.model || 'quality'}, до ~4.5 мин)...`;
      return await this.pollStudioStatusSimple(data.job_id, {
        maxAttempts: 90,
        statusEl,
        label: data.model || 'quality'
      });
    } catch (err) {
      const msg = String(err?.message || err);
      // Do NOT match bare "failed" — that catches "Failed to fetch" (503/CORS) incorrectly
      if (!genFailRe.test(msg)) throw err;
      console.warn('[Studio Pro] quality job failed, fallback banana:', msg);
      if (statusEl) statusEl.textContent = '↻ sunburst/gpt не выдал кадр — пробуем nano-banana...';
      this.toast('Дорогая модель не выдала кадр — пробуем banana', 'info');
      try {
        data = await startJob('banana');
        if (statusEl) statusEl.textContent = `⏳ Master fallback (${data.model || 'banana'})...`;
        return await this.pollStudioStatusSimple(data.job_id, {
          maxAttempts: 100,
          statusEl,
          label: data.model || 'banana'
        });
      } catch (bananaErr) {
        const bananaMsg = String(bananaErr?.message || bananaErr);
        if (!genFailRe.test(bananaMsg)) throw bananaErr;
        console.warn('[Studio Pro] banana job failed, fallback flux:', bananaMsg);
        if (statusEl) statusEl.textContent = '↻ banana не выдал кадр — последний шанс Flux...';
        this.toast('Banana не выдал кадр — пробуем Flux', 'info');
        data = await startJob('flux');
        if (statusEl) statusEl.textContent = `⏳ Master fallback (${data.model || 'flux'})...`;
        return await this.pollStudioStatusSimple(data.job_id, {
          maxAttempts: 60,
          statusEl,
          label: data.model || 'flux'
        });
      }
    }
  },

  async finishMasterWorkflow(masterImageUrl, statusEl) {
    let url = String(masterImageUrl || '').trim();
    if (!url) throw new Error('Модель не вернула фото');
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      if (statusEl) statusEl.textContent = '☁️ Сохраняю новое фото...';
      url = await this.ensureHttpsPhotoUrl(url, 'studio-master.webp');
    }
    if (!/^https?:\/\//i.test(url)) throw new Error('Новое фото не сохранилось');
    const source = this.studioSourceUrl || this.studioCompare?.original || '';
    if (source && url.split('?')[0] === String(source).split('?')[0]) {
      throw new Error('Модель вернула то же фото — кадр не изменился');
    }

    this.studioMasterBackupUrl = url;
    this.studioMasterBaseUrl = url;
    this.studioMasterDataUrl = url;
    this.studioCompare.master = url;
    this.renderStudioCompare();
    this.hidePlacementEditor(true);
    this.showSignTextEditor();

    this.currentProduct.photos = [
      { id: Date.now() + '_master', url, uploaded: true, type: 'master' }
    ];
    this.renderPhotos();
    this.setStudioBusy?.(false);
    this.showSourceWorkPreview?.(masterImageUrl);
    this.syncEditorSteps?.();

    if (statusEl) statusEl.textContent = '✅ Master готов — при кривых буквах: «Исправить надпись», затем цена + состав → ИИ';
    this.toast('Master готов — одно фото в карточке', 'success');
    this.notifyMasterDone?.('ok', {
      title: 'Master готов',
      body: 'Фото обработано — можно писать состав и цену'
    });
    this.syncAIFillGate?.();
    this.saveActiveStudioDraft?.();
    this.goStep1Phase?.('c', { skipGate: true });
    // Если цена и состав уже заполнены — сразу открыть шаг 2
    if (this.canUnlockEditorStep2?.()) {
      setTimeout(() => this.goEditorStep2?.(), 300);
    }
  },

  async callCompositeMaster(imageUrl, scene, statusEl) {
    if (statusEl) statusEl.textContent = '✂️ Маска товара: удаление фона...';
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

    if (statusEl) statusEl.textContent = '⏳ Remove BG... (30–90 сек)';
    const transparentPng = await this.pollStudioStatusSimple(data.job_id, {
      maxAttempts: 40,
      statusEl,
      label: 'Remove BG'
    });

    if (statusEl) statusEl.textContent = '🖼️ Композит на эталон + маска...';
    const cutout = await this.prepareCutoutFromPng(transparentPng, { catalogGrade: true });
    const MASTER_SIZE = this.MASTER_SIZE || 2048;
    const pos = this.getProductPositioning(scene, cutout.width, cutout.height, MASTER_SIZE);
    const placement = this.clampPlacementInset({
      x: pos.drawX / MASTER_SIZE,
      y: pos.drawY / MASTER_SIZE,
      w: pos.drawWidth / MASTER_SIZE,
      h: pos.drawHeight / MASTER_SIZE
    }, this.isWallOnlyScene(scene) ? 0.07 : 0.04);

    const bgUrl = await this.ensureReferenceHttpsUrl();
    const layers = await this.composeWithBackground(cutout.dataUrl, bgUrl, scene, placement, {
      alreadyCropped: true,
      catalogCutout: true,
      returnLayers: true
    });

    // AI: only room/shadows; then force product pixels back (mask lock)
    try {
      if (statusEl) statusEl.textContent = '☁️ Загрузка композита для сшивки фона...';
      const compositeHttps = await this.ensureHttpsPhotoUrl(layers.masterDataUrl, 'studio-bg-lock.webp');
      if (statusEl) statusEl.textContent = '✨ ИИ сшивает только фон (товар зафиксирован)...';
      const enhRes = await fetch(`${this.workerUrl}/api/studio/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({
          image_url: compositeHttps,
          reference_url: bgUrl,
          scene,
          resolution: '2K',
          mode: 'bg_lock'
        })
      });
      const enhData = await enhRes.json().catch(() => ({}));
      if (!enhRes.ok || !enhData.ok || !enhData.job_id) {
        throw new Error(enhData.error || `bg_lock HTTP ${enhRes.status}`);
      }
      if (statusEl) statusEl.textContent = '⏳ Сшивка фона... (1–3 мин)';
      const aiUrl = await this.pollStudioStatusSimple(enhData.job_id, {
        maxAttempts: 70,
        statusEl,
        label: 'Сшивка фона'
      });
      if (statusEl) statusEl.textContent = '🔒 Возвращаем товар по маске...';
      return await this.lockProductOverAi(aiUrl, layers.masterDataUrl, layers.maskDataUrl);
    } catch (err) {
      console.warn('[Studio Pro] bg_lock failed, plain composite:', err);
      this.toast('ИИ не сшил фон — оставляем композит на эталоне', 'info');
      if (statusEl) statusEl.textContent = '⚠️ Без ИИ-сшивки — композит на эталоне';
      return layers.masterDataUrl;
    }
  },

  async createMasterForScene(imageUrl, scene, statusEl) {
    return await this.callRephotographMaster(imageUrl, scene, statusEl);
  },

  async retryStudioMaster() {
    const src = this.getStudioRemasterSourceUrl?.();
    if (!src) {
      this.toast('Нет исходного фото для пересоздания — загрузите фото', 'error');
      return;
    }

    this.ensureNotifyPermission?.();

    const btns = this.studioRetryButtons?.() || [];
    btns.forEach((btn) => { btn.disabled = true; });
    const statusEl = document.getElementById('studio-status');

    const keptMaster = this.studioMasterDataUrl || this.studioMasterBackupUrl || this.studioCompare?.master
      || this.currentProduct?.photos?.[0]?.url;
    this.studioMasterBackupUrl = keptMaster || this.studioMasterBackupUrl;
    // Запомнить исходник (если пересоздаём со старого Master — он станет «оригиналом» для следующих раз)
    if (!this.studioSourceUrl && !this.studioCompare?.original) {
      this.studioSourceUrl = src;
      this.studioCompare = this.studioCompare || {};
      this.studioCompare.original = src;
    }

    try {
      let scene = this.currentProduct?.scene || 'floor';
      if (!scene || scene === 'auto') scene = 'floor';
      if (statusEl) statusEl.textContent = '↻ Новый Master… предыдущий сохранён до успеха';
      this.setStudioBusy?.(true);
      this.showSourceWorkPreview?.(src);
      const masterImageUrl = await this.createMasterForScene(src, scene, statusEl);
      await this.finishMasterWorkflow(masterImageUrl, statusEl);
    } catch (err) {
      console.error('[Studio Pro] retry', err);
      this.setStudioBusy?.(false);
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
      this.notifyMasterDone?.('error', {
        title: 'Master не готов',
        body: err.message || 'Ошибка пересоздания'
      });
    } finally {
      this.setStudioBusy?.(false);
      btns.forEach((btn) => { btn.disabled = false; });
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
    const fold = document.getElementById('studio-compare-fold');
    if (fold) fold.classList.toggle('hidden', !any);
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

    this.ensureNotifyPermission?.();

    const btn = document.getElementById('process-studio-btn');
    const statusEl = document.getElementById('studio-status');
    const nextBtn = document.getElementById('step1-a-next');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Обработка...';
    }
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = 'Создаём Master…';
    }
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

      const mainPhoto = this.currentProduct.photos[0];
      const savedOriginal = this.studioSourceUrl
        || this.studioCompare?.original
        || this.currentProduct?.client_options?.studio_original_url
        || null;
      // При редактировании: если главное уже Master и есть сохранённый оригинал — переснимаем с него
      const remasterFromOriginal = !!(mainPhoto?.type === 'master' && savedOriginal && !mainPhoto.file);

      let imageUrl = remasterFromOriginal ? savedOriginal : mainPhoto.url;
      if (!remasterFromOriginal && !mainPhoto.uploaded && mainPhoto.file) {
        statusEl.textContent = '☁️ Загрузка в Cloudinary...';
        const uploadResult = await this.uploadPhoto(mainPhoto.file);
        if (!uploadResult.ok) {
          throw new Error(`Cloudinary upload failed: ${uploadResult.error}`);
        }
        imageUrl = uploadResult.url;
        mainPhoto.url = imageUrl;
        mainPhoto.uploaded = true;
      }

      this.studioSourceUrl = remasterFromOriginal ? savedOriginal : imageUrl;
      this.studioCompare.original = this.studioSourceUrl;
      this.setStudioBusy?.(true);
      this.showSourceWorkPreview?.(imageUrl);
      this.goStep1Phase?.('c', { skipGate: true });

      const masterImageUrl = await this.createMasterForScene(imageUrl, scene, statusEl);
      await this.finishMasterWorkflow(masterImageUrl, statusEl);
    } catch (error) {
      console.error('[Studio Pro] ❌', error);
      statusEl.textContent = '❌ Ошибка: ' + error.message;
      this.toast(error.message, 'error');
      this.setStudioBusy?.(false);
      this.notifyMasterDone?.('error', {
        title: 'Master не готов',
        body: error.message || 'Ошибка генерации'
      });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '✨ Создать Master';
      }
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = this.isUnitBalloonMode?.() ? 'Далее: цена →' : 'Далее: состав →';
      }
      this.setStudioBusy?.(false);
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
    const upload = typeof this.uploadPhoto === 'function' ? this.uploadPhoto.bind(this) : null;
    if (!upload) {
      throw new Error('uploadPhoto недоступен — обновите страницу (Ctrl+F5)');
    }
    const uploadResult = await upload(file);
    if (!uploadResult || !uploadResult.ok) {
      throw new Error((uploadResult && uploadResult.error) || 'Cloudinary upload failed');
    }
    return uploadResult.url;
  },

  async ensureHttpsPhotoUrl(url, filename = 'photo.webp') {
    if (!url) throw new Error('Пустой URL фото');
    if (url.startsWith('https://') || url.startsWith('http://')) return url;
    if (!window.CloudinaryUploader) {
      throw new Error('Cloudinary не загружен — обновите страницу (Ctrl+F5)');
    }
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
      this.drawSoftContactShadow(finalCtx, croppedCanvas, drawX, drawY, drawWidth, drawHeight, {
        wall: true,
        catalog: !!opts.catalogCutout
      });
    } else {
      finalCtx.drawImage(bgImg, 0, 0, MASTER_SIZE, MASTER_SIZE);
      this.drawSoftContactShadow(finalCtx, croppedCanvas, drawX, drawY, drawWidth, drawHeight, {
        wall: false,
        catalog: !!opts.catalogCutout
      });
    }

    // Hand plate composite disabled — handheld uses Manus AI rephotograph instead
    finalCtx.drawImage(croppedCanvas, drawX, drawY, drawWidth, drawHeight);

    const masterDataUrl = finalCanvas.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
    if (!opts.returnLayers) return masterDataUrl;

    // Product-only layer + soft mask (for bg_lock: AI paints room, we restore product pixels)
    const productCanvas = document.createElement('canvas');
    productCanvas.width = MASTER_SIZE;
    productCanvas.height = MASTER_SIZE;
    const pctx = productCanvas.getContext('2d');
    pctx.drawImage(croppedCanvas, drawX, drawY, drawWidth, drawHeight);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = MASTER_SIZE;
    maskCanvas.height = MASTER_SIZE;
    const mctx = maskCanvas.getContext('2d');
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, MASTER_SIZE, MASTER_SIZE);
    mctx.drawImage(productCanvas, 0, 0);
    const mdata = mctx.getImageData(0, 0, MASTER_SIZE, MASTER_SIZE);
    const md = mdata.data;
    for (let i = 0; i < md.length; i += 4) {
      const a = md[i + 3];
      md[i] = md[i + 1] = md[i + 2] = a;
      md[i + 3] = 255;
    }
    mctx.putImageData(mdata, 0, 0);
    // Feather mask ~3px so AI can own the seam
    const feather = document.createElement('canvas');
    feather.width = MASTER_SIZE;
    feather.height = MASTER_SIZE;
    const fctx = feather.getContext('2d');
    fctx.filter = 'blur(2.5px)';
    fctx.drawImage(maskCanvas, 0, 0);
    fctx.filter = 'none';
    mctx.clearRect(0, 0, MASTER_SIZE, MASTER_SIZE);
    mctx.drawImage(feather, 0, 0);

    return {
      masterDataUrl,
      productDataUrl: productCanvas.toDataURL('image/png'),
      maskDataUrl: maskCanvas.toDataURL('image/png')
    };
  },

  /**
   * AI may redraw the room; force original product pixels back via soft mask.
   * out = lerp(ai, lockedComposite, mask)
   */
  async lockProductOverAi(aiUrl, lockedCompositeUrl, maskUrl) {
    const SIZE = this.MASTER_SIZE || 2048;
    const [aiImg, lockedImg, maskImg] = await Promise.all([
      this.loadImage(aiUrl),
      this.loadImage(lockedCompositeUrl),
      this.loadImage(maskUrl)
    ]);
    const out = document.createElement('canvas');
    out.width = SIZE;
    out.height = SIZE;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(aiImg, 0, 0, SIZE, SIZE);
    const aiData = ctx.getImageData(0, 0, SIZE, SIZE);

    const lc = document.createElement('canvas');
    lc.width = SIZE;
    lc.height = SIZE;
    lc.getContext('2d').drawImage(lockedImg, 0, 0, SIZE, SIZE);
    const lockedData = lc.getContext('2d').getImageData(0, 0, SIZE, SIZE);

    const mc = document.createElement('canvas');
    mc.width = SIZE;
    mc.height = SIZE;
    mc.getContext('2d').drawImage(maskImg, 0, 0, SIZE, SIZE);
    const maskData = mc.getContext('2d').getImageData(0, 0, SIZE, SIZE);

    const a = aiData.data;
    const l = lockedData.data;
    const m = maskData.data;
    for (let i = 0; i < a.length; i += 4) {
      const t = m[i] / 255; // white = keep locked product
      if (t <= 0.02) continue;
      if (t >= 0.98) {
        a[i] = l[i];
        a[i + 1] = l[i + 1];
        a[i + 2] = l[i + 2];
        a[i + 3] = 255;
        continue;
      }
      a[i] = Math.round(a[i] * (1 - t) + l[i] * t);
      a[i + 1] = Math.round(a[i + 1] * (1 - t) + l[i + 1] * t);
      a[i + 2] = Math.round(a[i + 2] * (1 - t) + l[i + 2] * t);
      a[i + 3] = 255;
    }
    ctx.putImageData(aiData, 0, 0);
    return out.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
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
    const editor = document.getElementById('sign-text-editor');
    if (!editor) return;
    editor.classList.remove('hidden');
    editor.open = false; // свёрнут — открывается кликом по заголовку
  },

  collapseSignTextEditor() {
    const editor = document.getElementById('sign-text-editor');
    if (editor) editor.open = false;
  },

  hideSignTextEditor() {
    const editor = document.getElementById('sign-text-editor');
    if (editor) {
      editor.classList.add('hidden');
      editor.open = false;
    }
    this._signDrag = null;
  },

  /**
   * Авто: detect → кроп звезды → gpt in-place на кропе → вклейка в ПОЛНЫЙ Master.
   * Кроп никогда не становится Master целиком.
   */
  async fixBalloonInscription(opts = {}) {
    const masterUrl = opts.masterUrl || this.studioMasterDataUrl || this.studioCompare?.master || this.studioMasterBackupUrl;
    if (!masterUrl) {
      this.toast('Сначала создайте Master', 'error');
      return;
    }
    // Снимок полной фигуры — только в него вклеиваем; кроп сам по себе не коммитим
    const masterBase = masterUrl;

    const ta = document.getElementById('sign-text-exact');
    const exact = String(opts.exact != null ? opts.exact : (ta?.value || '')).replace(/\r\n/g, '\n').trim();
    if (!exact) {
      this.toast('Впишите правильный текст надписи', 'error');
      if (!opts.skipCommit) ta?.focus();
      return;
    }

    const lines = exact.split('\n').map((l) => l.trim()).filter(Boolean);
    const btn = opts.skipCommit ? null : document.getElementById('sign-text-apply-btn');
    const statusEl = opts.statusEl || document.getElementById('studio-status');
    if (btn) btn.disabled = true;

    const startFixCrop = async (imageUrl, prefer) => {
      const res = await fetch(`${this.workerUrl}/api/studio/sign-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({
          image_url: imageUrl,
          text: exact,
          line1: lines[0] || '',
          line2: lines[1] || '',
          line3: lines[2] || '',
          mode: 'fix',
          resolution: '2K',
          prefer
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.job_id) {
        throw new Error(data.error || `Sign-fix HTTP ${res.status}`);
      }
      return data;
    };

    const runFixCrop = async (imageUrl) => {
      try {
        if (statusEl) statusEl.textContent = '✏️ 3/4 Правлю буквы на кропе (gpt, in-place)…';
        const data = await startFixCrop(imageUrl, 'quality');
        return await this.pollStudioStatusSimple(data.job_id, {
          maxAttempts: 100,
          statusEl,
          label: `кроп ${data.model || 'gpt'}`
        });
      } catch (firstErr) {
        const msg = String(firstErr?.message || firstErr || '');
        if (!/таймаут|timeout|failed|отклонила|Status check/i.test(msg)) throw firstErr;
        if (statusEl) statusEl.textContent = '↻ Кроп: banana…';
        this.toast('gpt на кропе не успел — banana', 'info');
        const data = await startFixCrop(imageUrl, 'banana');
        return await this.pollStudioStatusSimple(data.job_id, {
          maxAttempts: 100,
          statusEl,
          label: `кроп ${data.model || 'banana'}`
        });
      }
    };

    try {
      if (statusEl) statusEl.textContent = '☁️ Загрузка Master…';
      const httpsMaster = await this.ensureHttpsPhotoUrl(masterBase, 'studio-sign-src.webp');

      if (statusEl) statusEl.textContent = '🔎 1/4 Ищу звезду / надпись…';
      const detRes = await fetch(`${this.workerUrl}/api/studio/sign-detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ image_url: httpsMaster })
      });
      const det = await detRes.json().catch(() => ({}));
      if (!detRes.ok || !det.ok || !det.region) {
        throw new Error(det.error || 'Не удалось найти область надписи');
      }
      let region = { ...det.region };
      // Защита: область не больше ~36% кадра
      if (region.w > 0.42 || region.h > 0.42) {
        const cx = region.x + region.w / 2;
        const cy = region.y + region.h / 2;
        region.w = Math.min(region.w, 0.36);
        region.h = Math.min(region.h, 0.36);
        region.x = Math.max(0, Math.min(1 - region.w, cx - region.w / 2));
        region.y = Math.max(0, Math.min(1 - region.h, cy - region.h / 2));
      }
      console.log('[SignText] region', region, det.surface);

      if (statusEl) statusEl.textContent = '✂️ 2/4 Кроп и увеличение…';
      const crop = await this.cropSignRegion(masterBase, region, { pad: 0.12, targetMin: 1024 });
      if (crop.sw / (await this._imageSize(masterBase)).w > 0.55) {
        throw new Error('Область надписи слишком большая — пересоздайте Master и попробуйте снова');
      }
      const cropHttps = await this.ensureHttpsPhotoUrl(crop.dataUrl, 'studio-sign-crop.webp');

      let fixedCrop = await runFixCrop(cropHttps);

      // Если модель «пересняла» звезду на бежевом — не вклеиваем, пробуем banana ещё раз или стоп
      if (await this.signCropLooksRecomposed(crop.dataUrl, fixedCrop)) {
        console.warn('[SignText] recomposed crop from gpt — retry banana');
        if (statusEl) statusEl.textContent = '↻ Модель пересняла кроп — повтор banana…';
        const data = await startFixCrop(cropHttps, 'banana');
        fixedCrop = await this.pollStudioStatusSimple(data.job_id, {
          maxAttempts: 100,
          statusEl,
          label: 'кроп banana'
        });
        if (await this.signCropLooksRecomposed(crop.dataUrl, fixedCrop)) {
          throw new Error('Модель снова пересняла звезду вместо правки букв. Пересоздайте Master и попробуйте ещё раз.');
        }
      }

      if (statusEl) statusEl.textContent = '📎 4/4 Вклеиваю в полный Master…';
      const merged = await this.pasteSignCrop(masterBase, fixedCrop, crop.sx, crop.sy, crop.sw, crop.sh, { feather: true });

      const baseSize = await this._imageSize(masterBase);
      const mergedSize = await this._imageSize(merged);
      if (mergedSize.w !== baseSize.w || mergedSize.h !== baseSize.h) {
        throw new Error('Сбой вклейки: размер Master изменился');
      }

      if (opts.skipCommit) {
        if (statusEl) statusEl.textContent = '✅ Надпись вклеена';
        this.toast('Надпись обновлена', 'success');
        return merged;
      }

      this.commitMasterImage(merged, '✅ Надпись вклеена в полную фигуру — проверьте Master');
      this.showSignTextEditor();
      this.toast('Надпись обновлена', 'success');
    } catch (err) {
      console.error('[SignText]', err);
      if (statusEl) statusEl.textContent = '❌ Надпись: ' + (err.message || err);
      this.toast('Не удалось исправить надпись: ' + (err.message || err), 'error');
      if (opts.skipCommit) throw err;
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async _imageSize(src) {
    const img = await this.loadImage(src);
    return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  },

  /** Эвристика: углы стали плоским бежевым студийным фоном, а в исходном кропе были пёстрые. */
  async signCropLooksRecomposed(originalCropSrc, fixedCropSrc) {
    const sampleCorners = async (src) => {
      const img = await this.loadImage(src);
      const W = img.naturalWidth || img.width;
      const H = img.naturalHeight || img.height;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pts = [
        [2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3],
        [Math.floor(W / 2), 2], [Math.floor(W / 2), H - 3]
      ];
      return pts.map(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      });
    };

    const variance = (cols) => {
      const mean = cols.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
        .map((v) => v / cols.length);
      let s = 0;
      for (const p of cols) {
        s += (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2 + (p[2] - mean[2]) ** 2;
      }
      return s / cols.length;
    };

    const isFlatBeige = (cols) => {
      const mean = cols.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
        .map((v) => v / cols.length);
      // тёплый светлый беж студии
      const beige = mean[0] > 170 && mean[1] > 160 && mean[2] > 140
        && Math.abs(mean[0] - mean[1]) < 35;
      return beige && variance(cols) < 180;
    };

    try {
      const before = await sampleCorners(originalCropSrc);
      const after = await sampleCorners(fixedCropSrc);
      const beforeVar = variance(before);
      const afterFlat = isFlatBeige(after);
      // Исходный кроп был «живым», результат — плоская студия по краям → пересъёмка
      if (beforeVar > 400 && afterFlat) return true;
      // Или сильно упала пестрота углов
      if (beforeVar > 500 && variance(after) < beforeVar * 0.15) return true;
      return false;
    } catch (e) {
      console.warn('[SignText] recomposed check failed', e);
      return false;
    }
  },

  /** Вырезать область надписи и увеличить для ИИ (буквы крупнее → меньше каши). */
  async cropSignRegion(src, region, opts = {}) {
    const pad = Number(opts.pad) || 0.15;
    const targetMin = Number(opts.targetMin) || 1024;
    const img = await this.loadImage(src);
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;

    let bw = Math.max(8, (Number(region.w) || 0.2) * W);
    let bh = Math.max(8, (Number(region.h) || 0.2) * H);
    let bx = Math.max(0, (Number(region.x) || 0) * W);
    let by = Math.max(0, (Number(region.y) || 0) * H);

    const px = bw * pad;
    const py = bh * pad;
    bx = Math.max(0, bx - px);
    by = Math.max(0, by - py);
    bw = Math.min(W - bx, bw + px * 2);
    bh = Math.min(H - by, bh + py * 2);

    const scale = Math.max(1, targetMin / Math.max(bw, bh));
    const outW = Math.max(64, Math.round(bw * scale));
    const outH = Math.max(64, Math.round(bh * scale));
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, bx, by, bw, bh, 0, 0, outW, outH);

    return {
      dataUrl: c.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0),
      sx: bx,
      sy: by,
      sw: bw,
      sh: bh,
      outW,
      outH
    };
  },

  /** Вклеить исправленный кроп обратно в Master в исходные координаты (с лёгким feather). */
  async pasteSignCrop(baseSrc, cropSrc, sx, sy, sw, sh, opts = {}) {
    const base = await this.loadImage(baseSrc);
    const crop = await this.loadImage(cropSrc);
    const W = base.naturalWidth || base.width;
    const H = base.naturalHeight || base.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const cw = crop.naturalWidth || crop.width;
    const ch = crop.naturalHeight || crop.height;
    const dw = Math.max(1, Math.round(sw));
    const dh = Math.max(1, Math.round(sh));
    const dx = Math.round(sx);
    const dy = Math.round(sy);

    if (opts.feather === false) {
      ctx.drawImage(crop, 0, 0, cw, ch, dx, dy, dw, dh);
      return c.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
    }

    const tmp = document.createElement('canvas');
    tmp.width = dw;
    tmp.height = dh;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(crop, 0, 0, cw, ch, 0, 0, dw, dh);

    const fade = Math.max(2, Math.round(Math.min(dw, dh) * 0.05));
    const mask = document.createElement('canvas');
    mask.width = dw;
    mask.height = dh;
    const mctx = mask.getContext('2d');
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, dw, dh);
    mctx.globalCompositeOperation = 'destination-out';
    let g = mctx.createLinearGradient(0, 0, fade, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, fade, dh);
    g = mctx.createLinearGradient(dw, 0, dw - fade, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g;
    mctx.fillRect(dw - fade, 0, fade, dh);
    g = mctx.createLinearGradient(0, 0, 0, fade);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, dw, fade);
    g = mctx.createLinearGradient(0, dh, 0, dh - fade);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g;
    mctx.fillRect(0, dh - fade, dw, fade);

    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(mask, 0, 0);
    ctx.drawImage(tmp, dx, dy);

    return c.toDataURL('image/webp', this.WEBP_QUALITY ?? 1.0);
  },

  commitMasterImage(dataUrl, statusMsg) {
    this.studioMasterDataUrl = dataUrl;
    this.studioMasterBackupUrl = dataUrl;
    this.studioMasterBaseUrl = dataUrl;
    this.studioCompare.master = dataUrl;
    this.renderStudioCompare();
    this.currentProduct.photos = [
      { id: Date.now() + '_master', url: dataUrl, uploaded: false, type: 'master' }
    ];
    this.renderPhotos();
    const studioStatus = document.getElementById('studio-status');
    if (studioStatus) studioStatus.textContent = statusMsg;
    this.syncAIFillGate?.();
    this.saveActiveStudioDraft?.();
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
