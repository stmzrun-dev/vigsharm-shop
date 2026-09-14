// VigSharm Admin - AI Metadata Generation
// Генерация названия, описания, категории и других полей через GPT-4V

Object.assign(app, {
  // === AI: Генерация метаданных карточки ===
  async generateAIMetadata() {
    if (this.currentProduct.photos.length === 0) {
      this.toast('Загрузите хотя бы одно фото для AI-анализа', 'error');
      return;
    }

    const btn = document.getElementById('generate-ai-btn');
    const statusEl = document.getElementById('ai-status');
    
    if (!btn || !statusEl) {
      console.error('AI UI elements not found');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Генерация...';
    statusEl.textContent = '🤖 Анализ фотографии через GPT-4V...';

    try {
      // Берём первое фото для анализа
      const imageUrl = this.currentProduct.photos[0].url;
      
      // Собираем hints от пользователя (если есть)
      const titleHint = this.currentProduct.title || '';
      const priceHint = this.currentProduct.price || '';
      const descHint = this.currentProduct.short_description || '';
      const sceneHint = this.currentProduct.scene || 'floor';

      // Запрос к Worker API
      const res = await fetch(`${this.workerUrl}/api/ai/generate-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          title_hint: titleHint,
          price: priceHint,
          description: descHint,
          scene: sceneHint
        })
      });

      const result = await res.json();
      
      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Не удалось сгенерировать метаданные');
      }

      // Применяем сгенерированные данные к текущему продукту
      const data = result.data;
      
      this.currentProduct.title = data.title || this.currentProduct.title;
      this.currentProduct.article = data.article || this.currentProduct.article;
      this.currentProduct.short_description = data.short_description || this.currentProduct.short_description;
      this.currentProduct.full_description = data.full_description || this.currentProduct.full_description;
      this.currentProduct.composition = data.composition || this.currentProduct.composition;
      this.currentProduct.category = data.category || this.currentProduct.category;
      this.currentProduct.character = data.character || this.currentProduct.character;
      this.currentProduct.age_group = data.age_group || this.currentProduct.age_group;
      this.currentProduct.occasion = data.occasion || this.currentProduct.occasion;
      this.currentProduct.target_audience = data.target_audience || this.currentProduct.target_audience;
      this.currentProduct.seo_title = data.seo_title || this.currentProduct.seo_title;
      this.currentProduct.seo_description = data.seo_description || this.currentProduct.seo_description;
      this.currentProduct.slug = data.slug || this.currentProduct.slug;
      this.currentProduct.tags = data.tags || this.currentProduct.tags;

      // Обновляем UI
      this.renderProductForm();
      
      statusEl.innerHTML = '✅ Метаданные успешно сгенерированы!';
      this.toast('AI-метаданные применены', 'success');
      
      console.log('Generated metadata:', data);

    } catch (e) {
      console.error('AI generation error:', e);
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка AI: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🤖 Заполнить через AI';
    }
  }
});

console.log('✓ AI Metadata Generator loaded');
