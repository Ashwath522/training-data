'use strict';

/**
 * Tone Presets and Tenant Override Resolver
 *
 * This module defines the 5 shipped tone presets and provides tenant-scoped
 * effective tone resolution.
 */

const TONE_PRESETS = Object.freeze({
  warm_inviting: Object.freeze({
    id: 'warm_inviting',
    label: 'Warm & Inviting',
    name: 'Warm & Inviting',
    rule_text:
      "Adopt a warm, inviting, and hospitable voice. Use cozy, lived-in language focused on everyday comfort, shared rituals, and ease ('linger', 'gather', 'everyday ritual', 'welcoming warmth'). Sentences should feel gentle, affectionate, and personal without being overly sentimental.",
    instructions:
      "Adopt a warm, inviting, and hospitable voice. Use cozy, lived-in language focused on everyday comfort, shared rituals, and ease ('linger', 'gather', 'everyday ritual', 'welcoming warmth'). Sentences should feel gentle, affectionate, and personal without being overly sentimental.",
  }),
  elegant_sophisticated: Object.freeze({
    id: 'elegant_sophisticated',
    label: 'Elegant & Sophisticated',
    name: 'Elegant & Sophisticated',
    rule_text:
      "Adopt a poised, restrained, and cultivated voice. Use statement-piece architectural vocabulary that suggests quiet distinction, tailored grace, and enduring allure ('refined', 'timeless', 'elevate', 'understated presence'). Keep pacing deliberate and phrasing immaculate.",
    instructions:
      "Adopt a poised, restrained, and cultivated voice. Use statement-piece architectural vocabulary that suggests quiet distinction, tailored grace, and enduring allure ('refined', 'timeless', 'elevate', 'understated presence'). Keep pacing deliberate and phrasing immaculate.",
  }),
  minimal_modern: Object.freeze({
    id: 'minimal_modern',
    label: 'Minimal & Modern',
    name: 'Minimal & Modern',
    rule_text:
      "Adopt a crisp, clean, and concise modern voice. Emphasize geometric clarity, functional simplicity, and intentional space with short sentences and low adjective density ('clean lines', 'uncluttered', 'essential form', 'balanced profile'). Avoid ornamentation or decorative flourish.",
    instructions:
      "Adopt a crisp, clean, and concise modern voice. Emphasize geometric clarity, functional simplicity, and intentional space with short sentences and low adjective density ('clean lines', 'uncluttered', 'essential form', 'balanced profile'). Avoid ornamentation or decorative flourish.",
  }),
  premium_indulgent: Object.freeze({
    id: 'premium_indulgent',
    label: 'Premium & Indulgent',
    name: 'Premium & Indulgent',
    rule_text:
      "Adopt an opulent, sumptuous voice that foregrounds exquisite craftsmanship, bespoke tactile richness, and sensory luxury ('indulgence', 'craftsmanship', 'heirloom quality', 'flawless joinery', 'premium textures'). Pacing should be slower and evocative of exceptional artistry.",
    instructions:
      "Adopt an opulent, sumptuous voice that foregrounds exquisite craftsmanship, bespoke tactile richness, and sensory luxury ('indulgence', 'craftsmanship', 'heirloom quality', 'flawless joinery', 'premium textures'). Pacing should be slower and evocative of exceptional artistry.",
  }),
  playful_casual: Object.freeze({
    id: 'playful_casual',
    label: 'Playful & Casual',
    name: 'Playful & Casual',
    rule_text:
      "Adopt a breezy, upbeat, and accessible voice. Contractions are welcome, tone is conversational and optimistic, and direct address brings easy vitality ('you\\'ll love', 'effortless charm', 'fresh spin', 'fun-loving'). Keep descriptions bright, relatable, and approachable.",
    instructions:
      "Adopt a breezy, upbeat, and accessible voice. Contractions are welcome, tone is conversational and optimistic, and direct address brings easy vitality ('you\\'ll love', 'effortless charm', 'fresh spin', 'fun-loving'). Keep descriptions bright, relatable, and approachable.",
  }),
});

// In-memory cache for fast, tenant-scoped tone lookups across test & runtime
const inMemoryOverrides = new Map();

function getCacheKey(companyId, applicationId, toneId) {
  return `${companyId || ''}:${applicationId || ''}:${toneId || ''}`;
}

function setToneOverrideInMemory(companyId, applicationId, toneId, ruleText) {
  const key = getCacheKey(companyId, applicationId, toneId);
  inMemoryOverrides.set(key, ruleText);
}

function removeToneOverrideFromMemory(companyId, applicationId, toneId) {
  const key = getCacheKey(companyId, applicationId, toneId);
  inMemoryOverrides.delete(key);
}

function clearToneCache() {
  inMemoryOverrides.clear();
}

/**
 * Resolves the effective rule_text that actually gets injected into the prompt template.
 * Looks up a tenant-specific override first; if none exists, falls back to the shipped default.
 *
 * This is the only function the prompt-builder calls — it never reads TONE_PRESETS directly.
 */
function getEffectiveTone({ companyId, applicationId, toneId } = {}) {
  if (!toneId || toneId === 'auto') {
    const emptyPromise = Promise.resolve('');
    emptyPromise.toString = () => '';
    emptyPromise.valueOf = () => '';
    return emptyPromise;
  }

  const defaultPreset = TONE_PRESETS[toneId];
  const defaultText = defaultPreset ? defaultPreset.rule_text : '';

  const cacheKey = getCacheKey(companyId, applicationId, toneId);
  const memoryOverride = inMemoryOverrides.get(cacheKey);
  const immediateText = memoryOverride !== undefined ? memoryOverride : defaultText;

  let asyncLookup = null;
  if (companyId && applicationId && defaultPreset) {
    try {
      const ToneOverrideModel = require('../../models/toneOverride.model');
      if (ToneOverrideModel && typeof ToneOverrideModel.findOne === 'function') {
        asyncLookup = ToneOverrideModel.findOne({
          company_id: companyId,
          application_id: applicationId,
          tone_id: toneId,
        })
          .lean()
          .exec()
          .then((override) => {
            if (override && typeof override.rule_text === 'string') {
              setToneOverrideInMemory(companyId, applicationId, toneId, override.rule_text);
              return override.rule_text;
            }
            // Check if memory has it
            if (inMemoryOverrides.has(cacheKey)) {
              return inMemoryOverrides.get(cacheKey);
            }
            return defaultText;
          })
          .catch(() => immediateText);
      }
    } catch (e) {
      // Ignore if model unavailable
    }
  }

  const basePromise = (async () => {
    if (asyncLookup) {
      return await asyncLookup;
    }
    return immediateText;
  })();

  basePromise.toString = () => (inMemoryOverrides.has(cacheKey) ? inMemoryOverrides.get(cacheKey) : immediateText);
  basePromise.valueOf = basePromise.toString;

  return basePromise;
}

/**
 * Returns full details of the effective tone for API / UI display.
 */
async function getEffectiveToneDetails({ companyId, applicationId, toneId }) {
  const defaultPreset = TONE_PRESETS[toneId];
  if (!defaultPreset) {
    return null;
  }

  let ruleText = defaultPreset.rule_text;
  let isOverridden = false;
  let updatedAt = null;
  let updatedBy = null;

  const cacheKey = getCacheKey(companyId, applicationId, toneId);
  if (inMemoryOverrides.has(cacheKey)) {
    ruleText = inMemoryOverrides.get(cacheKey);
    isOverridden = true;
  }

  if (companyId && applicationId) {
    try {
      const ToneOverrideModel = require('../../models/toneOverride.model');
      if (ToneOverrideModel && typeof ToneOverrideModel.findOne === 'function') {
        const override = await ToneOverrideModel.findOne({
          company_id: companyId,
          application_id: applicationId,
          tone_id: toneId,
        })
          .lean()
          .exec();

        if (override && typeof override.rule_text === 'string') {
          ruleText = override.rule_text;
          isOverridden = true;
          updatedAt = override.updated_at;
          updatedBy = override.updated_by;
          setToneOverrideInMemory(companyId, applicationId, toneId, override.rule_text);
        }
      }
    } catch (err) {
      // Fall through to memory or default
    }
  }

  return {
    tone_id: toneId,
    label: defaultPreset.label,
    rule_text: ruleText,
    default_rule_text: defaultPreset.rule_text,
    is_overridden: isOverridden,
    updated_at: updatedAt,
    updated_by: updatedBy,
  };
}

module.exports = {
  TONE_PRESETS,
  getEffectiveTone,
  getEffectiveToneDetails,
  setToneOverrideInMemory,
  removeToneOverrideFromMemory,
  clearToneCache,
};
