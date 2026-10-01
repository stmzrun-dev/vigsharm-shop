// Экран «Ключ»: колонки, пустое место под кадры, копирование подписей.
(function () {
  const app = window.app;
  if (!app || app._publishScreenBound) return;
  app._publishScreenBound = true;

  app.setPublishSourceUi = function (has) {
    document.getElementById('tab-publish')?.classList.toggle('has-source', !!has);
    const replace = document.getElementById('publish-replace-btn');
    if (!replace) return;
    replace.classList.toggle('hidden', !has);
    replace.hidden = !has;
  };

  app.setPublishPackUi = function (has) {
    const empty = document.getElementById('publish-empty');
    const pack = document.getElementById('publish-pack');
    if (empty) {
      empty.classList.toggle('hidden', !!has);
      empty.hidden = !!has;
    }
    if (pack) {
      pack.classList.toggle('hidden', !has);
      pack.hidden = !has;
    }
    ['publish-copy-ig', 'publish-copy-tg', 'publish-copy-vk'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !has;
    });
  };

  app.copyPublishCaption = async function (which) {
    const text = document.getElementById('publish-captions')?.value || '';
    const order = [
      ['ig', '=== INSTAGRAM ==='],
      ['tg', '=== TELEGRAM ==='],
      ['vk', '=== VK ===']
    ];
    const idx = order.findIndex(([key]) => key === which);
    const mark = idx >= 0 ? order[idx][1] : '';
    const start = mark ? text.indexOf(mark) : -1;
    if (start < 0) {
      this.toast?.('Сначала соберите пачку', 'error');
      return;
    }
    const from = start + mark.length;
    let end = text.length;
    for (let i = idx + 1; i < order.length; i++) {
      const next = text.indexOf(order[i][1], from);
      if (next >= 0) {
        end = next;
        break;
      }
    }
    const chunk = text.slice(from, end).trim();
    if (!chunk) {
      this.toast?.('Подпись пустая', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(chunk);
      const names = { ig: 'Instagram', tg: 'Telegram', vk: 'VK' };
      this.toast?.('Скопировано: ' + (names[which] || 'подпись'), 'success');
    } catch (e) {
      this.toast?.('Не удалось скопировать', 'error');
    }
  };

  const showPreview = app.showPublishPreview.bind(app);
  app.showPublishPreview = function (src, alt) {
    const out = showPreview(src, alt);
    this.setPublishSourceUi(!!src);
    return out;
  };

  const loadFile = app.loadPublishFile.bind(app);
  app.loadPublishFile = async function (file) {
    const before = this.publishSource;
    await loadFile(file);
    if (this.publishSource && this.publishSource !== before) this.setPublishPackUi(false);
  };

  const renderThumbs = app.renderPublishThumbs.bind(app);
  app.renderPublishThumbs = function (pack) {
    renderThumbs(pack);
    this.setPublishPackUi(true);
  };
})();
