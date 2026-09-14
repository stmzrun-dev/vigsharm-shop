$lines = Get-Content "index.js" -Encoding UTF8

# Find line 372 (index 371) and replace it with multiline prompt
$newPrompt = @"
  const simplePrompt = ``Professional product photography retouching for balloon catalog.

KEEP UNCHANGED:
- All balloons, their colors, numbers, and designs (Marvel characters, football patterns, etc.)
- All text and prints on balloons
- Product composition and arrangement
- Quantity of items

REMOVE:
- Store logos and watermarks (sharomem.ru, sharomen.ru, etc.)
- Contact information
- Background text that is not part of balloons

IMPROVE:
- `${scene === 'wall' ? 'Change background to clean white wall' : scene === 'floor' ? 'Change background to clean white floor and wall' : 'Change to neutral studio background'}
- Natural lighting
- Professional color balance

Keep it realistic, not 3D render. Natural balloon shine, soft shadows.`${userPrompt ? '\n\nAdditional: ' + userPrompt : ''}```;
"@

$lines[371] = $newPrompt
$lines | Set-Content "index.js" -Encoding UTF8

Write-Host "Updated line 372 with full prompt!"
