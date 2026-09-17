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
  function compIcon(text) {
    var t = String(text || '').toLowerCase();
    if (t.indexOf('цифр') >= 0) return '🎉';
    if (t.indexOf('bubble') >= 0 || t.indexOf('бабл') >= 0) return '✨';
    if (t.indexOf('короб') >= 0) return '🎁';
    if (t.indexOf('надпис') >= 0) return '💌';
    if (t.indexOf('шар') >= 0) return window.vigEmoji('balloon');
    return '🌟';
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
  function dateLabel() {
    if (!orderDate) return 'уточнить';
    try { return new Date(orderDate + 'T12:00:00').toLocaleDateString('ru-RU'); } catch (e) { return orderDate; }
  }
  function fulfillmentLabel() {
    if (fulfillment === 'pickup') return 'Самовывоз';
    if (fulfillment === 'armavir') return 'Доставка по Армавиру';
    if (fulfillment === 'nearby') return 'Доставка за город';
    return 'Уточнить';
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
      if (d.digitCountChange === -1 || d.digitCountChange === 0 || d.digitCountChange === 1) digitDelta = d.digitCountChange;
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
  // Open client-option params by default so digit/inscription/rental are visible immediately
  var detailsState = { params: true, date: false };

  function render() {
    if (!p) return;
    saveDraft();
    var keys = p.image_keys || [];
    if (imgIdx < 0 || imgIdx >= keys.length) imgIdx = 0;
    var galleryKey = resolveGalleryKey();
    var mainKey = mainImageKey();
    var stepNum = hasParams() ? '2' : '1';
    var digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    var needDigit = p.has_digit_choice && !digitsOk();
    var U = effDigits(), H = effDelta();

    var paramsDetails = '';
    if (hasParams()) {
      var inner = '';
      if (isUnit()) {
        inner += '<label class="config-input"><span>' + (isPerMeter() ? 'Длина арки' : 'Количество') + '</span>' +
          '<input type="number" min="1" max="100" value="' + qty + '" data-act="qty"/></label>';
      }
      if (p.has_digit_choice && U >= 1) {
        inner += '<fieldset><legend>' + (U === 2 ? 'Какая первая цифра нужна?' : 'Какая цифра нужна?') + '</legend><div class="digit-options">' +
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
      if (p.has_inscription) {
        inner += '<label class="config-input"><span>Персональная надпись<small>' + ((p.inscription_price || 0) > 0 ? 'по желанию · +' + Number(p.inscription_price).toLocaleString('ru-RU') + ' ₽' : 'входит в стоимость') + '</small></span>' +
          '<input value="' + esc(inscription) + '" maxlength="60" data-act="inscription" placeholder="Например: Любимой Дашеньке!"/></label>';
      }
      if (p.has_rental) {
        inner += '<fieldset><legend>Условия аренды</legend><div class="config-choice selected"><span><strong>В аренду: ' + esc(p.rental_item || 'элемент фотозоны') + '</strong>' +
          '<small>Бесплатно до ' + (p.rental_days || 3) + ' суток. Далее — ' + Number(p.keep_price_delta != null ? p.keep_price_delta : 500).toLocaleString('ru-RU') + ' ₽/сутки.</small></span><b>включено</b></div></fieldset>';
      }
      paramsDetails = '<details class="product-configurator product-step" data-details="params"' + (detailsState.params ? ' open' : '') + '>' +
        '<summary class="config-title"><span>✨</span><div><strong>1. Выбрать параметры</strong><small>' + esc(paramsTitle()) + '</small></div><b aria-hidden="true">+</b></summary>' +
        '<div class="product-step-content">' + inner + '</div></details>';
    }

    var fulfilled = fulfillment;
    var dateInner = '<div class="order-date-row">' +
      '<label class="config-input"><span>Дата праздника</span><input type="date" value="' + esc(orderDate) + '" min="' + todayMin + '" data-act="date"/></label>' +
      '<label class="config-input"><span>Желаемое время <small>можно уточнить позже</small></span><input type="time" value="' + esc(orderTime) + '" data-act="time"/></label></div>' +
      '<fieldset><legend>Как получить заказ?</legend><div class="fulfillment-options">' +
      '<button type="button" class="' + (fulfilled === 'pickup' ? 'selected' : '') + '" data-act="ful" data-v="pickup" aria-label="Выбрать самовывоз, бесплатно" aria-pressed="' + (fulfilled === 'pickup') + '"><span>🏠</span><strong>Самовывоз</strong><small>Бесплатно</small></button>' +
      '<button type="button" class="' + (fulfilled === 'armavir' ? 'selected' : '') + '" data-act="ful" data-v="armavir" aria-label="Выбрать доставку по Армавиру, 200 рублей" aria-pressed="' + (fulfilled === 'armavir') + '"><span>' + window.vigEmoji('car') + '</span><strong>По Армавиру</strong><small>+200 ₽</small></button>' +
      '<button type="button" class="' + (fulfilled === 'nearby' ? 'selected' : '') + '" data-act="ful" data-v="nearby" aria-label="Выбрать доставку за город, стоимость рассчитывается отдельно" aria-pressed="' + (fulfilled === 'nearby') + '"><span>🗺️</span><strong>За город</strong><small>Рассчитаем</small></button>' +
      '</div></fieldset>' +
      (fulfilled && fulfilled !== 'pickup'
        ? '<label class="config-input"><span>Адрес доставки</span><input value="' + esc(address) + '" maxlength="140" data-act="address" placeholder="' + (fulfilled === 'armavir' ? 'Улица, дом, квартира' : 'Населённый пункт и адрес') + '"/>' + (!address.trim() ? '<small>Укажите адрес доставки</small>' : '') + '</label>'
        : '') +
      (!fulfilled ? '<p class="order-details-note">Выберите самовывоз или подходящий вариант доставки.</p>' : '') +
      '<p class="order-details-note">💬 Дата, время и адрес попадут в сообщение. Мы подтвердим свободное время.</p>';

    var dp = digitDeltaPrice(), ip = inscriptionPrice(), yp = deliveryPrice(), T = total();
    var totalLabel = fulfilled === 'nearby' ? 'Предварительная стоимость' : (fulfilled ? 'Итого' : 'Цена композиции');
    var orderBtn = !digitsOk()
      ? 'Выберите ' + (U === 2 ? 'обе цифры' : 'цифру')
      : (!fulfilled ? 'Выберите способ получения' : (!fulfillmentOk() ? 'Укажите адрес доставки' : 'Заказать за ' + T.toLocaleString('ru-RU') + ' ₽ →'));

    var desc = String(p.description || '').replace(/\n/g, '<br/>');
    var compItems = String(p.composition || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var rel = related();

    root.innerHTML =
      '<main class="product-page">' +
      '<nav class="product-page-toolbar" aria-label="Действия с композицией">' +
      '<a href="catalog.html"><span aria-hidden="true">←</span> Вернуться в каталог</a>' +
      '<button type="button" data-act="share"><span aria-hidden="true">↗</span>' +
      (shareState === 'shared' ? 'Отправлено ✓' : shareState === 'copied' ? 'Ссылка скопирована ✓' : shareState === 'failed' ? 'Не удалось скопировать' : 'Поделиться') + '</button></nav>' +
      '<section class="product-page-card"><div class="product-page-gallery">' +
      '<div class="product-page-main-image" role="group" aria-label="Галерея товара. Фотография ' + (imgIdx + 1) + ' из ' + Math.max(keys.length, 1) + '" tabindex="' + (keys.length > 1 ? '0' : '-1') + '" data-gallery>' +
      galleryImgHtml(galleryKey || mainKey, p.title, 'fetchpriority="high"') + '</div>' +
      (keys.length > 1
        ? '<div class="product-gallery-controls"><button type="button" data-act="prev" aria-label="Предыдущая фотография">←</button><span role="status" aria-live="polite">Фото ' + (imgIdx + 1) + ' из ' + keys.length + '</span><button type="button" data-act="next" aria-label="Следующая фотография">→</button></div>' +
          '<div class="product-thumbnails" aria-label="Все фотографии товара">' +
          keys.map(function (k, i) {
            return '<button type="button" class="' + (imgIdx === i ? 'active' : '') + '" data-act="thumb" data-v="' + i + '" aria-label="Показать фотографию ' + (i + 1) + '" aria-pressed="' + (imgIdx === i) + '">' +
              galleryImgHtml(k, '', 'loading="lazy"') + '</button>';
          }).join('') + '</div>'
        : '') +
      '</div><div class="product-page-info">' +
      '<span class="product-tag">' + esc(p.category || 'Композиция Вигшарм') + '</span>' +
      (p.available_on_request ? '<span class="product-tag product-tag-request">Под заказ</span>' : '') +
      (p.needs_advance_order ? '<span class="product-tag product-tag-advance">За 1–2 дня</span>' : '') +
      '<h1>' + esc(p.title) + '</h1>' +
      '<p class="sku">Артикул ' + esc(p.sku || '') + '</p>' +
      (p.needs_advance_order
        ? '<p class="product-advance-note">Такую композицию лучше заказывать заранее — за <strong>1–2 дня</strong>. Так успеем собрать всё аккуратно и вовремя.</p>'
        : '') +
      (p.available_on_request
        ? '<p class="product-request-note">Можно заказать даже если сейчас нет в наличии — согласуем срок в мессенджере.</p>'
        : '') +
      '<div class="product-base-price"><small>' + (isUnit() ? (isPerMeter() ? 'Цена за метр' : 'Цена за штуку') : 'Цена за композицию') + '</small><strong>' + (priceFrom() ? 'от ' : '') + Number(p.price).toLocaleString('ru-RU') + ' ₽</strong></div>' +
      '<div class="product-lead">' + window.vigEmoji('balloon') + '<p>' + esc(p.short_description || '') + '</p></div>' +
      '<div class="product-mobile-highlights" aria-label="Преимущества композиции"><span>✨ Вау-эффект</span><span>🧾 Понятный состав</span><span>' + window.vigEmoji('car') + ' Доставим ко времени</span></div>' +
      paramsDetails +
      '<details class="order-details product-step" data-details="date"' + (detailsState.date ? ' open' : '') + '>' +
      '<summary class="config-title"><span>🚚</span><div><strong>' + stepNum + '. Дата и получение</strong><small>' + esc(fulfillmentTitle()) + '</small></div><b aria-hidden="true">+</b></summary>' +
      '<div class="product-step-content">' + dateInner + '</div></details>' +
      '<div class="product-order-total"><span>' + totalLabel +
      (ip > 0 ? '<small>Включая надпись: +' + ip.toLocaleString('ru-RU') + ' ₽</small>' : '') +
      (dp !== 0 ? '<small>' + (dp > 0 ? 'Дополнительная цифра: +' : 'Без второй цифры: −') + Math.abs(dp).toLocaleString('ru-RU') + ' ₽</small>' : '') +
      (yp > 0 ? '<small>Доставка по Армавиру: +' + yp.toLocaleString('ru-RU') + ' ₽</small>' : '') +
      (fulfilled === 'nearby' ? '<small>Стоимость доставки уточним при подтверждении заказа</small>' : '') +
      '</span><strong>' + (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽</strong></div>' +
      '<button type="button" class="button button-primary product-order-button" data-act="order">' + esc(orderBtn) + '</button>' +
      '<p class="product-order-explainer">Оплачивать сейчас не нужно. Мы получим выбранный вариант, подтвердим наличие и согласуем время.</p>' +
      '<p class="product-draft-note" role="status" aria-live="polite">' + (draftRestored ? 'Черновик заказа восстановлен и сохраняется на этом устройстве.' : 'Выбранные параметры сохраняются на этом устройстве.') + '</p>' +
      '</div></section>' +
      '<section class="product-page-description"><article class="product-story-card">' +
      '<span class="description-decoration decoration-one" aria-hidden="true">✨</span><span class="description-decoration decoration-two" aria-hidden="true">' + window.vigEmoji('balloon') + '</span>' +
      '<p class="eyebrow">О композиции</p><h2>Праздник, который хочется фотографировать</h2>' +
      '<p class="product-story-text">' + desc + '</p>' +
      '<div class="product-highlights"><span>😍 Вау-эффект</span><span>🧾 Понятный состав</span><span>' + window.vigEmoji('car') + ' Доставим ко времени</span></div></article>' +
      '<article class="product-composition-card"><span class="description-decoration decoration-three" aria-hidden="true">💫</span>' +
      '<p class="eyebrow">Что входит</p><h2>Всё уже собрано в один праздник</h2>' +
      '<div class="composition-list">' + compItems.map(function (t, i) {
        return '<div class="composition-item tone-' + (i % 4) + '"><span aria-hidden="true">' + compIcon(t) + '</span><strong>' + esc(t) + '</strong><b aria-hidden="true">✓</b></div>';
      }).join('') + '</div></article></section>' +
      '<section class="related-products"><div class="related-products-heading"><div>' +
      '<p class="eyebrow">Ещё немного праздника</p><h2>' + (rel.length ? 'Похожие композиции' : 'Не нашли тот самый вариант?') + '</h2>' +
      '<p>' + (rel.length ? 'Подобрали варианты из близкой категории и примерно того же бюджета.' : 'Покажите нам пример или расскажите идею — соберём композицию специально для вас.') + '</p></div>' +
      '<div class="related-products-actions"><a href="catalog.html?max=' + p.price + '">Не дороже ' + Number(p.price).toLocaleString('ru-RU') + ' ₽</a><a href="catalog.html">Весь каталог <span>→</span></a></div></div>' +
      (rel.length
        ? '<div class="related-products-grid">' + rel.map(function (o, i) {
          var k = (window.vigProductPhoto ? window.vigProductPhoto(o) : '') || (o.image_keys && o.image_keys[0]) || '';
          var img = k ? '<img src="' + window.vigImage(k) + '" data-key="' + esc(k) + '" alt="' + esc(o.title) + '" loading="lazy" decoding="async" width="800" height="800"/>' : window.vigEmoji('balloon');
          return '<a class="catalog-card color-' + ((i + 1) % 5) + '" href="product.html?slug=' + encodeURIComponent(o.slug || o.id) + '" aria-label="Подробнее: ' + esc(o.title) + '">' +
            '<span class="catalog-card-image">' + img + '</span>' +
            '<span class="catalog-card-copy"><small>' + esc(o.category || 'Композиция Вигшарм') + '</small><strong>' + esc(o.title) + '</strong><span>' + esc(o.short_description || '') + '</span>' +
            '<b>' + Number(o.price).toLocaleString('ru-RU') + ' ₽ <i>→</i></b></span></a>';
        }).join('') + '</div>'
        : '<div class="related-custom-card">' + window.vigEmoji('balloon') + '<div><strong>Сделаем из шаров всё!</strong><p>Напишите, для кого праздник, какой повод и бюджет — предложим несколько идей.</p></div><button type="button" data-act="order">Обсудить идею</button></div>') +
      '</section>' +
      '<aside class="mobile-order-bar" aria-label="Быстрый заказ"><div><small>' + (fulfilled === 'nearby' ? 'От' : fulfilled ? 'Итого' : 'Цена композиции') + '</small><strong>' + (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽</strong></div>' +
      '<button type="button" data-act="order">' + (!digitsOk() ? 'Выберите цифры' : !fulfilled ? 'Выберите получение' : !fulfillmentOk() ? 'Укажите адрес' : 'Заказать') + ' <span>→</span></button></aside>' +
      '</main>';

    document.title = (p.seo_title || (p.title + ' — заказать шары в Армавире | VigSharm'));
    wire();
  }

  function openDetails(which) {
    detailsState[which] = true;
    var d = root.querySelector('[data-details="' + which + '"]');
    if (d) {
      d.open = true;
      requestAnimationFrame(function () {
        try {
          if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) { try { d.scrollIntoView(); } catch (_) {} }
      });
    }
  }

  function wire() {
    root.querySelectorAll('[data-details]').forEach(function (d) {
      d.addEventListener('toggle', function () {
        detailsState[d.getAttribute('data-details')] = d.open;
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (act === 'qty') {
        el.addEventListener('change', function () { qty = Math.max(1, Math.min(100, Number(el.value) || 1)); render(); });
      } else if (act === 'digit') {
        el.addEventListener('click', function () {
          digit = el.getAttribute('data-v');
          // Keep hero photo visible when digit-specific preview is missing.
          if (!(p.digit_images && p.digit_images[digit])) imgIdx = 0;
          render();
        });
      } else if (act === 'digit2') {
        el.addEventListener('click', function () {
          digit2 = el.getAttribute('data-v');
          if (!(p.digit_images && p.digit_images[digit + digit2])) imgIdx = 0;
          render();
        });
      } else if (act === 'delta') {
        el.addEventListener('click', function () {
          digitDelta = Number(el.getAttribute('data-v'));
          if (effDigits() < 2 && digit2) digit2 = '';
          render();
        });
      } else if (act === 'inscription') {
        el.addEventListener('input', function () {
          inscription = el.value;
          saveDraft();
          // live-update totals without full rerender (keep focus)
          refreshTotals();
        });
        el.addEventListener('change', render);
      } else if (act === 'date') {
        el.addEventListener('change', function () { orderDate = el.value; render(); });
      } else if (act === 'time') {
        el.addEventListener('change', function () { orderTime = el.value; render(); });
      } else if (act === 'ful') {
        el.addEventListener('click', function () {
          fulfillment = el.getAttribute('data-v');
          if (fulfillment === 'pickup') address = '';
          render();
        });
      } else if (act === 'address') {
        el.addEventListener('input', function () { address = el.value; saveDraft(); });
        el.addEventListener('change', render);
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
    var gal = root.querySelector('[data-gallery]');
    if (gal) {
      gal.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      });
      var sx = 0, sy = 0;
      gal.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
      gal.addEventListener('touchend', function (e) {
        var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;
        step(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
  }

  function refreshTotals() {
    // Update only the price-dependent nodes in place. We must NOT call render()
    // here: rebuilding the DOM would detach the inscription input and close the
    // on-screen keyboard on mobile after every keystroke.
    var ip = inscriptionPrice(), dp = digitDeltaPrice(), yp = deliveryPrice(), T = total();
    var fulfilled = fulfillment, U = effDigits();
    var totalLabel = fulfilled === 'nearby' ? 'Предварительная стоимость' : (fulfilled ? 'Итого' : 'Цена композиции');
    var orderBtn = !digitsOk()
      ? 'Выберите ' + (U === 2 ? 'обе цифры' : 'цифру')
      : (!fulfilled ? 'Выберите способ получения' : (!fulfillmentOk() ? 'Укажите адрес доставки' : 'Заказать за ' + T.toLocaleString('ru-RU') + ' ₽ →'));

    var totalEl = root.querySelector('.product-order-total');
    if (totalEl) {
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
    if (barSmall) barSmall.textContent = fulfilled === 'nearby' ? 'От' : (fulfilled ? 'Итого' : 'Цена композиции');
    var barStrong = root.querySelector('.mobile-order-bar div strong');
    if (barStrong) barStrong.textContent = (priceFrom() ? 'от ' : '') + T.toLocaleString('ru-RU') + ' ₽';
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
    if (!digitsOk()) { openDetails('params'); return; }
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
      '<span><small>Получение</small><strong>' + esc(fulfillmentLabel()) + '</strong></span></div>' +
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
