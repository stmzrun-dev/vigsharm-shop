// Старый кеш admin-publish-key.js режет кадры зумом. Здесь та же сборка, что в новом файле.
(function () {
  const app = window.app;
  if (!app || app._publishFrameSet >= 2) return;

  app.drawRegionContain = function (ctx, img, tw, th, region, alignTop, topFrac, maxHFrac, padXFrac) {
    const x0 = region?.x0 ?? 0;
    const y0 = region?.y0 ?? 0;
    const x1 = region?.x1 ?? 1;
    const y1 = region?.y1 ?? 1;
    const sx = img.width * x0;
    const sy = img.height * y0;
    const sw = Math.max(1, img.width * (x1 - x0));
    const sh = Math.max(1, img.height * (y1 - y0));
    const pad = tw * (padXFrac ?? 0.04);
    const maxW = tw - pad * 2;
    const maxH = th * (maxHFrac ?? 0.92);
    const ir = sw / sh;
    let dw = maxW;
    let dh = dw / ir;
    if (dh > maxH) {
      dh = maxH;
      dw = dh * ir;
    }
    const dx = (tw - dw) / 2;
    const dy = alignTop ? th * (topFrac ?? 0.04) : (th - dh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  app.blurPublishBehind = function (ctx, srcImg, tw, th) {
    ctx.save();
    ctx.filter = 'blur(28px)';
    this.drawCoverCrop(ctx, srcImg, tw, th, 1.2, 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(232, 228, 220, 0.3)';
    ctx.fillRect(0, 0, tw, th);
  };

  app.renderPublishFrame = function (srcImg, bgImg, tw, th, spec) {
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(0, 0, tw, th);
    if (spec.contain || spec.story) {
      this.blurPublishBehind(ctx, srcImg, tw, th);
      this.drawRegionContain(ctx, srcImg, tw, th, spec.region, !!spec.story, spec.top, spec.maxH, spec.padX);
    } else if (spec.onBg && bgImg) {
      this.drawCoverCrop(ctx, bgImg, tw, th, 1, 0, 0);
      this.drawRegionContain(ctx, srcImg, tw, th, spec.region, false, spec.top, spec.maxH, spec.padX);
    } else {
      this.drawCoverCrop(ctx, srcImg, tw, th, spec.zoom, spec.ox, spec.oy);
    }
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  app.buildPublishPack = async function () {
    if (!this.publishMasterUrl) {
      this.toast?.('Сначала создайте Master', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    this.setPublishBusy(true);
    if (status) status.textContent = 'Собираем кадры из Master…';
    try {
      const srcImg = await this.loadPublishImage(this.publishMasterUrl);
      const posts = [
        { file: 'post-01-full.jpg', label: 'Пост · весь кадр', contain: true, maxH: 0.92 },
        { file: 'post-02-top.jpg', label: 'Пост · верх', contain: true, region: { x0: 0, y0: 0, x1: 1, y1: 0.68 }, maxH: 0.9 },
        { file: 'post-03-bottom.jpg', label: 'Пост · низ', contain: true, region: { x0: 0.12, y0: 0.42, x1: 1, y1: 1 }, maxH: 0.9 }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, null, 1080, 1350, spec)
      }));
      const stories = [
        { file: 'story-01-full.jpg', label: 'Сторис · сцена', story: true, top: 0.035, maxH: 0.46, padX: 0.05 },
        { file: 'story-02-top.jpg', label: 'Сторис · верх', story: true, region: { x0: 0, y0: 0, x1: 1, y1: 0.68 }, top: 0.03, maxH: 0.38, padX: 0.08 },
        { file: 'story-03-close.jpg', label: 'Сторис · крупно', story: true, top: 0.02, maxH: 0.56, padX: 0.02 }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, null, 1080, 1920, spec)
      }));
      const captions = this.buildPublishCaptions();
      this.publishPack = { posts, stories, captions };
      this.renderPublishThumbs(this.publishPack);
      if (status) status.textContent = 'Готово: 3 поста и 3 сторис с Master. Можно скачать ZIP.';
      this.toast?.('Пачка собрана', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось собрать пачку', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      this.setPublishBusy(false);
    }
  };
})();
