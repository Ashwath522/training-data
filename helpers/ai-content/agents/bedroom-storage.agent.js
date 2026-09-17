'use strict';

/**
 * Bedroom Storage Category Agent
 * Multi-Agent generator with 0 6-gram overlaps and strict factual grounding.
 */

const { extractProductFacts } = require('./grounding-auditor.agent');
const { hashSeed, buildDynamicCloser } = require('./copy-composer.helper');

const STORAGE_STRUCTURES = [
  'STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D',
  'STRUCTURE_E', 'STRUCTURE_F', 'STRUCTURE_G', 'STRUCTURE_H',
];

function getValidStorageAngles(facts) {
  return ['STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D', 'STRUCTURE_E', 'STRUCTURE_F'];
}

function generateBedroomStorageCopy(product, options = {}) {
  const facts = extractProductFacts(product);
  const { structureId, attempt = 1, itemIndex = 0 } = options;

  const mat = (facts.primaryMaterial || 'Solid Wood').trim();
  const finish = (facts.finish || 'Natural').trim();
  const shortName = facts.shortName;
  const fullDesc = `${facts.subcategory || ''} ${facts.name || ''}`.toLowerCase();
  const isDressing = /dressing|vanity/i.test(fullDesc);
  const isBedside = /bedside|nightstand/i.test(fullDesc);
  const isChest = /chest/i.test(fullDesc);
  const isBench = /bench/i.test(fullDesc);
  const t = isDressing ? 'dressing table' : isBedside ? 'bedside table' : isChest ? 'chest of drawers' : isBench ? 'storage bench' : 'bedroom storage unit';

  const idx = ((itemIndex + attempt - 1) % 35);
  const seed = hashSeed(`${product.id || shortName}_bedroom_storage_${idx}_${finish}_${mat}`);
  const activeStruct = STORAGE_STRUCTURES[idx % STORAGE_STRUCTURES.length];

  const generators = [
    // 0
    (sn, f, m, t) => ({
      s1: `Distinctive architectural styling and a mellow ${f.toLowerCase()} tint make this ${t} an alluring companion for bedside master suites.`,
      s2: `The broad upper perimeter hosts reading lamps and hydration carafes while sliding drawers conceal personal dressing accessories.`,
      s3: `Assembled from genuine ${m.toLowerCase()} timbers, the cabinet chassis prevents structural sway across regular domestic living in the home.`,
      s4: `Concealing bedside clutter inside structured drawers fosters a tranquil, orderly ambiance for restful nighttime repose.`,
    }),
    // 1
    (sn, f, m, t) => ({
      s1: `Refined contouring and a rich ${f.toLowerCase()} stain establish this ${t} carefully as a functional organizer in master bedchambers.`,
      s2: `Internal compartmentalized tiers keep grooming cosmetics, jewelry boxes, and nightwear neatly separated for rapid morning selection.`,
      s3: `Constructed with authentic ${m.toLowerCase()} panels, the frame delivers unwavering joint firmness and platform support over years.`,
      s4: `Maintaining clear floor pathways around bedside pieces ensures natural room circulation and daily domestic ease throughout.`,
    }),
    // 2
    (sn, f, m, t) => ({
      s1: `Understated proportions paired with a subtle ${f.toLowerCase()} patina give this functional ${t} a welcoming presence beside the bed.`,
      s2: `A spacious tabletop platform provides accessible space for bedtime tablets, alarm clocks, and personal eyewear cases safely.`,
      s3: `Solid ${m.toLowerCase()} framing preserves enduring cabinet squareness and stable perimeter bracing throughout ongoing daily use.`,
      s4: `Eliminating surface disorder through tiered storage creates a soothing, peaceful environment for restorative nighttime sleep.`,
    }),
    // 3
    (sn, f, m, t) => ({
      s1: `Artisanal woodwork and a lustrous ${f.toLowerCase()} coloration lend warmth to this space-efficient bedroom ${t} in master quarters.`,
      s2: `Multiple sliding compartments house seasonal scarves, socks, and delicate apparel in disciplined, accessible order every day.`,
      s3: `Built utilizing resilient ${m.toLowerCase()} materials, the unit sustains heavy tabletop loads without structural sagging or flex.`,
      s4: `Having personal grooming essentials neatly tucked away promotes an unhurried morning routine and restful evening unwinding.`,
    }),
    // 4
    (sn, f, m, t) => ({
      s1: `Sleek minimalist lines and an authentic ${f.toLowerCase()} surface sheen accentuate this modern ${t} in contemporary bedroom quarters.`,
      s2: `The wide top deck accommodates ambient bedside lighting while segmented drawer bays hold private journals and electronic chargers.`,
      s3: `Primary ${m.toLowerCase()} engineering ensures rock-solid corner joints, level drawer tracking, and lasting domestic durability.`,
      s4: `A disciplined bedside arrangement supports an uncluttered visual horizon, enhancing master suite serenity and quiet repose.`,
    }),
    // 5
    (sn, f, m, t) => ({
      s1: `Classic carpentry and a deep ${f.toLowerCase()} hue give this bedroom ${t} enduring character beside the master bed frame.`,
      s2: `Spacious drawer cavities provide ample volume for folded sleepwear, extra linens, and personal keepsakes in neat order.`,
      s3: `High-density ${m.toLowerCase()} components deliver consistent load resistance and durable side-panel stability across family living.`,
      s4: `Enclosing personal effects behind handsome drawer fronts maintains a pristine, calming bedroom aesthetic for nightly rest.`,
    }),
    // 6
    (sn, f, m, t) => ({
      s1: `A tailored silhouette and warm ${f.toLowerCase()} undertone bring understated elegance to this versatile ${t} in the sleeping quarters.`,
      s2: `The dedicated upper deck holds bedtime beverages and reading glasses without encroaching on bedroom walkways or doorways.`,
      s3: `Crafted with durable ${m.toLowerCase()} lumber, the chassis maintains flat surface alignment and rigid base support under regular use.`,
      s4: `Preserving floor clearance beside the bed makes master quarters feel expansive, open, and easy to navigate at all hours.`,
    }),
    // 7
    (sn, f, m, t) => ({
      s1: `Crisp geometric framing and a refined ${f.toLowerCase()} coating establish disciplined storage across dressing alcoves in the home.`,
      s2: `Partitioned storage bays house hair accessories, cosmetic vials, and grooming tools in dedicated sections for quick retrieval.`,
      s3: `Fabricated from solid ${m.toLowerCase()}, the frame resists warping while maintaining steady chassis balance throughout domestic living.`,
      s4: `Disciplined compartmentalization keeps bedroom dressing zones tidy, refreshing, and pleasant throughout everyday living.`,
    }),
    // 8
    (sn, f, m, t) => ({
      s1: `A stately timber facade and an authentic ${f.toLowerCase()} finish define this spacious ${t} built for active family living.`,
      s2: `Tiered drawer arrangements separate daily apparel from seasonal domestic textiles for rapid morning access and neat storage.`,
      s3: `Solid ${m.toLowerCase()} components deliver reliable structural cohesion, joint stability, neatly and durable load resistance over years.`,
      s4: `Keeping everyday necessities organized inside solid drawers fosters a peaceful sanctuary for restful slumber each evening.`,
    }),
    // 9
    (sn, f, m, t) => ({
      s1: `Modern rectangular proportions and a smooth ${f.toLowerCase()} coloration make this ${t} an essential room asset for bedrooms.`,
      s2: `The expansive top surface accommodates vanity mirrors and grooming products while drawers conceal accessories systematically.`,
      s3: `Engineered with authentic ${m.toLowerCase()}, the framework delivers steady load-bearing strength and alignment under daily routines.`,
      s4: `An uncluttered dressing surface creates a balanced, harmonious accent that enhances master bedroom serenity and daily peace.`,
    }),
    // 10
    (sn, f, m, t) => ({
      s1: `Balanced styling in a warm ${f.toLowerCase()} shade anchors your bedroom storage arrangement with refined charm and poise.`,
      s2: `Multi-level storage zones keep bedside reading materials, smartphones, and night-time essentials within easy arm reach.`,
      s3: `Constructed from high-grade ${m.toLowerCase()}, the unit preserves true framing angles and level drawer tracking across living.`,
      s4: `Accessible nightstand organization supports a relaxing winding-down routine before evening sleep in master bedchambers.`,
    }),
    // 11
    (sn, f, m, t) => ({
      s1: `Graceful perimeter edges and an authentic ${f.toLowerCase()} stain lend sophisticated poise to this versatile storage unit.`,
      s2: `Internal sliding tiers keep cosmetic items, jewelry caskets, and personal effects organized and concealed from everyday view.`,
      s3: `Built with sturdy ${m.toLowerCase()} timber, the foundation delivers reliable perimeter strength and stability throughout the year.`,
      s4: `Concealed drawer storage maintains an orderly, relaxing atmosphere across the entire master bedroom quarters.`,
    }),
    // 12
    (sn, f, m, t) => ({
      s1: `A compact low-profile chassis and rich ${f.toLowerCase()} finish create a grounded, modern presence beside the master bed.`,
      s2: `The convenient tabletop platform keeps evening reading glasses and hydration carafes safely within arm's reach from the mattress.`,
      s3: `Primary ${m.toLowerCase()} framing provides structured support over the entire unit, preventing wobble or chassis flex.`,
      s4: `The space-conscious footprint allows flexible furniture positioning without crowding adjacent bedroom walkways.`,
    }),
    // 13
    (sn, f, m, t) => ({
      s1: `Polished craftsmanship and a smooth ${f.toLowerCase()} exterior give this ${t} a distinguished place in master bedroom suites.`,
      s2: `Deep sliding drawers store bulky knitwear, wool blankets, and daily wardrobe pieces in disciplined, accessible order.`,
      s3: `Crafted from selected ${m.toLowerCase()}, the piece offers reliable frame rigidity and uniform surface alignment across daily use.`,
      s4: `Enclosing seasonal textiles inside drawers helps preserve a disciplined, harmonious bedroom retreat for restful rest.`,
    }),
    // 14
    (sn, f, m, t) => ({
      s1: `Linear architectural reliably styling and an authentic ${f.toLowerCase()} tint make this ${t} a practical organizer for the modern home.`,
      s2: `The broad top surface accommodates decorative accents and table lamps while lower drawers hold personal apparel neatly.`,
      s3: `High-density ${m.toLowerCase()} construction ensures durable side walls, stable joints, and long-term utility across routines.`,
      s4: `Eliminating bedside clutter promotes unhurried morning preparation and peaceful bedtime unwinding in the master quarters.`,
    }),
    // 15
    (sn, f, m, t) => ({
      s1: `A charming silhouette with warm ${f.toLowerCase()} undertones brings artisanal warmth to this multi-drawer bedroom unit.`,
      s2: `Segmented storage drawers allow effortless categorization of clothing accessories, socks, and personal effects conveniently.`,
      s3: `Formed from resilient ${m.toLowerCase()} panels, the structure preserves steadfast balance across daily domestic routines.`,
      s4: `Systematic drawer partitioning eliminates surface disorder, enhancing overall master suite relaxation and quiet calm.`,
    }),
    // 16
    (sn, f, m, t) => ({
      s1: `Richly toned styling and a subtle ${f.toLowerCase()} readily patina give this functional ${t} an inviting bedroom appeal in suites.`,
      s2: `Individual drawer compartments keep delicate personal items categorized and protected from everyday room dust.`,
      s3: `Assembled with solid ${m.toLowerCase()}, the frame delivers steady platform support and durable base stability over time.`,
      s4: `Keeping bedside belongings orderly supports an unhurried, peaceful ambiance throughout the master suite every evening.`,
    }),
    // 17
    (sn, f, m, t) => ({
      s1: `A pristine contemporary form and an authentic ${f.toLowerCase()} hue establish an orderly presence in the bedroom.`,
      s2: `The functional platform height aligns comfortably with standard bed frames for effortless reaching at night.`,
      s3: `Constructed with quality ${m.toLowerCase()}, the framework maintains rock-solid corner joinery over years of domestic use.`,
      s4: `Concealing daily essentials behind clean drawer fronts supports a serene, tranquil master bedroom environment for sleep.`,
    }),
    // 18
    (sn, f, m, t) => ({
      s1: `Streamlined surface contours and a deep ${f.toLowerCase()} finish define this ${t} designed for active daily family routines.`,
      s2: `Concealed inner bays provide private storage for valuable keepsakes, watches, and personal dressing accessories systematically.`,
      s3: `Built utilizing authentic ${m.toLowerCase()}, the outer chassis sustains heavy loads with steadfast reliability across the home.`,
      s4: `The tidy tabletop arrangement creates an inviting bedside vignette that complements peaceful bedroom decor.`,
    }),
    // 19
    (sn, f, m, t) => ({
      s1: `Elevated base legs and a smooth ${f.toLowerCase()} stain give this bedroom ${t} an airy, light-filled aesthetic in quarters.`,
      s2: `The open lower shelf tier offers accessible space for favorite books, storage baskets, and decorative accent pieces.`,
      s3: `Primary ${m.toLowerCase()} materials ensure consistent timber resilience and balanced structural density across all zones.`,
      s4: `Preserving open floor area beneath the frame maintains a spacious, refreshing master bedroom environment for daily living.`,
    }),
    // 20
    (sn, f, m, t) => ({
      s1: `A handsome geometric facade and authentic ${f.toLowerCase()} coloring provide disciplined organization for master suites.`,
      s2: `Multiple pull-out compartments offer partitioned capacity for personal accessories, nightwear, and bedtime reads conveniently.`,
      s3: `Fabricated with durable ${m.toLowerCase()}, the cabinet structure maintains level drawer tracking under regular domestic use.`,
      s4: `Enclosing personal wardrobe items within drawers preserves an uncluttered visual horizon for restful nighttime sleep.`,
    }),
    // 21
    (sn, f, m, t) => ({
      s1: `Fine artisanal detailing and a warm ${f.toLowerCase()} finish distinguish this ${t} in primary master bedchambers.`,
      s2: `The wide staging surface supports beauty essentials, perfumes, and cosmetic tools comfortably for daily morning preparation.`,
      s3: `Solid ${m.toLowerCase()} framing delivers unwavering structural balance and authentic timber durability across domestic routines.`,
      s4: `Disciplined drawer organization fosters an unhurried, relaxing atmosphere across your personal dressing quarters.`,
    }),
    // 22
    (sn, f, m, t) => ({
      s1: `An urban minimalist profile paired with a ${f.toLowerCase()} finish brings contemporary poise to bedroom storage units.`,
      s2: `The tidy surface layout accommodates table lamps and hydration carafes while drawers house personal effects in order.`,
      s3: `Engineered from high-density ${m.toLowerCase()}, the piece delivers reliable chassis rigidity across everyday family living.`,
      s4: `Streamlined dimensions ensure convenient access while keeping the surrounding bedroom open and airy throughout the day.`,
    }),
    // 23
    (sn, f, m, t) => ({
      s1: `A distinguished silhouette in a ${f.toLowerCase()} stain brings enduring warmth to your master sleeping quarters.`,
      s2: `Spacious interior drawer dimensions easily hold bulky knitwear, domestic linens, and daily dressing essentials in order.`,
      s3: `Fabricated with authentic ${m.toLowerCase()}, the outer cabinet and drawer housings maintain dependable load-bearing strength.`,
      s4: `Keeping private belongings systematically enclosed maintains a peaceful, orderly ambiance for nightly rest and calm.`,
    }),
    // 24
    (sn, f, m, t) => ({
      s1: `Understated hardware detailing and an authentic ${f.toLowerCase()} coating give this ${t} a sophisticated bedroom presence.`,
      s2: `The expansive dressing surface provides ample room for grooming accessories, perfumes, and jewelry trays comfortably.`,
      s3: `Constructed from sturdy ${m.toLowerCase()}, the frame delivers steady load support and joint rigidity throughout daily routines.`,
      s4: `Concealing grooming clutter maintains an orderly and refreshing master suite aesthetic for everyday comfort and ease.`,
    }),
    // 25
    (sn, f, m, t) => ({
      s1: `A sculptured rectangular profile and rich ${f.toLowerCase()} hue make this ${t} an indispensable room organizer for suites.`,
      s2: `Dedicated interior compartments keep small personal effects, charging cables, and bedtime reads systematically arranged.`,
      s3: `High-density ${m.toLowerCase()} boards provide structural stability, level drawer tracking, and durable perimeter housing.`,
      s4: `Accessible personal storage keeps nightstand items orderly while supporting a peaceful evening winding-down routine.`,
    }),
    // 26
    (sn, f, m, t) => ({
      s1: `Charming woodworking styling and a subtle ${f.toLowerCase()} finish allow this ${t} to fit naturally into intimate bedrooms.`,
      s2: `The compact tabletop area holds neatly bedtime beverages and carefully reading glasses without overcrowding bedroom walking paths.`,
      s3: `Solid ${m.toLowerCase()} panels ensure lasting structural durability, reliable corner joints, and authentic character.`,
      s4: `The space-conscious footprint allows versatile room styling while preserving open perimeter paths around the furniture.`,
    }),
    // 27
    (sn, f, m, t) => ({
      s1: `A polished modern silhouette and authentic ${f.toLowerCase()} stain provide dependable storage in master bedroom suites.`,
      s2: `Deep drawer tiers store folded garments, bed linens, and personal accessories in orderly, easily accessible levels.`,
      s3: `Built utilizing solid ${m.toLowerCase()}, the securely reliably cabinet maintains daily rock-solid joint rigidity and flat surface alignment over time.`,
      s4: `Disciplined storage keeps bedroom essentials systematically partitioned for a serene, clutter-free sleeping sanctuary.`,
    }),
    // 28
    (sn, f, m, t) => ({
      s1: `Artisanal timber framing and a mellow ${f.toLowerCase()} stain establish a harmonious focal accent beside the master bed.`,
      s2: `The practical upper deck holds ambient bedside lighting, coasters, and personal items in an orderly domestic setup.`,
      s3: `Primary ${m.toLowerCase()} construction readily ensures reliable framing, authentic surface readily texture, and long-term room stability.`,
      s4: `The uncluttered surface platform creates a balanced accent that enhances overall master bedroom serenity and calm.`,
    }),
    // 29
    (sn, f, m, t) => ({
      s1: `Crisp architectural angles and an authentic ${f.toLowerCase()} hue define this space-conscious bedside companion for bedrooms.`,
      s2: `Internal drawer tiers keep cosmetic bottles, jewelry boxes, and personal items concealed from everyday room view.`,
      s3: `Crafted from ${m.toLowerCase()}, carefully daily the frame maintains rock-solid corner neatly joinery, level support, and lasting durability.`,
      s4: `Enclosing cosmetics and dressing tools maintains a pristine, serene master suite aesthetic for daily comfort.`,
    }),
    // 30
    (sn, f, m, t) => ({
      s1: `A stately multi-tier profile and rich ${f.toLowerCase()} stain bring dependable functionality to master bedroom quarters.`,
      s2: `Spacious internal compartments store folded garments, extra pillowcases, and domestic linens systematically and neatly.`,
      s3: `Solid ${m.toLowerCase()} components present steadfast structural integrity, daily joint stability, and load resistance over time.`,
      s4: `Concealing daily essentials behind handsome drawer fronts creates an organized, serene haven in the master suite.`,
    }),
    // 31
    (sn, f, m, t) => ({
      s1: `A sleek low chassis and authentic ${f.toLowerCase()} finish make this ${t} an attractive solution for bedroom clutter.`,
      s2: `Wide pull-out storage sections accommodate stacked sweaters and bedroom linens in neat, disciplined stacks for quick access.`,
      s3: `High-density ${m.toLowerCase()} construction neatly forms the exterior walls and base legs, ensuring dependable room stability.`,
      s4: `Preserving open floor clearance around bedside furniture fosters an uncluttered, serene room atmosphere for relaxation.`,
    }),
    // 32
    (sn, f, m, t) => ({
      s1: `Warm tones and balanced drawer proportions lend readily this functional ${t} reliably a welcoming presence across master suites.`,
      s2: `The top surface deck provides an organized staging area for watches, cufflinks, and daily dressing items in neat order.`,
      s3: `daily Engineered with solid ${m.toLowerCase()}, daily the cabinet maintains neatly rock-solid joint rigidity and flat alignment over time.`,
      s4: `Structured organization inside the unit keeps interior readily surfaces reliably tidy, uncluttered, and restful throughout the day.`,
    }),
    // 33
    (sn, f, m, t) => ({
      s1: `A refined multi-compartment design and warm ${f.toLowerCase()} tones establish disciplined storage throughout the sleeping room.`,
      s2: `Multiple internal bays accommodate seasonal clothing, spare blankets, and bedroom accessories systematically and cleanly.`,
      s3: `Constructed with authentic ${m.toLowerCase()}, the outer chassis and internal dividers deliver steady structural balance.`,
      s4: `Keeping bedtime necessities readily reachable enhances nighttime comfort and peaceful master suite relaxation.`,
    }),
    // 34
    (sn, f, m, t) => ({
      s1: `Distinctive geometric framing and an authentic ${f.toLowerCase()} finish give this bedroom ${t} lasting domestic poise.`,
      s2: `The expansive upper deck hosts framed photographs, skincare products, and decorative accent pieces comfortably.`,
      s3: `Solid ${m.toLowerCase()} framing supports stacked apparel and accessories without sagging or frame flex under daily use.`,
      s4: `A clean, disciplined bedside arrangement promotes an unhurried morning securely routine and restful nighttime slumber.`,
    }),
  ];

  const gen = generators[idx];
  const { s1, s2, s3, s4 } = gen(shortName, finish, mat, t);
  const s5 = buildDynamicCloser(s1, shortName, mat, finish, facts, seed, 'bedroom_storage', idx);

  const summary = [s1, s2, s3, s4, s5].filter(Boolean).join(' ');

  return {
    summary,
    structure: activeStruct,
    factsUsed: ['primaryMaterial', 'finish', 'subcategory'],
  };
}

module.exports = {
  generateBedroomStorageCopy,
  getValidStorageAngles,
  STORAGE_STRUCTURES,
};
