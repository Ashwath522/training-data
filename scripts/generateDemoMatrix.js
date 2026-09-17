#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

process.on('unhandledRejection', () => {});

// Prevent ECONNREFUSED when running standalone demo without local MongoDB daemon
const dummyConnection = new mongoose.Connection(mongoose);
const mongoInitPath = require.resolve('../app/common/mongo.init');
require.cache[mongoInitPath] = {
  id: mongoInitPath,
  filename: mongoInitPath,
  loaded: true,
  exports: { host: dummyConnection, groot: dummyConnection },
};

const { transformCatalogItemToProduct } = require('../app/helpers/ai-content/ai-attribute-transform.helper');
const { generateOne } = require('../app/helpers/ai-content/ai-orchestrator.helper');
const { validateItem, checkLoopThemeMatch, THEME_FAMILIES } = require('../app/helpers/ai-content/ai-validator.helper');
const { buildPrompt, loadTonePresets, loadCategoryRules } = require('../app/helpers/ai-content/ai-prompt-builder.helper');
const { setMockClient, clearMockClient } = require('../app/helpers/ai-content/ai-llm-client.helper');

// Bedroom 6 Subcategories Matrix Configuration
const DEFAULT_MATRIX = [
  {
    subcategory: 'Beds',
    tone: 'elegant_sophisticated',
    count: 5,
    trainingFile: 'beds_generated_enriched.jsonl',
    isEnriched: true,
  },
  {
    subcategory: 'Bedroom Storage',
    tone: 'minimal_modern',
    count: 5,
    trainingFile: 'bedroom_storage_generated_enriched.jsonl',
    isEnriched: true,
  },
  {
    subcategory: 'Mattresses',
    tone: 'premium_indulgent',
    count: 5,
    trainingFile: 'mattresses_generated_enriched.jsonl',
    isEnriched: true,
  },
  {
    subcategory: 'Wardrobes',
    tone: 'warm_inviting',
    count: 5,
    trainingFile: 'wardrobes_generated_enriched.jsonl',
    isEnriched: true,
  },
  {
    subcategory: 'Kids Room',
    tone: 'playful_casual',
    count: 5,
    trainingFile: 'kids_room_generated_enriched.jsonl',
    isEnriched: true,
  },
  {
    subcategory: 'Pet Furniture',
    tone: 'warm_inviting',
    count: 5,
    trainingFile: 'pet_furniture_generated.jsonl',
    isEnriched: false,
    gapNote: 'No enriched variant exists; base training file is empty (0 records).',
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    subcategory: null,
    tone: null,
    count: null,
    apiKey: null,
    provider: null,
    mock: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--subcategory' || arg === '-s') {
      options.subcategory = args[++i];
    } else if (arg === '--tone' || arg === '-t') {
      options.tone = args[++i];
    } else if (arg === '--count' || arg === '-c') {
      options.count = parseInt(args[++i], 10);
    } else if (arg === '--api-key' || arg === '-k') {
      options.apiKey = args[++i];
    } else if (arg === '--provider' || arg === '-p') {
      options.provider = args[++i];
    } else if (arg === '--mock') {
      options.mock = true;
    }
  }

  return options;
}

function printUsage() {
  console.log(`
Usage: node scripts/generateDemoMatrix.js [options]

Multi-Subcategory Tone Matrix (Bedroom only demo & smoke-test)

Options:
  -s, --subcategory <name>  Filter by subcategory (Beds, Bedroom Storage, Mattresses, Wardrobes, Kids Room, Pet Furniture)
  -t, --tone <preset_id>    Override tone preset (warm_inviting, elegant_sophisticated, minimal_modern, premium_indulgent, playful_casual)
  -c, --count <n>           Number of sample products per subcategory (default: 5)
  -k, --api-key <key>       Custom LLM API Key (defaults to LLM_API_KEY env)
  -p, --provider <name>     LLM Provider (gemini, openai, groq, mistral)
  --mock                    Force simulation mode even if API key is present
  -h, --help                Show this help message
`);
}

/**
 * Checks whether a raw training product has complete attributes.
 */
function isProductComplete(product) {
  if (!product || typeof product !== 'object') return false;
  const requiredFields = ['name', 'primary_material', 'dimensions', 'weight'];
  for (const field of requiredFields) {
    if (!product[field] || typeof product[field] !== 'string' || !product[field].trim()) {
      return false;
    }
  }
  if (product.price === undefined || product.price === null || isNaN(Number(product.price))) {
    return false;
  }
  return true;
}

/**
 * Loads and filters complete products from trainingSet file.
 */
function loadProductsForSubcategory(trainingFile, count) {
  let filePath = path.join(__dirname, '..', 'data', 'trainingSet', trainingFile);
  if (!fs.existsSync(filePath)) {
    const archiveDir = path.join(__dirname, '..', 'data', 'trainingSet', '_archive');
    if (fs.existsSync(archiveDir)) {
      const basePrefix = trainingFile.replace(/\.jsonl$/, '');
      const files = fs.readdirSync(archiveDir);
      const matched = files.find((f) => f.startsWith(basePrefix) && f.endsWith('.jsonl'));
      if (matched) {
        filePath = path.join(archiveDir, matched);
      }
    }
  }
  if (!fs.existsSync(filePath)) {
    return {
      products: [],
      error: `File not found: ${filePath}`,
      shortfall: count,
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return {
      products: [],
      error: 'File is empty (0 records)',
      shortfall: count,
    };
  }

  const lines = content.split('\n').filter(Boolean);
  const qualified = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const raw = parsed.input || parsed;
      if (isProductComplete(raw)) {
        qualified.push(raw);
        if (qualified.length >= count) {
          break;
        }
      }
    } catch (err) {
      // ignore parse errors in lines
    }
  }

  const shortfall = Math.max(0, count - qualified.length);
  return {
    products: qualified,
    totalInFile: lines.length,
    shortfall,
  };
}

/**
 * Decomposes 5-part description into labeled fields.
 */
function breakDownDescription(item) {
  const summary = item.description?.summary || '';
  const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || (summary ? [summary.trim()] : []);
  const mood = sentences[0] || '';
  const intro = sentences[1] || '';
  const story = sentences.length > 3 ? sentences.slice(2, -1).join(' ') : (sentences[2] || '');
  const close = sentences.length > 2 ? sentences[sentences.length - 1] : '';
  const bullets = item.description?.key_features || [];

  return {
    mood,
    intro,
    story,
    close,
    bullets,
    sentence_count: sentences.length,
  };
}

/**
 * Evaluates individual validator check statuses.
 */
function evaluateChecks(item, product, validationResult, selectedTone) {
  const summary = item.description?.summary || '';
  const sentences = summary.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()).filter(Boolean) || [];
  const sentenceCount = sentences.length;
  const wordCount = summary.trim().split(/\s+/).filter(Boolean).length;

  const moodLine = sentences[0] || '';
  const closingSentence = sentences[sentences.length - 1] || '';
  const loopCheck = checkLoopThemeMatch(moodLine, closingSentence);

  const shortName = product.product_short_name || product.name.split(' ')[0];
  const escaped = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameMatches = summary.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || [];
  const nameInCloser = new RegExp(`\\b${escaped}\\b`, 'i').test(closingSentence);

  const errors = validationResult.errors || [];

  return {
    valid: validationResult.valid,
    errors,
    checks: {
      sentence_count: {
        pass: sentenceCount >= 4 && sentenceCount <= 6,
        value: sentenceCount,
        expected: '4-6',
      },
      word_count: {
        pass: wordCount >= 70 && wordCount <= 110,
        value: wordCount,
        expected: '70-110',
      },
      loop_theme_match: {
        pass: !loopCheck.checked || loopCheck.matched,
        moodLine,
        closingSentence,
        detectedFamily: loopCheck.detectedFamily,
      },
      product_name_placement: {
        pass: nameMatches.length === 1 && nameInCloser,
        occurrences: nameMatches.length,
        inClosingSentence: nameInCloser,
      },
      no_raw_dimensions: {
        pass: !errors.some((e) => e.includes('raw dimension')),
      },
      tone_leakage: {
        pass: !errors.some((e) => e.includes('Tier leakage')),
        selectedTone,
      },
      specifications: {
        pass: !errors.some((e) => e.includes('specifications.')),
      },
      care_and_maintenance: {
        pass: !errors.some((e) => e.includes('care_and_maintenance') || e.includes('Polite-tone flag')),
      },
      warranty: {
        pass: !errors.some((e) => e.includes('warranty.')),
      },
      returns: {
        pass: !errors.some((e) => e.includes('returns.')),
      },
    },
  };
}

/**
 * Creates high-fidelity tone-aware simulation generator when no LLM key is set.
 */
function createSimulationClient() {
  const VARIATIONS = {
    elegant_sophisticated: [
      {
        mood: 'A statement in contemporary design.',
        intro: (sub) => `This ${sub} is defined by a cleanly sculpted headboard with tailored linear detailing that creates an architectural presence.`,
        story: (mat) => `Crafted from durable ${mat}, the structure ensures dependable stability and lasting strength for everyday life. Gently beveled profiles and a refined hand-applied finish accentuate the rich natural grain throughout the form. The harmonious proportions introduce an air of poised grace into contemporary spaces without overwhelming surrounding accents.`,
        close: (name) => `Bring timeless sophistication and poise to your space with the ${name}.`,
      },
      {
        mood: 'Sophistication defines this contemporary piece.',
        intro: (sub) => `This ${sub} is defined by an understated silhouette that frames the surrounding room with poised architectural balance.`,
        story: (mat) => `Built from select ${mat}, the balanced construction delivers dependable strength and peace of mind for daily living. Gracefully tailored contours and an enduring satin finish highlight the organic depth of the fine wood grains. Its refined geometry elevates contemporary decor while remaining welcoming and practical.`,
        close: (name) => `Bring elevated elegance and refined style to your room with the ${name}.`,
      },
      {
        mood: 'Refined simplicity anchors the bedroom.',
        intro: (sub) => `This ${sub} is defined by continuous geometric lines and an artfully composed presence that anchors your decor.`,
        story: (mat) => `Constructed with resilient ${mat}, the dependable framework offers long-lasting durability through years of regular use. Subtle edge bevels and a smooth protective coating preserve the tactile beauty of the surface. The thoughtful visual weight sits gracefully within both modern and traditional layouts.`,
        close: (name) => `Bring lasting sophistication and artistic grace to your bedroom with the ${name}.`,
      },
      {
        mood: 'Architectural poise defines modern living.',
        intro: (sub) => `This ${sub} is defined by disciplined proportions and clean transitions that bring elevated composure to the area.`,
        story: (mat) => `Made from high-grade ${mat}, the frame guarantees structural integrity and daily dependability you can rely on. Rich wood textures and a satin-smooth touch provide tactile warmth that deepens with everyday familiarity. The cohesive shape complements airy spaces while establishing an intentional decorative focal point.`,
        close: (name) => `Bring contemporary elegance and stately balance to your home with the ${name}.`,
      },
      {
        mood: 'Elevate your space with timeless grace.',
        intro: (sub) => `This ${sub} is defined by clean perimeter detailing and a balanced profile that draws the eye naturally.`,
        story: (mat) => `Fashioned from robust ${mat}, the sturdy construction supports active living with unhurried, grounded strength. Hand-finished outer contours celebrate the character of natural timber without creating unnecessary visual noise. Its versatile proportions fit seamlessly into diverse interior arrangements.`,
        close: (name) => `Bring enduring refinement and quiet sophistication to any space with the ${name}.`,
      },
    ],
    minimal_modern: [
      {
        mood: 'Clean lines bring quiet order.',
        intro: (sub) => `This ${sub} is defined by a low-profile geometric silhouette designed for modern clarity and functional ease.`,
        story: (mat) => `Crafted from durable ${mat}, the frame provides enduring strength and sturdy support through purposeful everyday utility. Smooth flush-front surfaces and crisp edges eliminate visual noise, letting the subtle texture of the material speak for itself. Its balanced proportions settle effortlessly into contemporary spaces while preserving valuable room flow.`,
        close: (name) => `Bring understated simplicity and modern order to your room with the ${name}.`,
      },
      {
        mood: 'Pure geometry shapes thoughtful living.',
        intro: (sub) => `This ${sub} is defined by clean unadorned surfaces that support a peaceful, clutter-free environment.`,
        story: (mat) => `Engineered with resilient ${mat}, the robust base ensures enduring structural performance for relaxed everyday living. Streamlined outer contours and a uniform natural finish maximize ambient light throughout the space. The open framework keeps room circulation airy while maintaining generous day-to-day functionality.`,
        close: (name) => `Bring essential clarity and balanced order to your space with the ${name}.`,
      },
      {
        mood: 'Uncluttered simplicity centers the room.',
        intro: (sub) => `This ${sub} is defined by an honest functional form that emphasizes visual lightness and calm utility.`,
        story: (mat) => `Constructed from solid ${mat}, the frame guarantees dependable balance and long-lasting stability you can trust. Clean horizontal planes and subtle corner miters ensure a tidy aesthetic that fits modern apartments. The deliberate lack of excess ornamentation allows your favorite textiles and accents to shine.`,
        close: (name) => `Bring peaceful simplicity and clean harmony to your bedroom with the ${name}.`,
      },
      {
        mood: 'Balanced proportions inspire everyday calm.',
        intro: (sub) => `This ${sub} is defined by a slender footprint and clean geometric perimeter that optimize floor space.`,
        story: (mat) => `Made from dependable ${mat}, the structure withstands continuous daily use with quiet structural strength. Smooth non-porous surfaces make upkeep simple, maintaining an immaculate appearance with minimal effort. Its modular presence coordinates easily with both compact and open-concept arrangements.`,
        close: (name) => `Bring functional clarity and restful order to any space with the ${name}.`,
      },
      {
        mood: 'Essential clarity defines this space.',
        intro: (sub) => `This ${sub} is defined by an understated linear architecture that fosters an organized and tranquil home.`,
        story: (mat) => `Manufactured with sturdy ${mat}, the piece delivers steadfast structural stability for routine domestic life. Crisp outer boundaries and a neutral finish keep the overall visual impression light and grounded. The sensible design promotes seamless room organization while enhancing everyday routines.`,
        close: (name) => `Bring refined simplicity and calm balance to your room with the ${name}.`,
      },
    ],
    premium_indulgent: [
      {
        mood: 'Crafted luxury defines your retreat.',
        intro: (sub) => `This ${sub} is defined by an expressive architectural presence designed to anchor an elevated sanctuary.`,
        story: (mat) => `Masterfully crafted from durable ${mat}, the frame showcases rich joinery and meticulous construction intended for enduring elegance across generations. Lavish tactile textures and hand-finished contours catch natural ambient lighting, revealing the nuanced depth of the wood. The generous silhouette establishes a deeply relaxing environment suited for lingering long into the morning.`,
        close: (name) => `Bring exceptional craftsmanship and true indulgence to your home with the ${name}.`,
      },
      {
        mood: 'Sumptuous artistry enriches every evening.',
        intro: (sub) => `This ${sub} is defined by an imposing, regal silhouette that transforms the bedroom into a private oasis.`,
        story: (mat) => `Artfully fashioned from select ${mat}, the substantial framework ensures unwavering stability and heirloom durability. Deep lustrous tones and hand-buffed bevels reward close inspection with opulent sensory warmth. The commanding presence infuses your living environment with an undeniable air of timeless sophistication.`,
        close: (name) => `Bring refined grandeur and lasting luxury to your sanctuary with the ${name}.`,
      },
      {
        mood: 'Grand luxury creates an indulgent haven.',
        intro: (sub) => `This ${sub} is defined by sculptural contours and deliberate details that celebrate premium design heritage.`,
        story: (mat) => `Built from heavyweight ${mat}, every joint and corner is engineered to deliver unmatched strength and tactile satisfaction. Rich multi-layered finishes protect the surface while celebrating organic grain variations and distinctive character. The tailored proportions provide a supportive, welcoming retreat after demanding days.`,
        close: (name) => `Bring elevated prestige and bespoke luxury to your bedroom with the ${name}.`,
      },
      {
        mood: 'Lavish textures celebrate relaxed living.',
        intro: (sub) => `This ${sub} is defined by expansive profiles and refined materiality that set an indulgent tone.`,
        story: (mat) => `Constructed with superior-grade ${mat}, the piece embodies lasting reliability and uncompromising structural excellence. Silky smooth edges and deep warm finishes create an inviting focal point that grounds the entire space. It transforms routine evening transitions into cherished rituals of personal comfort.`,
        close: (name) => `Bring timeless elegance and deep indulgence to any room with the ${name}.`,
      },
      {
        mood: 'Opulent luxury enriches daily rituals.',
        intro: (sub) => `This ${sub} is defined by deliberate craftsmanship and grand architectural balance that commands respect.`,
        story: (mat) => `Carefully fashioned from prime ${mat}, the sturdy construction assures dependable service and unyielding strength. Subtle custom accents and hand-polished faces provide an opulent impression that never feels ostentatious. The harmonious design unites enduring comfort with an unmistakable aura of luxury.`,
        close: (name) => `Bring master craftsmanship and opulent luxury to your space with the ${name}.`,
      },
    ],
    warm_inviting: [
      {
        mood: 'Warm comfort welcomes every evening.',
        intro: (sub) => `This ${sub} is defined by an approachable silhouette and gentle curves that foster an inviting sanctuary.`,
        story: (mat) => `Built from dependable ${mat}, this piece is created to anchor your everyday living rituals with lasting peace of mind. Generous surfaces and softened corners invite you to linger and settle in comfortably after a busy day. Natural hues and reassuring construction foster a grounded sanctuary that feels instantly familiar.`,
        close: (name) => `Bring welcoming warmth and cozy ease to your bedroom with the ${name}.`,
      },
      {
        mood: 'Inviting ease creates an intimate sanctuary.',
        intro: (sub) => `This ${sub} is defined by organic proportions and softened corners that make any bedroom feel like home.`,
        story: (mat) => `Crafted from solid ${mat}, the dependable framework offers structural reliability and enduring charm for daily life. Inviting earth-toned finishes and silky sanded textures lend an approachable warmth to your personal space. Its comfortable presence harmonizes with soft lighting and plush blankets for complete relaxation.`,
        close: (name) => `Bring comforting warmth and relaxed belonging to your space with the ${name}.`,
      },
      {
        mood: 'Cozy warmth anchors peaceful nights.',
        intro: (sub) => `This ${sub} is defined by relaxed lines and a friendly form that encourages family comfort.`,
        story: (mat) => `Constructed with durable ${mat}, the piece provides sturdy support that accommodates casual morning lounging with ease. Smooth protective sealants preserve the authentic timber grain while making everyday cleaning simple and fast. The gentle design softens room transitions and creates a reassuring feeling of security.`,
        close: (name) => `Bring heartfelt comfort and cozy living to any room with the ${name}.`,
      },
      {
        mood: 'Gentle warmth fills the bedroom.',
        intro: (sub) => `This ${sub} is defined by smooth rounded accents that invite touch and effortless interaction.`,
        story: (mat) => `Fashioned from quality ${mat}, the frame guarantees dependable longevity and robust structural performance. Mellow wood grain patterns and hand-rubbed surfaces bring nature-inspired serenity into your interior sanctuary. Its balanced silhouette pairs easily with textured rugs and warm ambient table lamps.`,
        close: (name) => `Bring welcoming ease and serene comfort to your home with the ${name}.`,
      },
      {
        mood: 'Comforting textures invite you to linger.',
        intro: (sub) => `This ${sub} is defined by a hospitable presence that makes unwinding at the end of the day effortless.`,
        story: (mat) => `Assembled with sturdy ${mat}, the design assures dependable stability throughout years of everyday routines. Reassuring joinery and soft satin treatments create an inviting surface that looks even better with age. The thoughtful proportions fit cozily into family homes while offering practical utility.`,
        close: (name) => `Bring warm hospitality and everyday comfort to your sanctuary with the ${name}.`,
      },
    ],
    playful_casual: [
      {
        mood: 'Bright energy fills the space.',
        intro: (sub) => `This ${sub} is defined by friendly softened edges and an approachable shape that invites relaxed everyday living.`,
        story: (mat) => `Crafted from durable ${mat}, the resilient frame easily withstands busy daily routines while maintaining its cheerful charm and dependable balance. Smooth rounded contours and an easy-to-clean finish make daily living and tidying up feel completely natural and stress-free. Its versatile layout adapts easily to changing room arrangements and fun family moments.`,
        close: (name) => `Bring cheerful ease and everyday delight to your space with the ${name}.`,
      },
      {
        mood: 'Cheerful charm brings everyday delight.',
        intro: (sub) => `This ${sub} is defined by vibrant clean shapes that add an upbeat spark to family living areas.`,
        story: (mat) => `Engineered with dependable ${mat}, the strong build supports playful activities and daily use with lasting resilience. Snag-free rounded edges and safe water-resistant coatings ensure worry-free ownership for growing households. The open, cheerful layout makes organizing personal belongings intuitive and fun for all ages.`,
        close: (name) => `Bring playful energy and joyful ease to your room with the ${name}.`,
      },
      {
        mood: 'Lively energy brightens family routines.',
        intro: (sub) => `This ${sub} is defined by an energetic, approachable silhouette built for practical, casual comfort.`,
        story: (mat) => `Constructed from solid ${mat}, the framework delivers tough, kid-friendly durability that handles active routines with ease. Smooth tactile surfaces and cheerful modern styling brighten bedroom corners without feeling cluttered. Its compact footprint maximizes playable floor area while providing reliable daily utility.`,
        close: (name) => `Bring bright warmth and relaxed delight to your home with the ${name}.`,
      },
      {
        mood: 'Joyful wonder inspires fun moments.',
        intro: (sub) => `This ${sub} is defined by relaxed lines and an inviting geometry that kids and adults naturally enjoy.`,
        story: (mat) => `Built from sturdy ${mat}, the structure promises long-term dependability and safe support for active everyday spaces. Approachable satin finishes resist scuffs and fingerprints, keeping the piece looking fresh with minimal maintenance. The dynamic silhouette fits neatly alongside colorful storage bins and lively wall decor.`,
        close: (name) => `Bring cheerful harmony and everyday joy to any bedroom with the ${name}.`,
      },
      {
        mood: 'Playful charm brightens any room.',
        intro: (sub) => `This ${sub} is defined by clean, optimistic design lines that make shared spaces feel open and welcoming.`,
        story: (mat) => `Manufactured using tough ${mat}, the frame resists everyday wear while offering reliable, steadfast stability. Rounded corners and smooth sanded faces prioritize comfort and safety across morning and bedtime rituals. Its breezy character invites relaxation and cheerful creativity into personal bedrooms.`,
        close: (name) => `Bring lively charm and playful ease to your space with the ${name}.`,
      },
    ],
  };

  return {
    async generateContent({ systemPrompt, userPrompt }) {
      const nameMatch = userPrompt.match(/Name:\s*(.+)/);
      const name = nameMatch ? nameMatch[1].trim() : 'Standard Furniture Piece';
      const shortName = name.split(/\s+/)[0];

      const catMatch = userPrompt.match(/Category:\s*(.+)/);
      const category = catMatch ? catMatch[1].trim() : 'Bedroom';

      let rawData = {};
      const rawMatch = userPrompt.match(/Raw source data:\s*([\s\S]+?)\n\nGenerate/);
      if (rawMatch) {
        try {
          rawData = JSON.parse(rawMatch[1]);
        } catch (e) {}
      }

      const subcategory = rawData.subcategory || 'Bedroom';
      const subNoun = subcategory.toLowerCase().includes('bed')
        ? 'bed'
        : subcategory.toLowerCase().includes('storage')
        ? 'storage unit'
        : subcategory.toLowerCase().includes('wardrobe')
        ? 'wardrobe'
        : subcategory.toLowerCase().includes('mattress')
        ? 'mattress'
        : 'piece';
      const material = rawData.primary_material || 'Solid Wood';
      const warrantyMonths = rawData.warranty_months != null ? Number(rawData.warranty_months) : 12;

      // Detect tone from systemPrompt
      let tone = 'warm_inviting';
      if (systemPrompt.includes('Elegant & Sophisticated') || systemPrompt.includes('elegant_sophisticated')) {
        tone = 'elegant_sophisticated';
      } else if (systemPrompt.includes('Minimal & Modern') || systemPrompt.includes('minimal_modern')) {
        tone = 'minimal_modern';
      } else if (systemPrompt.includes('Premium & Indulgent') || systemPrompt.includes('premium_indulgent')) {
        tone = 'premium_indulgent';
      } else if (systemPrompt.includes('Playful & Casual') || systemPrompt.includes('playful_casual')) {
        tone = 'playful_casual';
      }

      const pool = VARIATIONS[tone] || VARIATIONS.warm_inviting;
      let hash = 0;
      const keyStr = String(rawData.id || name);
      for (let i = 0; i < keyStr.length; i++) {
        hash = (hash << 5) - hash + keyStr.charCodeAt(i);
        hash |= 0;
      }
      const variantIdx = Math.abs(hash) % pool.length;
      const selectedVar = pool[variantIdx];

      const moodLine = selectedVar.mood;
      const introSentence = selectedVar.intro(subNoun);
      const storySentences = selectedVar.story(material);
      const closingSentence = selectedVar.close(shortName);

      const summary = `${moodLine} ${introSentence} ${storySentences} ${closingSentence}`;

      return {
        description: {
          summary,
          aesthetic_style: tone.replace(/_/g, ' '),
          texture: `Polished ${material}`,
          best_use: `${category} focal point`,
        },
        care_and_maintenance: {
          instructions: [
            'We recommend dusting regularly with a soft, dry cloth.',
            'It is best to wipe spills immediately with a damp cloth.',
            'Try to apply a wood-safe wax polish every few months.',
          ],
          avoid: [
            "It's best to avoid harsh chemical cleaners.",
            'Try to avoid direct, prolonged exposure to sunlight.',
          ],
        },
        warranty: {
          applicable: warrantyMonths > 0,
          status_line: `**${warrantyMonths > 0 ? 'Yes' : 'No'}**, it has a warranty of **${warrantyMonths || 0} months**.`,
          points: [
            'Covers manufacturing defects in materials and workmanship.',
            `Valid for ${warrantyMonths || 0} months from purchase date.`,
          ],
        },
      };
    },
    async generateText({ prompt }) {
      return 'Emphasize structural integrity, natural finish, and understated elegance.';
    },
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  console.log('\n========================================================================');
  console.log('  MULTI-SUBCATEGORY TONE MATRIX DEMO (Bedroom Only)');
  console.log('========================================================================');

  const apiKey = options.apiKey || process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
  const isSimulation = options.mock || !apiKey;

  if (isSimulation) {
    console.log('\n[Notice] Operating in high-fidelity smart simulation mode.');
    console.log('         (To run against live Gemini API, provide LLM_API_KEY or --api-key)\n');
    setMockClient(createSimulationClient());
  } else {
    console.log(`\n[Notice] Running against live LLM (${options.provider || 'gemini'}).\n`);
  }

  const outputDir = path.join(__dirname, '..', 'output', 'demo-matrix');
  fs.mkdirSync(outputDir, { recursive: true });

  const tonePresets = loadTonePresets();

  const activeConfigs = DEFAULT_MATRIX.filter((cfg) => {
    if (options.subcategory) {
      return cfg.subcategory.toLowerCase() === options.subcategory.toLowerCase();
    }
    return true;
  }).map((cfg) => ({
    ...cfg,
    tone: options.tone || cfg.tone,
    count: options.count || cfg.count,
  }));

  const summaryRows = [];

  for (const entry of activeConfigs) {
    console.log(`------------------------------------------------------------------------`);
    console.log(`Processing Subcategory: "${entry.subcategory}"`);
    console.log(`  • Tone Preset:        ${entry.tone} (${tonePresets[entry.tone]?.name || entry.tone})`);
    console.log(`  • Source File:        data/trainingSet/${entry.trainingFile}`);
    console.log(`  • Enriched Variant:   ${entry.isEnriched ? 'Yes' : 'No (Base file only)'}`);

    if (entry.gapNote) {
      console.log(`  ⚠️  GAP FLAGGED:       ${entry.gapNote}`);
    }

    // Category rule verification
    const catRules = loadCategoryRules('Bedroom', entry.subcategory);
    const hasCategoryTone = Boolean(catRules.tone_notes);
    console.log(`  • Category Tone Rules: ${hasCategoryTone ? `Loaded from Bedroom/${entry.subcategory}.json` : 'Using _default.json'}`);

    // Load products
    const { products, shortfall, error } = loadProductsForSubcategory(entry.trainingFile, entry.count);
    console.log(`  • Qualified Products: ${products.length} / ${entry.count} complete items (shortfall: ${shortfall})`);

    const processedProducts = [];
    let passCount = 0;
    let failCount = 0;
    const failureReasons = {};

    for (const idx of products.keys()) {
      const rawProduct = products[idx];
      const normalized = transformCatalogItemToProduct(rawProduct);

      // Force subcategory to match entry for prompt building & validation
      normalized.category = 'Bedroom';
      normalized.subcategory = entry.subcategory;

      process.stdout.write(`    [${idx + 1}/${products.length}] Generating for "${normalized.name.slice(0, 40)}..." `);

      try {
        const generated = await generateOne(normalized, null, 1, {
          company_id: 'demo_matrix_company',
          application_id: 'demo_matrix_app',
          selected_tone: entry.tone,
          dryRun: true,
          rules: {},
        });

        const validation = validateItem(generated, normalized, { selectedTone: entry.tone });
        const checkBreakdown = evaluateChecks(generated, normalized, validation, entry.tone);
        const descriptionParts = breakDownDescription(generated);

        if (checkBreakdown.valid) {
          passCount++;
          process.stdout.write(`[\x1b[32mPASS\x1b[0m]\n`);
        } else {
          failCount++;
          const topErr = checkBreakdown.errors[0] || 'Unknown error';
          failureReasons[topErr] = (failureReasons[topErr] || 0) + 1;
          process.stdout.write(`[\x1b[31mFAIL\x1b[0m: ${topErr.slice(0, 50)}...]\n`);
        }

        processedProducts.push({
          id: normalized.id,
          name: normalized.name,
          product_short_name: normalized.product_short_name,
          primary_material: normalized.primary_material,
          price: normalized.price,
          description: descriptionParts,
          raw_summary: generated.description?.summary,
          specifications: generated.specifications,
          care_and_maintenance: generated.care_and_maintenance,
          warranty: generated.warranty,
          returns: generated.returns,
          validator: checkBreakdown,
        });
      } catch (err) {
        failCount++;
        const errMsg = err.message || 'Execution error';
        failureReasons[errMsg] = (failureReasons[errMsg] || 0) + 1;
        process.stdout.write(`[\x1b[31mERROR\x1b[0m: ${errMsg}]\n`);
      }
    }

    // Top failure reason
    let topFailureReason = 'None';
    if (products.length === 0) {
      topFailureReason = entry.gapNote || error || '0 complete products in file';
    } else if (failCount > 0) {
      topFailureReason = Object.entries(failureReasons).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Write subcategory output file: spaces -> underscores
    const fileName = `${entry.subcategory.replace(/\s+/g, '_')}.json`;
    const subcategoryOutput = {
      subcategory: entry.subcategory,
      category: 'Bedroom',
      tone_used: entry.tone,
      tone_name: tonePresets[entry.tone]?.name || entry.tone,
      source_training_file: `data/trainingSet/${entry.trainingFile}`,
      is_enriched: entry.isEnriched,
      gap_flag: entry.gapNote || null,
      target_count: entry.count,
      total_qualified: products.length,
      shortfall,
      pass_count: passCount,
      fail_count: failCount,
      top_failure_reason: topFailureReason,
      generated_at: new Date().toISOString(),
      products: processedProducts,
    };

    const outPath = path.join(outputDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify(subcategoryOutput, null, 2), 'utf-8');
    console.log(`  💾 Output saved to:   output/demo-matrix/${fileName}\n`);

    summaryRows.push({
      subcategory: entry.subcategory,
      tone: entry.tone,
      source_file: entry.trainingFile,
      pass: `${passCount}/${entry.count}`,
      fail: `${failCount}/${entry.count}`,
      top_failure_reason: topFailureReason.length > 35 ? topFailureReason.slice(0, 32) + '...' : topFailureReason,
    });
  }

  // Print console summary table
  console.log('==========================================================================================================');
  console.log('  CONSOLE SUMMARY TABLE: MULTI-SUBCATEGORY TONE MATRIX');
  console.log('==========================================================================================================');
  console.table(summaryRows);
  console.log('==========================================================================================================\n');

  clearMockClient();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[FATAL ERROR in generateDemoMatrix]:', err);
    process.exit(1);
  });
}

module.exports = {
  main,
  DEFAULT_MATRIX,
  isProductComplete,
};
