// Квадрат — та же съёмка, что в карточке. Сторис собираются из него по кнопке.
(function () {
  const app = window.app;
  if (!app || app._publishFrameSet === 8) return;

  const setBusy = app.setPublishBusy.bind(app);
  app.setPublishBusy = function (busy) {
    setBusy(busy);
    const storyBtn = document.getElementById('publish-story-btn');
    if (storyBtn) storyBtn.disabled = !!busy || !this.publishMasterUrl;
  };

  function storyFrames(img, plan) {
    return [
      { file: 'story-01-full.jpg', label: 'Сторис · вся связка', mode: 'story' },
      { file: 'story-02-closer.jpg', label: 'Сторис · крупнее', mode: 'story-closer' },
      { file: 'story-03-top.jpg', label: 'Сторис · верх', mode: 'story-top' }
    ].map((spec) => ({
      ...spec,
      dataUrl: this.renderPublishFrame(img, null, 1080, 1920, { ...spec, plan })
    }));
  }

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
      const masterUrl = String(await this.createMasterForScene(imageUrl, scene, status) || '').trim();
      if (!masterUrl) throw new Error('Модель не вернула фото');
      if (this.samePublishPhoto(masterUrl, imageUrl)) {
        throw new Error('Модель вернула то же фото — кадр не изменился');
      }
      await this.showPublishPreview(masterUrl, 'Master');
      this.publishMasterUrl = masterUrl;
      this.publishPack = null;

      const sign = (document.getElementById('publish-sign-text')?.value || '').trim();
      if (sign) {
        if (status) status.textContent = 'Правлю надпись…';
        try {
          const fixed = await this.fixBalloonInscription({
            masterUrl,
            exact: sign,
            statusEl: status,
            skipCommit: true
          });
          if (fixed && !this.samePublishPhoto(fixed, masterUrl)) {
            await this.showPublishPreview(fixed, 'Master');
            this.publishMasterUrl = fixed;
          }
        } catch (err) {
          console.warn(err);
        }
      }

      if (status) status.textContent = 'Квадрат готов. Можно собрать пачку или нажать «Сторис».';
      this.toast?.('Master готов', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось создать Master', 'error');
      if (status) status.textContent = e.message || 'Ошибка Master';
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
    if (status) status.textContent = 'Собираем пост и кропы…';
    try {
      const img = await this.loadPublishImage(this.publishMasterUrl);
      const plan = this.publishCropPlan(img);
      const posts = [
        { file: 'post-01-full.jpg', label: 'Пост · вся связка', mode: 'full' },
        { file: 'post-02-top.jpg', label: 'Пост · верх', mode: 'top' },
        { file: 'post-03-bottom.jpg', label: 'Пост · низ', mode: 'bottom' }
      ].map((spec) => ({
        ...spec,
        dataUrl: this.renderPublishFrame(img, null, 1080, 1350, { ...spec, plan })
      }));
      const stories = this.publishPack?.stories || [];
      const captions = this.buildPublishCaptions();
      this.publishPack = { posts, stories, captions };
      this.renderPublishThumbs(this.publishPack);
      if (status) {
        status.textContent = stories.length
          ? 'Пост, кропы и сторис готовы. Можно скачать ZIP.'
          : 'Пост и два кропа готовы. Сторис — отдельной кнопкой.';
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

  app.buildPublishStories = async function () {
    if (!this.publishMasterUrl) {
      this.toast?.('Сначала дождитесь квадрата', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    this.setPublishBusy(true);
    if (status) status.textContent = 'Собираем сторис из квадрата…';
    try {
      const img = await this.loadPublishImage(this.publishMasterUrl);
      const plan = this.publishCropPlan(img);
      const stories = storyFrames.call(this, img, plan);
      const posts = this.publishPack?.posts || [];
      const captions = this.publishPack?.captions || this.buildPublishCaptions();
      this.publishPack = { posts, stories, captions };
      this.renderPublishThumbs(this.publishPack);
      if (status) status.textContent = 'Сторис готовы: связка сверху, низ пустой.';
      this.toast?.('Сторис собраны', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось собрать сторис', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      this.setPublishBusy(false);
    }
  };

  app._publishFrameSet = 8;
})();
