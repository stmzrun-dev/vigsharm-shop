// Скрипт для проверки наличия модели remove-bg в NordRouter API
// Ничего не изменяет, не делает платных генераций
// Только получает информацию о доступной модели через /media/models

const API_KEY = process.env.NORDROUTER_API_KEY || '';

if (!API_KEY) {
  console.error('❌ ОШИБКА: API ключ не установлен');
  console.error('');
  console.error('Установите переменную окружения:');
  console.error('  set NORDROUTER_API_KEY=sk-nr-ваш-ключ && node check-remove-bg-model.js');
  process.exit(1);
}

async function checkRemoveBgModel() {
  console.log('🔍 Проверка доступности модели remove-bg в NordRouter API...\n');
  
  try {
    console.log('📡 Запрос списка моделей: GET https://nordrouter.com/media/models\n');
    
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
    console.log('🔎 ПОИСК МОДЕЛЕЙ ДЛЯ УДАЛЕНИЯ ФОНА');
    console.log('='.repeat(80));
    
    // Приоритетная модель для проверки
    const priorityModelId = 'image/recraft-remove-bg';
    
    // Поиск моделей для удаления фона
    const removeBgModels = models.filter(m => {
      const id = (m.id || '').toLowerCase();
      const label = (m.label || '').toLowerCase();
      const description = (m.description || '').toLowerCase();
      
      return (
        id.includes('remove-bg') ||
        id.includes('remove_bg') ||
        id.includes('removebg') ||
        id.includes('background-removal') ||
        label.includes('remove background') ||
        label.includes('background removal') ||
        description.includes('remove background') ||
        description.includes('transparent background')
      );
    });
    
    if (removeBgModels.length === 0) {
      console.log('\n❌ МОДЕЛИ ДЛЯ УДАЛЕНИЯ ФОНА НЕ НАЙДЕНЫ\n');
      console.log('Проверены критерии:');
      console.log('  - id содержит: remove-bg, remove_bg, removebg, background-removal');
      console.log('  - label содержит: remove background, background removal');
      console.log('  - description содержит: remove background, transparent background');
      console.log('\n='.repeat(80));
      console.log('ВЫВОД: B) Такой модели нет, нужно искать другой способ');
      console.log('='.repeat(80));
      return;
    }
    
    console.log(`\n✅ НАЙДЕНО МОДЕЛЕЙ: ${removeBgModels.length}\n`);
    
    // Проверка приоритетной модели
    const priorityModel = removeBgModels.find(m => m.id === priorityModelId);
    
    if (priorityModel) {
      console.log(`🎯 НАЙДЕНА ПРИОРИТЕТНАЯ МОДЕЛЬ: ${priorityModelId}\n`);
      printModelDetails(priorityModel, true);
    }
    
    // Вывод всех найденных моделей
    console.log('\n' + '='.repeat(80));
    console.log('📋 ВСЕ НАЙДЕННЫЕ МОДЕЛИ ДЛЯ УДАЛЕНИЯ ФОНА');
    console.log('='.repeat(80));
    
    removeBgModels.forEach((model, index) => {
      console.log(`\n${index + 1}. ${model.id}`);
      console.log('-'.repeat(80));
      printModelDetails(model, false);
    });
    
    // Финальный вывод
    console.log('\n' + '='.repeat(80));
    console.log('📊 ИТОГОВЫЙ ВЫВОД');
    console.log('='.repeat(80));
    
    if (priorityModel) {
      console.log('\n✅ A) МОЖНО ИСПОЛЬЗОВАТЬ NordRouter remove-bg');
      console.log(`\nРекомендуемая модель: ${priorityModelId}`);
      console.log(`Стоимость: ${priorityModel.price || 'N/A'}`);
      
      if (priorityModel.fields && Array.isArray(priorityModel.fields)) {
        const imageField = priorityModel.fields.find(f => 
          f.name && f.name.toLowerCase().includes('image')
        );
        if (imageField) {
          console.log(`\nПример использования:`);
          console.log(`{`);
          console.log(`  "model": "${priorityModelId}",`);
          console.log(`  "input": {`);
          console.log(`    "${imageField.name}": "https://example.com/image.jpg"`);
          console.log(`  }`);
          console.log(`}`);
        }
      }
    } else {
      console.log(`\n⚠️  Приоритетная модель ${priorityModelId} не найдена`);
      console.log(`Но найдены другие модели (${removeBgModels.length})`);
      console.log('\nРекомендация: проверить каждую модель вручную');
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

function printModelDetails(model, detailed = false) {
  console.log(`1. Model ID: ${model.id}`);
  console.log(`2. Label: ${model.label || 'N/A'}`);
  console.log(`3. Description: ${model.description || 'N/A'}`);
  console.log(`4. Mode: ${model.mode || 'N/A'}`);
  console.log(`10. Стоимость (est_usd): ${model.price || model.est_usd || 'N/A'}`);
  
  if (model.fields && Array.isArray(model.fields)) {
    console.log(`\n5. Полный список полей/input parameters (${model.fields.length}):`);
    
    model.fields.forEach((field, i) => {
      console.log(`\n   ${i + 1}. ${field.name || 'unnamed'}`);
      console.log(`      - type: ${field.type || 'N/A'}`);
      console.log(`      - required: ${field.required ? 'YES' : 'NO'}`);
      if (field.label) console.log(`      - label: ${field.label}`);
      if (field.description) console.log(`      - description: ${field.description}`);
      if (field.default !== undefined) console.log(`      - default: ${field.default}`);
    });
    
    // Пример ожидаемого input
    console.log(`\n6. Пример ожидаемого input:`);
    const exampleInput = {};
    model.fields.forEach(field => {
      if (field.required || field.name) {
        const fieldName = field.name || 'field';
        if (field.type === 'string' && fieldName.toLowerCase().includes('image')) {
          exampleInput[fieldName] = 'https://example.com/image.jpg';
        } else if (field.type === 'string') {
          exampleInput[fieldName] = field.default || 'example value';
        } else if (field.type === 'number' || field.type === 'integer') {
          exampleInput[fieldName] = field.default || 1;
        } else if (field.type === 'boolean') {
          exampleInput[fieldName] = field.default !== undefined ? field.default : true;
        } else {
          exampleInput[fieldName] = field.default || null;
        }
      }
    });
    console.log(JSON.stringify(exampleInput, null, 2));
  } else {
    console.log(`\n5. Полный список полей: отсутствуют или неверный формат`);
  }
  
  // Проверка формата результата
  console.log(`\n7. Формат результата: ${model.output_type || 'image (предположительно)'}`);
  console.log(`8. Возвращается ли result_url: ${model.mode === 'async' ? 'ДА (async mode)' : 'возможно (зависит от mode)'}`);
  console.log(`9. Есть ли прозрачный alpha-канал: ТРЕБУЕТСЯ РУЧНАЯ ПРОВЕРКА (обычно да для remove-bg)`);
}

checkRemoveBgModel();
