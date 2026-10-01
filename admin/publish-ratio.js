// Пост 4:5 и сторис 9:16 снимаются из готового квадрата. В файл попадает только фото модели.
(function () {
  const app = window.app;
  if (!app || app._publishFrameSet === 10) return;

  const createSquare = app.createPublishMaster.bind(app);
  app.createPublishMaster = async function () {
    await createSquare();
    const status = document.getElementById('publish-status');
    if (status && String(status.textContent || '').indexOf('Квадрат готов') === 0) {
      status.textContent = 'Квадрат готов. Нажмите «Пост 4:5». Сторис снимается отдельно.';
    }
  };

  app.publishPhotoFile = async function (url) {
    const img = await this.loadPublishImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  app.refreshPublishShots = async function () {
    const posts = [];
    const stories = [];
    if (this.publishPostUrl) {
      posts.push({
        file: 'post-01-full.jpg',
        label: 'Пост · вся связка',
        dataUrl: await this.publishPhotoFile(this.publishPostUrl)
      });
    }
    if (this.publishStoryUrl) {
      stories.push({
        file: 'story-01-full.jpg',
        label: 'Сторис · вся связка',
        dataUrl: await this.publishPhotoFile(this.publishStoryUrl)
      });
    }
    if (!posts.length && !stories.length) return;
    const captions = this.publishPack?.captions || this.buildPublishCaptions();
    this.publishPack = { posts, stories, captions };
    this.renderPublishThumbs(this.publishPack);
  };

  app.shootPublishFormat = async function (frame) {
    if (!this.publishMasterUrl) {
      this.toast?.('Сначала дождитесь квадрата', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    const isStory = frame === 'story';
    const aspect = isStory ? '9:16' : '4:5';
    const label = isStory ? 'Сторис 9:16' : 'Пост 4:5';
    const scene = this.getPublishScene();
    const keepBg = scene === 'arch';
    this.setPublishBusy(true);
    try {
      if (!/^https?:\/\//i.test(this.publishMasterUrl)) {
        if (status) status.textContent = 'Загрузка квадрата…';
        this.publishMasterUrl = await this.ensureHttpsPhotoUrl(this.publishMasterUrl, 'publish-master.webp');
      }
    } catch (e) {
      this.setPublishBusy(false);
      this.toast?.(e.message || 'Квадрат не загрузился', 'error');
      if (status) status.textContent = e.message || 'Квадрат не загрузился';
      return;
    }
    const startJob = async (prefer) => {
      const referenceUrl = keepBg ? '' : await this.ensureReferenceHttpsUrl(scene);
      let lastErr = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`${this.workerUrl}/api/studio/rephotograph`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
            body: JSON.stringify({
              image_url: this.publishMasterUrl,
              ...(keepBg ? {} : { reference_url: referenceUrl }),
              scene,
              resolution: '2K',
              prefer,
              aspect_ratio: aspect,
              frame: isStory ? 'story' : 'post'
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok || !data.job_id) throw new Error(data.error || `Съёмка не стартовала (${res.status})`);
          return data;
        } catch (err) {
          lastErr = err;
          const net = /failed to fetch|networkerror|load failed|connection/i.test(String(err?.message || err));
          if (!net || attempt === 2) throw err;
          if (status) status.textContent = `Сеть сбойнула — повтор ${attempt + 1}/2…`;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
      throw lastErr;
    };
    const genFailRe = /не удалось сгенерировать|возвращены на баланс|обработка не удалась|модель отклонила|таймаут обработки|failed to fetch|networkerror|load failed|rephotograph http|ошибка rephotograph|не вернул job_id|abort|content.?policy|copyright|авторск|safety|nsfw|moderation|rejected|violat/i;
    try {
      if (status) status.textContent = `Снимаем ${label} из квадрата…`;
      let url = '';
      try {
        const data = await startJob('quality');
        if (status) status.textContent = `⏳ ${label}…`;
        url = await this.pollStudioStatusSimple(data.job_id, { maxAttempts: 120, statusEl: status, label });
      } catch (err) {
        if (!genFailRe.test(String(err?.message || err))) throw err;
        if (status) status.textContent = 'Первая модель не выдала кадр — пробуем следующую…';
        try {
          const data = await startJob('banana');
          url = await this.pollStudioStatusSimple(data.job_id, { maxAttempts: 120, statusEl: status, label });
        } catch (bananaErr) {
          if (!genFailRe.test(String(bananaErr?.message || bananaErr))) throw bananaErr;
          if (status) status.textContent = 'Пробуем последнюю модель…';
          const data = await startJob('flux');
          url = await this.pollStudioStatusSimple(data.job_id, { maxAttempts: 80, statusEl: status, label });
        }
      }
      url = String(url || '').trim();
      if (!url) throw new Error('Модель не вернула фото');
      if (this.samePublishPhoto(url, this.publishMasterUrl) || this.samePublishPhoto(url, this.publishSource?.httpsUrl)) {
        throw new Error('Модель вернула тот же кадр — размер не изменился');
      }
      if (isStory) this.publishStoryUrl = url;
      else {
        this.publishPostUrl = url;
        await this.showPublishPreview(url, 'Пост');
      }
      await this.refreshPublishShots();
      if (status) {
        status.textContent = isStory
          ? 'Сторис готова. Это кадр модели, без заливки.'
          : 'Пост готов. Сторис можно снять отдельно.';
      }
      this.toast?.(isStory ? 'Сторис готова' : 'Пост готов', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Съёмка не удалась', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      this.setPublishBusy(false);
    }
  };

  app.buildPublishPack = function () {
    return this.shootPublishFormat('post');
  };

  app.buildPublishStories = function () {
    return this.shootPublishFormat('story');
  };

  app._publishFrameSet = 10;
})();
