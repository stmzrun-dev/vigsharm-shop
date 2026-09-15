const WORKER_URL = 'https://vigsharm-api.vigsharm.workers.dev';

async function checkRemoveBg() {
  const btn = document.getElementById('checkBtn');
  const result = document.getElementById('result');
  
  btn.disabled = true;
  btn.innerHTML = 'Проверка... <span class="loading"></span>';
  result.innerHTML = '📡 Запрос списка моделей из NordRouter...\n';
  result.className = '';

  try {
    const response = await fetch(`${WORKER_URL}/check-model`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Неизвестная ошибка');
    }

    const models = data.models || [];
    result.innerHTML = `✅ Получено ${models.length} моделей\n\n`;
    result.innerHTML += '='.repeat(80) + '\n';
    result.innerHTML += '🔎 ПОИСК МОДЕЛЕЙ ДЛЯ УДАЛЕНИЯ ФОНА\n';
    result.innerHTML += '='.repeat(80) + '\n\n';

    const removeBgModels = models.filter(m => {
      const id = (m.id || '').toLowerCase();
      const label = (m.label || '').toLowerCase();
      const description = (m.description || '').toLowerCase();
      
      return (
        id.includes('remove-bg') || id.includes('remove_bg') || id.includes('removebg') ||
        id.includes('background-removal') || label.includes('remove background') ||
        label.includes('background removal') || description.includes('remove background') ||
        description.includes('transparent background')
      );
    });

    if (removeBgModels.length === 0) {
      result.innerHTML += '❌ МОДЕЛИ ДЛЯ УДАЛЕНИЯ ФОНА НЕ НАЙДЕНЫ\n\n';
      result.innerHTML += 'Проверены критерии:\n';
      result.innerHTML += '  - id содержит: remove-bg, remove_bg, removebg, background-removal\n';
      result.innerHTML += '  - label содержит: remove background, background removal\n';
      result.innerHTML += '  - description содержит: remove background, transparent background\n\n';
      result.innerHTML += '='.repeat(80) + '\n';
      result.innerHTML += '📊 ВЫВОД: B) Такой модели нет, нужно искать другой способ\n';
      result.innerHTML += '='.repeat(80) + '\n';
      result.className = 'error';
      btn.disabled = false;
      btn.innerHTML = 'Проверить ещё раз';
      return;
    }

    result.innerHTML += `✅ НАЙДЕНО МОДЕЛЕЙ: ${removeBgModels.length}\n\n`;
    result.className = 'success';

    const priorityModelId = 'image/recraft-remove-bg';
    const priorityModel = removeBgModels.find(m => m.id === priorityModelId);

    if (priorityModel) {
      result.innerHTML += `🎯 НАЙДЕНА ПРИОРИТЕТНАЯ МОДЕЛЬ: ${priorityModelId}\n\n`;
      result.innerHTML += formatModelDetails(priorityModel);
    }

    result.innerHTML += '\n' + '='.repeat(80) + '\n';
    result.innerHTML += '📋 ВСЕ НАЙДЕННЫЕ МОДЕЛИ ДЛЯ УДАЛЕНИЯ ФОНА\n';
    result.innerHTML += '='.repeat(80) + '\n';

    removeBgModels.forEach((model, index) => {
      result.innerHTML += `\n${index + 1}. ${model.id}\n`;
      result.innerHTML += '-'.repeat(80) + '\n';
      result.innerHTML += formatModelDetails(model);
    });

    result.innerHTML += '\n' + '='.repeat(80) + '\n';
    result.innerHTML += '📊 ИТОГОВЫЙ ВЫВОД\n';
    result.innerHTML += '='.repeat(80) + '\n\n';

    if (priorityModel) {
      result.innerHTML += '✅ A) МОЖНО ИСПОЛЬЗОВАТЬ NordRouter remove-bg\n\n';
      result.innerHTML += `Рекомендуемая модель: ${priorityModelId}\n`;
      result.innerHTML += `Стоимость: ${priorityModel.price || 'N/A'}\n\n`;
    } else {
      result.innerHTML += `⚠️ Приоритетная модель ${priorityModelId} не найдена\n`;
      result.innerHTML += `Но найдены другие модели (${removeBgModels.length})\n`;
    }

    result.innerHTML += '\n' + '='.repeat(80) + '\n';

  } catch (error) {
    result.innerHTML = `❌ ОШИБКА: ${error.message}\n\n`;
    result.innerHTML += 'Возможные причины:\n';
    result.innerHTML += '1. Worker не запущен или недоступен\n';
    result.innerHTML += '2. API ключ не установлен в Worker secrets\n';
    result.innerHTML += '3. Проблемы с сетью\n';
    result.className = 'error';
  }

  btn.disabled = false;
  btn.innerHTML = 'Проверить ещё раз';
}

function formatModelDetails(model) {
  let output = `1. Model ID: ${model.id}\n`;
  output += `2. Label: ${model.label || 'N/A'}\n`;
  output += `3. Description: ${model.description || 'N/A'}\n`;
  output += `4. Mode: ${model.mode || 'N/A'}\n`;
  output += `10. Стоимость: ${model.price || model.est_usd || 'N/A'}\n`;

  if (model.fields && Array.isArray(model.fields)) {
    output += `\n5. Полный список полей (${model.fields.length}):\n`;
    model.fields.forEach((f, i) => {
      output += `\n   ${i+1}. ${f.name || 'unnamed'}\n`;
      output += `      - type: ${f.type || 'N/A'}\n`;
      output += `      - required: ${f.required ? 'YES' : 'NO'}\n`;
      if (f.label) output += `      - label: ${f.label}\n`;
      if (f.description) output += `      - description: ${f.description}\n`;
    });
  } else {
    output += `\n5. Полный список полей: отсутствуют\n`;
  }

  output += `\n7. Формат результата: ${model.output_type || 'image'}\n`;
  output += `8. result_url: ${model.mode === 'async' ? 'ДА' : 'возможно'}\n`;
  output += `9. Прозрачный фон: требуется проверка (обычно да для remove-bg)\n`;

  return output;
}
