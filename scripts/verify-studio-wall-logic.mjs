/**
 * Offline checks for Studio Pro dual-mode pipeline.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const studio = fs.readFileSync(path.join(root, 'admin', 'admin-studio-pro.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker', 'index.js'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'admin', 'admin-ai.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'admin', 'admin.js'), 'utf8');
const adminExt = fs.readFileSync(path.join(root, 'admin', 'admin-extended.js'), 'utf8');

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; } else { console.log('OK:', msg); }
}

assert(worker.includes('/api/studio/rephotograph'), 'rephotograph route');
assert(worker.includes('photozone / floor balloon installation') || worker.includes('ROUND FRAME photozone') || worker.includes('photozone on an EASEL'), 'photozone prompt distinct');
assert(worker.includes('BRIGHT DAYLIGHT STUDIO') || worker.includes('NATURAL CATALOG DAYLIGHT'), 'bright light in rephotograph prompt');
assert(worker.includes('1.8 m easel') || worker.includes('~1.8 m') || worker.includes('1.8 meters'), 'tall photozone scale hint');
assert(worker.includes('3 METERS') || worker.includes('Ø3 m') || worker.includes('3 meters'), 'round frame 3m scale');
assert(worker.includes('photozone_type'), 'photozone_type passed to rephotograph');
assert(worker.includes('balloon_figures'), 'balloon_figures scene in worker');
assert(worker.includes('human-scale balloon sculpture'), 'figures scale prompt');
assert(worker.includes('STRAIGHTEN the figure') || worker.includes('standing VERTICALLY') || worker.includes('STRAIGHTEN aggressively'), 'figures straighten upright');
assert(worker.includes('REMOVE any non-balloon support') || worker.includes('no table, no wire stand'), 'figures remove stand/table');
assert(worker.includes('fix dark laminate') || worker.includes('LIGHT bright laminate') || worker.includes('FLOOR LUMINANCE'), 'figures bright laminate floor');
assert(worker.includes('even slightly') || worker.includes('PERFECTLY VERTICAL'), 'figures no slight lean');
assert(worker.includes('brightFloor') || worker.includes('FLOOR LUMINANCE — CRITICAL'), 'shared brightFloor block');
assert(worker.includes('floorHint') || worker.includes('Target FLOOR from the SECOND reference'), 'floor hint on rephotograph attempts');
assert(worker.includes('Do NOT invent NEW balloons under the base') || worker.includes('invented feet balloons'), 'figures no invented feet balloons');
assert(worker.includes('CLOSE TO THE WALL') || worker.includes('NEAR the white baseboard'), 'near-wall placement');
assert(worker.includes('not overexposed') || worker.includes('NATURAL CATALOG DAYLIGHT'), 'softer catalog light');
assert(worker.includes('RIGID photo') || worker.includes('do not rebuild') || worker.includes('clustering density'), 'rigid product no densify');
assert(worker.includes('PHOTOZONE PRODUCT LOCK') || worker.includes('mini filler balloons'), 'photozone no rebuild lock');
assert(adminJs.includes("value: 'balloon_figures'"), 'balloon_figures in SCENES');
assert(studio.includes("'balloon_figures'"), 'balloon_figures in studio modes');
assert(!studio.includes('prepareSourceForRephotograph'), 'no restore before rephotograph');
assert(!studio.includes('applySignPatchFromOriginal'), 'old sign patch removed');
assert(studio.includes('/api/studio/sign-text'), 'admin calls AI sign-text');
assert(studio.includes('fixBalloonInscription'), 'fixBalloonInscription wired');
assert(!studio.includes('softWashPlaqueDisk'), 'plaque wash removed with old sign UI');
assert(studio.includes('studioMasterBaseUrl'), 'Master Base kept for re-render');
assert(studio.includes('showSignTextEditor'), 'sign editor show helper');
assert(worker.includes('foil STAR') || worker.includes('foil star'), 'sign-text supports foil star');
assert(worker.includes('extra balloons'), 'rephotograph forbids extra balloons');
assert(worker.includes('MIRROR / VANITY BEHIND THE PRODUCT'), 'floor mirror hazard lock');
assert(worker.includes('REFLECTIONS — NOT product') || worker.includes('ONLY inside the mirror glass are REFLECTIONS'), 'mirror reflections not counted as product');
assert(studio.includes('studioMasterBackupUrl'), 'keep Master on failed retry');
assert(worker.includes("status === 'failed'"), 'status returns failure detail');

assert(studio.includes('usesCompositeMode'), 'usesCompositeMode');
assert(studio.includes('usesRephotographMode'), 'usesRephotographMode');
assert(studio.includes("'wall_only'"), 'wall_only in modes');
assert(studio.includes("'handheld_bouquet'"), 'handheld in rephotograph list');
assert(studio.includes('wall_only') && studio.includes('unit_balloon') && studio.includes('usesRephotographMode'), 'wall scenes use rephotograph helper');
assert(studio.includes('return false') && studio.includes('usesCompositeMode'), 'composite disabled — Manus for wall');
assert(studio.includes('callCompositeMaster'), 'callCompositeMaster');
assert(studio.includes('createMasterForScene'), 'createMasterForScene routes modes');
assert(studio.includes('syncStudioModeHint'), 'mode hint UI');
assert(studio.includes('без cutout') || studio.includes('без пола, без руки'), 'Manus wall hint');
assert(worker.includes('ADD one photoreal hand') || worker.includes('ADD one photoreal'), 'Manus hand invent prompt');
assert(worker.includes('NOT a cutout/sticker composite'), 'wall Manus prompt');
assert(worker.includes('professional product photographer'), 'pro photographer studio look');
assert(worker.includes('LIGHT bright beige-grey') || worker.includes('high-key'), 'bright wall / high-key lighting');
assert(worker.includes('balloons INSIDE any clear bubble'), 'bubble count lock');
assert(worker.includes('bytesToBase64'), 'efficient base64 helper');
assert(worker.includes("format: 'base64'"), 'status returns dataURL base64');
assert(!worker.includes("format: 'url'"), 'no raw Nord URL as Master (black img)');
assert(worker.includes("body.prefer"), 'prefer from request body');
assert(studio.includes("startJob('banana')") || studio.includes("prefer: 'banana'") || studio.includes("startJob('banana')"), 'admin banana fallback');
assert(studio.includes('fallback banana') || studio.includes('fallback nano-banana'), 'admin fallback toast/status');
assert(!studio.includes('drawHandPlateFaded(finalCtx'), 'hand plate not used in compose');

assert(html.includes('studio-mode-hint'), 'mode hint in HTML');
assert(html.includes('sign-text-editor'), 'sign-text UI present');
assert(html.includes('Исправить надпись'), 'sign fix button label');
assert(html.includes('до 1 000 ₽ — Небольшой сюрприз'), 'budget select 6 options');
assert(adminJs.includes('articlePrefixFor'), 'article prefixes by category');
assert(adminJs.includes('assignFreshArticle'), 'fresh article on save');
assert(worker.includes('Герой Готэма') || worker.includes('Тёмный рыцарь'), 'creative title examples');
assert(worker.includes('BUDGET_OPTIONS'), 'budget options in worker');
assert(html.includes('Manus'), 'Manus mentioned in UI');
assert(!html.includes('id="crop-editor"') && !html.includes('Применить кропы'), 'crop editor UI removed');
assert(!studio.includes('showCropEditor') && !studio.includes('applyCropFrames'), 'studio does not apply crops');
assert(worker.includes('sharomem.ru'), 'supplier watermark removal');
assert(worker.includes('KEEP: Spider-Man / character art printed ON the balloon'), 'keep balloon prints, not shop logos');
assert(worker.includes('AUDIENCE_CATEGORIES'), 'AI card audience categories');
assert(worker.includes('Универсальные'), 'universal audience category');
assert(!/case 'wall_only': return 'Букет из шаров'/.test(worker), 'wall_only does not force bouquet tag');
assert(worker.includes('ageFromCategory'), 'age from category helper');
assert(worker.includes('applyOccasionShelfCard'), 'occasion shelf age/tags');
assert(worker.includes('character ОБЯЗАТЕЛЕН'), 'character required on all shelves');
assert(worker.includes('applyFirstBirthdayFromFoilDigit'), 'foil digit 1 → 1 годик');
assert(worker.includes('applyJubileeFromFoilDigits'), 'round foil → Юбилей');
assert(worker.includes('foil_digits') || worker.includes('foil_digit'), 'AI returns foil digits');
assert(worker.includes('title_alts'), 'AI card title alternatives');
assert(worker.includes('existing_titles'), 'AI receives existing titles');
assert(worker.includes('sanitizeTitleAgainstExisting'), 'filter duplicate titles');
assert(worker.includes('titlesTooSimilar'), 'similar title detection');
assert(worker.includes('HOLIDAY_CATEGORIES') || worker.includes('parseCompositionHolidayMeta'), 'holiday marker support');
assert(worker.includes('applyHolidayOnlyCard') || worker.includes('ПРАЗДНИЧНАЯ КАРТОЧКА'), 'holiday-only AI mode');
assert(ai.includes('getExistingCatalogTitles'), 'admin collects catalog titles');
assert(ai.includes('filterTitlesAgainstCatalog'), 'admin filters title alts');
assert(worker.includes('applyPhotozoneTypeTag'), 'photozone tag kept on occasion shelf');
assert(adminExt.includes('ensurePhotozoneTagFromCard'), 'admin keeps photozone tag with 1 годик');
assert(worker.includes('holidayFromHints'), 'holiday from composition hints');
assert(worker.includes('Дед Мороз'), 'Santa balloon figure character');
assert(worker.includes('КОШКА vs ЗАЯЦ'), 'cat vs rabbit balloon figure');
assert(worker.includes('СОЛДАТ vs МУЗЫКАНТ'), 'soldier vs musician balloon figure');
assert(adminExt.includes('holidayFromHints'), 'admin holiday from hints');
assert(adminJs.includes('HOLIDAY_CATEGORIES'), 'holiday categories list');
assert(adminExt.includes('parseCompositionHolidayMeta'), 'admin parses holiday paren meta');
assert(adminExt.includes('applyHolidayOnlyMode'), 'admin holiday-only mode');
assert(adminJs.includes('findSimilarCatalogTitle'), 'save blocks similar titles');
assert(worker.includes('Сырой состав'), 'AI formats user composition');assert(worker.includes('GENERIC_OCCASIONS'), 'generic occasion stripped');
assert(worker.includes('compositionLooksLikeSurpriseBox'), 'box composition detector');
assert(worker.includes('Коробка-сюрприз'), 'box type-only category');
assert(worker.includes('delete data.article'), 'AI card does not invent article');
assert(worker.includes('sanitizeCompositionColors'), 'composition color strip');
assert(worker.includes('sanitizeCompositionBoxes'), 'box composition normalize');
assert(worker.includes('с индивидуальной надписью и декором'), 'box inscription phrase');
assert(worker.includes('фольгированных персонажей'), 'foil ≠ фигуры из шаров');
assert(worker.includes("case 'wall_only': return ''"), 'wall scene no auto type tag');
assert(!/case 'wall_only':[\s\S]{0,80}Фигуры из шаров/.test(worker), 'wall scene not фигуры tag');
assert(ai.includes('assignFreshArticle'), 'article after AI fill');

console.log('\n---');
if (failed) { console.error(`RESULT: ${failed} failed`); process.exit(1); }
console.log('RESULT: all offline checks passed');
