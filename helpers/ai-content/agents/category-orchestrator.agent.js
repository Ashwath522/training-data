'use strict';

/**
 * Category Orchestrator Agent
 * Routes each product to its dedicated category agent, coordinates angle ranking,
 * executes grounding and repetition audits, and manages structured retry loops.
 */

const { generateBedroomStorageCopy, getValidAngles: getValidStorageAngles } = require('./bedroom-storage.agent');
const { generateBedsCopy, getValidBedAngles } = require('./beds.agent');
const { generateMattressesCopy, getValidMattressAngles } = require('./mattresses.agent');
const { generateKidsRoomCopy, getValidKidsAngles } = require('./kids-room.agent');
const { generateWardrobesCopy, getValidWardrobeAngles } = require('./wardrobes.agent');
const { generatePetFurnitureCopy, getValidPetAngles } = require('./pet-furniture.agent');

const { auditFactualGrounding, extractProductFacts } = require('./grounding-auditor.agent');
const { auditRepetition } = require('./repetition-auditor.agent');
const { analyzeFailure } = require('./root-cause.agent');
const { getCategoryMemory, recordAcceptedItem, rankAnglesByUsage, rankStructuresByUsage } = require('./category-memory.helper');

const { matchMaterial } = require('../ai-care-matcher.helper');
const { getReturnsBlock } = require('../ai-returns-lookup.helper');
const { buildQualityPromise } = require('../ai-quality-composer.helper');
const { validateItem } = require('../ai-validator.helper');
const { PLACEHOLDER_LINKS } = require('../ai-schema.helper');

function normalizeSubcategory(product) {
  const sub = (product.subcategory || product.category || '').toLowerCase();
  const name = (product.name || '').toLowerCase();

  if (/mattress/i.test(sub) || /mattress/i.test(name)) return 'Mattresses';
  if (/wardrobe|almirah|cupboard/i.test(sub) || /wardrobe|almirah|cupboard/i.test(name)) return 'Wardrobes';
  if (/kids|child|bunk|junior|baby|toddler/i.test(sub) || /kids|bunk/i.test(name)) return 'Kids Room';
  if (/pet|dog|cat|animal/i.test(sub) || /pet/i.test(name)) return 'Pet Furniture';
  if (/dressing|bedside|chest|drawer|bench|storage chest|nightstand|bedroom storage/i.test(sub) || /dressing|bedside|nightstand|chest of/i.test(name)) {
    return 'Bedroom Storage';
  }
  if (/bed/i.test(sub) || /bed/i.test(name)) return 'Beds';
  return 'Bedroom Storage';
}

function getCategoryGenerator(catName) {
  switch (catName) {
    case 'Beds':
      return { generate: generateBedsCopy, getAngles: getValidBedAngles };
    case 'Mattresses':
      return { generate: generateMattressesCopy, getAngles: getValidMattressAngles };
    case 'Kids Room':
      return { generate: generateKidsRoomCopy, getAngles: getValidKidsAngles };
    case 'Wardrobes':
      return { generate: generateWardrobesCopy, getAngles: getValidWardrobeAngles };
    case 'Pet Furniture':
      return { generate: generatePetFurnitureCopy, getAngles: getValidPetAngles };
    case 'Bedroom Storage':
    default:
      return { generate: generateBedroomStorageCopy, getAngles: getValidStorageAngles };
  }
}

function generateDeterministicBullets(prod) {
  const bullets = [];
  const axes = prod.variant_axes || {};

  const sizes =
    Array.isArray(axes.size) && axes.size.length > 0
      ? axes.size
      : Array.isArray(prod.available_sizes) && prod.available_sizes.length > 0
      ? prod.available_sizes
      : prod.size_of_the_bed
      ? [prod.size_of_the_bed]
      : prod.seating_capacity
      ? [prod.seating_capacity]
      : [];
  if (sizes.length > 0) {
    bullets.push(`Available in ${sizes.join(' and ')} sizes to suit different spaces.`);
  }

  const isBedCategory =
    !prod.category ||
    prod.category.toLowerCase() === 'bedroom' ||
    /bed/i.test(prod.subcategory || '') ||
    /bed/i.test(prod.name || '');

  if (isBedCategory) {
    const mattressSize = prod.recommended_mattress_size || (prod.mattress_recommendation && prod.mattress_recommendation.size);
    const mattressThickness = prod.mattress_recommendation && prod.mattress_recommendation.thickness_range;

    if (mattressSize && mattressThickness) {
      bullets.push(`Comfortably fits a ${mattressSize} mattress with an ideal thickness of ${mattressThickness}.`);
    } else if (mattressSize) {
      bullets.push(`Comfortably fits a ${mattressSize} mattress.`);
    } else if (mattressThickness) {
      bullets.push(`Best paired with a ${mattressThickness} thick mattress.`);
    }
  }

  const storageOptions =
    Array.isArray(axes.storage_type) && axes.storage_type.length > 0
      ? axes.storage_type
      : prod.storage_type
      ? [prod.storage_type]
      : [];
  if (storageOptions.length > 0) {
    const storageStr = storageOptions.join(' and ');
    const normStorageStr = storageStr.toLowerCase().replace(/-/g, ' ');
    if (storageOptions.length === 1 && (normStorageStr.includes('non storage') || normStorageStr.includes('no storage'))) {
      bullets.push('Features an open, uncluttered base.');
    } else {
      bullets.push(`Includes ${storageStr.toLowerCase()} for easy access underneath.`);
    }
  }

  const finishOptions =
    Array.isArray(axes.finish) && axes.finish.length > 0
      ? axes.finish
      : prod.finish_name || prod.color_finish
      ? [prod.finish_name || prod.color_finish]
      : [];
  if (finishOptions.length > 0) {
    if (finishOptions.length === 1) {
      bullets.push(`Available in a ${finishOptions[0]} finish.`);
    } else {
      bullets.push(`Available in ${finishOptions.join(' and ')} finishes.`);
    }
  }

  const colourOptions =
    Array.isArray(axes.colour) && axes.colour.length > 0
      ? axes.colour
      : Array.isArray(prod.available_colors) && prod.available_colors.length > 0
      ? prod.available_colors
      : prod.primary_color
      ? [prod.primary_color]
      : [];
  if (colourOptions.length > 0) {
    if (colourOptions.length === 1) {
      bullets.push(`Available in ${colourOptions[0]} colour.`);
    } else {
      bullets.push(`Also available in ${colourOptions.join(', ')} colours.`);
    }
  }

  return bullets;
}

function buildCareBlock(primaryMaterial) {
  const matched = matchMaterial(primaryMaterial);
  const rawInstructions = matched.instructions || [
    'wipe down with a soft, dry cloth regularly',
    'keep away from direct sunlight',
    'use coasters or mats under hot or wet items',
  ];
  const rawAvoid = matched.avoid || ['harsh chemical cleaners', 'placing near direct heat sources'];

  const politeInstructions = rawInstructions.slice(0, 3).map((line) => {
    const lower = line.charAt(0).toLowerCase() + line.slice(1);
    if (/^(we recommend|it's best|try to|it is best)/i.test(line)) return line.replace(/\.$/, '') + '.';
    return 'We recommend ' + lower.replace(/\.$/, '') + '.';
  });

  const politeAvoid = rawAvoid.slice(0, 2).map((line) => {
    const stripped = line.replace(/^avoid\s+/i, '');
    const lower = stripped.charAt(0).toLowerCase() + stripped.slice(1);
    if (/^(it's best|we recommend|try to|it is best)/i.test(line)) return line.replace(/\.$/, '') + '.';
    return "It's best to avoid " + lower.replace(/\.$/, '') + '.';
  });

  return {
    instructions: politeInstructions,
    avoid: politeAvoid,
    _careCategory: matched.category,
    _needsReview: matched.needs_review,
  };
}

function buildWarrantyBlock(product) {
  const months = product.warranty_months !== undefined ? product.warranty_months : 36;
  const applicable = months > 0;
  const status_line = applicable
    ? `**Yes**, it has a warranty of **${months} months**.`
    : `**No**, it has a warranty of **0 months**.`;

  const points = applicable
    ? ['Covers manufacturing defects in materials and workmanship.', `Valid for ${months} months from purchase date.`]
    : ['No manufacturer warranty is included with this product.'];

  return {
    applicable,
    duration_months: months,
    status_line,
    points,
    link: PLACEHOLDER_LINKS.warranty,
  };
}

function buildSpecificationsBlock(product) {
  const spec = {};
  const allowed = [
    'dimensions',
    'primary_material',
    'secondary_material',
    'weight',
    'assembly_required',
    'seating_capacity',
    'color_finish',
  ];
  for (const f of allowed) {
    if (product[f] !== undefined && product[f] !== null && product[f] !== '') {
      spec[f] = product[f];
    }
  }
  return spec;
}

/**
 * Orchestrates generation for a single product with full audit and retry loop.
 */
async function generateProductRecord(product, options = {}) {
  const categoryName = options.categoryName || normalizeSubcategory(product);
  const { generate } = getCategoryGenerator(categoryName);
  const facts = extractProductFacts(product);

  const memory = getCategoryMemory(categoryName);
  const allStructures = ['STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D', 'STRUCTURE_E', 'STRUCTURE_F', 'STRUCTURE_G', 'STRUCTURE_H'];
  const rankedStructures = rankStructuresByUsage(categoryName, allStructures);

  const maxAttempts = options.maxAttempts || 8;
  let attemptHistory = [];
  let acceptedItem = null;

  const itemIndex = options.itemIndex !== undefined 
    ? options.itemIndex 
    : (product.catalog_index !== undefined ? product.catalog_index : memory.items.length);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const assignedStructure = rankedStructures[(attempt - 1) % rankedStructures.length];

    const copyRes = generate(product, {
      structureId: assignedStructure,
      attempt,
      itemIndex,
    });

    const summary = copyRes.summary;
    const bullets = generateDeterministicBullets(product);
    const careBlock = buildCareBlock(facts.primaryMaterial);
    const warrantyBlock = buildWarrantyBlock(product);
    const specificationsBlock = buildSpecificationsBlock(product);
    const qualityPromise = buildQualityPromise(categoryName, warrantyBlock, specificationsBlock);
    const returnsBlock = getReturnsBlock(categoryName);

    const item = {
      description: {
        summary,
        aesthetic_style: 'minimal modern',
        texture: `Finished ${facts.primaryMaterial || 'Material'}`,
        best_use: 'Bedroom focal point',
        key_features: bullets,
      },
      specifications: specificationsBlock,
      care_and_maintenance: {
        instructions: careBlock.instructions,
        avoid: careBlock.avoid,
      },
      warranty: warrantyBlock,
      returns: returnsBlock,
      quality_promise: qualityPromise,
      _meta: {
        needs_review: false,
        care_category_matched: careBlock._careCategory,
        category: categoryName,
        angle: assignedStructure,
        attempt_history: attemptHistory,
      },
    };

    // 1. Schema Validation
    const schemaVal = validateItem(item, product, { relaxLengthCheck: false });

    // 2. Factual Grounding Audit
    const groundingVal = auditFactualGrounding(summary, product);

    // 3. Repetition Audit against Category Memory
    const repetitionVal = auditRepetition(summary, product, memory.items);

    const attemptErrors = [
      ...schemaVal.errors,
      ...groundingVal.errors,
      ...(repetitionVal.status === 'FAIL' ? [repetitionVal.reason] : []),
    ];

    const isPass = schemaVal.valid && groundingVal.valid && repetitionVal.status === 'PASS';

    let rootCauseReport = null;
    if (!isPass) {
      rootCauseReport = analyzeFailure({
        facts,
        currentAttempt: { angle: assignedStructure, structure: copyRes.structure },
        groundingResult: groundingVal,
        repetitionResult: repetitionVal,
        allSupportedAngles: allStructures,
        allStructures,
      });
    }

    attemptHistory.push({
      attempt,
      valid: isPass,
      angle: assignedStructure,
      structure: repetitionVal.structure || copyRes.structure,
      schema_valid: schemaVal.valid,
      grounding_valid: groundingVal.valid,
      repetition_status: repetitionVal.status,
      errors: attemptErrors,
      root_cause: rootCauseReport,
      output_snippet: summary.slice(0, 100),
    });

    if (isPass) {
      item._meta.attempt_history = attemptHistory;

      // Record to category memory
      recordAcceptedItem(categoryName, {
        id: product.id,
        name: product.name,
        shortName: facts.shortName,
        summary,
        opener: summary.split(/[.!?]+/)[0]?.trim() || '',
        closer: summary.match(/[^.!?]+[.!?]+/g)?.slice(-1)[0]?.trim() || '',
        angle: assignedStructure,
        structure: repetitionVal.structure || copyRes.structure,
        facts: copyRes.factsUsed,
        timestamp: new Date().toISOString(),
      });

      acceptedItem = item;
      break;
    }
  }

  if (!acceptedItem) {
    // If maximum retries exceeded, create a clean fallback flagged for review
    const fallbackCopy = generate(product, { structureId: 'STRUCTURE_A', attempt: 1 });
    const bullets = generateDeterministicBullets(product);
    const careBlock = buildCareBlock(facts.primaryMaterial);
    const warrantyBlock = buildWarrantyBlock(product);
    const specificationsBlock = buildSpecificationsBlock(product);

    acceptedItem = {
      description: {
        summary: fallbackCopy.summary,
        aesthetic_style: 'minimal modern',
        texture: `Finished ${facts.primaryMaterial || 'Material'}`,
        best_use: 'Bedroom focal point',
        key_features: bullets,
      },
      specifications: specificationsBlock,
      care_and_maintenance: {
        instructions: careBlock.instructions,
        avoid: careBlock.avoid,
      },
      warranty: warrantyBlock,
      returns: getReturnsBlock(categoryName),
      quality_promise: buildQualityPromise(categoryName, warrantyBlock, specificationsBlock),
      _meta: {
        needs_review: true,
        care_category_matched: careBlock._careCategory,
        category: categoryName,
        angle: 'STRUCTURE_A',
        attempt_history: attemptHistory,
      },
    };
  }

  return {
    input: product,
    output: acceptedItem,
  };
}

module.exports = {
  generateProductRecord,
  normalizeSubcategory,
  generateDeterministicBullets,
  buildCareBlock,
  buildWarrantyBlock,
  buildSpecificationsBlock,
};
