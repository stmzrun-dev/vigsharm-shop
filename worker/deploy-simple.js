#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('\n🚀 Deploying VigSharm Worker to Cloudflare...\n');

const wrangler = spawn('npx', ['wrangler', 'deploy'], {
  cwd: path.join(__dirname),
  stdio: 'inherit',
  shell: true
});

wrangler.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Deployment successful!\n');
  } else {
    console.log(`\n❌ Deployment failed with code ${code}\n`);
  }
  process.exit(code);
});

wrangler.on('error', (err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
