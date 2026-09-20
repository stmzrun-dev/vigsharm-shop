/* VigSharm — shared site behaviour (header menu, contact modal, image fallback) */
(function () {
  'use strict';

  var PHONE = '79284440142';
  var PHONE_LABEL = '+7 928 444-01-42';
  var MAX_URL = 'https://max.ru/u/f9LHodD0cOJwY09H6Zj63nYK_X8tPZGb3CODIvTT7FWkRzrgbh5F582AiB8';
  var TG_URL = 'https://t.me/Olgamzz';
  var WA_TEXT = 'Здравствуйте! Хочу сделать заказ в Вигшарм.';
  var REMOTE = 'https://vigsharm-new.stmzrun.chatgpt.site';
  // Worker API (Cloudflare). В РФ *.workers.dev часто недоступен без VPN —
  // тогда витрина берёт снимок data/products.json с того же хоста, что и сайт.
  window.VIG_API = 'https://vigsharm-api.vigsharm.workers.dev';
  window.VIG_PRODUCTS_FALLBACK = 'data/products.json';

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
    if (/(?:^|[^\d])1\s+(?:[а-яa-z-]+\s+){0,3}цифр/.test(t)
      || /(?:^|[^а-яa-z0-9])одн[аоуы]\s+(?:[а-яa-z-]+\s+){0,2}цифр/.test(t)) {
      return 1;
    }
    if (/(?:^|[^а-яa-z0-9])цифры(?:[^а-яa-z0-9]|$)/.test(t)) return 2;
    if (/цифр[ауы]/.test(t)) return 1;
    return 0;
  }
  window.vigIsStorefrontVisible = function (p) {
    if (!p) return false;
    // Hide drafts only. Many published rows still have show_on_site=0 from older saves.
    if (p.status && p.status !== 'published') return false;
    return true;
  };
  /** First usable product photo from D1 (photos/main_photo) or legacy image_keys. */
  window.vigProductPhoto = function (p) {
    if (!p) return '';
    var keys = p.image_keys;
    if ((!keys || !keys.length) && Array.isArray(p.photos) && p.photos.length) keys = p.photos;
    if (keys && keys.length && keys[0]) return keys[0];
    return p.main_photo || '';
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
    var inscriptionOn = vigTruthy(opts.personal_inscription) || vigOptEnabled(opts.inscription);
    var rentalOn = vigTruthy(opts.photozone_rental) || vigOptEnabled(opts.rental);
    var availableOn = vigTruthy(opts.available_on_request) || vigOptEnabled(opts.available_on_request);
    var advanceOn = vigTruthy(opts.advance_order_1_2_days) || vigOptEnabled(opts.advance_order)
      || vigTruthy(opts.advance_order);
    var isBouquet = p.scene === 'handheld_bouquet'
      || p.category === 'Букет из шаров'
      || p.category === 'Крафтовый букет'
      || p.category === 'Цветы из шаров';
    var isPhotozone = p.scene === 'photozone' || p.category === 'Фотозона';
    var isFloor = p.scene === 'floor' || p.category === 'Напольные композиции';
    var isFigures = p.scene === 'balloon_figures' || p.category === 'Фигуры из шаров';
    var isWallOnly = p.scene === 'wall_only';
    var pzType = opts.photozone_type || '';
    var compJoined = Array.isArray(p.composition) ? p.composition.join(' ') : String(p.composition || '');
    // Fallback: напольные / фигуры / букеты без явного флага — тоже заранее
    if (!advanceOn && (isFloor || isFigures || isBouquet)) {
      advanceOn = true;
    }
    // Фотозоны — всегда заранее и аренда
    if (isPhotozone) {
      advanceOn = true;
      rentalOn = true;
      if (!pzType) {
        var hintItem = (opts.rental && opts.rental.item) || '';
        var compHint = Array.isArray(p.composition) ? p.composition.join(' ') : String(p.composition || '');
        var compLow = compHint.toLowerCase().replace(/ё/g, 'е');
        if (/мольбер|полистирол/.test(compLow) || /мольбер/i.test(hintItem)) pzType = 'easel';
        else if (/каркас|кругл|обруч/.test(compLow) || /каркас/i.test(hintItem)) pzType = 'frame';
        else pzType = /мольбер/i.test(hintItem) ? 'easel' : 'frame';
      }
      if (pzType === 'easel' && !inscriptionOn) inscriptionOn = true;
    }
    // Букеты без явного флага — персональная надпись
    if (!inscriptionOn && isBouquet) {
      inscriptionOn = true;
    }
    // В составе «коробка» / «… с надписью» / «с индивидуальной надписью»
    if (!inscriptionOn && /надпис|индивидуальн|коробк/i.test(compJoined)) {
      inscriptionOn = true;
    }

    // «1 цифра» / «2 цифры» в составе (любая сцена) → выбор цифры
    var compDigits = vigCompositionDigitCount(p.composition);
    if (!digitOn && compDigits > 0) {
      digitOn = true;
    }

    if (digitOn) {
      p.has_digit_choice = true;
      var digitCount = (opts.digit_choice && opts.digit_choice.count_on_photo) || p.digit_count_on_photo || compDigits || 1;
      p.digit_count_on_photo = Math.min(2, Math.max(1, Number(digitCount) || 1));
      // Напольные, фигуры и «только стена»: количество цифр фиксировано
      p.digit_count_locked = !!(isFloor || isWallOnly || isFigures);
      p.is_floor_composition = !!(isFloor || isFigures);
    } else if (p.has_digit_choice == null) {
      p.has_digit_choice = false;
    }

    if (inscriptionOn) {
      p.has_inscription = true;
      if (p.inscription_price == null) {
        p.inscription_price = (opts.inscription && opts.inscription.price != null)
          ? Number(opts.inscription.price) || 0
          : 0;
      }
    } else if (p.has_inscription == null) {
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
    } else if (p.has_rental == null) {
      p.has_rental = false;
    }

    p.available_on_request = availableOn || !!p.available_on_request;
    p.needs_advance_order = advanceOn || !!p.needs_advance_order;
    return p;
  };
  window.vigNormalizeProducts = function (list) {
    return (list || []).map(window.vigNormalizeProduct);
  };
  window.vigStorefrontProducts = function (list) {
    return window.vigNormalizeProducts(list).filter(window.vigIsStorefrontVisible);
  };

  // Resolves a product image key/URL for the storefront (Cloudinary, local images, legacy keys).
  window.vigImage = function (key) {
    if (!key) return '';
    if (key.indexOf('http') === 0 || key.indexOf('data:') === 0) return key;
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
    phone: 'icons/line-phone.svg',
    pin: 'icons/line-pin.svg',
    chat: 'icons/line-chat.svg',
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
      if (cur.indexOf('menu-') !== -1) return;
      if (src && cur !== src) img.setAttribute('src', src);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLineEmojiMode);
  } else {
    applyLineEmojiMode();
  }
  window.vigRemote = function (key) {
    if (!key) return '';
    if (key.indexOf('http') === 0) return key;
    if (key.charAt(0) === '/') return REMOTE + key;
    return REMOTE + '/api/images/' + key;
  };
  // Global img fallback: local -> remote -> main product photo (if set) -> placeholder
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-key')) {
      var stage = t.getAttribute('data-fb') || '0';
      var key = t.getAttribute('data-key');
      var main = t.getAttribute('data-main-key') || '';
      if (stage === '0') {
        t.setAttribute('data-fb', '1');
        t.src = window.vigRemote(key);
      } else if (stage === '1' && main && main !== key) {
        // Digit/variant photo failed — always fall back to the composition hero shot.
        t.setAttribute('data-fb', '0');
        t.setAttribute('data-key', main);
        t.src = window.vigImage(main);
      } else if (stage === '1') {
        t.setAttribute('data-fb', '2');
        t.removeAttribute('data-key');
        t.src = 'icons/line-balloon.svg';
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
      menuBtn.focus();
    }
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setMenu(true); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setMenu(false); });
  if (backdrop) backdrop.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setMenu(false); closeModal(); }
  });
  if (nav) nav.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a) setMenu(false);
  });

  /* ---------- Header shadow on scroll ---------- */
  function onScrollHeader() {
    if (header) header.classList.toggle('site-header-scrolled', window.scrollY > 36);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Contact modal ---------- */
  var WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a9.75 9.75 0 0 0-8.47 14.58L2.2 21.8l5.35-1.28A9.78 9.78 0 1 0 12 2Zm0 17.5a7.7 7.7 0 0 1-3.92-1.08l-.37-.22-3.08.74.77-3-.24-.38A7.75 7.75 0 1 1 12 19.5Zm4.25-5.78c-.23-.12-1.37-.67-1.58-.75-.21-.08-.36-.12-.52.12-.15.23-.6.75-.73.9-.14.16-.27.18-.5.06-1.39-.69-2.3-1.23-3.22-2.8-.24-.42.24-.39.69-1.3.08-.16.04-.3-.02-.42-.06-.12-.52-1.25-.71-1.71-.19-.45-.38-.39-.52-.4h-.45c-.16 0-.41.06-.62.29-.21.23-.81.79-.81 1.92 0 1.14.83 2.23.94 2.39.12.15 1.63 2.48 3.94 3.48 1.47.63 2.04.69 2.77.58.44-.07 1.37-.56 1.56-1.1.19-.54.19-1 .13-1.1-.06-.09-.21-.15-.44-.26Z"></path></svg>';
  var TG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.67 3.55 2.8 10.44c-1.22.49-1.21 1.16-.22 1.46l4.58 1.43 1.76 5.42c.21.58.1.81.72.81.48 0 .69-.22.96-.48l2.2-2.14 4.58 3.38c.84.46 1.45.22 1.66-.78l3-14.14c.31-1.23-.47-1.79-1.37-1.85ZM8.1 13l10.32-6.51c.52-.31 1-.15.61.2l-8.51 7.68-.33 3.54L8.1 13Z"></path></svg>';

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
      '<a class="contact-option whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' + PHONE + '?text=' + encodeURIComponent(WA_TEXT) + '"><span>' + WA_SVG + '</span><div><strong>WhatsApp</strong><small>Написать сообщение</small></div></a>' +
      '<a class="contact-option telegram" target="_blank" rel="noreferrer" href="' + TG_URL + '?text=' + encodeURIComponent(WA_TEXT) + '"><span>' + TG_SVG + '</span><div><strong>Telegram</strong><small>Написать в личный чат</small></div></a>' +
      '<a class="contact-option max" target="_blank" rel="noreferrer" href="' + MAX_URL + '"><span><img src="icons/max-official.png" alt="" aria-hidden="true"/></span><div><strong>MAX</strong><small>Открыть переписку с Вигшарм</small></div></a>' +
      '<a class="contact-option phone" href="tel:+' + PHONE + '"><span>' + window.vigEmoji('phone') + '</span><div><strong>Позвонить</strong><small>' + PHONE_LABEL + '</small></div></a>' +
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
    var sels = ['.footer-cta button', '.story-link', '.footer-contacts button', '.homepage-mobile-cta'];
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
})();
