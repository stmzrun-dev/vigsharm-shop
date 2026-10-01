// Кеш ещё с размытым фоном. Эта сборка кладёт фото в край кадра на ровный фон.
(function () {
  const app = window.app;
  if (!app || app._publishFrameSet === 3) return;

  app.renderPublishFrame = function (srcImg, bgImg, tw, th, spec) {
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ebe4da';
    ctx.fillRect(0, 0, tw, th);

    if (spec.cover) {
      const region = spec.region || { x0: 0, y0: 0, x1: 1, y1: 1 };
      const sx = srcImg.width * (region.x0 ?? 0);
      const sy = srcImg.height * (region.y0 ?? 0);
      const sw = Math.max(1, srcImg.width * ((region.x1 ?? 1) - (region.x0 ?? 0)));
      const sh = Math.max(1, srcImg.height * ((region.y1 ?? 1) - (region.y0 ?? 0)));
      const dh = th * (spec.maxH ?? 0.7);
      const dw = dh * (sw / sh);
      ctx.drawImage(srcImg, sx, sy, sw, sh, (tw - dw) / 2, th * (spec.top ?? 0), dw, dh);
    } else if (spec.contain || spec.story) {
      if (!spec.flat && this.blurPublishBehind) this.blurPublishBehind(ctx, srcImg, tw, th);
      this.drawRegionContain(
        ctx, srcImg, tw, th, spec.region,
        !!(spec.story || spec.alignTop), spec.top, spec.maxH, spec.padX
      );
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
        { file: 'post-01-full.jpg', label: 'Пост · весь кадр', contain: true, flat: true, maxH: 1, padX: 0 },
        { file: 'post-02-top.jpg', label: 'Пост · верх', contain: true, flat: true, alignTop: true, top: 0, region: { x0: 0, y0: 0, x1: 1, y1: 0.62 }, maxH: 0.74, padX: 0 },
        { file: 'post-03-bottom.jpg', label: 'Пост · низ', contain: true, flat: true, region: { x0: 0, y0: 0.4, x1: 1, y1: 1 }, maxH: 0.8, padX: 0 }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, null, 1080, 1350, spec)
      }));
      const stories = [
        { file: 'story-01-full.jpg', label: 'Сторис · сцена', story: true, flat: true, top: 0, maxH: 0.58, padX: 0 },
        { file: 'story-02-top.jpg', label: 'Сторис · верх', story: true, flat: true, region: { x0: 0, y0: 0, x1: 1, y1: 0.62 }, top: 0, maxH: 0.4, padX: 0 },
        { file: 'story-03-close.jpg', label: 'Сторис · крупно', story: true, flat: true, cover: true, top: 0, maxH: 0.7, padX: 0 }
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

  app._publishFrameSet = 3;
})();
