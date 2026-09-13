// Studio Pro - Создание Photo #2 и Photo #3 из Master Image
// БЕЗ AI - только локальный crop

/**
 * Создать Photo #2 и Photo #3 из Master Image
 * @param {string} masterImageDataUrl - Base64 data URL Master Image
 * @returns {Promise<{photo2: string, photo3: string}>} Data URLs для Photo #2 и #3
 */
export async function createCropPhotos(masterImageDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        const width = img.width;
        const height = img.height;
        
        // Photo #2: Только стена (верхняя половина)
        const photo2 = cropTopHalf(img, width, height);
        
        // Photo #3: Стена + часть пола (верхние 70%)
        const photo3 = cropTopPortion(img, width, height, 0.7);
        
        resolve({ photo2, photo3 });
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Не удалось загрузить Master Image для crop'));
    };
    
    img.src = masterImageDataUrl;
  });
}

/**
 * Crop верхней половины изображения (только стена)
 */
function cropTopHalf(img, width, height) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Берём верхнюю половину, делаем квадратной
  const cropHeight = height * 0.5;
  const size = Math.min(width, cropHeight);
  
  canvas.width = size;
  canvas.height = size;
  
  // Центрируем crop
  const sx = (width - size) / 2;
  const sy = 0; // Сверху
  
  ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
  
  return canvas.toDataURL('image/webp', 0.92);
}

/**
 * Crop верхней части изображения (стена + часть пола)
 */
function cropTopPortion(img, width, height, portion = 0.7) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const cropHeight = height * portion;
  const size = Math.min(width, cropHeight);
  
  canvas.width = size;
  canvas.height = size;
  
  // Центрируем crop
  const sx = (width - size) / 2;
  const sy = 0; // Сверху
  
  ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
  
  return canvas.toDataURL('image/webp', 0.92);
}

/**
 * Альтернативный метод: Smart crop
 * Анализирует композицию и выбирает наиболее информативную область
 */
export async function smartCropPhotos(masterImageDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        const width = img.width;
        const height = img.height;
        
        // Photo #2: Центральный crop (захватывает основную композицию)
        const photo2 = cropCenter(img, width, height, 0.8);
        
        // Photo #3: Crop снизу-вверх (показывает товар с полом)
        const photo3 = cropBottomUp(img, width, height, 0.75);
        
        resolve({ photo2, photo3 });
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Не удалось загрузить Master Image для crop'));
    };
    
    img.src = masterImageDataUrl;
  });
}

/**
 * Crop центральной области
 */
function cropCenter(img, width, height, scale = 0.8) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const size = Math.min(width, height) * scale;
  
  canvas.width = size;
  canvas.height = size;
  
  const sx = (width - size) / 2;
  const sy = (height - size) / 2;
  
  ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
  
  return canvas.toDataURL('image/webp', 0.92);
}

/**
 * Crop снизу-вверх (для напольных композиций)
 */
function cropBottomUp(img, width, height, portion = 0.75) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const cropHeight = height * portion;
  const size = Math.min(width, cropHeight);
  
  canvas.width = size;
  canvas.height = size;
  
  const sx = (width - size) / 2;
  const sy = height - size; // Снизу
  
  ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
  
  return canvas.toDataURL('image/webp', 0.92);
}
