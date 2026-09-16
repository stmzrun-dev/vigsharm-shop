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
assert(studio.includes("['floor', 'photozone', 'auto']"), 'photozone uses rephotograph');
assert(studio.includes('callCompositeMaster'), 'callCompositeMaster');
assert(studio.includes('createMasterForScene'), 'createMasterForScene routes modes');
assert(studio.includes('syncStudioModeHint'), 'mode hint UI');

assert(html.includes('studio-mode-hint'), 'mode hint in HTML');
assert(html.includes('sign-text-editor'), 'sign text UI');
assert(html.includes('Нанести надпись'), 'programmatic apply button');
assert(!html.includes('AI: переписать надпись'), 'AI rewrite button removed');
assert(html.includes('ваш эталон + cutout') || html.includes('эталон + cutout'), 'dual mode explained');

assert(studio.includes('allowCropUpscale = false'), 'no crop AI upscale');

console.log('\n---');
if (failed) { console.error(`RESULT: ${failed} failed`); process.exit(1); }
console.log('RESULT: all offline checks passed');
