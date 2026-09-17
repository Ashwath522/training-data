'use strict';

const FORBIDDEN_TIER_WORDS = ['premium', 'mid-premium', 'value tier'];
const BARE_IMPERATIVE_RE = /^(wipe|do not|don't|clean|dry|avoid|use|apply|dust|store|keep|remove|scrub)\b/i;
const RAW_DIMENSION_RE = /\b\d+(?:\.\d+)?\s*(?:m|cm|mm|in|inch|inches|ft|feet)\b\s*(?:[lwhd]\b)?(?:\s*x\s*\d+(?:\.\d+)?\s*(?:m|cm|mm|in|inch|inches|ft|feet)\b\s*(?:[lwhd]\b)?)+/i;

const THEME_FAMILIES = {
  calm: {
    moodWords: ['calm', 'rest', 'peace', 'peaceful', 'serene', 'serenity', 'unhurried', 'quiet', 'soothe', 'soothing', 'relax', 'relaxing', 'stillness', 'gentle', 'ease', 'tranquil', 'tranquility', 'unwind', 'mornings', 'wake', 'experience'],
    closeWords: ['rest', 'restful', 'serenity', 'serene', 'calm', 'peace', 'peaceful', 'comfort', 'retreat', 'unwind', 'sleep', 'slumber', 'quiet', 'ease', 'tranquility', 'recharge', 'haven', 'order', 'balance'],
  },
  elegant: {
    moodWords: ['statement', 'contemporary', 'elegant', 'elegance', 'sophisticated', 'sophistication', 'refined', 'refinement', 'grace', 'graceful', 'poise', 'sculptural', 'architectural', 'modern', 'distinction', 'timeless', 'elevate'],
    closeWords: ['sophistication', 'sophisticated', 'statement', 'elegance', 'elegant', 'refined', 'refinement', 'style', 'presence', 'distinction', 'elevate', 'grace', 'aesthetic', 'polish', 'contemporary', 'balance'],
  },
  inviting: {
    moodWords: ['inviting', 'warm', 'warmth', 'cozy', 'welcome', 'welcoming', 'gather', 'gathering', 'comfort', 'comforting', 'hearth', 'home', 'embrace', 'hospitable'],
    closeWords: ['warmth', 'warm', 'welcome', 'welcoming', 'inviting', 'gather', 'comfort', 'living', 'home', 'cozy', 'belonging', 'presence', 'balance'],
  },
  minimal: {
    moodWords: ['minimal', 'order', 'simplicity', 'simple', 'clean', 'clarity', 'uncluttered', 'essential', 'balance', 'balanced', 'harmony'],
    closeWords: ['order', 'balance', 'balanced', 'simplicity', 'simple', 'clean', 'clarity', 'harmony', 'functional', 'pure', 'minimal', 'calm'],
  },
  craft: {
    moodWords: ['grounded', 'enduring', 'craft', 'craftsmanship', 'heritage', 'rooted', 'authentic', 'foundation', 'strength', 'solid', 'lasting'],
    closeWords: ['enduring', 'lasting', 'grounded', 'craftsmanship', 'strength', 'integrity', 'heritage', 'foundation', 'solid', 'dependable', 'honest', 'purpose', 'quality', 'accurate', 'consistent', 'principled', 'material', 'honest in'],
  },
  luxury: {
    moodWords: ['luxury', 'luxurious', 'indulgence', 'indulgent', 'grand', 'opulent', 'sumptuous', 'exquisite', 'masterpiece', 'prestige'],
    closeWords: ['luxury', 'luxurious', 'indulgence', 'indulgent', 'craftsmanship', 'refined', 'sophistication', 'grandeur', 'elevated', 'prestige', 'comfort'],
  },
  playful: {
    moodWords: ['playful', 'cheerful', 'bright', 'joy', 'joyful', 'vibrant', 'lively', 'delight', 'energy', 'friendly'],
    closeWords: ['playful', 'cheerful', 'joy', 'delight', 'bright', 'energy', 'ease', 'comfort', 'warmth', 'welcome', 'charm'],
  },
};

function checkLoopThemeMatch(moodLine, closingSentence) {
  if (!moodLine || !closingSentence) return { checked: false, matched: true };
  const moodTokens = moodLine.toLowerCase().split(/[^a-z0-9]+/);
  const closeTokens = new Set(closingSentence.toLowerCase().split(/[^a-z0-9]+/));

  let detectedFamily = null;
  for (const [familyName, family] of Object.entries(THEME_FAMILIES)) {
    if (family.moodWords.some((w) => moodTokens.includes(w))) {
      detectedFamily = familyName;
      break;
    }
  }

  if (!detectedFamily) {
    return { checked: true, detectedFamily: null, matched: true };
  }

  const family = THEME_FAMILIES[detectedFamily];
  const sharesTheme = family.closeWords.some((w) => closeTokens.has(w));
  return {
    checked: true,
    detectedFamily,
    matched: sharesTheme,
  };
}

function normalize(v) {
  return String(v).trim().toLowerCase();
}

function validateItem(item, sourceProduct, options = {}) {
  const errors = [];

  const requiredTopLevel = ['description', 'specifications', 'care_and_maintenance', 'warranty', 'returns', 'quality_promise'];
  for (const key of requiredTopLevel) {
    if (!(key in item) || item[key] === undefined || item[key] === null) {
      errors.push(`Missing top-level field: ${key}`);
    }
  }

  if (item.description) {
    if (!item.description.summary) {
      errors.push('Missing description.summary');
    }
    const summary = item.description.summary || '';
    const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || (summary.trim() ? [summary.trim()] : []);

    if (!options.relaxLengthCheck) {
      const sentenceCount = (summary.match(/[.!?]/g) || []).length;
      if (sentenceCount < 4 || sentenceCount > 6) {
        errors.push(`description.summary should be between 4 and 6 sentences; found ${sentenceCount}`);
      }
      const wordCount = summary.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 70 || wordCount > 110) {
        errors.push(`description.summary should be ~70-110 words; found ${wordCount}`);
      }
    }

    if (RAW_DIMENSION_RE.test(summary)) {
      errors.push('description.summary must not include raw dimension strings');
    }

    // Structural loop check: Mood line and closing sentence theme match
    if (sentences.length >= 2) {
      const moodLine = sentences[0];
      const closingSentence = sentences[sentences.length - 1];
      const loopTheme = checkLoopThemeMatch(moodLine, closingSentence);
      if (loopTheme.checked && !loopTheme.matched) {
        errors.push(
          `Structural loop check failed: closing sentence must return to the theme family of the mood line (detected family: "${loopTheme.detectedFamily}").`,
        );
      }
    }

    if (sourceProduct && sourceProduct.product_short_name) {
      const shortName = sourceProduct.product_short_name;
      const escapedShortName = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedShortName}\\b`, 'gi');
      const matches = summary.match(regex) || [];
      if (matches.length !== 1) {
        errors.push(`description.summary must mention product_short_name exactly once; found ${matches.length}`);
      } else {
        const closingSentence = sentences.length > 0 ? sentences[sentences.length - 1] : '';
        const closingRegex = new RegExp(`\\b${escapedShortName}\\b`, 'i');
        if (!closingRegex.test(closingSentence)) {
          errors.push(`description.summary must mention product_short_name in the CLOSING sentence specifically — found it in an earlier sentence instead.`);
        }
      }
    }

    if (item.description.key_features && Array.isArray(item.description.key_features)) {
      for (const bullet of item.description.key_features) {
        if (!bullet || typeof bullet !== 'string') {
          errors.push('description.key_features must contain only strings');
        }
      }
    } else {
      errors.push('Missing description.key_features array');
    }
  }

  // Specifications are NOT generated by LLM; copied from source.
  if (item.specifications && sourceProduct) {
    const allowedSpecFields = [
      'dimensions',
      'primary_material',
      'secondary_material',
      'weight',
      'assembly_required',
      'seating_capacity',
      'color_finish',
    ];
    for (const field in item.specifications) {
      const generated = item.specifications[field];
      const source = sourceProduct[field];
      if (!allowedSpecFields.includes(field)) {
        errors.push(`specifications.${field} should not be generated; it is a source-copy-only field`);
      } else if (source === undefined || source === null || source === '') {
        errors.push(`specifications.${field} should not be present if missing in source`);
      } else if (normalize(generated) !== normalize(source)) {
        errors.push(`specifications.${field} does not match source data exactly`);
      }
    }
    for (const field of allowedSpecFields) {
      if (sourceProduct[field] !== undefined && sourceProduct[field] !== null && sourceProduct[field] !== '') {
        if (!(field in item.specifications)) {
          errors.push(`specifications.${field} is present in source but missing in output`);
        }
      }
    }
  }

  // Care and maintenance checks
  if (item.care_and_maintenance) {
    const instructions = item.care_and_maintenance.instructions;
    const avoid = item.care_and_maintenance.avoid;
    if (!Array.isArray(instructions) || instructions.length !== 3) {
      errors.push('care_and_maintenance.instructions must have exactly 3 items');
    }
    if (!Array.isArray(avoid) || avoid.length !== 2) {
      errors.push('care_and_maintenance.avoid must have exactly 2 items');
    }
    for (const line of [...(instructions || []), ...(avoid || [])]) {
      if (typeof line === 'string' && BARE_IMPERATIVE_RE.test(line.trim())) {
        errors.push(`Polite-tone flag (bare imperative, human review can override): "${line}"`);
      }
    }
  } else {
    errors.push('Missing care_and_maintenance');
  }

  // Warranty checks
  if (item.warranty) {
    const points = Array.isArray(item.warranty.points) ? item.warranty.points : [];
    if (points.length > 4) {
      errors.push('warranty.points must have at most 4 items');
    }
    if (
      !item.warranty.status_line ||
      !/^\*\*(Yes|No)\*\*, it has a warranty of \*\*\d+\s+months\*\*\.$/.test(item.warranty.status_line.trim())
    ) {
      errors.push('warranty.status_line must be exactly: "**Yes**, it has a warranty of **N months**." or "**No**, it has a warranty of **0 months**."');
    }
    if (points.length > 0 && points.some((point) => typeof point !== 'string' || !point.trim())) {
      errors.push('warranty.points must contain only non-empty strings');
    }
  } else {
    errors.push('Missing warranty');
  }

  // Returns checks
  if (item.returns) {
    if (!Array.isArray(item.returns.condition) || item.returns.condition.length !== 3) {
      errors.push('returns.condition must have exactly 3 items');
    }
  } else {
    errors.push('Missing returns');
  }

  // Tier / Vocabulary leakage check (tone-aware)
  const selectedTone = options.selectedTone || (sourceProduct && sourceProduct.selected_tone) || null;
  const descriptionText = item.description ? JSON.stringify(item.description).toLowerCase() : '';

  // If selectedTone is 'premium_indulgent', allow 'premium' (it's required by that tone preset)
  const forbiddenWords = selectedTone === 'premium_indulgent'
    ? FORBIDDEN_TIER_WORDS.filter((w) => w !== 'premium')
    : FORBIDDEN_TIER_WORDS;

  for (const word of forbiddenWords) {
    if (descriptionText.includes(word)) {
      errors.push(`Tier leakage: description contains forbidden word "${word}"`);
    }
  }
  if (/[₹$]\s?\d/.test(descriptionText) || /\bprice\b/i.test(descriptionText)) {
    errors.push('Tier leakage: description appears to reference a price figure');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateItem,
  checkLoopThemeMatch,
  THEME_FAMILIES,
};
