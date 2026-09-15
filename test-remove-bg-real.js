// Тест реальной модели remove-bg через Worker
// Выполняет ОДИН платный запрос к image/recraft-remove-bg

const fs = require('fs');
const https = require('https');
const http = require('http');

// Конфигурация
const WORKER_URL = 'https://vigsharm-api.vigsharm.workers.dev';
// Используем публичный тестовый URL (без 404)
const TEST_IMAGE_URL = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
const OUTPUT_DIR = './test-results';

console.log('🧪 ТЕСТ МОДЕЛИ REMOVE-BG\n');
console.log('=' .repeat(60));
console.log(`Worker: ${WORKER_URL}`);
console.log(`Test Image: ${TEST_IMAGE_URL}`);
console.log('=' .repeat(60) + '\n');

// Создать папку для результатов
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
  console.log(`✅ Создана папка: ${OUTPUT_DIR}\n`);
}

// Функция для скачивания файла
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(outputPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

// Проверка alpha-канала в PNG
function checkAlphaChannel(filePath) {
  const buffer = fs.readFileSync(filePath);
  
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
    return { isPNG: false, hasAlpha: false };
  }
  
  // Поиск IHDR chunk для определения color type
  let offset = 8;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    
    if (chunkType === 'IHDR') {
      // Color type находится на offset + 8 + 9
      const colorType = buffer[offset + 8 + 9];
      // Color types с alpha: 4 (grayscale+alpha) или 6 (RGB+alpha)
      const hasAlpha = colorType === 4 || colorType === 6;
      return { isPNG: true, hasAlpha, colorType };
    }
    
    offset += 12 + chunkLength; // length(4) + type(4) + data + crc(4)
  }
  
  return { isPNG: true, hasAlpha: false };
}

// Основная функция теста
async function runTest() {
  try {
    // ШАГ 1: Получить исходное изображение
    console.log('📥 ШАГ 1: Скачиваем исходное изображение...');
    const originalPath = `${OUTPUT_DIR}/original.jpg`;
    await downloadFile(TEST_IMAGE_URL, originalPath);
    const originalStats = fs.statSync(originalPath);
    console.log(`✅ Исходное изображение: ${(originalStats.size / 1024).toFixed(2)} KB`);
    console.log(`   Путь: ${originalPath}\n`);

    // ШАГ 2: Отправить запрос к remove-bg
    console.log('🚀 ШАГ 2: Отправка запроса к remove-bg...');
    const generateResponse = await fetch(`${WORKER_URL}/media/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'image/recraft-remove-bg',
        input: { image: TEST_IMAGE_URL }
      })
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      throw new Error(`Worker error: ${generateResponse.status} - ${errorText}`);
    }

    const generateData = await generateResponse.json();
    console.log('✅ Ответ от Worker:', JSON.stringify(generateData, null, 2));

    // NordRouter возвращает напрямую структуру с id, а не {ok, job_id}
    if (!generateData.id) {
      throw new Error(`Generation failed: ${generateData.error || 'No job ID returned'}`);
    }

    const jobId = generateData.id;
    const estimatedCost = generateData.est_usd || 'unknown';
    console.log(`\n📋 Job ID: ${jobId}`);
    console.log(`💰 Estimated Cost: $${estimatedCost}\n`);

    // ШАГ 3: Polling статуса
    console.log('⏳ ШАГ 3: Ожидание завершения обработки...');
    let attempts = 0;
    const maxAttempts = 60;
    let result = null;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 3000));

      const statusResponse = await fetch(`${WORKER_URL}/media/job/${jobId}`);
      if (!statusResponse.ok) {
        console.log(`⚠️  Попытка ${attempts}: HTTP ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`🔄 Попытка ${attempts}: статус = ${statusData.status || 'unknown'}`);

      if (statusData.status === 'done' && statusData.result_url) {
        result = statusData;
        console.log('✅ Обработка завершена!\n');
        break;
      } else if (statusData.status === 'failed' || statusData.error) {
        throw new Error(`Job failed: ${statusData.error || 'Unknown error'}`);
      }
    }

    if (!result) {
      throw new Error('Timeout: job не завершился за 3 минуты');
    }

    // ШАГ 4: Скачать результат
    console.log('📥 ШАГ 4: Скачивание результата...');
    console.log(`Result URL: ${result.result_url}`);
    
    const resultPath = `${OUTPUT_DIR}/result-no-bg.png`;
    await downloadFile(result.result_url, resultPath);
    const resultStats = fs.statSync(resultPath);
    console.log(`✅ Результат сохранён: ${(resultStats.size / 1024).toFixed(2)} KB`);
    console.log(`   Путь: ${resultPath}\n`);

    // ШАГ 5: Проверка формата и alpha-канала
    console.log('🔍 ШАГ 5: Проверка формата и alpha-канала...');
    const alphaCheck = checkAlphaChannel(resultPath);
    
    console.log(`   Формат: ${alphaCheck.isPNG ? 'PNG ✅' : 'НЕ PNG ❌'}`);
    console.log(`   Alpha-канал: ${alphaCheck.hasAlpha ? 'ЕСТЬ ✅' : 'НЕТ ❌'}`);
    if (alphaCheck.colorType !== undefined) {
      console.log(`   Color Type: ${alphaCheck.colorType}`);
    }

    // Финальный отчёт
    console.log('\n' + '='.repeat(60));
    console.log('🎉 ТЕСТ ЗАВЕРШЁН УСПЕШНО');
    console.log('='.repeat(60) + '\n');
    console.log('📋 КРАТКИЙ ОТЧЁТ:\n');
    console.log(`Исходное изображение:`);
    console.log(`  - Размер: ${(originalStats.size / 1024).toFixed(2)} KB`);
    console.log(`  - Формат: JPG\n`);
    console.log(`Результат:`);
    console.log(`  - URL: ${result.result_url}`);
    console.log(`  - Размер: ${(resultStats.size / 1024).toFixed(2)} KB`);
    console.log(`  - Формат: ${alphaCheck.isPNG ? 'PNG ✅' : 'НЕ PNG ❌'}`);
    console.log(`  - Alpha-канал: ${alphaCheck.hasAlpha ? 'ЕСТЬ ✅' : 'НЕТ ❌'}`);
    console.log(`  - Стоимость: $${estimatedCost}\n`);
    console.log(`Файлы: ${OUTPUT_DIR}/`);
    console.log(`  - original.jpg`);
    console.log(`  - result-no-bg.png\n`);

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    process.exit(1);
  }
}

runTest();
