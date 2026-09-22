(function () {
  'use strict';

  function formatPrice(item) {
    var n = Number(item.price) || 0;
    var s = n.toLocaleString('ru-RU') + ' ₽';
    if (item.unit) s += item.unit;
    if (Number(item.price_from)) s = 'от ' + s;
    return s;
  }

  function applyItems(items) {
    if (!Array.isArray(items)) return;
    items.forEach(function (item) {
      if (!item || !item.id) return;
      document.querySelectorAll('[data-price-id="' + item.id + '"] strong').forEach(function (el) {
        el.textContent = formatPrice(item);
      });
    });
  }

  function listFrom(data) {
    if (!data) return [];
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  }

  function load(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var list = listFrom(data);
      if (!list.length) throw new Error('empty');
      return list;
    });
  }

  var api = (window.VIG_API || 'https://vigsharm-api.vigsharm.workers.dev') + '/api/price-list';
  load('data/price-list.json').catch(function () {
    return load(api);
  }).then(applyItems).catch(function () { /* keep HTML prices */ });
})();
