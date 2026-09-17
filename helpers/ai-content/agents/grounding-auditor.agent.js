'use strict';

/**
 * Factual Grounding Auditor Agent
 * Strict verification of every factual claim in generated product descriptions against
 * the source product catalog input.
 */

const BANNED_UNGROUNDED_TERMS = [
  { term: 'traditional joinery', regex: /\btraditional\s+joinery\b/i },
  { term: 'hand-finished joinery', regex: /\bhand[- ]finished\s+joinery\b/i },
  { term: 'mortise-and-tenon', regex: /\bmortise[- ]and[- ]tenon\b/i },
  { term: 'dovetail', regex: /\bdovetail\b/i },
  { term: 'interlocking joinery', regex: /\binterlocking\s+joinery\b/i },
  { term: 'corner bracing', regex: /\bcorner\s+bracing\b/i },
  { term: 'cross-braced', regex: /\bcross[- ]braced\b/i },
  { term: 'kiln-dried', regex: /\bkiln[- ]dried\b/i },
  { term: 'kiln-seasoned', regex: /\bkiln[- ]seasoned\b/i },
  { term: 'precision-milled', regex: /\bprecision[- ]milled\b/i },
  { term: 'precision milling', regex: /\bprecision\s+milling\b/i },
  { term: 'precision-machined', regex: /\bprecision[- ]machined\b/i },
  { term: 'gas-assist struts', regex: /\bgas[- ]assist\s+struts?\b/i },
  { term: 'gas lift pistons', regex: /\bgas\s+lift\s+pistons?\b/i },
  { term: 'steel lift brackets', regex: /\bsteel\s+lift\s+brackets?\b/i },
  { term: 'sliding lids', regex: /\bsliding\s+lids?\b/i },
  { term: 'drawer dividers', regex: /\bdrawer\s+dividers?\b/i },
  { term: 'cosmetic compartments', regex: /\bcosmetic\s+compartments?\b/i },
  { term: 'divided internal sections', regex: /\bdivided\s+internal\s+sections?\b/i },
  { term: 'partitioned internal sections', regex: /\bpartitioned\s+internal\b/i },
  { term: 'mattress airflow', regex: /\bmattress\s+airflow\b/i },
  { term: 'mattress ventilation', regex: /\bmattress\s+ventilation\b/i },
  { term: 'spinal support', regex: /\bspinal\s+support\b/i },
  { term: 'postural support', regex: /\bpostural\s+support\b/i },
  { term: 'postural alignment', regex: /\bpostural\s+alignment\b/i },
  { term: 'anti-scratch', regex: /\banti[- ]scratch\b/i },
  { term: 'scratch-resistant', regex: /\bscratch[- ]resistant\b/i },
  { term: 'moisture-resistant', regex: /\bmoisture[- ]resistant\b/i },
  { term: 'non-porous', regex: /\bnon[- ]porous\b/i },
  { term: 'water-resistant', regex: /\bwater[- ]resistant\b/i },
  { term: 'anti-termite', regex: /\banti[- ]termite\b/i },
  { term: 'borer-proof', regex: /\bborer[- ]proof\b/i },
  { term: 'wobble-free', regex: /\bwobble[- ]free\b/i },
  { term: 'prevents drawer binding', regex: /\bprevents?\s+drawer\s+binding\b/i },
  { term: 'engineered for heavy loads', regex: /\bengineered\s+for\s+heavy\s+loads\b/i },
  { term: 'acoustic dampening', regex: /\bacoustic\s+dampening\b/i },
  { term: 'enduring density', regex: /\benduring\s+density\b/i },
  { term: 'dependable stability', regex: /\bdependable\s+stability\b/i },
  { term: 'smooth drawer action', regex: /\bsmooth(?:ly)?\s+(?:drawer\s+action|drawer\s+operation|drawer\s+travel|running\s+drawers?|sliding\s+drawer)\b/i },
  { term: 'effortless hydraulic lift', regex: /\b(?:effortless|smooth)\s+hydraulic\s+lift\b/i },
  { term: 'rigid mattress support', regex: /\b(?:rigid|unwavering)\s+(?:mattress\s+support|platform\s+stability)\b/i },
  { term: 'robust door alignment', regex: /\brobust\s+door\s+alignment\b/i },
  { term: 'dust protection', regex: /\b(?:dust\s+protection|ambient\s+dust)\b/i },
  { term: 'full-length hanging rails', regex: /\bfull[- ]length\s+hanging\s+rails?\b/i },
  { term: 'wipe-clean surfaces', regex: /\bwipe[- ]clean\b/i },
  { term: 'load-bearing capacity', regex: /\bload[- ]bearing\s+capacity\b/i },
];

const KNOWN_MATERIALS = [
  'sheesham wood',
  'sheesham',
  'mango wood',
  'mango',
  'teak wood',
  'teak',
  'solid wood',
  'rubberwood',
  'oak',
  'walnut wood',
  'particle board',
  'engineered wood',
  'mdf',
  'plywood',
  'metal',
  'steel',
  'iron',
  'glass',
  'cane',
  'fabric',
  'velvet',
  'leatherette',
  'foam',
  'memory foam',
  'latex',
  'coir',
  'bonnell spring',
  'pocket spring',
  'spring',
];

/**
 * Extracts a normalized facts inventory from raw product input.
 */
function extractProductFacts(product = {}) {
  const primaryMat = (product.primary_material || '').trim();
  const secondaryMat = (product.secondary_material || '').trim();
  const finish = (product.color_finish || '').trim();
  const color = (product.color || '').trim();
  const storageType = (product.storage_type || '').trim();
  const subcategory = (product.subcategory || '').trim();
  const category = (product.category || 'Bedroom').trim();
  const name = (product.name || '').trim();
  const shortName = (product.product_short_name || name.split(/\s+/)[0] || 'Product').trim();
  const seating = (product.seating_capacity || '').trim();
  const price = product.price || null;
  const warranty = product.warranty_months || 0;
  const dimensions = (product.dimensions || '').trim();
  const weight = (product.weight || '').trim();

  const isNonStorage = !storageType || /non|no\s*storage|open/i.test(storageType);
  const isHydraulic = /hydraulic/i.test(storageType);
  const isBoxStorage = /box|drawer/i.test(storageType) && !isHydraulic;
  const isOpenAndClosed = /open\s*&\s*closed/i.test(storageType);

  const allowedMaterials = [primaryMat, secondaryMat].filter(Boolean).map((m) => m.toLowerCase());
  const allowedFinishes = [finish, color].filter(Boolean).map((f) => f.toLowerCase());

  if (product.variant_axes) {
    if (Array.isArray(product.variant_axes.finish)) {
      for (const f of product.variant_axes.finish) allowedFinishes.push(f.toLowerCase());
    }
    if (Array.isArray(product.variant_axes.colour)) {
      for (const c of product.variant_axes.colour) allowedFinishes.push(c.toLowerCase());
    }
  }

  return {
    id: product.id || '',
    name,
    shortName,
    category,
    subcategory,
    primaryMaterial: primaryMat,
    secondaryMaterial: secondaryMat,
    allowedMaterials,
    finish,
    color,
    allowedFinishes,
    storageType,
    isNonStorage,
    isHydraulic,
    isBoxStorage,
    isOpenAndClosed,
    seating,
    price,
    warranty,
    dimensions,
    weight,
  };
}

/**
 * Audits generated summary for strict factual grounding against input facts.
 * Returns { valid: boolean, errors: string[], verifiedClaims: Array<{ sentence, claim, supported, reason }> }
 */
function auditFactualGrounding(summary, productInput) {
  if (!summary || typeof summary !== 'string') {
    return { valid: false, errors: ['Missing or empty summary text'], verifiedClaims: [] };
  }

  const facts = extractProductFacts(productInput);
  const errors = [];
  const verifiedClaims = [];

  const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || [summary.trim()];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sLower = s.toLowerCase();

    // 1. Check for banned ungrounded engineering/manufacturing terms
    for (const b of BANNED_UNGROUNDED_TERMS) {
      if (b.regex.test(s)) {
        const msg = `Ungrounded claim in sentence ${i + 1}: contains banned fabricated detail "${b.term}".`;
        errors.push(msg);
        verifiedClaims.push({
          sentenceIndex: i,
          sentence: s,
          claim: b.term,
          supported: false,
          reason: 'Fabricated manufacturing/mechanical attribute not present in source catalog data',
        });
      }
    }

    // 2. Check material claims
    for (const mat of KNOWN_MATERIALS) {
      const matRegex = new RegExp(`\\b${mat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (matRegex.test(sLower)) {
        // Check if this is actually a valid finish reference (e.g. "teak finish", "walnut finish", "oak finish")
        const isAllowedFinish = facts.allowedFinishes.some((af) => af.includes(mat) || mat.includes(af));
        const isFinishPhrase = new RegExp(`\\b${mat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:finish|colour|color|tones?|shade|surface|stain)\\b`, 'i').test(sLower) ||
          new RegExp(`(?:in\\s+a|with\\s+a)\\s+${mat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sLower);

        if (isAllowedFinish && isFinishPhrase) {
          verifiedClaims.push({
            sentenceIndex: i,
            sentence: s,
            claim: `Finish/Color: ${mat}`,
            supported: true,
            reason: `Matches source color_finish: ${facts.finish}`,
          });
          continue;
        }

        // Check if this material is allowed for this product
        const isSupported = facts.allowedMaterials.some((allowed) => allowed.includes(mat) || mat.includes(allowed));
        if (!isSupported && !facts.allowedMaterials.some((am) => am.includes('wood') && (mat.includes('wood') || mat === 'solid wood'))) {
          // If it matches an allowed finish, treat as finish rather than material error
          if (isAllowedFinish) {
            verifiedClaims.push({
              sentenceIndex: i,
              sentence: s,
              claim: `Finish: ${mat}`,
              supported: true,
              reason: `Matches source finish: ${facts.finish}`,
            });
            continue;
          }
          const msg = `Unsupported material in sentence ${i + 1}: mentions "${mat}" which does not match input primary_material "${facts.primaryMaterial}" or secondary_material "${facts.secondaryMaterial}".`;
          errors.push(msg);
          verifiedClaims.push({
            sentenceIndex: i,
            sentence: s,
            claim: `Material: ${mat}`,
            supported: false,
            reason: `Product input material is "${facts.primaryMaterial}"`,
          });
        } else {
          verifiedClaims.push({
            sentenceIndex: i,
            sentence: s,
            claim: `Material: ${mat}`,
            supported: true,
            reason: `Matches source material: ${facts.primaryMaterial}`,
          });
        }
      }
    }

    // 3. Check storage claims
    if (facts.isNonStorage) {
      if (/\b(hydraulic|gas lift|pull-out drawer|box storage|under-bed drawers)\b/i.test(s)) {
        const msg = `Contradictory storage claim in sentence ${i + 1}: product is Non Storage, but summary claims built-in storage mechanism.`;
        errors.push(msg);
        verifiedClaims.push({
          sentenceIndex: i,
          sentence: s,
          claim: 'Storage mechanism',
          supported: false,
          reason: 'Source product storage_type is Non Storage / Open',
        });
      }
    } else if (facts.isHydraulic) {
      if (/\b(box storage compartments|sliding drawers|drawer compartments)\b/i.test(s) && !/\bhydraulic\b/i.test(s)) {
        const msg = `Contradictory storage claim in sentence ${i + 1}: product has Hydraulic Storage, but summary claims drawer/box storage.`;
        errors.push(msg);
        verifiedClaims.push({
          sentenceIndex: i,
          sentence: s,
          claim: 'Drawer/box storage mechanism',
          supported: false,
          reason: 'Source product storage_type is Hydraulic Storage',
        });
      }
    }

    // 4. Raw dimensions check in summary
    if (/\b\d+(?:\.\d+)?\s*(?:m|cm|mm|in|inch|inches|ft|feet)\b\s*(?:x\s*\d+(?:\.\d+)?\s*(?:m|cm|mm|in|inch|inches|ft|feet)\b)+/i.test(s)) {
      errors.push(`Raw dimension string present in sentence ${i + 1}. Numbers and dimensions belong only in specifications.`);
      verifiedClaims.push({
        sentenceIndex: i,
        sentence: s,
        claim: 'Raw dimensions in prose',
        supported: false,
        reason: 'Raw numeric dimensions forbidden in summary prose',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    verifiedClaims,
    factInventory: facts,
  };
}

module.exports = {
  auditFactualGrounding,
  extractProductFacts,
  BANNED_UNGROUNDED_TERMS,
};
