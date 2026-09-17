/**
 * Single Responsibility: General dataset builder for any catalog subcategory.
 * Discovers products across paginated collection URLs, extracts specs from the confirmed
 * specification table, verifies cross-subcategory SKU uniqueness, runs generation with
 * similarity/phrase guards, and appends to data/trainingSet/<subcategory>_generated.jsonl.
 */
const fs = require('fs');
const path = require('path');
const { generateOne, loadPriceBands } = require('../src/generate');
const { isSkuUsed, registerSku } = require('../src/skuRegistry');
const { loadCategoryRules } = require('../src/promptBuilder');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE_FETCH_DELAY_MS = 1500;
const TRAINING_SET_DIR = path.join(__dirname, '..', 'data', 'trainingSet');

// Canonical configuration per Bedroom subcategory
const SUBCATEGORY_CONFIGS = {
  Mattresses: {
    name: 'Mattresses',
    category: 'Bedroom',
    seedUrls: [
      'https://www.urbanladder.com/mattresses',
      'https://www.urbanladder.com/collection/king-size-mattress',
      'https://www.urbanladder.com/collection/queen-size-mattress',
      'https://www.urbanladder.com/collection/memory-foam-mattress',
      'https://www.urbanladder.com/collection/orthopaedic-mattress',
      'https://www.urbanladder.com/collection/spring-mattress'
    ],
    categoryGuard: (name, genericName) => /\bMattress\b/i.test(name || '') || /\bMattress\b/i.test(genericName || ''),
    outputFile: path.join(TRAINING_SET_DIR, 'mattresses_generated.jsonl')
  },
  Wardrobes: {
    name: 'Wardrobes',
    category: 'Bedroom',
    seedUrls: [
      'https://www.urbanladder.com/wardrobes',
      'https://www.urbanladder.com/collection/2-door-wardrobes',
      'https://www.urbanladder.com/collection/3-door-wardrobes',
      'https://www.urbanladder.com/collection/sliding-wardrobes'
    ],
    categoryGuard: (name, genericName) => /\b(Wardrobe|Almirah|Cupboard)\b/i.test(name || '') || /\b(Wardrobe|Almirah|Cupboard)\b/i.test(genericName || ''),
    outputFile: path.join(TRAINING_SET_DIR, 'wardrobes_generated.jsonl')
  },
  'Bedroom Storage': {
    name: 'Bedroom Storage',
    category: 'Bedroom',
    seedUrls: [
      'https://www.urbanladder.com/collection/dressing-tables',
      'https://www.urbanladder.com/collection/bedside-tables',
      'https://www.urbanladder.com/collection/chest-of-drawers'
    ],
    categoryGuard: (name, genericName) => /\b(Dressing|Bedside|Chest|Drawer|Bench|Storage|Nightstand|Table)\b/i.test(name || '') || /\b(Dressing|Bedside|Chest|Drawer|Bench|Storage|Nightstand|Table)\b/i.test(genericName || ''),
    outputFile: path.join(TRAINING_SET_DIR, 'bedroom_storage_generated.jsonl')
  },
  'Kids Room': {
    name: 'Kids Room',
    category: 'Bedroom',
    seedUrls: [
      'https://www.urbanladder.com/collection/kids-beds',
      'https://www.urbanladder.com/collection/bunk-beds',
      'https://www.urbanladder.com/collection/kids-tables',
      'https://www.urbanladder.com/collection/kids-chairs'
    ],
    categoryGuard: (name, genericName) => /\b(Kids|Child|Bunk|Slide|Junior|Baby|Toddler|Bed|Table|Chair|Study)\b/i.test(name || '') || /\b(Kids|Child|Bunk|Slide|Junior|Baby|Toddler|Bed|Table|Chair|Study)\b/i.test(genericName || ''),
    outputFile: path.join(TRAINING_SET_DIR, 'kids_room_generated.jsonl')
  },
  'Pet Furniture': {
    name: 'Pet Furniture',
    category: 'Bedroom',
    seedUrls: [
      'https://www.urbanladder.com/collection/pet-beds'
    ],
    categoryGuard: (name, genericName) => /\b(Pet|Dog|Cat|Animal)\b/i.test(name || '') || /\b(Pet|Dog|Cat|Animal)\b/i.test(genericName || ''),
    outputFile: path.join(TRAINING_SET_DIR, 'pet_furniture_generated.jsonl')
  },
  Beds: {
    name: 'Beds',
    category: 'Bedroom',
    seedUrls: [
      'https://www.urbanladder.com/beds',
      'https://www.urbanladder.com/collection/all-beds',
      'https://www.urbanladder.com/collection/king-size-beds',
      'https://www.urbanladder.com/collection/queen-size-beds',
      'https://www.urbanladder.com/collection/single-beds',
      'https://www.urbanladder.com/collection/storage-beds',
      'https://www.urbanladder.com/collection/hydraulic-storage-beds',
      'https://www.urbanladder.com/collection/wooden-beds',
      'https://www.urbanladder.com/collection/solid-wood-beds',
      'https://www.urbanladder.com/collection/upholstered-beds'
    ],
    categoryGuard: (name, genericName) => /\bBed\b/i.test(name || '') || /\bBed\b/i.test(genericName || ''),
    outputFile: path.join(TRAINING_SET_DIR, 'beds_generated.jsonl')
  }
};

const KNOWN_LABELS = [
  'Name',
  'Item Code',
  'Generic Name',
  'Primary Material Type',
  'Primary Material Subtype',
  'Secondary Material Type',
  'Storage Availability',
  'Storage Type',
  'Primary Color',
  'Finish Name',
  'Warranty In Months',
  'Recommended Mattress Size',
  'Size of the Bed',
  'Mattress Size',
  'Length',
  'Width',
  'Height',
  'Net Weight',
  'Seating Capacity'
];

function isSingleValue(val) {
  if (!val || val === ':') return false;
  if (val.includes('StorageDrawer') || val.includes('StorageHydraulic') || val.includes('StorageNon') || val.includes('Box StorageNon')) {
    return false;
  }
  return true;
}

function parseLabelValues(html) {
  const map = {};

  const cleanLines = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<dt[^>]*>/gi, '\n')
    .replace(/<\/dt>/gi, '\n')
    .replace(/<dd[^>]*>/gi, '\n')
    .replace(/<\/dd>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<td[^>]*>/gi, '\n')
    .replace(/<\/td>/gi, '\n')
    .replace(/<th[^>]*>/gi, '\n')
    .replace(/<\/th>/gi, '\n')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    if (KNOWN_LABELS.includes(line)) {
      const val = cleanLines[i + 1];
      if (isSingleValue(val)) {
        map[line] = val;
      }
    }
  }

  for (const label of KNOWN_LABELS) {
    if (!map[label] || !isSingleValue(map[label])) {
      const jsonRegex = new RegExp(`["']key["']\\s*:\\s*["']${label}["'][\\s\\S]{0,100}?["']value["']\\s*:\\s*["']([^"']+)["']`, 'i');
      const jsonMatch = html.match(jsonRegex);
      if (jsonMatch && jsonMatch[1] && isSingleValue(jsonMatch[1])) {
        map[label] = jsonMatch[1];
      } else {
        const dtRegex = new RegExp(`<dt[^>]*>\\s*${label}\\s*<\\/dt>\\s*<dd[^>]*>\\s*([\\s\\S]*?)\\s*<\\/dd>`, 'i');
        const dtMatch = html.match(dtRegex);
        if (dtMatch && dtMatch[1]) {
          const cleanVal = dtMatch[1].replace(/<[^>]+>/g, '').trim();
          if (isSingleValue(cleanVal)) {
            map[label] = cleanVal;
          }
        }
      }
    }
  }

  if (!map['Name']) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      map['Name'] = h1Match[1].replace(/<[^>]+>/g, '').trim();
    } else {
      const jsonName = html.match(/"name"\s*:\s*"([^"]+)"/i);
      if (jsonName && jsonName[1]) {
        map['Name'] = jsonName[1].replace(/\s*-\s*Urban Ladder$/i, '').trim();
      }
    }
  }

  let price;
  const priceJsonMatch = html.match(/"effective"\s*:\s*\{\s*"min"\s*:\s*(\d+)/i) || html.match(/"price"\s*:\s*(\d+)/i);
  if (priceJsonMatch) {
    price = parseInt(priceJsonMatch[1], 10);
  } else {
    const priceTextMatch = html.match(/₹\s*([\d,]+)/);
    if (priceTextMatch) {
      price = parseInt(priceTextMatch[1].replace(/,/g, ''), 10);
    }
  }

  return { labelMap: map, price };
}

function extractProductSpec(html, url, subcategoryName) {
  const config = SUBCATEGORY_CONFIGS[subcategoryName] || {
    name: subcategoryName,
    category: 'Bedroom',
    categoryGuard: () => true
  };

  const { labelMap, price } = parseLabelValues(html);

  const foundLabels = Object.keys(labelMap).filter(k => k !== 'Name');
  if (foundLabels.length === 0) {
    return { status: 'structure_not_found', reason: 'Zero known specification labels located on page' };
  }

  const name = labelMap['Name'];
  const sku = labelMap['Item Code'];
  const generic_name = labelMap['Generic Name'];

  // Category guard validation
  if (typeof config.categoryGuard === 'function' && !config.categoryGuard(name, generic_name)) {
    return { status: 'category_guard_failed', reason: `excluded: does not match category guard for ${subcategoryName}` };
  }

  const primary_material = labelMap['Primary Material Subtype'] || labelMap['Primary Material Type'] || 'Engineered Wood';
  const secondary_material = labelMap['Secondary Material Type'] || undefined;

  const seating_capacity = labelMap['Size of the Bed'] || labelMap['Mattress Size'] || labelMap['Seating Capacity'] || undefined;
  const storage_type = labelMap['Storage Type'] || undefined;
  const finish = labelMap['Finish Name'];
  const colour = labelMap['Primary Color'];
  const color_finish = finish || colour || undefined;

  let dimensions;
  if (labelMap['Length'] && labelMap['Width'] && labelMap['Height']) {
    dimensions = `Length ${labelMap['Length']} x Width ${labelMap['Width']} x Height ${labelMap['Height']}`;
  } else if (labelMap['Dimensions']) {
    dimensions = labelMap['Dimensions'];
  }

  const weight = labelMap['Net Weight'];

  let warranty_months;
  if (labelMap['Warranty In Months']) {
    const parsed = parseInt(labelMap['Warranty In Months'], 10);
    if (!isNaN(parsed)) warranty_months = parsed;
  }
  if (warranty_months === undefined) {
    warranty_months = 12;
  }

  let mattress_recommendation;
  if (labelMap['Recommended Mattress Size']) {
    mattress_recommendation = { size: labelMap['Recommended Mattress Size'] };
  }

  const urlSlug = url.split('/product/')[1] || '';
  const cleanId = sku ? `ul-${sku.toLowerCase()}` : `ul-${urlSlug.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  const missing = [];
  if (!name) missing.push('name');
  if (!dimensions) missing.push('dimensions');
  if (!price) missing.push('price');

  if (missing.length > 0) {
    return { status: 'structure_incomplete', missing };
  }

  const variant_axes = {
    size: seating_capacity ? [seating_capacity] : [],
    storage_type: storage_type ? [storage_type] : [],
    finish: finish ? [finish] : [],
    colour: colour ? [colour] : []
  };

  const product_short_name = name.split(' ')[0];

  const spec = {
    id: cleanId,
    item_code: sku || cleanId.replace(/^ul-/, '').toUpperCase(),
    name,
    product_short_name,
    category: config.category || 'Bedroom',
    subcategory: config.name,
    primary_material,
    ...(secondary_material ? { secondary_material } : {}),
    ...(seating_capacity ? { seating_capacity } : {}),
    ...(color_finish ? { color_finish } : {}),
    ...(storage_type ? { storage_type } : {}),
    variant_axes,
    ...(mattress_recommendation ? { mattress_recommendation } : {}),
    dimensions,
    ...(weight ? { weight } : {}),
    warranty_months,
    price
  };

  return { status: 'complete', spec };
}

async function discoverUrlsForSubcategory(subcategoryName) {
  const config = SUBCATEGORY_CONFIGS[subcategoryName];
  if (!config) {
    throw new Error(`Unknown subcategory config: ${subcategoryName}`);
  }

  console.log(`\n=== STEP 1: Discovering URLs for ${subcategoryName} ===`);
  const validSeedUrls = [];

  for (const url of config.seedUrls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) {
        validSeedUrls.push(url);
        console.log(`  [OK ${res.status}] Seed URL verified: ${url}`);
      } else {
        console.warn(`  [SKIP ${res.status}] Seed URL returned non-OK status: ${url}`);
      }
    } catch (err) {
      console.warn(`  [SKIP ERR] Seed URL fetch error for ${url}: ${err.message}`);
    }
  }

  const productUrls = new Set();
  for (const baseUrl of validSeedUrls) {
    for (let page = 1; page <= 5; page++) {
      const pageUrl = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
      try {
        console.log(`Scanning: ${pageUrl}...`);
        const res = await fetch(pageUrl, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) break;
        const html = await res.text();

        const matches = html.match(/href=["'](\/product\/[^"'?]+)["']/g) || [];
        let newFoundOnPage = 0;
        for (const m of matches) {
          const pathStr = m.replace(/href=["']/, '').replace(/["']$/, '');
          if (pathStr.startsWith('/product/')) {
            const fullUrl = `https://www.urbanladder.com${pathStr}`;
            if (!productUrls.has(fullUrl)) {
              productUrls.add(fullUrl);
              newFoundOnPage++;
            }
          }
        }

        if (newFoundOnPage === 0 && page > 1) {
          break;
        }
      } catch (err) {
        console.error(`Error scanning ${pageUrl}: ${err.message}`);
        break;
      }
      await new Promise(r => setTimeout(r, PAGE_FETCH_DELAY_MS));
    }
  }

  const list = Array.from(productUrls);
  console.log(`Discovered ${list.length} total unique product URLs for ${subcategoryName}.`);
  return list;
}

async function buildSubcategoryDataset({ subcategory, maxProducts = 15, delayMs = 1500 }) {
  const config = SUBCATEGORY_CONFIGS[subcategory];
  if (!config) {
    throw new Error(`Unsupported subcategory: ${subcategory}. Available: ${Object.keys(SUBCATEGORY_CONFIGS).join(', ')}`);
  }

  console.log(`======================================================`);
  console.log(`BUILDING DATASET FOR SUBCATEGORY: "${subcategory}" (Cap: ${maxProducts})`);
  console.log(`======================================================`);

  // Confirm category rule file resolution
  const loadedRules = loadCategoryRules(config.category, subcategory);
  console.log(`[Category Rules] Loaded file: ${loadedRules._loadedFile || '(default)'}`);

  const productUrls = await discoverUrlsForSubcategory(subcategory);
  const targetUrls = productUrls.slice(0, Math.max(maxProducts * 3, 50)); // Fetch enough to handle skips/incompletes

  console.log(`\n=== STEP 2: Fetching Specs & Checking SKU Dedup for ${subcategory} ===`);
  const eligibleSpecs = [];
  const dedupSkips = [];

  for (let i = 0; i < targetUrls.length; i++) {
    if (eligibleSpecs.length >= maxProducts) break;

    const url = targetUrls[i];
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) continue;
      const html = await res.text();
      const extracted = extractProductSpec(html, url, subcategory);

      if (extracted.status === 'complete') {
        const spec = extracted.spec;
        const itemCode = spec.item_code || spec.id;

        // Dedup check: check if SKU is already claimed by any subcategory
        const existingClaim = isSkuUsed(itemCode);
        if (existingClaim) {
          const skipMsg = `skipped: already claimed by ${existingClaim.subcategory} (SKU: ${itemCode}, Product: "${spec.name}")`;
          console.log(`  [DEDUP SKIP] ${skipMsg}`);
          dedupSkips.push({ sku: itemCode, name: spec.name, claimedBy: existingClaim.subcategory, id: spec.id });
          continue;
        }

        console.log(`  [SPEC OK] "${spec.name}" (SKU: ${itemCode}) -> Ready for generation`);
        eligibleSpecs.push(spec);
      } else {
        console.log(`  [SPEC SKIP] ${extracted.status}: ${extracted.reason || JSON.stringify(extracted.missing || '')}`);
      }
    } catch (err) {
      console.warn(`  [FETCH ERR] ${url}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, PAGE_FETCH_DELAY_MS));
  }

  console.log(`\nEligible Products to Generate: ${eligibleSpecs.length} (Dedup Skips: ${dedupSkips.length})`);

  console.log(`\n=== STEP 3: Generating Content via generateOne() ===`);
  const priceBands = loadPriceBands();

  if (!fs.existsSync(TRAINING_SET_DIR)) {
    fs.mkdirSync(TRAINING_SET_DIR, { recursive: true });
  }

  const generatedResults = [];
  const outputFile = config.outputFile;

  for (let i = 0; i < eligibleSpecs.length; i++) {
    const spec = eligibleSpecs[i];
    console.log(`\n[${i + 1}/${eligibleSpecs.length}] Generating for "${spec.name}" (${spec.id})...`);

    try {
      const generatedOutput = await generateOne(spec, priceBands);

      // Register SKU ONLY after successful generation
      registerSku(spec.item_code || spec.id, {
        subcategory,
        id: spec.id
      });

      const summary = generatedOutput.description?.summary || '';
      const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(Boolean) || (summary.trim() ? [summary.trim()] : []);
      const opener = sentences[0] || '';
      const closer = sentences.length > 0 ? sentences[sentences.length - 1] : '';

      const datasetRecord = {
        input: spec,
        output: generatedOutput
      };

      fs.appendFileSync(outputFile, JSON.stringify(datasetRecord) + '\n', 'utf-8');

      generatedResults.push({
        index: i + 1,
        id: spec.id,
        name: spec.name,
        subcategory,
        itemCode: spec.item_code,
        opener,
        closer,
        attempts: generatedOutput._meta?.attempt_history?.length || 1,
        repetitionFlagged: Boolean(generatedOutput._meta?.repetition_flagged),
        phraseOveruseFlagged: Boolean(generatedOutput._meta?.phrase_overuse_flagged),
        overusedPhrases: generatedOutput._meta?.overused_phrases || []
      });

      console.log(`  -> Opener: "${opener}"`);
      console.log(`  -> Closer: "${closer}"`);

    } catch (err) {
      console.error(`  [GENERATION ERROR] ${spec.id}: ${err.message}`);
    }

    if (i < eligibleSpecs.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return {
    subcategory,
    loadedRuleFile: loadedRules._loadedFile,
    eligibleSpecsCount: eligibleSpecs.length,
    generatedResults,
    dedupSkips
  };
}

module.exports = {
  SUBCATEGORY_CONFIGS,
  extractProductSpec,
  discoverUrlsForSubcategory,
  buildSubcategoryDataset
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const subcatArg = args.find((a, i) => args[i - 1] === '--subcategory') || 'Mattresses';
  const capArg = parseInt(args.find((a, i) => args[i - 1] === '--cap') || '15', 10);

  buildSubcategoryDataset({ subcategory: subcatArg, maxProducts: capArg })
    .then(report => {
      console.log('\n=== RUN COMPLETED ===');
      console.log(`Subcategory: ${report.subcategory}`);
      console.log(`Rule File: ${report.loadedRuleFile}`);
      console.log(`Generated: ${report.generatedResults.length}`);
      console.log(`Dedup Skips: ${report.dedupSkips.length}`);
    })
    .catch(err => {
      console.error('Execution failed:', err);
      process.exit(1);
    });
}
