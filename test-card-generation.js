// Тест генерации карточки по изображению
const https = require('https');
const fs = require('fs');

const API_URL = 'https://vigsharm-api.vigsharm.workers.dev';
const TEST_IMAGE = 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800';

console.log('🧪 Тестирование генерации карточки по изображению...\n');

const testData = {
  image_url: TEST_IMAGE,
  price: 2500
};

const postData = JSON.stringify(testData);
const url = new URL('/api/ai/generate-card', API_URL);

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log(`📡 Отправка запроса: ${API_URL}${url.pathname}`);
console.log(`🖼️  Изображение: ${TEST_IMAGE}`);
console.log(`💰 Цена: ${testData.price}`);
console.log(`\n⏳ Ожидание ответа от DeepSeek (анализ изображения)...\n`);

const req = https.request(options, (res) => {
  let body = '';
  
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log(`📊 Статус: ${res.statusCode}`);
    
    const logFile = 'test-card-result.json';
    fs.writeFileSync(logFile, JSON.stringify({
      status: res.statusCode,
      response: body,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    try {
      const data = JSON.parse(body);
      
      if (data.ok) {
        console.log('\n✅ УСПЕХ! Генерация карточки работает!');
        console.log('\n📝 Сгенерированные данные:');
        console.log('   Название:', data.data.title);
        console.log('   Описание:', data.data.description?.substring(0, 100) + '...');
        console.log('   Полное описание:', data.data.full_description?.substring(0, 100) + '...');
        console.log('   Состав:', data.data.composition);
        console.log('   Категория:', data.data.category);
        console.log('   Персонаж:', data.data.character);
        console.log('   Возраст:', data.data.age_group);
        console.log('   Повод:', data.data.occasion);
        console.log('   Аудитория:', data.data.target_audience);
        console.log('   Цвета:', data.data.colors);
        console.log('\n🎉 AI-генерация полностью работоспособна!');
        console.log('✅ Можно использовать в админ-панели');
      } else {
        console.log('\n❌ ОШИБКА:', data.error);
      }
    } catch (e) {
      console.log('\n❌ Не удалось распарсить JSON:', e.message);
      console.log('Сырой ответ:', body.substring(0, 500));
    }
    
    console.log(`\n📝 Результат сохранён в ${logFile}`);
  });
});

req.on('error', (e) => {
  console.error('❌ Ошибка запроса:', e.message);
});

req.write(postData);
req.end();
