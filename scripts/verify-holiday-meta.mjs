/**
 * Offline checks for holiday marker in composition: (1 сентября)
 */
function normalizeHolidayKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HOLIDAY_CATEGORIES = [
  'Выпускной', 'Новый год', '14 февраля', '23 февраля', '8 марта', '1 сентября'
];

function matchHolidayCategory(raw) {
  const key = normalizeHolidayKey(raw);
  if (!key) return null;
  const aliases = {
    '1 сентября': '1 сентября',
    '1сентября': '1 сентября',
    'новый год': 'Новый год',
    '14 февраля': '14 февраля',
    '23 февраля': '23 февраля',
    '8 марта': '8 марта',
    'выпускной': 'Выпускной'
  };
  for (const [alias, canon] of Object.entries(aliases)) {
    if (key === alias || key.includes(alias)) return canon;
  }
  for (const h of HOLIDAY_CATEGORIES) {
    const hk = normalizeHolidayKey(h);
    if (key === hk || key.includes(hk)) return h;
  }
  return null;
}

function parseCompositionHolidayMeta(text) {
  const src = String(text || '');
  let holiday = null;
  const clean = src.replace(/\(([^)]{1,40})\)/g, (full, inner) => {
    const hit = matchHolidayCategory(inner);
    if (hit) {
      holiday = hit;
      return ' ';
    }
    return full;
  })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { holiday, cleanText: clean };
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('OK:', msg);
}

const a = parseCompositionHolidayMeta('10 шаров, звезда (1 сентября)');
assert(a.holiday === '1 сентября', 'detect 1 сентября');
assert(!/\(/.test(a.cleanText) && /10 шаров/.test(a.cleanText), 'strip paren, keep balloons');

const b = parseCompositionHolidayMeta('(Новый год)\n5 шаров');
assert(b.holiday === 'Новый год', 'detect Новый год');
assert(!/новый/i.test(b.cleanText), 'holiday text not left in composition');

const c = parseCompositionHolidayMeta('шар (красный) и звезда');
assert(c.holiday === null, 'non-holiday parens kept as holiday=null');
assert(/\(красный\)/.test(c.cleanText), 'non-holiday parens preserved');

const d = parseCompositionHolidayMeta('фонтан (1сентября)');
assert(d.holiday === '1 сентября', 'alias 1сентября');

console.log('\n---');
if (failed) { console.error(`RESULT: ${failed} failed`); process.exit(1); }
console.log('RESULT: all holiday-meta checks passed');
