// Пост 4:5 и сторис 9:16 снимаются отдельно, одной моделью. Кропы — с этих кадров.
(function () {
  const app = window.app;
  if (!app || app._publishFrameSet === 7) return;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function sampleWall(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const spots = [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97]];
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
    return `rgb(${Math.round(r / 4)},${Math.round(g / 4)},${Math.round(b / 4)})`;
  }

  function balloonMask(img) {
    const w = 180;
    const h = Math.max(1, Math.round(img.height * (w / img.width)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const spots = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]];
    let wr = 0;
    let wg = 0;
    let wb = 0;
    for (const [x, y] of spots) {
      const i = (y * w + x) * 4;
      wr += data[i];
      wg += data[i + 1];
      wb += data[i + 2];
    }
    wr /= 4;
    wg /= 4;
    wb /= 4;
    const mask = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
      const dr = data[i] - wr;
      const dg = data[i + 1] - wg;
      const db = data[i + 2] - wb;
      mask[p] = (dr * dr + dg * dg + db * db) > 40 * 40 ? 1 : 0;
    }
    const seen = new Uint8Array(w * h);
    const qx = new Int16Array(w * h);
    const qy = new Int16Array(w * h);
    const comps = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const start = y * w + x;
        if (!mask[start] || seen[start]) continue;
        let head = 0;
        let tail = 0;
        qx[tail] = x;
        qy[tail] = y;
        tail++;
        seen[start] = 1;
        let minX = x;
        let minY = y;
        let maxX = x;
        let maxY = y;
        let count = 0;
        while (head < tail) {
          const cx = qx[head];
          const cy = qy[head];
          head++;
          count++;
          if (cx < minX) minX = cx;
          if (cy < minY) minY = cy;
          if (cx > maxX) maxX = cx;
          if (cy > maxY) maxY = cy;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const ni = ny * w + nx;
              if (!mask[ni] || seen[ni]) continue;
              seen[ni] = 1;
              qx[tail] = nx;
              qy[tail] = ny;
              tail++;
            }
          }
        }
        if (count < 24) continue;
        comps.push({ minX, minY, maxX, maxY, count, cy: (minY + maxY) / 2, h: maxY - minY + 1 });
      }
    }
    if (!comps.length) return null;
    const content = comps.reduce((box, comp) => ({
      minX: Math.min(box.minX, comp.minX),
      minY: Math.min(box.minY, comp.minY),
      maxX: Math.max(box.maxX, comp.maxX),
      maxY: Math.max(box.maxY, comp.maxY)
    }), { minX: w, minY: h, maxX: -1, maxY: -1 });
    return { w, h, comps, content };
  }

  function toImageBox(box, found, img) {
    const sx = img.width / found.w;
    const sy = img.height / found.h;
    return {
      minX: box.minX * sx,
      minY: box.minY * sy,
      maxX: (box.maxX + 1) * sx,
      maxY: (box.maxY + 1) * sy
    };
  }

  function unionBox(list) {
    return list.reduce((box, comp) => ({
      minX: Math.min(box.minX, comp.minX),
      minY: Math.min(box.minY, comp.minY),
      maxX: Math.max(box.maxX, comp.maxX),
      maxY: Math.max(box.maxY, comp.maxY)
    }), { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 });
  }

  function largestWindow(must, avoid, aspect, imgW, imgH, pad) {
    const mx0 = Math.max(0, must.minX - pad);
    const my0 = Math.max(0, must.minY - pad);
    const mx1 = Math.min(imgW, must.maxX + pad);
    const my1 = Math.min(imgH, must.maxY + pad);
    const minW = Math.max(1, mx1 - mx0);
    const minH = Math.max(1, my1 - my0);
    let y0 = 0;
    let y1 = imgH;
    if (avoid && avoid.maxY <= my0 + 2) y0 = Math.min(imgH, avoid.maxY);
    if (avoid && avoid.minY >= my1 - 2) y1 = Math.max(0, avoid.minY);
    let h = Math.min(y1 - y0, imgW / aspect);
    let w = h * aspect;
    if (w < minW) {
      w = Math.min(imgW, minW);
      h = w / aspect;
    }
    if (h < minH) {
      h = minH;
      w = Math.min(imgW, h * aspect);
    }
    if (y0 + h > y1) h = Math.max(minH, y1 - y0);
    let x = mx0 - (w - minW) / 2;
    if (x < 0) x = 0;
    if (x + w > imgW) x = Math.max(0, imgW - w);
    if (x > mx0) x = mx0;
    if (x + w < mx1) x = Math.max(0, mx1 - w);
    let y = my0 - (h - minH) * 0.25;
    if (y < y0) y = y0;
    if (y + h > y1) y = Math.max(y0, y1 - h);
    if (y > my0) y = my0;
    if (y + h < my1) y = Math.max(0, my1 - h);
    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: Math.max(1, Math.min(imgW, w)),
      h: Math.max(1, Math.min(imgH, h))
    };
  }

  app.publishCropPlan = function (img) {
    const found = balloonMask(img);
    const full = { x: 0, y: 0, w: img.width, h: img.height };
    if (!found) return { full, top: full, bottom: full, content: full };
    const contentH = found.content.maxY - found.content.minY + 1;
    const mid = (found.content.minY + found.content.maxY) / 2;
    const upper = found.comps.filter((comp) => comp.cy < mid && comp.h < contentH * 0.55);
    const lower = found.comps.filter((comp) => comp.cy >= mid && comp.h < contentH * 0.55);
    const topMust = toImageBox(upper.length ? unionBox(upper) : found.content, found, img);
    const bottomMust = toImageBox(lower.length ? unionBox(lower) : found.content, found, img);
    const topAvoid = lower.length ? toImageBox(unionBox(lower), found, img) : null;
    const bottomAvoid = upper.length ? toImageBox(unionBox(upper), found, img) : null;
    const pad = Math.min(img.width, img.height) * 0.03;
    const content = toImageBox(found.content, found, img);
    return {
      full,
      top: largestWindow(topMust, topAvoid, 4 / 5, img.width, img.height, pad),
      bottom: largestWindow(bottomMust, bottomAvoid, 4 / 5, img.width, img.height, pad),
      content: {
        x: Math.max(0, content.minX - pad),
        y: Math.max(0, content.minY - pad),
        w: Math.min(img.width, (content.maxX - content.minX) + pad * 2),
        h: Math.min(img.height, (content.maxY - content.minY) + pad * 2)
      }
    };
  };

  function paintWall(ctx, img, tw, th) {
    ctx.fillStyle = sampleWall(img);
    ctx.fillRect(0, 0, tw, th);
  }

  function drawContain(ctx, img, tw, th, alignTop, rect) {
    const sx = rect ? rect.x : 0;
    const sy = rect ? rect.y : 0;
    const sw = rect ? rect.w : img.width;
    const sh = rect ? rect.h : img.height;
    const scale = Math.min(tw / sw, th / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(img, sx, sy, sw, sh, (tw - dw) / 2, alignTop ? 0 : (th - dh) / 2, dw, dh);
  }

  function drawStoryCrop(ctx, img, tw, th, rect, maxH) {
    const maxDH = th * maxH;
    let dw = tw;
    let dh = dw * (rect.h / rect.w);
    if (dh > maxDH) {
      dh = maxDH;
      dw = dh * (rect.w / rect.h);
    }
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, (tw - dw) / 2, 0, dw, dh);
  }

  app.renderPublishFrame = function (srcImg, bgImg, tw, th, spec) {
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    paintWall(ctx, srcImg, tw, th);
    const plan = spec.plan || this.publishCropPlan(srcImg);
    if (spec.mode === 'story-closer') drawStoryCrop(ctx, srcImg, tw, th, plan.content, 0.72);
    else if (spec.mode === 'story-top') drawStoryCrop(ctx, srcImg, tw, th, plan.top, 0.58);
    else if (spec.mode === 'story') drawContain(ctx, srcImg, tw, th, true);
    else if (spec.mode === 'top') drawContain(ctx, srcImg, tw, th, false, plan.top);
    else if (spec.mode === 'bottom') drawContain(ctx, srcImg, tw, th, false, plan.bottom);
    else drawContain(ctx, srcImg, tw, th, false);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  app.pollPublishJob = async function (jobId, statusEl, label) {
    let netFails = 0;
    for (let i = 0; i < 80; i++) {
      await sleep(3000);
      if (statusEl && i % 4 === 0) {
        const min = Math.round((i * 3) / 60 * 10) / 10;
        statusEl.textContent = `⏳ ${label}… (~${min} мин)`;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      let res;
      try {
        res = await fetch(`${this.workerUrl}/api/studio/status/${jobId}`, {
          headers: this.authHeaders(),
          signal: ctrl.signal
        });
        netFails = 0;
      } catch (err) {
        netFails++;
        if (netFails >= 4) throw new Error('Проверка статуса зависла. Обновите страницу и снимите кадр ещё раз.');
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 503 || res.status === 502 || res.status === 504) {
        netFails++;
        if (netFails >= 4) throw new Error('Сервер не ответил. Обновите страницу и снимите кадр ещё раз.');
        continue;
      }
      if (!res.ok) throw new Error(`Проверка статуса: ${res.status}`);
      const data = await res.json();
      if (!data.ok && data.status !== 'failed') throw new Error(data.error || 'Ошибка проверки статуса');
      if (data.status === 'done' && data.result_url) return data.result_url;
      if (data.status === 'failed') throw new Error(data.error || 'Модель не выдала кадр');
    }
    throw new Error('Модель не ответила за 4 минуты');
  };

  app.shootPublishFrame = async function (imageUrl, scene, frame, statusEl) {
    const keepBg = scene === 'arch';
    const referenceUrl = keepBg ? '' : await this.ensureReferenceHttpsUrl(scene);
    const aspect = frame === 'story' ? '9:16' : '4:5';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    let data;
    try {
      const res = await fetch(`${this.workerUrl}/api/studio/rephotograph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        signal: ctrl.signal,
        body: JSON.stringify({
          image_url: imageUrl,
          ...(keepBg ? {} : { reference_url: referenceUrl }),
          scene,
          unit_type: scene === 'unit_balloon' ? (this.getUnitBalloonType?.() || '') : '',
          bouquet_type: scene === 'handheld_bouquet' ? (this.getBouquetType?.() || '') : '',
          surprise_pose: scene === 'surprise' ? (this.getSurprisePose?.() || 'stand') : '',
          photozone_type: scene === 'photozone' ? (this.getPhotozoneType?.() || 'frame') : undefined,
          resolution: '2K',
          prefer: 'banana',
          aspect_ratio: aspect,
          frame
        })
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.job_id) {
        throw new Error(data.error || `Съёмка не стартовала (${res.status})`);
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error('Запрос съёмки завис. Обновите страницу и попробуйте ещё раз.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const label = frame === 'story' ? 'Сторис 9:16' : 'Пост 4:5';
    if (statusEl) statusEl.textContent = `⏳ ${label}…`;
    return this.pollPublishJob(data.job_id, statusEl, label);
  };

  app.createPublishMaster = async function () {
    if (!this.publishSource?.file && !this.publishSource?.url) {
      this.toast?.('Сначала загрузите фото', 'error');
      return;
    }
    if (!this.workerUrl) {
      this.toast?.('Укажите Worker API URL в Настройках', 'error');
      return;
    }
    if (!this.adminApiKey) {
      this.toast?.('Укажите ключ админки в Настройках', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    const masterBtn = document.getElementById('publish-master-btn');
    this.setPublishBusy(true);
    if (masterBtn) masterBtn.innerHTML = '<span class="spinner"></span> Master…';
    try {
      let imageUrl = this.publishSource.httpsUrl;
      if (!imageUrl) {
        if (status) status.textContent = 'Загрузка фото…';
        const file = this.publishSource.file;
        if (!file) throw new Error('Нет файла для загрузки');
        const uploadResult = await this.uploadPhoto(file);
        if (!uploadResult?.ok) throw new Error(uploadResult?.error || 'Фото не загрузилось');
        imageUrl = uploadResult.url;
        this.publishSource.httpsUrl = imageUrl;
      }
      const scene = this.getPublishScene();
      if (status) status.textContent = 'Снимаем пост 4:5: вся связка целиком…';
      let postUrl = String(await this.shootPublishFrame(imageUrl, scene, 'post', status) || '').trim();
      if (!postUrl) throw new Error('Модель не вернула пост');
      if (this.samePublishPhoto(postUrl, imageUrl)) {
        throw new Error('Модель вернула то же фото — кадр не изменился');
      }
      await this.showPublishPreview(postUrl, 'Пост');
      this.publishMasterUrl = postUrl;
      this.publishStoryUrl = null;
      this.publishPack = null;

      const sign = (document.getElementById('publish-sign-text')?.value || '').trim();
      if (sign) {
        if (status) status.textContent = 'Правлю надпись на посте…';
        try {
          const fixed = await this.fixBalloonInscription({
            masterUrl: postUrl,
            exact: sign,
            statusEl: status,
            skipCommit: true
          });
          if (fixed && !this.samePublishPhoto(fixed, postUrl)) {
            await this.showPublishPreview(fixed, 'Пост');
            this.publishMasterUrl = fixed;
            postUrl = fixed;
          }
        } catch (err) {
          console.warn(err);
        }
      }

      if (status) status.textContent = 'Пост готов. Снимаем сторис 9:16…';
      const storyUrl = String(await this.shootPublishFrame(imageUrl, scene, 'story', status) || '').trim();
      if (!storyUrl || this.samePublishPhoto(storyUrl, imageUrl)) {
        throw new Error('Сторис не получился. Пост уже есть — можно собрать пачку из него.');
      }
      this.publishStoryUrl = storyUrl;
      if (status) status.textContent = 'Пост и сторис готовы. Нажмите «Собрать пачку» — кропы появятся сразу.';
      this.toast?.('Кадры готовы', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось снять кадры', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      if (masterBtn) masterBtn.textContent = 'Создать Master';
      this.setPublishBusy(false);
    }
  };

  app.buildPublishPack = async function () {
    if (!this.publishMasterUrl) {
      this.toast?.('Сначала создайте Master', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    this.setPublishBusy(true);
    if (status) status.textContent = 'Собираем кропы…';
    try {
      const postImg = await this.loadPublishImage(this.publishMasterUrl);
      const postPlan = this.publishCropPlan(postImg);
      const posts = [
        { file: 'post-01-full.jpg', label: 'Пост · вся связка', mode: 'full' },
        { file: 'post-02-top.jpg', label: 'Пост · верх', mode: 'top' },
        { file: 'post-03-bottom.jpg', label: 'Пост · низ', mode: 'bottom' }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(postImg, null, 1080, 1350, { ...spec, plan: postPlan })
      }));
      let stories = [];
      if (this.publishStoryUrl) {
        const storyImg = await this.loadPublishImage(this.publishStoryUrl);
        const storyPlan = this.publishCropPlan(storyImg);
        stories = [
          { file: 'story-01-full.jpg', label: 'Сторис · вся связка', mode: 'story' },
          { file: 'story-02-closer.jpg', label: 'Сторис · крупнее', mode: 'story-closer' },
          { file: 'story-03-top.jpg', label: 'Сторис · верх', mode: 'story-top' }
        ].map((spec) => ({
          ...spec,
          dataUrl: this.renderPublishFrame(storyImg, null, 1080, 1920, { ...spec, plan: storyPlan })
        }));
      }
      const captions = this.buildPublishCaptions();
      this.publishPack = { posts, stories, captions };
      this.renderPublishThumbs(this.publishPack);
      if (status) {
        status.textContent = stories.length
          ? 'Готово: пост целиком, два кропа, сторис и два кропа.'
          : 'Готово: пост и два кропа. Сторис в этой пачке нет.';
      }
      this.toast?.('Пачка собрана', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось собрать пачку', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      this.setPublishBusy(false);
    }
  };

  app._publishFrameSet = 7;
})();
