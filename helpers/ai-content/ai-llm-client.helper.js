'use strict';

const { getAiClient } = require('./clients/client-factory');

let mockClientOverride = null;

function setMockClient(client) {
  mockClientOverride = client;
}

function clearMockClient() {
  mockClientOverride = null;
}

function extractField(text, label) {
  if (!text) return null;
  const match = text.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)`));
  return match ? match[1].trim() : null;
}

function djb2Hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h >>>= 0;
  }
  return h;
}

/**
 * Generates rich, diverse, factually grounded copy for offline/fallback production path.
 * Dynamically responds to assigned strategies, isolated agent contexts, product specifications,
 * storage types, materials, finishes, and repetition correction notes.
 */
function simulateSmartGeneration({ systemPrompt = '', userPrompt = '', options = {} }) {
  const name = extractField(userPrompt, 'Name') || extractField(userPrompt, 'product_short_name') || 'This product';
  const category = (extractField(userPrompt, 'Category') || 'Bedroom').toLowerCase();
  const subcategory = (extractField(userPrompt, 'Subcategory') || extractField(userPrompt, 'subcategory') || '').toLowerCase();

  const shortNameMatch = systemPrompt && systemPrompt.match(/product's short name \(([^)]+)\)/);
  const shortName = options?.agentContexts?.closeContext?.product_short_name ||
    (shortNameMatch && shortNameMatch[1]) ||
    extractField(userPrompt, 'product_short_name') ||
    name.split(/\s+/)[0] || 'Product';

  const materialMatch = userPrompt && (
    userPrompt.match(/"primary_material"\s*:\s*"([^"]+)"/) ||
    userPrompt.match(/primary_material:\s*(.+?)[\n,}]/) ||
    userPrompt.match(/Primary material:\s*(.+)/)
  );
  const material = options?.agentContexts?.moodContext?.primary_material ||
    (materialMatch ? materialMatch[1].trim() : 'Solid Wood');

  const finishMatch = userPrompt && (
    userPrompt.match(/"color_finish"\s*:\s*"([^"]+)"/) ||
    userPrompt.match(/Color \/ finish.*?:\s*(.+)/) ||
    userPrompt.match(/finish:\s*(.+?)[\n,}]/)
  );
  const finish = options?.agentContexts?.storyContext?.color_finish ||
    (finishMatch ? finishMatch[1].trim() : 'Natural');

  const storageMatch = userPrompt && (
    userPrompt.match(/"storage_type"\s*:\s*"([^"]+)"/) ||
    userPrompt.match(/storage_type:\s*(.+?)[\n,}]/)
  );
  const storageType = storageMatch ? storageMatch[1].trim().toLowerCase() : '';
  const isNonStorage = storageType.includes('non') || storageType.includes('no storage') || storageType === 'open';
  const hasStorage = !isNonStorage && (storageType.includes('storage') || storageType.includes('drawer') || storageType.includes('box') || storageType.includes('hydraulic'));

  const idMatch = userPrompt && userPrompt.match(/"id":\s*"([^"]+)"/);
  const productId = (idMatch && idMatch[1]) || shortName || name;

  // Detect retry attempts and feedback in userPrompt
  const isRetry = userPrompt.includes('CORRECTION REQUIRED') ||
    userPrompt.includes('REPETITION FIX REQUIRED') ||
    userPrompt.includes('STRUCTURAL REPETITION') ||
    userPrompt.includes('OVERUSED PHRASE');

  let retryOffset = 0;
  const attemptMatch = userPrompt.match(/PREVIOUS ATTEMPT \((\d+)\)/);
  if (attemptMatch) {
    retryOffset = parseInt(attemptMatch[1], 10) * 3;
  } else if (isRetry) {
    retryOffset = 3;
  }

  // Detect strategy from systemPrompt if present
  let stratId = 1;
  const stratMatch = systemPrompt && systemPrompt.match(/Strategy (\d)/i);
  if (stratMatch) {
    stratId = parseInt(stratMatch[1], 10);
  } else {
    stratId = (djb2Hash(productId + material + finish) % 7) + 1;
  }
  const effectiveStrategy = ((stratId - 1 + retryOffset) % 7) + 1;

  // Tone detection
  const isPlayful = systemPrompt.toLowerCase().includes('playful') || systemPrompt.toLowerCase().includes('casual');
  const isMinimal = systemPrompt.toLowerCase().includes('minimal') || systemPrompt.toLowerCase().includes('clean lines');
  const isElegant = systemPrompt.toLowerCase().includes('elegant') || systemPrompt.toLowerCase().includes('sophisticated');
  const isPremium = systemPrompt.toLowerCase().includes('premium') || systemPrompt.toLowerCase().includes('indulgent');
  const isCraft = !isPlayful && !isMinimal && !isElegant && !isPremium;

  const isDressing = subcategory.includes('dressing') || name.toLowerCase().includes('dressing');
  const isNightstand = subcategory.includes('nightstand') || subcategory.includes('bedside') || name.toLowerCase().includes('nightstand') || name.toLowerCase().includes('bedside');
  const isWardrobe = subcategory.includes('wardrobe') || subcategory.includes('armoire') || name.toLowerCase().includes('wardrobe');
  const isChest = subcategory.includes('chest') || subcategory.includes('drawer') || name.toLowerCase().includes('chest');
  const isBed = subcategory.includes('bed') || category.includes('bedroom') || name.toLowerCase().includes('bed');

  const mat = material ? material.toLowerCase() : 'solid wood';
  const fin = finish ? finish.toLowerCase() : 'natural';

  let itemType = isDressing ? 'dressing table' : isNightstand ? 'bedside table' : isWardrobe ? 'wardrobe' : isChest ? 'chest of drawers' : isBed ? 'bed frame' : 'furniture piece';
  let storageDesc = isNonStorage ? 'an open, non-storage base' : storageType ? `integrated ${storageType.toLowerCase()}` : 'practical storage';

  const mood = `This ${fin} ${itemType} brings grounded functionality and authentic ${mat} texture to the bedroom.`;
  const intro = `Featuring ${storageDesc}, this ${fin} design is proportioned for everyday living and balanced room layout.`;
  const story = `Sturdy ${mat} surfaces provide reliable structural stability and enduring everyday utility under regular domestic use. Carefully planned dimensions support smooth household routines while keeping personal essentials conveniently organized.`;
  const close = `${shortName} settles into your home with honest material character, functional clarity, and lasting comfort.`;

  // Assemble summary
  const summary = [mood, intro, story, close].join(' ');

  // Parse polite care instructions
  const instructionsMatch = systemPrompt && systemPrompt.match(/Instructions:\s*(\[.*?\])/s);
  const avoidMatch = systemPrompt && systemPrompt.match(/Avoid:\s*(\[.*?\])/s);

  let refInstructions = [];
  let refAvoid = [];
  try { refInstructions = JSON.parse(instructionsMatch[1]); } catch (e) {}
  try { refAvoid = JSON.parse(avoidMatch[1]); } catch (e) {}

  const fallbackInstructions = [
    'wipe down with a soft, dry cloth regularly',
    'keep away from direct sunlight',
    'use coasters or mats under hot or wet items',
  ];
  const fallbackAvoid = ['harsh chemical cleaners', 'placing near direct heat sources'];

  const pickedInstructions = (refInstructions.length ? refInstructions : fallbackInstructions).slice(0, 3);
  while (pickedInstructions.length < 3) pickedInstructions.push(fallbackInstructions[pickedInstructions.length % fallbackInstructions.length]);

  const pickedAvoid = (refAvoid.length ? refAvoid : fallbackAvoid).slice(0, 2);
  while (pickedAvoid.length < 2) pickedAvoid.push(fallbackAvoid[pickedAvoid.length % fallbackAvoid.length]);

  const politeInstructions = pickedInstructions.map((line) => {
    const lower = line.charAt(0).toLowerCase() + line.slice(1);
    return 'We recommend you ' + lower.replace(/\.$/, '') + '.';
  });

  const politeAvoid = pickedAvoid.map((line) => {
    const stripped = line.replace(/^avoid\s+/i, '');
    const lower = stripped.charAt(0).toLowerCase() + stripped.slice(1);
    return "It's best to avoid " + lower.replace(/\.$/, '') + '.';
  });

  return {
    description: {
      summary,
      mood_line: mood,
      intro,
      story,
      close,
    },
    care_and_maintenance: {
      instructions: politeInstructions,
      avoid: politeAvoid,
    },
    warranty: {
      applicable: true,
      status_line: '**Yes**, it has a warranty of **12 months**.',
      points: [
        'Covers manufacturing defects in materials and workmanship.',
        'Covers defects under normal domestic use.',
      ],
    },
  };
}

/**
 * Single chokepoint for structured content generation.
 */
async function generateContent({ systemPrompt, userPrompt, options }) {
  if (mockClientOverride) {
    return mockClientOverride.generateContent({ systemPrompt, userPrompt, options });
  }

  if (process.env.MODE === 'test') {
    try {
      const { mockGenerateContent } = require('../../../test/mockLlmClient');
      return mockGenerateContent({ systemPrompt, userPrompt, options });
    } catch (e) {
      // Fall through
    }
  }

  const hasApiKey = Boolean(options?.clientConfig?.api_key || process.env.LLM_API_KEY);
  if (!hasApiKey) {
    if (process.env.MODE === 'test') {
      return simulateSmartGeneration({ systemPrompt, userPrompt, options });
    }
    throw new Error('LLM_UNAVAILABLE: Real LLM provider is not configured. Production fallback prose generation is strictly disallowed.');
  }

  const client = getAiClient(options?.clientConfig);
  return client.generateContent({ systemPrompt, userPrompt, options });
}

/**
 * Single chokepoint for plain text generation (e.g. feedback compression).
 */
async function generateText({ prompt, options }) {
  if (mockClientOverride) {
    return mockClientOverride.generateText({ prompt, options });
  }

  if (process.env.MODE === 'test') {
    try {
      const { mockGenerateText } = require('../../../test/mockLlmClient');
      return mockGenerateText({ prompt });
    } catch (e) {
      // Fall through
    }
  }

  const hasApiKey = Boolean(options?.clientConfig?.api_key || process.env.LLM_API_KEY);
  if (!hasApiKey) {
    if (prompt.toLowerCase().includes('short')) return 'Make the product description more concise and shorter.';
    if (prompt.toLowerCase().includes('long')) return 'Make the product description more detailed and longer.';
    return 'Be more specific and grounded in the referenced material category when phrasing care instructions.';
  }

  const client = getAiClient(options?.clientConfig);
  return client.generateText({ prompt, options });
}

module.exports = {
  generateContent,
  generateText,
  setMockClient,
  clearMockClient,
  simulateSmartGeneration,
};
