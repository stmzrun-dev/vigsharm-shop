// Скрипт для проверки полей image-edit моделей в NordRouter API
// 
// СПОСОБ 1 (рекомендуется): Через переменную окружения
//   set NORDROUTER_API_KEY=sk-nr-ваш-ключ && node check-edit-models.js
//
// СПОСОБ 2: Временно вставьте ключ ниже в строку API_KEY_HARDCODED
//   const API_KEY_HARDCODED = 'sk-nr-ваш-ключ';

const API_KEY_HARDCODED = ''; // ← Временно вставьте сюда ключ для тестирования

const API_KEY = process.env.NORDROUTER_API_KEY || API_KEY_HARDCODED;

if (!API_KEY || API_KEY === 'sk-nr-ваш-ключ') {
  console.error('❌ ОШИБКА: API ключ не установлен');
  console.error('');
  console.error('СПОСОБ 1: Установите переменную окружения:');
  console.error('  set NORDROUTER_API_KEY=sk-nr-ваш-ключ && node check-edit-models.js');
  console.error('');
  console.error('СПОСОБ 2: Временно вставьте ключ в строку API_KEY_HARDCODED внутри файла');
  console.error('  (строка 10)');
  process.exit(1);
}

const TARGET_MODELS = [
  'image/gpt-image-2-edit',
  'image/gpt-image-1.5-edit',
  'image/flux2-pro-edit',
  'image/seedream-5.0-pro-edit',
  'image/seedream-4.5-edit',
  'image/seedream-edit',
  'image/qwen3-pro-edit',
  'image/qwen3-edit',
  'image/qwen-edit',
  'image/grok-edit'
];

async function fetchModels() {
  console.log('🔍 Запрос списка моделей из NordRouter API...\n');
  
  try {
    const response = await fetch('https://nordrouter.com/media/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Определяем структуру ответа
    let models = [];
    if (Array.isArray(data)) {
      models = data;
    } else if (data.models && Array.isArray(data.models)) {
      models = data.models;
    } else {
      console.error('❌ Неожиданная структура ответа:', Object.keys(data));
      return;
    }

    console.log(`✅ Получено ${models.length} моделей\n`);
    console.log('='.repeat(80));
    
    // Фильтруем и выводим информацию по каждой модели
    TARGET_MODELS.forEach((modelId, index) => {
      const model = models.find(m => m.id === modelId);
      
      console.log(`\n${index + 1}. МОДЕЛЬ: ${modelId}`);
      console.log('-'.repeat(80));
      
      if (!model) {
        console.log('❌ МОДЕЛЬ НЕ НАЙДЕНА В СПИСКЕ');
        return;
      }
      
      console.log(`ID: ${model.id}`);
      console.log(`Label: ${model.label || 'N/A'}`);
      console.log(`Mode: ${model.mode || 'N/A'}`);
      console.log(`Price: ${model.price || 'N/A'}`);
      
      if (model.fields && Array.isArray(model.fields)) {
        console.log(`\nFIELDS (${model.fields.length}):`);
        console.log(JSON.stringify(model.fields, null, 2));
        
        // Анализ полей для второго изображения
        const secondImageFields = model.fields.filter(f => 
          f.name && (
            f.name.toLowerCase().includes('image2') ||
            f.name.toLowerCase().includes('second') ||
            f.name.toLowerCase().includes('reference') ||
            f.name.toLowerCase().includes('mask') ||
            f.name.toLowerCase().includes('input_images') ||
            f.name.toLowerCase().includes('attachments')
          )
        );
        
        if (secondImageFields.length > 0) {
          console.log('\n🎯 ПОЛЯ ДЛЯ ВТОРОГО ИЗОБРАЖЕНИЯ:');
          secondImageFields.forEach(f => {
            console.log(`  - ${f.name} (${f.type}) ${f.required ? '[REQUIRED]' : '[OPTIONAL]'}`);
            if (f.label) console.log(`    Label: ${f.label}`);
            if (f.description) console.log(`    Description: ${f.description}`);
          });
        } else {
          console.log('\n⚠️  НЕТ ПОЛЕЙ ДЛЯ ВТОРОГО ИЗОБРАЖЕНИЯ');
        }
      } else {
        console.log('\nFIELDS: отсутствуют или неверный формат');
      }
    });
    
    // Таблица сравнения
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 СРАВНИТЕЛЬНАЯ ТАБЛИЦА');
    console.log('='.repeat(80));
    console.log('');
    console.log('| Модель | Цена | Второе изображение | Reference | Mask | Подходит для VigSharm |');
    console.log('|--------|------|-------------------|-----------|------|-----------------------|');
    
    TARGET_MODELS.forEach(modelId => {
      const model = models.find(m => m.id === modelId);
      
      if (!model) {
        console.log(`| ${modelId.padEnd(30)} | N/A | ❌ | ❌ | ❌ | ❌ |`);
        return;
      }
      
      const price = model.price || 'N/A';
      let hasImage2 = '❌';
      let hasReference = '❌';
      let hasMask = '❌';
      let suitable = '❌';
      
      if (model.fields && Array.isArray(model.fields)) {
        const fieldNames = model.fields.map(f => f.name ? f.name.toLowerCase() : '');
        
        if (fieldNames.some(n => n.includes('image2') || n.includes('second'))) hasImage2 = '✅';
        if (fieldNames.some(n => n.includes('reference'))) hasReference = '✅';
        if (fieldNames.some(n => n.includes('mask'))) hasMask = '✅';
        
        // Подходит, если есть хотя бы одно поле для второго изображения
        if (hasImage2 === '✅' || hasReference === '✅') {
          suitable = '✅';
        }
      }
      
      const shortName = modelId.replace('image/', '');
      console.log(`| ${shortName.padEnd(30)} | ${String(price).padEnd(8)} | ${hasImage2.padEnd(18)} | ${hasReference.padEnd(9)} | ${hasMask.padEnd(4)} | ${suitable.padEnd(21)} |`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Анализ завершен');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

fetchModels();
