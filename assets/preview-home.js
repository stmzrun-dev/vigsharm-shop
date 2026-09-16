/* Disposable preview helpers. Safe to delete with preview-home.html */
(function () {
  'use strict';

  var CDN = 'https://stmzrun-dev.github.io/vigsharm-shop/images/characters/';

  document.querySelectorAll('img[data-char]').forEach(function (img) {
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      var key = img.getAttribute('data-char');
      if (!key) return;
      img.src = CDN + 'hero-' + key + '.webp';
    });
  });

  var banner = document.querySelector('.preview-banner');
  var closeBtn = document.querySelector('.preview-banner-close');
  if (banner && closeBtn) {
    closeBtn.addEventListener('click', function () {
      banner.hidden = true;
    });
  }
})();
