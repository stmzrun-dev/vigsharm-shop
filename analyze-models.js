// Анализ моделей NordRouter для поиска remove-bg
const fs = require('fs');

console.log('🔍 Анализ моделей NordRouter для поиска remove-bg...\n');

// Читаем полученный список моделей
const data = JSON.parse(fs.readFileSync('models-response.json', 'utf8'));

if (!data.ok) {
  console.error('❌ Ошибка в данных:', data.error);
  process.exit(1);
}

const models = data.models || [];
console.log(`📊 Всего моделей: ${models.length}\n`);

// Критерии поиска
const searchTerms = {
  id: ['remove-bg', 'remove_bg', 'removebg', 'background-removal', 'recraft-remove-bg'],
  label: ['remove background', 'background removal', 'remove bg', 'transparent'],
  desc: ['remove background', 'transparent background', 'удаление фона', 'прозрачный фон']
};

// Поиск моделей
const foundModels = [];

for (const model of models) {
  const id = (model.id || '').toLowerCase();
  const label = (model.label || '').toLowerCase();
  const desc = (model.desc || '').toLowerCase();
  
  // Проверка по ID
  const matchId = searchTerms.id.some(term => id.includes(term));
  
  // Проверка по Label
  const matchLabel = searchTerms.label.some(term => label.includes(term));
  
  // Проверка по Description
  const matchDesc = searchTerms.desc.some(term => desc.includes(term));
  
  if (matchId || matchLabel || matchDesc) {
    foundModels.push({
      model,
      matchType: matchId ? 'ID' : matchLabel ? 'Label' : 'Description'
    });
  }
}

console.log(`🎯 Найдено моделей с remove-bg: ${foundModels.length}\n`);

if (foundModels.length === 0) {
  console.log('❌ B) МОДЕЛЬ REMOVE-BG НЕ НАЙДЕНА В NORDROUTER\n');
  console.log('Альтернативные варианты:');
  console.log('  1. Remove.bg API (https://remove.bg)');
  console.log('  2. Cloudinary AI Background Removal');
  console.log('  3. ClipDrop API');
  console.log('  4. PhotoRoom API\n');
  
  // Поиск моделей с "mask" или "inpaint"
  console.log('🔍 Проверка моделей с поддержкой масок (альтернатива):');
  const maskModels = models.filter(m => {
    const id = (m.id || '').toLowerCase();
    const label = (m.label || '').toLowerCase();
    const desc = (m.desc || '').toLowerCase();
    return id.includes('mask') || id.includes('inpaint') || 
           label.includes('mask') || label.includes('inpaint') ||
           desc.includes('mask') || desc.includes('inpaint');
  });
  
  if (maskModels.length > 0) {
    console.log(`\nНайдено ${maskModels.length} моделей с масками:`);
    maskModels.slice(0, 5).forEach(m => {
      console.log(`  - ${m.id}: ${m.label}`);
    });
  }
  
} else {
  console.log('✅ A) МОЖНО ИСПОЛЬЗОВАТЬ NORDROUTER REMOVE-BG\n');
  console.log('='.repeat(80));
  
  foundModels.forEach((item, index) => {
    const model = item.model;
    console.log(`\n📦 Модель ${index + 1} (совпадение по ${item.matchType}):\n`);
    
    console.log(`1. Model ID: ${model.id}`);
    console.log(`2. Label: ${model.label}`);
    console.log(`3. Description: ${model.desc || 'Нет описания'}`);
    console.log(`4. Mode: ${model.mode}`);
    console.log(`5. Type: ${model.type}`);
    
    console.log(`\n6. Input Fields:`);
    if (model.fields && model.fields.length > 0) {
      model.fields.forEach(field => {
        const required = field.required ? '[REQUIRED]' : '[OPTIONAL]';
        console.log(`   - ${field.name} (${field.type}) ${required}`);
        console.log(`     Label: ${field.label}`);
        if (field.options) {
          console.log(`     Options: ${field.options.join(', ')}`);
        }
        if (field.default !== undefined) {
          console.log(`     Default: ${field.default}`);
        }
      });
    } else {
      console.log('   Нет полей (возможно, только изображение на входе)');
    }
    
    console.log(`\n7. Пример ожидаемого input:`);
    const exampleInput = {
      model: model.id,
      input: {}
    };
    
    if (model.fields) {
      model.fields.forEach(field => {
        if (field.required) {
          if (field.type === 'image') {
            exampleInput.input[field.name] = 'https://example.com/image.jpg';
          } else if (field.type === 'text' || field.type === 'textarea') {
            exampleInput.input[field.name] = field.placeholder || 'example text';
          } else if (field.type === 'select' && field.default) {
            exampleInput.input[field.name] = field.default;
          } else if (field.type === 'bool' && field.default !== undefined) {
            exampleInput.input[field.name] = field.default;
          }
        }
      });
    }
    
    console.log(JSON.stringify(exampleInput, null, 2));
    
    console.log(`\n8. Формат результата: ${model.type} (PNG/JPEG)`);
    console.log(`9. result_url: ✅ Да (стандартный формат NordRouter API)`);
    console.log(`10. Прозрачный alpha-канал: ⚠️  Требуется проверка после генерации`);
    console.log(`11. Стоимость (est_usd): $${model.est_usd}`);
    
    console.log(`\n${'='.repeat(80)}`);
  });
  
  console.log('\n📋 Рекомендация:');
  const bestModel = foundModels[0].model;
  console.log(`   Использовать модель: ${bestModel.id}`);
  console.log(`   Стоимость: $${bestModel.est_usd}`);
  console.log(`   Endpoint: POST https://nordrouter.com/media/generate`);
}

console.log('\n✅ Анализ завершен.\n');
