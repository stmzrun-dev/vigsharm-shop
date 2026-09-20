/* VigSharm product page: gallery, configurator, order flow — port of original behaviour */
(function () {
  'use strict';

  var PHONE = '79284440142', PHONE_LABEL = '+7 928 444-01-42';
  var MAX_URL = 'https://max.ru/u/f9LHodD0cOJwY09H6Zj63nYK_X8tPZGb3CODIvTT7FWkRzrgbh5F582AiB8';
  var TG_URL = 'https://t.me/Olgamzz';
  var WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a9.75 9.75 0 0 0-8.47 14.58L2.2 21.8l5.35-1.28A9.78 9.78 0 1 0 12 2Zm0 17.5a7.7 7.7 0 0 1-3.92-1.08l-.37-.22-3.08.74.77-3-.24-.38A7.75 7.75 0 1 1 12 19.5Zm4.25-5.78c-.23-.12-1.37-.67-1.58-.75-.21-.08-.36-.12-.52.12-.15.23-.6.75-.73.9-.14.16-.27.18-.5.06-1.39-.69-2.3-1.23-3.22-2.8-.24-.42.24-.39.69-1.3.08-.16.04-.3-.02-.42-.06-.12-.52-1.25-.71-1.71-.19-.45-.38-.39-.52-.4h-.45c-.16 0-.41.06-.62.29-.21.23-.81.79-.81 1.92 0 1.14.83 2.23.94 2.39.12.15 1.63 2.48 3.94 3.48 1.47.63 2.04.69 2.77.58.44-.07 1.37-.56 1.56-1.1.19-.54.19-1 .13-1.1-.06-.09-.21-.15-.44-.26Z"></path></svg>';
  var TG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.67 3.55 2.8 10.44c-1.22.49-1.21 1.16-.22 1.46l4.58 1.43 1.76 5.42c.21.58.1.81.72.81.48 0 .69-.22.96-.48l2.2-2.14 4.58 3.38c.84.46 1.45.22 1.66-.78l3-14.14c.31-1.23-.47-1.79-1.37-1.85ZM8.1 13l10.32-6.51c.52-.31 1-.15.61.2l-8.51 7.68-.33 3.54L8.1 13Z"></path></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function compIcon(i) {
    return '<img class="comp-ico" src="icons/comp-deco-' + ((i || 0) % 4) + '.svg?v=1" alt="" width="28" height="28"/>';
  }

  var root = document.getElementById('product-root');
  var slug = new URLSearchParams(window.location.search).get('slug') || '';

  // state
  var p = null, allProducts = [];
  var imgIdx = 0;
  var digit = '', digit2 = '', digitDelta = 0;
  var inscription = '', orderDate = '', orderTime = '';
  var fulfillment = '', address = '', qty = 1;
  var draftRestored = false, draftReady = false;
  var shareState = '', copyState = '';
  var todayMin = '';
  var photoGrown = false;
  var datePickerOpen = false;
  var timePickerOpen = false;
  var calView = { y: 0, m: 0 };
  var dateDocBound = false;
  var MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var WEEK_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  /** Mobile hybrid 5+6: stories until required picks done, then compact summary. */
  var flowEditTarget = '';
  var flowMedia = null;
  var deltaAck = false;

  (function () {
    var d = new Date();
    todayMin = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  })();

  function isUnit() { return p && (p.category === 'Шары поштучно' || (p.tags || []).indexOf('Шары поштучно') >= 0); }
  function isPerMeter() { return !!(p && (p.tags || []).indexOf('Цена за метр') >= 0); }
  function priceFrom() { return !!(p && (p.tags || []).indexOf('Цена от') >= 0); }
  function hasParams() { return !!(p && (p.has_digit_choice || p.has_inscription || p.has_rental || isUnit())); }
  function digitBase() { return p && p.has_digit_choice ? (p.digit_count_on_photo || 0) : 0; }
  function canChangeCount() {
    // Напольные и «только стена»: количество цифр из состава, клиент не меняет
    return !!(p && p.has_digit_choice && !p.digit_count_locked && !p.is_floor_composition);
  }
  function canAdd() { return canChangeCount() && digitBase() === 1; }
  function canRemove() { return canChangeCount() && digitBase() === 2; }
  function effDelta() {
    if (canAdd()) return Math.max(0, digitDelta);
    if (canRemove()) return Math.min(0, digitDelta);
    return 0;
  }
  function effDigits() { return digitBase() + effDelta(); }
  function digitsOk() {
    if (!p || !p.has_digit_choice) return true;
    if (!digit) return false;
    if (effDigits() >= 2 && !digit2) return false;
    return true;
  }
  function fulfillmentOk() { return !!(fulfillment && (fulfillment === 'pickup' || address.trim())); }
  function inscriptionOk() { return !(p && p.has_inscription) || !!String(inscription || '').trim(); }
  function isOrderReady() { return digitsOk() && inscriptionOk() && fulfillmentOk(); }
  function useMobileFlow() {
    if (typeof window.matchMedia !== 'function') return false;
    if (!flowMedia) flowMedia = window.matchMedia('(max-width:650px)');
    return !!flowMedia.matches;
  }
  function flowStepList() {
    var steps = [];
    if (p && p.has_digit_choice) {
      steps.push('digit1');
      if (canAdd() || canRemove()) steps.push('delta');
      if (effDigits() >= 2) steps.push('digit2');
    }
    if (isUnit()) steps.push('qty');
    if (p && p.has_inscription) steps.push('inscription');
    steps.push('fulfill');
    if (fulfillment && fulfillment !== 'pickup') steps.push('address');
    return steps;
  }
  function flowStepDone(step) {
    if (step === 'digit1') return !!digit;
    if (step === 'delta') return !(canAdd() || canRemove()) || deltaAck;
    if (step === 'digit2') return !!digit2;
    if (step === 'qty') return qty >= 1;
    if (step === 'inscription') return inscriptionOk();
    if (step === 'fulfill') return !!fulfillment;
    if (step === 'address') return !!address.trim();
    return true;
  }
  function currentFlowStep() {
    if (flowEditTarget) return flowEditTarget;
    var steps = flowStepList();
    var i;
    for (i = 0; i < steps.length; i++) {
      if (!flowStepDone(steps[i])) return steps[i];
    }
    return 'done';
  }
  function flowInStories() {
    return false;
  }
  function digitsChipLabel() {
    if (!p || !p.has_digit_choice) return '';
    if (!digitsOk()) return '··';
    return effDigits() >= 2 ? (digit + ' и ' + digit2) : digit;
  }
  function orderCta(kind) {
    if (!digitsOk()) return kind === 'short' ? 'Выберите цифру' : ('Выберите ' + (effDigits() === 2 ? 'обе цифры' : 'цифру'));
    if (!inscriptionOk()) return 'Напишите надпись';
    if (!fulfillment) return kind === 'short' ? 'Выберите получение' : 'Выберите способ получения';
    if (!fulfillmentOk()) return kind === 'short' ? 'Укажите адрес' : 'Укажите адрес доставки';
    return kind === 'short' ? 'Заказать' : 'Заказать в мессенджер →';
  }
  function digitDeltaPrice() { return effDelta() * 900; }
  function inscriptionPrice() { return (p && p.has_inscription && inscription.trim()) ? (p.inscription_price || 0) : 0; }
  function deliveryPrice() { return fulfillment === 'armavir' ? 200 : 0; }
  function total() { return (p ? p.price : 0) * (isUnit() ? qty : 1) + digitDeltaPrice() + inscriptionPrice() + deliveryPrice(); }

  function mainImageKey() {
    var keys = (p && p.image_keys) || [];
    return keys[0] || '';
  }
  /** Resolve gallery key: digit variant if present, else current slide, else main. Never empty when product has photos. */
  function resolveGalleryKey() {
    var keys = (p && p.image_keys) || [];
    var main = keys[0] || '';
    var digMap = p && p.digit_images;
    if (digMap && typeof digMap === 'object') {
      var pair = (digit || '') + (effDigits() >= 2 && digit2 ? digit2 : '');
      if (pair && digMap[pair]) return digMap[pair];
      if (digit && digMap[digit]) return digMap[digit];
    }
    if (imgIdx < 0 || imgIdx >= keys.length) imgIdx = 0;
    return keys[imgIdx] || main;
  }
  function galleryImgHtml(key, alt, attrs) {
    var main = mainImageKey();
    var show = key || main;
    if (!show) return window.vigEmoji('balloon');
    var extra = attrs || '';
    // Inline onerror: digit/variant failure → main composition photo (never empty block).
    var onerr = 'var m=this.getAttribute(\'data-main-key\');var k=this.getAttribute(\'data-key\');if(m&&k!==m){this.onerror=null;this.setAttribute(\'data-key\',m);this.setAttribute(\'data-fb\',\'0\');this.src=(window.vigImage?window.vigImage(m):m);}';
    return '<img src="' + window.vigImage(show) + '" data-key="' + esc(show) + '" data-main-key="' + esc(main) + '" alt="' + esc(alt || '') + '" decoding="async" onerror="' + onerr + '" ' + extra + '/>';
  }

  function paramsSummary() {
    var parts = [];
    if (isUnit()) parts.push(isPerMeter() ? 'длина' : 'количество');
    if (p.has_digit_choice) parts.push('цифры');
    if (p.has_inscription) parts.push('надпись');
    if (p.has_rental) parts.push('условия аренды');
    if (!parts.length) return 'Доступные варианты';
    var s = parts.join(', ');
    return s.replace(/, ([^,]*)$/, ' и $1');
  }
  function paramsTitle() {
    if (p.has_digit_choice && digitsOk()) {
      return 'Выбрано: ' + (effDigits() === 2 ? digit + digit2 : digit);
    }
    return paramsSummary();
  }
  function fulfillmentTitle() {
    if (fulfillment === 'pickup') return 'Самовывоз из студии';
    if (fulfillment === 'armavir') return address.trim() ? 'Доставка: ' + address.trim() : 'Укажите адрес по Армавиру';
    if (fulfillment === 'nearby') return address.trim() ? 'За город: ' + address.trim() : 'Укажите населённый пункт';
    return 'Когда подготовить и куда доставить';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateLabel() {
    if (!orderDate) return 'уточнить';
    var a = String(orderDate).split('-');
    if (a.length === 3) return a[2] + '.' + a[1] + '.' + a[0];
    try { return new Date(orderDate + 'T12:00:00').toLocaleDateString('ru-RU'); } catch (e) { return orderDate; }
  }
  function dateCardLabel() {
    if (!orderDate) return { title: 'Дата', hint: 'позже' };
    var a = String(orderDate).split('-');
    if (a.length === 3) {
      var short = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      return { title: Number(a[2]) + ' ' + short[Number(a[1]) - 1], hint: a[0] };
    }
    return { title: dateLabel(), hint: '' };
  }
  function timeCardLabel() {
    if (!orderTime) return { title: 'Время', hint: 'позже' };
    return { title: timeLabel(), hint: '\u00a0' };
  }
  function ensureCalView() {
    var src = String(orderDate || todayMin).split('-');
    if (!calView.y) {
      calView.y = Number(src[0]) || new Date().getFullYear();
      calView.m = Number(src[1]) || (new Date().getMonth() + 1);
    }
  }
  function calendarHtml() {
    ensureCalView();
    var y = calView.y, m = calView.m;
    var firstWd = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    var dim = new Date(y, m, 0).getDate();
    var cells = '';
    var i;
    for (i = 0; i < firstWd; i++) cells += '<span class="cal-empty"></span>';
    for (i = 1; i <= dim; i++) {
      var iso = y + '-' + pad2(m) + '-' + pad2(i);
      var disabled = iso < todayMin;
      var selected = iso === orderDate;
      cells += '<button type="button" class="cal-day' + (selected ? ' is-selected' : '') + (iso === todayMin ? ' is-today' : '') + '" data-act="date-day" data-v="' + iso + '"' + (disabled ? ' disabled' : '') + '>' + i + '</button>';
    }
    var dCard = dateCardLabel();
    return '<div class="order-date-picker' + (datePickerOpen ? ' is-open' : '') + (orderDate ? ' has-value' : '') + '">' +
      '<button type="button" class="order-date-toggle order-dt-card' + (orderDate ? ' is-picked' : '') + '" data-act="date-toggle" aria-expanded="' + datePickerOpen + '" aria-haspopup="dialog" aria-label="' + (orderDate ? 'Дата: ' + dateLabel() : 'Выбрать дату') + '">' +
      '<span class="ful-icon dt-icon" aria-hidden="true"><img src="icons/dt-date.png?v=1" alt="" width="56" height="56"/></span>' +
      '<strong>' + esc(dCard.title) + '</strong><small>' + esc(dCard.hint) + '</small></button>' +
      '<div class="order-cal" role="dialog" aria-label="Календарь">' +
      '<div class="order-cal-head">' +
      '<button type="button" data-act="cal-prev" aria-label="Предыдущий месяц">‹</button>' +
      '<strong>' + MONTHS_RU[m - 1] + ' ' + y + '</strong>' +
      '<button type="button" data-act="cal-next" aria-label="Следующий месяц">›</button></div>' +
      '<div class="order-cal-week">' + WEEK_RU.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="order-cal-grid">' + cells + '</div>' +
      '<button type="button" class="order-cal-later" data-act="date-clear">Уточнить позже</button>' +
      '</div></div>';
  }
  function timeLabel() {
    if (!orderTime) return 'уточнить';
    var p = String(orderTime).split(':');
    if (p.length >= 2) return pad2(Number(p[0]) || 0) + ':' + pad2(Number(p[1]) || 0);
    return orderTime;
  }
  function timeHtml() {
    var slots = [];
    var h;
    for (h = 9; h <= 21; h++) {
      slots.push(pad2(h) + ':00');
      if (h < 21) slots.push(pad2(h) + ':30');
    }
    var cells = slots.map(function (t) {
      return '<button type="button" class="time-slot' + (orderTime === t ? ' is-selected' : '') + '" data-act="time-slot" data-v="' + t + '">' + t + '</button>';
    }).join('');
    var tCard = timeCardLabel();
    return '<div class="order-date-picker order-time-picker' + (timePickerOpen ? ' is-open' : '') + (orderTime ? ' has-value' : '') + '">' +
      '<button type="button" class="order-date-toggle order-dt-card' + (orderTime ? ' is-picked' : '') + '" data-act="time-toggle" aria-expanded="' + timePickerOpen + '" aria-haspopup="dialog" aria-label="' + (orderTime ? 'Время: ' + timeLabel() : 'Выбрать время') + '">' +
      '<span class="ful-icon dt-icon" aria-hidden="true"><img src="icons/dt-time.png?v=1" alt="" width="56" height="56"/></span>' +
      '<strong>' + esc(tCard.title) + '</strong><small>' + esc(tCard.hint) + '</small></button>' +
      '<div class="order-cal order-time-list" role="dialog" aria-label="Время">' +
      '<div class="order-time-grid">' + cells + '</div>' +
      '<button type="button" class="order-cal-later" data-act="time-clear">Уточнить позже</button>' +
      '</div></div>';
  }
  function fulfillmentLabel() {
    if (fulfillment === 'pickup') return 'Самовывоз';
    if (fulfillment === 'armavir') return 'Доставка по Армавиру';
    if (fulfillment === 'nearby') return 'Доставка за город';
    return 'Уточнить';
  }

  function storyProgressHtml(activeStep) {
    var steps = flowStepList();
    var idx = steps.indexOf(activeStep);
    if (idx < 0) idx = steps.length;
    return '<div class="order-story-bars" aria-hidden="true">' +
      steps.map(function (s, i) {
        return '<i class="' + (i < idx ? 'is-done' : i === idx ? 'is-on' : '') + '"></i>';
      }).join('') + '</div>';
  }

  function storyDigitsPad(act, selected) {
    var digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return '<div class="order-story-digits client-digits">' + digits.map(function (d) {
      return '<button type="button" class="order-story-digit' + (selected === d ? ' selected' : '') + '" data-act="' + act + '" data-v="' + d + '" aria-label="Цифра ' + d + '" aria-pressed="' + (selected === d) + '">' +
        '<span class="order-story-digit-ring" aria-hidden="true"></span>' +
        '<span class="order-story-digit-face">' + d + '</span></button>';
    }).join('') + '</div>';
  }

  function storyHtml() {
    return '';
  }

  function clientNextId() {
    if (!digitsOk()) return 'client-digits';
    if (!inscriptionOk()) return 'client-ins';
    if (!fulfillment) return 'client-ful';
    if (!fulfillmentOk()) return 'client-addr';
    return 'client-msg';
  }

  function clientOrderHtml() {
    if (!useMobileFlow()) return '';
    var H = effDelta();
    var B = canAdd();
    var U = effDigits();
    var ready = isOrderReady();
    var next = clientNextId();
    var html = '<div class="client-order">';

    if (isUnit()) {
      html += '<section class="client-block" id="client-qty">' +
        '<h3 class="client-block-title">' + (isPerMeter() ? 'Длина' : 'Количество') + '</h3>' +
        '<label class="client-qty"><input type="number" min="1" max="100" value="' + qty + '" data-act="qty"/></label></section>';
    }

    if (p.has_digit_choice) {
      html += '<section class="client-block' + (next === 'client-digits' ? ' is-next' : digitsOk() ? ' is-done' : '') + '" id="client-digits">' +
        '<h3 class="client-block-title">Цифры на композиции</h3>';

      if (digitsOk()) {
        html += '<button type="button" class="client-digits-done" data-act="digits-edit" aria-label="Изменить цифры">' +
          '<strong>' + esc(digitsChipLabel()) + '</strong><small>изменить</small></button>';
        if (canAdd() && H === 0) {
          html += '<div class="client-delta order-story-delta client-delta-compact">' +
            '<button type="button" class="selected" data-act="delta" data-v="0" aria-pressed="true"><strong>1</strong><small>как на фото</small></button>' +
            '<button type="button" data-act="delta" data-v="1" aria-pressed="false"><strong>2</strong><small>+900 ₽</small></button></div>';
        }
      } else if (U === 2 && digit) {
        html += '<div class="client-digits-progress">' +
          '<button type="button" class="client-digit-mini selected" data-act="digits-edit" aria-label="Изменить первую цифру">' + esc(digit) + '</button>' +
          '<span class="client-digits-sep" aria-hidden="true">→</span>' +
          '<span class="client-digit-label">вторая</span></div>' +
          storyDigitsPad('digit2', digit2);
      } else {
        if (U === 2) html += '<span class="client-digit-label">Первая</span>';
        html += storyDigitsPad('digit', digit);
        if ((canAdd() || canRemove()) && digit) {
          html += '<div class="client-delta order-story-delta client-delta-compact">' +
            '<button type="button" class="' + (H === 0 ? 'selected' : '') + '" data-act="delta" data-v="0" aria-pressed="' + (H === 0) + '"><strong>' + (B ? '1' : '2') + '</strong><small>' + (B ? 'как на фото' : 'две') + '</small></button>' +
            (B
              ? '<button type="button" class="' + (H === 1 ? 'selected' : '') + '" data-act="delta" data-v="1" aria-pressed="' + (H === 1) + '"><strong>2</strong><small>+900 ₽</small></button>'
              : '<button type="button" class="' + (H === -1 ? 'selected' : '') + '" data-act="delta" data-v="-1" aria-pressed="' + (H === -1) + '"><strong>1</strong><small>−900 ₽</small></button>') +
            '</div>';
        }
      }
      html += '</section>';
    }

    if (p.has_inscription) {
      html += '<section class="client-block' + (next === 'client-ins' ? ' is-next' : inscriptionOk() ? ' is-done' : '') + '" id="client-ins">' +
        '<h3 class="client-block-title">Надпись на шаре' + (next === 'client-ins' ? '<span class="client-req" aria-hidden="true">*</span>' : '') + '</h3>' +
        '<label class="client-ins' + (inscriptionOk() ? ' is-filled' : '') + '">' +
        '<span class="client-ins-ico" aria-hidden="true"><img src="icons/line-balloon.svg" alt="" width="22" height="22"/></span>' +
        '<input value="' + esc(inscription) + '" maxlength="60" data-act="inscription" placeholder="С Днём рождения!" inputmode="text" autocomplete="off"/>' +
        '<span class="client-ins-ok" aria-hidden="true">✓</span></label></section>';
    }

    if (p.has_rental) {
      html += '<section class="client-block is-done"><h3 class="client-block-title">Аренда</h3>' +
        '<p class="client-rental"><strong>' + esc(p.rental_item || 'элемент фотозоны') + '</strong> · до ' + (p.rental_days || 3) + ' суток</p></section>';
    }

    html += '<section class="client-block' + (next === 'client-ful' ? ' is-next' : fulfillment ? ' is-done' : '') + '" id="client-ful">' +
      '<h3 class="client-block-title">Как получить' + (next === 'client-ful' ? '<span class="client-req" aria-hidden="true">*</span>' : '') + '</h3>' +
      '<div class="client-ful fulfillment-options' + (!fulfillment ? ' is-pick' : '') + '">' +
      '<button type="button" class="' + (fulfillment === 'pickup' ? 'selected' : '') + '" data-act="ful" data-v="pickup" aria-label="Самовывоз" aria-pressed="' + (fulfillment === 'pickup') + '"><span class="ful-icon"><img src="icons/ful-pickup.png?v=4" alt="" width="48" height="48"/></span><strong>Самовывоз</strong><small>Бесплатно</small></button>' +
      '<button type="button" class="' + (fulfillment === 'armavir' ? 'selected' : '') + '" data-act="ful" data-v="armavir" aria-label="По городу" aria-pressed="' + (fulfillment === 'armavir') + '"><span class="ful-icon"><img src="icons/ful-city.png?v=4" alt="" width="48" height="48"/></span><strong>По городу</strong><small>+200 ₽</small></button>' +
      '<button type="button" class="' + (fulfillment === 'nearby' ? 'selected' : '') + '" data-act="ful" data-v="nearby" aria-label="За город" aria-pressed="' + (fulfillment === 'nearby') + '"><span class="ful-icon"><img src="icons/ful-far.png?v=4" alt="" width="48" height="48"/></span><strong>За город</strong><small>Рассчитаем</small></button>' +
      '</div></section>';

    if (fulfillment && fulfillment !== 'pickup') {
      html += '<section class="client-block' + (next === 'client-addr' ? ' is-next' : address.trim() ? ' is-done' : '') + '" id="client-addr">' +
        '<h3 class="client-block-title">Адрес' + (next === 'client-addr' ? '<span class="client-req" aria-hidden="true">*</span>' : '') + '</h3>' +
        '<label class="client-ins' + (address.trim() ? ' is-filled' : '') + '">' +
        '<span class="client-ins-ico" aria-hidden="true"><img src="icons/line-pin.svg" alt="" width="20" height="20"/></span>' +
        '<input value="' + esc(address) + '" maxlength="140" data-act="address" placeholder="' + (fulfillment === 'armavir' ? 'Улица, дом, квартира' : 'Населённый пункт и адрес') + '"/>' +
        '<span class="client-ins-ok" aria-hidden="true">✓</span></label></section>';
    }

    html += '<details class="client-when"' + ((orderDate || orderTime) ? ' open' : '') + '>' +
      '<summary>Дата и время</summary>' +
      '<div class="order-date-row" role="group" aria-label="Дата и время">' +
      '<div class="order-date-field">' + calendarHtml() + '</div>' +
      '<div class="order-time-field">' + timeHtml() + '</div></div></details>';

    if (ready) {
      var msg = orderMessage();
      html += '<section class="client-block is-done client-msg" id="client-msg">' +
        '<h3 class="client-block-title">Отправить заказ</h3>' +
        '<div class="order-sum-msg">' +
        '<a class="order-sum-wa" target="_blank" rel="noreferrer" href="https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg) + '" data-act="flow-msg" data-msg="wa"><span>' + WA_SVG + '</span><strong>WhatsApp</strong></a>' +
        '<a class="order-sum-tg" target="_blank" rel="noreferrer" href="' + TG_URL + '?text=' + encodeURIComponent(msg) + '" data-act="flow-msg" data-msg="tg"><span>' + TG_SVG + '</span><strong>Telegram</strong></a>' +
        '<a class="order-sum-max" target="_blank" rel="noreferrer" href="' + MAX_URL + '" data-act="flow-msg" data-msg="max"><span><img src="icons/max-official.png" alt="" width="22" height="22"/></span><strong>MAX</strong></a>' +
        '</div></section>';
    }

    html += '</div>';
    return html;
  }

  function summaryFlowHtml() {
    return clientOrderHtml();
  }

  function orderMessage() {
    if (!p) return '';
    var lines = [];
    if (p.has_digit_choice) {
      if (effDigits() === 1) lines.push('Цифра: ' + digit);
      if (effDigits() === 2) lines.push('Цифры: ' + digit + ' и ' + digit2);
      if (canAdd()) lines.push('Вторая цифра: ' + (effDelta() === 1 ? 'добавить (+900 ₽)' : 'не добавлять'));
      if (canRemove()) lines.push('Вторая цифра: ' + (effDelta() === -1 ? 'убрать (-900 ₽)' : 'оставить как на фото'));
    }
    if (isUnit()) lines.push((isPerMeter() ? 'Длина' : 'Количество') + ': ' + qty + ' ' + (isPerMeter() ? 'м' : 'шт.'));
    if (p.has_inscription) {
      var t = (p.inscription_price || 0) > 0 ? ' (+' + p.inscription_price + ' ₽)' : ' (входит в стоимость)';
      lines.push('Надпись: ' + (inscription.trim() ? inscription.trim() + t : 'не указана'));
    }
    if (p.has_rental) lines.push('Аренда: ' + (p.rental_item || 'арендный элемент уточнить') + ' — бесплатно до ' + (p.rental_days || 3) + ' суток, далее ' + (p.keep_price_delta || 500) + ' ₽/сутки');
    lines.push('Дата: ' + dateLabel());
    lines.push('Желаемое время: ' + (orderTime || 'уточнить'));
    var fmap = { pickup: 'самовывоз из студии', armavir: 'доставка по Армавиру (+200 ₽)', nearby: 'доставка за пределы Армавира (стоимость уточним при подтверждении заказа)' };
    lines.push('Получение: ' + (fulfillment ? fmap[fulfillment] : 'уточнить'));
    if (fulfillment && fulfillment !== 'pickup' && address.trim()) lines.push('Адрес: ' + address.trim());
    var opts = lines.length ? '\n' + lines.join('\n') : '';
    var cost = fulfillment === 'nearby'
      ? 'Предварительная стоимость: ' + (priceFrom() ? 'от ' : '') + total().toLocaleString('ru-RU') + ' ₽ + доставка.'
      : (priceFrom() ? 'Ориентировочная стоимость: от' : 'Стоимость:') + ' ' + total().toLocaleString('ru-RU') + ' ₽.';
    return 'Здравствуйте! Хочу заказать «' + p.title + '», артикул ' + p.sku + '.' + opts + '\n' + cost + '\nКарточка: https://new.vigsharm.ru/product/' + (p.slug || p.id);
  }

  function saveDraft() {
    if (!slug || !draftReady) return;
    try {
      localStorage.setItem('vigsharm_order_draft_' + slug, JSON.stringify({
        digit: digit, additionalDigit: digit2, digitCountChange: digitDelta,
        inscription: inscription, orderDate: orderDate, orderTime: orderTime,
        fulfillment: fulfillment, address: address, quantity: qty
      }));
    } catch (e) {}
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem('vigsharm_order_draft_' + slug) || 'null');
      if (!d) return;
      if (typeof d.digit === 'string') digit = d.digit;
      if (typeof d.additionalDigit === 'string') digit2 = d.additionalDigit;
      if (d.digitCountChange === -1 || d.digitCountChange === 0 || d.digitCountChange === 1) {
        digitDelta = d.digitCountChange;
        deltaAck = true;
      }
      if (typeof d.digit === 'string' && d.digit) deltaAck = true;
      if (typeof d.inscription === 'string') inscription = d.inscription;
      if (typeof d.orderDate === 'string' && d.orderDate >= todayMin) orderDate = d.orderDate;
      if (typeof d.orderTime === 'string') orderTime = d.orderTime;
      if (['', 'pickup', 'armavir', 'nearby'].indexOf(d.fulfillment || '') >= 0) fulfillment = d.fulfillment || '';
      if (typeof d.address === 'string') address = d.address;
      if (typeof d.quantity === 'number') qty = Math.max(1, Math.min(100, d.quantity));
      draftRestored = true;
    } catch (e) {}
    draftReady = true;
  }
  function pushRecent() {
    if (!p) return;
    try {
      var arr = JSON.parse(localStorage.getItem('vigsharm_recent_products') || '[]');
      arr = (Array.isArray(arr) ? arr : []).filter(function (x) { return Number.isInteger(x); });
      localStorage.setItem('vigsharm_recent_products', JSON.stringify([p.id].concat(arr.filter(function (x) { return x !== p.id; })).slice(0, 8)));
    } catch (e) {}
  }

  function related() {
    var mine = {};
    [p.category].concat(p.tags || []).filter(Boolean).forEach(function (t) { mine[t] = 1; });
    function score(o) {
      var common = [o.category].concat(o.tags || []).filter(function (t) { return mine[t]; }).length;
      var same = o.category === p.category ? 12 : 0;
      return same + common * 4 + Math.max(0, 8 - Math.abs(o.price - p.price) / 500);
    }
    return allProducts.filter(function (o) { return o.id !== p.id; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 3);
  }

  /* ---------------- render ---------------- */

  function render() {
    if (!p) return;
    saveDraft();
    var keys = p.image_keys || [];
    if (imgIdx < 0 || imgIdx >= keys.length) imgIdx = 0;
    var galleryKey = resolveGalleryKey();
    var mainKey = mainImageKey();
    var stepNum = (isUnit() || p.has_digit_choice) ? '2' : '';
    var digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    var needDigit = p.has_digit_choice && !digitsOk();
    var U = effDigits(), H = effDelta();

    var paramsDetails = '';
    if (isUnit() || p.has_digit_choice) {
      var inner = '';
      if (isUnit()) {
        inner += '<label class="config-input"><span>' + (isPerMeter() ? 'Длина арки' : 'Количество') + '</span>' +
          '<input type="number" min="1" max="100" value="' + qty + '" data-act="qty"/></label>';
      }
      if (p.has_digit_choice && U >= 1) {
        inner += '<fieldset class="' + (needDigit ? 'needs-pick' : '') + '"><legend>' + (U === 2 ? 'Какая первая цифра нужна?' : 'Какая цифра нужна?') + '</legend><div class="digit-options">' +
          digits.map(function (d) { return '<button type="button" class="' + (digit === d ? 'selected' : '') + '" data-act="digit" data-v="' + d + '" aria-label="Выбрать цифру ' + d + '" aria-pressed="' + (digit === d) + '">' + d + '</button>'; }).join('') +
          '</div></fieldset>';
        if (p.digit_count_locked || p.is_floor_composition) {
          inner += '<p class="digit-count-note">' + (U === 2
            ? 'В этой композиции две цифры — выберите обе. Количество менять нельзя.'
            : 'В этой композиции одна цифра. Количество менять нельзя.') + '</p>';
        }
      }
      if (canAdd() || canRemove()) {
        var B = canAdd();
        inner += '<fieldset><legend>' + (B ? 'Добавить вторую цифру?' : 'Оставить вторую цифру?') + '</legend><div class="digit-count-options">' +
          '<button type="button" class="' + (H === 0 ? 'selected' : '') + '" data-act="delta" data-v="0" aria-pressed="' + (H === 0) + '"><strong>' + (B ? 'Нет, оставить одну' : 'Да, оставить две') + '</strong><small>Без доплаты</small></button>' +
          (B ? '<button type="button" class="' + (H === 1 ? 'selected' : '') + '" data-act="delta" data-v="1" aria-pressed="' + (H === 1) + '"><strong>Да, добавить вторую</strong><small>+900 ₽</small></button>' : '') +
          (!B ? '<button type="button" class="' + (H === -1 ? 'selected' : '') + '" data-act="delta" data-v="-1" aria-pressed="' + (H === -1) + '"><strong>Нет, оставить одну</strong><small>−900 ₽</small></button>' : '') +
          '</div><p class="digit-count-note">' + (B ? 'В гелиевую композицию можно добавить не более двух цифр.' : 'При отказе от второй цифры стоимость уменьшится на 900 ₽.') + '</p></fieldset>';
      }
      if (p.has_digit_choice && U === 2) {
        inner += '<fieldset><legend>Какая вторая цифра нужна?</legend><div class="digit-options">' +
          digits.map(function (d) { return '<button type="button" class="' + (digit2 === d ? 'selected' : '') + '" data-act="digit2" data-v="' + d + '" aria-label="Выбрать вторую цифру ' + d + '" aria-pressed="' + (digit2 === d) + '">' + d + '</button>'; }).join('') +
          '</div></fieldset>';
      }
      if (needDigit) {
        inner += '<p class="digit-count-note">Выберите ' + (U === 2 ? 'обе цифры' : 'цифру') + ', чтобы оформить заказ.</p>';
      }
      paramsDetails = '<section class="product-configurator product-step is-open" id="product-step-params" data-details="params">' +
        '<header class="config-title"><div><strong>1. Параметры</strong><small>' + esc(paramsTitle()) + '</small></div></header>' +
        '<div class="product-step-content">' + inner + '</div></section>';
    }

    var fulfilled = fulfillment;
    var extraOrderFields = '';
    if (p.has_inscription) {
      extraOrderFields += '<label class="config-input inscription-field"><span>Надпись на шаре<small>обязательно</small></span>' +
        '<input value="' + esc(inscription) + '" maxlength="60" required aria-required="true" data-act="inscription" placeholder="Например: С Днём рождения!"/></label>';
    }
    if (p.has_rental) {
      extraOrderFields += '<fieldset><legend>Условия аренды</legend><div class="config-choice selected"><span><strong>В аренду: ' + esc(p.rental_item || 'элемент фотозоны') + '</strong>' +
        '<small>Бесплатно до ' + (p.rental_days || 3) + ' суток. Далее — ' + Number(p.keep_price_delta != null ? p.keep_price_delta : 500).toLocaleString('ru-RU') + ' ₽/сутки.</small></span><b>включено</b></div></fieldset>';
    }
    var dateInner = extraOrderFields +
      '<div class="order-date-row" role="group" aria-label="Дата и время">' +
      '<div class="order-date-field">' + calendarHtml() + '</div>' +
      '<div class="order-time-field">' + timeHtml() + '</div></div>' +
      '<fieldset class="fulfillment-field' + (!fulfilled ? ' needs-pick' : '') + '"><legend>Как получить заказ?</legend><div class="fulfillment-options">' +
      '<button type="button" class="' + (fulfilled === 'pickup' ? 'selected' : '') + '" data-act="ful" data-v="pickup" aria-label="Выбрать самовывоз, бесплатно" aria-pressed="' + (fulfilled === 'pickup') + '"><span class="ful-icon ful-pickup" aria-hidden="true"><img src="icons/ful-pickup.png?v=4" alt="" width="40" height="40"/></span><strong>Самовывоз</strong><small>Бесплатно</small></button>' +
      '<button type="button" class="' + (fulfilled === 'armavir' ? 'selected' : '') + '" data-act="ful" data-v="armavir" aria-label="Выбрать доставку по Армавиру, 200 рублей" aria-pressed="' + (fulfilled === 'armavir') + '"><span class="ful-icon ful-city" aria-hidden="true"><img src="icons/ful-city.png?v=4" alt="" width="40" height="40"/></span><strong>По городу</strong><small>+200 ₽</small></button>' +
      '<button type="button" class="' + (fulfilled === 'nearby' ? 'selected' : '') + '" data-act="ful" data-v="nearby" aria-label="Выбрать доставку за город, стоимость рассчитывается отдельно" aria-pressed="' + (fulfilled === 'nearby') + '"><span class="ful-icon ful-far" aria-hidden="true"><img src="icons/ful-far.png?v=4" alt="" width="40" height="40"/></span><strong>За город</strong><small>Рассчитаем</small></button>' +
      '</div></fieldset>' +
      (fulfilled && fulfilled !== 'pickup'
        ? '<label class="config-input' + (!address.trim() ? ' needs-pick' : '') + '"><span>Адрес доставки</span><input value="' + esc(address) + '" maxlength="140" data-act="address" placeholder="' + (fulfilled === 'armavir' ? 'Улица, дом, квартира' : 'Населённый пункт и адрес') + '"/>' + (!address.trim() ? '<small>Укажите адрес доставки</small>' : '') + '</label>'
        : '') +
      (!fulfilled ? '<p class="order-details-note">Нажмите, как удобнее получить заказ.</p>' : '') +
      '<p class="order-details-note order-details-note-quiet">Дата и адрес попадут в сообщение — время подтвердим.</p>';

    var dp = digitDeltaPrice(), ip = inscriptionPrice(), yp = deliveryPrice(), T = total();
    var totalLabel = fulfilled === 'nearby' ? 'Предварительная стоимость' : (fulfilled ? 'Итого' : 'Цена композиции');
    var hasPriceExtras = ip > 0 || dp !== 0 || yp > 0 || fulfilled === 'nearby';
    var ready = isOrderReady();
    var orderBtn = orderCta('full');
    var mobileFlowOn = useMobileFlow();
    var pageClass = 'product-page' + (mobileFlowOn ? ' is-mobile-flow is-client-order' : '');

    var desc = String(p.description || '').trim();
    var compItems = String(p.composition || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var rel = related();
    var leadText = p.short_description || (desc ? desc.split(/\n+/)[0] : '');
    var mobileBarActions = '<button type="button" class="mobile-order-cta" data-act="order">' +
      orderCta('short') +
      ' <span aria-hidden="true">→</span></button>';

    root.innerHTML =
      '<main class="' + pageClass + '">' +
      '<nav class="product-page-toolbar" aria-label="Действия с композицией">' +
      '<a href="catalog.html"><span aria-hidden="true">←</span> Вернуться в каталог</a>' +
      '<button type="button" data-act="share"><span aria-hidden="true">↗</span>' +
      (shareState === 'shared' ? 'Отправлено ✓' : shareState === 'copied' ? 'Ссылка скопирована ✓' : shareState === 'failed' ? 'Не удалось скопировать' : 'Поделиться') + '</button></nav>' +
      '<section class="product-page-card"><div class="product-page-gallery">' +
      '<div class="product-page-main-image' + (photoGrown ? ' is-grown' : '') + '" role="button" aria-label="Фото композиции. Нажмите, чтобы увеличить" tabindex="0" data-gallery>' +
      galleryImgHtml(galleryKey || mainKey, p.title, 'fetchpriority="high"') +
      '</div>' +
      (keys.length > 1
        ? '<div class="product-gallery-controls"><button type="button" data-act="prev" aria-label="Предыдущая фотография">←</button><span role="status" aria-live="polite">Фото ' + (imgIdx + 1) + ' из ' + keys.length + '</span><button type="button" data-act="next" aria-label="Следующая фотография">→</button></div>' +
          '<div class="product-thumbnails" aria-label="Все фотографии товара">' +
          keys.map(function (k, i) {
            return '<button type="button" class="' + (imgIdx === i ? 'active' : '') + '" data-act="thumb" data-v="' + i + '" aria-label="Показать фотографию ' + (i + 1) + '" aria-pressed="' + (imgIdx === i) + '">' +
              galleryImgHtml(k, '', 'loading="lazy"') + '</button>';
          }).join('') + '</div>'
        : '') +
      '</div><div class="product-page-info">' +
      '<div class="product-page-tags">' +
      '<span class="product-tag">' + esc(p.category || 'Композиция Вигшарм') + '</span>' +
      (p.available_on_request ? '<span class="product-tag product-tag-request">Под заказ</span>' : '') +
      (p.needs_advance_order ? '<span class="product-tag product-tag-advance">За 1–2 дня</span>' : '') +
      '</div>' +
      '<h1>' + esc(p.title) + '</h1>' +
      '<p class="sku">Артикул ' + esc(p.sku || '') + '</p>' +
      '<div class="product-base-price"><small>' + (isUnit() ? (isPerMeter() ? 'Цена за метр' : 'Цена за штуку') : 'Цена за композицию') + '</small><strong>' + (priceFrom() ? 'от ' : '') + Number(p.price).toLocaleString('ru-RU') + ' ₽</strong></div>' +
      (leadText
        ? '<div class="product-lead"><div class="product-lead-icon" aria-hidden="true"><img src="icons/line-balloon.svg" alt="" width="22" height="22"/></div><p>' + esc(leadText) + '</p></div>'
        : '') +
      summaryFlowHtml() +
      '<div class="order-classic-flow">' +
      paramsDetails +
      '<section class="order-details product-step is-open" id="product-step-date" data-details="date">' +
      '<header class="config-title"><div><strong>' + (stepNum ? stepNum + '. ' : '') + 'Дата и получение</strong><small>' + esc(fulfillmentTitle()) + '</small></div></header>' +
      '<div class="product-step-content">' + dateInner + '</div></section>' +
      '<div class="product-order-total' + (hasPriceExtras ? ' is-detailed' : '') + '"><span>' + totalLabel +
      (ip > 0 ? '<small>Включая надпись: +' + ip.toLocaleString('ru-RU') + ' ₽</small>' : '') +
      (dp !== 0 ? '<small>' + (dp > 0 ? 'Дополнительная цифра: +' : 'Без второй цифры: −') + Math.abs(dp).toLocaleString('ru-RU') + ' ₽</small>' : '') +
      (yp > 0 ? '<small>Доставка по Армавиру: +' + yp.toLocaleString('ru-RU') + ' ₽</small>' : '') +
      (fulfilled === 'nearby' ? '<small>Доставку за город уточним при подтверждении</small>' : '') +
      '</span><strong>' + (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽</strong></div>' +
      '<button type="button" class="button button-primary product-order-button" data-act="order">' + esc(orderBtn) + '</button>' +
      '<p class="product-order-explainer">Оплата позже — сначала подтвердим наличие и время.</p>' +
      (draftRestored
        ? '<p class="product-draft-note" role="status" aria-live="polite">Черновик восстановлен на этом устройстве.</p>'
        : '') +
      '</div>' +
      '</div></section>' +
      (compItems.length
        ? ('<section class="product-page-description product-page-description--solo" aria-label="Состав композиции"><article class="product-composition-card">' +
          '<p class="eyebrow">Что входит</p><h2>Собрано в один праздник</h2>' +
          '<div class="composition-list">' + compItems.map(function (t, i) {
            var label = String(t).replace(/[;.\s]+$/, '');
            return '<div class="composition-item tone-' + (i % 4) + '"><span class="comp-mark" aria-hidden="true">' + compIcon(i) + '</span><strong>' + esc(label) + '</strong><b class="comp-check" aria-hidden="true">✓</b></div>';
          }).join('') + '</div></article></section>')
        : '') +
      '<section class="related-products"><div class="related-products-heading"><div>' +
      '<h2>' + (rel.length ? 'Похожие композиции' : 'Нужен другой вариант?') + '</h2>' +
      '</div>' +
      '<div class="related-products-actions"><a href="catalog.html?max=' + p.price + '">Не дороже ' + Number(p.price).toLocaleString('ru-RU') + ' ₽</a><a href="catalog.html">Весь каталог <span>→</span></a></div></div>' +
      (rel.length
        ? '<div class="related-products-grid">' + rel.map(function (o, i) {
          var k = (window.vigProductPhoto ? window.vigProductPhoto(o) : '') || (o.image_keys && o.image_keys[0]) || '';
          var img = k ? '<img src="' + window.vigImage(k) + '" data-key="' + esc(k) + '" alt="' + esc(o.title) + '" loading="lazy" decoding="async" width="800" height="800"/>' : window.vigEmoji('balloon');
          return '<a class="catalog-card color-' + ((i + 1) % 5) + '" href="product.html?slug=' + encodeURIComponent(o.slug || o.id) + '" aria-label="Подробнее: ' + esc(o.title) + '">' +
            '<span class="catalog-card-image">' + img + '</span>' +
            '<span class="catalog-card-copy"><small>' + esc(o.category || 'Композиция Вигшарм') + '</small><strong>' + esc(o.title) + '</strong>' +
            '<b><em>' + Number(o.price).toLocaleString('ru-RU') + ' ₽</em><span class="related-cta">Подробнее</span></b></span></a>';
        }).join('') + '</div>'
        : '<div class="related-custom-card">' + window.vigEmoji('balloon') + '<div><strong>Сделаем под ваш праздник</strong><p>Напишите повод и бюджет — предложим идеи.</p></div><button type="button" data-act="order">Обсудить идею</button></div>') +
      '</section>' +
      '<aside class="mobile-order-bar' + (ready ? ' is-ready' : '') + '" aria-label="Быстрый заказ"><div><small>' + (fulfilled === 'nearby' ? 'От' : fulfilled ? 'Итого' : 'Цена') + '</small><strong>' + (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽</strong></div>' +
      mobileBarActions + '</aside>' +
      '</main>';

    document.title = (p.seo_title || (p.title + ' — заказать шары в Армавире | VigSharm'));
    document.body.classList.remove('order-story-lock');
    wire();
  }

  function openDetails(which) {
    var d = root.querySelector('[data-details="' + which + '"]');
    if (!d) return;
    requestAnimationFrame(function () {
      try {
        if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { try { d.scrollIntoView(); } catch (_) {} }
      var focusEl = null;
      if (which === 'params') {
        focusEl = d.querySelector('.digit-options button:not(.selected)') || d.querySelector('[data-act="digit"]');
      } else if (which === 'date') {
        if (!inscriptionOk()) focusEl = d.querySelector('[data-act="inscription"]');
        else if (!fulfillment) focusEl = d.querySelector('[data-act="ful"]');
        else if (!address.trim()) focusEl = d.querySelector('[data-act="address"]');
        else focusEl = d.querySelector('[data-act="date-toggle"]');
      }
      if (focusEl && focusEl.focus) {
        try { focusEl.focus({ preventScroll: true }); } catch (e) { try { focusEl.focus(); } catch (_) {} }
      }
    });
  }

  function clearFlowEditIf(step) {
    if (flowEditTarget === step && flowStepDone(step)) flowEditTarget = '';
  }

  function softScrollTo(id) {
    if (!useMobileFlow() || !id) return;
    requestAnimationFrame(function () {
      var el = root.querySelector('#' + id);
      if (!el || !el.scrollIntoView) return;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { try { el.scrollIntoView(); } catch (_) {} }
    });
  }

  function afterDigitsMaybeScroll() {
    if (!digitsOk()) return;
    softScrollTo(p.has_inscription ? 'client-ins' : 'client-ful');
  }

  function wire() {
    root.querySelectorAll('[data-act]').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (act === 'qty') {
        el.addEventListener('change', function () { qty = Math.max(1, Math.min(100, Number(el.value) || 1)); clearFlowEditIf('qty'); render(); });
      } else if (act === 'digit') {
        el.addEventListener('click', function () {
          digit = el.getAttribute('data-v');
          if (!(p.digit_images && p.digit_images[digit])) imgIdx = 0;
          clearFlowEditIf('digit1');
          render();
          afterDigitsMaybeScroll();
        });
      } else if (act === 'digits-edit') {
        el.addEventListener('click', function () {
          digit = '';
          digit2 = '';
          render();
        });
      } else if (act === 'digit2') {
        el.addEventListener('click', function () {
          digit2 = el.getAttribute('data-v');
          if (!(p.digit_images && p.digit_images[digit + digit2])) imgIdx = 0;
          clearFlowEditIf('digit2');
          render();
          afterDigitsMaybeScroll();
        });
      } else if (act === 'delta') {
        el.addEventListener('click', function () {
          digitDelta = Number(el.getAttribute('data-v'));
          if (effDigits() < 2 && digit2) digit2 = '';
          deltaAck = true;
          clearFlowEditIf('delta');
          render();
          afterDigitsMaybeScroll();
        });
      } else if (act === 'inscription') {
        el.addEventListener('input', function () {
          inscription = el.value;
          saveDraft();
          refreshTotals();
          var wrap = el.closest('.client-ins');
          if (wrap) wrap.classList.toggle('is-filled', !!inscription.trim());
        });
        el.addEventListener('change', function () {
          render();
          if (inscriptionOk()) softScrollTo('client-ful');
        });
      } else if (act === 'date-toggle') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          datePickerOpen = !datePickerOpen;
          timePickerOpen = false;
          var timeBox = root.querySelector('.order-time-picker');
          if (timeBox) timeBox.classList.remove('is-open');
          var box = root.querySelector('.order-date-picker:not(.order-time-picker)');
          if (box) {
            box.classList.toggle('is-open', datePickerOpen);
            el.setAttribute('aria-expanded', datePickerOpen);
          }
        });
      } else if (act === 'cal-prev') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          ensureCalView();
          calView.m -= 1;
          if (calView.m < 1) { calView.m = 12; calView.y -= 1; }
          datePickerOpen = true;
          render();
        });
      } else if (act === 'cal-next') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          ensureCalView();
          calView.m += 1;
          if (calView.m > 12) { calView.m = 1; calView.y += 1; }
          datePickerOpen = true;
          render();
        });
      } else if (act === 'date-day') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          orderDate = el.getAttribute('data-v') || '';
          var parts = orderDate.split('-');
          calView.y = Number(parts[0]) || calView.y;
          calView.m = Number(parts[1]) || calView.m;
          datePickerOpen = false;
          render();
        });
      } else if (act === 'date-clear') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          orderDate = '';
          datePickerOpen = false;
          render();
        });
      } else if (act === 'time-toggle') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          timePickerOpen = !timePickerOpen;
          datePickerOpen = false;
          var dateBox = root.querySelector('.order-date-picker:not(.order-time-picker)');
          if (dateBox) dateBox.classList.remove('is-open');
          var box = root.querySelector('.order-time-picker');
          if (box) {
            box.classList.toggle('is-open', timePickerOpen);
            el.setAttribute('aria-expanded', timePickerOpen);
          }
        });
      } else if (act === 'time-slot') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          orderTime = el.getAttribute('data-v') || '';
          timePickerOpen = false;
          render();
        });
      } else if (act === 'time-clear') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          orderTime = '';
          timePickerOpen = false;
          render();
        });
      } else if (act === 'ful') {
        el.addEventListener('click', function () {
          fulfillment = el.getAttribute('data-v');
          if (fulfillment === 'pickup') address = '';
          clearFlowEditIf('fulfill');
          render();
          if (fulfillment === 'pickup') softScrollTo(isOrderReady() ? 'client-msg' : null);
          else softScrollTo('client-addr');
        });
      } else if (act === 'address') {
        el.addEventListener('input', function () {
          address = el.value;
          saveDraft();
          var wrap = el.closest('.client-ins');
          if (wrap) wrap.classList.toggle('is-filled', !!address.trim());
          var ok = root.querySelector('[data-act="flow-addr-ok"]');
          if (ok) ok.disabled = !address.trim();
        });
        el.addEventListener('change', function () {
          clearFlowEditIf('address');
          render();
          if (address.trim()) softScrollTo(isOrderReady() ? 'client-msg' : null);
        });
      } else if (act === 'flow-edit') {
        el.addEventListener('click', function () {
          flowEditTarget = el.getAttribute('data-v') || '';
          render();
        });
      } else if (act === 'flow-cancel-edit') {
        el.addEventListener('click', function () {
          flowEditTarget = '';
          render();
        });
      } else if (act === 'flow-ins-ok') {
        el.addEventListener('click', function () {
          if (!inscriptionOk()) return;
          clearFlowEditIf('inscription');
          flowEditTarget = '';
          render();
        });
      } else if (act === 'flow-addr-ok') {
        el.addEventListener('click', function () {
          if (!address.trim()) return;
          clearFlowEditIf('address');
          flowEditTarget = '';
          render();
        });
      } else if (act === 'flow-next') {
        el.addEventListener('click', function () {
          clearFlowEditIf('qty');
          flowEditTarget = '';
          render();
        });
      } else if (act === 'flow-msg') {
        el.addEventListener('click', function () {
          var kind = el.getAttribute('data-msg');
          if (kind === 'max') copyOrderText(orderMessage(), null, MAX_COPY_HINT);
          else copyOrderText(orderMessage());
        });
      } else if (act === 'prev') {
        el.addEventListener('click', function () { step(-1); });
      } else if (act === 'next') {
        el.addEventListener('click', function () { step(1); });
      } else if (act === 'thumb') {
        el.addEventListener('click', function () { imgIdx = Number(el.getAttribute('data-v')); render(); });
      } else if (act === 'share') {
        el.addEventListener('click', share);
      } else if (act === 'order') {
        el.addEventListener('click', order);
      }
    });
    root.querySelectorAll('.mobile-order-msg[data-msg]').forEach(function (el) {
      el.addEventListener('click', function () {
        var kind = el.getAttribute('data-msg');
        if (kind === 'max') copyOrderText(orderMessage(), null, MAX_COPY_HINT);
        else if (kind === 'wa' || kind === 'tg') copyOrderText(orderMessage());
      });
    });
    var gal = root.querySelector('[data-gallery]');
    if (gal) {
      function togglePhoto() {
        photoGrown = !photoGrown;
        gal.classList.toggle('is-grown', photoGrown);
      }
      gal.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePhoto(); return; }
        if (e.key === 'Escape' && photoGrown) { e.preventDefault(); photoGrown = false; gal.classList.remove('is-grown'); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      });
      var sx = 0, sy = 0, skipClick = false;
      gal.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
      gal.addEventListener('touchend', function (e) {
        var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy)) {
          skipClick = true;
          step(dx < 0 ? 1 : -1);
          return;
        }
        if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
          skipClick = true;
          togglePhoto();
        }
      }, { passive: true });
      gal.addEventListener('click', function () {
        if (skipClick) { skipClick = false; return; }
        togglePhoto();
      });
    }
    if (!dateDocBound) {
      dateDocBound = true;
      document.addEventListener('click', function (e) {
        if (!datePickerOpen && !timePickerOpen) return;
        if (e.target.closest && e.target.closest('.order-date-picker')) return;
        datePickerOpen = false;
        timePickerOpen = false;
        root.querySelectorAll('.order-date-picker').forEach(function (box) {
          box.classList.remove('is-open');
          var tog = box.querySelector('.order-date-toggle');
          if (tog) tog.setAttribute('aria-expanded', 'false');
        });
      });
      if (typeof window.matchMedia === 'function') {
        flowMedia = window.matchMedia('(max-width:650px)');
        var onFlowMq = function () { if (p) render(); };
        if (flowMedia.addEventListener) flowMedia.addEventListener('change', onFlowMq);
        else if (flowMedia.addListener) flowMedia.addListener(onFlowMq);
      }
    }
  }

  function refreshTotals() {
    // Update only the price-dependent nodes in place. We must NOT call render()
    // here: rebuilding the DOM would detach the inscription input and close the
    // on-screen keyboard on mobile after every keystroke.
    var ip = inscriptionPrice(), dp = digitDeltaPrice(), yp = deliveryPrice(), T = total();
    var fulfilled = fulfillment, U = effDigits();
    var totalLabel = fulfilled === 'nearby' ? 'Предварительная стоимость' : (fulfilled ? 'Итого' : 'Цена композиции');
    var hasPriceExtras = ip > 0 || dp !== 0 || yp > 0 || fulfilled === 'nearby';
    var orderBtn = orderCta('full');

    var totalEl = root.querySelector('.product-order-total');
    if (totalEl) {
      totalEl.classList.toggle('is-detailed', hasPriceExtras);
      totalEl.innerHTML = '<span>' + totalLabel +
        (ip > 0 ? '<small>Включая надпись: +' + ip.toLocaleString('ru-RU') + ' ₽</small>' : '') +
        (dp !== 0 ? '<small>' + (dp > 0 ? 'Дополнительная цифра: +' : 'Без второй цифры: −') + Math.abs(dp).toLocaleString('ru-RU') + ' ₽</small>' : '') +
        (yp > 0 ? '<small>Доставка по Армавиру: +' + yp.toLocaleString('ru-RU') + ' ₽</small>' : '') +
        (fulfilled === 'nearby' ? '<small>Стоимость доставки уточним при подтверждении заказа</small>' : '') +
        '</span><strong>' + (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽</strong>';
    }

    var btn = root.querySelector('.product-order-button');
    if (btn) btn.textContent = orderBtn;

    var barSmall = root.querySelector('.mobile-order-bar div small');
    if (barSmall) barSmall.textContent = fulfilled === 'nearby' ? 'От' : (fulfilled ? 'Итого' : 'Цена');
    var barStrong = root.querySelector('.mobile-order-bar div strong');
    if (barStrong) barStrong.textContent = (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽';

    var bar = root.querySelector('.mobile-order-bar');
    if (bar) bar.classList.toggle('is-ready', isOrderReady());

    var insField = root.querySelector('.inscription-field');
    if (insField) insField.classList.toggle('is-empty', !inscriptionOk());

    var cta = root.querySelector('.mobile-order-cta');
    if (cta) {
      cta.innerHTML = orderCta('short') + ' <span aria-hidden="true">→</span>';
    }
  }

  function step(d) {
    var keys = p.image_keys || [];
    if (keys.length < 2) return;
    imgIdx = (imgIdx + d + keys.length) % keys.length;
    render();
  }

  function share() {
    var url = window.location.href;
    function done(s) { shareState = s; render(); }
    if (navigator.share) {
      navigator.share({ title: p.title, text: p.title + ' — ' + Number(p.price).toLocaleString('ru-RU') + ' ₽', url: url })
        .then(function () { done('shared'); })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          copyText(url, done);
        });
    } else {
      copyText(url, done);
    }
  }
  function copyText(text, done) {
    window.vigCopy(text).then(function (ok) { done(ok ? 'copied' : 'failed'); });
  }

  var COPY_HINT = 'Текст заказа скопирован! Если он не подставился автоматически — зажмите поле ввода и нажмите «Вставить».';
  var MAX_COPY_HINT = 'Текст заказа скопирован в буфер! Зажмите поле ввода в MAX и нажмите «Вставить».';

  function copyOrderText(text, done, hint) {
    function finish() { window.vigToast(hint || COPY_HINT); if (done) done(); }
    window.vigCopy(text).then(finish);
  }

  function order() {
    if (useMobileFlow()) {
      if (!isOrderReady()) {
        var id = clientNextId();
        var el = root.querySelector('#' + id);
        if (el && el.scrollIntoView) {
          try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
        }
        return;
      }
      openOrderModal();
      return;
    }
    if (!digitsOk()) { openDetails('params'); return; }
    if (!inscriptionOk()) {
      openDetails('date');
      var ins = root.querySelector('[data-act="inscription"]');
      if (ins) ins.focus();
      return;
    }
    if (!fulfillmentOk()) { openDetails('date'); return; }
    openOrderModal();
  }

  function openOrderModal() {
    if (document.querySelector('.order-modal-wrap')) return;
    copyState = '';
    var msg = orderMessage();
    var T = total();
    var needsConfirm = priceFrom() || fulfillment === 'nearby';
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop order-modal-wrap';
    wrap.setAttribute('role', 'presentation');
    wrap.innerHTML =
      '<section class="contact-modal product-order-modal" role="dialog" aria-modal="true" aria-labelledby="product-order-title">' +
      '<button class="modal-close" type="button" aria-label="Закрыть">×</button>' +
      '<p class="eyebrow">Почти готово</p><h2 id="product-order-title">Куда отправить заказ?</h2>' +
      '<div class="order-modal-summary"><span>' + esc(p.title) + '</span><strong>' + (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽</strong><small>Артикул ' + esc(p.sku || '') + '</small></div>' +
      '<div class="order-confirmation-list" aria-label="Выбранные условия заказа">' +
      '<span><small>Дата</small><strong>' + esc(dateLabel()) + '</strong></span>' +
      '<span><small>Время</small><strong>' + esc(orderTime || 'уточнить') + '</strong></span>' +
      '<span><small>Получение</small><strong>' + esc(fulfillmentLabel()) + '</strong></span>' +
      (p.has_inscription ? '<span><small>Надпись</small><strong>' + esc(inscription.trim() || '—') + '</strong></span>' : '') +
      '</div>' +
      '<p>Все выбранные опции, дата, адрес и стоимость уже подготовлены для отправки.</p>' +
      '<details class="order-message-preview"><summary>Проверить текст заказа</summary><pre>' + esc(msg) + '</pre>' +
      '<button type="button" data-copy>Скопировать заказ</button><small role="status" aria-live="polite"></small></details>' +
      '<div class="contact-options">' +
      '<a class="contact-option whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg) + '"><span>' + WA_SVG + '</span><div><strong>WhatsApp</strong><small>Отправить готовый заказ</small></div></a>' +
      '<a class="contact-option telegram" target="_blank" rel="noreferrer" href="' + TG_URL + '?text=' + encodeURIComponent(msg) + '"><span>' + TG_SVG + '</span><div><strong>Telegram</strong><small>Текст скопируется · личный чат</small></div></a>' +
      '<a class="contact-option max" target="_blank" rel="noreferrer" href="' + MAX_URL + '"><span><img src="icons/max-official.png" alt="" aria-hidden="true"/></span><div><strong>MAX</strong><small>Заказ скопируется — вставьте в чат</small></div></a>' +
      '<a class="contact-option phone" href="tel:+' + PHONE + '"><span>' + window.vigEmoji('phone') + '</span><div><strong>Позвонить</strong><small>' + PHONE_LABEL + '</small></div></a>' +
      '</div><p class="modal-note">' + (needsConfirm ? 'Итоговую стоимость уточним до подтверждения заказа. ' : '') + 'Оплата не списывается автоматически: сначала подтвердим наличие и свободное время.</p></section>';
    function close() { wrap.remove(); document.body.style.overflow = ''; }
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('.modal-close').addEventListener('click', close);
    function doCopy() {
      var btn = wrap.querySelector('[data-copy]');
      var note = wrap.querySelector('.order-message-preview small');
      copyOrderText(msg, function () {
        btn.textContent = 'Скопировано ✓';
        note.textContent = 'Текст заказа сохранён в буфере обмена.';
      });
    }
    wrap.querySelector('[data-copy]').addEventListener('click', doCopy);
    // Auto-copy the order text on any messenger tap and show a hint toast.
    wrap.querySelectorAll('.contact-option.whatsapp, .contact-option.telegram').forEach(function (el) {
      el.addEventListener('click', function () { copyOrderText(msg); });
    });
    wrap.querySelector('.contact-option.max').addEventListener('click', function () {
      copyOrderText(msg, null, MAX_COPY_HINT);
    });
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    wrap.querySelector('.modal-close').focus();
  }

  function renderNotFound(message) {
    root.innerHTML = '<main class="product-page-state"><div><strong>' + esc(message || 'Композиция не найдена') + '</strong>' +
      '<span>Попробуйте загрузить страницу ещё раз или вернитесь в каталог.</span>' +
      '<div class="product-page-state-actions"><button type="button" onclick="window.location.reload()">Попробовать ещё раз</button><a href="catalog.html">Вернуться в каталог</a></div></div></main>';
  }

  // ---------- boot ----------
  (window.vigFetchProducts
    ? window.vigFetchProducts()
    : fetch('https://vigsharm-api.vigsharm.workers.dev/api/products', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
        .then(function (data) { return (data.ok && Array.isArray(data.products)) ? data.products : []; })
  )
    .then(function (raw) {
      var normalized = window.vigNormalizeProducts(raw || []);
      var found = null;
      for (var i = 0; i < normalized.length; i++) {
        var o = normalized[i];
        if (String(o.slug) === slug || String(o.id) === slug) { found = o; break; }
      }
      if (!found) { renderNotFound('Композиция не найдена'); return; }
      // Related: only storefront-visible items (current product kept even if draft)
      allProducts = (window.vigIsStorefrontVisible
        ? normalized.filter(window.vigIsStorefrontVisible)
        : normalized);
      p = found;
      loadDraft();
      pushRecent();
      render();
    })
    .catch(function () { renderNotFound('Не удалось открыть композицию'); });
})();
