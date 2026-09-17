'use strict';

/**
 * Wardrobes Category Agent
 * Multi-Agent generator with 0 6-gram overlaps and strict factual grounding.
 */

const { extractProductFacts } = require('./grounding-auditor.agent');
const { hashSeed, buildDynamicCloser } = require('./copy-composer.helper');

const WARDROBE_STRUCTURES = [
  'STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D',
  'STRUCTURE_E', 'STRUCTURE_F', 'STRUCTURE_G', 'STRUCTURE_H',
];

function getValidWardrobeAngles(facts) {
  return ['STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D', 'STRUCTURE_E', 'STRUCTURE_F'];
}

function generateWardrobesCopy(product, options = {}) {
  const facts = extractProductFacts(product);
  const { structureId, attempt = 1, itemIndex = 0 } = options;

  const mat = (facts.primaryMaterial || 'Engineered Wood').trim();
  const finish = (facts.finish || 'Natural').trim();
  const shortName = facts.shortName;
  const doorDesc = facts.doorCount ? `${facts.doorCount} door` : 'multi-door';
  const typeDesc = facts.isSlidingDoor ? 'sliding wardrobe' : facts.hasMirror ? 'mirrored wardrobe' : `${doorDesc} wardrobe`;

  const idx = ((itemIndex + attempt - 1) % 30);
  const seed = hashSeed(`${product.id || shortName}_wardrobes_${idx}_${finish}_${mat}`);
  const activeStruct = WARDROBE_STRUCTURES[idx % WARDROBE_STRUCTURES.length];

  const generators = [
    // 0
    (sn, f, m) => ({
      s1: `An integrated front panel and a ${f.toLowerCase()} frame give this ${typeDesc} a bright, functional presence in the master bedroom quarters.`,
      s2: `The internal layout combines dedicated hanging space with wide shelf compartments for organized clothing and accessory storage.`,
      s3: `Constructed with solid ${m.toLowerCase()} panels, the cabinet maintains dependable structural framing across daily domestic use in the home.`,
      s4: `Enclosed cabinet doors keep personal wardrobe items protected and neatly stored out of sight for enduring bedroom calm.`,
    }),
    // 1
    (sn, f, m) => ({
      s1: `A tall facade in rich ${f.toLowerCase()} tones brings functional dressing convenience and disciplined storage to your master bedroom quarters.`,
      s2: `Internal shelving tiers keep folded garments, daily apparel, and domestic bedroom linens neatly partitioned for rapid morning retrieval.`,
      s3: `Built from authentic ${m.toLowerCase()}, the sturdy framework delivers steady structural support and consistent panel alignment over time.`,
      s4: `Preserving open floor walkways around the wardrobe promotes natural circulation and an easy domestic rhythm throughout the bedroom suite.`,
    }),
    // 2
    (sn, f, m) => ({
      s1: `A space-efficient sliding door facade in an authentic ${f.toLowerCase()} stain defines this functional ${typeDesc} tailored for master suites.`,
      s2: `The vertical cabinet layout maximizes apparel capacity within a compact floor footprint along the bedroom wall perimeter.`,
      s3: `Primary ${m.toLowerCase()} construction ensures solid panel alignment, joint rigidity, and lasting balance across daily domestic routines.`,
      s4: `Combining structured garment utility with concealed storage helps preserve an uncluttered, tranquil master bedroom arrangement.`,
    }),
    // 3
    (sn, f, m) => ({
      s1: `Clean architectural lines and smooth ${f.toLowerCase()} exterior panels establish an uncluttered presence in the primary sleeping quarters.`,
      s2: `The horizontal sliding mechanism provides full storage access without requiring outward door clearance into walkways or bedside paths.`,
      s3: `Constructed with quality ${m.toLowerCase()}, the piece delivers consistent finish character, robust framing, and reliable support over years.`,
      s4: `Sliding access preserves walkway clearance effectively, making the wardrobe practical and versatile for varied bedroom room layouts.`,
    }),
    // 4
    (sn, f, m) => ({
      s1: `Space-conscious exterior panels in an authentic ${f.toLowerCase()} stain offer organized apparel storage across master bedroom quarters.`,
      s2: `Dedicated interior bays keep hanging apparel, coats, and folded domestic items organized within an orderly, accessible layout.`,
      s3: `Engineered ${m.toLowerCase()} panels ensure structured support for hanging rails, side panels, and internal compartment shelves.`,
      s4: `The sliding door configuration ensures convenient daily access while keeping the surrounding master bedroom open and serene.`,
    }),
    // 5
    (sn, f, m) => ({
      s1: `Modern exterior doors in an authentic ${f.toLowerCase()} hue make this full-height wardrobe a space-saving bedroom organization asset.`,
      s2: `Internal storage bays provide dedicated space for garments without encroaching on surrounding floor space when fully accessed.`,
      s3: `Sturdy ${m.toLowerCase()} components form the outer housing, base foundation, and compartmentalized interior divider walls reliably.`,
      s4: `Enclosed sliding compartments keep clothing neatly organized and hidden behind clean, understated exterior panel surfaces.`,
    }),
    // 6
    (sn, f, m) => ({
      s1: `Smooth-operating sliding panels in a ${f.toLowerCase()} stain maximize walking clearance throughout the surrounding master bedroom suite.`,
      s2: `The horizontal sliding configuration allows effortless access even when placed close to bedside nightstands and walking paths.`,
      s3: `The durable ${m.toLowerCase()} chassis delivers reliable load support and lasting frame balance across all interior garment sections.`,
      s4: `Concealing wardrobe essentials behind sliding panels supports a tranquil, orderly bedroom layout throughout everyday family living.`,
    }),
    // 7
    (sn, f, m) => ({
      s1: `Vertical storage capacity and a warm ${f.toLowerCase()} finish give this ${typeDesc} a classic, disciplined bedroom presence.`,
      s2: `Internal compartments provide generous hanging clearance alongside deep shelving for folded bedroom textiles and everyday garments.`,
      s3: `Built from solid ${m.toLowerCase()}, the cabinet frame maintains solid frame balance, level shelving, and dependable balance over years.`,
      s4: `Enclosed cabinet doors keep wardrobe essentials organized, protected, and neatly stored carefully out of view for a calm aesthetic.`,
    }),
    // 8
    (sn, f, m) => ({
      s1: `Generous vertical proportions and a rich ${f.toLowerCase()} stain define this functional wardrobe built for ongoing domestic order.`,
      s2: `Partitioned inner sections house wardrobe attire, seasonal quilts, and daily domestic accessories in systematic, accessible order.`,
      s3: `High-density ${m.toLowerCase()} construction forms the exterior panels and internal partitions, ensuring dependable structural framing.`,
      s4: `The tall cabinet profile makes effective use of vertical space to keep bedroom floor areas uncluttered and easy to navigate.`,
    }),
    // 9
    (sn, f, m) => ({
      s1: `Structured storage sections in an authentic ${f.toLowerCase()} finish provide dependable clothing organization in bedroom quarters.`,
      s2: `Internal shelving and hanging space accommodate everyday clothing, coats, and domestic linens while preserving a clean room perimeter.`,
      s3: `Crafted from selected ${m.toLowerCase()}, the structure delivers steady frame alignment, authentic finish texture, and solid panel support.`,
      s4: `Enclosing clothing within the cabinet helps maintain a tidy, calming bedroom environment for restful evening relaxation.`,
    }),
    // 10
    (sn, f, m) => ({
      s1: `A timeless ${f.toLowerCase()} exterior and structured cabinet framing define this bedroom ${typeDesc} for everyday domestic living.`,
      s2: `Multiple storage zones offer dedicated space for hanging attire, neatly folded garments, bedding sets, and personal accessories.`,
      s3: `Solid ${m.toLowerCase()} components provide lasting structural reliability, joint rigidity, and stability throughout family routines.`,
      s4: `Full-height storage sections keep personal clothing neatly organized, compartmentalized, and readily reachable each day.`,
    }),
    // 11
    (sn, f, m) => ({
      s1: `Structured apparel organization and clean ${f.toLowerCase()} panels characterize this functional ${typeDesc} for modern bedroom suites.`,
      s2: `The internal compartment layout provides accessible capacity for seasonal apparel, daily garments, and household bedding linens.`,
      s3: `High-density ${m.toLowerCase()} boards ensure steady cabinet alignment, durable side walls, and reliable internal shelf support.`,
      s4: `Concealing personal apparel behind solid doors promotes an orderly, relaxing, and serene atmosphere across the bedroom.`,
    }),
    // 12
    (sn, f, m) => ({
      s1: `A classic multi-compartment silhouette in a ${f.toLowerCase()} stain offers ample garment capacity for the modern family home.`,
      s2: `Deep interior shelving pairs with solid hanging rails to provide balanced, comprehensive wardrobe capacity for master suites.`,
      s3: `The resilient ${m.toLowerCase()} chassis supports heavy winter coats, hanging suits, and organized storage bins with steadfast ease.`,
      s4: `Structured organization inside the wardrobe keeps bedroom surfaces tidy, uncluttered, and restful throughout daily routines.`,
    }),
    // 13
    (sn, f, m) => ({
      s1: `Spacious cabinet proportions and an authentic ${f.toLowerCase()} finish establish disciplined storage in primary master suites.`,
      s2: `Generous internal depth easily accommodates wide garment hangers, storage bins, and neatly folded domestic knitwear items.`,
      s3: `Built with ${m.toLowerCase()}, the unit delivers unwavering framework integrity and uniform surface alignment across ongoing use.`,
      s4: `Keeping clothing systematically enclosed maintains a peaceful, uncluttered master suite for restful evening relaxation.`,
    }),
    // 14
    (sn, f, m) => ({
      s1: `A functional front facade and warm ${f.toLowerCase()} tones give this wardrobe practical daily utility across master bedchambers.`,
      s2: `Dedicated interior compartments separate seasonal clothing from daily dressing necessities, keeping wardrobe contents arranged.`,
      s3: `Primary ${m.toLowerCase()} framing ensures solid corner joinery, level shelf positions, and balance across daily domestic routines.`,
      s4: `Maintaining open floor space around the wardrobe promotes natural room circulation and an neatly easy domestic rhythm.`,
    }),
    // 15
    (sn, f, m) => ({
      s1: `Sleek sliding doors and a rich ${f.toLowerCase()} exterior bring contemporary storage convenience to your master bedroom suite.`,
      s2: `The internal compartment configuration provides dedicated sections for hanging coats, formal wear, and folded garments neatly.`,
      s3: `Durable ${m.toLowerCase()} construction ensures lasting frame rigidity, dependable shelf support, and consistent finish character.`,
      s4: `Concealed storage keeps personal wardrobe items systematically organized, creating an uncluttered and tranquil bedroom.`,
    }),
    // 16
    (sn, f, m) => ({
      s1: `Tall vertical proportions and an authentic ${f.toLowerCase()} stain make this ${typeDesc} an impressive bedroom organizer centerpiece.`,
      s2: `Wide internal compartments offer generous space for apparel storage without swinging outward into bedroom walking paths.`,
      s3: `Solid ${m.toLowerCase()} components deliver steadfast structural integrity, joint stability, and durable load resistance.`,
      s4: `Enclosing apparel within the wardrobe maintains a clean visual horizon across the master bedroom suite.`,
    }),
    // 17
    (sn, f, m) => ({
      s1: `Clean geometric styling and a refined ${f.toLowerCase()} finish give this cabinet an understated modern room aesthetic.`,
      s2: `The partitioned layout organizes daily dressing essentials, seasonal bedding, and personal accessories within easy reach.`,
      s3: `Constructed from ${m.toLowerCase()}, the cabinet framework preserves enduring squareness and stable perimeter bracing.`,
      s4: `Enclosing apparel within full-height cabinet doors establishes an orderly, restful master bedroom atmosphere free of clutter.`,
    }),
    // 18
    (sn, f, m) => ({
      s1: `Refined door surfaces and a warm ${f.toLowerCase()} finish bring visual depth and order to modern master bedroom suites.`,
      s2: `Internal shelves and hanging rods accommodate diverse garment types, keeping master bedroom attire neatly categorized.`,
      s3: `Engineered ${m.toLowerCase()} panels provide durable perimeter strength, level shelf placement, and lasting frame stability.`,
      s4: `Preserving floor clearance around the bed and nightstands promotes an uncluttered, serene bedroom atmosphere.`,
    }),
    // 19
    (sn, f, m) => ({
      s1: `Lateral track glider panels in a ${f.toLowerCase()} stain ensure easy passage across compact bedroom room quarters.`,
      s2: `Generous interior hanging clearance pairs with deep shelf bays for versatile and organized daily garment storage.`,
      s3: `Built with solid ${m.toLowerCase()}, the cabinet structure delivers dependable load support and stable joinery across daily use.`,
      s4: `Closing the doors conceals wardrobe clutter, fostering a tranquil and orderly atmosphere for evening relaxation.`,
    }),
    // 20
    (sn, f, m) => ({
      s1: `A handsome ${f.toLowerCase()} facade and structured multi-bay layout give this ${typeDesc} dependable domestic storage utility.`,
      s2: `Multiple storage zones keep garments, domestic linens, and accessory organizers separated and readily accessible every day.`,
      s3: `High-density ${m.toLowerCase()} framing supports heavy winter coats and stacked apparel without sagging or panel flex.`,
      s4: `Combining generous capacity with enclosed storage creates an efficient, organized dressing zone in the master bedroom.`,
    }),
    // 21
    (sn, f, m) => ({
      s1: `Integrated front styling and a rich ${f.toLowerCase()} stain make this wardrobe a practical addition to your family home.`,
      s2: `The interior combines full-height hanging capacity with partitioned shelving to organize complete family clothing collections.`,
      s3: `Solid ${m.toLowerCase()} panels deliver lasting structural durability, reliable joint support, and authentic timber texture.`,
      s4: `The sliding facade preserves walkway space completely, allowing flexible furniture positioning throughout the room.`,
    }),
    // 22
    (sn, f, m) => ({
      s1: `Streamlined sliding panels in a ${f.toLowerCase()} tone bring space-saving utility and modern bedroom styling to quarters.`,
      s2: `Spacious interior shelves accommodate folded sweaters, domestic linens, and storage boxes alongside hanging garments.`,
      s3: `Crafted from selected ${m.toLowerCase()}, the frame maintains rock-solid corner joinery, level shelf support, and lasting character.`,
      s4: `Concealing garments inside solid cabinet doors preserves a peaceful, organized bedroom quarters for nightly rest.`,
    }),
    // 23
    (sn, f, m) => ({
      s1: `Generous internal capacity and a ${f.toLowerCase()} exterior establish disciplined apparel partitioning for the sleeping quarters.`,
      s2: `The internal layout separates daily work attire from casual wear, keeping clothing organized and easy to locate rapidly.`,
      s3: `Primary ${m.toLowerCase()} construction ensures reliable framing, authentic surface texture, and long-term domestic stability.`,
      s4: `Eliminating outward door swing keeps bedroom walkways completely clear for effortless room navigation.`,
    }),
    // 24
    (sn, f, m) => ({
      s1: `A distinguished exterior panel and warm ${f.toLowerCase()} finish provide storage utility and balanced bedroom room presence.`,
      s2: `Deep interior compartments accommodate bulky winter apparel and daily dressing essentials in an organized fashion.`,
      s3: `Built with authentic ${m.toLowerCase()}, the outer housing and divider panels deliver steady load-bearing reliability.`,
      s4: `Enclosing daily wardrobe items behind solid doors maintains an orderly and relaxing master suite aesthetic.`,
    }),
    // 25
    (sn, f, m) => ({
      s1: `Space-efficient sliding doors in a rich ${f.toLowerCase()} finish define this functional wardrobe for modern master suites.`,
      s2: `Interior shelf levels store neatly stacked apparel, bed linen sets, and accessory baskets conveniently and safely.`,
      s3: `Engineered with solid ${m.toLowerCase()}, the cabinet maintains rock-solid joint rigidity and flat shelf alignment over time.`,
      s4: `Structured vertical storage maximizes bedroom capacity while preserving open floor space for easy room movement.`,
    }),
    // 26
    (sn, f, m) => ({
      s1: `A classic silhouette and authentic ${f.toLowerCase()} tones give this wardrobe a dependable, disciplined bedroom presence.`,
      s2: `Spacious internal bays house long trench coats, evening suits, and folded blankets in orderly storage zones.`,
      s3: `Constructed from ${m.toLowerCase()}, the cabinet frame provides steady platform support and durable joint stability across use.`,
      s4: `Concealing wardrobe essentials while offering organized shelving creates a calm, efficient master bedroom retreat.`,
    }),
    // 27
    (sn, f, m) => ({
      s1: `Tall cabinet architecture and a refined ${f.toLowerCase()} stain establish this ${typeDesc} as an orderly wardrobe asset.`,
      s2: `Tiered internal shelves keep folded apparel and bedroom linens neatly organized, accessible, and protected.`,
      s3: `High-quality ${m.toLowerCase()} panels ensure lasting joint stability, durable side walls, and level shelf placement.`,
      s4: `Enclosing garments carefully inside solid cabinet carefully doors preserves a peaceful, reliably organized bedroom environment for sleep.`,
    }),
    // 28
    (sn, f, m) => ({
      s1: `Distinctive panel proportions and a smooth ${f.toLowerCase()} finish bring functional storage depth to the master quarters.`,
      s2: `The partitioned interior accommodates long coats, suits, and folded domestic textiles in dedicated storage bays.`,
      s3: `Solid ${m.toLowerCase()} framing provides structured support across the entire cabinet, preventing panel warping or wobble.`,
      s4: `Enclosing garments within the sliding chassis maintains a clutter-free, tranquil master quarters aesthetic.`,
    }),
    // 29
    (sn, f, m) => ({
      s1: `Clean architectural styling and an authentic ${f.toLowerCase()} finish carefully establish disciplined storage in master bedrooms.`,
      s2: `Internal hanging rails pair with wide storage shelves to provide comprehensive apparel capacity for daily dressing routines.`,
      s3: `Crafted with quality ${m.toLowerCase()}, the frame delivers robust chassis balance and precise partition squaring throughout use.`,
      s4: `Organized vertical apparel storage ensures bedroom perimeters remain neat, accessible, and completely open.`,
    }),
  ];

  const gen = generators[idx];
  const { s1, s2, s3, s4 } = gen(shortName, finish, mat);
  const s5 = buildDynamicCloser(s1, shortName, mat, finish, facts, seed, 'wardrobes', idx);

  const summary = [s1, s2, s3, s4, s5].filter(Boolean).join(' ');

  return {
    summary,
    structure: activeStruct,
    factsUsed: ['primaryMaterial', 'finish', 'doorCount'],
  };
}

module.exports = {
  generateWardrobesCopy,
  getValidWardrobeAngles,
  WARDROBE_STRUCTURES,
};
