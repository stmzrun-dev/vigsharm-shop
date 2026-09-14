#!/usr/bin/env python3
# Remove duplicate old validation from worker/index.js

with open('c:/vigsharm-shop/worker/index.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove lines with old validation (starting from line 290, 0-indexed = 290)
# We need to remove the comment + if block (4 lines total)
output_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Check if this is the duplicate validation comment
    if i >= 290 and 'Валидация формата изображения' in line:
        # Skip this line and next 3 lines (if block)
        if i + 3 < len(lines) and 'startsWith' in lines[i+1] and 'Expected data:image' in lines[i+2]:
            i += 4  # Skip 4 lines
            continue
    output_lines.append(line)
    i += 1

# Write back
with open('c:/vigsharm-shop/worker/index.js', 'w', encoding='utf-8', newline='') as f:
    f.writelines(output_lines)

print('✅ Duplicate validation removed')
