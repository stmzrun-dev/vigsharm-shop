// Скрипт миграции товаров из products.json в D1 базу данных
// Запуск: node migrate-products-to-d1.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const WORKER_URL = 'vigsharm-api.vigsharm.workers.dev';
const PRODUCTS_FILE = path.join(__dirname, 'assets', 'products.json');

console.log('🚀 Миграция товаров в D1 базу данных\n');
console.log('Worker URL:', `https://${WORKER_URL}`);
console.log('Исходный файл:', PRODUCTS_FILE);
console.log('='.repeat(60) + '\n');

// Читаем products.json
if (!fs.existsSync(PRODUCTS_FILE)) {
  console.error('❌ Файл products.json не найден:', PRODUCTS_FILE);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
const products = data.products || [];

if (products.length === 0) {
  console.error('❌ В products.json нет товаров для миграции');
  process.exit(1);
}

console.log(`✅ Найдено товаров для миграции: ${products.length}\n`);

// Преобразуем формат данных из старого в новый
function transformProduct(oldProduct) {
  // Парсим composition из строки в объект
  const compositionLines = (oldProduct.composition || '').split('\n').filter(l => l.trim());
  
  // Формируем client_options из старых полей
  const clientOptions = {};
  if (oldProduct.has_digit_choice) {
    clientOptions.digit_choice = {
      enabled: true,
      count_on_photo: oldProduct.digit_count_on_photo || 1,
      options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    };
  }
  if (oldProduct.has_inscription) {
    clientOptions.inscription = {
      enabled: true,
      price: oldProduct.inscription_price || 0,
      max_length: 50
    };
  }
  if (oldProduct.has_rental) {
    clientOptions.rental = {
      enabled: true,
      days: oldProduct.rental_days || 3,
      item: oldProduct.rental_item || '',
      keep_price_delta: oldProduct.keep_price_delta || 0
    };
  }
  if (oldProduct.allow_color_change) {
    clientOptions.color_change = {
      enabled: true
    };
  }

  return {
    title: oldProduct.title,
    slug: oldProduct.slug,
    article: oldProduct.sku || '',
    price: oldProduct.price,
    short_description: oldProduct.short_description || '',
    full_description: oldProduct.description || '',
    composition: compositionLines,
    category: oldProduct.category || '',
    character: oldProduct.character_name || '',
    age_group: oldProduct.age_group || '',
    tags: oldProduct.tags || [],
    photos: oldProduct.image_keys || [],
    main_photo: oldProduct.image_keys && oldProduct.image_keys[0] || null,
    budget: oldProduct.budget_group || '',
    series_name: oldProduct.series || '',
    occasion: oldProduct.occasion || '',
    target_audience: oldProduct.audience || '',
    seo_title: oldProduct.seo_title || '',
    seo_description: oldProduct.seo_description || '',
    client_options: clientOptions,
    scene: 'auto',
    status: 'published',
    show_on_site: true
  };
}

// Функция отправки POST запроса
function createProduct(product) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(transformProduct(product));
    
    const options = {
      hostname: WORKER_URL,
      path: '/api/products',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000 // 30 секунд таймаут
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.log(`   📡 Ответ (${res.statusCode}): ${body.substring(0, 200)}`);
        try {
          const data = JSON.parse(body);
          if (res.statusCode === 200 || res.statusCode === 201) {
            if (data.ok) {
              resolve(data);
            } else {
              reject(new Error(data.error || 'Неизвестная ошибка'));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.error || body}`));
          }
        } catch (e) {
          reject(new Error(`Ошибка парсинга ответа: ${body.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Сетевая ошибка: ${err.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Таймаут запроса (30 сек)'));
    });

    req.write(postData);
    req.end();
  });
}

// Миграция всех товаров последовательно
async function migrate() {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] Загружаю: "${product.title}"`);
    
    try {
      const result = await createProduct(product);
      console.log(`   ✅ Успешно (ID: ${result.id})`);
      success++;
    } catch (error) {
      console.error(`   ❌ Ошибка: ${error.message}`);
      failed++;
    }
    
    // Задержка между запросами
    if (i < products.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГИ МИГРАЦИИ:');
  console.log(`   ✅ Успешно мигрировано: ${success}`);
  console.log(`   ❌ Ошибок: ${failed}`);
  console.log(`   📦 Всего обработано: ${products.length}`);
  console.log('='.repeat(60) + '\n');

  if (failed === 0) {
    console.log('🎉 Миграция завершена успешно!');
    console.log('');
    console.log('📋 Следующие шаги:');
    console.log('   1. Откройте админ-панель: file:///c:/vigsharm-shop/admin/index.html');
    console.log('   2. Проверьте, что товары отображаются на вкладке "Товары"');
    console.log('   3. Обновите фронтенд для загрузки из Worker API');
  } else {
    console.log('⚠️  Миграция завершена с ошибками. Проверьте логи выше.');
  }
}

migrate().catch(err => {
  console.error('\n❌ Критическая ошибка миграции:', err.message);
  process.exit(1);
});
