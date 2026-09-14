#!/usr/bin/env python3

with open('c:/vigsharm-shop/worker/index.js', 'rb') as f:
    lines = f.readlines()

# Remove lines 291-294 (0-indexed: 290-293)
# Line 291: comment with cyrillic
# Line 292-294: if block
output_lines = lines[:290] + lines[294:]

with open('c:/vigsharm-shop/worker/index.js', 'wb') as f:
    f.writelines(output_lines)

print('✅ Lines 291-294 removed by index')
print(f'✅ Total lines before: {len(lines)}')
print(f'✅ Total lines after: {len(output_lines)}')
