// Тест AI-генерации после деплоя с DeepSeek моделью
const https = require('https');

const API_URL = 'https://vigsharm-api.vigsharm.workers.dev';
const TEST_IMAGE = 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800'; // Тестовое изображение шаров

console.log('🧪 Тестирование AI-генерации с DeepSeek моделью...\n');

// Функция для HTTP запроса
function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Тест 1: Генерация метаданных по изображению
async function testGenerateMetadata() {
  console.log('📸 Тест 1: Генерация метаданных из изображения');
  console.log(`   URL: ${TEST_IMAGE}`);
  
  try {
    const result = await makeRequest('/api/ai/generate-card', {
      image_url: TEST_IMAGE,
      price: 2500
    });
    
    console.log(`   Статус: ${result.status}`);
    
    if (result.data.ok) {
      console.log('   ✅ Успешно!');
      console.log('   Данные:', JSON.stringify(result.data.data, null, 2));
    } else {
      console.log('   ❌ Ошибка:', result.data.error);
    }
    
    return result;
  } catch (error) {
    console.log('   ❌ Ошибка запроса:', error.message);
    return null;
  }
}

// Тест 2: Предложение категории
async function testSuggestCategory() {
  console.log('\n🏷️  Тест 2: Предложение категории');
  
  try {
    const result = await makeRequest('/api/ai/suggest-category', {
      title: 'Букет из воздушных шаров единорог',
      description: 'Красивая композиция из фольгированных шаров с единорогом для девочки'
    });
    
    console.log(`   Статус: ${result.status}`);
    
    if (result.data.ok) {
      console.log('   ✅ Успешно!');
      console.log('   Категория:', result.data.data.category);
      console.log('   Теги:', result.data.data.tags);
    } else {
      console.log('   ❌ Ошибка:', result.data.error);
    }
    
    return result;
  } catch (error) {
    console.log('   ❌ Ошибка запроса:', error.message);
    return null;
  }
}

// Запуск тестов
(async () => {
  const test1 = await testGenerateMetadata();
  const test2 = await testSuggestCategory();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ:');
  console.log('='.repeat(60));
  
  if (test1?.data?.ok && test2?.data?.ok) {
    console.log('✅ Все тесты пройдены успешно!');
    console.log('✅ DeepSeek модель работает корректно');
    console.log('✅ Можно использовать в админ-панели');
  } else {
    console.log('⚠️  Есть проблемы:');
    if (!test1?.data?.ok) console.log('   - Генерация метаданных не работает');
    if (!test2?.data?.ok) console.log('   - Предложение категории не работает');
  }
  
  console.log('\n🌐 Теперь проверьте в админ-панели:');
  console.log('   https://stmzrun-dev.github.io/vigsharm-shop/admin/');
  console.log('   Создайте товар → загрузите фото → нажмите "Сгенерировать данные через ИИ"');
  console.log('='.repeat(60) + '\n');
})();
