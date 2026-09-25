/* VigSharm catalog: groups, filters, search, render — port of original behaviour */
(function () {
  'use strict';

  /* «Универсальные» — внутренняя полка (данные/ИИ), на витрине не показываем */
  var READY_SUBCATS = ['Для девочки', 'Для мальчика', 'Для неё', 'Для мамы', 'Для него', 'На выписку', 'Фигуры из шаров', 'Цветы из шаров', 'Арки', 'Шар-сюрприз', 'Крафтовый букет', 'Коробка-сюрприз', 'Гендер-пати'];
  var UNIT_SUBCATS = ['Латексные шары', 'Кристалл Ассорти', 'Металлик Ассорти', 'Пастель MACARON Ассорти', 'Пастель Ассорти', 'Сердце Ассорти', 'Шары с рисунком', 'Фольгированные фигуры', 'Ходячие фигуры', 'Круги, звёзды и сердца', 'Шары с конфетти', 'Шары хром', 'Шары Brush', 'Шары Super Agate', 'Шары Bubble', 'Фольгированные цифры', 'Именные шары'];
  var UNIT_COLLECTIONS = ['Шары с рисунком', 'Латексные шары', 'Фольгированные фигуры', 'Ходячие фигуры', 'Круги, звёзды и сердца', 'Шары с конфетти', 'Шары хром', 'Шары Brush', 'Шары Super Agate', 'Шары Bubble', 'Фольгированные цифры'];
  var DETAIL_FILTERS = ['Для мальчика', 'Для девочки', 'Детские', 'Для него', 'Для неё', 'На выписку', 'Праздники', 'Персонажи'];
  var HOLIDAYS = ['Новый год', '14 февраля', '23 февраля', '8 марта', '9 мая', 'Выпускной', '1 сентября', 'День учителя', 'Хэллоуин'];
  var SINGLE_GIFTS = ['Фигуры из шаров', 'Цветы из шаров', 'Арки', 'Шар-сюрприз', 'Крафтовый букет', 'Коробка-сюрприз', 'Гендер-пати'];
  var AUDIENCE = ['Для девочки', 'Для мальчика', 'Универсальные', 'Для неё', 'Для него', 'Для мамы', 'На выписку', '1 годик', 'Юбилей', 'Свадьба и девичник', 'Крещение'];
  var GROUPS = [
    { id: 'ready', title: 'Готовые решения', mobile: 'Готовые', icon: 'ready', chipImg: 'icons/group-ready.webp?v=7', note: 'Композиции для любого повода' },
    { id: 'characters', title: 'Персонажи', mobile: 'Персонажи', icon: 'characters', chipImg: 'icons/group-characters.webp?v=7', note: 'Любимые герои детей' },
    { id: 'unit', title: 'Шары поштучно', mobile: 'Шары', icon: 'unit', chipImg: 'icons/group-balloons.webp?v=7', note: 'Отдельные шары и фигуры' },
    { id: 'holidays', title: 'Праздники', mobile: 'Праздники', icon: 'holidays', chipImg: 'icons/group-holidays.webp?v=7', note: 'Сезонные коллекции' }
  ];
  var ALL_CHIP_IMG = 'icons/group-all.webp?v=7';
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
  function revealReadyPhotos(scope) {
    if (!scope) return;
    scope.querySelectorAll('.catalog-card-image img').forEach(function (img) {
      function ready() { img.classList.add('is-ready'); }
      if (img.complete && img.naturalWidth) ready();
      else img.addEventListener('load', ready, { once: true });
    });
  }
  function tagsOf(p) { return [p.category].concat(p.tags || []).filter(Boolean); }
  function displayCategory(cat) {
    var s = String(cat || '').trim();
    return (!s || s === 'Универсальные') ? 'Композиция' : s;
  }
  function inGroup(p, group) {
    var r = tagsOf(p);
    var cat = String(p.category || '');
    var isUnit = cat === 'Шары поштучно' || UNIT_SUBCATS.indexOf(cat) >= 0 || (
      !r.some(function (x) { return SINGLE_GIFTS.indexOf(x) >= 0; }) && r.indexOf('Шары поштучно') >= 0
    );
    var isHoliday = r.some(function (x) { return HOLIDAYS.indexOf(x) >= 0; });
    var hasChar = !!(p.character_name || '').trim();
    var isIdea = !isUnit && !isHoliday && !!cat && AUDIENCE.indexOf(cat) < 0;
    if (group === 'unit') return isUnit;
    // Праздники: в т.ч. фольга/ходячие/круги поштучно с тегом праздника
    if (group === 'holidays') return isHoliday;
    // Персонажи: любой товар с героем (включая поштучную фольгу), даже если есть праздник
    if (group === 'characters') return hasChar;
    if (group === 'all') return true;
    if (group === 'ideas' || group === 'ready') return (!isUnit && !isHoliday && !hasChar) || isIdea;
    return !isUnit && !isHoliday && !hasChar && !isIdea;
  }
  function productHasLabel(p, label) {
    return p.category === label || (p.tags || []).indexOf(label) >= 0;
  }
  /** Home / sheet labels often differ from D1 character field — expand aliases. */
  var CHAR_ALIASES = {
    'леди баг и супер-кот': ['леди баг'],
    'единороги': ['единорог'],
    'свинка пеппа': ['пеппа', 'свинка пеппа'],
    'уэнздей': ['уэнсдей', 'уэнздей'],
    'хаги ваги': ['хагги вагги', 'хаги ваги', 'хагги'],
    'миньоны': ['миньон', 'миньоны'],
    'куклы lol': ['куклы lol', 'кукла lol', 'lol'],
    'микки маус и минни маус': ['минни маус', 'микки маус', 'микки', 'минни'],
    'холодное сердце': ['холодное сердце', 'эльза'],
    'герои в масках': ['герои в масках', 'герои в пижамах'],
    'спанч боб': ['спанч боб', 'спанч', 'sponge'],
    'my little pony': ['my little pony', 'пинки пай', 'радуга дэш'],
    'мстители': ['мстители', 'капитан америка', 'тор', 'халк']
  };
  function characterMatches(p, character) {
    if (!character) return true;
    var ch = String(character).toLowerCase().replace(/ё/g, 'е');
    var name = String(p.character_name || '').toLowerCase().replace(/ё/g, 'е');
    var title = String(p.title || '').toLowerCase().replace(/ё/g, 'е');
    var terms = CHAR_ALIASES[ch] || [ch];
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t) continue;
      if (name.indexOf(t) >= 0 || title.indexOf(t) >= 0) return true;
    }
    return name.indexOf(ch) >= 0 || title.indexOf(ch) >= 0;
  }

  // ---------- state ----------
  var products = [];
  var loading = true;
  var loadError = false;
  var q = '', category = 'Все товары', priceIdx = 0, age = '', character = '', filter = '', group = 'ready', sortMode = '';
  var unitStep = '';
  var sheetDraft = '';
  var filtersOpen = false;
  var fromUrl = false;
  var navSignature = '';
  var searchTimer = null;
  var visibleCount = PAGE_SIZE;
  var showAllReady = false;
  var showAllHeroes = false;

  function readUrl() {
    var sp = new URLSearchParams(window.location.search);
    var c = sp.get('category'), query = sp.get('query'), ch = sp.get('character'),
        a = sp.get('age'), f = sp.get('filter'), g = sp.get('group'), s = sp.get('sort'),
        mn = Number(sp.get('min') || 0), mxRaw = sp.get('max'), mx = mxRaw ? Number(mxRaw) : Infinity;
    if (s === 'price-asc' || s === 'price-desc') sortMode = s;
    if (g === 'ideas') group = 'ready';
    else if (g === 'all' || GROUPS.some(function (x) { return x.id === g; })) group = g;
    if (c) {
      category = (c === 'Шары поштучно') ? 'Все товары' : c;
      if (c === 'Шары поштучно' || UNIT_SUBCATS.indexOf(c) >= 0) group = 'unit';
      else if (HOLIDAYS.indexOf(c) >= 0) group = 'holidays';
      else if (AUDIENCE.indexOf(c) < 0) group = 'ready';
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
    if (sortMode) sp.set('sort', sortMode);
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
  var readySheet = null;

  function filterBadgeCount() {
    return (priceIdx !== 0 ? 1 : 0) + (age ? 1 : 0) + (filter ? 1 : 0);
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
      filter = '';
      if (priceSelect) priceSelect.value = '0';
      if (ageSelect) ageSelect.value = '';
      render({ resultsOnly: true });
      syncFilterToggle();
    });
    filterSheet.querySelector('.catalog-filter-sheet-close').focus();
  }

  function ensureResetBtn() {
    if (!controlsEl) return;
    var show = q || category !== 'Все товары' || priceIdx !== 0 || character || age || filter || group !== 'all' || sortMode;
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
    ensureSearchClear();
  }

  function hasActiveFilters() {
    return !!(
      String(q || '').trim() ||
      category !== 'Все товары' ||
      priceIdx !== 0 ||
      character ||
      age ||
      filter ||
      sortMode
    );
  }

  function ensureSearchClear() {
    var wrap = document.querySelector('.catalog-search');
    if (!wrap || !searchInput) return;
    var btn = wrap.querySelector('.catalog-search-clear');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'catalog-search-clear';
      btn.setAttribute('aria-label', 'Сбросить поиск и фильтры');
      btn.innerHTML = '<span aria-hidden="true">×</span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(searchTimer);
        resetAll();
        if (searchInput) searchInput.focus();
      });
      wrap.appendChild(btn);
    }
    var on = hasActiveFilters();
    btn.hidden = !on;
    btn.setAttribute('aria-hidden', on ? 'false' : 'true');
    wrap.classList.toggle('has-clear', on);
  }

  function resetAll() {
    q = ''; category = 'Все товары'; priceIdx = 0; character = ''; age = ''; filter = ''; group = 'ready'; sortMode = '';
    visibleCount = PAGE_SIZE;
    showAllReady = false;
    showAllHeroes = false;
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

  /** Half-open [min, max); last bucket (max=Infinity) => price >= min */
  function priceInBucket(price, idx) {
    if (!idx) return true;
    var pr = PRICES[idx];
    var n = Number(price) || 0;
    if (!isFinite(pr.max)) return n >= pr.min;
    return n >= pr.min && n < pr.max;
  }

  function filtered() {
    var terms = norm(q).split(' ').filter(Boolean);
    var list = products.filter(function (p) {
      var searched = terms.length > 0;
      var audienceOnly = group === 'ready' && category === 'Все товары' && !searched;
      var hideIdea = audienceOnly && !!p.category && AUDIENCE.indexOf(p.category) < 0;
      var excludedUnitRoot = group === 'unit' && category === 'Все товары' && terms.length === 0 && priceIdx === 0 && !age && UNIT_COLLECTIONS.indexOf(p.category) >= 0;
      var inG = searched || (group === 'all' ? !inGroup(p, 'unit') : inGroup(p, group));
      var hay = norm([p.title, p.sku, p.short_description, p.description, p.composition, p.category, p.character_name, p.age_group].concat(p.tags || []).filter(Boolean).join(' '));
      var matchQ = terms.every(function (t) { return hay.indexOf(t) >= 0; });
      var matchC = category === 'Все товары' || productHasLabel(p, category);
      var matchP = priceInBucket(p.price, priceIdx);
      var matchF = !filter || p.category === filter || (p.tags || []).indexOf(filter) >= 0;
      var matchCh = !character || characterMatches(p, character);
      var matchA = !age || p.age_group === age;
      return !excludedUnitRoot && !hideIdea && inG && matchQ && matchC && matchP && matchF && matchCh && matchA;
    });
    if (sortMode === 'price-asc' || sortMode === 'price-desc') {
      var dir = sortMode === 'price-asc' ? 1 : -1;
      list = list.slice().sort(function (a, b) {
        var d = (Number(a.price) || 0) - (Number(b.price) || 0);
        if (d) return d * dir;
        return String(a.id || a.slug || '').localeCompare(String(b.id || b.slug || ''), 'ru');
      });
    }
    return list;
  }

  function cardHtml(p, i) {
    var key = p.thumb_photo ||
      (window.vigProductPhoto ? window.vigProductPhoto(p) : '') ||
      (p.image_keys && p.image_keys[0]) ||
      (p.photos && p.photos[0]) ||
      p.main_photo ||
      '';
    var img = key
      ? '<img src="' + window.vigImage(key, 480) + '" data-key="' + esc(key) + '" alt="' + esc(p.title) + '" loading="' + (i < 4 ? 'eager' : 'lazy') + '" decoding="async"' + (i === 0 ? ' fetchpriority="high"' : '') + ' width="480" height="480" onload="this.classList.add(\'is-ready\')"/>'
      : '';
    var from = (p.tags || []).indexOf('Цена от') >= 0 ? 'от ' : '';
    var priceNote = p.category === 'Шары поштучно' ? 'Цена за штуку' : 'Цена за композицию';
    var cat = String(p.category || '').trim();
    var requestBadge = p.available_on_request ? '<em class="product-request-badge">Под заказ</em>' : '';
    /* Advance badge only when category is missing — avoid noisy repeat on every card */
    var advanceBadge = (!requestBadge && p.needs_advance_order && !cat)
      ? '<em class="product-advance-badge">Заказ за 1–2 дня</em>'
      : '';
    var badge = requestBadge || advanceBadge;
    return '<a class="catalog-card color-' + (i % 5) + '" href="product.html?slug=' + encodeURIComponent(p.slug || p.id) + '" aria-label="Подробнее: ' + esc(p.title) + '">' +
      '<span class="catalog-card-image">' + img + '</span>' +
      '<span class="catalog-card-copy"><span class="catalog-card-meta"><small>' + esc(displayCategory(cat)) + '</small>' + badge + '</span>' +
      '<strong>' + esc(p.title) + '</strong>' +
      (function () {
        var opts = p.client_options || {};
        var size = String(opts.balloon_size || '').trim();
        return size ? '<small class="catalog-card-size">' + esc(size) + '</small>' : '';
      })() +
      '<span class="catalog-card-price"><small>' + priceNote + '</small><b>' + from + Number(p.price).toLocaleString('ru-RU') + ' ₽</b></span>' +
      '</span></a>';
  }

  function requestSummary() {
    var parts = [];
    if (priceIdx !== 0) parts.push('бюджет — ' + PRICES[priceIdx].label);
    if (category !== 'Все товары') parts.push('категория — ' + displayCategory(category));
    if (filter) parts.push('повод — ' + filter);
    if (character) parts.push('персонаж — ' + character);
    if (age) parts.push('возраст — ' + age);
    if (q.trim()) parts.push('поиск — «' + q.trim() + '»');
    return parts;
  }

  function syncControls() {
    if (searchInput && searchInput.value !== q) searchInput.value = q;
    if (priceSelect) {
      priceSelect.value = String(priceIdx);
      priceSelect.classList.toggle('has-value', priceIdx !== 0);
    }
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
      ageSelect.classList.toggle('has-value', !!age);
      if (controlsEl) controlsEl.classList.toggle('no-age-filter', hideAge);
    }
    if (controlsEl && !isMobileFilters()) controlsEl.classList.toggle('mobile-filters-open', filtersOpen);
    syncFilterToggle();
  }

  var SECTION_UI = [
    { id: 'ready', label: 'Готовые', off: 'icons/sections/section-ready-off.webp', on: 'icons/sections/section-ready-on.webp' },
    { id: 'characters', label: 'Персонажи', off: 'icons/sections/section-heroes-off.webp', on: 'icons/sections/section-heroes-on.webp' },
    { id: 'unit', label: 'Шары', off: 'icons/sections/section-balloons-off.webp', on: 'icons/sections/section-balloons-on.webp' },
    { id: 'holidays', label: 'Праздники', off: 'icons/sections/section-holidays-off.webp', on: 'icons/sections/section-holidays-on.webp' }
  ];
  var READY_WHO = AUDIENCE;
  var READY_MAIN = ['Для девочки', 'Для мальчика', 'Для неё', 'Для него'];
  var READY_MORE = ['На выписку', '1 годик', 'Юбилей', 'Для мамы', 'Свадьба и девичник', 'Крещение'];
  var READY_WHAT = ['Фигуры из шаров', 'Букет из шаров', 'Коробка-сюрприз', 'Фотозона', 'Цветы из шаров', 'Гендер-пати', 'Арки', 'Шар-сюрприз', 'Крафтовый букет'];
  var READY_PHOTOS = {
    'Фигуры из шаров': 'images/ready/what-figures.webp?v=20260924',
    'Букет из шаров': 'images/ready/what-bouquet.webp?v=20260924hearts',
    'Коробка-сюрприз': 'images/ready/what-box.webp?v=20260924',
    'Фотозона': 'images/ready/what-photozone.webp?v=20260924clay2',
    'Цветы из шаров': 'images/ready/what-flowers.webp?v=20260924',
    'Гендер-пати': 'images/idea-gender.webp?v=20260924',
    'Арки': 'images/ready/what-arch.webp?v=20260924clay2',
    'Шар-сюрприз': 'images/ready/what-surprise.webp?v=20260924',
    'Крафтовый букет': 'images/ready/what-kraft.webp?v=20260924clay2',
    'На выписку': 'images/idea-discharge.webp?v=20260924',
    'Юбилей': 'images/idea-jubilee.webp?v=20260924',
    '1 годик': 'images/idea-1year.webp?v=20260924'
  };
  var WHO_PICKS = [
    ['Для неё', 'Для неё'],
    ['Для него', 'Для него'],
    ['Девочкам', 'Для девочки'],
    ['Мальчикам', 'Для мальчика'],
    ['Геймерам', 'Геймерам'],
    ['Выписка', 'На выписку'],
    ['Свадьба&Девичник', 'Свадьба и девичник'],
    ['1 годик', '1 годик']
  ];
  var UNIT_TYPES = [
    ['Латекс', 'images/balloons/balloon-latex.webp?v=20260924c', 'latex', 'Латексные шары'],
    ['С рисунком', 'images/balloons/balloon-print.webp?v=20260924c', 'who', 'Шары с рисунком'],
    ['Фольга', 'images/balloons/balloon-foil.webp?v=20260924c', 'who', 'Фольгированные фигуры'],
    ['Ходячие', 'images/balloons/balloon-walker.webp?v=20260924d', 'who', 'Ходячие фигуры'],
    ['Круги и звёзды', 'images/balloons/balloon-shapes.webp?v=20260924c', 'who', 'Круги, звёзды и сердца'],
    ['Конфетти', 'images/balloons/balloon-confetti.webp?v=20260924c', '', 'Шары с конфетти'],
    ['Хром', 'images/balloons/balloon-chrome.webp?v=20260924e', '', 'Шары хром'],
    ['Браш', 'images/balloons/balloon-brush.webp?v=20260924c', '', 'Шары Brush'],
    ['Super Agate', 'images/balloons/balloon-agate.webp?v=20260924e', '', 'Шары Super Agate'],
    ['Bubble', 'images/balloons/balloon-bubble.webp?v=20260924e', '', 'Шары Bubble'],
    ['Цифры', 'images/balloons/balloon-digit.webp?v=20260924c', '', 'Фольгированные цифры'],
    ['С надписью', 'images/balloons/balloon-name.webp?v=20260924e', '', 'Именные шары']
  ];
  var LATEX_TYPES = [
    ['Кристалл Ассорти', '', 'Кристалл Ассорти'],
    ['Металлик Ассорти', '', 'Металлик Ассорти'],
    ['Пастель MACARON Ассорти', '', 'Пастель MACARON Ассорти'],
    ['Пастель Ассорти', '', 'Пастель Ассорти'],
    ['Сердце Ассорти', '', 'Сердце Ассорти']
  ];
  var HOLIDAY_PHOTOS = [
    ['Новый год', 'images/holidays/holiday-newyear.webp?v=20260924c'],
    ['14 февраля', 'images/holidays/holiday-feb14.webp?v=20260924c'],
    ['23 февраля', 'images/holidays/holiday-feb23.webp?v=20260924c'],
    ['8 марта', 'images/holidays/holiday-mar8.webp?v=20260924c'],
    ['9 мая', 'images/holidays/holiday-may9.webp?v=20260924c'],
    ['Выпускной', 'images/holidays/holiday-grad.webp?v=20260924c'],
    ['1 сентября', 'images/holidays/holiday-sep1.webp?v=20260924c'],
    ['День учителя', 'images/holidays/holiday-teacher.webp?v=20260924e'],
    ['Хэллоуин', 'images/holidays/holiday-halloween.webp?v=20260924c']
  ];
  var HERO_PHOTOS = [
    ['Hello Kitty', 'images/characters/hero-hello-kitty.webp'],
    ['Три кота', 'images/characters/hero-three-cats.webp'],
    ['Бэтмен', 'images/characters/hero-batman.webp'],
    ['Миньоны', 'images/characters/hero-minions.webp'],
    ['Человек-паук', 'images/characters/hero-spiderman.webp'],
    ['Леди Баг', 'images/characters/hero-ladybug.webp'],
    ['Гарри Поттер', 'images/characters/hero-harry-potter.webp'],
    ['Буба', 'images/characters/hero-booba.webp'],
    ['Пеппа', 'images/characters/hero-peppa.webp'],
    ['Синий трактор', 'images/characters/hero-blue-tractor.webp'],
    ['Куклы LOL', 'images/characters/hero-lol.webp'],
    ['Щенячий патруль', 'images/characters/hero-paw-patrol.webp'],
    ['Единорог', 'images/characters/hero-unicorn.webp'],
    ['Соник', 'images/characters/hero-sonic.webp'],
    ['Лабубу', 'images/characters/hero-labubu.webp'],
    ['Холодное сердце', 'images/characters/hero-frozen.webp']
  ];
  var sheetQuery = '';

  function pickLabel() {
    if (group === 'characters' && character) return character;
    if (filter) return filter;
    if (category !== 'Все товары') return displayCategory(category);
    return '';
  }

  function ensureSheet() {
    if (document.getElementById('catalog-pick-sheet')) return;
    var el = document.createElement('div');
    el.id = 'catalog-pick-sheet';
    el.className = 'pick-sheet';
    el.hidden = true;
    el.innerHTML =
      '<button type="button" class="pick-sheet-back" aria-label="Закрыть"></button>' +
      '<div class="pick-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-pick-title">' +
      '<div class="pick-handle"></div>' +
      '<div class="pick-panel-head"><div><h2 id="catalog-pick-title"></h2><p id="catalog-pick-lead"></p></div>' +
      '<button type="button" class="pick-close" aria-label="Закрыть">×</button></div>' +
      '<input class="pick-sheet-search" id="catalog-pick-search" type="search" placeholder="Найти" hidden/>' +
      '<div class="pick-sheet-body" id="catalog-pick-body"></div>' +
      '<div class="pick-foot"><button type="button" class="pick-reset" id="catalog-pick-back">Все</button>' +
      '<button type="button" class="pick-done" id="catalog-pick-done">Показать</button></div></div>';
    document.body.appendChild(el);
    el.querySelector('.pick-sheet-back').addEventListener('click', closePickSheet);
    el.querySelector('.pick-close').addEventListener('click', closePickSheet);
    el.querySelector('#catalog-pick-back').addEventListener('click', function () {
      if (unitStep === 'who' || unitStep === 'latex') {
        sheetDraft = '';
        applyPick();
        return;
      }
      if (unitStep) { unitStep = ''; paintPickSheet(); return; }
      sheetDraft = '';
      paintPickSheet();
    });
    el.querySelector('#catalog-pick-done').addEventListener('click', applyPick);
    el.querySelector('#catalog-pick-search').addEventListener('input', function (e) {
      sheetQuery = norm(e.target.value);
      paintPickSheet();
    });
  }

  function closePickSheet() {
    var el = document.getElementById('catalog-pick-sheet');
    if (el) el.hidden = true;
    document.body.style.overflow = '';
  }

  function openPickSheet() {
    ensureSheet();
    unitStep = '';
    sheetQuery = '';
    sheetDraft = pickLabel();
    var search = document.getElementById('catalog-pick-search');
    if (search) search.value = '';
    paintPickSheet();
    document.getElementById('catalog-pick-sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function readyPhotoButtons(list) {
    return '<div class="pick-heroes">' + list.map(function (row) {
      var on = sheetDraft === row[0];
      return '<button type="button" class="pick-hero' + (on ? ' is-on' : '') + '" data-pick="' + esc(row[0]) + '">' +
        '<span class="pick-hero-ring">' + (row[1] ? '<img src="' + row[1] + '" alt=""/>' : '') + '</span><b>' + esc(row[2] || row[0]) + '</b></button>';
    }).join('') + '</div>';
  }

  function photoButtons(list, contain) {
    return '<div class="pick-heroes">' + list.map(function (row) {
      var on = sheetDraft === row[0] || sheetDraft === row[3];
      return '<button type="button" class="pick-hero' + (on ? ' is-on' : '') + '" data-pick="' + esc(row[0]) + '">' +
        '<span class="pick-hero-ring">' + (row[1] ? '<img class="' + (contain ? 'is-contain' : '') + '" src="' + row[1] + '" alt=""/>' : '') + '</span><b>' + esc(row[0]) + '</b></button>';
    }).join('') + '</div>';
  }

  function textButtons(list) {
    return '<div class="pick-choices">' + list.map(function (name) {
      var on = sheetDraft === name;
      return '<button type="button" class="' + (on ? 'is-on' : '') + '" data-pick="' + esc(name) + '">' + esc(name) + '</button>';
    }).join('') + '</div>';
  }

  function choicesWithProducts(list, grp) {
    return list.filter(function (name) {
      return products.some(function (p) { return inGroup(p, grp) && productHasLabel(p, name); });
    });
  }

  function paintPickSheet() {
    var el = document.getElementById('catalog-pick-sheet');
    if (!el) return;
    var title = 'Выбор';
    var lead = '';
    var html = '';
    var search = document.getElementById('catalog-pick-search');
    search.hidden = group !== 'characters' || !!unitStep;
    document.getElementById('catalog-pick-back').textContent = (unitStep === 'who' || unitStep === 'latex') ? 'Все шары' : (unitStep ? 'Назад' : 'Все');
    if (group === 'ready') {
      title = 'Кому и что';
      lead = '';
      var who = [
        ['Для девочки', 'images/who/who-girl.webp?v=20260924'],
        ['Для мальчика', 'images/who/who-boy.webp?v=20260924'],
        ['Для неё', 'images/who/who-her.webp?v=20260924'],
        ['Для него', 'images/who/who-him.webp?v=20260924']
      ];
      var occasions = READY_MORE.concat(['Гендер-пати']);
      var what = READY_WHAT.filter(function (name) { return name !== 'Гендер-пати'; }).map(function (name) {
        return [name, READY_PHOTOS[name] || '', ideaLabel(name)];
      });
      html = '<div class="pick-band pick-band-who"><p class="pick-kicker">Кому</p>' + photoButtons(who, false) + '</div>' +
        '<div class="pick-band pick-band-why"><p class="pick-kicker">Повод</p><div class="pick-more">' + occasions.map(function (name) {
          return '<button type="button" class="' + (sheetDraft === name ? 'is-on' : '') + '" data-pick="' + esc(name) + '">' + esc(name) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="pick-band pick-band-what"><p class="pick-kicker">Что заказать</p>' + readyPhotoButtons(what) + '</div>';
    } else if (group === 'holidays') {
      title = 'Какой праздник?';
      lead = 'Дата или повод — одним нажатием.';
      var days = HOLIDAY_PHOTOS.filter(function (row) {
        return products.some(function (p) { return inGroup(p, 'holidays') && productHasLabel(p, row[0]); });
      });
      html = photoButtons(days.length ? days : HOLIDAY_PHOTOS, true);
    } else if (group === 'unit' && unitStep === 'latex') {
      title = 'Какое ассорти?';
      lead = '';
      html = '<div class="pick-choices">' + LATEX_TYPES.map(function (row) {
        var on = sheetDraft === row[0] || sheetDraft === row[2];
        return '<button type="button" class="' + (on ? 'is-on' : '') + '" data-pick="' + esc(row[0]) + '">' + esc(row[0]) + '</button>';
      }).join('') + '</div>';
    } else if (group === 'unit' && unitStep === 'who') {
      title = 'Кому шар?';
      lead = '';
      html = '<div class="pick-choices">' + WHO_PICKS.map(function (row) {
        var on = sheetDraft === row[1] || sheetDraft === row[0];
        return '<button type="button" class="' + (on ? 'is-on' : '') + '" data-pick="' + esc(row[1]) + '">' + esc(row[0]) + '</button>';
      }).join('') + '</div>';
    } else if (group === 'unit') {
      title = 'Какие шары?';
      lead = 'Выберите вид шара';
      html = photoButtons(UNIT_TYPES, false);
    } else if (group === 'characters') {
      title = 'Кого позовём?';
      lead = 'Сначала те, кого чаще заказывают';
      var heroes = HERO_PHOTOS.filter(function (h) { return !sheetQuery || norm(h[0]).indexOf(sheetQuery) >= 0; });
      var known = {};
      HERO_PHOTOS.forEach(function (h) { known[norm(h[0])] = 1; });
      var extra = subcatList().filter(function (name) {
        return !known[norm(name)] && (!sheetQuery || norm(name).indexOf(sheetQuery) >= 0);
      });
      html = '<p class="pick-kicker">Часто заказывают</p>' + photoButtons(heroes, false);
      if (extra.length) {
        html += '<p class="pick-kicker">Ещё в ассортименте</p><div class="pick-more">' + extra.map(function (name) {
          return '<button type="button" class="' + (sheetDraft === name ? 'is-on' : '') + '" data-pick="' + esc(name) + '">' + esc(name) + '</button>';
        }).join('') + '</div>';
      }
    }
    document.getElementById('catalog-pick-title').textContent = title;
    var leadEl = document.getElementById('catalog-pick-lead');
    leadEl.textContent = lead;
    leadEl.hidden = !lead;
    var done = document.getElementById('catalog-pick-done');
    if (done) done.hidden = group === 'ready';
    var body = document.getElementById('catalog-pick-body');
    body.innerHTML = html;
    body.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-pick');
        if (group === 'ready') {
          sheetDraft = sheetDraft === name ? '' : name;
          applyPick();
          return;
        }
        sheetDraft = name;
        paintPickSheet();
      });
    });
  }

  function applyPick() {
    if (group === 'unit' && !unitStep) {
      var type = UNIT_TYPES.filter(function (row) { return row[0] === sheetDraft; })[0];
      if (type && type[2]) {
        category = type[3];
        character = '';
        filter = '';
        unitStep = type[2];
        sheetDraft = '';
        paintPickSheet();
        render();
        return;
      }
    }
    if (group === 'characters') {
      character = sheetDraft;
      category = 'Все товары';
      filter = '';
    } else if (group === 'unit' && unitStep === 'latex') {
      var latex = LATEX_TYPES.filter(function (row) { return row[0] === sheetDraft; })[0];
      category = latex ? latex[2] : category;
      character = '';
      filter = '';
    } else if (group === 'unit' && unitStep === 'who') {
      filter = sheetDraft;
      character = '';
    } else if (group === 'unit') {
      var plain = UNIT_TYPES.filter(function (row) { return row[0] === sheetDraft; })[0];
      category = plain ? plain[3] : (sheetDraft || 'Все товары');
      character = '';
      filter = '';
    } else {
      category = sheetDraft || 'Все товары';
      character = '';
      filter = '';
    }
    unitStep = '';
    closePickSheet();
    render({ scroll: group === 'ready' && category !== 'Все товары' });
  }

  function renderCapsule() {
    var old = document.getElementById('catalog-pick-capsule');
    var label = pickLabel();
    if (group === 'all' || group === 'ready' || group === 'characters' || group === 'unit' || group === 'holidays' || !label) {
      if (old) old.remove();
      return;
    }
    if (!old) {
      old = document.createElement('button');
      old.id = 'catalog-pick-capsule';
      old.type = 'button';
      old.className = 'pick-capsule';
      if (groupNav) groupNav.after(old);
      old.addEventListener('click', openPickSheet);
    }
    old.innerHTML = '<span><strong>' + esc(label) + '</strong><small>Изменить</small></span>';
  }

  function renderGroupNav() {
    if (!groupNav) return;
    groupNav.classList.add('catalog-sections');
    groupNav.classList.toggle('is-picked', group !== 'all');
    groupNav.innerHTML = SECTION_UI.map(function (g) {
      var on = group === g.id;
      return '<button type="button" class="' + (on ? 'is-on' : '') + '" data-group="' + g.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + g.label + '</button>';
    }).join('');
    groupNav.querySelectorAll('[data-group]').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = b.getAttribute('data-group');
        if (next !== group) {
          group = next;
          category = 'Все товары';
          character = '';
          filter = '';
          closeReadySheet();
          unitStep = '';
          sheetQuery = '';
          showAllReady = false;
          showAllHeroes = false;
        }
        render();
        closePickSheet();
      });
    });
  }

  function renderSubNav() {
    var detailNav = document.querySelector('.catalog-detail-categories');
    if (detailNav) detailNav.remove();
    if (!subNav) return;
    subNav.hidden = true;
    subNav.style.display = 'none';
    subNav.innerHTML = '';
    renderBoard();
    renderCapsule();
  }

  function ideaLabel(name) {
    if (name === 'Шар-сюрприз') return 'Сюрприз';
    if (name === 'Крафтовый букет') return 'Крафт';
    return String(name || '').replace(' из шаров', '').replace('-сюрприз', '');
  }

  function categoryRows(names, idea) {
    var first = {};
    products.forEach(function (p) {
      if (!p.category || first[p.category]) return;
      var cat = String(p.category);
      var match = idea ? (AUDIENCE.indexOf(cat) < 0 && inGroup(p, 'ideas')) : (AUDIENCE.indexOf(cat) >= 0 && inGroup(p, 'ready'));
      if (match) first[cat] = p;
    });
    var order = names.filter(function (name) { return first[name]; });
    if (idea) {
      Object.keys(first).forEach(function (name) {
        if (order.indexOf(name) < 0) order.push(name);
      });
      order.sort(function (a, b) {
        var ia = names.indexOf(a), ib = names.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b, 'ru');
      });
    }
    return order.map(function (name) { return { name: name, product: first[name] }; });
  }

  function circleRow(items) {
    return '<div class="catalog-idea-grid catalog-rail">' + items.map(function (item) {
      var src = READY_PHOTOS[item.name] || '';
      if (!src && item.product) {
        var key = window.vigProductPhoto ? window.vigProductPhoto(item.product) : '';
        src = key && window.vigImage ? window.vigImage(key, 200) : '';
      }
      var on = category === item.name;
      return '<button type="button" class="pick-hero' + (on ? ' is-on' : '') + '" data-idea="' + esc(item.name) + '">' +
        '<span class="pick-hero-ring">' + (src ? '<img src="' + src + '" alt=""/>' : '') + '</span><b>' + esc(ideaLabel(item.name)) + '</b></button>';
    }).join('') + '</div>';
  }

  function readyWhatItems() {
    var first = {};
    products.forEach(function (p) {
      if (p.category && !first[p.category]) first[p.category] = p;
    });
    return READY_WHAT.map(function (name) { return { name: name, product: first[name] || null }; });
  }

  function whoChip(name, extra) {
    return '<button type="button" class="' + extra + (category === name ? ' is-on' : '') + '" data-idea="' + esc(name) + '">' + esc(name) + '</button>';
  }

  function readyBands() {
    var who = [
      ['Для девочки', 'images/who/who-girl.webp?v=20260924'],
      ['Для мальчика', 'images/who/who-boy.webp?v=20260924'],
      ['Для неё', 'images/who/who-her.webp?v=20260924'],
      ['Для него', 'images/who/who-him.webp?v=20260924']
    ];
    var occasions = READY_MORE.concat(['Гендер-пати']);
    var what = READY_WHAT.filter(function (name) { return name !== 'Гендер-пати'; });
    function hero(name, src, label) {
      var on = category === name ? ' is-on' : '';
      return '<button type="button" class="pick-hero' + on + '" data-idea="' + esc(name) + '">' +
        '<span class="pick-hero-ring">' + (src ? '<img src="' + src + '" alt=""/>' : '') + '</span><b>' + esc(label) + '</b></button>';
    }
    return '<div class="pick-band pick-band-who"><p class="pick-kicker">Кому</p><div class="pick-heroes">' +
      who.map(function (row) { return hero(row[0], row[1], row[0]); }).join('') + '</div></div>' +
      '<div class="pick-band pick-band-why"><p class="pick-kicker">Повод</p><div class="pick-more">' +
      occasions.map(function (name) {
        return '<button type="button" class="' + (category === name ? 'is-on' : '') + '" data-idea="' + esc(name) + '">' + esc(name) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="pick-band pick-band-what"><p class="pick-kicker">Что заказать</p><div class="pick-heroes">' +
      what.map(function (name) { return hero(name, READY_PHOTOS[name] || '', ideaLabel(name)); }).join('') + '</div></div>';
  }

  function closeReadySheet() {
    if (readySheet) readySheet.remove();
    readySheet = null;
    if (!filterSheet) document.body.style.overflow = '';
  }

  function paintReadySheet() {
    if (!readySheet) return;
    var body = readySheet.querySelector('.catalog-filter-sheet-body');
    body.innerHTML = readyBands();
    body.querySelectorAll('[data-idea]').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-idea');
        category = category === name ? 'Все товары' : name;
        character = '';
        filter = '';
        showAllReady = false;
        render({ resultsOnly: true });
        paintReadySheet();
      });
    });
  }

  function openReadySheet() {
    if (readySheet) return;
    closeFilterSheet();
    readySheet = document.createElement('div');
    readySheet.className = 'catalog-filter-sheet catalog-ready-sheet';
    readySheet.setAttribute('role', 'presentation');
    readySheet.innerHTML =
      '<button type="button" class="catalog-filter-sheet-backdrop" aria-label="Закрыть подбор"></button>' +
      '<section class="catalog-filter-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-ready-title">' +
      '<div class="catalog-filter-sheet-handle" aria-hidden="true"></div>' +
      '<header class="catalog-filter-sheet-head"><div><h2 id="catalog-ready-title">Каталог</h2></div>' +
      '<button type="button" class="catalog-filter-sheet-close" aria-label="Закрыть">×</button></header>' +
      '<div class="catalog-filter-sheet-body"></div>' +
      '<footer class="catalog-filter-sheet-foot">' +
      '<button type="button" class="catalog-filter-sheet-reset" data-ready-reset>Сбросить</button>' +
      '<button type="button" class="catalog-filter-sheet-done" data-ready-done>Показать</button>' +
      '</footer></section>';
    document.body.appendChild(readySheet);
    document.body.style.overflow = 'hidden';
    paintReadySheet();
    readySheet.querySelector('.catalog-filter-sheet-backdrop').addEventListener('click', closeReadySheet);
    readySheet.querySelector('.catalog-filter-sheet-close').addEventListener('click', closeReadySheet);
    readySheet.querySelector('[data-ready-done]').addEventListener('click', closeReadySheet);
    readySheet.querySelector('[data-ready-reset]').addEventListener('click', function () {
      category = 'Все товары';
      render({ resultsOnly: true });
      paintReadySheet();
    });
  }

  function circleOn(selected, row) {
    if (!selected) return false;
    if (selected === row[0]) return true;
    if (row[2] && selected === row[2]) return true;
    if (row[3] && selected === row[3]) return true;
    return false;
  }

  function staticCircles(rows, selected, contain) {
    return '<div class="catalog-idea-grid">' + rows.map(function (row) {
      var on = circleOn(selected, row);
      return '<button type="button" class="pick-hero' + (on ? ' is-on' : '') + '" data-pick="' + esc(row[0]) + '">' +
        '<span class="pick-hero-ring">' + (row[1] ? '<img class="' + (contain ? 'is-contain' : '') + '" src="' + row[1] + '" alt=""/>' : '') + '</span><b>' + esc(row[0]) + '</b></button>';
    }).join('') + '</div>';
  }

  function activeUnitType() {
    return UNIT_TYPES.filter(function (row) {
      if (category === row[3] || category === row[0]) return true;
      if (row[2] === 'latex') return LATEX_TYPES.some(function (latex) { return latex[2] === category; });
      return false;
    })[0];
  }

  function bandCircles(rows, selected, bandClass, kicker) {
    var buttons = rows.map(function (row) {
      var on = circleOn(selected, row);
      return '<button type="button" class="pick-hero' + (on ? ' is-on' : '') + '" data-pick="' + esc(row[0]) + '">' +
        '<span class="pick-hero-ring">' + (row[1] ? '<img src="' + row[1] + '" alt=""/>' : '') + '</span><b>' + esc(row[0]) + '</b></button>';
    }).join('');
    return '<div class="pick-band ' + bandClass + '">' +
      (kicker ? '<p class="pick-kicker">' + kicker + '</p>' : '') +
      '<div class="pick-heroes">' + buttons + '</div></div>';
  }

  function boardHtml() {
    if (group === 'ready') return readyBands();
    if (group === 'holidays') {
      return bandCircles(HOLIDAY_PHOTOS, category, 'pick-band-why', 'Праздник');
    }
    if (group === 'characters') {
      var heroes = HERO_PHOTOS.filter(function (h) { return !sheetQuery || norm(h[0]).indexOf(sheetQuery) >= 0; });
      var known = {};
      HERO_PHOTOS.forEach(function (h) { known[norm(h[0])] = 1; });
      var extra = subcatList().filter(function (name) {
        return !known[norm(name)] && (!sheetQuery || norm(name).indexOf(sheetQuery) >= 0);
      });
      var heroOpen = showAllHeroes || extra.some(function (name) { return character === name; });
      var html = bandCircles(heroes, character, 'pick-band-who', 'Персонажи');
      if (extra.length && heroOpen) {
        html += '<div class="pick-band pick-band-why"><p class="pick-kicker">Ещё</p><div class="pick-more">' + extra.map(function (name) {
          return '<button type="button" class="' + (character === name ? 'is-on' : '') + '" data-hero="' + esc(name) + '">' + esc(name) + '</button>';
        }).join('') + '</div></div>';
      } else if (extra.length) {
        html += '<div class="catalog-load-more catalog-hero-more"><button type="button" data-more-heroes>Все персонажи <span>' + extra.length + '</span></button></div>';
      }
      return html;
    }
    if (group === 'unit') {
      var type = activeUnitType();
      var html = bandCircles(UNIT_TYPES, type ? type[0] : '', 'pick-band-what', 'Какие шары');
      if (type && type[2] === 'latex') {
        html += '<div class="pick-band pick-band-who"><p class="pick-kicker">Ассорти</p><div class="pick-more">' + LATEX_TYPES.map(function (row) {
          return '<button type="button" class="' + (category === row[2] ? 'is-on' : '') + '" data-pick="' + esc(row[0]) + '">' + esc(row[0]) + '</button>';
        }).join('') + '</div></div>';
      } else if (type && type[2] === 'who') {
        html += '<div class="pick-band pick-band-why"><p class="pick-kicker">Кому шар</p><div class="pick-more">' + WHO_PICKS.map(function (row) {
          return '<button type="button" class="' + (filter === row[1] ? 'is-on' : '') + '" data-who="' + esc(row[1]) + '">' + esc(row[0]) + '</button>';
        }).join('') + '</div></div>';
      }
      return html;
    }
    return '';
  }

  function scrollToResults() {
    if (!resultsSection) return;
    var header = document.querySelector('.site-header');
    var gap = (header ? header.getBoundingClientRect().height : 76) + 12;
    var top = resultsSection.getBoundingClientRect().top + window.pageYOffset - gap;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function renderBoard() {
    var old = document.getElementById('catalog-idea-board');
    if (group === 'all' || q.trim()) {
      if (old) old.remove();
      return;
    }
    if (!old) {
      old = document.createElement('div');
      old.id = 'catalog-idea-board';
      old.className = 'catalog-idea-board';
      if (groupNav) groupNav.after(old);
    }
    old.innerHTML = boardHtml();
    old.querySelectorAll('[data-open-ready]').forEach(function (b) {
      b.addEventListener('click', openReadySheet);
    });
    old.querySelectorAll('[data-clear-ready]').forEach(function (b) {
      b.addEventListener('click', function () {
        category = 'Все товары';
        render({ resultsOnly: true });
      });
    });
    old.querySelectorAll('[data-idea]').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-idea');
        category = category === name ? 'Все товары' : name;
        character = '';
        filter = '';
        showAllReady = false;
        render({ scroll: category !== 'Все товары' });
      });
    });
    old.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-pick');
        if (group === 'holidays') {
          category = category === name ? 'Все товары' : name;
          character = '';
          filter = '';
          render({ scroll: category !== 'Все товары' });
          return;
        }
        if (group === 'characters') {
          character = character === name ? '' : name;
          category = 'Все товары';
          filter = '';
          render({ scroll: !!character });
          return;
        }
        var type = UNIT_TYPES.filter(function (row) { return row[0] === name; })[0];
        var latex = LATEX_TYPES.filter(function (row) { return row[0] === name; })[0];
        if (latex && activeUnitType() && activeUnitType()[2] === 'latex') {
          category = category === latex[2] ? 'Латексные шары' : latex[2];
          filter = '';
          showAllReady = false;
          render({ scroll: category !== 'Латексные шары' });
          return;
        }
        if (type) {
          var same = category === type[3] || (type[2] === 'latex' && LATEX_TYPES.some(function (row) { return row[2] === category; }));
          category = same ? 'Все товары' : type[3];
          filter = '';
          character = '';
          showAllReady = false;
          render({ scroll: !same && !type[2] });
        }
      });
    });
    old.querySelectorAll('[data-more-heroes]').forEach(function (b) {
      b.addEventListener('click', function () {
        showAllHeroes = true;
        render();
      });
    });
    old.querySelectorAll('[data-hero]').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-hero');
        character = character === name ? '' : name;
        category = 'Все товары';
        filter = '';
        showAllReady = false;
        render({ scroll: !!character });
      });
    });
    old.querySelectorAll('[data-who]').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-who');
        filter = filter === name ? '' : name;
        render({ scroll: !!filter });
      });
    });
  }

  function computeNavSignature() {
    var ages = collectAges();
    return [
      group,
      category,
      character,
      filter,
      q.trim() ? 1 : 0,
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
    if (opts.scroll) scrollToResults();
  }

  function groupTitle() {
    if (filter) return filter;
    if (character) return character;
    if (category !== 'Все товары') return displayCategory(category);
    if (q.trim()) return 'Поиск';
    return '';
  }

  function renderResults() {
    if (!resultsSection) return;
    var list = filtered();
    var searching = !!q.trim();
    var shown = list.slice(0, visibleCount);
    var hasMore = list.length > visibleCount;
    function sortChip(value, label) {
      var on = sortMode === value;
      return '<button type="button" class="' + (on ? 'selected' : '') + '" data-sort="' + value + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    }
    var title = groupTitle();
    var browseHub = (group === 'ready' || group === 'characters' || group === 'unit') && category === 'Все товары' && !searching && !character && !filter && !showAllReady;
    var headTitle = browseHub ? 'Популярное' : title;
    var head =
      '<div class="catalog-results-heading"><div>' +
      (headTitle ? '<h2>' + esc(headTitle) + '</h2>' : '') +
      (searching ? '<p class="catalog-search-scope">Ищем по всему каталогу</p>' : '') +
      '</div>' +
      (browseHub ? '' :
      '<div class="catalog-results-tools">' +
      '<span role="status" aria-live="polite">' + (loading ? 'Загружаем варианты…' : list.length + ' ' + plural(list.length)) + '</span>' +
      '<div class="catalog-sort" role="group" aria-label="Сортировка">' +
      sortChip('price-asc', 'Дешевле') +
      sortChip('price-desc', 'Дороже') +
      '</div>' +
      '</div>') +
      '</div>';
    var budget = '';
    if (priceIdx !== 0) {
      budget = '<div class="catalog-active-budget" role="status"><span><img class="catalog-budget-ico" src="icons/budget-ruble.webp?v=1" alt="" width="36" height="36" decoding="async"/> Бюджет: <strong>' + esc(PRICES[priceIdx].label) + '</strong></span><button type="button" data-clearprice>Сбросить бюджет</button></div>';
    }
    var collections = '';
    var showCollections = false;
    if (showCollections) {
      var cards = UNIT_COLLECTIONS.map(function (name) {
        var items = products.filter(function (p) { return p.category === name; });
        if (!items.length) return '';
        var imgs = items.slice(0, 3).map(function (p) {
          var k = (window.vigProductPhoto ? window.vigProductPhoto(p) : '') || (p.image_keys && p.image_keys[0]) || '';
          return k ? '<img src="' + window.vigImage(k, 200) + '" data-key="' + esc(k) + '" alt="" loading="lazy" decoding="async"/>' : '';
        }).join('');
        return '<button type="button" class="catalog-collection-card" data-coll="' + esc(name) + '"><span class="catalog-collection-images" aria-hidden="true">' + imgs + '</span>' +
          '<span class="catalog-collection-copy"><small>Отдельная категория</small><strong>' + esc(name) + '</strong><span>' + items.length + ' ' + plural(items.length) + '</span></span><b aria-hidden="true">→</b></button>';
      }).join('');
      if (cards) collections = '<div class="catalog-collection-grid">' + cards + '</div>';
    }
    var body = '';
    if (loading) {
      var skel = '';
      for (var si = 0; si < 6; si++) {
        skel += '<div class="catalog-card catalog-card-skeleton" aria-hidden="true"><span class="catalog-card-image"></span><span class="catalog-card-copy"><i></i><i></i><i></i></span></div>';
      }
      body = '<div class="catalog-grid catalog-grid-skeleton" aria-busy="true" aria-label="Загружаем каталог">' + skel + '</div>';
    } else if (loadError) {
      body = '<div class="catalog-empty" role="alert"><h3>Каталог не загрузился</h3><p>Проверьте соединение и попробуйте ещё раз. Выбранные фильтры сохранятся.</p><button type="button" data-retry>Попробовать ещё раз</button></div>';
    } else if (list.length && browseHub) {
      var popular = list.slice(0, 12);
      body = '<div class="catalog-grid">' + popular.map(cardHtml).join('') + '</div>';
      body += '<div class="catalog-load-more"><button type="button" data-show-ready>Показать все <span>' + list.length + '</span></button></div>';
    } else if (list.length) {
      body = '<div class="catalog-grid">' + shown.map(cardHtml).join('') + '</div>';
      if (hasMore) {
        body += '<div class="catalog-load-more"><button type="button" data-more>Показать ещё <span>' + Math.min(PAGE_SIZE, list.length - visibleCount) + '</span></button><small>Показано ' + shown.length + ' из ' + list.length + '</small></div>';
      }
    } else {
      var emptyUnitType = group === 'unit' && category !== 'Все товары';
      var sugg = emptyUnitType ? [] : products.filter(function (p) { return group === 'all' || inGroup(p, group); })
        .filter(function (p) { return priceInBucket(p.price, priceIdx); }).slice(0, 4);
      var emptyLead = emptyUnitType
        ? 'Таких шаров в каталоге пока нет. Сбросьте фильтр или напишите нам — подскажем, что можно заказать.'
        : 'Попробуйте изменить запрос или напишите нам — подберём композицию под ваш праздник и бюджет.';
      body = '<div class="catalog-empty"><h3>Пока ничего не нашли</h3><p>' + emptyLead + '</p>' +
        '<div class="catalog-empty-actions"><button type="button" class="secondary" data-reset>Сбросить поиск и фильтры</button><button type="button" data-help>Помочь с выбором</button></div></div>';
      if (sugg.length) {
        body += '<section class="catalog-empty-suggestions" aria-labelledby="empty-suggestions-title"><div><p class="eyebrow">Возможно, вам подойдёт</p><h3 id="empty-suggestions-title">Посмотрите ещё</h3></div>' +
          '<div class="catalog-grid">' + sugg.map(cardHtml).join('') + '</div></section>';
      }
    }
    resultsSection.innerHTML = head + budget + collections + body;

    var sa = resultsSection.querySelector('[data-showall]');
    if (sa) sa.addEventListener('click', function () { group = 'all'; category = 'Все товары'; character = ''; filter = ''; render(); });
    resultsSection.querySelectorAll('[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-sort') || '';
        sortMode = sortMode === v ? '' : v;
        render();
      });
    });
    var cp = resultsSection.querySelector('[data-clearprice]');
    if (cp) cp.addEventListener('click', function () { priceIdx = 0; render(); });
    var rt = resultsSection.querySelector('[data-retry]');
    if (rt) rt.addEventListener('click', load);
    var rs = resultsSection.querySelector('[data-reset]');
    if (rs) rs.addEventListener('click', resetAll);
    var showReady = resultsSection.querySelector('[data-show-ready]');
    if (showReady) showReady.addEventListener('click', function () {
      showAllReady = true;
      visibleCount = PAGE_SIZE;
      render({ resultsOnly: true, keepVisible: true });
    });
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
    revealReadyPhotos(resultsSection);
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
        var img = key ? '<img src="' + window.vigImage(key, 480) + '" data-key="' + esc(key) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async" width="480" height="480"/>' : '';
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
  var WA_ICON = '<img src="icons/brand-whatsapp.webp?v=9" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';
  var TG_ICON = '<img src="icons/brand-telegram.webp?v=9" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';
  var MAX_ICON = '<img src="icons/brand-max.webp?v=9" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';
  var PHONE_ICON = '<img src="icons/phone-smartphone.webp?v=1" alt="" width="40" height="40" decoding="async" aria-hidden="true"/>';

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
      '<a class="contact-option whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg) + '"><span>' + WA_ICON + '</span><div><strong>WhatsApp</strong><small>Сообщение уже подготовлено</small></div></a>' +
      '<a class="contact-option telegram" target="_blank" rel="noreferrer" href="' + TG_URL + '?text=' + encodeURIComponent(msg) + '"><span>' + TG_ICON + '</span><div><strong>Telegram</strong><small>Текст скопируется · личный чат</small></div></a>' +
      '<a class="contact-option max" target="_blank" rel="noreferrer" href="' + MAX_URL + '"><span>' + MAX_ICON + '</span><div><strong>MAX</strong><small>Текст обращения скопируется</small></div></a>' +
      '<a class="contact-option phone" href="tel:+' + PHONE + '"><span>' + PHONE_ICON + '</span><div><strong>Позвонить</strong><small>' + PHONE_LABEL + '</small></div></a>' +
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
    if (e.key === 'Escape') {
      var pick = document.getElementById('catalog-pick-sheet');
      if (pick && !pick.hidden) { closePickSheet(); return; }
      if (filterSheet) closeFilterSheet();
    }
  });
  if (searchInput) {
    var searchWasActive = false;
    searchInput.addEventListener('input', function () {
      q = searchInput.value;
      ensureSearchClear();
      clearTimeout(searchTimer);
      // Только обновляем выдачу — без scroll, иначе якорь рвёт набор на телефоне.
      searchTimer = setTimeout(function () {
        searchWasActive = !!q.trim();
        render({ resultsOnly: true, scroll: false });
      }, 320);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearTimeout(searchTimer);
      q = searchInput.value;
      searchWasActive = !!q.trim();
      searchInput.blur();
      render({ resultsOnly: true, scroll: !!q.trim() });
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
      })
      .catch(function () {
        products = []; loading = false; loadError = true;
        navSignature = '';
        render();
      });
  }

  readUrl();
  fromUrl = true;
  if (searchInput) searchWasActive = !!q.trim();
  load();
})();
