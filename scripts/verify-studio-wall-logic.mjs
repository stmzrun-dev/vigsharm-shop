/**
 * Offline checks for Studio Pro rephotograph pipeline (Manus-style).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const studioPath = path.join(root, 'admin', 'admin-studio-pro.js');
const htmlPath = path.join(root, 'admin', 'index.html');
const workerPath = path.join(root, 'worker', 'index.js');

const studio = fs.readFileSync(studioPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

// Worker: rephotograph endpoint + Manus prompts
assert(worker.includes('/api/studio/rephotograph'), 'rephotograph route');
assert(worker.includes('handleStudioRephotograph'), 'handleStudioRephotograph exists');
assert(worker.includes('buildRephotographPrompt'), 'buildRephotographPrompt exists');
assert(worker.includes('image/nano-banana-2'), 'nano-banana-2 in attempts');
assert(worker.includes('reference_image'), 'reference_image field tried');
assert(worker.includes('SECOND reference image'), 'prompt mentions second reference');

// Admin: primary flow is rephotograph, not cutout
assert(studio.includes('callRephotographMaster'), 'callRephotographMaster exists');
assert(studio.includes('/api/studio/rephotograph'), 'admin calls rephotograph');
assert(studio.includes('finishMasterWorkflow'), 'finishMasterWorkflow exists');
assert(studio.includes('retryStudioMaster'), 'retryStudioMaster exists');
assert(studio.includes('ensureReferenceHttpsUrl'), 'ensureReferenceHttpsUrl exists');
assert(!studio.includes('await this.showPlacementEditor(scene)') || !/processStudioProNew[\s\S]*showPlacementEditor/.test(studio),
  'processStudioProNew does not open placement editor');

// UI
assert(html.includes('Создать Master'), 'create master button');
assert(html.includes('Пересоздать Master'), 'retry master button');
assert(html.includes('studio-compare-master'), 'compare master slot');
assert(!html.includes('placement-editor') || !html.includes('id="placement-editor"'), 'placement editor removed from UI');

// Crops: deterministic only
assert(studio.includes('allowCropUpscale = false'), 'crop AI upscale disabled');

// Scene prompts differ wall vs floor
assert(worker.includes('wall-only scene'), 'wall scene in worker prompt');
assert(worker.includes('floor-standing'), 'floor scene in worker prompt');

console.log('\n---');
if (failed) {
  console.error(`RESULT: ${failed} failed`);
  process.exit(1);
}
console.log('RESULT: all offline checks passed');
console.log('NOTE: Deploy Worker before live test: cd worker && npx wrangler deploy');
