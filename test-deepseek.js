// Простой тест AI с выводом в файл
const https = require('https');
const fs = require('fs');

const API_URL = 'https://vigsharm-api.vigsharm.workers.dev';

console.log('🧪 Тестирование DeepSeek v4 Flash модели...\n');

// Тест suggest-category (проще, без изображения)
const testData = {
  title: 'Букет из воздушных шаров единорог',
  description: 'Красивая композиция из фольгированных шаров с единорогом для девочки'
};

const postData = JSON.stringify(testData);
const url = new URL('/api/ai/suggest-category', API_URL);

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
console.log(`📦 Данные:`, testData);
console.log(`\n⏳ Ожидание ответа от DeepSeek...\n`);

const req = https.request(options, (res) => {
  let body = '';
  
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log(`📊 Статус: ${res.statusCode}`);
    console.log(`📄 Ответ:`, body);
    
    const logFile = 'test-result.json';
    fs.writeFileSync(logFile, JSON.stringify({
      status: res.statusCode,
      response: body,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    try {
      const data = JSON.parse(body);
      
      if (data.ok) {
        console.log('\n✅ УСПЕХ! DeepSeek v4 Flash работает!');
        console.log('📁 Категория:', data.data.category);
        console.log('🏷️  Теги:', data.data.tags);
        console.log('\n🎉 Теперь можно использовать AI-генерацию в админ-панели!');
      } else {
        console.log('\n❌ ОШИБКА:', data.error);
        
        if (data.error.includes('unknown model')) {
          console.log('\n💡 Модель deepseek/deepseek-v4-flash не найдена в NordRouter');
          console.log('   Нужно проверить точное название модели в аккаунте');
        }
      }
    } catch (e) {
      console.log('\n❌ Не удалось распарсить JSON:', e.message);
    }
    
    console.log(`\n📝 Результат сохранён в ${logFile}`);
  });
});

req.on('error', (e) => {
  console.error('❌ Ошибка запроса:', e.message);
});

req.write(postData);
req.end();
