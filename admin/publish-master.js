// Если в кеше ещё старый «Ключ»: не писать «готово», когда кадр не сменился,
// и показывать новый Master слева только после того, как картинка открылась.
(function () {
  const app = window.app;
  if (!app || app.samePublishPhoto || app._publishMasterGuard) return;
  app._publishMasterGuard = true;

  const samePhoto = (a, b) => {
    const norm = (u) => String(u || '').trim().split('?')[0];
    const left = norm(a);
    return !!(left && left === norm(b));
  };

  app.showPublishPreview = function (src, alt) {
    const preview = document.getElementById('publish-source-preview');
    if (!preview || !src) return Promise.resolve();
    const isMaster = alt === 'Master';
    const labelText = isMaster ? 'Master' : 'Исходник';
    const pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.alt = labelText;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Новое фото не открылось'));
      img.src = src;
    }).then((img) => {
      preview.replaceChildren(img);
      preview.classList.remove('hidden');
      preview.hidden = false;
      const label = document.getElementById('publish-shot-label');
      if (label) {
        label.textContent = labelText;
        label.classList.toggle('is-master', isMaster);
        label.classList.remove('hidden');
        label.hidden = false;
      }
      this.setPublishSourceUi?.(true);
      preview.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    pending.catch(() => {});
    return pending;
  };

  const run = app.createPublishMaster.bind(app);
  app.createPublishMaster = async function () {
    const sourceBefore = this.publishSource?.httpsUrl || '';
    const toast = this.toast ? this.toast.bind(this) : () => {};
    let success = null;
    this.toast = (msg, type) => {
      if (type === 'success' && String(msg).includes('Master готов')) {
        success = msg;
        return;
      }
      return toast(msg, type);
    };
    try {
      await run();
    } finally {
      this.toast = toast;
    }
    if (!success) return;
    const source = this.publishSource?.httpsUrl || sourceBefore;
    if (!this.publishMasterUrl || samePhoto(this.publishMasterUrl, source)) {
      this.publishMasterUrl = null;
      this.setPublishBusy?.(false);
      const back = this.publishSource?.url || source;
      if (back) {
        try { await this.showPublishPreview(back, 'Исходник'); } catch (e) { /* исходник уже на экране */ }
      }
      const status = document.getElementById('publish-status');
      if (status) status.textContent = 'Модель вернула то же фото — кадр не изменился';
      toast('Модель вернула то же фото — кадр не изменился', 'error');
      return;
    }
    try {
      await this.showPublishPreview(this.publishMasterUrl, 'Master');
      toast(success, 'success');
    } catch (e) {
      this.publishMasterUrl = null;
      this.setPublishBusy?.(false);
      const status = document.getElementById('publish-status');
      if (status) status.textContent = e.message || 'Новое фото не открылось';
      toast(e.message || 'Новое фото не открылось', 'error');
    }
  };
})();
