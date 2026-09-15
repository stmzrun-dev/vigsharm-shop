// Тестирование endpoint /check-model для получения fields edit-моделей
// Использует production Worker на vigsharm-api.vigsharm.workers.dev

const WORKER_URL = 'https://vigsharm-api.vigsharm.workers.dev/check-model';

async function testCheckModel() {
  console.log('🔍 Запрос к Worker API: /check-model');
  console.log('URL:', WORKER_URL);
  console.log('');
  
  try {
    const response = await fetch(WORKER_URL);
    
    if (!response.ok) {
      console.error('❌ HTTP Error:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      console.error('❌ API Error:', data.error || 'Unknown error');
      return;
    }
    
    console.log('✅ Успешно получен ответ');
    console.log('');
    console.log('📊 Статистика:');
    console.log('  Всего моделей:', data.total_models);
    console.log('  Проверено:', data.searched_models);
    console.log('  Найдено:', data.found_count);
    console.log('');
    
    // Выводим каждую модель
    const modelIds = [
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
    
    modelIds.forEach(modelId => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📦 ' + modelId);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      const model = data.models[modelId];
      
      if (!model) {
        console.log('❌ Модель не найдена в списке NordRouter');
        console.log('');
        return;
      }
      
      const fields = model.fields || {};
      console.log('');
      console.log('🔑 Ключевые поля для edit:');
      console.log('  image (основное):', fields.image ? '✅' : '❌');
      console.log('  image2 (второе):', fields.image2 ? '✅ ПОДДЕРЖИВАЕТСЯ' : '❌');
      console.log('  reference:', fields.reference ? '✅ ПОДДЕРЖИВАЕТСЯ' : '❌');
      console.log('  mask:', fields.mask ? '✅ ПОДДЕРЖИВАЕТСЯ' : '❌');
      console.log('  attachments:', fields.attachments ? '✅ ПОДДЕРЖИВАЕТСЯ' : '❌');
      console.log('');
      
      console.log('📋 Все fields:');
      console.log(JSON.stringify(fields, null, 2));
      console.log('');
      
      console.log('📦 Полная запись модели:');
      console.log(JSON.stringify(model.full_record, null, 2));
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error(error.stack);
  }
}

testCheckModel();
