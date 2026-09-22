(function () {
  const STATUS = {
    new: 'Новая',
    called: 'Перезвонили',
    confirmed: 'Подтверждена',
    cancelled: 'Отмена'
  };
  const FULFILL = {
    pickup: 'Самовывоз',
    armavir: 'По городу',
    nearby: 'За город'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function phoneHref(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    return d ? ('tel:+' + d) : '#';
  }

  function phoneLabel(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '7') {
      return '+7 ' + d.slice(1, 4) + ' ' + d.slice(4, 7) + '-' + d.slice(7, 9) + '-' + d.slice(9);
    }
    return digits || '—';
  }

  app.orders = [];

  app.loadOrders = async function () {
    const box = document.getElementById('orders-list');
    if (!box) return;
    if (!this.workerUrl) {
      box.innerHTML = '<div class="empty-state"><div class="title">Worker не настроен</div></div>';
      return;
    }
    if (!this.adminApiKey) {
      box.innerHTML = '<div class="empty-state"><div class="title">Нужен Admin API Key</div><p class="text-muted">Вкладка «Настройки»</p></div>';
      return;
    }
    try {
      const res = await fetch(this.workerUrl + '/api/orders', { headers: this.authHeaders() });
      const data = await res.json();
      if (!data.ok) {
        box.innerHTML = '<div class="empty-state"><div class="title">Не удалось загрузить заявки</div><p class="text-muted">' + esc(data.error || res.status) + '</p></div>';
        return;
      }
      this.orders = data.orders || [];
      this.renderOrders();
    } catch (e) {
      box.innerHTML = '<div class="empty-state"><div class="title">Ошибка сети</div></div>';
    }
  };

  app.renderOrders = function () {
    const box = document.getElementById('orders-list');
    if (!box) return;
    const rows = this.orders || [];
    const nNew = rows.filter((o) => o.status === 'new').length;
    const elNew = document.getElementById('orders-new');
    const elTotal = document.getElementById('orders-total');
    if (elNew) elNew.textContent = String(nNew);
    if (elTotal) elTotal.textContent = String(rows.length);
    if (!rows.length) {
      box.innerHTML = '<div class="empty-state"><div class="title">Заявок пока нет</div><p class="text-muted">Они появятся, когда клиент отправит заказ с карточки товара.</p></div>';
      return;
    }
    box.innerHTML = rows.map((o) => {
      const when = o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : '';
      const total = Number(o.total || 0).toLocaleString('ru-RU') + ' ₽';
      const extra = [
        o.digit ? ('цифра ' + o.digit + (o.digit2 ? ' и ' + o.digit2 : '')) : '',
        o.inscription ? ('надпись «' + o.inscription + '»') : '',
        FULFILL[o.fulfillment] || o.fulfillment,
        o.address || '',
        (o.order_date || '') + (o.order_time ? ' · ' + o.order_time : '')
      ].filter(Boolean).join(' · ');
      return '<article class="order-row status-' + esc(o.status) + '">' +
        '<div class="order-row-top">' +
        '<strong>#' + esc(o.public_code) + '</strong>' +
        '<span class="order-status">' + esc(STATUS[o.status] || o.status) + '</span>' +
        '<time>' + esc(when) + '</time></div>' +
        '<div class="order-row-main">' +
        '<p><b>' + esc(o.product_title) + '</b> · ' + (o.price_from ? 'от ' : '') + total + '</p>' +
        '<p class="text-muted">' + esc(extra) + '</p>' +
        '<p><a href="' + phoneHref(o.customer_phone) + '">' + esc(phoneLabel(o.customer_phone)) + '</a>' +
        (o.customer_name ? ' · ' + esc(o.customer_name) : '') + '</p></div>' +
        '<div class="order-row-actions">' +
        '<button type="button" class="btn sm outline" data-order-status="called" data-id="' + esc(o.id) + '">Перезвонили</button>' +
        '<button type="button" class="btn sm outline" data-order-status="confirmed" data-id="' + esc(o.id) + '">Подтверждена</button>' +
        '<button type="button" class="btn sm outline" data-order-status="cancelled" data-id="' + esc(o.id) + '">Отмена</button>' +
        '</div></article>';
    }).join('');
    box.querySelectorAll('[data-order-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setOrderStatus(btn.getAttribute('data-id'), btn.getAttribute('data-order-status'));
      });
    });
  };

  app.setOrderStatus = async function (id, status) {
    try {
      const res = await fetch(this.workerUrl + '/api/orders/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.ok) {
        const row = (this.orders || []).find((o) => o.id === id);
        if (row) row.status = status;
        this.renderOrders();
        this.toast('Статус обновлён', 'success');
      } else {
        this.toast(data.error || 'Не удалось сменить статус', 'error');
      }
    } catch (e) {
      this.toast('Ошибка сети', 'error');
    }
  };
})();
