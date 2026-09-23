/* VigSharm homepage: popular products, characters toggle, mobile CTA */
(function () {
  'use strict';

  /* ---------- Popular products (first 4 from catalog feed) ---------- */
  var list = document.getElementById('popular-list');
  var section = document.getElementById('products');
  if (list) {
    (window.vigFetchProducts
      ? window.vigFetchProducts()
      : fetch('https://vigsharm-api.vigsharm.workers.dev/api/products', { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (data) { return (data.ok && Array.isArray(data.products)) ? data.products : []; })
    )
      .then(function (raw) {
        var products = (window.vigStorefrontProducts || window.vigNormalizeProducts)(raw || []);
        /* Popular = compositions, not unit balloons from the price list */
        products = products.filter(function (p) {
          if (!p) return false;
          if (p.scene === 'unit_balloon') return false;
          var cat = String(p.category || '').toLowerCase();
          if (cat.indexOf('поштучно') !== -1) return false;
          return true;
        });
        if (!products.length) {
          if (section) section.style.display = 'none';
          revealHash();
          return;
        }
        list.innerHTML = products.slice(0, 4).map(function (p) {
          var key = (window.vigProductPhoto ? window.vigProductPhoto(p) : '') ||
            (p.image_keys && p.image_keys[0]) ||
            (p.photos && p.photos[0]) ||
            p.main_photo ||
            '';
          var img = key
            ? '<img src="' + window.vigImage(key) + '" data-key="' + escapeHtml(key) + '" alt="' + escapeHtml(p.title) + '" loading="lazy" decoding="async"/>'
            : (window.vigEmoji ? window.vigEmoji('balloon') : '<img class="vig-emoji" src="icons/line-balloon.svg" alt="" width="24" height="24" decoding="async" aria-hidden="true"/>');
          var requestBadge = p.available_on_request ? '<em class="product-request-badge">Под заказ</em>' : '';
          var cat = String(p.category || '').trim();
          var advanceBadge = (!requestBadge && p.needs_advance_order && !cat)
            ? '<em class="product-advance-badge">Заказ за 1–2 дня</em>'
            : '';
          var badge = requestBadge || advanceBadge;
          return (
            '<a class="live-product-card" href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '" aria-label="Подробнее: ' + escapeHtml(p.title) + '">' +
            '<span class="live-product-image">' + img + '</span>' +
            '<span class="live-product-copy">' +
            '<span class="live-product-meta"><small>' + escapeHtml(cat || 'Композиция') + '</small>' + badge + '</span>' +
            '<strong>' + escapeHtml(p.title) + '</strong>' +
            '<span>' + escapeHtml(p.short_description || '') + '</span>' +
            '<b>' + Number(p.price).toLocaleString('ru-RU') + ' ₽ <i aria-hidden="true">Подробнее</i></b>' +
            '</span></a>'
          );
        }).join('');
        revealHash();
      })
      .catch(function () {
        if (section) section.style.display = 'none';
        revealHash();
      });
  }

  /* Products above the hash targets load after the first scroll. */
  function revealHash() {
    var id = (location.hash || '').replace('#', '');
    if (!id) return;
    var el = document.getElementById(id);
    if (!el || !el.scrollIntoView) return;
    var margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    var delta = el.getBoundingClientRect().top - margin;
    if (Math.abs(delta) < 24 || Math.abs(delta) > 900) return;
    requestAnimationFrame(function () {
      try { el.scrollIntoView({ behavior: 'auto', block: 'start' }); }
      catch (e) { el.scrollIntoView(); }
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

})();
