// VigSharm Admin - NordRouter AI Generation
// Генерация метаданных карточки через GPT-4o-mini

Object.assign(app, {
  // === AI GENERATION: Генерация метаданных карточки ===
  async generateAIMetadataDirect() {
    if (this.currentProduct.photos.length === 0) {
      this.toast('Загрузите хотя бы одно фото', 'error');
      return;
    }

    if (!this.checkNordrouterKey()) return;

    const btn = document.getElementById('generate-ai-btn');
    const statusEl = document.getElementById('ai-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Генерация...';

    try {
      const imageUrl = this.currentProduct.photos[0].url;
      statusEl.textContent = '🤖 Анализ фото через GPT-4o-mini...';

      // Системный промпт
      const systemPrompt = `Ты — эксперт по составлению карточек товаров для интернет-магазина воздушных шаров и подарков "ВигШарм" (Армавир).

Задача: проанализируй фото и сгенерируй данные товара в формате JSON.

Требования:
- Название: краткое, ёмкое (например: "Композиция из шаров «Мишка с цифрой 5» в розовом")
- Артикул: формат VIGSH-XXX (случайное число 001-999)
- Цена: реалистичная оценка для региона (500-5000₽)
- Короткое описание: 1-2 предложения для карточки
- Полное описание: 3-5 предложений о товаре
- Состав: массив строк (например: ["Шар-цифра 5 фольгированная", "Шары латексные розовые — 10 шт"])
- Категория: выбери из списка: Для девочки, Для мальчика, Для неё, Для мамы, Для него, Геймерам, Юбилей, 1 годик, Крещение, Гендер-пати, На выписку, Свадьба и девичник, Выпускной, Новый год, 14 февраля, 23 февраля, 8 марта, 1 сентября, Фигуры из шаров, Напольные композиции, Букет из шаров, Цветы из шаров, Крафтовый букет, Шар-сюрприз, Коробка-сюрприз, Фотозона, Арка из шаров, Шары поштучно
- SEO-заголовок: до 60 символов
- SEO-описание: до 160 символов
- Slug: транслитерация названия (латиница, дефисы)
- Tags: массив релевантных тегов

Формат ответа — ТОЛЬКО JSON без лишнего текста:
{
  "title": "...",
  "article": "VIGSH-XXX",
  "price": 0,
  "short_description": "...",
  "full_description": "...",
  "composition": ["...", "..."],
  "category": "...",
  "seo_title": "...",
  "seo_description": "...",
  "slug": "...",
  "tags": ["...", "..."]
}`;

      console.log('AI Generation: sending request to NordRouter');

      // Запрос к NordRouter chat/completions
      const response = await fetch(`${this.nordrouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.nordrouterKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Проанализируй это фото товара и заполни карточку:'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          temperature: 0.7,
          max_tokens: 1500
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0]) {
        throw new Error('NordRouter не вернул ответ');
      }

      const content = data.choices[0].message.content;
      
      console.log('AI Generation: received response', content);

      // Парсим JSON из ответа
      let cardData;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cardData = JSON.parse(jsonMatch[0]);
        } else {
          cardData = JSON.parse(content);
        }
      } catch (parseError) {
        console.error('JSON parse error:', content);
        throw new Error('Не удалось распарсить ответ AI');
      }

      // Заполняем форму
      this.fillFormWithAIData(cardData);
      
      statusEl.innerHTML = '✅ Метаданные успешно сгенерированы';
      this.toast('AI-карточка заполнена!', 'success');

      console.log('AI Generation: completed', cardData);

    } catch (e) {
      console.error('AI generation error:', e);
      statusEl.textContent = '✗ ' + e.message;
      this.toast('Ошибка AI: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🤖 Сгенерировать данные через ИИ';
    }
  }
});

console.log('✓ NordRouter AI Generation loaded');
