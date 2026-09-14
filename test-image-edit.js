// Тест обработки фото через image/nano-banana-edit
const API_KEY = process.env.NORDROUTER_API_KEY || 'sk-nr-ваш-ключ';
const TEST_IMAGE = 'https://raw.githubusercontent.com/stmzrun-dev/vigsharm-shop/main/public/balloons-sample.jpg';

async function testImageEdit() {
  console.log('🧪 Тест: image/nano-banana-edit\n');
  
  // 1. Создаем задачу
  console.log('📤 Отправка задачи...');
  const createRes = await fetch('https://nordrouter.com/media/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'image/nano-banana-edit',
      input: {
        prompt: 'Замени фон на белую стену с деревянным полом. Сохрани все шары без изменений.',
        image: TEST_IMAGE
      }
    })
  });
  
  const createData = await createRes.json();
  console.log('✅ Задача создана:', createData.id);
  console.log('Модель:', createData.model);
  
  if (!createData.id) {
    console.error('❌ Ошибка:', createData);
    return;
  }
  
  // 2. Ждем результат
  console.log('\n⏳ Ожидание обработки...');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    
    const statusRes = await fetch(`https://nordrouter.com/media/job/${createData.id}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    const statusData = await statusRes.json();
    
    console.log(`Попытка ${i + 1}/60: ${statusData.status}`);
    
    if (statusData.status === 'done') {
      console.log('\n✅ ГОТОВО!');
      console.log('result_url:', statusData.result_url);
      console.log('Стоимость:', statusData.cost_usd, 'USD');
      
      // Скачиваем и проверяем размер
      const imgRes = await fetch(statusData.result_url, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      const blob = await imgRes.blob();
      console.log('Размер файла:', blob.size, 'байт');
      console.log('Тип:', blob.type);
      
      return;
    }
    
    if (statusData.status === 'failed') {
      console.error('❌ Обработка провалилась:', statusData.error);
      return;
    }
  }
  
  console.error('⏱️ Таймаут (3 минуты)');
}

testImageEdit().catch(console.error);
