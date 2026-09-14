#!/usr/bin/env python3
import re

with open('c:/vigsharm-shop/worker/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find and remove the duplicate validation block
# Looking for the Russian comment followed by the old if block
pattern = r'\n  // Валидация формата изображения\n  if \(!image_url \|\| !image_url\.startsWith\(\'data:image/\'\)\) \{\n    return json\(\{ ok: false, error: \'Invalid image format\. Expected data:image/\.\.\. URL\' \}, 400\);\n  \}\n'

# Remove the pattern
new_content = re.sub(pattern, '\n', content)

# Write back
with open('c:/vigsharm-shop/worker/index.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('✅ Duplicate removed with regex')
