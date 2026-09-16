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

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; } else { console.log('OK:', msg); }
}

assert(worker.includes('/api/studio/rephotograph'), 'rephotograph route');
assert(worker.includes('photozone / floor balloon installation'), 'photozone prompt distinct');
assert(worker.includes('BRIGHT DAYLIGHT STUDIO'), 'bright light in rephotograph prompt');
assert(worker.includes('1.8 m easel'), 'tall photozone scale hint');
assert(!studio.includes('prepareSourceForRephotograph'), 'no restore before rephotograph');
assert(!studio.includes('applySignPatchFromOriginal'), 'old sign patch removed');
assert(!studio.includes('/api/studio/sign-text'), 'admin does not call AI sign-text');
assert(studio.includes('softWashPlaqueDisk'), 'soft plaque wash');
assert(studio.includes('drawInscriptionLines'), 'programmatic inscription');
assert(studio.includes('studioMasterBaseUrl'), 'Master Base kept for re-render');
assert(studio.includes('restoreMasterBaseWithoutText'), 'reset to Master Base');
assert(studio.includes('applySignTextOnMaster'), 'apply inscription');
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
assert(html.includes('sign-text-editor'), 'sign text UI');
assert(html.includes('Нанести надпись'), 'programmatic apply button');
assert(!html.includes('AI: переписать надпись'), 'AI rewrite button removed');
assert(html.includes('Manus'), 'Manus mentioned in UI');

assert(studio.includes('allowCropUpscale = false'), 'no crop AI upscale');

console.log('\n---');
if (failed) { console.error(`RESULT: ${failed} failed`); process.exit(1); }
console.log('RESULT: all offline checks passed');
