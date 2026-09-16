const fs = require('fs');
const path = require('path');

console.log('🔍 ПРОВЕРКА ALPHA-КАНАЛА В PNG\n');

const filePath = path.join(__dirname, 'test-results', 'result-no-bg.png');

// Читаем первые байты PNG
const buffer = fs.readFileSync(filePath);

// Проверяем PNG signature
const isPNG = buffer[0] === 0x89 && 
              buffer[1] === 0x50 && 
              buffer[2] === 0x4E && 
              buffer[3] === 0x47;

console.log(`✅ Формат файла: ${isPNG ? 'PNG' : 'НЕ PNG'}`);
console.log(`📦 Размер файла: ${(buffer.length / 1024).toFixed(2)} KB`);

// Ищем IHDR chunk для определения color type
let pos = 8; // skip PNG signature
while (pos < buffer.length) {
  const length = buffer.readUInt32BE(pos);
  const type = buffer.toString('ascii', pos + 4, pos + 8);
  
  if (type === 'IHDR') {
    const width = buffer.readUInt32BE(pos + 8);
    const height = buffer.readUInt32BE(pos + 12);
    const bitDepth = buffer[pos + 16];
    const colorType = buffer[pos + 17];
    
    console.log(`📐 Размеры: ${width}x${height}px`);
    console.log(`🎨 Bit Depth: ${bitDepth}`);
    console.log(`🎨 Color Type: ${colorType}`);
    
    // Color types:
    // 0 = Grayscale
    // 2 = RGB
    // 3 = Indexed (palette)
    // 4 = Grayscale + Alpha
    // 6 = RGBA (RGB + Alpha)
    
    const hasAlpha = colorType === 4 || colorType === 6;
    console.log(`\n${hasAlpha ? '✅' : '❌'} Alpha-канал: ${hasAlpha ? 'ПРИСУТСТВУЕТ' : 'ОТСУТСТВУЕТ'}`);
    
    if (hasAlpha) {
      console.log('   Тип: ' + (colorType === 6 ? 'RGBA (полноцветный с прозрачностью)' : 'Grayscale с Alpha'));
    }
    
    break;
  }
  
  pos += 12 + length; // length + type (4+4) + data (length) + CRC (4)
}

console.log('\n✅ Проверка завершена!');
