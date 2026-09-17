/* VigSharm homepage: popular products, characters toggle, mobile CTA */
(function () {
  'use strict';

  /* ---------- Popular products (first 6 from catalog feed) ---------- */
  var list = document.getElementById('popular-list');
  var section = document.getElementById('products');
  if (list) {
    fetch('https://vigsharm-api.vigsharm.workers.dev/api/products', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // Worker API возвращает { ok: true, products: [...] }
        var products = (window.vigStorefrontProducts || window.vigNormalizeProducts)(
          (data.ok && Array.isArray(data.products)) ? data.products : []
        );
        if (!products.length) {
          if (section) section.style.display = 'none';
          return;
        }
        list.innerHTML = products.slice(0, 6).map(function (p) {
          var key = (window.vigProductPhoto ? window.vigProductPhoto(p) : '') ||
            (p.image_keys && p.image_keys[0]) ||
            (p.photos && p.photos[0]) ||
            p.main_photo ||
            '';
          var img = key
            ? '<img src="' + window.vigImage(key) + '" data-key="' + escapeHtml(key) + '" alt="' + escapeHtml(p.title) + '" loading="lazy" decoding="async"/>'
            : (window.vigEmoji ? window.vigEmoji('balloon') : '<img class="vig-emoji" src="icons/vigsharm-toons/emoji-balloon.png" alt="" width="24" height="24" decoding="async" aria-hidden="true"/>');
          var requestBadge = p.available_on_request ? '<em class="product-request-badge">Под заказ</em>' : '';
          var advanceBadge = (!requestBadge && p.needs_advance_order) ? '<em class="product-advance-badge">За 1–2 дня</em>' : '';
          var badge = requestBadge || advanceBadge;
          return (
            '<a class="live-product-card" href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '" aria-label="Подробнее: ' + escapeHtml(p.title) + '">' +
            '<span class="live-product-image">' + img + '</span>' +
            '<span class="live-product-copy">' +
            '<span class="live-product-meta"><small>' + escapeHtml(p.category || 'Композиция') + '</small>' + badge + '</span>' +
            '<strong>' + escapeHtml(p.title) + '</strong>' +
            '<span>' + escapeHtml(p.short_description || '') + '</span>' +
            '<b>' + Number(p.price).toLocaleString('ru-RU') + ' ₽ <i aria-hidden="true">Подробнее&nbsp; →</i></b>' +
            '</span></a>'
          );
        }).join('');
      })
      .catch(function () {
        if (section) section.style.display = 'none';
      });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- Characters expand/collapse ---------- */
  var scroll = document.querySelector('.character-scroll');
  var toggle = document.querySelector('.all-characters');
  if (scroll && toggle) {
    toggle.addEventListener('click', function () {
      var expanded = scroll.classList.toggle('characters-expanded');
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      var total = scroll.querySelectorAll('.character-card').length || 33;
      toggle.innerHTML = expanded
        ? 'Свернуть список<span aria-hidden="true">↑</span>'
        : 'Показать всех персонажей (' + total + ')<span aria-hidden="true">↓</span>';
    });
  }

  /* ---------- Mobile CTA visibility ---------- */
  var cta = document.querySelector('.homepage-mobile-cta');
  function updateCta() {
    if (!cta) return;
    var show = window.scrollY > Math.min(window.innerHeight * 0.72, 620);
    // hide when footer CTA / footer in view
    var footerVisible = false;
    try {
      var els = document.querySelectorAll('.footer-cta, footer');
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        if (r.top < window.innerHeight - 80 && r.bottom > 0) { footerVisible = true; break; }
      }
    } catch (e) {}
    var visible = show && !footerVisible;
    cta.classList.toggle('homepage-mobile-cta-visible', visible);
    cta.setAttribute('aria-hidden', visible ? 'false' : 'true');
    cta.setAttribute('tabindex', visible ? '0' : '-1');
  }
  window.addEventListener('scroll', updateCta, { passive: true });
  window.addEventListener('resize', updateCta);
  updateCta();
})();
