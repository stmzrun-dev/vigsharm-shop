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

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; } else { console.log('OK:', msg); }
}

assert(worker.includes('/api/studio/rephotograph'), 'rephotograph route');
assert(worker.includes('photozone / floor balloon installation') || worker.includes('ROUND FRAME photozone') || worker.includes('photozone on an EASEL'), 'photozone prompt distinct');
assert(worker.includes('BRIGHT DAYLIGHT STUDIO'), 'bright light in rephotograph prompt');
assert(worker.includes('1.8 m easel') || worker.includes('~1.8 m') || worker.includes('1.8 meters'), 'tall photozone scale hint');
assert(worker.includes('3 METERS') || worker.includes('Ø3 m') || worker.includes('3 meters'), 'round frame 3m scale');
assert(worker.includes('photozone_type'), 'photozone_type passed to rephotograph');
assert(worker.includes('balloon_figures'), 'balloon_figures scene in worker');
assert(worker.includes('human-scale balloon sculpture'), 'figures scale prompt');
assert(worker.includes('STRAIGHTEN the figure') || worker.includes('standing VERTICALLY'), 'figures straighten upright');
assert(worker.includes('REMOVE any non-balloon support') || worker.includes('no table, no wire stand'), 'figures remove stand/table');
assert(adminJs.includes("value: 'balloon_figures'"), 'balloon_figures in SCENES');
assert(studio.includes("'balloon_figures'"), 'balloon_figures in studio modes');
assert(!studio.includes('prepareSourceForRephotograph'), 'no restore before rephotograph');
assert(!studio.includes('applySignPatchFromOriginal'), 'old sign patch removed');
assert(!studio.includes('/api/studio/sign-text'), 'admin does not call AI sign-text');
assert(!studio.includes('softWashPlaqueDisk'), 'plaque wash removed with sign UI');
assert(studio.includes('studioMasterBaseUrl'), 'Master Base kept for re-render');
assert(!studio.includes('async applySignTextOnMaster'), 'sign apply removed');
assert(studio.includes('showSignTextEditor'), 'sign editor stub remains');
assert(worker.includes('extra balloons'), 'rephotograph forbids extra balloons');
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
assert(!html.includes('Надпись на табличку'), 'sign-text UI removed');
assert(!html.includes('Нанести надпись'), 'sign apply button removed');
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
assert(worker.includes('title_alts'), 'AI card title alternatives');
assert(worker.includes('existing_titles'), 'AI receives existing titles');
assert(worker.includes('sanitizeTitleAgainstExisting'), 'filter duplicate titles');
assert(worker.includes('titlesTooSimilar'), 'similar title detection');
assert(ai.includes('getExistingCatalogTitles'), 'admin collects catalog titles');
assert(ai.includes('filterTitlesAgainstCatalog'), 'admin filters title alts');
assert(adminJs.includes('findSimilarCatalogTitle'), 'save blocks similar titles');
assert(worker.includes('Сырой состав'), 'AI formats user composition');
assert(worker.includes('GENERIC_OCCASIONS'), 'generic occasion stripped');
assert(worker.includes('delete data.article'), 'AI card does not invent article');
assert(worker.includes('sanitizeCompositionColors'), 'composition color strip');
assert(worker.includes('sanitizeCompositionBoxes'), 'box composition normalize');
assert(worker.includes('с индивидуальной надписью и декором'), 'box inscription phrase');
assert(worker.includes('фольгированных персонажей'), 'foil ≠ фигуры из шаров');
assert(worker.includes("case 'wall_only': return 'Букет из шаров'"), 'wall scene not фигуры tag');
assert(ai.includes('assignFreshArticle'), 'article after AI fill');

console.log('\n---');
if (failed) { console.error(`RESULT: ${failed} failed`); process.exit(1); }
console.log('RESULT: all offline checks passed');
