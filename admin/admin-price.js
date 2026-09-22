(function () {
  const GROUPS = [
    { id: 'latex', title: 'Латексные шары' },
    { id: 'foil', title: 'Фольгированные шары' },
    { id: 'special', title: 'Особенные шары' },
    { id: 'decor', title: 'Оформление праздника' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  app.priceList = [];

  app.loadPriceList = async function () {
    const box = document.getElementById('price-list-admin');
    if (!box) return;
    if (!this.workerUrl) {
      box.innerHTML = '<div class="empty-state"><div class="title">Worker не настроен</div></div>';
      return;
    }
    try {
      const res = await fetch(this.workerUrl + '/api/price-list', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) {
        box.innerHTML = '<div class="empty-state"><div class="title">Не удалось загрузить прайс</div><p class="text-muted">' + esc(data.error || res.status) + '</p></div>';
        return;
      }
      this.priceList = data.items || [];
      this.renderPriceList();
    } catch (e) {
      box.innerHTML = '<div class="empty-state"><div class="title">Ошибка сети</div><p class="text-muted">Проверьте Worker URL</p></div>';
    }
  };

  app.renderPriceList = function () {
    const box = document.getElementById('price-list-admin');
    if (!box) return;
    const items = this.priceList || [];
    if (!items.length) {
      box.innerHTML = '<div class="empty-state"><div class="title">Прайс пуст</div></div>';
      return;
    }
    box.innerHTML = GROUPS.map((g) => {
      const rows = items.filter((i) => i.group_id === g.id);
      if (!rows.length) return '';
      return '<article class="price-admin-group"><h3>' + esc(g.title) + '</h3>' +
        rows.map((i) => {
          const from = Number(i.price_from) ? ' checked' : '';
          const unit = i.unit ? (' <small>' + esc(i.unit) + '</small>') : '';
          return '<label class="price-admin-row">' +
            '<span>' + esc(i.title) + unit + '</span>' +
            '<span class="price-admin-from"><input type="checkbox" data-price-from="' + esc(i.id) + '"' + from + '/> от</span>' +
            '<input class="product-row-price-input" type="number" min="0" step="1" inputmode="numeric" data-price-val="' + esc(i.id) + '" value="' + (Number(i.price) || 0) + '"/>' +
            '</label>';
        }).join('') +
        '</article>';
    }).join('');
  };

  app.collectPriceListEdits = function () {
    return (this.priceList || []).map((i) => {
      const input = document.querySelector('[data-price-val="' + i.id + '"]');
      const from = document.querySelector('[data-price-from="' + i.id + '"]');
      return {
        id: i.id,
        price: input ? Number(input.value) || 0 : i.price,
        price_from: from ? (from.checked ? 1 : 0) : i.price_from
      };
    });
  };

  app.priceListDeltas = {};

  app.priceListDiffs = function () {
    const next = this.collectPriceListEdits();
    const deltas = {};
    (this.priceList || []).forEach((old) => {
      const n = next.find((x) => x.id === old.id);
      if (!n) return;
      const d = (Number(n.price) || 0) - (Number(old.price) || 0);
      if (d) deltas[old.id] = d;
    });
    return deltas;
  };

  app.showRepricePanel = function (data, deltas) {
    const box = document.getElementById('price-reprice-panel');
    if (!box) return;
    this.priceListDeltas = deltas || {};
    const rows = data.changed || [];
    const extra = Math.max(0, (data.count || 0) - rows.length);
    if (!rows.length) {
      box.hidden = true;
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    box.classList.remove('hidden');
    box.innerHTML = '<h3>Пересчитать карточки?</h3>' +
      '<p>В составе найдено совпадение с изменёнными позициями прайса. Затронет <strong>' +
      data.count + '</strong> товар(ов). Гирлянды, фотозоны и арки без метров не трогаем.</p>' +
      '<table><thead><tr><th>Товар</th><th>Было</th><th>Станет</th><th></th></tr></thead><tbody>' +
      rows.map((r) => {
        const cls = r.add > 0 ? 'add-plus' : 'add-minus';
        const sign = r.add > 0 ? '+' : '';
        return '<tr><td>' + esc(r.title) + '</td><td>' + r.old_price + ' ₽</td><td>' +
          r.new_price + ' ₽</td><td class="' + cls + '">' + sign + r.add + ' ₽</td></tr>';
      }).join('') +
      '</tbody></table>' +
      (extra ? '<p class="text-muted">и ещё ' + extra + '…</p>' : '') +
      '<div class="price-reprice-actions">' +
      '<button type="button" class="btn primary" onclick="app.applyPriceReprice()">Применить к карточкам</button>' +
      '<button type="button" class="btn outline" onclick="app.hideRepricePanel()">Не сейчас</button>' +
      '</div>';
  };

  app.hideRepricePanel = function () {
    const box = document.getElementById('price-reprice-panel');
    if (!box) return;
    box.hidden = true;
    box.classList.add('hidden');
    box.innerHTML = '';
    this.priceListDeltas = {};
  };

  app.applyPriceReprice = async function () {
    const deltas = this.priceListDeltas || {};
    if (!Object.keys(deltas).length) return;
    try {
      const res = await fetch(this.workerUrl + '/api/price-list/reprice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ deltas, apply: true })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || ('HTTP ' + res.status));
      this.markStorefrontDirty?.('price');
      this.hideRepricePanel();
      this.toast?.('Цены в карточках обновлены. Выгрузите каталог для витрины.', 'success');
      this.loadProducts?.();
    } catch (e) {
      alert('Не удалось обновить карточки: ' + (e.message || e));
    }
  };

  app.savePriceList = async function () {
    if (!this.workerUrl) {
      alert('Укажите Worker API URL во вкладке «Настройки».');
      return;
    }
    if (!this.adminApiKey) {
      alert('Нужен Admin API Key во вкладке «Настройки».');
      return;
    }
    const btn = document.getElementById('price-list-save');
    if (btn) btn.disabled = true;
    const deltas = this.priceListDiffs();
    try {
      const res = await fetch(this.workerUrl + '/api/price-list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ items: this.collectPriceListEdits() })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || ('HTTP ' + res.status));
      this.priceList = data.items || [];
      this.renderPriceList();
      this.toast?.('Прайс сохранён. Для сайта в РФ скачайте JSON в data/', 'success');
      if (Object.keys(deltas).length) {
        const prev = await fetch(this.workerUrl + '/api/price-list/reprice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
          body: JSON.stringify({ deltas, apply: false })
        });
        const preview = await prev.json();
        if (preview.ok) this.showRepricePanel(preview, deltas);
      } else {
        this.hideRepricePanel();
      }
    } catch (e) {
      alert('Не удалось сохранить: ' + (e.message || e));
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  app.exportPriceListSnapshot = async function () {
    if (!this.workerUrl) {
      alert('Укажите Worker API URL во вкладке «Настройки».');
      return;
    }
    try {
      const res = await fetch(this.workerUrl + '/api/price-list', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.items)) throw new Error(data.error || 'Пустой ответ');
      const blob = new Blob(
        [JSON.stringify({ ok: true, items: data.items }, null, 2) + '\n'],
        { type: 'application/json;charset=utf-8' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'price-list.json';
      a.click();
      URL.revokeObjectURL(a.href);
      this.toast?.('Скачан price-list.json → положите в data/', 'success');
    } catch (e) {
      alert('Не удалось скачать: ' + (e.message || e));
    }
  };
})();
