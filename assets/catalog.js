/* VigSharm catalog: groups, filters, search, render — port of original behaviour */
(function () {
  'use strict';

  var READY_SUBCATS = ['Для девочки', 'Для мальчика', 'Для неё', 'Для мамы', 'Для него', 'На выписку', 'День рождения', 'Оригинальные подарки', 'Оформление праздника', 'Фигуры из шаров', 'Цветы из шаров', 'Арки', 'Шар-сюрприз', 'Крафтовый букет', 'Коробка-сюрприз', 'Гендер-пати'];
  var UNIT_SUBCATS = ['Латексные шары', 'Шары с рисунком', 'Фольгированные фигуры', 'Ходячие фигуры', 'Круги, звёзды и сердца', 'Шары с конфетти', 'Шары хром', 'Шары Brush', 'Шары Super Agate', 'Шары Bubble', 'Фольгированные цифры', 'Именные шары'];
  var UNIT_COLLECTIONS = ['Шары с рисунком', 'Латексные шары', 'Фольгированные фигуры', 'Ходячие фигуры', 'Круги, звёзды и сердца', 'Шары с конфетти', 'Шары хром', 'Шары Brush', 'Шары Super Agate', 'Шары Bubble', 'Фольгированные цифры'];
  var DETAIL_FILTERS = ['Для мальчика', 'Для девочки', 'Детские', 'Для него', 'Для неё', 'На выписку', 'День рождения', 'Праздники', 'Персонажи', 'Универсальные'];
  var HOLIDAYS = ['Новый год', '14 февраля', '23 февраля', '8 марта', '9 мая', 'Выпускной', '1 сентября', 'День учителя', 'Хэллоуин'];
  var SINGLE_GIFTS = ['Фигуры из шаров', 'Цветы из шаров', 'Арки', 'Шар-сюрприз', 'Крафтовый букет', 'Коробка-сюрприз', 'Гендер-пати'];
  var GROUPS = [
    { id: 'ready', title: 'Готовые решения', mobile: 'Готовые', icon: 'ready', iconImg: 'icons/vigsharm-toons/ready.webp', chipImg: 'icons/vigsharm-toons/chip-ready.png', note: 'Композиции для любого повода' },
    { id: 'characters', title: 'Персонажи', mobile: 'Персонажи', icon: 'characters', iconImg: 'icons/vigsharm-toons/characters.webp', chipImg: 'icons/vigsharm-toons/chip-characters.png', note: 'Любимые герои детей' },
    { id: 'unit', title: 'Шары поштучно', mobile: 'Шары', icon: 'unit', iconImg: 'icons/vigsharm-toons/balloons.webp', chipImg: 'icons/vigsharm-toons/chip-unit.png', note: 'Отдельные шары и фигуры' },
    { id: 'holidays', title: 'Праздники', mobile: 'Праздники', icon: 'holidays', iconImg: 'icons/vigsharm-toons/holidays.webp', chipImg: 'icons/vigsharm-toons/chip-holidays.png', note: 'Сезонные коллекции' }
  ];
  var ALL_CHIP_IMG = 'icons/vigsharm-toons/chip-all.png';
  var PRICES = [
    { label: 'Любая стоимость', min: 0, max: Infinity },
    { label: 'до 1 000 ₽', min: 0, max: 1000 },
    { label: '1 000–2 000 ₽', min: 1000, max: 2000 },
    { label: '2 000–3 500 ₽', min: 2000, max: 3500 },
    { label: '3 500–5 000 ₽', min: 3500, max: 5000 },
    { label: '5 000–8 000 ₽', min: 5000, max: 8000 },
    { label: 'от 8 000 ₽', min: 8000, max: Infinity }
  ];
  var PAGE_SIZE = 24;

  function plural(n) {
    var t = n % 100, d = n % 10;
    if (t >= 11 && t <= 14) return 'вариантов';
    if (d === 1) return 'вариант';
    if (d >= 2 && d <= 4) return 'варианта';
    return 'вариантов';
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tagsOf(p) { return [p.category].concat(p.tags || []).filter(Boolean); }
  function inGroup(p, group) {
    var r = tagsOf(p);
    var isUnit = !r.some(function (x) { return SINGLE_GIFTS.indexOf(x) >= 0; }) && (p.category === 'Шары поштучно' || r.indexOf('Шары поштучно') >= 0);
    var isHoliday = r.some(function (x) { return HOLIDAYS.indexOf(x) >= 0; });
    var hasChar = !!(p.character_name || '').trim();
    if (group === 'unit') return isUnit;
    if (group === 'holidays') return !isUnit && isHoliday;
    if (group === 'characters') return !isUnit && !isHoliday && hasChar;
    if (group === 'all') return true;
    return !isUnit && !isHoliday && !hasChar;
  }
  function productHasLabel(p, label) {
    return p.category === label || (p.tags || []).indexOf(label) >= 0;
  }

  // ---------- state ----------
  var products = [];
  var loading = true;
  var loadError = false;
  var q = '', category = 'Все товары', priceIdx = 0, age = '', character = '', filter = '', group = 'all';
  var filtersOpen = false;
  var fromUrl = false;
  var navSignature = '';
  var searchTimer = null;
  var visibleCount = PAGE_SIZE;

  function readUrl() {
    var sp = new URLSearchParams(window.location.search);
    var c = sp.get('category'), query = sp.get('query'), ch = sp.get('character'),
        a = sp.get('age'), f = sp.get('filter'), g = sp.get('group'),
        mn = Number(sp.get('min') || 0), mxRaw = sp.get('max'), mx = mxRaw ? Number(mxRaw) : Infinity;
    if (g === 'all' || GROUPS.some(function (x) { return x.id === g; })) group = g;
    if (c) {
      category = (c === 'Шары поштучно') ? 'Все товары' : c;
      if (c === 'Шары поштучно' || UNIT_SUBCATS.indexOf(c) >= 0) group = 'unit';
      else if (HOLIDAYS.indexOf(c) >= 0) group = 'holidays';
    }
    if (query) q = query;
    if (ch) { character = ch; group = 'characters'; }
    if (a) age = a;
    if (f) filter = f;
    var pi = PRICES.findIndex(function (x) { return x.min === mn && x.max === mx; });
    if (pi >= 0) priceIdx = pi;
  }
  function writeUrl() {
    if (!fromUrl) return;
    var sp = new URLSearchParams();
    if (group !== 'all') sp.set('group', group);
    if (q.trim()) sp.set('query', q.trim());
    if (category !== 'Все товары') sp.set('category', category);
    if (character) sp.set('character', character);
    if (age) sp.set('age', age);
    if (filter) sp.set('filter', filter);
    if (priceIdx !== 0) {
      sp.set('min', String(PRICES[priceIdx].min));
      if (isFinite(PRICES[priceIdx].max)) sp.set('max', String(PRICES[priceIdx].max));
    }
    var s = sp.toString();
    window.history.replaceState({}, '', s ? 'catalog.html?' + s : 'catalog.html');
  }

  // ---------- dom ----------
  var controlsEl = document.querySelector('.catalog-controls');
  var searchInput = document.querySelector('.catalog-search input');
  var priceSelect = controlsEl ? controlsEl.querySelector('select[aria-label="Стоимость"]') : null;
  var ageSelect = controlsEl ? controlsEl.querySelector('select[aria-label="Возраст"]') : null;
  var filterToggle = controlsEl ? controlsEl.querySelector('.catalog-mobile-filter-toggle') : null;
  var groupNav = document.querySelector('.catalog-group-nav');
  var subNav = document.querySelector('.catalog-subcategories');
  var resultsSection = document.querySelector('.catalog-results');

  var filterPanel = controlsEl ? controlsEl.querySelector('.catalog-filter-panel') : null;
  var filterSheet = null;

  function filterBadgeCount() {
    return (priceIdx !== 0 ? 1 : 0) + (age ? 1 : 0);
  }

  function isMobileFilters() {
    return window.matchMedia('(max-width: 1020px)').matches;
  }

  function syncFilterToggle() {
    if (!filterToggle) return;
    filterToggle.setAttribute('aria-expanded', filtersOpen ? 'true' : 'false');
    filterToggle.classList.toggle('is-open', filtersOpen);
    filterToggle.classList.toggle('has-active-filters', filterBadgeCount() > 0);
    var badge = filterToggle.querySelector('b');
    var n = filterBadgeCount();
    if (n && !badge) {
      badge = document.createElement('b');
      filterToggle.appendChild(badge);
    }
    if (badge) {
      if (n) badge.textContent = String(n);
      else badge.remove();
    }
  }

  function closeFilterSheet() {
    filtersOpen = false;
    if (filterSheet) {
      if (filterPanel && controlsEl && filterSheet.contains(filterPanel)) {
        controlsEl.appendChild(filterPanel);
      }
      filterSheet.remove();
      filterSheet = null;
    }
    document.body.style.overflow = '';
    if (controlsEl) controlsEl.classList.remove('mobile-filters-open');
    syncFilterToggle();
  }

  function openFilterSheet() {
    if (!isMobileFilters() || !filterPanel) {
      filtersOpen = !filtersOpen;
      if (controlsEl) controlsEl.classList.toggle('mobile-filters-open', filtersOpen);
      syncFilterToggle();
      return;
    }
    if (filterSheet) {
      closeFilterSheet();
      return;
    }
    filtersOpen = true;
    filterSheet = document.createElement('div');
    filterSheet.className = 'catalog-filter-sheet';
    filterSheet.setAttribute('role', 'presentation');
    filterSheet.innerHTML =
      '<button type="button" class="catalog-filter-sheet-backdrop" aria-label="Закрыть фильтры"></button>' +
      '<section class="catalog-filter-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-filter-title">' +
      '<div class="catalog-filter-sheet-handle" aria-hidden="true"></div>' +
      '<header class="catalog-filter-sheet-head">' +
      '<div><h2 id="catalog-filter-title">Фильтры</h2></div>' +
      '<button type="button" class="catalog-filter-sheet-close" aria-label="Закрыть">×</button>' +
      '</header>' +
      '<div class="catalog-filter-sheet-body"></div>' +
      '<footer class="catalog-filter-sheet-foot">' +
      '<button type="button" class="catalog-filter-sheet-reset" data-sheet-reset>Сбросить</button>' +
      '<button type="button" class="catalog-filter-sheet-done" data-sheet-done>Показать</button>' +
      '</footer></section>';
    filterSheet.querySelector('.catalog-filter-sheet-body').appendChild(filterPanel);
    document.body.appendChild(filterSheet);
    document.body.style.overflow = 'hidden';
    syncFilterToggle();
    syncControls();
    filterSheet.querySelector('.catalog-filter-sheet-backdrop').addEventListener('click', closeFilterSheet);
    filterSheet.querySelector('.catalog-filter-sheet-close').addEventListener('click', closeFilterSheet);
    filterSheet.querySelector('[data-sheet-done]').addEventListener('click', closeFilterSheet);
    filterSheet.querySelector('[data-sheet-reset]').addEventListener('click', function () {
      priceIdx = 0;
      age = '';
      if (priceSelect) priceSelect.value = '0';
      if (ageSelect) ageSelect.value = '';
      render({ resultsOnly: true });
      syncFilterToggle();
    });
    filterSheet.querySelector('.catalog-filter-sheet-close').focus();
  }

  function ensureResetBtn() {
    if (!controlsEl) return;
    var show = q || category !== 'Все товары' || priceIdx !== 0 || character || age || filter || group !== 'all';
    var btn = controlsEl.querySelector('.catalog-reset');
    if (show && !btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'catalog-reset';
      btn.textContent = 'Сбросить';
      btn.addEventListener('click', resetAll);
      controlsEl.appendChild(btn);
    } else if (!show && btn) {
      btn.remove();
    }
  }

  function resetAll() {
    q = ''; category = 'Все товары'; priceIdx = 0; character = ''; age = ''; filter = ''; group = 'all';
    visibleCount = PAGE_SIZE;
    if (searchInput) searchInput.value = '';
    window.history.replaceState({}, '', 'catalog.html');
    closeFilterSheet();
    render();
  }

  function collectAges() {
    var ages = [];
    var seen = {};
    products.forEach(function (p) {
      if (p.age_group && !seen[p.age_group]) {
        seen[p.age_group] = 1;
        ages.push(p.age_group);
      }
    });
    return ages;
  }

  function subcatList() {
    if (group === 'all') return [];
    if (group === 'characters') {
      var set = {};
      products.forEach(function (p) {
        if (inGroup(p, 'characters') && (p.character_name || '').trim()) set[p.character_name] = 1;
      });
      if (character) set[character] = 1;
      return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    }
    if (group === 'holidays') {
      return HOLIDAYS.filter(function (x) {
        return products.some(function (p) { return inGroup(p, 'holidays') && productHasLabel(p, x); });
      });
    }
    if (group === 'unit') {
      var present = {};
      products.forEach(function (p) {
        if (!inGroup(p, 'unit')) return;
        tagsOf(p).forEach(function (t) { present[t] = 1; });
      });
      return UNIT_SUBCATS.filter(function (x) { return present[x]; });
    }
    return READY_SUBCATS.filter(function (x) {
      return products.some(function (p) { return inGroup(p, 'ready') && productHasLabel(p, x); });
    });
  }

  function filtered() {
    var terms = norm(q).split(' ').filter(Boolean);
    var pr = PRICES[priceIdx];
    return products.filter(function (p) {
      var searched = terms.length > 0;
      var excludedUnitRoot = group === 'unit' && category === 'Все товары' && terms.length === 0 && priceIdx === 0 && !age && UNIT_COLLECTIONS.indexOf(p.category) >= 0;
      var inG = searched || group === 'all' || inGroup(p, group);
      var hay = norm([p.title, p.sku, p.short_description, p.description, p.composition, p.category, p.character_name, p.age_group].concat(p.tags || []).filter(Boolean).join(' '));
      var matchQ = terms.every(function (t) { return hay.indexOf(t) >= 0; });
      var matchC = category === 'Все товары' || p.category === category || (p.tags || []).indexOf(category) >= 0;
      var matchP = p.price >= pr.min && p.price <= pr.max;
      var matchF = !filter || (p.tags || []).indexOf(filter) >= 0;
      var matchCh = !character || (p.character_name || '').toLowerCase().indexOf(character.toLowerCase()) >= 0 || (p.title || '').toLowerCase().indexOf(character.toLowerCase()) >= 0;
      var matchA = !age || p.age_group === age;
      return !excludedUnitRoot && inG && matchQ && matchC && matchP && matchF && matchCh && matchA;
    });
  }

  function cardHtml(p, i) {
    var key = (window.vigProductPhoto ? window.vigProductPhoto(p) : '') ||
      (p.image_keys && p.image_keys[0]) ||
      (p.photos && p.photos[0]) ||
      p.main_photo ||
      '';
    var img = key
      ? '<img src="' + window.vigImage(key) + '" data-key="' + esc(key) + '" alt="' + esc(p.title) + '" loading="' + (i < 4 ? 'eager' : 'lazy') + '" decoding="async" width="800" height="800"/>'
      : window.vigEmoji('balloon');
    var from = (p.tags || []).indexOf('Цена от') >= 0 ? 'от ' : '';
    var priceNote = p.category === 'Шары поштучно' ? 'Цена за штуку' : 'Цена за композицию';
    var requestBadge = p.available_on_request ? '<em class="product-request-badge">Под заказ</em>' : '';
    var advanceBadge = (!requestBadge && p.needs_advance_order) ? '<em class="product-advance-badge">За 1–2 дня</em>' : '';
    var badge = requestBadge || advanceBadge;
    return '<a class="catalog-card color-' + (i % 5) + '" href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '" aria-label="Подробнее: ' + esc(p.title) + '">' +
      '<span class="catalog-card-image">' + img + '</span>' +
      '<span class="catalog-card-copy"><span class="catalog-card-meta"><small>' + esc(p.category || 'Композиция') + '</small>' + badge + '</span>' +
      '<strong>' + esc(p.title) + '</strong>' +
      '<span>' + esc(p.short_description || '') + '</span>' +
      '<span class="catalog-card-price"><small>' + priceNote + '</small><b>' + from + Number(p.price).toLocaleString('ru-RU') + ' ₽</b><i aria-hidden="true">Подробнее&nbsp; →</i></span>' +
      '</span></a>';
  }

  function requestSummary() {
    var parts = [];
    if (priceIdx !== 0) parts.push('бюджет — ' + PRICES[priceIdx].label);
    if (category !== 'Все товары') parts.push('категория — ' + category);
    if (filter) parts.push('повод — ' + filter);
    if (character) parts.push('персонаж — ' + character);
    if (age) parts.push('возраст — ' + age);
    if (q.trim()) parts.push('поиск — «' + q.trim() + '»');
    return parts;
  }

  function syncControls() {
    if (searchInput && searchInput.value !== q) searchInput.value = q;
    if (priceSelect) priceSelect.value = String(priceIdx);
    if (ageSelect) {
      var ages = collectAges();
      var hasAges = ages.length > 0;
      var hideAge = !loading && !loadError && !hasAges;
      ageSelect.innerHTML = '<option value="">Любой возраст</option>' + ages.map(function (a) {
        return '<option value="' + esc(a) + '">' + esc(a) + '</option>';
      }).join('');
      if (hideAge) age = '';
      ageSelect.value = age;
      ageSelect.hidden = hideAge;
      ageSelect.disabled = hideAge;
      if (controlsEl) controlsEl.classList.toggle('no-age-filter', hideAge);
    }
    if (controlsEl && !isMobileFilters()) controlsEl.classList.toggle('mobile-filters-open', filtersOpen);
    syncFilterToggle();
  }

  function renderGroupNav() {
    if (!groupNav) return;
    var allActive = group === 'all';
    groupNav.innerHTML =
      '<button type="button" class="catalog-group-all' + (allActive ? ' active' : '') + '" aria-pressed="' + (allActive ? 'true' : 'false') + '" data-group="all">' +
      '<span class="catalog-group-icon icon-all" aria-hidden="true"><img src="' + ALL_CHIP_IMG + '" alt="" width="40" height="40" decoding="async"/></span>' +
      '<span><strong><span class="catalog-group-title-desktop">Весь каталог</span><span class="catalog-group-title-mobile">Все</span></strong><small>Все опубликованные варианты</small></span></button>' +
      GROUPS.map(function (g) {
        var active = group === g.id;
        var img = g.chipImg || g.iconImg;
        return '<button type="button" class="' + (active ? 'active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '" data-group="' + g.id + '">' +
          '<span class="catalog-group-icon icon-' + g.icon + '" aria-hidden="true"><img src="' + img + '" alt="" width="40" height="40" decoding="async"/></span>' +
          '<span><strong><span class="catalog-group-title-desktop">' + g.title + '</span><span class="catalog-group-title-mobile">' + g.mobile + '</span></strong><small>' + g.note + '</small></span>' +
          '</button>';
      }).join('');
    groupNav.querySelectorAll('[data-group]').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = b.getAttribute('data-group');
        if (next === 'all') group = 'all';
        else group = (next === group) ? 'all' : next;
        category = 'Все товары'; character = ''; filter = '';
        render();
      });
    });
  }

  function renderSubNav() {
    var detailNav = document.querySelector('.catalog-detail-categories');
    if (detailNav) detailNav.remove();
    if (!subNav) return;
    if (group === 'all') {
      subNav.hidden = true;
      subNav.style.display = 'none';
      subNav.innerHTML = '';
      return;
    }
    subNav.hidden = false;
    subNav.style.display = '';
    var list = subcatList();
    var allActive = category === 'Все товары' && !character;
    subNav.innerHTML = '<button type="button" class="' + (allActive ? 'active' : '') + '" aria-pressed="' + (allActive ? 'true' : 'false') + '" data-sub="">Все</button>' +
      list.map(function (x) {
        var active = group === 'characters' ? character === x : category === x;
        return '<button type="button" class="' + (active ? 'active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '" data-sub="' + esc(x) + '">' + esc(x) + '</button>';
      }).join('');
    subNav.querySelectorAll('[data-sub]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-sub');
        if (group === 'characters') { character = v; category = 'Все товары'; filter = ''; }
        else { category = v || 'Все товары'; character = ''; filter = ''; }
        render();
      });
    });
    if (group === 'unit' && category === 'Шары с рисунком') {
      var dn = document.createElement('nav');
      dn.className = 'catalog-categories catalog-detail-categories';
      dn.setAttribute('aria-label', 'Фильтры шаров с рисунком');
      dn.innerHTML = '<span>Кому или к какому празднику:</span>' +
        '<button type="button" class="' + (filter ? '' : 'active') + '" aria-pressed="' + (filter ? 'false' : 'true') + '" data-f="">Все рисунки</button>' +
        DETAIL_FILTERS.map(function (x) {
          return '<button type="button" class="' + (filter === x ? 'active' : '') + '" aria-pressed="' + (filter === x ? 'true' : 'false') + '" data-f="' + esc(x) + '">' + esc(x) + '</button>';
        }).join('');
      subNav.after(dn);
      dn.querySelectorAll('[data-f]').forEach(function (b) {
        b.addEventListener('click', function () { filter = b.getAttribute('data-f'); render(); });
      });
    }
  }

  function computeNavSignature() {
    var ages = collectAges();
    return [
      group,
      category,
      character,
      filter,
      filtersOpen ? 1 : 0,
      loading ? 1 : 0,
      products.length,
      priceIdx !== 0 ? 1 : 0,
      age ? 1 : 0,
      ages.length,
      subcatList().join(',')
    ].join('|');
  }

  function render(opts) {
    opts = opts || {};
    if (!opts.keepVisible) visibleCount = PAGE_SIZE;
    writeUrl();
    ensureResetBtn();
    syncControls();
    var sig = computeNavSignature();
    if (!opts.resultsOnly || sig !== navSignature) {
      navSignature = sig;
      renderGroupNav();
      renderSubNav();
    }
    if (!opts.resultsOnly) renderRecent();
    renderResults();
  }

  function groupTitle() {
    if (filter) return filter;
    if (character) return character;
    if (group === 'all') return 'Весь ассортимент';
    if (category !== 'Все товары') return category;
    var g = GROUPS.filter(function (x) { return x.id === group; })[0];
    return g ? g.title : 'Каталог';
  }

  function renderResults() {
    if (!resultsSection) return;
    var list = filtered();
    var searching = !!q.trim();
    var shown = list.slice(0, visibleCount);
    var hasMore = list.length > visibleCount;
    var head =
      '<div class="catalog-results-heading"><div><h2>' + esc(groupTitle()) + '</h2>' +
      (searching ? '<p class="catalog-search-scope">Ищем по всему каталогу</p>' : '') +
      '</div>' +
      '<div class="catalog-results-counts"><span role="status" aria-live="polite">' + (loading ? 'Загружаем варианты…' : list.length + ' ' + plural(list.length)) + '</span>' +
      (!loading && group !== 'all' ? '<button type="button" data-showall>Показать весь ассортимент</button>' : '') +
      '</div></div>';
    var budget = '';
    if (priceIdx !== 0) {
      budget = '<div class="catalog-active-budget" role="status"><span><b aria-hidden="true">₽</b> Бюджет: <strong>' + esc(PRICES[priceIdx].label) + '</strong></span><button type="button" data-clearprice>Показать все цены ×</button></div>';
    }
    var collections = '';
    var showCollections = group === 'unit' && category === 'Все товары' && !q.trim() && priceIdx === 0 && !age;
    if (showCollections) {
      var cards = UNIT_COLLECTIONS.map(function (name) {
        var items = products.filter(function (p) { return p.category === name; });
        if (!items.length) return '';
        var imgs = items.slice(0, 3).map(function (p) {
          var k = (window.vigProductPhoto ? window.vigProductPhoto(p) : '') || (p.image_keys && p.image_keys[0]) || '';
          return k ? '<img src="' + window.vigImage(k) + '" data-key="' + esc(k) + '" alt="" loading="lazy" decoding="async"/>' : '';
        }).join('');
        return '<button type="button" class="catalog-collection-card" data-coll="' + esc(name) + '"><span class="catalog-collection-images" aria-hidden="true">' + imgs + '</span>' +
          '<span class="catalog-collection-copy"><small>Отдельная категория</small><strong>' + esc(name) + '</strong><span>' + items.length + ' ' + plural(items.length) + '</span></span><b aria-hidden="true">→</b></button>';
      }).join('');
      if (cards) collections = '<div class="catalog-collection-grid">' + cards + '</div>';
    }
    var body = '';
    if (loading) {
      body = '<div class="catalog-empty">Загружаем воздушное настроение…</div>';
    } else if (loadError) {
      body = '<div class="catalog-empty" role="alert">' + window.vigEmoji('balloon') + '<h3>Каталог не загрузился</h3><p>Проверьте соединение и попробуйте ещё раз. Выбранные фильтры сохранятся.</p><button type="button" data-retry>Попробовать ещё раз</button></div>';
    } else if (list.length) {
      body = '<div class="catalog-grid">' + shown.map(cardHtml).join('') + '</div>';
      if (hasMore) {
        body += '<div class="catalog-load-more"><button type="button" data-more>Показать ещё <span>' + Math.min(PAGE_SIZE, list.length - visibleCount) + '</span></button><small>Показано ' + shown.length + ' из ' + list.length + '</small></div>';
      }
    } else {
      var pr = PRICES[priceIdx];
      var sugg = products.filter(function (p) { return group === 'all' || inGroup(p, group); })
        .filter(function (p) { return priceIdx === 0 || (p.price >= pr.min && p.price <= pr.max); }).slice(0, 4);
      body = '<div class="catalog-empty">' + window.vigEmoji('balloon') + '<h3>Пока ничего не нашли</h3><p>Попробуйте изменить запрос или напишите нам — подберём композицию под ваш праздник и бюджет.</p>' +
        '<div class="catalog-empty-actions"><button type="button" class="secondary" data-reset>Сбросить поиск и фильтры</button><button type="button" data-help>Помочь с выбором</button></div></div>';
      if (sugg.length) {
        body += '<section class="catalog-empty-suggestions" aria-labelledby="empty-suggestions-title"><div><p class="eyebrow">Возможно, вам подойдёт</p><h3 id="empty-suggestions-title">Популярные варианты из этого раздела</h3></div>' +
          '<div class="catalog-grid">' + sugg.map(function (p, i) {
            var key = (window.vigProductPhoto ? window.vigProductPhoto(p) : '') || (p.image_keys && p.image_keys[0]) || '';
            var img = key ? '<img src="' + window.vigImage(key) + '" data-key="' + esc(key) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async" width="800" height="800"/>' : window.vigEmoji('balloon');
            var from = (p.tags || []).indexOf('Цена от') >= 0 ? 'от ' : '';
            return '<a class="catalog-card color-' + (i % 5) + '" href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '" aria-label="Подробнее: ' + esc(p.title) + '">' +
              '<span class="catalog-card-image">' + img + '</span>' +
              '<span class="catalog-card-copy"><small>' + esc(p.category || 'Композиция') + '</small><strong>' + esc(p.title) + '</strong>' +
              '<span class="catalog-card-price"><b>' + from + Number(p.price).toLocaleString('ru-RU') + ' ₽</b><i aria-hidden="true">Подробнее&nbsp; →</i></span></span></a>';
          }).join('') + '</div></section>';
      }
    }
    var custom = !loading ? '<div class="related-custom-card catalog-custom-order">' + window.vigEmoji('balloon') + '<div><strong>Не нашли подходящую композицию?</strong><p>Напишите, для какого праздника и на какой бюджет нужен вариант — поможем подобрать.</p></div><button type="button" data-help>Подобрать вариант</button></div>' : '';
    resultsSection.innerHTML = head + budget + collections + body + custom;

    var sa = resultsSection.querySelector('[data-showall]');
    if (sa) sa.addEventListener('click', function () { group = 'all'; category = 'Все товары'; character = ''; filter = ''; render(); });
    var cp = resultsSection.querySelector('[data-clearprice]');
    if (cp) cp.addEventListener('click', function () { priceIdx = 0; render(); });
    var rt = resultsSection.querySelector('[data-retry]');
    if (rt) rt.addEventListener('click', load);
    var rs = resultsSection.querySelector('[data-reset]');
    if (rs) rs.addEventListener('click', resetAll);
    var more = resultsSection.querySelector('[data-more]');
    if (more) more.addEventListener('click', function () {
      visibleCount += PAGE_SIZE;
      render({ resultsOnly: true, keepVisible: true });
    });
    resultsSection.querySelectorAll('[data-coll]').forEach(function (b) {
      b.addEventListener('click', function () { category = b.getAttribute('data-coll'); character = ''; filter = ''; render(); });
    });
    resultsSection.querySelectorAll('[data-help]').forEach(function (b) {
      b.addEventListener('click', function () { openCatalogModal(); });
    });
  }

  function renderRecent() {
    var old = document.querySelector('.recent-products');
    if (old) old.remove();
    var ids = [];
    try { ids = JSON.parse(localStorage.getItem('vigsharm_recent_products') || '[]'); } catch (e) { ids = []; }
    ids = (Array.isArray(ids) ? ids : []).filter(function (x) { return Number.isInteger(x); }).slice(0, 8);
    var items = ids.map(function (id) { return products.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean).slice(0, 4);
    if (!items.length || !resultsSection) return;
    var sec = document.createElement('section');
    sec.className = 'recent-products';
    sec.setAttribute('aria-labelledby', 'recent-products-title');
    sec.innerHTML = '<div class="recent-products-heading"><div><p class="eyebrow">Можно вернуться</p><h2 id="recent-products-title">Недавно смотрели</h2></div><button type="button">Очистить</button></div>' +
      '<div class="recent-products-list">' + items.map(function (p) {
        var key = (window.vigProductPhoto ? window.vigProductPhoto(p) : '') || (p.image_keys && p.image_keys[0]) || '';
        var img = key ? '<img src="' + window.vigImage(key) + '" data-key="' + esc(key) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async"/>' : window.vigEmoji('balloon');
        return '<a href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '"><span>' + img + '</span><span><strong>' + esc(p.title) + '</strong><small>' + Number(p.price).toLocaleString('ru-RU') + ' ₽</small></span></a>';
      }).join('') + '</div>';
    sec.querySelector('button').addEventListener('click', function () {
      try { localStorage.removeItem('vigsharm_recent_products'); } catch (e) {}
      renderRecent();
    });
    resultsSection.before(sec);
  }

  /* ---------- catalog contact modal (with request summary) ---------- */
  var PHONE = '79284440142', PHONE_LABEL = '+7 928 444-01-42';
  var MAX_URL = 'https://max.ru/u/f9LHodD0cOJwY09H6Zj63nYK_X8tPZGb3CODIvTT7FWkRzrgbh5F582AiB8';
  var TG_URL = 'https://t.me/Olgamzz';
  var WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a9.75 9.75 0 0 0-8.47 14.58L2.2 21.8l5.35-1.28A9.78 9.78 0 1 0 12 2Zm0 17.5a7.7 7.7 0 0 1-3.92-1.08l-.37-.22-3.08.74.77-3-.24-.38A7.75 7.75 0 1 1 12 19.5Zm4.25-5.78c-.23-.12-1.37-.67-1.58-.75-.21-.08-.36-.12-.52.12-.15.23-.6.75-.73.9-.14.16-.27.18-.5.06-1.39-.69-2.3-1.23-3.22-2.8-.24-.42.24-.39.69-1.3.08-.16.04-.3-.02-.42-.06-.12-.52-1.25-.71-1.71-.19-.45-.38-.39-.52-.4h-.45c-.16 0-.41.06-.62.29-.21.23-.81.79-.81 1.92 0 1.14.83 2.23.94 2.39.12.15 1.63 2.48 3.94 3.48 1.47.63 2.04.69 2.77.58.44-.07 1.37-.56 1.56-1.1.19-.54.19-1 .13-1.1-.06-.09-.21-.15-.44-.26Z"></path></svg>';
  var TG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M20.67 3.55 2.8 10.44c-1.22.49-1.21 1.16-.22 1.46l4.58 1.43 1.76 5.42c.21.58.1.81.72.81.48 0 .69-.22.96-.48l2.2-2.14 4.58 3.38c.84.46 1.45.22 1.66-.78l3-14.14c.31-1.23-.47-1.79-1.37-1.85ZM8.1 13l10.32-6.51c.52-.31 1-.15.61.2l-8.51 7.68-.33 3.54L8.1 13Z"></path></svg>';

  function openCatalogModal() {
    if (document.querySelector('.catalog-modal-wrap')) return;
    var parts = requestSummary();
    var msg = parts.length
      ? 'Здравствуйте! Помогите подобрать композицию. Я выбрал(а): ' + parts.join(', ') + '.'
      : 'Здравствуйте! Помогите подобрать композицию под мой праздник и бюджет.';
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop catalog-modal-wrap';
    wrap.setAttribute('role', 'presentation');
    wrap.innerHTML =
      '<section class="contact-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-contact-title">' +
      '<button class="modal-close" type="button" aria-label="Закрыть">×</button>' +
      '<h2 id="catalog-contact-title">Как удобнее написать?</h2>' +
      '<p>Расскажите о празднике и бюджете — подберём композицию.</p>' +
      (parts.length ? '<div class="contact-request-summary"><strong>Ваш выбор сохранён</strong><span>' + esc(parts.join(' · ')) + '</span></div>' : '') +
      '<div class="contact-options">' +
      '<a class="contact-option whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg) + '"><span>' + WA_SVG + '</span><div><strong>WhatsApp</strong><small>Сообщение уже подготовлено</small></div></a>' +
      '<a class="contact-option telegram" target="_blank" rel="noreferrer" href="' + TG_URL + '?text=' + encodeURIComponent(msg) + '"><span>' + TG_SVG + '</span><div><strong>Telegram</strong><small>Текст скопируется · личный чат</small></div></a>' +
      '<a class="contact-option max" target="_blank" rel="noreferrer" href="' + MAX_URL + '"><span><img src="icons/max-official.png" alt="" aria-hidden="true"/></span><div><strong>MAX</strong><small>Текст обращения скопируется</small></div></a>' +
      '<a class="contact-option phone" href="tel:+' + PHONE + '"><span>' + window.vigEmoji('phone') + '</span><div><strong>Позвонить</strong><small>' + PHONE_LABEL + '</small></div></a>' +
      '</div><p class="modal-note">Заказ оформляется только после нашего подтверждения.</p></section>';
    function close() { wrap.remove(); document.body.style.overflow = ''; }
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('.modal-close').addEventListener('click', close);
    wrap.querySelector('.contact-option.telegram').addEventListener('click', function () {
      window.vigCopy(msg);
    });
    wrap.querySelector('.contact-option.max').addEventListener('click', function () {
      window.vigCopy(msg).then(function () {
        window.vigToast('Текст обращения скопирован в буфер! Зажмите поле ввода в MAX и нажмите «Вставить».');
      });
    });
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    wrap.querySelector('.modal-close').focus();
  }

  // ---------- events ----------
  if (filterToggle) {
    filterToggle.addEventListener('click', function () {
      openFilterSheet();
    });
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && filterSheet) closeFilterSheet();
  });
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      q = searchInput.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        render({ resultsOnly: true });
      }, 180);
    });
  }
  if (priceSelect) priceSelect.addEventListener('change', function () {
    priceIdx = Number(priceSelect.value);
    render({ resultsOnly: true, keepVisible: false });
    syncFilterToggle();
  });
  if (ageSelect) ageSelect.addEventListener('change', function () {
    age = ageSelect.value;
    render({ resultsOnly: true, keepVisible: false });
    syncFilterToggle();
  });

  var cta = document.querySelector('.homepage-mobile-cta');
  if (cta) {
    cta.setAttribute('data-custom-modal', '1');
    cta.removeAttribute('data-contact');
    cta.addEventListener('click', function () { openCatalogModal(); });
  }
  function updateCta() {
    if (!cta) return;
    var customVisible = false;
    var nearListEnd = false;
    try {
      var el = document.querySelector('.catalog-custom-order');
      if (el) {
        var r = el.getBoundingClientRect();
        customVisible = r.top < window.innerHeight - 90 && r.bottom > 0;
      }
      // Ближе к концу сетки/«показать ещё», а не посередине витрины
      var grid = document.querySelector('.catalog-grid');
      var loadMore = document.querySelector('.catalog-load-more');
      var anchor = loadMore || grid;
      if (anchor) {
        var ar = anchor.getBoundingClientRect();
        var vh = window.innerHeight || 0;
        nearListEnd = ar.bottom < vh + 160 && ar.top < vh * 0.42;
      } else {
        var docH = document.documentElement.scrollHeight || 0;
        var winH = window.innerHeight || 0;
        nearListEnd = window.scrollY + winH > docH - Math.max(winH * 0.5, 480);
      }
    } catch (e) {}
    var modalOpen = !!document.querySelector('.catalog-modal-wrap');
    var visible = nearListEnd && !customVisible && !modalOpen;
    cta.classList.toggle('homepage-mobile-cta-visible', visible);
    cta.setAttribute('aria-hidden', visible ? 'false' : 'true');
    cta.setAttribute('tabindex', visible ? '0' : '-1');
  }
  window.addEventListener('scroll', updateCta, { passive: true });
  window.addEventListener('resize', updateCta);

  function load() {
    loading = true; loadError = false;
    navSignature = '';
    render();
    (window.vigFetchProducts
      ? window.vigFetchProducts()
      : fetch('https://vigsharm-api.vigsharm.workers.dev/api/products', { cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
          .then(function (data) { return (data.ok && Array.isArray(data.products)) ? data.products : []; })
    )
      .then(function (raw) {
        products = (window.vigStorefrontProducts || window.vigNormalizeProducts)(raw || []);
        loading = false;
        navSignature = '';
        render();
        updateCta();
      })
      .catch(function () {
        products = []; loading = false; loadError = true;
        navSignature = '';
        render();
      });
  }

  readUrl();
  fromUrl = true;
  load();
})();
