$content = Get-Content "index.js" -Raw -Encoding UTF8

# Replace the old prompt with new simple one
$oldPattern = '  const enhancedPrompt = `\$\{analysisText\}\\n\\n\$\{basePrompt\}\$\{userPrompt \? ''\\n\\n[^`]+'' \+ userPrompt : ''''\}`;'
$newPrompt = @'
  const simplePrompt = `Professional product photography retouching for balloon catalog.

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
- ${scene === 'wall' ? 'Change background to clean white wall' : scene === 'floor' ? 'Change background to clean white floor and wall' : 'Change to neutral studio background'}
- Natural lighting
- Professional color balance

Keep it realistic, not 3D render. Natural balloon shine, soft shadows.${userPrompt ? '\n\nAdditional: ' + userPrompt : ''}`;
'@

$content = $content -replace $oldPattern, $newPrompt

# Replace prompt variable name
$content = $content -replace 'prompt: enhancedPrompt,', 'prompt: simplePrompt,'

Set-Content "index.js" -Value $content -NoNewline -Encoding UTF8

Write-Host "Fixed! Simple prompt applied."
