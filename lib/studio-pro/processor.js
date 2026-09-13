// Studio Pro - Основной процессор обработки фото
// ONE AI REQUEST → ONE MASTER IMAGE → THREE CROPS

import { buildPrompt } from './prompts.js';
import { createCropPhotos } from './crop.js';

/**
 * Обработать фото через Studio Pro
 * @param {Object} options
 * @param {string} options.originalImageUrl - URL оригинального изображения (data URL или http)
 * @param {string} options.mode - Режим обработки (StudioMode)
 * @param {string} options.userInstructions - Дополнительные пожелания пользователя
 * @param {string} options.workerUrl - URL Worker API
 * @returns {Promise<StudioProResult>}
 */
export async function processStudioPro({ originalImageUrl, mode, userInstructions, workerUrl }) {
  // 1. Создать промпт
  const prompt = buildPrompt(mode, userInstructions);
  
  // 2. Отправить запрос на обработку в Worker
  const processResponse = await fetch(`${workerUrl}/api/studio/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: originalImageUrl,
      scene: mode,
      prompt: userInstructions
    })
  });
  
  const processData = await processResponse.json();
  
  if (!processData.ok || !processData.job_id) {
    throw new Error(processData.error || 'Не удалось запустить обработку');
  }
  
  // 3. Опрос статуса (макс. 60 попыток по 3 сек = 3 минуты)
  const masterImageUrl = await pollJobStatus(processData.job_id, workerUrl);
  
  // 4. Создать Photo #2 и Photo #3 из Master Image (локально, без AI)
  const { photo2, photo3 } = await createCropPhotos(masterImageUrl);
  
  // 5. Вернуть результат
  return {
    success: true,
    original: originalImageUrl,
    master: masterImageUrl,    // Photo #1
    photo2: photo2,             // Photo #2 (crop - только стена)
    photo3: photo3,             // Photo #3 (crop - стена + пол)
    mode: mode,
    prompt: prompt
  };
}

/**
 * Опрос статуса задачи
 * @param {string} jobId - ID задачи
 * @param {string} workerUrl - URL Worker API
 * @returns {Promise<string>} Data URL обработанного изображения
 */
async function pollJobStatus(jobId, workerUrl, maxAttempts = 60, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    
    const statusResponse = await fetch(`${workerUrl}/api/studio/status/${jobId}`);
    const statusData = await statusResponse.json();
    
    if (!statusData.ok) {
      throw new Error(statusData.error || 'Ошибка проверки статуса');
    }
    
    if (statusData.status === 'done' && statusData.result_url) {
      return statusData.result_url;
    }
    
    if (statusData.status === 'failed') {
      throw new Error('Обработка не удалась');
    }
    
    // Продолжаем опрос
  }
  
  throw new Error('Таймаут обработки (превышено 3 минуты)');
}

/**
 * Результат обработки Studio Pro
 * @typedef {Object} StudioProResult
 * @property {boolean} success - Успешно ли завершена обработка
 * @property {string} original - Data URL оригинального изображения
 * @property {string} master - Data URL Master Image (Photo #1)
 * @property {string} photo2 - Data URL Photo #2 (crop)
 * @property {string} photo3 - Data URL Photo #3 (crop)
 * @property {string} mode - Режим обработки
 * @property {string} prompt - Использованный промпт
 */
