/**
 * Offline checks for catalog title uniqueness helpers (mirrors worker logic).
 */
function normalizeTitleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesTooSimilar(a, b) {
  const na = normalizeTitleKey(a);
  const nb = normalizeTitleKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 6 && longer.includes(shorter) && shorter.length / longer.length >= 0.55) {
    return true;
  }
  const wa = na.split(' ').filter((w) => w.length > 1);
  const wb = nb.split(' ').filter((w) => w.length > 1);
  if (!wa.length || !wb.length) return false;
  if (wa.length === 1 && wb.length === 1) return wa[0] === wb[0];
  const setB = new Set(wb);
  let inter = 0;
  for (const w of wa) if (setB.has(w)) inter++;
  const union = wa.length + wb.length - inter;
  if (union > 0 && inter / union >= 0.75 && inter >= 2) return true;
  if (wa.length === wb.length && inter === wa.length) return true;
  return false;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('OK:', msg);
}

assert(titlesTooSimilar('Тёмный рыцарь', 'Темный рыцарь'), 'ё/е + exact');
assert(titlesTooSimilar('Тёмный рыцарь', 'Рыцарь тёмный'), 'word order');
assert(!titlesTooSimilar('Тёмный рыцарь', 'Выше облаков'), 'different titles ok');
assert(!titlesTooSimilar('Качок', 'Качок стиль'), 'short vs longer phrase — shorter < 6 chars substring rule');
assert(titlesTooSimilar('Большая прогулка', 'Большая прогулка!'), 'punctuation ignored');

const taken = ['Тёмный рыцарь', 'Герой Готэма'];
const pool = ['Темный рыцарь', 'Выше облаков', 'Герой Готэма'];
const free = pool.filter((t) => !taken.some((ex) => titlesTooSimilar(t, ex)));
assert(free.length === 1 && free[0] === 'Выше облаков', 'filter keeps only free title');

console.log('\n---');
if (failed) { console.error(`RESULT: ${failed} failed`); process.exit(1); }
console.log('RESULT: all title uniqueness checks passed');
