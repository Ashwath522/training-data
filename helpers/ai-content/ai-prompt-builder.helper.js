'use strict';

const fs = require('fs');
const path = require('path');
const { matchMaterial } = require('./ai-care-matcher.helper');
const { LLM_GENERATED_SCHEMA_SUBSET } = require('./ai-schema.helper');

const PRICE_BANDS_PATH = path.join(__dirname, 'reference-data', 'price_bands.json');

function loadPriceBands() {
  try {
    const raw = fs.readFileSync(PRICE_BANDS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { Default: { good_max: 5000, mid_max: 20000 } };
  }
}

let ContentRuleModel = null;
function getRuleModel() {
  if (!ContentRuleModel) {
    try {
      ContentRuleModel = require('../../models/contentRule.model');
    } catch (e) {}
  }
  return ContentRuleModel;
}

async function loadRulesFromMongo(companyId, applicationId, category) {
  if (!companyId || !applicationId) {
    return {};
  }
  try {
    const Model = getRuleModel();
    if (!Model) return {};
    const query = { company_id: companyId, application_id: applicationId };
    if (category) {
      query.category = category;
    }
    const docs = await Model.find(query).lean().exec();
    const rules = {};
    for (const doc of docs) {
      if (!rules[doc.category]) {
        rules[doc.category] = {};
      }
      rules[doc.category][doc.field] = doc.rule_text;
    }
    return rules;
  } catch (err) {
    return {};
  }
}


function computeTier(price, category, priceBands) {
  const bands = (priceBands && (priceBands[category] || priceBands.Default)) || { good_max: 5000, mid_max: 20000 };
  if (!bands || price === undefined || price === null) return 'Mid-Premium';
  if (price <= bands.good_max) return 'Good';
  if (price <= bands.mid_max) return 'Mid-Premium';
  return 'Premium';
}

const TIER_VOICE = {
  Good: 'practical, reliable, everyday language',
  'Mid-Premium': 'considered, elevated, refined (never say "luxury")',
  Premium: 'crafted, aspirational, understated confidence',
};

const OPENING_STRATEGIES = {
  1: {
    id: 1,
    name: 'Strategy 1 (Sensory/tactile)',
    description: 'open from a specific physical sensation (texture, surface feel, how light interacts with the finish)',
  },
  2: {
    id: 2,
    name: 'Strategy 2 (Use-case/moment)',
    description: 'open from a concrete action the shopper or room performs (e.g. getting ready in the morning, organizing a shared space, welcoming a guest)',
  },
  3: {
    id: 3,
    name: 'Strategy 3 (Direct product statement)',
    description: 'open by naming the product and its most distinctive real attribute plainly, with no mood framing at all',
  },
  4: {
    id: 4,
    name: 'Strategy 4 (Spatial/room)',
    description: "open from how the piece occupies or changes the room's layout or flow",
  },
  5: {
    id: 5,
    name: 'Strategy 5 (Material-first fact)',
    description: 'open from a specific, ungeneric detail about the actual material (not generic "rich grain" — a specific detail about how this material behaves or looks, e.g. how mango wood ages differently than sheesham, how particle board provides uniform surfaces, etc.)',
  },
  6: {
    id: 6,
    name: 'Strategy 6 (Contrast/juxtaposition)',
    description: 'open by juxtaposing two apparent opposites the product resolves — e.g. generous storage that leaves the room feeling open, or robust construction that carries a light visual presence. Do NOT name both sides explicitly; show the resolution.',
  },
  7: {
    id: 7,
    name: 'Strategy 7 (Consequence/outcome)',
    description: 'open with the lived consequence of good furniture — the room feels complete, the morning runs smoother, the space finally makes sense — without naming the product or its features until later.',
  },
};

const STRATEGY_2_SUB_CASES = [
  'getting ready in the morning',
  'settling in after a long day',
  'hosting a guest or gathering',
  'starting a relaxed weekend routine',
  'returning home in the evening',
  'organising a shared bedroom',
  'a child finally having their own space',
];

// Strategy IDs that map to structural opener patterns — used to avoid repeating
// strategies that appear too frequently in the recent corpus.
const STRATEGY_TO_PATTERN = {
  2: 'settling_in',   // Strategy 2 (moment) maps to settling/morning patterns
  1: 'natural_grain_patterns', // Strategy 1 (sensory) can match this
  3: 'crafted_from_material',  // Strategy 3 (direct) can match crafted_from
  5: 'crafted_from_material',  // Strategy 5 (material) same
};

function selectOpeningStrategy(productKey) {
  const str = String(productKey || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  // Try to get recently overused pattern IDs from the corpus
  let overusedPatternIds = [];
  try {
    const { getRecentlyUsedPatterns } = require('./ai-opener-store.helper');
    overusedPatternIds = getRecentlyUsedPatterns(12);
  } catch (e) { /* non-fatal if store not available */ }

  // Build candidate list: all 7 strategies, ordered by hash preference
  // Strategies are deprioritized if their structural pattern appears overused in corpus
  const allKeys = [1, 2, 3, 4, 5, 6, 7];
  const primaryKey = (Math.abs(hash) % 7) + 1;

  // Check if the primary strategy's structural pattern is overused
  const primaryPatternId = STRATEGY_TO_PATTERN[primaryKey];
  const primaryIsOverused = primaryPatternId && overusedPatternIds.includes(primaryPatternId);

  let selectedKey = primaryKey;
  if (primaryIsOverused) {
    // Find an alternative strategy that isn't overused
    let altHash = hash ^ 0x5f3759df; // XOR with a constant to get different ordering
    for (let i = 0; i < allKeys.length; i++) {
      const candidate = ((Math.abs(altHash) + i) % 7) + 1;
      const candidatePatternId = STRATEGY_TO_PATTERN[candidate];
      if (!candidatePatternId || !overusedPatternIds.includes(candidatePatternId)) {
        selectedKey = candidate;
        break;
      }
    }
  }

  const strat = OPENING_STRATEGIES[selectedKey];

  if (selectedKey === 2) {
    let subHash = 5381;
    for (let i = 0; i < str.length; i++) {
      subHash = (subHash << 5) + subHash + str.charCodeAt(i);
      subHash |= 0;
    }
    const subIndex = Math.abs(subHash) % STRATEGY_2_SUB_CASES.length;
    const assignedSubCase = STRATEGY_2_SUB_CASES[subIndex];
    return {
      ...strat,
      description: `open from this specific concrete use-case/moment: "${assignedSubCase}". Do NOT use a formulaic template like "Preparing for a..." or "Settling in after..." — describe the moment naturally, embedded in the product's specific context.`,
    };
  }

  return strat;
}

const CLOSE_ANCHOR_STRATEGIES = {
  1: {
    id: 1,
    name: 'Close Strategy 1 (Practical role)',
    description: "close by highlighting the product's practical daily function and utility in organizing and supporting the living space",
  },
  2: {
    id: 2,
    name: 'Close Strategy 2 (Use-case fit)',
    description: 'close by highlighting how well the piece fits a specific lifestyle need, room constraint, or intended use',
  },
  3: {
    id: 3,
    name: 'Close Strategy 3 (Spatial presence)',
    description: "close on how the piece sits within the room's visual balance and proportions without overpowering the surrounding space",
  },
  4: {
    id: 4,
    name: 'Close Strategy 4 (Daily routine fit)',
    description: 'close on how effortlessly the piece integrates into daily transitions and morning/evening habits',
  },
  5: {
    id: 5,
    name: 'Close Strategy 5 (Material callback)',
    description: 'close on a lasting quality, tactile feel, or enduring aesthetic benefit of the specific primary material',
  },
};

function selectCloseStrategy(productKey) {
  const str = String(productKey || '');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash |= 0;
  }
  const key = (Math.abs(hash) % 5) + 1;
  return CLOSE_ANCHOR_STRATEGIES[key];
}

const SYSTEM_PROMPT_TEMPLATE = `You are a product content writer for a furniture and home goods retailer.
Write factual, warm, purchase-driving copy that helps a shopper imagine
the product in their home. The tone should feel desirable and confident,
but never loud or fake — no exclamation points, no unverifiable
superlatives ("best", "amazing", "guaranteed").

You will receive:
- Raw product data (may be sparse or messy)
- A pre-computed price tier label (internal use only — see rule below)
- A grounded reference list for care instructions (material-matched)
- Any known warranty facts

Return ONLY valid JSON matching this exact schema for the fields you are
asked to generate. No markdown fences, no commentary, no extra fields.

{{SCHEMA_SUBSET}}

RULES:
1. Never alter or contradict a factual value given in the source data
   (dimensions, material, weight) — these belong in specifications only
   and must never be rewritten there.
2. Every fact you mention from the source data must actually be present
   in the source data — never invent details. Reusing a short phrase or
   sentence from the source is fine when it's the clearest way to state
   an important fact; the priority is that required facts are present
   and the format rules below are followed, not avoiding all repetition.
   STRICT FACTUAL GROUNDING CONSTRAINTS:
   - Do NOT invent ungrounded construction or joinery methods (e.g. NEVER claim "traditional joinery", "hand-finished joinery", "mortise-and-tenon", "interlocking joinery", "corner bracing", "cross-braced", "precision milling", "timber movement resistance", or "kiln-dried" unless explicitly in the source specs).
   - Do NOT invent unstated mechanical parts (e.g. NEVER claim "gas-assist struts", "gas lift pistons", "sliding lids"). Refer strictly to the catalog-stated storage mechanism (e.g. "hydraulic lift mechanism", "drawer storage").
   - Do NOT invent unstated internal organization features (e.g. NEVER claim "drawer dividers", "cosmetic compartments", "partitioned internal sections" unless explicitly in source specs).
   - Do NOT invent health or ergonomic claims (e.g. NEVER claim "spinal support", "postural alignment", "mattress airflow/ventilation").
   - Describe only the verified material, finish, stated storage configuration, general proportions, and everyday room utility.
3. NUMBERS STAY AS DIGITS. Any numeric spec you reference in bullets or
   specifications (mattress size, seating capacity, counts, sizes, etc.) must
   be written the same way the source gives it — digits, not spelled-out
   words. Write "4 Inches" / "4-seater" / "78 x 60 in", never "four
   inches" / "four-seater".
4. VOICE & TONE ({{TONE_NAME}}): {{TONE_VOICE}}
   Never state any internal tier name, never mention price, never imply a numeric
   price range.
5. care_and_maintenance: select and politely rephrase ONLY from the
   provided reference list below. Do not invent instructions. Exactly 3
   instructions, exactly 2 avoid items.
   CRITICAL POLITE-TONE RULE: Every care instruction and avoid item MUST open with a soft framing phrase (e.g. "We recommend...", "It's best to...", "Try to...") — NEVER a bare verb like "Dust", "Wipe", "Avoid", "Clean", "Keep" as the first word.
   Concrete example:
     - INCORRECT: "Dust regularly with a soft cloth"
     - CORRECT: "We recommend dusting regularly with a soft cloth"
     - INCORRECT: "Avoid harsh chemical cleaners"
     - CORRECT: "It's best to avoid harsh chemical cleaners"
   Reference for "{{MATCHED_CATEGORY}}":
   Instructions: {{MATCHED_INSTRUCTIONS}}
   Avoid: {{MATCHED_AVOID}}
6. WARRANTY FORMAT — must match this EXACTLY or it fails validation.
   status_line is one sentence containing BOTH of these bolded spans,
   with nothing else inside either pair of asterisks:
     - **Yes** or **No**
     - **N months** — digits, a space, then the literal word "months"
       (e.g. **12 months** — never **12-month**, never **twelve months**,
       never wrap other words inside the same bold span).
   Required phrasing when warranty applies:
   "**Yes**, it has a warranty of **N months**."
   Required phrasing when warranty does not apply:
   "**No**, it has a warranty of **0 months**."
   points: up to 4, only from real source-provided facts, never invented
   to pad the count.
7. If a fact is genuinely missing and must be inferred, use plain,
   non-committal language — never state an inferred detail with
   unwarranted confidence.
   (STANDING RULE: absence of a field must never be treated as a value
   — e.g. absent storage_type must never be treated as 'no storage';
   absent finish must never be treated as 'single default finish'.
   Absence means omit the fact, not assume its opposite or a default).
8. VARIANT GROUNDING. If the source data specifies a particular variant
   this product represents — e.g. a seating capacity ({{VARIANT_SEATING}})
   or a color/finish ({{VARIANT_COLOR}}) — the description must reflect
   THAT exact variant only. Never mention other sizes, seat counts, or
   colors that are not this specific variant.
   NEVER enumerate sibling variants (e.g. available sizes, colors, storage options) in prose. These will be added programmatically as bullets later.
   Do not mention the bed's size/seating variant (e.g. 'Queen size', 'King size', 'Queen bed', '3-seater') anywhere in summary. Size is surfaced separately as a bullet and must not be restated in prose. Refer to the product only by its short name and/or generic category noun (e.g. 'this bed', 'the Rattan') without the size qualifier attached.
9. NEVER describe the product by what it lacks. Do not use "without", "no", "not", "lacks", "doesn't have", or similar negation to frame an absent feature (e.g. no storage, no drawers, no headboard). If a feature is simply absent from the source data, do not mention its absence at all — describe the resulting product positively instead (e.g. an open, uncluttered base; a clean minimal silhouette) without ever naming what is missing. This applies to summary.
10. MANDATORY: The product's short name ({{SHORT_NAME}}) MUST appear in the FINAL (CLOSING) sentence of the summary specifically, and exactly once in the entire summary — this is checked programmatically and generation fails if it appears earlier or is missing. Do not substitute a pronoun, category term ("the bed"), or synonym in its place.
11. STRUCTURE (5 parts, in this exact order):
  Part 1 — MOOD LINE (3–8 words):
    One short sentence establishing an emotional register — calm, elegant,
    sophisticated, or inviting. No product name. No material name. No
    feature name. This line sets a "theme word" or "theme family" that
    Part 4 must return to.
    Examples: "Wake up to calm." / "A statement in contemporary design."
    ASSIGNED MOOD LINE STRATEGY FOR THIS PRODUCT:
    For this product, open the mood line using {{STRATEGY_NAME}} ({{STRATEGY_DESC}}).
    Do not use a sensory or emotional framing if assigned a direct statement or material-first strategy.
    Follow this assigned strategy strictly for this product. Do not default to stock mood framing or generic phrases (e.g., "Rich [wood] grain brings/invites...").
    
    MOOD-LINE MATERIAL LEAKAGE RULE:
    Never open Part 1 directly with a raw material name or construction statement (unless specifically assigned Strategy 5). Part 1 is for setting the mood or context, not technical specs.
    - INCORRECT: "Engineered wood construction provides a uniform surface..."
    - CORRECT: a mood/feeling-first sentence with NO material or product name at all, e.g. "Mornings feel unhurried in a well-organized room."

  Part 2 — INTRO (1 sentence):
    Name the product by TYPE only (not full SKU name) + its single most
    distinctive design feature (headboard detailing, silhouette, base
    shape, upholstery treatment). Pick ONE feature — the most visually
    distinctive one — not a list.
    {{INTRO_INSTRUCTION}}

  Part 3 — STORY (2–3 sentences):
    Expand on construction, material feel, and ONE secondary design
    detail (accent, edge treatment, finish quality). This is the only
    place craftsmanship/material language belongs
    (e.g. "durable sheesham wood ensures lasting strength").
    Do not introduce a new emotional register here — stay adjacent to
    the mood line's family, don't contradict it.

  Part 4 — CLOSE — THE LOOP (1 sentence):
    Must do three things in one sentence:
      a. Name the product BY NAME ({{SHORT_NAME}}) in this final sentence (and nowhere earlier in the summary).
      b. Return to the SAME theme family as the MOOD LINE — reuse its
         emotional register (calm→rest/serenity, elegant→sophistication/
         statement) but do NOT repeat the mood line's exact words.
      c. Land on a use-case or space ("your bedroom," "any bedroom," 
         "your space") — the payoff of the opening promise.
    Test: if you covered up sentence 1, sentence 5 should still clearly
    rhyme with it in tone. If it reads generic/interchangeable across
    products, it fails the loop.
    ASSIGNED CLOSE STRATEGY FOR THIS PRODUCT:
    For this product, close the summary using {{CLOSE_STRATEGY_NAME}} ({{CLOSE_STRATEGY_DESC}}).
    Do NOT use generic anchor buzzwords (e.g. do not rely on "anchor", "anchor point", "visual anchor", "centerpiece"). Do not rely on the banned mood adjectives (soft, gentle, calm, quiet, peaceful, serene, grounded, restful, tidy, organized) for the closing thought.

  Part 5 — BULLETS (deterministic — NOT generated by the LLM's free text):
    Pulled directly from attributes, never invented:
      - Size options available
      - Recommended mattress size + thickness (bed category only)
      - Storage type options
      - Finish or colour options
    Omit any bullet whose attribute doesn't exist on this product —
    never pad with "N/A" or a placeholder.
    (NOTE: Do not output bullets inside the description.summary string; bullets are programmatically added to key_features).

  PROSE STYLE & RESONANCE (APPLIES TO MOOD & STORY):
  Translate each grounded fact into its lived, sensory consequence, not just state the fact. E.g. "hydraulic storage" → "generous under-bed space to store seasonal linens out of everyday traffic" rather than "an integrated hydraulic storage system." "Solid wood" → the tactile/visual warmth it brings to a room, not just "durable construction."
  
  CRITICAL GROUNDING RULE FOR PROSE STYLE:
  This is a REWORDING instruction, not a new-content instruction. You MUST NOT introduce any specific claim (color, hardware, shape, accent detail, pattern) that isn't present in the input product data. When design details are present, apply this rich treatment to them. When design details are absent, this guidance must draw ONLY from the material, storage, and room-use facts provided. Do not invent details just to sound warm.

  WORD-CHOICE & VOCABULARY GUIDANCE:
  Replace plain or utilitarian verbs and adjectives with richer, more considered equivalents:
  - 'Assembled with' → 'Crafted with' / 'Meticulously built with'
  - 'Constructed with' → 'Fashioned from' / 'Handcrafted from'
  - 'Built from' → 'Crafted from' / 'Rendered in'
  - 'sturdy' → 'robust' / 'resilient' / 'enduring'
  - 'durable' → 'long-lasting' / 'built to endure'
  - 'dependable framework' → 'trusted framework' / 'steadfast construction'
  - 'provides sturdy support' → 'offers unwavering support'
  - 'thoughtful proportions' → 'considered proportions' / 'thoughtful scale'
  - 'practical utility' → 'effortless functionality'
  - 'Reassuring joinery' → 'Confident craftsmanship' / 'Considered joinery'
  - 'soft satin treatments' → 'refined satin detailing'
  - 'creates an inviting surface' → 'lends a graceful, inviting finish'
  - 'looks even better with age' → 'develops character with age'
  - 'Smooth protective sealants' → 'Meticulous protective finishing'
  - 'preserve the authentic grain' → 'honour the natural grain'
  - 'Mellow wood grain patterns' → 'Rich, understated grain patterns'
  - 'hand-rubbed surfaces' → 'hand-finished surfaces'
  - 'grounded ease' → 'quiet sophistication'
  - 'balanced silhouette' → 'considered silhouette'
  - 'harmonizes with' → 'complements effortlessly'
  - 'approachable warmth' → 'refined warmth'
  Ensure vocabulary upgrades remain appropriate for the assigned tone without crossing into forbidden words (e.g. avoid 'premium', 'luxurious', 'indulgent' unless assigned to premium_indulgent).

12. NEVER include specific numeric measurements (dimensions, weight, or any other raw number) in the prose. Describe scale and presence qualitatively — e.g. 'a substantial, grounded presence' rather than citing exact measurements. Numbers belong only in the specifications block and in key_features bullets, never in this summary.

Produce the prose targeting ~70-110 words across 4-6 sentences.

    CATEGORY RULES for {{CATEGORY}} / {{SUBCATEGORY}}:
    Emphasis: {{CATEGORY_EMPHASIS}}
    Avoid: {{CATEGORY_AVOID}}
    Tone: {{CATEGORY_TONE}}

LEARNED PREFERENCES (feedback-derived rules):
{{LEARNED_RULES}}

{{DIVERSITY_CONTEXT}}`;

const SUBCATEGORY_MAPPING = {
  beds: 'Beds',
  bed: 'Beds',
  'storage bed': 'Beds',
  'storage beds': 'Beds',
  'hydraulic storage bed': 'Beds',
  'hydraulic storage beds': 'Beds',
  'box storage bed': 'Beds',
  'box storage beds': 'Beds',
  'drawer storage bed': 'Beds',
  'drawer storage beds': 'Beds',
  'wooden bed': 'Beds',
  'wooden beds': 'Beds',
  'solid wood bed': 'Beds',
  'solid wood beds': 'Beds',
  'upholstered bed': 'Beds',
  'upholstered beds': 'Beds',
  'single bed': 'Beds',
  'single beds': 'Beds',
  'king size bed': 'Beds',
  'king size beds': 'Beds',
  'queen size bed': 'Beds',
  'queen size beds': 'Beds',
  'all beds': 'Beds',
  mattresses: 'Mattresses',
  mattress: 'Mattresses',
  'king size mattress': 'Mattresses',
  'queen size mattress': 'Mattresses',
  'memory foam mattress': 'Mattresses',
  'orthopaedic mattress': 'Mattresses',
  'spring mattress': 'Mattresses',
  wardrobes: 'Wardrobes',
  wardrobe: 'Wardrobes',
  '2 door wardrobes': 'Wardrobes',
  '2-door wardrobes': 'Wardrobes',
  '3 door wardrobes': 'Wardrobes',
  '3-door wardrobes': 'Wardrobes',
  'sliding wardrobes': 'Wardrobes',
  'bedroom storage': 'Bedroom Storage',
  'dressing tables': 'Bedroom Storage',
  'dressing table': 'Bedroom Storage',
  'bedside tables': 'Bedroom Storage',
  'bedside table': 'Bedroom Storage',
  'chest of drawers': 'Bedroom Storage',
  benches: 'Bedroom Storage',
  'storage chests': 'Bedroom Storage',
  'kids room': 'Kids Room',
  'kids beds': 'Kids Room',
  'kids bed': 'Kids Room',
  'bunk beds': 'Kids Room',
  'bunk bed': 'Kids Room',
  'kids tables': 'Kids Room',
  'kids table': 'Kids Room',
  'kids chairs': 'Kids Room',
  'kids chair': 'Kids Room',
  'pet furniture': 'Pet Furniture',
  'pet beds': 'Pet Furniture',
  'pet bed': 'Pet Furniture',
};

function resolveSubcategoryName(subcategory) {
  if (!subcategory) return null;
  const key = String(subcategory).trim().toLowerCase();
  if (SUBCATEGORY_MAPPING[key]) {
    return SUBCATEGORY_MAPPING[key];
  }
  return subcategory.trim();
}

function loadCategoryRules(category, subcategory) {
  const baseDir = path.join(__dirname, 'reference-data', 'categoryPrompts');
  const catPath = category ? path.join(baseDir, category) : null;
  const subName = resolveSubcategoryName(subcategory);

  const subPath = catPath && subName ? path.join(catPath, `${subName}.json`) : null;
  const catDefPath = catPath ? path.join(catPath, '_default.json') : null;
  const globalDefPath = path.join(baseDir, '_default.json');

  let rules = null;
  if (subPath && fs.existsSync(subPath)) {
    try {
      rules = JSON.parse(fs.readFileSync(subPath, 'utf-8'));
    } catch (e) {}
  }
  if (!rules && catDefPath && fs.existsSync(catDefPath)) {
    try {
      rules = JSON.parse(fs.readFileSync(catDefPath, 'utf-8'));
    } catch (e) {}
  }
  if (!rules && fs.existsSync(globalDefPath)) {
    try {
      rules = JSON.parse(fs.readFileSync(globalDefPath, 'utf-8'));
    } catch (e) {}
  }

  return rules || { emphasis_points: [], avoid_list: [], tone_notes: '' };
}

function formatLearnedRules(rules, category) {
  const categoryRules = rules ? rules[category] : null;
  if (!categoryRules || Object.keys(categoryRules).length === 0) {
    return '(none yet)';
  }
  return Object.entries(categoryRules)
    .map(([field, rule]) => `- [${field}] ${rule}`)
    .join('\n');
}

const { getEffectiveTone } = require('./tone');
const { buildDiversityHint } = require('./ai-opener-store.helper');

const TONE_NAMES = Object.freeze({
  warm_inviting: 'Warm & Inviting',
  elegant_sophisticated: 'Elegant & Sophisticated',
  minimal_modern: 'Minimal & Modern',
  premium_indulgent: 'Premium & Indulgent',
  playful_casual: 'Playful & Casual',
});

function loadTonePresets() {
  const { TONE_PRESETS } = require('./tone');
  return TONE_PRESETS;
}

function assemblePromptTemplate({
  product,
  tier,
  careMatch,
  toneName,
  toneVoice,
  lengthDirection,
  learnedRules,
  selectedTone,
}) {
  const productKey = product.id || product.product_short_name || product.name;
  const assignedStrategy = selectOpeningStrategy(productKey);
  const assignedCloseStrategy = selectCloseStrategy(productKey);

  const variantSeating = product.seating_capacity || '(not specified)';
  const variantColor = product.color_finish || '(not specified)';

  let schemaSubset = JSON.parse(JSON.stringify(LLM_GENERATED_SCHEMA_SUBSET));
  if (lengthDirection) {
    const words = lengthDirection === 'shorter' ? '40-60' : '120-150';
    schemaSubset.description.summary = `CRITICAL OVERRIDE: Target ${words} words. The user requested this length.`;
  }

  const categoryRules = loadCategoryRules(product.category, product.subcategory);

  let systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{{SCHEMA_SUBSET}}', JSON.stringify(schemaSubset, null, 2))
    .replace('{{TONE_NAME}}', toneName)
    .replace('{{TONE_VOICE}}', String(toneVoice || ''))
    .replace('{{TIER}}', tier)
    .replace('{{TIER_VOICE}}', String(toneVoice || ''))
    .replace('{{MATCHED_CATEGORY}}', careMatch.category)
    .replace('{{MATCHED_INSTRUCTIONS}}', JSON.stringify(careMatch.instructions))
    .replace('{{MATCHED_AVOID}}', JSON.stringify(careMatch.avoid))
    .replace('{{VARIANT_SEATING}}', variantSeating)
    .replace('{{VARIANT_COLOR}}', variantColor)
    .replace('{{CATEGORY}}', product.category || 'Unknown')
    .replace('{{SUBCATEGORY}}', product.subcategory || 'Unknown')
    .replace(
      '{{INTRO_INSTRUCTION}}',
      product.design_details
        ? `INTRO: Names the product type + its single most distinctive design hook (${product.design_details}).`
        : `INTRO: Names the product type. (No specific design hook is provided, so do not invent one).`,
    )
    .replaceAll('{{SHORT_NAME}}', product.product_short_name || product.name.split(' ')[0])
    .replace('{{STRATEGY_NAME}}', assignedStrategy.name)
    .replace('{{STRATEGY_DESC}}', assignedStrategy.description)
    .replace('{{CLOSE_STRATEGY_NAME}}', assignedCloseStrategy.name)
    .replace('{{CLOSE_STRATEGY_DESC}}', assignedCloseStrategy.description)
    .replace('{{CATEGORY_EMPHASIS}}', JSON.stringify(categoryRules.emphasis_points))
    .replace('{{CATEGORY_AVOID}}', JSON.stringify(categoryRules.avoid_list))
    .replace('{{CATEGORY_TONE}}', categoryRules.tone_notes)
    .replace('{{LEARNED_RULES}}', formatLearnedRules(learnedRules, product.category))
    .replace('{{DIVERSITY_CONTEXT}}', buildDiversityHint(8));

  const variantLines = [];
  if (product.seating_capacity) variantLines.push(`Primary size/seating variant (THIS product): ${product.seating_capacity}`);
  if (product.color_finish) variantLines.push(`Color / finish (THIS product): ${product.color_finish}`);
  if (product.color_reason) variantLines.push(`Reason this color/finish suits a shopper (use this, don't invent a different one): ${product.color_reason}`);

  const productForPrompt = { ...product };
  delete productForPrompt.dimensions;
  delete productForPrompt.weight;
  delete productForPrompt.secondary_material;

  let userPrompt = `PRODUCT INPUT:
Name: ${productForPrompt.name}
Category: ${productForPrompt.category}
Subcategory: ${productForPrompt.subcategory || ''}
${variantLines.join('\n')}
Raw source data: ${JSON.stringify(productForPrompt, null, 2)}

Generate the requested fields now.`;

  return { systemPrompt, userPrompt, tier, careMatch, assignedStrategy, assignedCloseStrategy, selectedTone };
}

function buildPrompt(
  product,
  priceBands,
  lengthDirection = null,
  learnedRules = {},
  selectedTone = null,
  tenantContext = {},
) {
  const pb = priceBands || loadPriceBands();
  const tier = computeTier(product.price, product.category, pb);
  const careMatch = matchMaterial(product.primary_material);

  const toneId =
    typeof selectedTone === 'object' && selectedTone !== null
      ? selectedTone.toneId || selectedTone.tone_id || selectedTone.id
      : selectedTone;

  const companyId =
    tenantContext.company_id ||
    tenantContext.companyId ||
    (typeof selectedTone === 'object' && selectedTone !== null ? selectedTone.companyId || selectedTone.company_id : null);
  const applicationId =
    tenantContext.application_id ||
    tenantContext.applicationId ||
    (typeof selectedTone === 'object' && selectedTone !== null
      ? selectedTone.applicationId || selectedTone.application_id
      : null);

  let toneName = `Tier Voice (${tier})`;
  let toneVoice = TIER_VOICE[tier] || '';

  if (toneId && toneId !== 'auto') {
    toneName = TONE_NAMES[toneId] || toneId;
    const toneResult = getEffectiveTone({ companyId, applicationId, toneId });
    toneVoice = String(toneResult || '');
  }

  const syncResult = assemblePromptTemplate({
    product,
    tier,
    careMatch,
    toneName,
    toneVoice,
    lengthDirection,
    learnedRules,
    selectedTone: toneId,
  });

  // Support both synchronous destructuring and async await
  const asyncPromise = (async () => {
    if (toneId && toneId !== 'auto') {
      const asyncResolvedTone = await getEffectiveTone({ companyId, applicationId, toneId });
      if (asyncResolvedTone && asyncResolvedTone !== toneVoice) {
        return assemblePromptTemplate({
          product,
          tier,
          careMatch,
          toneName,
          toneVoice: String(asyncResolvedTone),
          lengthDirection,
          learnedRules,
          selectedTone: toneId,
        });
      }
    }
    return syncResult;
  })();

  Object.assign(asyncPromise, syncResult);
  return asyncPromise;
}

const VOCABULARY_UPGRADES = {
  'Assembled with': 'Crafted with / Meticulously built with',
  'Constructed with': 'Fashioned from / Handcrafted from',
  'Built from': 'Crafted from / Rendered in',
  'sturdy': 'robust / resilient / enduring',
  'durable': 'long-lasting / built to endure',
  'dependable framework': 'trusted framework / steadfast construction',
  'provides sturdy support': 'offers unwavering support',
  'thoughtful proportions': 'considered proportions / thoughtful scale',
  'practical utility': 'effortless functionality',
  'Reassuring joinery': 'Confident craftsmanship / Considered joinery',
  'soft satin treatments': 'refined satin detailing',
  'creates an inviting surface': 'lends a graceful, inviting finish',
  'looks even better with age': 'develops character with age',
  'Smooth protective sealants': 'Meticulous protective finishing',
  'preserve the authentic grain': 'honour the natural grain',
  'Mellow wood grain patterns': 'Rich, understated grain patterns',
  'hand-rubbed surfaces': 'hand-finished surfaces',
  'grounded ease': 'quiet sophistication',
  'balanced silhouette': 'considered silhouette',
  'harmonizes with': 'complements effortlessly',
  'approachable warmth': 'refined warmth',
};

module.exports = {
  buildPrompt,
  computeTier,
  loadPriceBands,
  loadRulesFromMongo,
  loadCategoryRules,
  loadTonePresets,
  resolveSubcategoryName,
  formatLearnedRules,
  SUBCATEGORY_MAPPING,
  OPENING_STRATEGIES,
  CLOSE_ANCHOR_STRATEGIES,
  TIER_VOICE,
  VOCABULARY_UPGRADES,
};
