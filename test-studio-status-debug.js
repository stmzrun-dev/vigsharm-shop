/**
 * Тест для отладки проблемы с 5-м запросом Studio Status
 * 
 * Воспроизводит сценарий:
 * 1. Первые 4 запроса успешны (status: processing)
 * 2. 5-й запрос возвращает 500 Internal Server Error
 */

const WORKER_URL = 'https://vigsharm-api.vigsharm.workers.dev';
const JOB_ID = '0a0a7efc-8dc1-4fa3-abb7-777f3035d403'; // Реальный job_id из проблемного запроса

async function testStudioStatus() {
  console.log('🔍 Testing Studio Status endpoint...\n');
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`Job ID: ${JOB_ID}\n`);
  
  for (let i = 1; i <= 6; i++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Attempt ${i}/6`);
    console.log('='.repeat(60));
    
    try {
      const url = `${WORKER_URL}/api/studio/status/${JOB_ID}`;
      console.log(`→ GET ${url}`);
      
      const startTime = Date.now();
      const response = await fetch(url);
      const duration = Date.now() - startTime;
      
      console.log(`← HTTP ${response.status} ${response.statusText} (${duration}ms)`);
      console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));
      
      let body;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        body = await response.json();
        console.log(`   Body:`, JSON.stringify(body, null, 2));
      } else {
        const text = await response.text();
        console.log(`   Body (text):`, text);
        body = text;
      }
      
      // Если получили 500 - это то, что нам нужно
      if (response.status === 500) {
        console.log('\n❌ FOUND THE ERROR!');
        console.log('   This is the 500 error we are debugging.');
        console.log('   Error details:', body);
        break;
      }
      
      // Если статус done - задача завершена
      if (body.status === 'done') {
        console.log('\n✅ Job completed successfully!');
        break;
      }
      
    } catch (error) {
      console.error(`\n❌ Request failed:`, error.message);
      console.error('   Stack:', error.stack);
    }
    
    // Ждём 3 секунды перед следующей попыткой (как в реальном polling)
    if (i < 6) {
      console.log(`\n⏳ Waiting 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test completed');
  console.log('='.repeat(60));
}

// Запуск теста
testStudioStatus().catch(console.error);
