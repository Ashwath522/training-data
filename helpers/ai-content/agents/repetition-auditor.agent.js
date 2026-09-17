'use strict';

/**
 * Repetition & Semantic Auditor Agent
 * Performs multi-level auditing across Exact, Sentence-Level, N-Gram, Structural, Semantic,
 * and Template-Signature repetition vectors.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about',
  'into', 'through', 'after', 'over', 'between', 'out', 'against', 'during', 'without',
  'before', 'under', 'around', 'among', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'this', 'that', 'these', 'those', 'it', 'its',
  'as', 'of', 'from', 'your', 'our', 'their', 'any', 'each', 'while', 'when', 'where',
]);

const ATTRIBUTE_TERMS_RE = /\b(care and maintenance|warranty of|product short name|bedroom storage|engineered wood|sheesham wood|mango wood|solid wood|particle board|rubberwood|hdf|hydraulic storage|box storage|storage bed|queen size|king size|single size|bunk bed|study table|dressing table|bedside table|chest of drawers|sliding door|door wardrobe|size mattress|latex core|latex cushioning|coir fiber|natural latex|natural coir|teak finish|walnut finish|natural finish|oak finish|mahogany finish)\b/i;

function normalizeTokens(text, shortName = '', material = '', finish = '') {
  if (!text) return [];
  const lowerShort = (shortName || '').toLowerCase();
  const lowerMat = (material || '').toLowerCase();
  const lowerFin = (finish || '').toLowerCase();

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => (
      w.length > 1 &&
      !STOPWORDS.has(w) &&
      w !== lowerShort &&
      !lowerMat.includes(w) &&
      !lowerFin.includes(w) &&
      !/^\d+$/.test(w)
    ));
}

function extractNgrams(text, n = 6) {
  if (!text) return [];
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const ngrams = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function computeJaccard(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (!setA.size && !setB.size) return 1.0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Classifies a sentence into a functional intent category.
 */
function classifySentenceIntent(sentence, position, totalSentences) {
  const s = sentence.toLowerCase();

  if (position === totalSentences - 1) {
    return 'CONCLUSION';
  }
  if (position === 0) {
    if (/\b(morning|evening|routine|daily|preparation|wake|nightly|settle|unwind)\b/i.test(s)) return 'USE_CASE';
    if (/\b(grain|wood|timber|sheesham|mango|teak|finish|texture|surface|panel|cane|fabric|latex|coir)\b/i.test(s)) return 'MATERIAL_SENSORY';
    if (/\b(room|space|perimeter|layout|circulation|footprint|lightness|balance|scale)\b/i.test(s)) return 'SPATIAL_OBSERVATION';
    if (/\b(not every|some furniture|simplicity|restraint|clarity)\b/i.test(s)) return 'RHETORICAL_CONTRAST';
    return 'OBSERVATION';
  }

  if (/\b(storage|drawer|compartment|hydraulic|lift|box|linen|blanket|hanging|rail|shelf)\b/i.test(s)) {
    return 'STORAGE_FUNCTION';
  }
  if (/\b(sheesham|mango|teak|rubberwood|particle board|engineered wood|fabric|upholstery|slat|panel|latex|coir|foam)\b/i.test(s)) {
    return 'MATERIAL_DETAIL';
  }
  if (/\b(floor|clearance|legroom|perimeter|circulation|under-bed|seating|room|footprint)\b/i.test(s)) {
    return 'SPATIAL_FUNCTION';
  }
  if (/\b(grooming|vanity|stool|mirror|cosmetics|reading|rest|sleep|support|play|study|desk|chair)\b/i.test(s)) {
    return 'PRACTICAL_USE';
  }

  return 'FUNCTION';
}

const TEMPLATE_SIGNATURE_PATTERNS = [
  { pattern: /^[A-Z][a-z]+\s+(?:proportions|clarity|simplicity)\s+(?:defines|inspires|shapes|anchors)\b/i, name: 'abstract_noun_defines' },
  { pattern: /^Bring\s+[^.]+\s+to\s+(?:your|any)\s+(?:room|space)\s+with\s+the\b/i, name: 'bring_x_to_your_room' },
  { pattern: /^[A-Z][a-z]+\s+anchors\s+the\s+space\s+with\b/i, name: 'name_anchors_the_space' },
  { pattern: /^[A-Z][a-z]+\s+complements\s+the\s+bedroom\s+with\s+warm\s+[^,]+,\s+[^,]+,\s+and\s+balanced\s+aesthetic\s+harmony/i, name: 'complements_balanced_aesthetic_harmony' },
];

/**
 * Audits a generated summary against the accepted memory of previously generated products
 * in the same category.
 */
function auditRepetition(summary, productInput, categoryMemory = []) {
  const shortName = productInput.product_short_name || (productInput.name ? productInput.name.split(/\s+/)[0] : '');
  const primaryMat = productInput.primary_material || '';
  const finish = productInput.color_finish || '';

  const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || [summary.trim()];
  const opener = sentences[0] || '';
  const closer = sentences[sentences.length - 1] || '';

  const failureTypes = [];
  let matchedProduct = null;
  let matchedSentence = null;
  let highestSimilarity = 0;
  let reason = '';
  let rootCause = '';
  const recommendedFix = [];

  const candidateNormSentences = sentences.map((s) => normalizeTokens(s, shortName, primaryMat, finish));

  // 1. Template Signature Check
  for (const t of TEMPLATE_SIGNATURE_PATTERNS) {
    if (t.pattern.test(opener) || t.pattern.test(closer) || t.pattern.test(summary)) {
      failureTypes.push('TEMPLATE_SIGNATURE');
      reason = `Matches forbidden repetitive template formula "${t.name}".`;
      rootCause = 'Use of formulaic sentence pattern prohibited in training dataset generation.';
      recommendedFix.push('Rewrite using direct product attributes or specific functional moment without formulaic phrasing.');
    }
  }

  // Classify current structural intent sequence
  const currentStructure = sentences.map((s, idx) => classifySentenceIntent(s, idx, sentences.length)).join(' -> ');

  // 2. Cross-product comparison against category memory
  let structuralMatchCount = 0;

  for (const prev of categoryMemory) {
    if (prev.id === productInput.id) continue;

    const prevSummary = prev.summary || '';
    const prevSentences = prevSummary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || [];
    const prevShortName = prev.shortName || '';
    const prevMat = prev.primary_material || '';
    const prevFin = prev.color_finish || '';

    // Level 1: Exact Full Summary Duplicates
    if (summary.trim().toLowerCase() === prevSummary.trim().toLowerCase()) {
      failureTypes.push('EXACT_REPETITION');
      matchedProduct = prev.id;
      matchedSentence = prevSummary;
      highestSimilarity = 1.0;
      reason = `Exact duplicate of full summary from product "${prev.id}".`;
      rootCause = 'Identical summary generated for two different products.';
      recommendedFix.push('Select a completely different narrative angle and structural archetype.');
      break;
    }

    // Level 2: Sentence-by-Sentence Check across ALL intermediate sentences
    for (let cIdx = 0; cIdx < sentences.length; cIdx++) {
      const cSent = sentences[cIdx];
      const cNorm = candidateNormSentences[cIdx];

      for (let pIdx = 0; pIdx < prevSentences.length; pIdx++) {
        const pSent = prevSentences[pIdx];
        const pNorm = normalizeTokens(pSent, prevShortName, prevMat, prevFin);

        // Check exact match (or exact after noun normalization)
        if (cSent.trim().toLowerCase() === pSent.trim().toLowerCase()) {
          failureTypes.push('EXACT_SENTENCE_REPETITION');
          matchedProduct = prev.id;
          matchedSentence = pSent;
          highestSimilarity = 1.0;
          reason = `Sentence ${cIdx + 1} is an exact duplicate of sentence in product "${prev.id}".`;
          rootCause = 'Exact sentence template reused across products.';
          recommendedFix.push(`Change idea in sentence ${cIdx + 1} to a different supported product differentiator.`);
          break;
        }

        const sentJaccard = computeJaccard(cNorm, pNorm);
        if (cNorm.length >= 4 && pNorm.length >= 4 && sentJaccard >= 0.75) {
          if (sentJaccard > highestSimilarity) {
            highestSimilarity = sentJaccard;
            matchedProduct = prev.id;
            matchedSentence = pSent;
          }
          if (!failureTypes.includes('NEAR_DUPLICATE_SENTENCE')) {
            failureTypes.push('NEAR_DUPLICATE_SENTENCE');
            reason = `Sentence ${cIdx + 1} shares ${(sentJaccard * 100).toFixed(1)}% token similarity with sentence in product "${prev.id}": "${pSent.slice(0, 70)}..."`;
            rootCause = 'Slot-substitution or near-identical sentence template detected across products.';
            recommendedFix.push(`Express a completely different product observation in sentence ${cIdx + 1}.`);
          }
        }
      }
      if (failureTypes.includes('EXACT_SENTENCE_REPETITION')) break;
    }

    // Level 3: 6-Gram Overlap Check for distinctive repeated phrasing
    const candidate6Grams = extractNgrams(summary, 6);
    const prev6Grams = new Set(extractNgrams(prevSummary, 6));
    for (const ng of candidate6Grams) {
      if (prev6Grams.has(ng) && !STOPWORDS.has(ng.split(' ')[0])) {
        // Exclude purely factual attribute combinations
        if (!ATTRIBUTE_TERMS_RE.test(ng)) {
          if (!failureTypes.includes('REPEATED_NGRAM')) {
            failureTypes.push('REPEATED_NGRAM');
            reason = `Summary shares repeated phrase "${ng}" with product "${prev.id}".`;
            rootCause = 'Formulaic phrase reused across summaries.';
            recommendedFix.push(`Avoid phrase "${ng}" and phrase the product trait uniquely.`);
          }
        }
      }
    }

    // Level 4: Structural Duplicate Tracking
    if (prev.structure && prev.structure === currentStructure) {
      structuralMatchCount++;
    }
  }

  // If more than 40% of category items use this exact structure, flag structural repetition
  if (categoryMemory.length >= 8 && structuralMatchCount / categoryMemory.length > 0.40) {
    if (!failureTypes.includes('STRUCTURAL_REPETITION')) {
      failureTypes.push('STRUCTURAL_REPETITION');
      reason = `Structure "${currentStructure}" is overused in this category (${structuralMatchCount}/${categoryMemory.length} items).`;
      rootCause = 'Generator repeatedly selecting identical sentence intent sequence.';
      recommendedFix.push('Switch to a different structural archetype (e.g. Problem-Solution, Finish-led, or Direct-fact).');
    }
  }

  const passed = failureTypes.length === 0;

  if (passed) {
    return {
      status: 'PASS',
      product_id: productInput.id,
      category: productInput.category || 'Bedroom',
      structure: currentStructure,
      highest_similarity_score: parseFloat(highestSimilarity.toFixed(2)),
    };
  }

  return {
    status: 'FAIL',
    product_id: productInput.id,
    category: productInput.category || 'Bedroom',
    failure_types: failureTypes,
    matched_product: matchedProduct,
    matched_sentence: matchedSentence,
    similarity_score: parseFloat(highestSimilarity.toFixed(2)),
    reason,
    root_cause: rootCause,
    recommended_fix: recommendedFix,
  };
}

module.exports = {
  auditRepetition,
  classifySentenceIntent,
  computeJaccard,
  extractNgrams,
  normalizeTokens,
};
