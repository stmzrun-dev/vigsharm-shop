(function () {
  var PHOTO_PRICE = 590;
  var NAMED_PRICE = 490;
  var DESIGNS = [
    { id: 'white', name: 'Белый бант', photo: 'preview/bauble-white.webp?v=3', back: 'preview/bauble-white-back.webp?v=3', front: 'preview/bauble-white-front.webp?v=3', slot: { left: 33.6, top: 45.8, size: 30.8 } },
    { id: 'gold', name: 'Золотой бант', photo: 'preview/bauble-photo.webp?v=3', back: 'preview/bauble-gold-back.webp?v=3', front: 'preview/bauble-gold-front.webp?v=3', slot: { left: 34.8, top: 46.4, size: 30 } },
    { id: 'blue', name: 'Голубой бант', photo: 'preview/bauble-blue.webp?v=3', back: 'preview/bauble-blue-back.webp?v=3', front: 'preview/bauble-blue-front.webp?v=3', slot: { left: 32.2, top: 43.8, size: 32.4 } }
  ];
  var COLORS = [
    { id: 'red', name: 'Красный', matte: 'preview/bauble-matte-red.webp?v=1', gloss: 'preview/bauble-gloss-red.webp?v=1', orb: 'preview/bauble-named-red-orb.webp?v=13', whiteOrb: 'preview/bauble-named-red-bow-white-orb.webp?v=1', goldOrb: 'preview/bauble-named-red-bow-gold-orb.webp?v=1', matchOrb: 'preview/bauble-named-red-bow-match-orb.webp?v=8' },
    { id: 'pink', name: 'Розовый', matte: 'preview/bauble-matte-pink.webp?v=1', gloss: 'preview/bauble-gloss-pink.webp?v=1', orb: 'preview/bauble-named-pink-orb.webp?v=13', whiteOrb: 'preview/bauble-bow-white-orb.webp?v=8', goldOrb: 'preview/bauble-bow-gold-orb.webp?v=7', matchOrb: 'preview/bauble-named-pink-bow-match-orb.webp?v=7' },
    { id: 'purple', name: 'Фиолетовый', matte: 'preview/bauble-matte-purple.webp?v=1', gloss: 'preview/bauble-gloss-purple.webp?v=1', orb: 'preview/bauble-named-purple-orb.webp?v=13', whiteOrb: 'preview/bauble-named-purple-bow-white-orb.webp?v=1', goldOrb: 'preview/bauble-named-purple-bow-gold-orb.webp?v=1', matchOrb: 'preview/bauble-named-purple-bow-match-orb.webp?v=8' },
    { id: 'blue', name: 'Синий', matte: 'preview/bauble-matte-blue.webp?v=1', gloss: 'preview/bauble-gloss-blue.webp?v=1', orb: 'preview/bauble-named-blue-orb.webp?v=13', whiteOrb: 'preview/bauble-named-blue-bow-white-orb.webp?v=1', goldOrb: 'preview/bauble-named-blue-bow-gold-orb.webp?v=1', matchOrb: 'preview/bauble-named-blue-bow-match-orb.webp?v=8' },
    { id: 'sky', name: 'Голубой', matte: 'preview/bauble-matte-sky.webp?v=1', gloss: 'preview/bauble-gloss-sky.webp?v=1', orb: 'preview/bauble-named-sky-orb.webp?v=13', whiteOrb: 'preview/bauble-named-sky-bow-white-orb.webp?v=1', goldOrb: 'preview/bauble-named-sky-bow-gold-orb.webp?v=1', matchOrb: 'preview/bauble-named-sky-bow-match-orb.webp?v=8' },
    { id: 'gold', name: 'Золото', matte: 'preview/bauble-matte-gold.webp?v=1', gloss: 'preview/bauble-gloss-gold.webp?v=1', orb: 'preview/bauble-named-gold-orb.webp?v=13', whiteOrb: 'preview/bauble-named-gold-bow-white-orb.webp?v=1', goldOrb: 'preview/bauble-named-gold-bow-match-orb.webp?v=8', matchOrb: 'preview/bauble-named-gold-bow-match-orb.webp?v=8' }
  ];
  var BOWS = [
    { id: 'white', name: 'Белый', src: 'whiteOrb' },
    { id: 'gold', name: 'Золотой', src: 'goldOrb' },
    { id: 'match', name: 'В цвет шара', src: 'matchOrb' }
  ];
  var kind = document.body.getAttribute('data-kind') === 'named' ? 'named' : 'photo';
  var photoBalls = [blankPhoto(), blankPhoto()];
  var namedBalls = [blankNamed()];
  var active = 0;
  var viewSide = 'front';

  function blankPhoto() {
    return { design: 'white', back: 'photo', card: '', frontUrl: '', backUrl: '' };
  }
  var MOTIFS = [
    { id: '01', name: 'Снежинка и остролист', sample: 'Анна' },
    { id: '02', name: 'Олень и три ёлки', sample: 'Максим' },
    { id: '03', name: 'Снеговик и бусы', sample: 'София' },
    { id: '04', name: 'Ёлка и подарки', sample: 'Даниил' },
    { id: '05', name: 'Бант и сердце', sample: 'Валерия' },
    { id: '06', name: 'Пингвин и снежинка', sample: 'Иван' },
    { id: '07', name: 'Звезда и веточки', sample: 'Мария' },
    { id: '08', name: 'Дед Мороз и бантик', sample: 'Виктория' },
    { id: '09', name: 'Пряник и три сердца', sample: 'Станислав' },
    { id: '10', name: 'Домик и ёлочные шары', sample: 'Наталья' },
    { id: '11', name: 'Леденец и конфеты', sample: 'Артём' },
    { id: '12', name: 'Колокольчики и веточки', sample: 'Екатерина' },
    { id: '13', name: 'Варежки и сердце', sample: 'Алина' },
    { id: '14', name: 'Сани и три звезды', sample: 'Дмитрий' },
    { id: '15', name: 'Ангел и звёзды', sample: 'Полина' },
    { id: '16', name: 'Мишка и падающая звезда', sample: 'Никита' },
    { id: '17', name: 'Свеча и веточки', sample: 'Елена' },
    { id: '18', name: 'Шишка и звёзды', sample: 'Кирилл' },
    { id: '19', name: 'Сова и жёлуди', sample: 'Ксения' },
    { id: '20', name: 'Луна и три ёлки', sample: 'Михаил' }
  ];
  function motifOf(id) {
    return MOTIFS.filter(function (m) { return m.id === id; })[0] || null;
  }
  function blankNamed() {
    return { color: 'pink', finish: 'mirror', bow: 'white', face: 'text', text: '', motif: '', markUrl: '', markName: '', markFile: null };
  }
  function list() { return kind === 'photo' ? photoBalls : namedBalls; }
  function ball() { return list()[active]; }
  function designOf(b) { return DESIGNS.filter(function (d) { return d.id === b.design; })[0]; }
  function colorOf(b) { return COLORS.filter(function (c) { return c.id === b.color; })[0]; }
  var MOTIF_TEXT_MAX = 14;
  var FREE_TEXT_MAX = 80;
  function pickedMotifOf(b) { return b.face === 'photo' ? null : motifOf(b.motif); }
  function textMax(b) { return pickedMotifOf(b) ? MOTIF_TEXT_MAX : FREE_TEXT_MAX; }
  function textOver(b) { return b.face !== 'photo' && String(b.text || '').trim().length > textMax(b); }
  function variantOf(b) {
    if (b.finish === 'matte') return 'matte';
    return b.bow;
  }
  function heroSrc(b) {
    var c = colorOf(b);
    var v = variantOf(b);
    var motif = pickedMotifOf(b);
    if (motif) return 'preview/bauble-on-' + c.id + '-' + motif.id + (v === 'white' ? '' : '-' + v) + '.webp?v=8';
    if (v === 'matte') return c.matte;
    if (v === 'white') return c.gloss;
    var bow = v === 'match' && c.id === 'gold' ? 'gold' : v;
    return 'preview/bauble-gloss-' + c.id + '-bow-' + bow + '.webp?v=1';
  }
  var NAMED_EXAMPLE = 'preview/bauble-named-base.webp?v=1';
  var PACKS = [
    { id: 'none', name: 'Без коробки', size: 0, price: 0 },
    { id: '1', name: 'Своя коробка', size: 1, price: 90, photo: 'preview/bauble-box-one.webp?v=1' },
    { id: '2', name: 'На 2 шара', size: 2, price: 150 },
    { id: '3', name: 'На 3 шара', size: 3, price: 190 },
    { id: '4', name: 'На 4 шара', size: 4, price: 220, photo: 'preview/bauble-box-four.webp?v=1' },
    { id: '6', name: 'На 6 шаров', size: 6, price: 280, photo: 'preview/bauble-box-six.webp?v=1' }
  ];
  function packOf(id) { return PACKS.filter(function (p) { return p.id === id; })[0] || PACKS[0]; }
  function packFits(id, n) {
    var p = packOf(id);
    return !p.size || (n >= p.size && n % p.size === 0);
  }
  function boxWord(n) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return 'коробка';
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'коробки';
    return 'коробок';
  }
  var NB = '\u00A0';
  function packPhrase(id, n) {
    var p = packOf(id);
    if (!p.size) return 'без' + NB + 'коробки';
    var boxes = n / p.size;
    var count = boxes + NB + boxWord(boxes);
    if (p.size === 1) return count + (boxes === 1 ? '' : ' · каждому' + NB + 'шару');
    if (boxes === 1) return 'коробка на' + NB + p.size;
    return count + ' по' + NB + p.size;
  }
  function packCost(id, n) {
    var p = packOf(id);
    return p.size ? (n / p.size) * p.price : 0;
  }
  function bowName(id) { return BOWS.filter(function (x) { return x.id === id; })[0].name; }
  function bowPhrase(id) {
    return id === 'match' ? 'в' + NB + 'цвет' + NB + 'шара' : bowName(id).toLowerCase() + NB + 'бант';
  }
  function ballBits(b) {
    if (kind === 'photo') {
      var d = designOf(b);
      return {
        swatch: d.photo,
        scene: true,
        matte: false,
        meta: d.name,
        status: b.back === 'card' ? 'оборот: открытка' : 'оборот: фото',
        miss: false
      };
    }
    var matte = b.finish === 'matte';
    var text = String(b.text || '').trim();
    var logo = b.face === 'photo';
    var motif = pickedMotifOf(b);
    var over = textOver(b);
    return {
      swatch: heroSrc(b),
      scene: !matte,
      matte: matte,
      meta: (matte ? 'матовый' : 'зеркальный') + ' · ' + bowPhrase(b.bow) + (motif ? ' · рис. ' + motif.id : ''),
      status: logo ? (b.markFile ? 'логотип' : 'нужен логотип') : (over ? 'длинный текст для рисунка' : (text || 'нужна надпись')),
      miss: namedGap(b)
    };
  }

  function renderBall() {
    var img = document.getElementById('hero');
    var photo = kind === 'photo';
    var slot = document.getElementById('photo-slot');
    var slotImg = document.getElementById('slot-img');
    var slotCard = document.getElementById('slot-card');
    var plateBack = document.getElementById('plate-back');
    var plateFront = document.getElementById('plate-front');
    var d = photo ? designOf(ball()) : null;
    var pickedMotif = !photo && pickedMotifOf(ball());
    var logoFace = !photo && ball().face === 'photo';
    document.getElementById('photo-note').textContent = photo
      ? 'Ваше фото встаёт в шар. Файл остаётся только в этом браузере.'
      : (logoFace
        ? 'Логотип вырежем из плёнки и наклеим на шар.'
        : (pickedMotif
          ? 'Пример. Вместо «' + pickedMotif.sample + '» будет ваш текст.'
          : 'Чистый шар с бантом. На него наклеим ваш текст.'));
    var show = '';
    if (photo) {
      var b = ball();
      if (viewSide === 'back' && b.back === 'card') show = 'card';
      else if (viewSide === 'back' && b.backUrl) show = b.backUrl;
      else if (b.frontUrl) show = b.frontUrl;
    }
    if (!show) {
      img.hidden = false;
      img.parentElement.classList.remove('is-motif');
      if (photo) {
        img.src = d.photo;
        img.alt = 'Фото-шар на ёлке';
      } else {
        var tone = colorOf(ball());
        img.src = heroSrc(ball());
        img.alt = pickedMotif
          ? tone.name + ' шар, рисунок ' + pickedMotif.id + '. ' + pickedMotif.name
          : 'Чистый ' + tone.name.toLowerCase() + ' шар, ' + bowPhrase(ball().bow).replace(/\u00A0/g, ' ');
      }
      plateBack.hidden = true;
      plateFront.hidden = true;
      slot.hidden = true;
      return;
    }
    img.hidden = true;
    plateBack.hidden = false;
    plateFront.hidden = false;
    plateBack.src = d.back;
    plateFront.src = d.front;
    slot.hidden = false;
    slot.style.left = d.slot.left + '%';
    slot.style.top = d.slot.top + '%';
    slot.style.width = d.slot.size + '%';
    if (show === 'card') {
      slotImg.hidden = true;
      slotCard.hidden = false;
      slotCard.textContent = ball().card || 'Текст открытки';
    } else {
      slotCard.hidden = true;
      slotImg.hidden = false;
      slotImg.src = show;
    }
  }

  function renderControls() {
    var photo = kind === 'photo';
    var photoBox = document.getElementById('photo-controls');
    var namedBox = document.getElementById('named-controls');
    if (photoBox) photoBox.classList.toggle('hidden', !photo);
    if (namedBox) namedBox.classList.toggle('hidden', photo);
    if (photo) {
      var b = ball();
      document.getElementById('designs').innerHTML = DESIGNS.map(function (d) {
        return '<button type="button" class="chip' + (b.design === d.id ? ' is-on' : '') + '" data-design="' + d.id + '">' + d.name + '</button>';
      }).join('');
      var card = b.back === 'card';
      document.getElementById('pick-back-label').classList.toggle('hidden', card);
      document.getElementById('card-field').classList.toggle('hidden', !card);
      document.getElementById('card-text').value = b.card;
      document.querySelectorAll('#back-mode button').forEach(function (btn) {
        btn.classList.toggle('is-on', btn.getAttribute('data-back') === b.back);
      });
    } else {
      var n = ball();
      var matteOn = n.finish === 'matte';
      document.querySelectorAll('#finish-mode button').forEach(function (btn) {
        btn.classList.toggle('is-on', btn.getAttribute('data-finish') === (matteOn ? 'matte' : 'mirror'));
      });
      document.getElementById('color-label').textContent = 'Цвет · ' + colorOf(n).name;
      document.getElementById('colors').classList.toggle('is-matte', matteOn);
      document.getElementById('colors').innerHTML = COLORS.map(function (c) {
        var face = matteOn ? c.matte : c.matchOrb;
        return '<button type="button" class="' + (n.color === c.id ? 'is-on' : '') + '" data-color="' + c.id + '" aria-label="' + c.name + '"><span class="face" style="background-image:url(\'' + face + '\')"></span><span class="cap">' + c.name + '</span></button>';
      }).join('');
      document.getElementById('bow-block').classList.toggle('is-locked', matteOn);
      document.getElementById('matte-bow-note').classList.toggle('hidden', !matteOn);
      document.getElementById('bow-label').textContent = 'Бант · ' + bowName(n.bow);
      document.getElementById('bows').innerHTML = BOWS.map(function (bw) {
        var orb = colorOf(n)[bw.src];
        return '<button type="button" class="' + (n.bow === bw.id ? 'is-on' : '') + '" data-bow="' + bw.id + '" aria-label="' + bw.name + '"><span class="face" style="background-image:url(\'' + orb + '\')"></span><span class="cap">' + bw.name + '</span></button>';
      }).join('');
      var photoFace = n.face === 'photo';
      document.getElementById('face-label').textContent = 'Оформление · ' + (photoFace ? 'Логотип' : 'Надпись');
      document.getElementById('text-choice').classList.toggle('hidden', photoFace);
      document.getElementById('photo-choice').classList.toggle('hidden', !photoFace);
      document.querySelectorAll('#face-mode button').forEach(function (btn) {
        btn.classList.toggle('is-on', btn.getAttribute('data-face') === (photoFace ? 'photo' : 'text'));
      });
      document.getElementById('name-text').value = n.text;
      document.getElementById('motif-block').classList.toggle('hidden', photoFace);
      var withMotif = !!pickedMotifOf(n);
      document.getElementById('name-hint').textContent = withMotif
        ? 'С рисунком — одно имя, до ' + MOTIF_TEXT_MAX + ' знаков. Длинное пожелание — без рисунка.'
        : '';
      document.getElementById('name-text').placeholder = withMotif ? 'Например, ' + pickedMotifOf(n).sample : 'Алина или Любимой учительнице';
      updateNameField(n);
      var ready = !!n.markUrl;
      document.getElementById('photo-choice').classList.toggle('is-empty', photoFace && !ready);
      document.getElementById('mark-file').classList.toggle('is-ready', ready);
      document.getElementById('mark-hint').classList.toggle('hidden', !ready);
      var thumb = document.getElementById('mark-thumb');
      thumb.hidden = !ready;
      if (ready) thumb.src = n.markUrl;
      document.getElementById('mark-label').textContent = ready ? 'Заменить логотип' : 'Загрузите логотип';
      document.getElementById('mark-note').textContent = ready ? (n.markName || 'Файл выбран') : 'Простой знак, лучше в один цвет';
      var picked = motifOf(n.motif);
      var motifLabel = document.getElementById('motif-label');
      var motifBox = document.getElementById('motifs');
      var motifNone = document.getElementById('motif-none');
      if (motifLabel && motifBox) {
        motifLabel.textContent = picked ? ('Рисунок · ' + picked.name) : 'Рисунок';
        if (motifNone) motifNone.classList.toggle('is-on', !picked);
        motifBox.innerHTML = MOTIFS.map(function (m) {
          var on = n.motif === m.id ? ' is-on' : '';
          return '<button type="button" class="' + on + '" data-motif="' + m.id + '" aria-label="Рисунок ' + m.id + '. ' + escapeHtml(m.name) + '"><span class="face" style="background-image:url(\'preview/bauble-motif-' + m.id + '.webp?v=6\')"></span></button>';
        }).join('');
      }
    }
  }

  function renderList() {
    var items = list();
    document.getElementById('balls').innerHTML = items.map(function (b, i) {
      var bit = ballBits(b);
      var swatchClass = 'ball-swatch' + (bit.matte ? ' is-matte' : '') + (bit.scene ? ' is-scene' : '');
      var statusClass = 'ball-status' + (bit.miss ? ' is-miss' : '');
      var x = items.length > 1 ? '<button type="button" class="x" data-remove="' + i + '" aria-label="Убрать шар">×</button>' : '';
      return '<div class="ball-line"><button type="button" class="ball-row' + (i === active ? ' is-on' : '') + '" data-ball="' + i + '"><span class="' + swatchClass + '" style="background-image:url(\'' + bit.swatch + '\')"></span><span class="ball-copy"><b>Шар ' + (i + 1) + '</b><small>' + escapeHtml(bit.meta) + '</small><small class="' + statusClass + '">' + escapeHtml(bit.status) + '</small></span></button>' + x + '</div>';
    }).join('');
    var n = items.length;
    if (!packFits(items.pack, n)) items.pack = 'none';
    var noneOn = items.pack === 'none' ? ' is-on' : '';
    var cards = PACKS.filter(function (p) { return p.size && packFits(p.id, n); }).map(function (p) {
      var boxes = n / p.size;
      var on = items.pack === p.id ? ' is-on' : '';
      var face = p.photo ? '<img src="' + p.photo + '" alt=""/>' : '<span class="mark">' + p.size + '</span>';
      var detail = boxes + NB + boxWord(boxes) + ' · ' + (boxes * p.price).toLocaleString('ru-RU') + NB + '₽';
      return '<button type="button" class="' + on + '" data-pack="' + p.id + '">' + face + '<b>' + p.name + '</b><small>' + detail + '</small></button>';
    }).join('');
    document.getElementById('pack').innerHTML = '<button type="button" class="pack-none' + noneOn + '" data-pack="none">Без коробки</button><div class="pack-grid">' + cards + '</div>';
    document.getElementById('pack-hint').textContent = 'Своя коробка — каждому' + NB + 'шару. На 2, 3, 4 или 6 — когда шары делятся на размер: четыре' + NB + 'шара это две' + NB + 'коробки по' + NB + 'два.';
    var unit = kind === 'photo' ? PHOTO_PRICE : NAMED_PRICE;
    var sum = n * unit + packCost(items.pack, n);
    document.getElementById('bar-note').textContent = unit.toLocaleString('ru-RU') + NB + '₽ за' + NB + 'штуку · ' + n + NB + word(n) + (items.pack && items.pack !== 'none' ? ' · ' + packPhrase(items.pack, n) : '');
    document.getElementById('bar-sum').textContent = sum.toLocaleString('ru-RU') + NB + '₽';
    var missing = kind === 'named' && items.some(namedGap);
    var go = document.getElementById('send');
    go.disabled = missing;
    go.title = missing ? 'На каждом шаре нужна надпись или логотип. С рисунком — до ' + MOTIF_TEXT_MAX + ' знаков.' : '';
  }

  function namedGap(b) {
    return b.face === 'photo' ? !b.markFile : (!String(b.text || '').trim() || textOver(b));
  }
  function updateNameField(n) {
    var empty = n.face !== 'photo' && !String(n.text || '').trim();
    var over = textOver(n);
    var field = document.getElementById('name-field');
    field.classList.toggle('is-empty', empty);
    field.classList.toggle('is-over', over);
    document.getElementById('name-warn').textContent = over
      ? 'Для рисунка слишком длинно. Сократите или выберите «Без рисунка».'
      : 'Впишите имя или пожелание';
    document.getElementById('name-count').textContent = String(n.text || '').trim().length + '/' + textMax(n);
  }
  function render() { renderBall(); renderControls(); renderList(); }

  function word(n) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return 'шар';
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'шара';
    return 'шаров';
  }

  function message() {
    var items = list();
    var lines = [kind === 'photo' ? 'Фото-шары' : 'Именные шары', items.length + NB + 'шт., ' + packPhrase(items.pack, items.length)];
    items.forEach(function (b, i) {
      if (kind === 'photo') {
        var back = b.back === 'card' ? ('открытка «' + (b.card || '…') + '»') : 'второе фото';
        lines.push((i + 1) + '. ' + designOf(b).name + '. Лицевая: фото. Оборот: ' + back);
      } else {
        var detail = b.face === 'photo'
          ? 'Логотип на шаре приложен.'
          : ('Надпись: «' + String(b.text || '').trim() + '».');
        var motif = pickedMotifOf(b);
        var motifBit = motif ? (' Рисунок ' + motif.id + ' «' + motif.name + '».') : '';
        lines.push((i + 1) + '. ' + colorOf(b).name + ', ' + (b.finish === 'matte' ? 'матовый' : 'зеркальный') + ', бант ' + bowName(b.bow).toLowerCase() + '. ' + detail + motifBit);
      }
    });
    if (kind === 'photo') lines.push('Фото пришлю следующим сообщением.');
    lines.push('Цены в макете примерные.');
    return lines.join('\n');
  }

  function copyNamed(from) {
    var b = blankNamed();
    ['color', 'finish', 'bow', 'face', 'motif', 'markUrl', 'markName', 'markFile'].forEach(function (key) {
      b[key] = from[key];
    });
    return b;
  }
  document.getElementById('add').onclick = function () {
    list().push(kind === 'photo' ? blankPhoto() : copyNamed(ball()));
    active = list().length - 1;
    render();
  };
  function attachedFiles() {
    if (kind !== 'named') return [];
    var files = [];
    list().forEach(function (b) {
      if (b.face === 'photo' && b.markFile && files.indexOf(b.markFile) < 0) files.push(b.markFile);
    });
    return files;
  }
  function openSheet(text, files) {
    document.getElementById('msg').textContent = text;
    var box = document.getElementById('attach');
    box.innerHTML = files.map(function (file) {
      var ballWith = list().filter(function (b) { return b.markFile === file; })[0];
      return '<img src="' + ballWith.markUrl + '" alt="' + escapeHtml(file.name) + '"/>';
    }).join('');
    box.hidden = !files.length;
    var note = document.getElementById('attach-note');
    var shareBtn = document.getElementById('share');
    var canShare = files.length && navigator.canShare && navigator.canShare({ files: files });
    note.textContent = canShare
      ? 'Текст и логотип уйдут одним сообщением.'
      : 'Логотип приложен к заявке. С телефона он уйдёт в WhatsApp вместе с текстом.';
    note.classList.toggle('hidden', !files.length);
    shareBtn.classList.toggle('hidden', !canShare);
    document.getElementById('sheet').classList.add('is-on');
  }
  document.getElementById('share').onclick = function () {
    var files = attachedFiles();
    if (!files.length || !navigator.share) return;
    navigator.share({ text: message(), files: files }).catch(function () {});
  };
  document.getElementById('send').onclick = function () {
    if (this.disabled) return;
    var files = attachedFiles();
    var text = message();
    if (files.length && navigator.canShare && navigator.canShare({ files: files })) {
      navigator.share({ text: text, files: files }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        openSheet(text, files);
      });
      return;
    }
    openSheet(text, files);
  };
  document.getElementById('close').onclick = function () {
    document.getElementById('sheet').classList.remove('is-on');
  };
  document.body.addEventListener('click', function (e) {
    var t = e.target.closest('[data-design],[data-finish],[data-color],[data-bow],[data-face],[data-motif],[data-back],[data-ball],[data-remove],[data-pack]');
    if (!t) return;
    var b = ball();
    if (t.hasAttribute('data-design')) b.design = t.getAttribute('data-design');
    if (t.hasAttribute('data-finish')) {
      b.finish = t.getAttribute('data-finish');
      if (b.finish === 'matte') b.bow = 'white';
    }
    if (t.hasAttribute('data-color')) b.color = t.getAttribute('data-color');
    if (t.hasAttribute('data-bow')) b.bow = t.getAttribute('data-bow');
    if (t.hasAttribute('data-face')) {
      b.face = t.getAttribute('data-face');
      if (b.face === 'photo') b.motif = '';
    }
    if (t.hasAttribute('data-motif')) b.motif = t.getAttribute('data-motif');
    if (t.hasAttribute('data-back')) {
      b.back = t.getAttribute('data-back');
      viewSide = 'back';
    }
    if (t.hasAttribute('data-ball')) active = Number(t.getAttribute('data-ball'));
    if (t.hasAttribute('data-remove')) {
      var i = Number(t.getAttribute('data-remove'));
      list().splice(i, 1);
      if (active >= list().length) active = list().length - 1;
    }
    if (t.hasAttribute('data-pack')) {
      if (t.disabled || !packFits(t.getAttribute('data-pack'), list().length)) return;
      list().pack = t.getAttribute('data-pack');
    }
    render();
  });
  var cardText = document.getElementById('card-text');
  if (cardText) cardText.oninput = function (e) {
    ball().card = e.target.value;
    viewSide = 'back';
    renderBall();
    renderList();
  };
  var nameText = document.getElementById('name-text');
  if (nameText) nameText.oninput = function (e) {
    ball().text = e.target.value;
    updateNameField(ball());
    renderBall();
    renderList();
  };
  function takePhoto(input, key) {
    input.onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (ball()[key]) URL.revokeObjectURL(ball()[key]);
      ball()[key] = URL.createObjectURL(file);
      viewSide = key === 'backUrl' ? 'back' : 'front';
      e.target.value = '';
      render();
    };
  }
  var pick = document.getElementById('pick');
  var pickBack = document.getElementById('pick-back');
  if (pick) takePhoto(pick, 'frontUrl');
  if (pickBack) takePhoto(pickBack, 'backUrl');
  var markPick = document.getElementById('mark-pick');
  if (markPick) markPick.onchange = function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file || kind !== 'named') return;
    var old = ball().markUrl;
    var shared = list().some(function (b) { return b !== ball() && b.markUrl === old; });
    if (old && !shared) URL.revokeObjectURL(old);
    ball().markUrl = URL.createObjectURL(file);
    ball().markName = file.name;
    ball().markFile = file;
    e.target.value = '';
    render();
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  photoBalls.pack = 'none';
  namedBalls.pack = 'none';
  render();
})();
