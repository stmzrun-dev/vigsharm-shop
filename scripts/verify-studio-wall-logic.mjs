/**
 * Offline checks for Studio Pro wall-only safeguards + checkpoint / AI toggle / compare.
 * Does not call NordRouter — verifies code contracts we can assert locally.
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

function clampPlacementInset(placement, inset = 0.06) {
  if (!placement) return placement;
  let { x, y, w, h } = placement;
  w = Math.min(w, 1 - inset * 2);
  h = Math.min(h, 1 - inset * 2);
  x = Math.max(inset, Math.min(x, 1 - inset - w));
  y = Math.max(inset, Math.min(y, 1 - inset - h));
  return { x, y, w, h };
}

function isWallOnlyScene(scene) {
  return ['wall_only', 'unit_balloon', 'handheld_bouquet'].includes(scene);
}

function shouldSkipAiEnhance(scene, aiEnabled = true) {
  if (isWallOnlyScene(scene)) return true;
  return !aiEnabled;
}

// Code presence — wall
assert(studio.includes('shouldSkipAiEnhance'), 'shouldSkipAiEnhance exists');
assert(studio.includes('drawSoftContactShadow'), 'drawSoftContactShadow exists');
assert(studio.includes('this.shouldSkipAiEnhance(scene)'), 'confirm path calls shouldSkipAiEnhance');
assert(studio.includes('skipRestore'), 'restore skip for wall');
assert(studio.includes('allowCropUpscale = !this.isWallOnlyScene'), 'crop upscale skipped on wall');
assert(html.includes('AI не перерисовывает товар'), 'UI lead mentions wall no-AI');
assert(html.includes('Готово → Master'), 'button says Master not AI-доводка');
assert(worker.includes('buildGentleEnhancePrompt'), 'worker still has gentle prompt for floor fallback path');

// Checkpoints
assert(studio.includes('saveStudioCheckpoint'), 'saveStudioCheckpoint exists');
assert(studio.includes('loadStudioCheckpoint'), 'loadStudioCheckpoint exists');
assert(studio.includes('continueFromStudioCheckpoint'), 'continueFromStudioCheckpoint exists');
assert(studio.includes('clearStudioCheckpoint'), 'clearStudioCheckpoint exists');
assert(studio.includes('indexedDB.open'), 'checkpoint uses IndexedDB');
assert(html.includes('studio-continue-btn'), 'continue button in HTML');
assert(html.includes('Продолжить с последнего'), 'continue label');
assert(html.includes('studio-clear-checkpoint-btn'), 'clear checkpoint button');

// AI toggle
assert(html.includes('studio-ai-enhance'), 'AI toggle checkbox in HTML');
assert(studio.includes('isStudioAiEnhanceEnabled'), 'isStudioAiEnhanceEnabled exists');
assert(studio.includes('syncStudioAiToggleUi'), 'syncStudioAiToggleUi exists');
assert(studio.includes('!this.isStudioAiEnhanceEnabled()'), 'shouldSkip respects toggle');

// Compare strip
assert(html.includes('studio-compare'), 'compare strip in HTML');
assert(html.includes('studio-compare-original'), 'compare original slot');
assert(html.includes('studio-compare-canvas'), 'compare canvas slot');
assert(html.includes('studio-compare-ai'), 'compare AI slot');
assert(studio.includes('renderStudioCompare'), 'renderStudioCompare exists');
assert(studio.includes('studioCanvasMasterDataUrl'), 'canvas master kept separately');
assert(studio.includes('this.studioCompare.ai'), 'AI compare slot populated');

// Logic: wall scenes skip AI
for (const s of ['wall_only', 'unit_balloon', 'handheld_bouquet']) {
  assert(shouldSkipAiEnhance(s, true) === true, `skip AI for ${s} even if toggle on`);
  assert(shouldSkipAiEnhance(s, false) === true, `skip AI for ${s} if toggle off`);
}
for (const s of ['floor', 'photozone', 'auto']) {
  assert(shouldSkipAiEnhance(s, true) === false, `keep AI for ${s} when toggle on`);
  assert(shouldSkipAiEnhance(s, false) === true, `skip AI for ${s} when toggle off`);
}

// Logic: clamp keeps inset — never flush to edge (prevents flat clip)
const flushRight = clampPlacementInset({ x: 0.5, y: 0.2, w: 0.55, h: 0.7 }, 0.07);
assert(flushRight.x + flushRight.w <= 1 - 0.07 + 1e-9, 'right edge inset preserved');
assert(flushRight.x >= 0.07 - 1e-9, 'left edge inset preserved');
assert(flushRight.y >= 0.07 - 1e-9, 'top inset preserved');
assert(flushRight.y + flushRight.h <= 1 - 0.07 + 1e-9, 'bottom inset preserved');

const huge = clampPlacementInset({ x: 0, y: 0, w: 0.99, h: 0.99 }, 0.07);
assert(huge.w <= 1 - 0.14 + 1e-9, 'oversized width capped');
assert(huge.h <= 1 - 0.14 + 1e-9, 'oversized height capped');

// Target widths for wall smaller (less edge collision)
assert(/wall_only:\s*\{[^}]*targetWidth:\s*0\.58/s.test(studio), 'wall_only targetWidth 0.58');
assert(/unit_balloon:\s*\{[^}]*targetWidth:\s*0\.50/s.test(studio), 'unit_balloon targetWidth 0.50');

// Soft shadow drawn before product on wall compose
const composeIdx = studio.indexOf('async composeWithBackground');
const composeChunk = studio.slice(composeIdx, composeIdx + 3500);
assert(composeChunk.includes('drawSoftContactShadow'), 'compose draws soft shadow');
assert(composeChunk.includes('wall: true'), 'wall shadow mode');

console.log('\n---');
if (failed) {
  console.error(`RESULT: ${failed} failed`);
  process.exit(1);
}
console.log('RESULT: all offline checks passed');
console.log('NOTE: Full NordRouter visual test still needs deploy + live API (not run here).');
