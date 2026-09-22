(function () {
  'use strict';

  function rub(n, from) {
    var s = (Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
    return from ? 'от ' + s : s;
  }

  function apply(data) {
    if (!data) return;
    var city = document.querySelector('[data-delivery-city]');
    var nearby = document.querySelector('[data-delivery-nearby]');
    if (city && data.city != null) city.textContent = rub(data.city, false);
    if (nearby && data.nearby != null) nearby.textContent = rub(data.nearby, Number(data.nearby_from));
  }

  function load(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!data || data.ok === false) throw new Error('empty');
      return data;
    });
  }

  var api = (window.VIG_API || 'https://vigsharm-api.vigsharm.workers.dev') + '/api/delivery';
  load('data/delivery.json').catch(function () {
    return load(api);
  }).then(apply).catch(function () { /* keep HTML prices */ });
})();
