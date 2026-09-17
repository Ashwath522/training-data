'use strict';

const fs = require('fs');
const path = require('path');

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function extractSentences(text) {
  if (!text) return [];
  return text.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || (text.trim() ? [text.trim()] : []);
}

function buildNgrams(tokens, n) {
  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function jaccardSimilarity(setA, setB) {
  if (!setA.size && !setB.size) return 1.0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function cosineSimilarity(tokensA, tokensB) {
  const freqA = {};
  const freqB = {};
  const allWords = new Set();

  for (const t of tokensA) {
    freqA[t] = (freqA[t] || 0) + 1;
    allWords.add(t);
  }
  for (const t of tokensB) {
    freqB[t] = (freqB[t] || 0) + 1;
    allWords.add(t);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const w of allWords) {
    const a = freqA[w] || 0;
    const b = freqB[w] || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const COMMON_CLOSING_PATTERNS = [
  /Bring\s+([^.]+)\s+to\s+your\s+room\s+with\s+the\s+([^.]+)/i,
  /Bring\s+([^.]+)\s+to\s+any\s+space\s+with\s+the\s+([^.]+)/i,
  /Enjoy\s+([^.]+)\s+with\s+the\s+([^.]+)/i,
  /Complete\s+([^.]+)\s+with\s+the\s+([^.]+)/i,
  /([^.]+)\s+anchors\s+the\s+space/i,
  /([^.]+)\s+settles\s+into\s+your\s+space/i,
];

const COMMON_OPENING_SKELETONS = [
  /^Balanced\s+proportions\s+inspire/i,
  /^Essential\s+clarity\s+defines/i,
  /^Pure\s+simplicity\s+shapes/i,
  /^Refined\s+simplicity\s+anchors/i,
  /^Understated\s+linear\s+architecture/i,
  /^Distinctive\s+surface\s+discipline/i,
  /^The\s+morning\s+runs\s+more\s+smoothly/i,
  /^A\s+room\s+rearranges\s+itself/i,
];

const UNSUPPORTED_CLAIM_PATTERNS = [
  { pattern: /\btraditional\s+joinery\b/i, label: 'traditional joinery' },
  { pattern: /\bmortise-and-tenon\b/i, label: 'mortise-and-tenon' },
  { pattern: /\bhand-finished\b/i, label: 'hand-finished' },
  { pattern: /\bkiln-dried\b/i, label: 'kiln-dried' },
  { pattern: /\bprecision-milled\b/i, label: 'precision-milled' },
  { pattern: /\bgas-assist\b/i, label: 'gas-assist struts' },
  { pattern: /\bgas\s+lift\s+pistons\b/i, label: 'gas lift pistons' },
  { pattern: /\bcorner\s+bracing\b/i, label: 'corner bracing' },
  { pattern: /\bcontinuous\s+spinal\s+support\b/i, label: 'spinal support' },
  { pattern: /\bmattress\s+airflow\b/i, label: 'mattress airflow' },
  { pattern: /\bmattress\s+ventilation\b/i, label: 'mattress ventilation' },
  { pattern: /\bsmooth\s+non-porous\s+surfaces\b/i, label: 'smooth non-porous surfaces' },
  { pattern: /\bprevents\s+drawer\s+binding\b/i, label: 'prevents drawer binding' },
  { pattern: /\bresists\s+timber\s+movement\b/i, label: 'resists timber movement' },
  { pattern: /\bdivided\s+compartments\b/i, label: 'divided compartments' },
  { pattern: /\banti-scratch\b/i, label: 'anti-scratch' },
  { pattern: /\bmoisture-resistant\b/i, label: 'moisture-resistant' },
];

/**
 * Analyzes an array of records from a specific category archive.
 */
function analyzeCategoryArchive(categoryName, records) {
  const totalRecords = records.length;
  if (totalRecords === 0) {
    return {
      category: categoryName,
      records: 0,
      unique_openers: 0,
      opener_reuse_rate: '0%',
      unique_closers: 0,
      closer_reuse_rate: '0%',
      duplicate_full_summaries: 0,
      avg_jaccard_similarity: 0,
      avg_cosine_similarity: 0,
      high_similarity_pairs: 0,
      dominant_template: 'N/A',
      unsupported_claim_hits: {},
      repetition_types: {},
      likely_root_cause: ['Empty category in archive'],
    };
  }

  const openers = [];
  const closers = [];
  const summaries = [];
  const fullSummaryMap = new Map();
  const openerMap = new Map();
  const closerMap = new Map();

  const trigramFreq = {};
  const fourgramFreq = {};
  const fivegramFreq = {};
  const unsupportedHits = {};

  for (const rec of records) {
    const summary = rec.output?.description?.summary || rec.description?.summary || '';
    summaries.push(summary);
    fullSummaryMap.set(summary, (fullSummaryMap.get(summary) || 0) + 1);

    const sents = extractSentences(summary);
    const op = sents[0] || '';
    const cl = sents[sents.length - 1] || '';

    openers.push(op);
    closers.push(cl);
    openerMap.set(op, (openerMap.get(op) || 0) + 1);
    closerMap.set(cl, (closerMap.get(cl) || 0) + 1);

    const tokens = tokenize(summary);
    for (const g of buildNgrams(tokens, 3)) trigramFreq[g] = (trigramFreq[g] || 0) + 1;
    for (const g of buildNgrams(tokens, 4)) fourgramFreq[g] = (fourgramFreq[g] || 0) + 1;
    for (const g of buildNgrams(tokens, 5)) fivegramFreq[g] = (fivegramFreq[g] || 0) + 1;

    for (const u of UNSUPPORTED_CLAIM_PATTERNS) {
      if (u.pattern.test(summary)) {
        unsupportedHits[u.label] = (unsupportedHits[u.label] || 0) + 1;
      }
    }
  }

  const uniqueOpenersCount = openerMap.size;
  const uniqueClosersCount = closerMap.size;
  const openerReuseRate = ((1 - uniqueOpenersCount / totalRecords) * 100).toFixed(1) + '%';
  const closerReuseRate = ((1 - uniqueClosersCount / totalRecords) * 100).toFixed(1) + '%';

  let duplicateSummariesCount = 0;
  for (const [s, count] of fullSummaryMap.entries()) {
    if (count > 1) duplicateSummariesCount += count - 1;
  }

  // Pairwise similarities
  let jaccardSum = 0;
  let cosineSum = 0;
  let pairCount = 0;
  let highSimilarityPairs = 0;

  for (let i = 0; i < summaries.length; i++) {
    const tokensI = tokenize(summaries[i]);
    const setI = new Set(tokensI);
    for (let j = i + 1; j < summaries.length; j++) {
      const tokensJ = tokenize(summaries[j]);
      const setJ = new Set(tokensJ);
      const jacc = jaccardSimilarity(setI, setJ);
      const cos = cosineSimilarity(tokensI, tokensJ);
      jaccardSum += jacc;
      cosineSum += cos;
      pairCount++;
      if (jacc >= 0.55 || cos >= 0.75) {
        highSimilarityPairs++;
      }
    }
  }

  const avgJaccard = pairCount > 0 ? (jaccardSum / pairCount).toFixed(3) : 0;
  const avgCosine = pairCount > 0 ? (cosineSum / pairCount).toFixed(3) : 0;

  // Find dominant opening template
  let dominantOpener = '';
  let maxOpCount = 0;
  for (const [op, count] of openerMap.entries()) {
    if (count > maxOpCount) {
      maxOpCount = count;
      dominantOpener = op;
    }
  }

  // Top repeated 4-grams
  const top4grams = Object.entries(fourgramFreq)
    .filter(([_, count]) => count > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => ({ phrase, count }));

  // Repetition Types Categorization
  const repetitionTypes = {
    'A. Exact repetition': duplicateSummariesCount > 0 ? `${duplicateSummariesCount} exact full-summary duplicates` : 'None',
    'B. Near-exact repetition': `${highSimilarityPairs} pairs with Jaccard >= 0.55 / Cosine >= 0.75`,
    'C. Structural repetition': `Opener reuse rate: ${openerReuseRate} (${uniqueOpenersCount} unique across ${totalRecords} items)`,
    'D. Semantic repetition': `Dominant opening template: "${dominantOpener.slice(0, 60)}..." reused in ${maxOpCount} products`,
    'E. Vocabulary repetition': `Top repeated 4-grams: ${top4grams.slice(0, 3).map((t) => `"${t.phrase}" (${t.count}x)`).join(', ')}`,
    'F. Product-fact repetition': 'Material slot substitution on identical template skeleton',
    'G. Unsupported factual insertion': `${Object.keys(unsupportedHits).length} distinct unsupported claim types detected (${Object.entries(unsupportedHits).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'})`,
  };

  const likelyRootCauses = [
    'Static fallback generator with 3-4 fixed slot-filling paragraph templates',
    'Deterministic modulo strategy selection causing cyclical template repetition',
    'Insufficient dynamic feature extraction from source product attributes',
    'Rigid narrative skeleton (Mood -> Intro -> Story -> Close) forcing identical rhetorical cadence',
    'Uncontrolled marketing claim insertion (e.g. non-porous surfaces, traditional joinery) without source verification',
  ];

  return {
    category: categoryName,
    records: totalRecords,
    unique_openers: uniqueOpenersCount,
    opener_reuse_rate: openerReuseRate,
    unique_closers: uniqueClosersCount,
    closer_reuse_rate: closerReuseRate,
    duplicate_full_summaries: duplicateSummariesCount,
    avg_jaccard_similarity: parseFloat(avgJaccard),
    avg_cosine_similarity: parseFloat(avgCosine),
    high_similarity_pairs: highSimilarityPairs,
    dominant_template: dominantOpener,
    top_repeated_4grams: top4grams,
    unsupported_claim_hits: unsupportedHits,
    repetition_types: repetitionTypes,
    likely_root_causes: likelyRootCauses,
  };
}

/**
 * Full archive analyzer across all category archive files.
 */
function analyzeArchive(options = {}) {
  const archiveDir = options.archiveDir || path.join(__dirname, '../../../../data/trainingSet/_archive');
  if (!fs.existsSync(archiveDir)) {
    return { error: `Archive directory not found: ${archiveDir}`, categoryReports: [] };
  }

  const files = fs.readdirSync(archiveDir);
  const baseFiles = files.filter((f) => f.endsWith('.bak.jsonl') && !f.includes('_enriched'));

  const categoryReports = [];
  const categoryMap = {
    bedroom_storage: 'Bedroom Storage',
    beds: 'Beds',
    kids_room: 'Kids Room',
    mattresses: 'Mattresses',
    wardrobes: 'Wardrobes',
    pet_furniture: 'Pet Furniture',
  };

  for (const f of baseFiles) {
    const prefix = f.split('_generated')[0];
    const catName = categoryMap[prefix] || prefix;
    const filePath = path.join(archiveDir, f);
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const lines = content ? content.split('\n').filter(Boolean) : [];
    const records = [];
    for (const l of lines) {
      try {
        records.push(JSON.parse(l));
      } catch (e) {}
    }
    const report = analyzeCategoryArchive(catName, records);
    categoryReports.push(report);
  }

  return {
    analyzed_at: new Date().toISOString(),
    total_categories: categoryReports.length,
    total_records: categoryReports.reduce((sum, r) => sum + r.records, 0),
    category_reports: categoryReports,
  };
}

module.exports = {
  analyzeArchive,
  analyzeCategoryArchive,
  UNSUPPORTED_CLAIM_PATTERNS,
};
