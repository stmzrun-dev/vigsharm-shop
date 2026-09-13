// Простой скрипт для деплоя через wrangler без зависания
const { execSync } = require('child_process');

console.log('🚀 Deploying worker...');

try {
  // Запускаем wrangler deploy с таймаутом
  execSync('npx wrangler deploy', {
    cwd: __dirname,
    stdio: 'inherit',
    timeout: 60000, // 60 секунд
    windowsHide: true
  });
  console.log('✅ Deploy successful!');
  process.exit(0);
} catch (error) {
  if (error.killed) {
    console.error('❌ Deploy timeout after 60 seconds');
  } else {
    console.error('❌ Deploy failed:', error.message);
  }
  process.exit(1);
}
