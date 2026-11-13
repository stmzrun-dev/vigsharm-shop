// Квадратный мастер → два сторис 9:16 в край, без новой съёмки.
(function () {
  const app = window.app;
  if (!app || app._storyCropBound) return;
  app._storyCropBound = true;

  function isSquare(w, h) {
    if (!w || !h) return false;
    const ratio = w / h;
    return ratio > 0.92 && ratio < 1.08;
  }

  function storyCloseup(img, heightFrac) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const side = Math.min(iw, ih);
    let ch = Math.round(side * heightFrac);
    let cw = Math.round(ch * 9 / 16);
    if (cw > iw) {
      cw = iw;
      ch = Math.round(cw * 16 / 9);
    }
    if (ch > ih) {
      ch = ih;
      cw = Math.round(ch * 9 / 16);
    }
    const sx = Math.max(0, Math.round((iw - cw) / 2));
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    canvas.getContext('2d').drawImage(img, sx, 0, cw, ch, 0, 0, 1080, 1920);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  const refresh = app.refreshPublishShots?.bind(app);
  if (refresh) {
    app.refreshPublishShots = async function () {
      await refresh();
      if (!this.publishStoryCrops?.length || !this.publishPack) return;
      this.publishPack = {
        posts: this.publishPack.posts || [],
        stories: this.publishStoryCrops,
        captions: this.publishPack.captions || this.buildPublishCaptions()
      };
      this.renderPublishThumbs(this.publishPack);
    };
  }

  const shoot = app.shootPublishFormat?.bind(app);
  if (shoot) {
    app.shootPublishFormat = async function (frame) {
      await shoot(frame);
      if (frame === 'story' || !this.publishStoryCrops?.length || !this.publishPostUrl) return;
      const status = document.getElementById('publish-status');
      if (status) status.textContent = 'Пост готов. Сторис — два крупных кадра из квадрата.';
    };
  }

  const create = app.createPublishMaster?.bind(app);
  if (create) {
    app.createPublishMaster = async function () {
      this.publishStoryCrops = null;
      this.publishStoryUrl = null;
      return create();
    };
  }

  const loadFile = app.loadPublishFile?.bind(app);
  if (loadFile) {
    app.loadPublishFile = async function (file) {
      this.publishStoryCrops = null;
      this.publishStoryUrl = null;
      return loadFile(file);
    };
  }

  const shootStory = app.buildPublishStories.bind(app);

  app.buildPublishStories = async function () {
    if (!this.publishMasterUrl) {
      this.toast?.('Сначала дождитесь квадрата', 'error');
      return;
    }
    const status = document.getElementById('publish-status');
    let img;
    try {
      img = await this.loadPublishImage(this.publishMasterUrl);
    } catch (e) {
      this.toast?.(e.message || 'Квадрат не открылся', 'error');
      if (status) status.textContent = e.message || 'Квадрат не открылся';
      return;
    }
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!isSquare(iw, ih)) {
      this.publishStoryCrops = null;
      return shootStory();
    }
    if (this.publishStoryUrl) {
      try {
        const storyImg = await this.loadPublishImage(this.publishStoryUrl);
        const sw = storyImg.naturalWidth || storyImg.width;
        const sh = storyImg.naturalHeight || storyImg.height;
        if (!isSquare(sw, sh)) {
          if (status) status.textContent = 'Сторис уже не квадрат — кропы не добавляю.';
          this.toast?.('Сторис уже в размере кадра', 'info');
          return;
        }
      } catch (e) {
        /* кадр модели не открылся — режем квадрат */
      }
    }
    this.setPublishBusy(true);
    if (status) status.textContent = 'Режем два крупных кадра из квадрата…';
    try {
      const stories = [
        { file: 'story-01-top.jpg', label: 'Сторис · верх крупно', height: 0.7 },
        { file: 'story-02-closer.jpg', label: 'Сторис · ещё крупнее', height: 0.5 }
      ].map((spec) => ({
        file: spec.file,
        label: spec.label,
        dataUrl: storyCloseup(img, spec.height)
      }));
      this.publishStoryCrops = stories;
      this.publishStoryUrl = null;
      const posts = this.publishPack?.posts || [];
      const captions = this.publishPack?.captions || this.buildPublishCaptions();
      this.publishPack = { posts, stories, captions };
      this.renderPublishThumbs(this.publishPack);
      if (status) status.textContent = 'Сторис готовы: два крупных кадра из квадрата.';
      this.toast?.('Сторис собраны', 'success');
    } catch (e) {
      console.error(e);
      this.toast?.(e.message || 'Не удалось собрать сторис', 'error');
      if (status) status.textContent = e.message || 'Ошибка';
    } finally {
      this.setPublishBusy(false);
    }
  };
})();
