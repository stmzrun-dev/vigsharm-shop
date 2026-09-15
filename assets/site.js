/* VigSharm — shared site behaviour (header menu, contact modal, image fallback) */
(function () {
  'use strict';

  var PHONE = '79284440142';
  var PHONE_LABEL = '+7 928 444-01-42';
  var MAX_URL = 'https://max.ru/u/f9LHodD0cOJwY09H6Zj63nYK_X8tPZGb3CODIvTT7FWkRzrgbh5F582AiB8';
  var TG_URL = 'https://t.me/Olgamzz';
  var WA_TEXT = 'Здравствуйте! Хочу сделать заказ в Вигшарм.';
  var REMOTE = 'https://vigsharm-new.stmzrun.chatgpt.site';

  // Приводит товар из Worker API (схема D1: article/full_description/character/photos/composition[])
  // к плоским полям, которые ожидает старый код витрины (sku/description/character_name/image_keys/
  // composition-строка). Конфигуратор цифр/надписи/аренды НЕ восстанавливается —
  // админка пока не собирает эти данные (has_digit_choice, digit_images, inscription_price,
  // rental_item и т.д.), поэтому карточки без него, но фото/название/цена/описание корректны.
  window.vigNormalizeProduct = function (p) {
    if (!p) return p;
    p.sku = p.sku || p.article || '';
    p.description = p.description || p.full_description || '';
    p.character_name = p.character_name || p.character || '';
    p.image_keys = p.image_keys || p.photos || [];
    if (Array.isArray(p.composition)) p.composition = p.composition.join('\n');
    return p;
  };
  window.vigNormalizeProducts = function (list) {
    return (list || []).map(window.vigNormalizeProduct);
  };

  // Resolves a product image key to a local path, with remote fallback handled via onerror.
  window.vigImage = function (key) {
    if (!key) return '';
    if (key.indexOf('http') === 0 || key.charAt(0) === '/') return key;
    return 'api/images/' + key;
  };
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
        t.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" rx="48" fill="#f3fcfc"/><text x="50%" y="47%" font-size="140" text-anchor="middle">🎈</text><text x="50%" y="60%" font-size="34" text-anchor="middle" fill="#68727e" font-family="sans-serif">VigSharm</text></svg>'
        );
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
    nav.classList.toggle('nav-open', open);
    if (header) header.classList.toggle('menu-active', open);
    if (backdrop) backdrop.classList.toggle('menu-backdrop-open', open);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
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
      '<p class="eyebrow">Мы на связи</p>' +
      '<h2 id="contact-title">Как вам удобнее?</h2>' +
      '<p>Выберите мессенджер или позвоните — обсудим композицию и свободное время доставки.</p>' +
      '<div class="contact-options">' +
      '<a class="contact-option whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' + PHONE + '?text=' + encodeURIComponent(WA_TEXT) + '"><span>' + WA_SVG + '</span><div><strong>WhatsApp</strong><small>Написать сообщение</small></div><b>→</b></a>' +
      '<a class="contact-option telegram" target="_blank" rel="noreferrer" href="' + TG_URL + '?text=' + encodeURIComponent(WA_TEXT) + '"><span>' + TG_SVG + '</span><div><strong>Telegram</strong><small>Написать в личный чат</small></div><b>→</b></a>' +
      '<a class="contact-option max" target="_blank" rel="noreferrer" href="' + MAX_URL + '"><span><img src="icons/max-official.png" alt="" aria-hidden="true"/></span><div><strong>MAX</strong><small>Открыть переписку с Вигшарм</small></div><b>→</b></a>' +
      '<a class="contact-option phone" href="tel:+' + PHONE + '"><span>☎</span><div><strong>Позвонить</strong><small>' + PHONE_LABEL + '</small></div><b>→</b></a>' +
      '</div>' +
      '<p class="modal-note">Нажатие откроет выбранный способ связи. Заказ оформляется только после нашего подтверждения.</p>' +
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
