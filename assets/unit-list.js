/* Список шаров поштучно: несколько карточек — одна заявка. Не корзина и не оплата. */
(function () {
  var KEY = 'vigsharm_unit_list';
  var PHONE = '79284440142';
  var TG_URL = 'https://t.me/Olgamzz';
  var MAX_URL = 'https://max.ru/u/f9LHodD0cOJwY09H6Zj63nYK_X8tPZGb3CODIvTT7FWkRzrgbh5F582AiB8';
  var cityDelivery = 200;
  var draft = { fulfillment: '', address: '', date: '', time: '', phone: '', name: '', hp: '' };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(function (x) { return x && x.id && x.title; }) : [];
    } catch (e) { return []; }
  }
  function save(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    paintBar();
    paintSteps();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return Number(n || 0).toLocaleString('ru-RU') + ' ₽'; }
  function pieces(items) {
    return items.reduce(function (s, it) { return s + (Number(it.qty) || 0); }, 0);
  }
  function lineTotal(it) {
    var base = (Number(it.price) || 0) * (Number(it.qty) || 0);
    return base + (it.digit2 ? 900 : 0);
  }
  function goodsSum(items) {
    return items.reduce(function (s, it) { return s + lineTotal(it); }, 0);
  }
  function deliveryRub() { return draft.fulfillment === 'armavir' ? cityDelivery : 0; }
  function grand(items) { return goodsSum(items) + deliveryRub(); }
  function formatPhone(raw) {
    var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    if (digits.charAt(0) === '7') digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (!digits) return '';
    var out = '+7';
    if (digits.length) out += ' ' + digits.slice(0, 3);
    if (digits.length > 3) out += ' ' + digits.slice(3, 6);
    if (digits.length > 6) out += '-' + digits.slice(6, 8);
    if (digits.length > 8) out += '-' + digits.slice(8, 10);
    return out;
  }
  function phoneDigits(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '8') d = '7' + d.slice(1);
    return d;
  }
  function todayMin() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateLabel(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  function add(item) {
    if (!item || !item.id) return;
    var qty = Math.max(1, Math.min(100, Number(item.qty) || 1));
    var items = load();
    var found = null;
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(item.id)) { found = items[i]; break; }
    }
    if (item.digit) {
      var line = {
        id: item.id,
        slug: item.slug || '',
        title: item.title || 'Цифра',
        sku: item.sku || '',
        price: Number(item.price) || 0,
        qty: 1,
        perMeter: false,
        thumb: item.thumb || '',
        digit: String(item.digit),
        digit2: item.digit2 ? String(item.digit2) : ''
      };
      if (found) {
        found.qty = 1;
        found.digit = line.digit;
        found.digit2 = line.digit2;
        found.price = line.price;
        if (line.thumb) found.thumb = line.thumb;
      } else items.push(line);
      save(items);
      if (window.vigToast) window.vigToast(line.digit2 ? ('Цифры ' + line.digit + ' и ' + line.digit2) : ('Цифра ' + line.digit));
      return;
    }
    if (found) {
      found.qty = Math.min(100, (Number(found.qty) || 0) + qty);
      if (item.thumb) found.thumb = item.thumb;
    } else items.push({
      id: item.id,
      slug: item.slug || '',
      title: item.title || 'Шар',
      sku: item.sku || '',
      price: Number(item.price) || 0,
      qty: qty,
      perMeter: !!item.perMeter,
      thumb: item.thumb || ''
    });
    save(items);
    if (window.vigToast) window.vigToast('В наборе: ' + qty + (item.perMeter ? ' м' : ' шт.'));
  }

  function message(items) {
    var lines = items.map(function (it) {
      var unit = it.perMeter ? 'м' : 'шт.';
      var sku = it.sku ? ' (' + it.sku + ')' : '';
      var which = it.digit ? (' — ' + (it.digit2 ? ('цифры ' + it.digit + ' и ' + it.digit2) : ('цифра ' + it.digit))) : '';
      return it.qty + ' ' + unit + ' × ' + it.title + sku + which + ' — ' + money(lineTotal(it));
    });
    var fmap = {
      pickup: 'самовывоз из студии',
      armavir: 'доставка по Армавиру (+' + money(cityDelivery) + ')',
      nearby: 'доставка за пределы Армавира (стоимость уточним при подтверждении)'
    };
    lines.push('Дата: ' + dateLabel(draft.date));
    lines.push('Желаемое время: ' + (draft.time || 'уточнить'));
    lines.push('Получение: ' + (fmap[draft.fulfillment] || 'уточнить'));
    if (draft.fulfillment !== 'pickup' && draft.address.trim()) lines.push('Адрес: ' + draft.address.trim());
    var cost = draft.fulfillment === 'nearby'
      ? 'Предварительная стоимость шаров: ' + money(goodsSum(items)) + ' + доставка.'
      : 'Стоимость: ' + money(grand(items)) + '.';
    var who = [];
    if (draft.name.trim()) who.push('Имя: ' + draft.name.trim());
    if (draft.phone.trim()) who.push('Телефон: ' + draft.phone.trim());
    return 'Здравствуйте! Хочу заказать шары поштучно:\n' + lines.join('\n') + '\n' + cost +
      (who.length ? '\n' + who.join('\n') : '');
  }

  function ready() {
    if (!load().length) return 'Набор пуст';
    if (!draft.fulfillment) return 'Выберите получение';
    if (draft.fulfillment !== 'pickup' && !draft.address.trim()) return 'Укажите адрес';
    if (!draft.date) return 'Выберите дату';
    if (!draft.time) return 'Выберите время';
    var d = phoneDigits(draft.phone);
    if (!(d.length === 11 && d.charAt(0) === '7')) return 'Укажите телефон';
    return '';
  }

  function paintBar() {
    var items = load();
    var bar = document.getElementById('unit-list-bar');
    if (!items.length) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('button');
      bar.type = 'button';
      bar.id = 'unit-list-bar';
      bar.className = 'unit-list-bar';
      bar.addEventListener('click', openPanel);
      document.body.appendChild(bar);
    }
    bar.textContent = 'Набор · ' + pieces(items);
  }

  function qtyOf(id) {
    var items = load();
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(id)) return Number(items[i].qty) || 0;
    }
    return 0;
  }
  function change(id, delta) {
    var items = load();
    var i;
    for (i = 0; i < items.length; i++) if (String(items[i].id) === String(id)) break;
    if (i >= items.length) return;
    items[i].qty = (Number(items[i].qty) || 0) + delta;
    if (items[i].qty < 1) items.splice(i, 1);
    else items[i].qty = Math.min(100, items[i].qty);
    save(items);
  }
  function paintSteps() {
    document.querySelectorAll('[data-unit-step]').forEach(function (el) {
      var id = el.getAttribute('data-id') || '';
      var q = qtyOf(id);
      var pack = ' data-id="' + esc(id) + '" data-slug="' + esc(el.getAttribute('data-slug') || '') + '" data-title="' + esc(el.getAttribute('data-title') || '') + '" data-sku="' + esc(el.getAttribute('data-sku') || '') + '" data-price="' + esc(el.getAttribute('data-price') || '0') + '" data-meter="' + esc(el.getAttribute('data-meter') || '0') + '" data-thumb="' + esc(el.getAttribute('data-thumb') || '') + '"';
      var digitCard = el.getAttribute('data-digit') === '1';
      var picked = null;
      if (digitCard) {
        var all = load();
        for (var j = 0; j < all.length; j++) {
          if (String(all[j].id) === String(id)) { picked = all[j]; break; }
        }
      }
      el.innerHTML = digitCard
        ? (picked
          ? '<b class="unit-digit-picked">' + esc(picked.digit2 ? (picked.digit + picked.digit2) : picked.digit) + '</b><button type="button" data-unit-dec="1" data-id="' + esc(id) + '" aria-label="Убрать">×</button>'
          : '<button type="button" class="is-plus" data-unit-digit="1"' + pack + ' aria-label="Выбрать цифру">+</button>')
        : (q
        ? '<button type="button" data-unit-dec="1" data-id="' + esc(id) + '" aria-label="Меньше">−</button><b>' + q + '</b><button type="button" data-unit-add="1"' + pack + ' aria-label="Больше">+</button>'
        : '<button type="button" class="is-plus" data-unit-add="1"' + pack + ' aria-label="В набор">+</button>');
    });
  }

  var calOpen = false;
  var timeOpen = false;
  var calView = { y: 0, m: 0 };
  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_S = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateCard() {
    if (!draft.date) return { title: 'Дата', hint: 'выбрать' };
    var a = draft.date.split('-');
    if (a.length !== 3) return { title: draft.date, hint: '' };
    return { title: Number(a[2]) + ' ' + MONTHS_S[Number(a[1]) - 1], hint: a[0] };
  }
  function calendarHtml() {
    var src = (draft.date || todayMin()).split('-');
    if (!calView.y) {
      calView.y = Number(src[0]) || new Date().getFullYear();
      calView.m = Number(src[1]) || (new Date().getMonth() + 1);
    }
    var y = calView.y, m = calView.m;
    var firstWd = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    var dim = new Date(y, m, 0).getDate();
    var cells = '';
    var i;
    for (i = 0; i < firstWd; i++) cells += '<span></span>';
    for (i = 1; i <= dim; i++) {
      var iso = y + '-' + pad2(m) + '-' + pad2(i);
      cells += '<button type="button" data-u="day" data-v="' + iso + '"' + (iso === draft.date ? ' class="is-on"' : '') + (iso < todayMin() ? ' disabled' : '') + '>' + i + '</button>';
    }
    var card = dateCard();
    return '<div class="unit-cal' + (calOpen ? ' is-open' : '') + '">' +
      '<button type="button" class="unit-dt' + (draft.date ? ' is-on' : '') + '" data-u="date-toggle">' +
      '<img src="icons/dt-date.webp?v=2" alt="" width="40" height="40"/><span><strong>' + esc(card.title) + '</strong><small>' + esc(card.hint) + '</small></span></button>' +
      '<div class="unit-cal-pop"><div class="unit-cal-head"><button type="button" data-u="cal-prev" aria-label="Предыдущий месяц">‹</button><strong>' + MONTHS[m - 1] + ' ' + y + '</strong><button type="button" data-u="cal-next" aria-label="Следующий месяц">›</button></div>' +
      '<div class="unit-cal-week">' + WEEK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="unit-cal-grid">' + cells + '</div></div></div>';
  }
  function timeHtml() {
    var slots = '';
    var h;
    for (h = 9; h <= 21; h++) {
      ['00', '30'].forEach(function (mm) {
        if (h === 21 && mm === '30') return;
        var t = pad2(h) + ':' + mm;
        slots += '<button type="button" data-u="slot" data-v="' + t + '"' + (draft.time === t ? ' class="is-on"' : '') + '>' + t + '</button>';
      });
    }
    return '<div class="unit-cal' + (timeOpen ? ' is-open' : '') + '">' +
      '<button type="button" class="unit-dt' + (draft.time ? ' is-on' : '') + '" data-u="time-toggle">' +
      '<img src="icons/dt-time.webp?v=2" alt="" width="40" height="40"/><span><strong>' + esc(draft.time || 'Время') + '</strong><small>' + (draft.time ? 'выбрано' : 'выбрать') + '</small></span></button>' +
      '<div class="unit-cal-pop"><div class="unit-time-grid">' + slots + '</div></div></div>';
  }

  function rowsHtml(items) {
    return items.map(function (it, i) {
      var unit = it.perMeter ? 'м' : 'шт.';
      var thumb = it.thumb ? '<img class="unit-list-thumb" src="' + esc(it.thumb) + '" alt=""/>' : '<span class="unit-list-thumb"></span>';
      var which = it.digit ? ('<small>' + esc(it.digit2 ? ('цифры ' + it.digit + ' и ' + it.digit2 + ' · +900 ₽') : ('цифра ' + it.digit)) + '</small>') : '';
      return '<div class="unit-list-row">' + thumb + '<div><strong>' + esc(it.title) + '</strong>' + which + '<small>' +
        money(it.price) + ' × ' + it.qty + ' ' + unit + ' = ' + money(lineTotal(it)) + '</small></div>' +
        (it.digit
          ? '<div class="unit-list-qty"><button type="button" data-u="del" data-i="' + i + '" aria-label="Убрать">×</button></div></div>'
          : '<div class="unit-list-qty"><button type="button" data-u="dec" data-i="' + i + '" aria-label="Меньше">−</button>' +
        '<span>' + it.qty + '</span>' +
        '<button type="button" data-u="inc" data-i="' + i + '" aria-label="Больше">+</button>' +
        '<button type="button" data-u="del" data-i="' + i + '" aria-label="Убрать">×</button></div></div>');
    }).join('');
  }

  function openPanel() {
    if (document.querySelector('.unit-list-wrap')) return;
    var items = load();
    if (!items.length) return;
    var step = 'items';
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop unit-list-wrap';
    wrap.setAttribute('role', 'presentation');
    function modalEl() { return wrap.querySelector('.unit-list-modal'); }
    function revealIn(kind) {
      var modal = modalEl();
      if (!modal || !kind) return;
      var el = null;
      if (kind === 'address') el = modal.querySelector('[data-u="address"]');
      else if (kind === 'date') el = modal.querySelector('[data-u="date-toggle"]');
      else if (kind === 'cal' || kind === 'slots') el = modal.querySelector('.unit-cal.is-open .unit-cal-pop');
      else if (kind === 'time') el = modal.querySelector('[data-u="time-toggle"]');
      else if (kind === 'phone') el = modal.querySelector('[data-u="phone"]');
      else if (kind === 'go') el = modal.querySelector('[data-u="go"], .unit-list-choice');
      if (!el) return;
      var pad = 16;
      var m = modal.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      if (r.height > m.height - pad * 2) modal.scrollTop += r.top - m.top - pad;
      else if (r.bottom > m.bottom - pad) modal.scrollTop += r.bottom - m.bottom + pad;
      else if (r.top < m.top + pad) modal.scrollTop -= m.top + pad - r.top;
    }
    function paintFulfillment() {
      var modal = modalEl();
      if (!modal) return;
      modal.querySelectorAll('[data-u="ful"]').forEach(function (btn) {
        btn.classList.toggle('is-on', btn.getAttribute('data-v') === draft.fulfillment);
      });
      var form = modal.querySelector('.unit-list-form');
      var when = modal.querySelector('.unit-list-when');
      var addr = modal.querySelector('[data-u="address"]');
      var needAddr = draft.fulfillment && draft.fulfillment !== 'pickup';
      if (needAddr) {
        if (!addr && form && when) {
          addr = document.createElement('input');
          addr.setAttribute('data-u', 'address');
          addr.maxLength = 140;
          addr.value = draft.address;
          form.insertBefore(addr, when);
          wireAddress(addr);
        }
        if (addr) {
          addr.placeholder = draft.fulfillment === 'armavir' ? 'Улица, дом, квартира' : 'Населённый пункт и адрес';
        }
      } else if (addr) {
        addr.remove();
      }
      var sums = modal.querySelectorAll('.unit-list-sum');
      var sum = sums[sums.length - 1];
      if (sum && step === 'order') {
        var itemsNow = load();
        var nearby = draft.fulfillment === 'nearby';
        sum.innerHTML = '<span>' + (nearby ? 'Шары' : 'Итого') + '</span><strong>' +
          money(nearby ? goodsSum(itemsNow) : grand(itemsNow)) +
          (draft.fulfillment === 'armavir' ? ' <small>с доставкой</small>' : '') + '</strong>';
      }
      syncGo(wrap);
      revealIn(needAddr ? 'address' : 'date');
    }
    function wireAddress(el) {
      el.addEventListener('input', function () {
        draft.address = el.value;
        syncGo(wrap);
      });
      el.addEventListener('blur', function () {
        if (String(draft.address || '').trim()) revealIn('date');
      });
    }
    function draw(reveal) {
      var prev = modalEl();
      var keep = prev ? prev.scrollTop : 0;
      items = load();
      if (!items.length) { close(); return; }
      var err = ready();
      var body = step === 'items'
        ? '<div class="unit-list-rows">' + rowsHtml(items) + '</div>' +
          '<p class="unit-list-sum"><span>Шары</span><strong>' + money(goodsSum(items)) + '</strong></p>' +
          '<button type="button" class="button button-primary unit-list-go" data-u="next">Дальше к заявке</button>' +
          '<p class="modal-note">Количество можно поменять. Убрать шар — крестиком.</p>'
        : '<button type="button" class="unit-list-back" data-u="back">← К набору</button>' +
          '<div class="unit-list-preview">' + items.map(function (it) {
            var thumb = it.thumb
              ? '<img class="unit-list-thumb" src="' + esc(it.thumb) + '" alt=""/>'
              : '<span class="unit-list-thumb"></span>';
            return '<span class="unit-list-line">' + thumb + '<b>' + it.qty + ' ' + (it.perMeter ? 'м' : 'шт.') + ' × ' + esc(it.title) + '</b></span>';
          }).join('') + '</div>' +
          '<div class="unit-list-form">' +
          '<div class="unit-list-ful fulfillment-options" role="group" aria-label="Получение">' +
          fulBtn('pickup', 'Самовывоз', 'Бесплатно', 'icons/ful-pickup.webp?v=4') +
          fulBtn('armavir', 'По городу', '+' + money(cityDelivery), 'icons/ful-city.webp?v=4') +
          fulBtn('nearby', 'За город', 'Рассчитаем', 'icons/ful-far.webp?v=4') +
          '</div>' +
          (draft.fulfillment && draft.fulfillment !== 'pickup'
            ? '<input data-u="address" maxlength="140" placeholder="' + (draft.fulfillment === 'armavir' ? 'Улица, дом, квартира' : 'Населённый пункт и адрес') + '" value="' + esc(draft.address) + '"/>'
            : '') +
          '<div class="unit-list-when">' + calendarHtml() + timeHtml() + '</div>' +
          '<input data-u="phone" type="tel" inputmode="tel" maxlength="17" placeholder="+7 928 000-00-00" value="' + esc(draft.phone) + '" aria-label="Телефон"/>' +
          '<input data-u="name" type="text" maxlength="80" placeholder="Имя, если удобно" value="' + esc(draft.name) + '" aria-label="Имя"/>' +
          '<input class="order-hp" data-u="hp" tabindex="-1" autocomplete="off" value="' + esc(draft.hp) + '" aria-hidden="true"/>' +
          '</div>' +
          '<p class="unit-list-sum"><span>' + (draft.fulfillment === 'nearby' ? 'Шары' : 'Итого') + '</span><strong>' +
          money(draft.fulfillment === 'nearby' ? goodsSum(items) : grand(items)) +
          (draft.fulfillment === 'armavir' ? ' <small>с доставкой</small>' : '') + '</strong></p>' +
          (err ? '<p class="unit-list-hint">' + esc(err) + '</p>' : '') +
          '<button type="button" class="button button-primary unit-list-go"' + (err ? ' disabled' : '') + ' data-u="go">Оформить набор</button>' +
          '<p class="modal-note">Оплата не списывается: сначала подтвердим наличие и время.</p>';
      wrap.innerHTML =
        '<section class="contact-modal unit-list-modal" role="dialog" aria-modal="true" aria-labelledby="unit-list-title">' +
        '<button class="modal-close" type="button" aria-label="Закрыть">×</button>' +
        '<p class="eyebrow">Шары поштучно</p>' +
        '<h2 id="unit-list-title">' + (step === 'items' ? 'Набор' : 'Заявка') + '</h2>' +
        body + '</section>';
      wrap.querySelector('.modal-close').addEventListener('click', close);
      bind(wrap);
      if (reveal) revealIn(reveal);
      else if (keep) {
        var next = modalEl();
        if (next) next.scrollTop = keep;
      }
    }
    function fulBtn(id, label, note, icon) {
      return '<button type="button" data-u="ful" data-v="' + id + '"' + (draft.fulfillment === id ? ' class="is-on"' : '') + '><img src="' + icon + '" alt="" width="40" height="40"/><strong>' + label + '</strong><small>' + note + '</small></button>';
    }
    function syncGo(root) {
      var hint = root.querySelector('.unit-list-hint');
      var go = root.querySelector('[data-u="go"]');
      var err = ready();
      if (hint) hint.textContent = err;
      if (go) go.disabled = !!err;
    }
    function close() { wrap.remove(); document.body.style.overflow = ''; }
    function bind(root) {
      root.querySelectorAll('[data-u]').forEach(function (el) {
        var act = el.getAttribute('data-u');
        if (act === 'dec' || act === 'inc' || act === 'del') {
          el.addEventListener('click', function () {
            var i = Number(el.getAttribute('data-i'));
            var list = load();
            if (!list[i]) return;
            if (list[i].digit) {
              if (act !== 'inc') list.splice(i, 1);
            } else if (act === 'del') list.splice(i, 1);
            else if (act === 'dec') list[i].qty = Math.max(1, list[i].qty - 1);
            else list[i].qty = Math.min(100, list[i].qty + 1);
            save(list);
            draw();
          });
        } else if (act === 'date-toggle') {
          el.addEventListener('click', function () {
            calOpen = !calOpen;
            timeOpen = false;
            draw(calOpen ? 'cal' : '');
          });
        } else if (act === 'time-toggle') {
          el.addEventListener('click', function () {
            timeOpen = !timeOpen;
            calOpen = false;
            draw(timeOpen ? 'slots' : '');
          });
        } else if (act === 'cal-prev' || act === 'cal-next') {
          el.addEventListener('click', function () {
            calView.m += act === 'cal-next' ? 1 : -1;
            if (calView.m < 1) { calView.m = 12; calView.y -= 1; }
            if (calView.m > 12) { calView.m = 1; calView.y += 1; }
            calOpen = true;
            draw('cal');
          });
        } else if (act === 'day') {
          el.addEventListener('click', function () {
            if (el.disabled) return;
            draft.date = el.getAttribute('data-v') || '';
            calOpen = false;
            draw('time');
          });
        } else if (act === 'slot') {
          el.addEventListener('click', function () {
            draft.time = el.getAttribute('data-v') || '';
            timeOpen = false;
            draw('phone');
          });
        } else if (act === 'ful') {
          el.addEventListener('click', function () {
            draft.fulfillment = el.getAttribute('data-v') || '';
            if (draft.fulfillment === 'pickup') draft.address = '';
            paintFulfillment();
          });
        } else if (act === 'next') {
          el.addEventListener('click', function () { step = 'order'; draw(); });
        } else if (act === 'back') {
          el.addEventListener('click', function () { step = 'items'; draw(); });
        } else if (act === 'go') {
          el.addEventListener('click', function () { if (!ready()) openChoice(); });
        } else if (act === 'phone') {
          el.addEventListener('focus', function () {
            if (!el.value) {
              el.value = '+7 ';
              draft.phone = '+7 ';
              try { el.setSelectionRange(3, 3); } catch (e) {}
            }
          });
          el.addEventListener('input', function () {
            var formatted = formatPhone(el.value);
            if (formatted !== el.value) {
              el.value = formatted;
              try { el.setSelectionRange(formatted.length, formatted.length); } catch (e) {}
            }
            draft.phone = el.value;
            syncGo(root);
            if (phoneDigits(draft.phone).length >= 11) revealIn('go');
          });
          el.addEventListener('blur', function () {
            if (el.value === '+7' || el.value === '+7 ') {
              el.value = '';
              draft.phone = '';
            }
            syncGo(root);
            if (phoneDigits(draft.phone).length >= 11) revealIn('go');
          });
        } else if (act === 'address') {
          wireAddress(el);
        } else {
          el.addEventListener('input', function () {
            draft[act] = el.value;
            if (act === 'name') syncGo(root);
          });
        }
      });
    }
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    draw();

    function openChoice() {
      var text = message(load());
      var choice = document.createElement('div');
      choice.className = 'unit-list-choice';
      choice.innerHTML =
        '<button type="button" class="button button-primary" data-c="site">Оставить заявку на сайте</button>' +
        '<button type="button" class="unit-list-link" data-c="msg">Отправить в мессенджер</button>';
      var box = wrap.querySelector('.unit-list-modal');
      var go = box.querySelector('[data-u="go"]');
      if (go) go.replaceWith(choice);
      else return;
      choice.scrollIntoView({ block: 'nearest' });
      choice.querySelector('[data-c="site"]').addEventListener('click', submitSite);
      choice.querySelector('[data-c="msg"]').addEventListener('click', function () {
        var msg = encodeURIComponent(text);
        choice.innerHTML =
          '<div class="unit-list-apps">' +
          '<a target="_blank" rel="noreferrer" data-c="wa" href="https://wa.me/' + PHONE + '?text=' + msg + '" aria-label="WhatsApp"><img src="icons/brand-whatsapp.webp?v=9" alt="" width="44" height="44"/></a>' +
          '<a target="_blank" rel="noreferrer" data-c="tg" href="' + TG_URL + '?text=' + msg + '" aria-label="Telegram"><img src="icons/brand-telegram.webp?v=9" alt="" width="44" height="44"/></a>' +
          '<a target="_blank" rel="noreferrer" data-c="max" href="' + MAX_URL + '" aria-label="MAX"><img src="icons/brand-max.webp?v=9" alt="" width="44" height="44"/></a>' +
          '</div>';
        choice.querySelectorAll('a[data-c]').forEach(function (a) {
          a.addEventListener('click', function () {
            var kind = a.getAttribute('data-c');
            var hint = kind === 'max'
              ? 'Текст заказа скопирован. Зажмите поле ввода в MAX и нажмите «Вставить».'
              : 'Текст заказа скопирован. Если он не подставился — вставьте его в чат.';
            if (window.vigCopy) window.vigCopy(text).then(function () { if (window.vigToast) window.vigToast(hint); });
            save([]);
            close();
          });
        });
      });
    }

    function submitSite() {
      if (String(draft.hp || '').trim()) { save([]); close(); return; }
      var items = load();
      var btn = wrap.querySelector('[data-c="site"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
      var api = (window.VIG_API || 'https://vigsharm-api.vigsharm.workers.dev').replace(/\/$/, '');
      var first = items[0] || {};
      fetch(api + '/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: first.id || '',
          product_slug: first.slug || '',
          product_title: 'Шары поштучно',
          product_sku: 'UNT',
          quantity: pieces(items),
          fulfillment: draft.fulfillment,
          address: draft.address,
          order_date: draft.date,
          order_time: draft.time,
          customer_name: draft.name,
          customer_phone: phoneDigits(draft.phone),
          total: draft.fulfillment === 'nearby' ? goodsSum(items) : grand(items),
          price_from: draft.fulfillment === 'nearby' ? 1 : 0,
          message: message(items),
          website: draft.hp
        })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || 'Не получилось отправить');
        save([]);
        close();
        if (window.vigToast) window.vigToast('Заявка принята' + (data.code ? ' #' + data.code : '') + '. Перезвоним.');
      }).catch(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Оставить заявку на сайте'; }
        if (window.vigToast) window.vigToast(e.message || 'Нет связи. Позвоните нам или напишите в WhatsApp.');
      });
    }
  }

  function loadDelivery() {
    fetch('data/delivery.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
      .then(function (data) {
        var n = Math.round(Number(data && data.city));
        if (Number.isFinite(n) && n >= 0) cityDelivery = n;
      })
      .catch(function () {});
  }

  function pickDigits(item) {
    var old = document.querySelector('.unit-digit-pop');
    if (old) old.remove();
    var first = '';
    var pop = document.createElement('div');
    pop.className = 'unit-digit-pop';
    function pad(selected) {
      var html = '';
      for (var n = 0; n <= 9; n++) {
        html += '<button type="button" data-n="' + n + '"' + (String(selected) === String(n) ? ' class="is-on"' : '') + '>' + n + '</button>';
      }
      return html;
    }
    function drawFirst() {
      pop.innerHTML = '<div class="unit-digit-sheet" role="dialog" aria-label="Какая цифра">' +
        '<p>Какая цифра нужна?</p><div class="unit-digit-pad">' + pad(first) + '</div>' +
        '<button type="button" class="unit-digit-cancel" data-x="1">Отмена</button></div>';
    }
    function drawSecond() {
      pop.innerHTML = '<div class="unit-digit-sheet" role="dialog" aria-label="Вторая цифра">' +
        '<p>Цифра ' + esc(first) + '. Добавить вторую?</p>' +
        '<div class="unit-digit-actions">' +
        '<button type="button" data-one="1">Оставить одну</button>' +
        '<button type="button" data-two="1">Вторую <small>+900 ₽</small></button></div>' +
        '<button type="button" class="unit-digit-cancel" data-x="1">Отмена</button></div>';
    }
    function drawSecondPad() {
      pop.innerHTML = '<div class="unit-digit-sheet" role="dialog" aria-label="Вторая цифра">' +
        '<p>Вторая цифра <small>+900 ₽</small></p><div class="unit-digit-pad">' + pad('') + '</div>' +
        '<button type="button" class="unit-digit-cancel" data-back="1">Назад</button></div>';
    }
    pop.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('button') : null;
      if (e.target === pop) { pop.remove(); return; }
      if (!t) return;
      if (t.getAttribute('data-x') === '1') { pop.remove(); return; }
      if (t.getAttribute('data-one') === '1') {
        pop.remove();
        add(Object.assign({}, item, { digit: first, digit2: '' }));
        return;
      }
      if (t.getAttribute('data-two') === '1') { drawSecondPad(); return; }
      if (t.getAttribute('data-back') === '1') { drawSecond(); return; }
      if (t.getAttribute('data-n') != null && !first) {
        first = t.getAttribute('data-n');
        drawSecond();
        return;
      }
      if (t.getAttribute('data-n') != null && first) {
        var second = t.getAttribute('data-n');
        pop.remove();
        add(Object.assign({}, item, { digit: first, digit2: second }));
      }
    });
    drawFirst();
    document.body.appendChild(pop);
  }

  document.addEventListener('click', function (e) {
    var dec = e.target && e.target.closest ? e.target.closest('[data-unit-dec]') : null;
    if (!dec) return;
    e.preventDefault();
    e.stopPropagation();
    change(dec.getAttribute('data-id'), -1);
  });
  window.vigUnitList = { add: add, change: change, pickDigits: pickDigits, mount: function () { paintBar(); paintSteps(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { paintBar(); paintSteps(); loadDelivery(); });
  else { paintBar(); paintSteps(); loadDelivery(); }
})();
