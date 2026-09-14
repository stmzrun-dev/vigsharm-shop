// Генератор эталонного фона VigSharm
// Создает reference image для Studio Pro

const REFERENCE_PROMPTS = {
  full_scene: {
    name: "Полная сцена (стена + пол)",
    prompt: `Professional product photography studio background for VigSharm balloon shop.

COMPOSITION:
- Upper 60%: Light warm beige-grey wall with soft texture
- White baseboard (thin, clean line)
- Lower 30%: Light grey-beige laminate flooring
- Square format (1:1)

LIGHTING:
- Soft, natural studio lighting
- Even illumination
- NO yellow color cast
- NO orange tint
- Neutral white balance

STYLE:
- Clean, minimalist
- Professional product photography
- Real photo, NOT 3D render
- Empty room (no objects, no furniture)
- Soft shadows

TECHNICAL:
- High resolution
- Sharp focus
- Clean surfaces
- Realistic textures`,
    
    aspectRatio: "1:1"
  },

  wall_only: {
    name: "Только стена (без пола)",
    prompt: `Professional product photography studio wall background for VigSharm.

COMPOSITION:
- Light warm beige-grey wall (100% of frame)
- Soft, subtle texture
- NO floor visible
- NO baseboard
- Square format (1:1)

LIGHTING:
- Soft, natural studio lighting
- Even illumination across entire wall
- NO yellow color cast
- NO shadows
- Neutral white balance

STYLE:
- Clean, minimalist
- Professional backdrop
- Real photo texture
- Slight wall texture (not perfectly flat)
- Studio quality

TECHNICAL:
- High resolution
- Even tone
- Realistic wall surface`,
    
    aspectRatio: "1:1"
  },

  studio_interior: {
    name: "Студийный интерьер (с перспективой)",
    prompt: `Professional product photography studio interior for VigSharm balloon shop.

COMPOSITION:
- Light warm beige-grey walls on three sides (creates depth)
- White baseboards
- Light grey-beige laminate floor
- Corner view (shows wall meeting)
- Square format (1:1)

LIGHTING:
- Soft, natural studio lighting
- Creates slight depth
- NO yellow color cast
- Professional studio feel
- Neutral white balance

STYLE:
- Clean, spacious studio
- Empty (no objects)
- Professional photography space
- Real interior photo
- Slight perspective

TECHNICAL:
- High resolution
- Sharp focus
- Clean, professional`,
    
    aspectRatio: "1:1"
  }
};

async function generateReferenceBackground(type = 'full_scene', nordRouterKey) {
  const config = REFERENCE_PROMPTS[type];
  
  if (!config) {
    throw new Error(`Unknown type: ${type}`);
  }

  console.log(`Generating: ${config.name}`);
  console.log(`Prompt: ${config.prompt.substring(0, 100)}...`);

  // Генерация через NordRouter
  const response = await fetch('https://api.nordrouter.com/media/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${nordRouterKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'image/flux-pro',
      input: {
        prompt: config.prompt,
        width: 1024,
        height: 1024,
        num_outputs: 1
      }
    })
  });

  const job = await response.json();
  
  if (!job.id) {
    throw new Error('Failed to create job: ' + JSON.stringify(job));
  }

  console.log(`Job created: ${job.id}`);
  
  // Опрос статуса
  return await pollGenerationStatus(job.id, nordRouterKey);
}

async function pollGenerationStatus(jobId, nordRouterKey) {
  const maxAttempts = 60;
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await fetch(`https://api.nordrouter.com/media/job/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${nordRouterKey}`
      }
    });
    
    const result = await response.json();
    
    console.log(`Attempt ${i + 1}/${maxAttempts}: ${result.status}`);
    
    if (result.status === 'done' && result.result_url) {
      console.log('✅ Generation complete!');
      return result.result_url;
    }
    
    if (result.status === 'failed') {
      throw new Error('Generation failed');
    }
  }
  
  throw new Error('Timeout (3 minutes)');
}

// Использование:
// const url = await generateReferenceBackground('full_scene', 'YOUR_API_KEY');

module.exports = { generateReferenceBackground, REFERENCE_PROMPTS };
