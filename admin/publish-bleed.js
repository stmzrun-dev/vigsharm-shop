// Кадры в край: посты заполняют 4:5, сторис — ширину, низ под текст цветом стены.
(function () {
  const app = window.app;
  if (!app || app._publishFrameSet === 5) return;

  function sampleWall(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const spots = [[0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]];
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [fx, fy] of spots) {
      const x = Math.min(img.width - 1, Math.max(0, Math.round(fx * (img.width - 1))));
      const y = Math.min(img.height - 1, Math.max(0, Math.round(fy * (img.height - 1))));
      ctx.drawImage(img, x, y, 1, 1, 0, 0, 1, 1);
      const p = ctx.getImageData(0, 0, 1, 1).data;
      r += p[0];
      g += p[1];
      b += p[2];
    }
    const n = spots.length;
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  }

  function clampWindow(x, y, w, h) {
    if (w > 1) w = 1;
    if (h > 1) h = 1;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > 1) x = 1 - w;
    if (y + h > 1) y = 1 - h;
    return { x, y, w, h };
  }

  function drawCoverWindow(ctx, img, tw, th, box) {
    const target = tw / th;
    let x = box.x;
    let y = box.y;
    let w = box.w;
    let h = box.h;
    if (w / h > target) {
      const nw = h * target;
      x += (w - nw) * (box.anchorX ?? 0.5);
      w = nw;
    } else {
      const nh = w / target;
      y += (h - nh) * (box.anchorY ?? 0.5);
      h = nh;
    }
    const win = clampWindow(x, y, w, h);
    ctx.drawImage(
      img,
      win.x * img.width, win.y * img.height, win.w * img.width, win.h * img.height,
      0, 0, tw, th
    );
  }

  function drawFullWidthTop(ctx, img, tw, th, region, maxH, zoom) {
    const x0 = region?.x0 ?? 0;
    const y0 = region?.y0 ?? 0;
    const x1 = region?.x1 ?? 1;
    const y1 = region?.y1 ?? 1;
    let sw = Math.max(1, (x1 - x0) * img.width);
    let sh = Math.max(1, (y1 - y0) * img.height);
    const sx = x0 * img.width;
    const sy = y0 * img.height;
    const dw = tw * (zoom || 1);
    let dh = dw * (sh / sw);
    const limit = th * maxH;
    if (dh > limit) {
      sh *= limit / dh;
      dh = limit;
    }
    ctx.drawImage(img, sx, sy, sw, sh, (tw - dw) / 2, 0, dw, dh);
  }

  app.renderPublishFrame = function (srcImg, bgImg, tw, th, spec) {
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = spec.wall || sampleWall(srcImg);
    ctx.fillRect(0, 0, tw, th);
    if (spec.coverBox) {
      drawCoverWindow(ctx, srcImg, tw, th, spec.coverBox);
    } else {
      drawFullWidthTop(ctx, srcImg, tw, th, spec.region, spec.maxH ?? 0.7, spec.zoom || 1);
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
      const wall = sampleWall(srcImg);
      const posts = [
        { file: 'post-01-full.jpg', label: 'Пост · весь кадр', wall, coverBox: { x: 0, y: 0, w: 1, h: 1, anchorX: 0.42 } },
        { file: 'post-02-top.jpg', label: 'Пост · верх', wall, coverBox: { x: 0, y: 0, w: 1, h: 0.78, anchorX: 0.46, anchorY: 0 } },
        { file: 'post-03-bottom.jpg', label: 'Пост · низ', wall, coverBox: { x: 0.08, y: 0.34, w: 0.84, h: 0.66, anchorX: 0.5, anchorY: 1 } }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(srcImg, null, 1080, 1350, spec)
      }));
      const stories = [
        { file: 'story-01-full.jpg', label: 'Сторис · сцена', wall, maxH: 0.7, zoom: 1 },
        { file: 'story-02-top.jpg', label: 'Сторис · верх', wall, region: { x0: 0, y0: 0, x1: 1, y1: 0.62 }, maxH: 0.52, zoom: 1 },
        { file: 'story-03-close.jpg', label: 'Сторис · крупно', wall, maxH: 0.8, zoom: 1.35 }
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

  app._publishFrameSet = 5;
})();
