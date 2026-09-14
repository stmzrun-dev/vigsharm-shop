const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Worker deployment...\n');

const logFile = path.join(__dirname, 'deploy.log');
const cmd = 'npx wrangler deploy';

const child = exec(cmd, {
  cwd: __dirname,
  maxBuffer: 1024 * 1024 * 10 // 10MB buffer
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  output += text;
});

child.stderr.on('data', (data) => {
  const text = data.toString();
  process.stderr.write(text);
  output += text;
});

child.on('close', (code) => {
  fs.writeFileSync(logFile, output);
  console.log(`\n📝 Log saved to: ${logFile}\n`);
  
  if (code === 0) {
    console.log('✅ Deployment successful!\n');
    console.log('Next steps:');
    console.log('1. Open: https://dash.cloudflare.com');
    console.log('2. Check Worker metrics');
    console.log('3. Test API endpoints\n');
  } else {
    console.log(`❌ Deployment failed with code ${code}\n`);
    console.log(`Check logs: ${logFile}\n`);
  }
  
  process.exit(code);
});

child.on('error', (err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});

// Timeout после 2 минут
setTimeout(() => {
  console.log('\n⏱️  Deployment taking too long, but may still complete in background');
  console.log('Check Cloudflare Dashboard manually\n');
  child.kill();
  process.exit(0);
}, 120000);
