'use strict';

const logger = require('../../common/logger');
const { generateContent } = require('./ai-llm-client.helper');
const { buildPrompt, loadPriceBands, loadRulesFromMongo } = require('./ai-prompt-builder.helper');
const { getReturnsBlock } = require('./ai-returns-lookup.helper');
const { buildQualityPromise } = require('./ai-quality-composer.helper');
const { validateItem } = require('./ai-validator.helper');
const { PLACEHOLDER_LINKS } = require('./ai-schema.helper');
const {
  loadOpeners,
  appendOpener,
  ngramOverlapCheck,
  loadPhraseFrequencies,
  checkPhraseFrequency,
  structuralPatternCheck,
  buildDiversityHint,
} = require('./ai-opener-store.helper');

function generateBulletList(prod) {
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

/**
 * Orchestrates generating, validating, and assembling content for one product.
 */
async function generateOne(
  product,
  priceBands = null,
  attempt = 1,
  context = {},
  attemptHistory = [],
) {
  const pb = priceBands || loadPriceBands();
  const rules = context.rules || (await loadRulesFromMongo(context.company_id, context.application_id, product.category));

  const selectedTone = context.selected_tone || context.tone || null;
  const { systemPrompt, userPrompt, careMatch } = await buildPrompt(product, pb, null, rules, selectedTone, {
    company_id: context.company_id,
    application_id: context.application_id,
  });

  // Build diversity hint from recent real openers and inject into the user prompt.
  // This prevents the LLM from reusing opener templates and structural patterns.
  const diversityHint = attempt === 1 ? buildDiversityHint(8) : '';
  let finalUserPrompt = diversityHint ? userPrompt + '\n' + diversityHint : userPrompt;

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
      correctionNote +=
        `${noteIdx++}. POLITE TONE FIX REQUIRED: The following care lines failed because they start with a bare imperative verb:\n` +
        bareImperatives.map((l) => `   - "${l}"`).join('\n') +
        '\n   Rewrite ONLY these care instructions to start with a soft framing phrase (e.g. "We recommend...", "It\'s best to...", "Try to..."), keeping all facts identical.\n';
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

  // specifications: deterministic pass-through
  const specifications = {};
  for (const field of [
    'dimensions',
    'primary_material',
    'secondary_material',
    'weight',
    'assembly_required',
    'seating_capacity',
    'color_finish',
  ]) {
    if (product[field] !== undefined && product[field] !== null && product[field] !== '') {
      specifications[field] = product[field];
    }
  }

  // Policy 1: LLM infrastructure error (network/429/5xx) -> retry once, then mark needs_review.
  // Do NOT burn the 3-attempt content-correction budget on infra failures.
  // Decompose copy generation into 4 isolated per-agent context windows
  const moodContext = {
    agent: 'Agent 1: Mood Line',
    category: product.category,
    subcategory: product.subcategory,
    primary_material: product.primary_material,
    aesthetic_style: product.design_details || 'refined modern aesthetic',
    tone_rule: pb.toneRuleText,
  };
  logger.info(`[aiOrchestrator] Invoking Agent 1 (Mood Line) with isolated context: ${JSON.stringify(moodContext)}`);

  const introContext = {
    agent: 'Agent 2: Intro',
    category: product.category,
    subcategory: product.subcategory,
    product_type: product.subcategory || product.category,
    core_function: `furniture for ${product.subcategory || product.category}`,
    tone_rule: pb.toneRuleText,
  };
  logger.info(`[aiOrchestrator] Invoking Agent 2 (Intro) with isolated context: ${JSON.stringify(introContext)}`);

  const storyContext = {
    agent: 'Agent 3: Story',
    category: product.category,
    subcategory: product.subcategory,
    primary_material: product.primary_material,
    color_finish: product.color_finish,
    dimensions_descriptor: product.dimensions ? 'proportioned for balanced room flow' : '',
    craftsmanship: 'durable construction and authentic finish',
    tone_rule: pb.toneRuleText,
  };
  logger.info(`[aiOrchestrator] Invoking Agent 3 (Story) with isolated context: ${JSON.stringify(storyContext)}`);

  const closeContext = {
    agent: 'Agent 4: Close',
    product_short_name: product.product_short_name || (product.name ? product.name.split(/\s+/)[0] : 'Product'),
    category: product.category,
    subcategory: product.subcategory,
    tone_rule: pb.toneRuleText,
  };
  logger.info(`[aiOrchestrator] Invoking Agent 4 (Close) with isolated context: ${JSON.stringify(closeContext)}`);

  let llmOutput = null;
  let infraAttempts = 0;
  while (infraAttempts < 2) {
    infraAttempts++;
    try {
      llmOutput = await generateContent({
        systemPrompt,
        userPrompt: finalUserPrompt,
        options: {
          ...context.options,
          agentContexts: { moodContext, introContext, storyContext, closeContext },
        },
      });
      break;
    } catch (llmErr) {
      logger.warn(`[aiOrchestrator] LLM API error on attempt ${infraAttempts}/2 for product ${product.id || product.name}: ${llmErr.message}`);
      if (infraAttempts >= 2) {
        return {
          description: {
            summary: product.name || '',
            mood_line: '',
            intro: '',
            story: '',
            close: '',
            key_features: generateBulletList(product),
          },
          specifications,
          care_and_maintenance: { instructions: [], avoid: [] },
          warranty: { applicable: false, status_line: '**No**, it has a warranty of **0 months**.', points: [] },
          returns: getReturnsBlock(product.category),
          quality_promise: '',
          _meta: {
            needs_review: true,
            infrastructure_error: true,
            validation_errors: [`LLM API error (retried once): ${llmErr.message}`],
            attempt_history: [
              ...attemptHistory,
              { attempt, valid: false, errors: [`LLM API error (retried once): ${llmErr.message}`] },
            ],
          },
        };
      }
    }
  }

  llmOutput.description = llmOutput.description || {};
  const desc = llmOutput.description;
  const assembledSummary = desc.summary || '';
  const parsedSentences = assembledSummary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || (assembledSummary.trim() ? [assembledSummary.trim()] : []);
  const moodLine = desc.mood_line || parsedSentences[0] || '';
  const intro = desc.intro || parsedSentences[1] || '';
  const story = desc.story || (parsedSentences.length > 3 ? parsedSentences.slice(2, parsedSentences.length - 1).join(' ') : parsedSentences[2] || '');
  const close = desc.close || (parsedSentences.length > 1 ? parsedSentences[parsedSentences.length - 1] : '');

  llmOutput.description = {
    ...desc,
    mood_line: moodLine,
    intro,
    story,
    close,
    summary: assembledSummary,
    key_features: generateBulletList(product),
  };


  const returns = getReturnsBlock(product.category);

  const applicable = llmOutput.warranty?.applicable ?? Boolean(product.warranty_months);
  const warranty = {
    applicable,
    duration_months: applicable ? (product.warranty_months != null ? product.warranty_months : null) : null,
    status_line: `**${applicable ? 'Yes' : 'No'}**, it has a warranty of **${applicable ? product.warranty_months || 0 : 0} months**.`,
    points: (llmOutput.warranty?.points || []).slice(0, 4),
    link: PLACEHOLDER_LINKS.warranty,
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
      care_category_matched: careMatch.category,
    },
  };

  // Policy 2: Content quality validation -> up to 3 attempts with targeted correction note
  const result = validateItem(item, product, { ...(context.options || {}), selectedTone });

  const currentAttemptRecord = {
    attempt,
    valid: result.valid,
    errors: result.errors,
    output_snippet: llmOutput.description?.summary?.slice(0, 100),
  };
  const updatedHistory = [...attemptHistory, currentAttemptRecord];

  if (!result.valid && attempt < 3) {
    logger.warn(`[aiOrchestrator] Product ${product.id} failed validation on attempt ${attempt}/3: ${result.errors.join('; ')}`);
    return generateOne(product, pb, attempt + 1, context, updatedHistory);
  }

  if (!result.valid) {
    item._meta.needs_review = true;
    item._meta.validation_errors = result.errors;
    item._meta.attempt_history = updatedHistory;
    return item;
  }

  // Similarity & Repetition check on valid items
  if (!context.options?.skipRepetitionCheck) {
    const summary = item.description?.summary || '';
    const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || (summary.trim() ? [summary.trim()] : []);
    const opener = sentences[0] || '';
    const closer = sentences.length > 0 ? sentences[sentences.length - 1] : '';

    const existingRecords = loadOpeners();
    // For ngram checks: pass full records so source='mock' can be filtered
    const existingOpeners = existingRecords.map((r) => ({ id: r.id, sentence: r.opener, source: r.source }));
    const existingClosers = existingRecords.map((r) => ({ id: r.id, sentence: r.closer, source: r.source }));

    const openerCheck = opener ? ngramOverlapCheck(opener, existingOpeners) : { tooSimilar: false };
    const closerCheck = closer ? ngramOverlapCheck(closer, existingClosers) : { tooSimilar: false };

    // Structural pattern check: catches variable-substitution templates like
    // "[Name] brings a complete feel" used across multiple products
    const openerStructuralCheck = opener ? structuralPatternCheck(opener, existingRecords, 'opener') : { tooSimilar: false };
    const closerStructuralCheck = closer ? structuralPatternCheck(closer, existingRecords, 'closer') : { tooSimilar: false };

    const isTooSimilar = openerCheck.tooSimilar || closerCheck.tooSimilar
      || openerStructuralCheck.tooSimilar || closerStructuralCheck.tooSimilar;

    const phraseFreqMap = loadPhraseFrequencies();
    const phraseCheckResults = sentences.map((sentence, idx) => ({
      sentenceIndex: idx,
      sentence,
      ...checkPhraseFrequency(sentence, phraseFreqMap, 4),
    }));
    const flaggedSentenceChecks = phraseCheckResults.filter((r) => r.flagged);
    const hasOverusedPhrases = flaggedSentenceChecks.length > 0;

    if ((isTooSimilar || hasOverusedPhrases) && attempt < 3) {
      const retryErrors = [];
      if (openerCheck.tooSimilar) {
        retryErrors.push(
          `REPETITION FIX REQUIRED: Your opening sentence is too similar to a previously generated product's opener (matched: '${openerCheck.matchedSentence}'). Rewrite the opening sentence using a completely different angle and vocabulary. Do NOT start with the same words or sentence structure.`,
        );
      }
      if (closerCheck.tooSimilar) {
        retryErrors.push(
          `REPETITION FIX REQUIRED: Your closing sentence is too similar to a previously generated product's closer (matched: '${closerCheck.matchedSentence}'). Rewrite it with a different structure and angle.`,
        );
      }
      if (openerStructuralCheck.tooSimilar) {
        retryErrors.push(
          `STRUCTURAL REPETITION: Your opener follows the narrative template "${openerStructuralCheck.patternLabel}" which has been used in ${openerStructuralCheck.patternCount} recent products. Choose a completely different opening angle that does not fit this pattern.`,
        );
      }
      if (closerStructuralCheck.tooSimilar) {
        retryErrors.push(
          `STRUCTURAL REPETITION: Your closer follows the narrative template "${closerStructuralCheck.patternLabel}" which has been used in ${closerStructuralCheck.patternCount} recent products. Choose a completely different closing angle.`,
        );
      }
      if (hasOverusedPhrases) {
        for (const res of flaggedSentenceChecks) {
          const positionLabel =
            res.sentenceIndex === 0
              ? 'opening sentence'
              : res.sentenceIndex === sentences.length - 1
              ? 'closing sentence'
              : `sentence ${res.sentenceIndex + 1}`;
          for (const p of res.repeatedPhrases) {
            retryErrors.push(`OVERUSED PHRASE: '${p.phrase}' in your ${positionLabel} has already appeared ${p.count}+ times across the dataset. Replace it and any close variant.`);
          }
        }
      }

      logger.warn(`[aiOrchestrator] Product ${product.id} failed repetition/phrase check on attempt ${attempt}/3: ${retryErrors.join('; ')}`);
      const repetitionAttemptRecord = {
        attempt,
        valid: true,
        repetition_failed: isTooSimilar,
        phrase_overuse_failed: hasOverusedPhrases,
        errors: retryErrors,
        output_snippet: llmOutput.description?.summary?.slice(0, 100),
      };
      return generateOne(product, pb, attempt + 1, context, [...attemptHistory, repetitionAttemptRecord]);
    }
  }

  // Persist opener and closer — tagged as 'real' so mock test runs don't pollute
  const finalSummary = item.description?.summary || '';
  const finalSentences = finalSummary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || (finalSummary.trim() ? [finalSummary.trim()] : []);
  const finalOpener = finalSentences[0] || '';
  const finalCloser = finalSentences.length > 0 ? finalSentences[finalSentences.length - 1] : '';

  appendOpener({
    id: product.id,
    name: product.name,
    opener: finalOpener,
    closer: finalCloser,
    sentences: finalSentences,
    source: 'real',
  });

  item._meta.attempt_history = updatedHistory;
  return item;
}

module.exports = {
  generateOne,
  generateBulletList,
};
