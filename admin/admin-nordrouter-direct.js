// VigSharm Admin - NordRouter Direct Integration
// Прямая работа с NordRouter API без Worker посредника
// Документация: https://nordrouter.com/docs/guide/media

Object.assign(app, {
  // Базовый URL для NordRouter API
  nordrouterBaseUrl: 'https://nordrouter.com',
  
  // Проверка наличия ключа
  checkNordrouterKey() {
    if (!this.nordrouterKey || !this.nordrouterKey.startsWith('sk-nr-')) {
      this.toast('⚠️ Введите NordRouter API ключ в настройках', 'error');
      this.switchTab('settings');
      return false;
    }
    return true;
  },

  // === STUDIO PRO: Обработка изображений через NordRouter ===
  async processStudioProDirect() {
    if (this.currentProduct.photos.length === 0) {
      this.toast('Загрузите хотя бы одно фото', 'error');
      return;
    }

    if (!this.checkNordrouterKey()) return;

    const btn = document.getElementById('process-studio-btn');
    const statusEl = document.getElementById('studio-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Обработка...';

    try {
      const photo = this.currentProduct.photos[0];
      statusEl.textContent = '📤 Отправка фото в NordRouter...';

      // Определяем промпт по сцене
      const scenePrompts = {
        'auto': 'убрать фон на белый',
        'unit_balloon': 'убрать фон на белый, только стена без пола',
        'handheld_bouquet': 'убрать фон на белый, букет в руке',
        'wall_only': 'убрать фон на белый, только стена',
        'floor': 'заменить фон на стену с плинтусом и ламинатом',
        'photozone': 'заменить фон на полный интерьер с декором'
      };

      const prompt = scenePrompts[this.currentProduct.scene] || 'убрать фон на белый';

      console.log('Studio Pro: sending request', { scene: this.currentProduct.scene, prompt });

      // Запрос к NordRouter media/generate
      const response = await fetch(`${this.nordrouterBaseUrl}/media/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.nordrouterKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'image/nano-banana-edit',
          input: {
            prompt: prompt,
            image: photo.url
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.id) {
        throw new Error('NordRouter не вернул job ID');
      }

      console.log('Studio Pro: job created', data.id);

      // Опрос статуса задачи
      statusEl.textContent = '⏳ Обработка изображения... (1-2 минуты)';
      const resultUrl = await this.pollNordrouterJob(data.id, statusEl);

      // Заменяем фото на обработанное
      this.currentProduct.photos[0].url = resultUrl;
      this.currentProduct.photos[0].uploaded = true;
      this.renderPhotos();

      statusEl.innerHTML = '✅ Фото обработано через Studio Pro';
      this.toast('Фото успешно обработано!', 'success');

    } catch (e) {
      console.error('Studio Pro error:', e);
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ Обработать фото через Studio Pro';
    }
  },

  // Опрос статуса задачи NordRouter
  async pollNordrouterJob(jobId, statusEl) {
    const maxAttempts = 60; // 60 × 3 сек = 3 минуты
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const response = await fetch(`${this.nordrouterBaseUrl}/media/job/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.nordrouterKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Ошибка проверки статуса: HTTP ${response.status}`);
      }

      const data = await response.json();
      
      console.log(`Polling ${i + 1}/${maxAttempts}, status: ${data.status}`);
      
      if (statusEl) {
        statusEl.textContent = `⏳ Статус: ${data.status}... (${i * 3}с)`;
      }

      if (data.status === 'done' && data.output && data.output.url) {
        return data.output.url;
      }

      if (data.status === 'failed') {
        throw new Error(data.error || 'Обработка не удалась');
      }
    }

    throw new Error('Таймаут обработки (превышено 3 минуты)');
  }
});

console.log('✓ NordRouter Direct Integration loaded');
