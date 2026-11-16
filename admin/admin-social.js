// Кропы, пост и треки для публикации. В карточку товара не записываются.
(function () {
  if (!app || app._socialExportBound) return;
  app._socialExportBound = true;

  const TAG_KEY = 'vigsharm-social-tags';
  const BRAND_TAGS = ['вигшарм', 'армавир'];
  const SOCIAL_SLOTS = [
    { id: 'card-45', source: 'card', label: 'Пост 4:5', file: 'vigsharm-post-4x5.jpg', outW: 1080, outH: 1350, scale: 1, cx: 0.5, cy: 0.5 },
    { id: 'card-11', source: 'card', label: 'Квадрат 1:1', file: 'vigsharm-post-1x1.jpg', outW: 1080, outH: 1080, scale: 1, cx: 0.5, cy: 0.5 },
    { id: 'story-a', source: 'story', label: 'Сторис · крупно 1', file: 'vigsharm-story-crop-1.jpg', outW: 1080, outH: 1920, scale: 0.7, cx: 0.5, cy: 0.42 },
    { id: 'story-b', source: 'story', label: 'Сторис · крупно 2', file: 'vigsharm-story-crop-2.jpg', outW: 1080, outH: 1920, scale: 0.5, cx: 0.5, cy: 0.38 }
  ];

  function normTag(raw) {
    return String(raw || '')
      .replace(/^#+/g, '')
      .replace(/[\s#]+/g, '')
      .replace(/[^0-9A-Za-zА-Яа-яЁё_]/g, '')
      .toLowerCase()
      .slice(0, 40);
  }

  function readTagMemory() {
    try {
      const list = JSON.parse(localStorage.getItem(TAG_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      const out = [];
      const seen = new Set(BRAND_TAGS);
      list.forEach((item) => {
        const tag = normTag(item);
        if (!tag || seen.has(tag)) return;
        seen.add(tag);
        out.push(tag);
      });
      return out.slice(-40);
    } catch {
      return [];
    }
  }

  function rememberTags(tags) {
    const seen = new Set();
    const next = [];
    readTagMemory().concat(tags).forEach((item) => {
      const tag = normTag(item);
      if (!tag || seen.has(tag) || BRAND_TAGS.includes(tag)) return;
      seen.add(tag);
      next.push(tag);
    });
    try {
      localStorage.setItem(TAG_KEY, JSON.stringify(next.slice(-40)));
    } catch {
      /* память хэштегов необязательна */
    }
  }

  function transientAiError(msg) {
    return /таймаут|Failed to fetch|NetworkError|Load failed|network|NordRouter API ошибка|AI не вернул ответ/i.test(String(msg || ''));
  }

  Object.assign(app, {
    socialFrames: null,
    socialDraft: null,
    socialPostBusy: false,
    socialPostNote: '',
    socialCropSource: 'card',
    socialCropSlot: 'card-45',

    ensureSocialFrames() {
      if (this.socialFrames) return this.socialFrames;
      this.socialFrames = {};
      SOCIAL_SLOTS.forEach((spec) => {
        this.socialFrames[spec.id] = { scale: spec.scale, cx: spec.cx, cy: spec.cy, dataUrl: '' };
      });
      return this.socialFrames;
    },

    socialSlotSpec(id) {
      const slotId = id || this.socialCropSlot;
      return SOCIAL_SLOTS.find((spec) => spec.id === slotId) || SOCIAL_SLOTS[0];
    },

    clearSocialExport() {
      this.socialFrames = null;
      this.socialDraft = null;
      this.socialPostBusy = false;
      this.socialPostNote = '';
      this.socialCropSource = 'card';
      this.socialCropSlot = 'card-45';
      this._socialCropImg = null;
      this._socialCropPx = null;
      this._socialCropLoad = (this._socialCropLoad || 0) + 1;
      if (this._socialCropBlob) {
        URL.revokeObjectURL(this._socialCropBlob);
        this._socialCropBlob = '';
      }
      this.closeSocialCrop();
    },

    clearSocialStoryCrops() {
      const frames = this.socialFrames;
      if (!frames) return;
      SOCIAL_SLOTS.filter((spec) => spec.source === 'story').forEach((spec) => {
        frames[spec.id] = { scale: spec.scale, cx: spec.cx, cy: spec.cy, dataUrl: '' };
      });
      if (this.socialCropSource === 'story') {
        this.socialCropSource = 'card';
        this.socialCropSlot = 'card-45';
      }
    },

    socialSourceUrl() {
      if (this.socialCropSource === 'story') return String(this.studioStoryUrl || '');
      return String(this.getStudioStorySourceUrl?.() || '');
    },

    openSocialCrop() {
      if (!this.hasStudioMaster?.()) {
        this.toast('Сначала дождитесь фото карточки', 'info');
        return;
      }
      const overlay = document.getElementById('studio-social-overlay');
      if (!overlay) return;
      if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
      if (!overlay.dataset.bound) {
        overlay.dataset.bound = '1';
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) this.closeSocialCrop();
        });
      }
      this.ensureSocialFrames();
      if (this.socialCropSource === 'story' && !this.studioStoryUrl) this.socialCropSource = 'card';
      if (this.socialSlotSpec().source !== this.socialCropSource) {
        this.socialCropSlot = SOCIAL_SLOTS.find((spec) => spec.source === this.socialCropSource).id;
      }
      overlay.classList.remove('hidden');
      overlay.hidden = false;
      this.renderSocialCropChrome();
      this.bindSocialCropDrag();
      this.loadSocialCropImage();
    },

    closeSocialCrop() {
      const overlay = document.getElementById('studio-social-overlay');
      if (!overlay) return;
      overlay.classList.add('hidden');
      overlay.hidden = true;
    },

    setSocialCropSource(source) {
      if (source === 'story' && !this.studioStoryUrl) {
        this.toast('Сначала снимите сторис 9:16', 'info');
        return;
      }
      this.socialCropSource = source === 'story' ? 'story' : 'card';
      if (this.socialSlotSpec().source !== this.socialCropSource) {
        this.socialCropSlot = SOCIAL_SLOTS.find((spec) => spec.source === this.socialCropSource).id;
      }
      this.renderSocialCropChrome();
      this.loadSocialCropImage();
    },

    setSocialCropSlot(id) {
      const spec = SOCIAL_SLOTS.find((item) => item.id === id);
      if (!spec) return;
      this.socialCropSlot = spec.id;
      this.socialCropSource = spec.source;
      this.renderSocialCropChrome();
      const frame = this.ensureSocialFrames()[spec.id];
      const slider = document.getElementById('studio-social-scale');
      if (slider) slider.value = String(Math.round(frame.scale * 100));
      this.layoutSocialCrop();
    },

    setSocialCropScale(value) {
      const spec = this.socialSlotSpec();
      const frame = this.ensureSocialFrames()[spec.id];
      frame.scale = Math.min(100, Math.max(28, Number(value) || 100)) / 100;
      this.layoutSocialCrop();
    },

    renderSocialCropChrome() {
      const source = this.socialCropSource === 'story' ? 'story' : 'card';
      document.querySelectorAll('[data-social-source]').forEach((btn) => {
        btn.classList.toggle('is-on', btn.dataset.socialSource === source);
        if (btn.dataset.socialSource === 'story') btn.disabled = !this.studioStoryUrl;
      });
      const slots = document.getElementById('studio-social-slots');
      if (!slots) return;
      slots.innerHTML = SOCIAL_SLOTS.filter((spec) => spec.source === source).map((spec) => (
        `<button type="button" class="studio-social-chip${spec.id === this.socialCropSlot ? ' is-on' : ''}" data-social-slot="${spec.id}">${spec.label}</button>`
      )).join('');
      slots.querySelectorAll('[data-social-slot]').forEach((btn) => {
        btn.onclick = () => this.setSocialCropSlot(btn.dataset.socialSlot);
      });
      const frame = this.ensureSocialFrames()[this.socialCropSlot];
      const slider = document.getElementById('studio-social-scale');
      if (slider && frame) slider.value = String(Math.round(frame.scale * 100));
    },

    async loadSocialCropImage() {
      const url = this.socialSourceUrl();
      const imgEl = document.getElementById('studio-social-crop-img');
      if (!imgEl) return;
      if (!url) {
        this.toast('Нет фото для этого кропа', 'info');
        return;
      }
      const token = (this._socialCropLoad || 0) + 1;
      this._socialCropLoad = token;
      const finish = () => {
        if (token !== this._socialCropLoad) return;
        this._socialCropImg = imgEl;
        this.layoutSocialCrop();
      };
      const fail = () => {
        if (token !== this._socialCropLoad) return;
        this._socialCropImg = null;
        this.toast('Фото не открылось для кропа', 'error');
      };
      imgEl.onload = finish;
      imgEl.onerror = fail;
      imgEl.removeAttribute('crossorigin');
      if (imgEl.dataset.socialSrc === url && imgEl.complete && imgEl.naturalWidth) {
        finish();
        return;
      }
      let src = url;
      if (/^https?:/i.test(url)) {
        try {
          const res = await fetch(`${this.workerUrl}/api/admin/proxy-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
            body: JSON.stringify({ url })
          });
          if (token !== this._socialCropLoad) return;
          if (!res.ok) throw new Error('proxy ' + res.status);
          const blob = await res.blob();
          if (token !== this._socialCropLoad) return;
          src = URL.createObjectURL(blob);
          if (this._socialCropBlob && this._socialCropBlob !== src) URL.revokeObjectURL(this._socialCropBlob);
          this._socialCropBlob = src;
        } catch (err) {
          console.error('[social crop]', err);
          fail();
          return;
        }
      }
      imgEl.dataset.socialSrc = url;
      imgEl.src = src;
    },

    layoutSocialCrop() {
      const img = this._socialCropImg;
      const box = document.getElementById('studio-social-box');
      const spec = this.socialSlotSpec();
      const frame = this.ensureSocialFrames()[spec.id];
      if (!img || !box || !frame || !img.naturalWidth || !img.naturalHeight) return;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const aspect = spec.outW / spec.outH;
      let maxW;
      let maxH;
      if (iw / ih > aspect) {
        maxH = ih;
        maxW = maxH * aspect;
      } else {
        maxW = iw;
        maxH = maxW / aspect;
      }
      const scale = Math.min(1, Math.max(0.28, Number(frame.scale) || 1));
      frame.scale = scale;
      const sw = maxW * scale;
      const sh = maxH * scale;
      let sx = frame.cx * iw - sw / 2;
      let sy = frame.cy * ih - sh / 2;
      sx = Math.min(Math.max(sx, 0), Math.max(0, iw - sw));
      sy = Math.min(Math.max(sy, 0), Math.max(0, ih - sh));
      frame.cx = (sx + sw / 2) / iw;
      frame.cy = (sy + sh / 2) / ih;
      this._socialCropPx = { sx, sy, sw, sh };
      box.style.left = `${(sx / iw) * 100}%`;
      box.style.top = `${(sy / ih) * 100}%`;
      box.style.width = `${(sw / iw) * 100}%`;
      box.style.height = `${(sh / ih) * 100}%`;
    },

    bindSocialCropDrag() {
      const stage = document.getElementById('studio-social-stage');
      const box = document.getElementById('studio-social-box');
      if (!stage || !box || this._socialCropDragBound) return;
      this._socialCropDragBound = true;
      let drag = null;
      const point = (event) => {
        const rect = stage.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left) / rect.width,
          y: (event.clientY - rect.top) / rect.height
        };
      };
      stage.addEventListener('pointerdown', (event) => {
        if (event.target !== box) return;
        stage.setPointerCapture(event.pointerId);
        event.preventDefault();
        const frame = this.ensureSocialFrames()[this.socialSlotSpec().id];
        drag = { start: point(event), cx: frame.cx, cy: frame.cy };
      });
      stage.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const pos = point(event);
        const frame = this.ensureSocialFrames()[this.socialSlotSpec().id];
        frame.cx = drag.cx + (pos.x - drag.start.x);
        frame.cy = drag.cy + (pos.y - drag.start.y);
        this.layoutSocialCrop();
      });
      const end = () => { drag = null; };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
    },

    downloadSocialCrop() {
      const img = this._socialCropImg;
      const rect = this._socialCropPx;
      const spec = this.socialSlotSpec();
      if (!img || !rect) {
        this.toast('Рамка ещё не встала на фото', 'info');
        return;
      }
      try {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const sx = Math.max(0, Math.min(iw - 1, Math.round(rect.sx)));
        const sy = Math.max(0, Math.min(ih - 1, Math.round(rect.sy)));
        const sw = Math.max(1, Math.min(iw - sx, Math.round(rect.sw)));
        const sh = Math.max(1, Math.min(ih - sy, Math.round(rect.sh)));
        const canvas = document.createElement('canvas');
        canvas.width = spec.outW;
        canvas.height = spec.outH;
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, spec.outW, spec.outH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        this.ensureSocialFrames()[spec.id].dataUrl = dataUrl;
        this.saveSocialFile(dataUrl, spec.file);
        this.renderSocialTools();
        this.toast('Кадр скачан', 'success');
      } catch (err) {
        console.error('[social crop]', err);
        this.toast('Этот кадр не читается для кропа', 'error');
      }
    },

    downloadSocialSlot(id) {
      const spec = this.socialSlotSpec(id);
      const dataUrl = this.socialFrames?.[spec.id]?.dataUrl;
      if (!dataUrl) return;
      this.saveSocialFile(dataUrl, spec.file);
    },

    saveSocialFile(dataUrl, filename) {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    },

    renderSocialTools() {
      const crops = document.getElementById('studio-social-crops');
      const frames = this.socialFrames;
      if (crops) {
        const ready = SOCIAL_SLOTS.filter((spec) => frames?.[spec.id]?.dataUrl);
        crops.innerHTML = ready.map((spec) => (
          `<figure class="studio-social-crop">` +
            `<img alt="${spec.label}" src="${frames[spec.id].dataUrl}"/>` +
            `<figcaption>${spec.label}</figcaption>` +
            `<button type="button" class="btn outline btn-sm" data-social-file="${spec.id}">Скачать</button>` +
          `</figure>`
        )).join('');
        crops.querySelectorAll('[data-social-file]').forEach((btn) => {
          btn.onclick = () => this.downloadSocialSlot(btn.dataset.socialFile);
        });
      }

      const draftEl = document.getElementById('studio-social-draft');
      const draft = this.socialDraft;
      if (draftEl) {
        draftEl.classList.toggle('hidden', !draft);
        draftEl.hidden = !draft;
      }
      if (draft) {
        const caption = document.getElementById('studio-social-caption');
        const tags = document.getElementById('studio-social-tags');
        if (caption && caption.dataset.socialStamp !== draft.stamp) {
          caption.value = draft.caption;
          caption.dataset.socialStamp = draft.stamp;
        }
        if (tags && tags.dataset.socialStamp !== draft.stamp) {
          tags.value = draft.tagsText;
          tags.dataset.socialStamp = draft.stamp;
        }
        const ig = document.getElementById('studio-social-ig');
        const vk = document.getElementById('studio-social-vk');
        if (ig) ig.textContent = draft.igLine || '';
        if (vk) vk.textContent = draft.vkLine || '';
      }

      const postBtn = document.getElementById('studio-social-post');
      if (postBtn) {
        postBtn.disabled = !!this.socialPostBusy;
        postBtn.textContent = this.socialPostBusy ? 'Пишем…' : 'Пост и музыка';
      }
      const note = document.getElementById('studio-social-status');
      if (note) note.textContent = this.socialPostNote || '';

      const overlay = document.getElementById('studio-social-overlay');
      if (overlay && !overlay.classList.contains('hidden')) this.renderSocialCropChrome();
    },

    async generateSocialPost() {
      if (this.socialPostBusy) return;
      if (!this.hasStudioMaster?.()) {
        this.toast('Сначала дождитесь фото карточки', 'info');
        return;
      }
      const src = String(this.getStudioStorySourceUrl?.() || '').trim();
      if (!src) {
        this.toast('Нет фото карточки', 'error');
        return;
      }
      this.socialPostBusy = true;
      this.socialPostNote = 'Смотрю фото и пишу пост…';
      this.renderSocialTools();
      try {
        let imageUrl = src;
        if (!/^https?:\/\//i.test(imageUrl)) {
          imageUrl = await this.ensureHttpsPhotoUrl(imageUrl, 'studio-social.webp');
        }
        const title = (document.getElementById('product-title')?.value || '').trim();
        const price = (document.getElementById('product-price')?.value || '').trim();
        const avoid = readTagMemory();
        let payload = null;
        let lastErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const res = await fetch(`${this.workerUrl}/api/ai/social-post`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
              body: JSON.stringify({
                image_url: imageUrl,
                title,
                price,
                avoid_hashtags: avoid
              })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(json.error || 'Пост не собрался');
            payload = json;
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 2 || !transientAiError(err?.message)) break;
            this.socialPostNote = 'ИИ не ответил — повтор…';
            this.renderSocialTools();
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
        }
        if (lastErr) throw lastErr;

        const seen = new Set([...BRAND_TAGS, ...avoid]);
        const topical = [];
        (Array.isArray(payload.hashtags) ? payload.hashtags : []).forEach((item) => {
          const tag = normTag(item);
          if (!tag || seen.has(tag)) return;
          seen.add(tag);
          topical.push(tag);
        });
        rememberTags(topical);
        const ig = payload.ig_track || {};
        const vk = payload.vk_track || {};
        const igQuery = `${ig.artist || ''} — ${ig.title || ''}`.replace(/^ — | — $/g, '').trim();
        const vkQuery = `${vk.artist || ''} — ${vk.title || ''}`.replace(/^ — | — $/g, '').trim();
        this.socialDraft = {
          stamp: String(Date.now()),
          caption: String(payload.caption || '').trim(),
          tagsText: ['#вигшарм', '#армавир'].concat(topical.map((tag) => '#' + tag)).join(' '),
          igQuery,
          vkQuery,
          igLine: igQuery ? `Instagram: ${igQuery}${ig.why ? '. ' + ig.why : ''}` : '',
          vkLine: vkQuery ? `ВКонтакте: ${vkQuery}${vk.why ? '. ' + vk.why : ''}` : ''
        };
        this.socialPostNote = '';
        this.toast('Пост готов — его можно скопировать', 'success');
      } catch (err) {
        console.error('[social post]', err);
        this.socialPostNote = err?.message || 'Пост не собрался';
        this.toast(this.socialPostNote, 'error');
      } finally {
        this.socialPostBusy = false;
        this.renderSocialTools();
      }
    },

    async copySocialText(which) {
      const draft = this.socialDraft;
      let text = '';
      if (which === 'post') {
        const caption = (document.getElementById('studio-social-caption')?.value || '').trim();
        const tags = (document.getElementById('studio-social-tags')?.value || '').trim();
        text = [caption, tags].filter(Boolean).join('\n\n');
      } else if (which === 'tags') {
        text = (document.getElementById('studio-social-tags')?.value || '').trim();
      } else if (which === 'ig') {
        text = draft?.igQuery || '';
      } else if (which === 'vk') {
        text = draft?.vkQuery || '';
      }
      if (!text) {
        this.toast('Нечего копировать', 'info');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        this.toast('Скопировано', 'success');
      } catch (err) {
        console.warn('[social copy]', err);
        this.toast('Не удалось скопировать', 'error');
      }
    }
  });
})();
