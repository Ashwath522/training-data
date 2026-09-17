/**
 * Single Responsibility: Orchestrates the generation of the final product content, assembling specs, generated prose, and deterministic rules.
 * Expected to be called from: CLI scripts (e.g. scripts/feedbackLoop.js, scripts/generateFromPaste.js, test/runTest.js).
 */
const fs = require('fs');
const path = require('path');
const { generateContent } = require('./llmClient');
const { buildPrompt } = require('./promptBuilder');
const { applySessionAdjustments, getSessionAdjustments } = require('./conversationSession');
const { getReturnsBlock } = require('./returnsLookup');
const { buildQualityPromise } = require('./qualityComposer');
const { validateItem } = require('./validator');
const { PLACEHOLDER_LINKS } = require('./schema');

const { loadOpeners, appendOpener, ngramOverlapCheck, loadPhraseFrequencies, checkPhraseFrequency, structuralPatternCheck, buildDiversityHint } = require('./openerStore');

const PRICE_BANDS_PATH = path.join(__dirname, '..', 'data', 'price_bands.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'generated');

function loadPriceBands() {
  try {
    return JSON.parse(fs.readFileSync(PRICE_BANDS_PATH, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`Error parsing JSON in ${PRICE_BANDS_PATH}: ${e.message}`);
    }
    return { Default: { good_max: 5000, mid_max: 20000 } };
  }
}

async function generateOne(product, priceBands, attempt = 1, conv_id = null, attemptHistory = []) {
  let relaxLengthCheck = false;
  let lengthDirection = null;

  if (conv_id) {
    const turns = getSessionAdjustments(conv_id);
    if (turns.length > 0) {
      const latestTurn = turns[turns.length - 1];
      if (/\b(short|brief|concis)/i.test(latestTurn.msg)) {
        relaxLengthCheck = true;
        lengthDirection = 'shorter';
      } else if (/\b(long|length|detail)/i.test(latestTurn.msg)) {
        relaxLengthCheck = true;
        lengthDirection = 'longer';
      }
    }
  }

  const { systemPrompt, userPrompt, careMatch } = buildPrompt(product, priceBands, lengthDirection);

  // On first attempt, inject diversity hint from recent real openers to
  // prevent the LLM from reusing the same opener templates.
  const diversityHint = attempt === 1 ? buildDiversityHint(8) : '';
  let finalUserPrompt = conv_id
    ? applySessionAdjustments(conv_id, userPrompt)
    : userPrompt;
  if (diversityHint) finalUserPrompt += '\n' + diversityHint;

  // Targeted correction feedback from previous attempt errors
  if (attempt > 1 && attemptHistory.length > 0) {
    const lastAttempt = attemptHistory[attemptHistory.length - 1];
    const prevErrors = lastAttempt.errors || [];
    
    const bareImperatives = [];
    let secondaryMatError = false;
    let wordCountError = null;
    let namePlacementError = null;
    const repetitionNotes = [];

    for (const err of prevErrors) {
      const politeMatch = err.match(/Polite-tone flag \(bare imperative, human review can override\): "([^"]+)"/);
      if (politeMatch) {
        bareImperatives.push(politeMatch[1]);
      } else if (err.includes('secondary_material should not be generated')) {
        secondaryMatError = true;
      } else if (err.includes('description.summary should be ~70-110 words')) {
        wordCountError = err;
      } else if (err.includes('must mention product_short_name in the CLOSING sentence specifically')) {
        namePlacementError = err;
      } else if (err.startsWith('REPETITION FIX REQUIRED:') || err.startsWith('OVERUSED PHRASE:')) {
        repetitionNotes.push(err);
      }
    }

    let correctionNote = `\n\n=========================================\n!!! CORRECTION REQUIRED FROM PREVIOUS ATTEMPT (${attempt - 1}) !!!\n=========================================\n`;
    let noteIdx = 1;
    if (bareImperatives.length > 0) {
      correctionNote += `${noteIdx++}. POLITE TONE FIX REQUIRED: The following care lines failed because they start with a bare imperative verb:\n` +
        bareImperatives.map(l => `   - "${l}"`).join('\n') +
        `\n   Rewrite ONLY these care instructions to start with a soft framing phrase (e.g. "We recommend...", "It's best to...", "Try to..."), keeping all facts identical.\n`;
    }
    if (secondaryMatError) {
      correctionNote += `${noteIdx++}. OMIT FIELD: Do NOT include "secondary_material" anywhere in your JSON output. That field is handled programmatically.\n`;
    }
    if (namePlacementError && product && product.product_short_name) {
      correctionNote += `${noteIdx++}. NAME PLACEMENT FIX REQUIRED: '${product.product_short_name}' must appear in your FINAL sentence, not earlier. Move the mention there while keeping all other facts and structure intact.\n`;
    }
    if (wordCountError) {
      correctionNote += `${noteIdx++}. WORD COUNT ADJUSTMENT: ${wordCountError}. Adjust your summary length to fit strictly between 70 and 110 words.\n`;
    }
    for (const repNote of repetitionNotes) {
      correctionNote += `${noteIdx++}. ${repNote}\n`;
    }

    finalUserPrompt += correctionNote;
  }

  const llmOutput = await generateContent({ systemPrompt, userPrompt: finalUserPrompt });

  // specifications: passed through unchanged, never generated. Missing
  // values are left out rather than invented.
  const specifications = {};
  for (const field of ['dimensions', 'primary_material', 'secondary_material', 'weight', 'assembly_required', 'seating_capacity', 'color_finish']) {
    if (product[field] !== undefined && product[field] !== null && product[field] !== '') {
      specifications[field] = product[field];
    }
  }

  function generateBulletList(prod) {
    const bullets = [];
    const axes = prod.variant_axes || {};
    
    const sizes = (Array.isArray(axes.size) && axes.size.length > 0) ? axes.size : 
                  (prod.size_of_the_bed ? [prod.size_of_the_bed] : 
                  (prod.seating_capacity ? [prod.seating_capacity] : []));
    if (sizes.length > 0) {
      bullets.push(`Available in ${sizes.join(' and ')} sizes to suit different spaces.`);
    }
    
    const isBedCategory = !prod.category || prod.category.toLowerCase() === 'bedroom' || /bed/i.test(prod.subcategory || '') || /bed/i.test(prod.name || '');
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
    
    const storageOptions = (Array.isArray(axes.storage_type) && axes.storage_type.length > 0) ? axes.storage_type :
                           (prod.storage_type ? [prod.storage_type] : []);
    if (storageOptions.length > 0) {
      const storageStr = storageOptions.join(' and ');
      const normStorageStr = storageStr.toLowerCase().replace(/-/g, ' ');
      if (storageOptions.length === 1 && (normStorageStr.includes('non storage') || normStorageStr.includes('no storage'))) {
        bullets.push(`Features an open, uncluttered base.`);
      } else {
        bullets.push(`Includes ${storageStr.toLowerCase()} for easy access underneath.`);
      }
    }
    
    const finishOptions = (Array.isArray(axes.finish) && axes.finish.length > 0) ? axes.finish :
                          ((prod.finish_name || prod.color_finish) ? [prod.finish_name || prod.color_finish] : []);
    if (finishOptions.length > 0) {
      if (finishOptions.length === 1) {
        bullets.push(`Available in a ${finishOptions[0]} finish.`);
      } else {
        bullets.push(`Available in ${finishOptions.join(' and ')} finishes.`);
      }
    }
    
    const colourOptions = (Array.isArray(axes.colour) && axes.colour.length > 0) ? axes.colour :
                          (prod.primary_color ? [prod.primary_color] : []);
    if (colourOptions.length > 0) {
      if (colourOptions.length === 1) {
        bullets.push(`Available in ${colourOptions[0]} colour.`);
      } else {
        bullets.push(`Also available in ${colourOptions.join(', ')} colours.`);
      }
    }
    
    return bullets;
  }

  llmOutput.description.key_features = generateBulletList(product);

  const returns = getReturnsBlock(product.category);

  const applicable = llmOutput.warranty?.applicable ?? Boolean(product.warranty_months);
  const warranty = {
    applicable,
    duration_months: applicable ? (product.warranty_months || null) : null,
    status_line: `**${applicable ? 'Yes' : 'No'}**, it has a warranty of **${applicable ? (product.warranty_months || 0) : 0} months**.`,
    points: (llmOutput.warranty?.points || []).slice(0, 4),
    link: PLACEHOLDER_LINKS.warranty
  };

  const qualityPromise = buildQualityPromise(product.category, warranty, specifications);

  const item = {
    description: llmOutput.description,
    specifications,
    care_and_maintenance: llmOutput.care_and_maintenance,
    warranty,
    returns,
    quality_promise: qualityPromise,
    _meta: {
      needs_review: careMatch.needs_review || false,
      care_category_matched: careMatch.category
    }
  };

  const result = validateItem(item, product, { relaxLengthCheck });

  const currentAttemptRecord = {
    attempt,
    valid: result.valid,
    errors: result.errors,
    output_snippet: llmOutput.description?.summary?.slice(0, 100)
  };
  const updatedHistory = [...attemptHistory, currentAttemptRecord];

  if (!result.valid && attempt < 3) {
    console.warn(`[retry ${attempt}/3] product ${product.id} failed validation: ${result.errors.join('; ')}`);
    return generateOne(product, priceBands, attempt + 1, conv_id, updatedHistory);
  }

  if (!result.valid) {
    item._meta.needs_review = true;
    item._meta.validation_errors = result.errors;
    item._meta.attempt_history = updatedHistory;
    return item;
  }

  // Similarity & Repetition Check on valid items
  const summary = item.description?.summary || '';
  const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(Boolean) || (summary.trim() ? [summary.trim()] : []);
  const opener = sentences[0] || '';
  const closer = sentences.length > 0 ? sentences[sentences.length - 1] : '';

  const existingRecords = loadOpeners();
  const existingOpeners = existingRecords.map(r => ({ id: r.id, sentence: r.opener, source: r.source }));
  const existingClosers = existingRecords.map(r => ({ id: r.id, sentence: r.closer, source: r.source }));

  const openerCheck = opener ? ngramOverlapCheck(opener, existingOpeners) : { tooSimilar: false };
  const closerCheck = closer ? ngramOverlapCheck(closer, existingClosers) : { tooSimilar: false };

  // Structural pattern check: catches templates that vary words but keep the same narrative structure
  const openerStructuralCheck = opener ? structuralPatternCheck(opener, existingRecords, 'opener') : { tooSimilar: false };
  const closerStructuralCheck = closer ? structuralPatternCheck(closer, existingRecords, 'closer') : { tooSimilar: false };

  const isTooSimilar = openerCheck.tooSimilar || closerCheck.tooSimilar
    || openerStructuralCheck.tooSimilar || closerStructuralCheck.tooSimilar;

  // Exact phrase frequency check — raised threshold to 4 (was 3) to reduce false positives
  const phraseFreqMap = loadPhraseFrequencies();
  const phraseCheckResults = sentences.map((sentence, idx) => ({
    sentenceIndex: idx,
    sentence,
    ...checkPhraseFrequency(sentence, phraseFreqMap, 4)
  }));
  const flaggedSentenceChecks = phraseCheckResults.filter(r => r.flagged);
  const hasOverusedPhrases = flaggedSentenceChecks.length > 0;

  if ((isTooSimilar || hasOverusedPhrases) && attempt < 3) {
    const retryErrors = [];
    if (openerCheck.tooSimilar) {
      retryErrors.push(`REPETITION FIX REQUIRED: Your opening sentence is too similar to a previously generated product's opener (matched: '${openerCheck.matchedSentence}'). Rewrite the opening sentence using a completely different angle and vocabulary. Keep all facts the same, only change the structure and phrasing.`);
    }
    if (closerCheck.tooSimilar) {
      retryErrors.push(`REPETITION FIX REQUIRED: Your closing sentence is too similar to a previously generated product's closer (matched: '${closerCheck.matchedSentence}'). Rewrite the closing sentence using different vocabulary and sentence structure.`);
    }
    if (openerStructuralCheck.tooSimilar) {
      retryErrors.push(`STRUCTURAL REPETITION: Your opener follows the narrative template "${openerStructuralCheck.patternLabel}" which has been used in ${openerStructuralCheck.patternCount} recent products. Choose a completely different opening angle that does not fit this pattern.`);
    }
    if (closerStructuralCheck.tooSimilar) {
      retryErrors.push(`STRUCTURAL REPETITION: Your closer follows the narrative template "${closerStructuralCheck.patternLabel}" which has been used in ${closerStructuralCheck.patternCount} recent products. Choose a completely different closing angle.`);
    }
    if (hasOverusedPhrases) {
      for (const res of flaggedSentenceChecks) {
        const positionLabel = res.sentenceIndex === 0 ? 'opening sentence' :
                              (res.sentenceIndex === sentences.length - 1 ? 'closing sentence' : `sentence ${res.sentenceIndex + 1}`);
        for (const p of res.repeatedPhrases) {
          retryErrors.push(`OVERUSED PHRASE: '${p.phrase}' in your ${positionLabel} has already appeared ${p.count}+ times across this dataset. Avoid it and any close variant.`);
        }
      }
    }

    console.warn(`[retry ${attempt}/3] product ${product.id} failed repetition/phrase check: ${retryErrors.join('; ')}`);
    const repetitionAttemptRecord = {
      attempt,
      valid: true,
      repetition_failed: isTooSimilar,
      phrase_overuse_failed: hasOverusedPhrases,
      errors: retryErrors,
      output_snippet: llmOutput.description?.summary?.slice(0, 100)
    };
    return generateOne(product, priceBands, attempt + 1, conv_id, [...attemptHistory, repetitionAttemptRecord]);
  }

  if (isTooSimilar) {
    const matchedId = openerCheck.tooSimilar ? openerCheck.matchedAgainst : closerCheck.matchedAgainst;
    const matchedScore = openerCheck.tooSimilar ? openerCheck.score : closerCheck.score;
    item._meta.repetition_flagged = true;
    item._meta.repetition_matched_id = matchedId;
    item._meta.repetition_score = matchedScore;
    console.warn(`[repetition warning] product ${product.id} accepted on attempt ${attempt} with repetition flag against ${matchedId} (score: ${matchedScore})`);
  }

  if (hasOverusedPhrases) {
    const allOverused = [];
    for (const res of flaggedSentenceChecks) {
      allOverused.push(...res.repeatedPhrases);
    }
    item._meta.phrase_overuse_flagged = true;
    item._meta.overused_phrases = allOverused;
    console.warn(`[phrase overuse warning] product ${product.id} accepted on attempt ${attempt} with phrase overuse flag: ${allOverused.map(p => `'${p.phrase}' (${p.count}x)`).join(', ')}`);
  }

  // Persist opener and closer — tagged as 'real' so mock test runs don't pollute
  appendOpener({
    id: product.id,
    name: product.name,
    opener,
    closer,
    sentences,
    source: 'real',
  });

  item._meta.attempt_history = updatedHistory;

  return item;
}

async function generateBatch(products) {
  const priceBands = loadPriceBands();
  const results = [];

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const product of products) {
    try {
      const item = await generateOne(product, priceBands);
      const outPath = path.join(OUTPUT_DIR, `${product.id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(item, null, 2));
      results.push({ id: product.id, status: item._meta.needs_review ? 'needs_review' : 'ok', item });
    } catch (err) {
      results.push({ id: product.id, status: 'error', error: err.message });
    }
    const delayStr = process.env.GENERATE_DELAY_MS;
    const delayMs = delayStr !== undefined ? parseInt(delayStr, 10) : (process.env.MODE === 'test' ? 0 : 15000);
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

function regenerateInConversation({ conv_id, product, priceBands }) {
  return generateOne(product, priceBands, 1, conv_id);
}

module.exports = { generateOne, generateBatch, loadPriceBands, regenerateInConversation };

if (require.main === module) {
  const productsPath = path.join(__dirname, '..', 'data', 'products.json');
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
  } catch (e) {
    console.error(`Error parsing JSON in ${productsPath}: ${e.message}`);
    process.exit(1);
  }

  generateBatch(products)
    .then((results) => {
      const ok = results.filter((r) => r.status === 'ok').length;
      const review = results.filter((r) => r.status === 'needs_review').length;
      const errored = results.filter((r) => r.status === 'error').length;
      console.log(`Generated ${results.length} items -> ${ok} ok, ${review} need review, ${errored} errored.`);
      console.log(`Output written to ${OUTPUT_DIR}`);
    })
    .catch((err) => {
      console.error('Batch generation failed:', err);
      process.exit(1);
    });
}
