/* VigSharm — shared site behaviour (header menu, contact modal, image fallback) */
(function () {
  'use strict';

  var PHONE = '79284440142';
  var PHONE_LABEL = '+7 928 444-01-42';
  var MAX_URL = 'https://max.ru/u/f9LHodD0cOJwY09H6Zj63nYK_X8tPZGb3CODIvTT7FWkRzrgbh5F582AiB8';
  var TG_URL = 'https://t.me/Olgamzz';
  var WA_TEXT = 'Здравствуйте! Хочу сделать заказ в Вигшарм.';
  // Worker API. *.workers.dev в РФ часто недоступен без VPN — используем свой домен.
  // Если и он не ответит, витрина берёт снимок data/products.json с того же хоста.
  window.VIG_API = 'https://api.vigsharm.ru';
  // Карточка на vigsharm.ru получает <base> на GitHub Pages. Относительный
  // data/products.json тогда уезжает не в тот снимок, что каталог. Берём origin страницы.
  // Карточка на vigsharm.ru получает <base> на github.io. Снимок надо брать
  // с адреса страницы (vigsharm.ru): github.io из РФ часто не открывается.
  window.vigSameOrigin = function (path) {
    try { return new URL(path, window.location.origin + '/').href; }
    catch (e) { return path; }
  };
  window.VIG_PRODUCTS_FALLBACK = window.vigSameOrigin('data/products.json');

  // В РФ Worker часто недоступен/висит. Витрина сначала берёт снимок с хоста сайта
  // (быстро), Worker — только если снимка нет. Обновление снимка: admin / export-скрипт.
  window.VIG_API_TIMEOUT_MS = 2500;

  window.vigFetchProducts = function () {
    function listFrom(data) {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.products)) return data.products;
      return [];
    }
    function load(url, opts) {
      opts = opts || {};
      return fetch(url, { cache: 'no-store', signal: opts.signal }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        var list = listFrom(data);
        if (!list.length) throw new Error('empty products');
        return list;
      });
    }
    function loadApiWithTimeout() {
      var ms = Number(window.VIG_API_TIMEOUT_MS) || 2500;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      if (ctrl) {
        timer = setTimeout(function () {
          try { ctrl.abort(); } catch (e) { /* ignore */ }
        }, ms);
      }
      return load(window.VIG_API + '/api/products', ctrl ? { signal: ctrl.signal } : {})
        .finally(function () {
          if (timer) clearTimeout(timer);
        });
    }
    return load(window.VIG_PRODUCTS_FALLBACK).catch(function () {
      return loadApiWithTimeout();
    });
  };

  // Приводит товар из Worker API (схема D1) к плоским полям витрины.
  // client_options (админка + legacy) → has_digit_choice / has_inscription / has_rental.
  function vigTruthy(v) {
    return v === true || v === 1 || v === '1';
  }
  /** false тоже считается заданным: админка сохранила выбор, витрина его не перебивает. */
  function vigFlagExplicit(v) {
    return v === true || v === false || v === 1 || v === 0 || v === '1' || v === '0';
  }
  function vigOptEnabled(opt) {
    if (opt === true || opt === 1 || opt === '1') return true;
    if (opt && typeof opt === 'object') return vigTruthy(opt.enabled);
    return false;
  }
  /** Сколько фольгированных цифр упомянуто в составе (1/2/0). */
  function vigCompositionDigitCount(composition) {
    var t = Array.isArray(composition) ? composition.join(' ') : String(composition || '');
    t = t.toLowerCase().replace(/ё/g, 'е');
    if (!t) return 0;
    if (/(?:^|[^\d])2\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(t)
      || /(?:^|[^а-яa-z0-9])две\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(t)) {
      return 2;
    }
    if (/цифр/.test(t)) return 1;
    return 0;
  }
  window.vigIsStorefrontVisible = function (p) {
    if (!p) return false;
    if (p.status && p.status !== 'published') return false;
    // Explicit hide without deleting. Missing field = legacy / pre-migration → still visible.
    if (p.show_on_site == null || p.show_on_site === '') return true;
    return vigTruthy(p.show_on_site);
  };
  /** Full frame for the product page. */
  window.vigProductPhoto = function (p) {
    if (!p) return '';
    var keys = p.image_keys;
    if ((!keys || !keys.length) && Array.isArray(p.photos) && p.photos.length) keys = p.photos;
    if (keys && keys.length && keys[0]) return keys[0];
    if (p.main_photo) return p.main_photo;
    return p.thumb_photo || '';
  };
  /** Catalog grid uses the same frame as the product page. A stored thumb can be an older shot. */
  window.vigProductThumb = function (p) {
    if (!p) return '';
    var photo = window.vigProductPhoto(p);
    if (photo) return photo;
    return p.thumb_photo || '';
  };
  window.vigNormalizeProduct = function (p) {
    if (!p) return p;
    p.sku = p.sku || p.article || '';
    p.description = p.description || p.full_description || '';
    p.character_name = p.character_name || p.character || '';
    var photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
    if (p.main_photo && photos.indexOf(p.main_photo) < 0) photos.unshift(p.main_photo);
    if (Array.isArray(p.image_keys) && p.image_keys.length) {
      p.image_keys = p.image_keys.filter(Boolean);
    } else {
      p.image_keys = photos;
    }
    if (!p.image_keys.length && p.main_photo) p.image_keys = [p.main_photo];
    if (Array.isArray(p.composition)) p.composition = p.composition.join('\n');

    var opts = p.client_options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts || '{}'); } catch (e) { opts = {}; }
    }
    opts = opts || {};

    // New admin flags + legacy nested objects from migration
    var digitOn = vigTruthy(opts.number_choice) || vigOptEnabled(opts.digit_choice);
    var digitExplicit = vigFlagExplicit(opts.number_choice)
      || (opts.digit_choice && typeof opts.digit_choice === 'object' && vigFlagExplicit(opts.digit_choice.enabled));
    var inscriptionOn = vigTruthy(opts.personal_inscription) || vigOptEnabled(opts.inscription);
    var inscriptionExplicit = vigFlagExplicit(opts.personal_inscription)
      || (opts.inscription && typeof opts.inscription === 'object' && vigFlagExplicit(opts.inscription.enabled));
    var tags = Array.isArray(p.tags) ? p.tags : [];
    var isSoftBouquet = opts.bouquet_type === 'teddy'
      || opts.bouquet_type === 'butterfly'
      || opts.bouquet_type === 'soap'
      || p.category === 'Букет с мишками'
      || p.category === 'Букет с бабочками'
      || p.category === 'Букет из мыльных роз'
      || tags.indexOf('Букет с мишками') >= 0
      || tags.indexOf('Букет с бабочками') >= 0
      || tags.indexOf('Букет из мыльных роз') >= 0;
    var rentalOn = vigTruthy(opts.photozone_rental) || vigOptEnabled(opts.rental);
    var rentalExplicit = vigFlagExplicit(opts.photozone_rental)
      || (opts.rental && typeof opts.rental === 'object' && vigFlagExplicit(opts.rental.enabled));
    var availableOn = vigTruthy(opts.available_on_request) || vigOptEnabled(opts.available_on_request);
    var requestExplicit = vigFlagExplicit(opts.available_on_request);
    var advanceOn = vigTruthy(opts.advance_order_1_2_days) || vigOptEnabled(opts.advance_order)
      || vigTruthy(opts.advance_order);
    var advanceExplicit = vigFlagExplicit(opts.advance_order_1_2_days) || vigFlagExplicit(opts.advance_order);
    var isBouquet = p.scene === 'handheld_bouquet'
      || p.category === 'Букет из шаров'
      || p.category === 'Крафтовый букет'
      || p.category === 'Цветы из шаров';
    var isFlowerBouquet = opts.bouquet_type === 'flowers'
      || p.category === 'Цветы из шаров'
      || (Array.isArray(p.tags) && p.tags.indexOf('Цветы из шаров') >= 0);
    var isPhotozone = p.scene === 'photozone' || p.category === 'Фотозона';
    var isFloor = p.scene === 'floor' || p.category === 'Напольные композиции';
    var isFigures = p.scene === 'balloon_figures' || p.category === 'Фигуры из шаров';
    var isWallOnly = p.scene === 'wall_only';
    var isCeiling = p.scene === 'ceiling';
    var pzType = opts.photozone_type || '';
    var floorType = opts.floor_type === 'air' ? 'air' : '';
    var compJoined = Array.isArray(p.composition) ? p.composition.join(' ') : String(p.composition || '');
    var floorShelf = p.category === 'Напольные композиции'
      || (Array.isArray(p.tags) && p.tags.indexOf('Напольные композиции') >= 0);
    // Подсказки для старых карточек без сохранённого флага. Явный true/false из админки не перебиваем.
    if (!advanceExplicit) {
      if (floorShelf) advanceOn = true;
      if (isFloor && floorType === 'air') {
        advanceOn = true;
      } else if (!advanceOn && (isFigures || isBouquet)) {
        advanceOn = true;
      }
      if (!advanceOn && /коробк/i.test(compJoined)) {
        advanceOn = true;
      }
    }
    if (isPhotozone) {
      if (!advanceExplicit) advanceOn = true;
      if (!rentalExplicit) rentalOn = true;
      if (!pzType) {
        var hintItem = (opts.rental && opts.rental.item) || '';
        var compHint = Array.isArray(p.composition) ? p.composition.join(' ') : String(p.composition || '');
        var compLow = compHint.toLowerCase().replace(/ё/g, 'е');
        if (/мольбер|полистирол/.test(compLow) || /мольбер/i.test(hintItem)) pzType = 'easel';
        else if (/каркас|кругл|обруч/.test(compLow) || /каркас/i.test(hintItem)) pzType = 'frame';
        else pzType = /мольбер/i.test(hintItem) ? 'easel' : 'frame';
      }
      if (pzType === 'easel' && !inscriptionOn && !inscriptionExplicit) inscriptionOn = true;
    }
    // Фольгированный букет без сохранённого флага — персональная надпись.
    // Мишки, бабочки, мыльные розы и явный false из админки не включаем сами.
    if (!inscriptionExplicit && !inscriptionOn && isBouquet && !isFlowerBouquet && !isSoftBouquet) {
      inscriptionOn = true;
    }
    // В составе «коробка» / «… с надписью» / «с индивидуальной надписью» — только если флаг не сохранён.
    if (!inscriptionExplicit && !inscriptionOn && !isFlowerBouquet && /надпис|индивидуальн|коробк/i.test(compJoined)) {
      inscriptionOn = true;
    }
    if (!inscriptionExplicit && isFlowerBouquet) inscriptionOn = false;

    var isSurprise = p.scene === 'surprise'
      || p.category === 'Шар-сюрприз'
      || (Array.isArray(p.tags) && p.tags.indexOf('Шар-сюрприз') >= 0);
    if (isSurprise) {
      p.is_surprise = true;
      p.surprise_pose = opts.surprise_pose === 'hang' ? 'hang' : 'stand';
      p.surprise_money = !!(opts.surprise_money || opts.surprise_bills);
      p.surprise_options = p.surprise_pose !== 'hang';
      if (!inscriptionExplicit) inscriptionOn = false;
    }

    // «1 цифра» / «2 цифры» в составе — только если оператор сам не сохранил флаг.
    var compDigits = vigCompositionDigitCount(p.composition);
    if (!digitExplicit && !digitOn && compDigits > 0) {
      digitOn = true;
    }
    var unitDigit = opts.unit_type === 'digit'
      || p.category === 'Фольгированные цифры'
      || (Array.isArray(p.tags) && p.tags.indexOf('Фольгированные цифры') >= 0);
    // Праздничная или «Цифра …»: на фото уже готовое число, клиент его не выбирает.
    // «Цифры золото» и другие серии — выбор цифры остаётся.
    var printedDigit = unitDigit && (
      !!String(opts.unit_holiday || '').trim()
      || /^цифра\s/i.test(String(p.title || '').trim())
    );
    if (!digitExplicit && printedDigit) digitOn = false;
    else if (!digitExplicit && unitDigit) digitOn = true;

    if (digitOn) {
      p.has_digit_choice = true;
      var digitCount = unitDigit
        ? 1
        : ((opts.digit_choice && opts.digit_choice.count_on_photo) || p.digit_count_on_photo || compDigits || 1);
      p.digit_count_on_photo = Math.min(2, Math.max(1, Number(digitCount) || 1));
      // Напольные, фигуры, стена и потолок: количество цифр фиксировано.
      // Поштучные цифры: одна в цене, вторую можно добавить за 900 ₽.
      p.digit_count_locked = unitDigit ? false : !!(isFloor || isWallOnly || isFigures || isCeiling);
      p.is_floor_composition = unitDigit ? false : !!(isFloor || isFigures);
    } else if (digitExplicit || p.has_digit_choice == null) {
      p.has_digit_choice = false;
    }

    if (inscriptionOn) {
      p.has_inscription = true;
      if (p.inscription_price == null) {
        p.inscription_price = (opts.inscription && opts.inscription.price != null)
          ? Number(opts.inscription.price) || 0
          : 0;
      }
    } else {
      p.has_inscription = false;
    }

    if (rentalOn) {
      p.has_rental = true;
      var rental = opts.rental && typeof opts.rental === 'object' ? opts.rental : {};
      if (!p.rental_item) {
        if (rental.item) p.rental_item = rental.item;
        else if (pzType === 'easel') p.rental_item = 'Мольберт с кругом из полистирола';
        else if (isPhotozone || pzType === 'frame') p.rental_item = 'Каркас фотозоны';
        else p.rental_item = 'Стойки, арки и декор фотозоны';
      }
      if (p.rental_days == null) {
        p.rental_days = rental.days != null ? Number(rental.days) || 3 : 3;
      }
      if (p.keep_price_delta == null) {
        if (rental.keep_price_delta != null) p.keep_price_delta = Number(rental.keep_price_delta) || 0;
        else if (isPhotozone) p.keep_price_delta = 500;
        else p.keep_price_delta = 0;
      }
      p.photozone_type = pzType || p.photozone_type || '';
    } else if (rentalExplicit || p.has_rental == null) {
      p.has_rental = false;
    }

    p.available_on_request = requestExplicit ? availableOn : (availableOn || !!p.available_on_request);
    p.needs_advance_order = advanceExplicit ? advanceOn : (advanceOn || !!p.needs_advance_order);
    return p;
  };
  window.vigNormalizeProducts = function (list) {
    return (list || []).map(window.vigNormalizeProduct);
  };
  window.vigStorefrontProducts = function (list) {
    return window.vigNormalizeProducts(list).filter(window.vigIsStorefrontVisible);
  };

  // Cloudinary free plan bills bandwidth on the original file. Delivery URLs
  // request a resized derivative; stored product URLs stay unchanged.
  window.vigCloudinarySized = function (url, width) {
    if (!url || url.indexOf('res.cloudinary.com') === -1 || url.indexOf('/image/upload/') === -1) return url;
    var w = Number(width) || 800;
    if (w < 200) w = 800;
    if (w > 1600) w = 1600;
    var marker = '/image/upload/';
    var i = url.indexOf(marker);
    var rest = url.slice(i + marker.length);
    if (/^[a-z]{1,3}_/.test(rest)) return url;
    return url.slice(0, i) + marker + 'f_auto,q_auto,w_' + w + ',c_limit/' + rest;
  };

  // Resolves a product image key/URL for the storefront (Cloudinary, local images, legacy keys).
  // width: delivery size for Cloudinary (catalog 800, product gallery 1200).
  window.vigImage = function (key, width) {
    if (!key) return '';
    if (key.indexOf('http') === 0 || key.indexOf('data:') === 0) return window.vigCloudinarySized(key, width);
    // Admin/legacy relative paths: ../images/foo.png → images/foo.png (GH Pages / local)
    if (key.indexOf('../') === 0) key = key.replace(/^(\.\.\/)+/, '');
    if (key.indexOf('./') === 0) key = key.slice(2);
    if (key.charAt(0) === '/') return key;
    if (
      key.indexOf('images/') === 0 ||
      key.indexOf('icons/') === 0 ||
      key.indexOf('assets/') === 0 ||
      key.indexOf('api/images/') === 0
    ) {
      return key;
    }
    return 'api/images/' + key;
  };

  /* Line icons for chrome / UI accents. Откат на unicode: VIG_LINE_EMOJI = false */
  window.VIG_LINE_EMOJI = true;
  var VIG_EMOJI_FALLBACK = {
    phone: '☎',
    balloon: '🎈',
    heart: '💕',
    pin: '📍',
    car: '🚗',
    chat: '💬',
    star: '✦',
    sparkles: '✨',
    receipt: '🧾'
  };
  var VIG_EMOJI_SRC = {
    phone: 'icons/phone-smartphone.webp?v=1',
    pin: 'icons/clay-pin.webp?v=1',
    chat: 'icons/footer-chat.png?v=2',
    car: 'icons/line-delivery.svg',
    balloon: 'icons/line-balloon.svg',
    heart: 'icons/line-heart.svg',
    star: 'icons/line-star.svg',
    sparkles: 'icons/line-sparkles.svg',
    receipt: 'icons/line-receipt.svg'
  };
  window.vigEmoji = function (name, extraClass) {
    if (!window.VIG_LINE_EMOJI) {
      return '<span class="vig-emoji-text" aria-hidden="true">' + (VIG_EMOJI_FALLBACK[name] || '') + '</span>';
    }
    var cls = 'vig-emoji' + (extraClass ? ' ' + extraClass : '');
    var src = VIG_EMOJI_SRC[name] || 'icons/line-balloon.svg';
    return '<img class="' + cls + '" src="' + src + '" alt="" width="24" height="24" decoding="async" aria-hidden="true" data-emoji="' + name + '"/>';
  };
  function applyLineEmojiMode() {
    if (!window.VIG_LINE_EMOJI) {
      document.querySelectorAll('img.vig-emoji[data-emoji]').forEach(function (img) {
        var name = img.getAttribute('data-emoji');
        var span = document.createElement('span');
        span.className = 'vig-emoji-text';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = VIG_EMOJI_FALLBACK[name] || '';
        img.parentNode.replaceChild(span, img);
      });
      return;
    }
    document.querySelectorAll('img.vig-emoji[data-emoji]').forEach(function (img) {
      var name = img.getAttribute('data-emoji');
      var src = VIG_EMOJI_SRC[name];
      var cur = img.getAttribute('src') || '';
      if (cur.indexOf('menu-') !== -1 || cur.indexOf('contact-') !== -1) return;
      if (src && cur !== src) img.setAttribute('src', src);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLineEmojiMode);
  } else {
    applyLineEmojiMode();
  }
  // Broken catalog photo: composition hero, then a missing-image state.
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-key')) {
      var key = t.getAttribute('data-key');
      var main = t.getAttribute('data-main-key') || '';
      if (main && main !== key) {
        t.setAttribute('data-key', main);
        t.src = window.vigImage(main);
      } else {
        t.removeAttribute('data-key');
        t.removeAttribute('src');
        t.classList.add('is-missing');
      }
    }
  }, true);

  function formatPrice(n) {
    return Number(n).toLocaleString('ru-RU') + ' ₽';
  }
  window.vigPrice = formatPrice;

  /* ---------- Shared clipboard + toast helpers ---------- */

  function legacyExecCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  // Reliable clipboard write: async Clipboard API first (secure context),
  // legacy execCommand fallback via a hidden textarea. Resolves to boolean.
  window.vigCopy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyExecCopy(text); });
    }
    return Promise.resolve(legacyExecCopy(text));
  };

  window.vigToast = function (text) {
    var prev = document.querySelector('.order-toast');
    if (prev) prev.remove();
    var t = document.createElement('div');
    t.className = 'order-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('order-toast-show'); });
    setTimeout(function () {
      t.classList.remove('order-toast-show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 2600);
  };

  /* ---------- Mobile menu ---------- */
  var header = document.querySelector('.site-header');
  var nav = document.querySelector('.header .nav');
  var menuBtn = document.querySelector('.menu-button');
  var backdrop = document.querySelector('.menu-backdrop');
  var closeBtn = document.querySelector('.mobile-menu-head button');

  function setMenu(open) {
    if (!nav) return;
    var wasOpen = nav.classList.contains('nav-open');
    nav.classList.toggle('nav-open', open);
    if (header) header.classList.toggle('menu-active', open);
    if (backdrop) backdrop.classList.toggle('menu-backdrop-open', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      nav.scrollTop = 0;
      requestAnimationFrame(function () {
        nav.scrollTop = 0;
        if (closeBtn) closeBtn.focus({ preventScroll: true });
      });
    } else if (wasOpen && menuBtn) {
      try { menuBtn.focus({ preventScroll: true }); }
      catch (e) { menuBtn.focus(); }
    }
  }
  /* In-page menu anchors: native hash scroll on a phone lands past the
     block, because the drawer closes and the browser focuses the menu
     button in the same turn. Place the target just under the sticky header. */
  function scrollBelowHeader(el) {
    var headerH = header ? header.getBoundingClientRect().height : 0;
    var top = el.getBoundingClientRect().top + window.scrollY - headerH - 12;
    window.scrollTo(0, Math.max(0, top));
  }
  function samePageHash(a) {
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#') return href.slice(1);
    try {
      var url = new URL(a.href, location.href);
      if (url.hash && url.pathname === location.pathname) return url.hash.slice(1);
    } catch (e) {}
    return '';
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(true); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setMenu(false); });
  if (backdrop) backdrop.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setMenu(false); closeModal(); }
  });
  if (nav) nav.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    var hash = samePageHash(a);
    var el = hash ? document.getElementById(hash) : null;
    if (el) {
      e.preventDefault();
      setMenu(false);
      requestAnimationFrame(function () {
        scrollBelowHeader(el);
        if (location.hash !== '#' + hash) history.pushState(null, '', '#' + hash);
      });
      return;
    }
    setMenu(false);
  });

  /* ---------- Header shadow on scroll ---------- */
  function onScrollHeader() {
    if (header) header.classList.toggle('site-header-scrolled', window.scrollY > 36);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Contact modal ---------- */
  var WA_ICON = '<img src="icons/brand-whatsapp.webp?v=9" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';
  var TG_ICON = '<img src="icons/brand-telegram.webp?v=9" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';
  var MAX_ICON = '<img src="icons/brand-max.webp?v=9" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';
  var PHONE_ICON = '<img src="icons/phone-smartphone.webp?v=1" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';

  var modalEl = null;
  var lastFocus = null;

  function buildModal() {
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.setAttribute('role', 'presentation');
    wrap.innerHTML =
      '<section class="contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title">' +
      '<button class="modal-close" type="button" aria-label="Закрыть">×</button>' +
      '<h2 id="contact-title">Как удобнее написать?</h2>' +
      '<p>Выберите мессенджер или позвоните — обсудим композицию и доставку.</p>' +
      '<div class="contact-options">' +
      '<a class="contact-option whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' + PHONE + '?text=' + encodeURIComponent(WA_TEXT) + '"><span>' + WA_ICON + '</span><div><strong>WhatsApp</strong><small>Сообщение уже подготовлено</small></div></a>' +
      '<a class="contact-option telegram" target="_blank" rel="noreferrer" href="' + TG_URL + '?text=' + encodeURIComponent(WA_TEXT) + '"><span>' + TG_ICON + '</span><div><strong>Telegram</strong><small>Текст скопируется · личный чат</small></div></a>' +
      '<a class="contact-option max" target="_blank" rel="noreferrer" href="' + MAX_URL + '"><span>' + MAX_ICON + '</span><div><strong>MAX</strong><small>Текст скопируется · вставьте в чат</small></div></a>' +
      '<a class="contact-option phone" href="tel:+' + PHONE + '"><span>' + PHONE_ICON + '</span><div><strong>Позвонить</strong><small>' + PHONE_LABEL + '</small></div></a>' +
      '</div>' +
      '<p class="modal-note">Заказ оформляется только после нашего подтверждения.</p>' +
      '</section>';
    wrap.addEventListener('mousedown', function (e) {
      if (e.target === wrap) closeModal();
    });
    wrap.querySelector('.contact-modal').addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    wrap.querySelector('.modal-close').addEventListener('click', closeModal);
    wrap.querySelector('.contact-option.telegram').addEventListener('click', function () {
      window.vigCopy(WA_TEXT);
    });
    wrap.querySelector('.contact-option.max').addEventListener('click', function () {
      window.vigCopy(WA_TEXT).then(function () {
        window.vigToast('Текст обращения скопирован в буфер! Зажмите поле ввода в MAX и нажмите «Вставить».');
      });
    });
    return wrap;
  }

  function openModal() {
    if (modalEl) return;
    lastFocus = document.activeElement;
    modalEl = buildModal();
    document.body.appendChild(modalEl);
    document.body.style.overflow = 'hidden';
    var close = modalEl.querySelector('.modal-close');
    if (close) close.focus();
  }
  function closeModal() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) {}
    }
  }
  window.vigContact = openModal;

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-contact]');
    if (t) {
      e.preventDefault();
      openModal();
    }
  });

  // Wire known CTA buttons (footer CTA, story link, footer contacts, mobile CTA)
  function wireCtas() {
    var sels = ['.footer-cta button', '.story-link', '.footer-contacts button'];
    sels.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (btn) {
        if (btn.hasAttribute('data-custom-modal')) return;
        if (!btn.hasAttribute('data-contact')) {
          btn.setAttribute('data-contact', '1');
        }
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireCtas);
  } else {
    wireCtas();
  }

  /* ---------- Holiday garnish ---------- */
  var SEASON_COPY = {
    valentine: 'Соберём композицию к 14 февраля',
    defender: 'Соберём композицию к 23 февраля',
    womens: 'Соберём композицию к 8 марта',
    victory: 'Соберём композицию к 9 мая',
    grad: 'Соберём композицию к выпускному',
    school: 'Соберём композицию к 1 сентября',
    teacher: 'Ко Дню учителя',
    halloween: 'Соберём композицию к Хэллоуину',
    newyear: 'Соберём композицию к Новому году'
  };
  var SEASON_MARK = {
    valentine:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 31C10 25 6 20 6 15.2a5.6 5.6 0 0 1 10.2-3.2A5.6 5.6 0 0 1 30 15.2C30 20 26 25 18 31z" fill="#FF6B5A"/></svg>',
    defender:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 7l2.8 7.4H28l-6 4.6 2.2 7.2L18 22.4 11.8 26.2 14 19 8 14.4h7.2z" fill="#e2b340"/></svg>',
    womens:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 34V18" stroke="#3d7a45" stroke-width="2" stroke-linecap="round"/><path d="M18 28c-4 1-7 0-8-2" fill="none" stroke="#3d7a45" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="18" cy="14" rx="4.2" ry="7" fill="#e07a8a"/><ellipse cx="13.2" cy="16" rx="3.4" ry="6" fill="#f0a0aa"/><ellipse cx="22.8" cy="16" rx="3.4" ry="6" fill="#f0a0aa"/></svg>',
    victory:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M6 16h24v7H6z" fill="#f08a3c"/><path d="M6 18.2h24M6 20.8h24" stroke="#2a2a32" stroke-width="1.5"/><path d="M13 23l-5 11M23 23l5 11" stroke="#f08a3c" stroke-width="3.2" stroke-linecap="round"/><path d="M13 23l-5 11M23 23l5 11" stroke="#2a2a32" stroke-width="1.1" stroke-linecap="round"/></svg>',
    grad:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><path d="M18 8l14 6-14 6L4 14z" fill="#2a2a32"/><path d="M11 16.5v7.5c0 3.2 14 3.2 14 0v-7.5" fill="none" stroke="#2a2a32" stroke-width="1.6"/><path d="M30 14.5v8" stroke="#e2b340" stroke-width="1.4"/><circle cx="30" cy="24" r="1.5" fill="#e2b340"/></svg>',
    school:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><rect x="17" y="2" width="2" height="5" rx=".6" fill="#4A4A52"/><path d="M18 6.5c-7 1.2-11 8-11 14.2V24h22v-3.3C29 14.5 25 7.7 18 6.5z" fill="#e2b340"/><rect x="8" y="23.2" width="20" height="3.2" rx="1.2" fill="#c4962a"/><circle cx="18" cy="31" r="3" fill="#c4962a"/></svg>',
    teacher:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><rect x="16.2" y="3" width="3.6" height="5" rx="1.2" fill="#e2554a"/><path d="M18 8c-8.2 1.6-12 8.4-12 15.2V27h24v-3.8C30 16.4 26.2 9.6 18 8z" fill="#FF6B5A"/><rect x="6.5" y="25.6" width="23" height="3.4" rx="1.4" fill="#e2554a"/><circle cx="18" cy="33.2" r="2.6" fill="#FF6B5A"/></svg>',
    halloween:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><rect x="16" y="7" width="4" height="6" rx="1.2" fill="#3d7a45"/><path d="M18 6c3-4 7-4 8-1" fill="none" stroke="#3d7a45" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="18" cy="24" rx="9" ry="11" fill="#f08a3c"/><ellipse cx="12.5" cy="24" rx="5.5" ry="10" fill="#e07a2c"/><ellipse cx="23.5" cy="24" rx="5.5" ry="10" fill="#e07a2c"/></svg>',
    newyear:
      '<svg viewBox="0 0 36 40" aria-hidden="true"><rect x="12" y="3" width="12" height="3" rx="1" fill="#4A4A52"/><rect x="14.5" y="6" width="7" height="6" fill="#4A4A52"/><circle cx="18" cy="17.5" r="6" fill="#fff" stroke="#d5dde6"/><circle cx="18" cy="30" r="8" fill="#fff" stroke="#d5dde6"/><path d="M12 22h12l1.5 2.4H11z" fill="#FF6B5A"/><path d="M22 23.5l3.2 7" stroke="#FF6B5A" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="17" r=".8" fill="#1e293b"/><circle cx="20.2" cy="17" r=".8" fill="#1e293b"/></svg>'
  };

  function clearSeason() {
    document.documentElement.removeAttribute('data-season');
    var nodes = document.querySelectorAll('.season-mark, .season-strip, .season-banner, .season-motion');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }

  function seasonPiece(className, left, delay, duration, extra) {
    var el = document.createElement('span');
    el.className = className;
    el.style.cssText = 'left:' + left + ';animation-delay:' + delay + ';animation-duration:' + duration + ';' + (extra || '');
    return el;
  }

  function buildMotion(season) {
    var box = document.createElement('div');
    box.className = 'season-motion';
    box.setAttribute('aria-hidden', 'true');
    if (season === 'newyear') {
      var flake = '<svg viewBox="0 0 24 24"><path d="M12 2v20M5 6.5l14 11M5 17.5l14-11" fill="none" stroke="#7f9cb8" stroke-width="1.7" stroke-linecap="round"/></svg>';
      var spots = ['8%', '22%', '38%', '54%', '70%', '86%'];
      for (var i = 0; i < spots.length; i++) {
        var bit = seasonPiece('season-flake', spots[i], (-i * 3.2) + 's', (18 + (i % 3) * 2) + 's', '');
        bit.innerHTML = flake;
        box.appendChild(bit);
      }
    } else if (season === 'halloween') {
      var colors = ['#f08a3c', '#2a2a32', '#e07a6a'];
      var lefts = ['6%', '28%', '52%'];
      for (var b = 0; b < 3; b++) {
        var balloon = seasonPiece('season-balloon', lefts[b], (b * 0.7) + 's', (10 + b) + 's', 'background:' + colors[b] + ';color:' + colors[b]);
        box.appendChild(balloon);
      }
    } else if (season === 'school' || season === 'teacher') {
      var leafFill = season === 'teacher' ? '#6a9a4a' : '#e09a3e';
      var leafVein = season === 'teacher' ? '#3d7a45' : '#c4782a';
      var leafSvg = '<svg viewBox="0 0 16 16"><path d="M8 1c2 3 6 4 6 8a6 6 0 0 1-12 0C2 5 6 4 8 1z" fill="' + leafFill + '"/><path d="M8 3v10" stroke="' + leafVein + '" stroke-width="1"/></svg>';
      var leafLeft = ['18%', '46%', '72%'];
      for (var n = 0; n < 3; n++) {
        var leaf = seasonPiece('season-leaf', leafLeft[n], (n * 0.45) + 's', (7 + n * 0.6) + 's', '');
        leaf.innerHTML = leafSvg;
        box.appendChild(leaf);
      }
    } else if (season === 'valentine' || season === 'defender') {
      var glyph = season === 'valentine'
        ? '<svg viewBox="0 0 16 16"><path d="M8 13C4 10 2 8 2 5.6a2.6 2.6 0 0 1 4.8-1.4A2.6 2.6 0 0 1 14 5.6C14 8 12 10 8 13z" fill="#FF6B5A"/></svg>'
        : '<svg viewBox="0 0 16 16"><path d="M8 1.5l1.6 4.2H14l-3.4 2.6 1.3 4.2L8 10.2 4.1 12.5 5.4 8.3 2 5.7h4.4z" fill="#e2b340"/></svg>';
      var glyphClass = season === 'valentine' ? 'season-heart' : 'season-star';
      var glyphLeft = ['12%', '40%', '68%'];
      for (var g = 0; g < 3; g++) {
        var glyphEl = seasonPiece(glyphClass, glyphLeft[g], (g * 0.55) + 's', (9 + g) + 's', '');
        glyphEl.innerHTML = glyph;
        box.appendChild(glyphEl);
      }
    } else if (season === 'womens') {
      var petal = '<svg viewBox="0 0 16 16"><ellipse cx="8" cy="8" rx="3" ry="6" fill="#e07a8a"/></svg>';
      var petalLeft = ['16%', '44%', '70%'];
      for (var p = 0; p < 3; p++) {
        var petalEl = seasonPiece('season-leaf', petalLeft[p], (p * 0.4) + 's', (7.5 + p) + 's', '');
        petalEl.innerHTML = petal;
        box.appendChild(petalEl);
      }
    } else if (season === 'grad') {
      var confettiColors = ['#e2b340', '#FF6B5A', '#7eb6d6', '#e2b340'];
      var confettiLeft = ['14%', '36%', '58%', '78%'];
      for (var c = 0; c < 4; c++) {
        var bitConf = seasonPiece('season-confetti', confettiLeft[c], (c * 0.35) + 's', (6.5 + c * 0.4) + 's', 'background:' + confettiColors[c]);
        box.appendChild(bitConf);
      }
    }
    if (!box.childNodes.length) return null;
    return box;
  }

  function applySeason(season) {
    clearSeason();
    if (!season || season === 'none' || !SEASON_COPY[season]) return;
    var header = document.querySelector('header.site-header');
    var logo = header && header.querySelector('.brand-logo');
    if (!header || !logo) return;
    document.documentElement.setAttribute('data-season', season);
    if (SEASON_MARK[season]) {
      var mark = document.createElement('span');
      mark.className = 'season-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = SEASON_MARK[season];
      logo.appendChild(mark);
    }
    var strip;
    if (season === 'teacher') {
      strip = document.createElement('a');
      strip.className = 'season-banner';
      strip.href = 'catalog.html?group=holidays&category=' + encodeURIComponent('День учителя');
      strip.innerHTML = '<img src="images/holidays/holiday-teacher.webp?v=20260926" alt="" width="36" height="36"/>' +
        '<span>' + SEASON_COPY[season] + '</span><b aria-hidden="true">→</b>';
    } else {
      strip = document.createElement('p');
      strip.className = 'season-strip';
      strip.textContent = SEASON_COPY[season];
    }
    header.insertAdjacentElement('afterend', strip);
    var motion = buildMotion(season);
    if (motion) document.body.appendChild(motion);
  }

  function loadSeason() {
    function read(url) {
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        if (!data || data.ok === false || !data.season) throw new Error('empty');
        return data.season;
      });
    }
    var fileUrl = window.vigSameOrigin ? window.vigSameOrigin('data/season.json') : 'data/season.json';
    var api = (window.VIG_API || 'https://api.vigsharm.ru') + '/api/season';
    function readApi() {
      var ms = 1200;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      if (ctrl) {
        timer = setTimeout(function () {
          try { ctrl.abort(); } catch (e) { /* ignore */ }
        }, ms);
      }
      return fetch(api, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        if (!data || data.ok === false || !data.season) throw new Error('empty');
        return data.season;
      }).finally(function () {
        if (timer) clearTimeout(timer);
      });
    }
    readApi().catch(function () { return read(fileUrl); }).then(applySeason).catch(function () {});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSeason);
  } else {
    loadSeason();
  }
})();
