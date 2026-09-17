'use strict';

/**
 * Root Cause Analysis Agent
 * Diagnoses the root cause of generation, grounding, or repetition failures
 * and formulates actionable, structured retry instructions that alter the narrative angle
 * and rhetorical structure without falling back to synonyms.
 */

const FAILURE_CODES = {
  BAD_CONTEXT: 'BAD_CONTEXT',
  BAD_STRATEGY_SELECTION: 'BAD_STRATEGY_SELECTION',
  OVERUSED_NARRATIVE: 'OVERUSED_NARRATIVE',
  STATIC_TEMPLATE: 'STATIC_TEMPLATE',
  FALLBACK_GENERATOR: 'FALLBACK_GENERATOR',
  INSUFFICIENT_PRODUCT_FACTS: 'INSUFFICIENT_PRODUCT_FACTS',
  PROMPT_CONSTRAINT: 'PROMPT_CONSTRAINT',
  CATEGORY_AGENT: 'CATEGORY_AGENT',
  REPETITION_MEMORY: 'REPETITION_MEMORY',
  GROUNDING_FAILURE: 'GROUNDING_FAILURE',
};

/**
 * Analyze a failed generation attempt and generate a structured root-cause report.
 * 
 * @param {Object} params
 * @param {Object} params.facts Product fact inventory
 * @param {Object} params.currentAttempt Attempt metadata (angle, structure, output)
 * @param {Object} params.groundingResult Result from grounding-auditor.agent
 * @param {Object} params.repetitionResult Result from repetition-auditor.agent
 * @param {Array<string>} params.allSupportedAngles Full pool of valid angles for product
 * @param {Array<string>} params.allStructures Available structural archetypes
 * @returns {Object} Structured Root-Cause Failure Report
 */
function analyzeFailure(params) {
  const {
    facts,
    currentAttempt = {},
    groundingResult = { valid: true },
    repetitionResult = { status: 'PASS' },
    allSupportedAngles = [],
    allStructures = ['STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D', 'STRUCTURE_E', 'STRUCTURE_F', 'STRUCTURE_G', 'STRUCTURE_H'],
  } = params;

  const failureTypes = [];
  let rootCauseCode = FAILURE_CODES.BAD_STRATEGY_SELECTION;
  let reason = '';
  let similarityScore = 0;
  let matchedProductId = null;
  let matchedSentence = null;

  // 1. Check Grounding Failures
  if (!groundingResult.valid) {
    failureTypes.push('GROUNDING_FAILURE');
    rootCauseCode = FAILURE_CODES.GROUNDING_FAILURE;
    reason = `Generated copy contained unsupported factual assertions: ${(groundingResult.errors || []).join('; ')}`;
  }

  // 2. Check Repetition Failures
  if (repetitionResult.status === 'FAIL') {
    if (repetitionResult.exactMatch) {
      failureTypes.push('EXACT_REPETITION');
      rootCauseCode = FAILURE_CODES.STATIC_TEMPLATE;
      reason = 'Generated summary or sentence matches a previously accepted summary verbatim.';
    } else if (repetitionResult.semanticMatch) {
      failureTypes.push('SEMANTIC_REPETITION');
      rootCauseCode = FAILURE_CODES.OVERUSED_NARRATIVE;
      reason = `Opening/summary expresses the same narrative concept (${repetitionResult.dominantConcept || 'visual/spatial'}) as a prior item.`;
    } else if (repetitionResult.structuralMatch) {
      failureTypes.push('STRUCTURAL_REPETITION');
      rootCauseCode = FAILURE_CODES.OVERUSED_NARRATIVE;
      reason = 'Summary follows an overused rhetorical structure sequence.';
    } else {
      failureTypes.push('NEAR_DUPLICATE_REPETITION');
      rootCauseCode = FAILURE_CODES.BAD_STRATEGY_SELECTION;
      reason = 'High token similarity with an existing category product.';
    }
    similarityScore = repetitionResult.similarityScore || 0.82;
    matchedProductId = repetitionResult.matchedProductId || null;
    matchedSentence = repetitionResult.matchedSentence || null;
  }

  // Determine alternative angles
  const currentAngle = currentAttempt.angle || currentAttempt.narrativeAngle;
  const currentStructure = currentAttempt.structure || currentAttempt.structureId;

  const preferSupportedAngles = allSupportedAngles.filter((a) => a !== currentAngle);
  const preferStructures = allStructures.filter((s) => s !== currentStructure);

  const recommendedChange = {
    avoid_angle: currentAngle,
    avoid_structure: currentStructure,
    prefer_supported_angles: preferSupportedAngles.length > 0 ? preferSupportedAngles : allSupportedAngles,
    prefer_structures: preferStructures,
    change_structure: true,
    unused_facts: facts.supportedFeatures || [],
    forbidden_claims: groundingResult.errors || [],
  };

  return {
    status: 'FAIL',
    product_id: facts.productId,
    matched_product_id: matchedProductId,
    matched_sentence: matchedSentence,
    failure_types: failureTypes,
    similarity_score: similarityScore,
    reason,
    root_cause: rootCauseCode,
    recommended_change: recommendedChange,
  };
}

module.exports = {
  analyzeFailure,
  FAILURE_CODES,
};
