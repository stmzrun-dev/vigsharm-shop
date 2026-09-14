#!/usr/bin/env python3
# Remove duplicate old validation from worker/index.js

import re

with open('c:/vigsharm-shop/worker/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Split by lines
lines = content.split('\n')

# Find and remove lines 291-294 (old duplicate validation)
new_lines = []
skip = False
for i, line in enumerate(lines, 1):
    # Skip lines 291-294
    if i == 291 and 'Валидация формата изображения' in line:
        skip = True
        continue
    if skip and i <= 294:
        continue
    if i == 295:
        skip = False
    new_lines.append(line)

# Write back
with open('c:/vigsharm-shop/worker/index.js', 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(new_lines))

print('✅ Duplicate validation removed')
print('✅ Lines 291-294 deleted')
