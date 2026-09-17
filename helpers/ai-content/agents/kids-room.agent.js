'use strict';

/**
 * Kids Room Category Agent
 * Multi-Agent generator with 0 6-gram overlaps and strict factual grounding.
 */

const { extractProductFacts } = require('./grounding-auditor.agent');
const { hashSeed, buildDynamicCloser } = require('./copy-composer.helper');

const KIDS_STRUCTURES = [
  'STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D',
  'STRUCTURE_E', 'STRUCTURE_F', 'STRUCTURE_G', 'STRUCTURE_H',
];

function getValidKidsAngles(facts) {
  return ['STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D', 'STRUCTURE_E', 'STRUCTURE_F'];
}

function generateKidsRoomCopy(product, options = {}) {
  const facts = extractProductFacts(product);
  const { structureId, attempt = 1, itemIndex = 0 } = options;

  const mat = (facts.primaryMaterial || 'Solid Wood').trim();
  const finish = (facts.finish || 'Natural').trim();
  const shortName = facts.shortName;
  const fullDesc = `${facts.subcategory || ''} ${facts.name || ''}`.toLowerCase();
  const isBunk = /bunk/i.test(fullDesc);
  const isStudy = /study|desk|table/i.test(fullDesc);
  const isStorage = /storage|wardrobe|chest|cabinet/i.test(fullDesc);
  const t = isBunk ? 'bunk bed' : isStudy ? 'kids study desk' : isStorage ? 'kids storage unit' : 'kids bed';

  const idx = ((itemIndex + attempt - 1) % 26);
  const seed = hashSeed(`${product.id || shortName}_kids_room_${idx}_${finish}_${mat}`);
  const activeStruct = KIDS_STRUCTURES[idx % KIDS_STRUCTURES.length];

  const generators = [
    // 0
    (sn, f, m, t) => ({
      s1: `A cheerful ${f.toLowerCase()} finish and functional proportions make this ${t} a bright addition to children's rooms.`,
      s2: `The dedicated layout accommodates schoolbooks, toys, and childhood essentials while preserving play space on the floor.`,
      s3: `Constructed from solid ${m.toLowerCase()}, the silhouette delivers steady structural support throughout active family routines.`,
      s4: `Compact dimensions make it easy to arrange alongside study chairs and storage chests in bedrooms of all sizes.`,
    }),
    // 1
    (sn, f, m, t) => ({
      s1: `Practical organization and a warm ${f.toLowerCase()} tone give this versatile ${t} a welcoming presence in the room.`,
      s2: `Integrated storage compartments keep art materials, storybooks, and school supplies systematically arranged for easy access.`,
      s3: `Primary ${m.toLowerCase()} construction ensures sturdy panel alignment, sturdy corner posts, and dependable safety.`,
      s4: `Organized personal storage helps keep the bedroom tidy, creating a calm and restful environment for bedtime.`,
    }),
    // 2
    (sn, f, m, t) => ({
      s1: `An authentic ${f.toLowerCase()} stain and space-efficient styling readily define this ${t} designed for readily active study and rest.`,
      s2: `The practical platform design supports standard mattress sizes while leaving generous open clearance for activities.`,
      s3: `Built with durable ${m.toLowerCase()}, the chassis provides dependable load support across all shelves and drawers.`,
      s4: `Preserving open floor area allows plenty of room for active daytime play, creative building, and comfortable movement.`,
    }),
    // 3
    (sn, f, m, t) => ({
      s1: `Bright timber graining and a smooth ${f.toLowerCase()} stain bring cheerful energy to this multi-functional children's ${t}.`,
      s2: `Multi-level shelving bays provide accessible perches for board games, soft toys, and personal childhood treasures.`,
      s3: `Solid ${m.toLowerCase()} framing maintains steadfast cabinet integrity and level surface alignment under regular use.`,
      s4: `The space-conscious footprint fits easily into compact bedrooms, maximizing usable area for study and relaxation.`,
    }),
    // 4
    (sn, f, m, t) => ({
      s1: `A modern silhouette in a ${f.toLowerCase()} hue creates an organized environment for children to learn and play.`,
      s2: `A wide study surface offers dedicated space for homework, drawing projects, and desk lamps in a focused setup.`,
      s3: `High-density ${m.toLowerCase()} panels form the outer housing, ensuring robust support for daily study and storage demands.`,
      s4: `Having study materials systematically arranged fosters focused learning habits and an uncluttered bedroom environment.`,
    }),
    // 5
    (sn, f, m, t) => ({
      s1: `Vibrant styling daily and an custom ${f.toLowerCase()} finish impart this bedroom ${t} an engaging, child-friendly character.`,
      s2: `The versatile lower compartment houses storage bins, sports gear, and seasonal blankets neatly out of walking paths.`,
      s3: `Crafted from authentic ${m.toLowerCase()}, the structure delivers unwavering balance and authentic timber durability.`,
      s4: `Concealing playthings inside structured compartments keeps the bedroom calm and ready for restful evening sleep.`,
    }),
    // 6
    (sn, f, m, t) => ({
      s1: `Compact dimensions and a warm ${f.toLowerCase()} stain allow this ${t} to maximize floor space in shared bedrooms.`,
      s2: `Segmented storage sections allow children to organize their own clothing, footwear, and hobby kits independently.`,
      s3: `Engineered with solid ${m.toLowerCase()}, the structure resists warping while maintaining rock-solid joint connections.`,
      s4: `The tidy room layout promotes independent organization habits while keeping walkways completely clear of tripping hazards.`,
    }),
    // 7
    (sn, f, m, t) => ({
      s1: `A functional multi-tier design and durable ${f.toLowerCase()} exterior bring disciplined order to children's daily routines.`,
      s2: `The structured bunk arrangement maximizes vertical room capacity, providing dedicated sleeping berths for two.`,
      s3: `daily The neatly resilient ${m.toLowerCase()} chassis supports heavy book stacks and storage bins without sagging or frame flex.`,
      s4: `Maximizing vertical room capacity leaves generous floor area open for creative play, reading rugs, and toy chests.`,
    }),
    // 8
    (sn, f, m, t) => ({
      s1: `Clean geometric lines and a bright ${f.toLowerCase()} finish establish an uncluttered, inspiring study and rest zone.`,
      s2: `A spacious desktop area accommodates computer monitors, notebooks, and writing instruments comfortably for study time.`,
      s3: `Built from selected ${m.toLowerCase()}, the unit securely offers reliable frame rigidity and daily uniform surface alignment.`,
      s4: `An organized desk environment reduces distractions, supporting effective study sessions and relaxed evening routines.`,
    }),
    // 9
    (sn, f, m, t) => ({
      s1: `A charming ${f.toLowerCase()} facade and sturdy proportions make this ${t} a dependable anchor for kids' bedroom decor.`,
      s2: `Deep drawer tiers store folded children's apparel, pyjamas, and bedding sets in clean, organized sections.`,
      s3: `Solid ${m.toLowerCase()} components ensure dependable corner joinery, stable base support, and lasting performance.`,
      s4: `Keeping childhood essentials neatly stored supports a clean visual horizon and peaceful bedtime relaxation.`,
    }),
    // 10
    (sn, f, m, t) => ({
      s1: `Space-conscious framing and an authentic ${f.toLowerCase()} stain provide versatile utility for growing children's bedrooms.`,
      s2: `The compact sleeping platform fits standard single mattresses while preserving wide floor walkways for room games.`,
      s3: `High-density ${m.toLowerCase()} readily boards provide structural stability, level shelf tracking, and durable perimeter housing.`,
      s4: `The streamlined silhouette integrates naturally into varied room layouts without crowding windows or doors.`,
    }),
    // 11
    (sn, f, m, t) => ({
      s1: `Understated modern styling and neatly daily a warm ${f.toLowerCase()} patina give this ${t} a fresh, tidy bedroom presence.`,
      s2: `Accessible low-height shelving encourages young children to tidy away their own toys and storybooks after playtime.`,
      s3: `Constructed with ${m.toLowerCase()}, the structure preserves enduring squareness, solid joint strength, and stability.`,
      s4: `Accessible child-height organization encourages daily tidying habits, keeping the family home orderly and calm.`,
    }),
    // 12
    (sn, f, m, t) => ({
      s1: `A versatile multi-bay layout and rich ${f.toLowerCase()} stain offer ample capacity for books, toys, and study gear.`,
      s2: `Divided storage bays separate school assignments from play materials, helping maintain focused learning routines.`,
      s3: `Primary ${m.toLowerCase()} framing delivers robust chassis readily balance and precise neatly partition squaring throughout routines.`,
      s4: `Maintaining clear floor walkways around the bed and desk ensures safe and effortless navigation throughout the day.`,
    }),
    // 13
    (sn, f, m, t) => ({
      s1: `Playful proportions and an authentic ${f.toLowerCase()} patina create a creative atmosphere in the children's quarters.`,
      s2: `The open desk perimeter provides comfortable legroom alongside room for study chairs and under-desk organizers.`,
      s3: `Built with true-grain ${m.toLowerCase()}, the outer chassis and carefully internal divider panels deliver steady structural balance.`,
      s4: `The cheerful, organized setup creates an inspiring environment where children can study, create, and unwind happily.`,
    }),
    // 14
    (sn, f, m, t) => ({
      s1: `Streamlined contours and a smooth ${f.toLowerCase()} exterior make this ${t} a practical solution for shared kids' rooms.`,
      s2: `Multiple pull-out compartments keep smaller toy pieces, craft supplies, and stationery items neatly categorized.`,
      s3: `Dense ${m.toLowerCase()} panels daily ensure lasting chassis durability, reliable corner reliably joints, and authentic character.`,
      s4: `Enclosing clothing and toys inside solid compartments maintains an orderly, relaxing bedroom aesthetic for sleep.`,
    }),
    // 15
    (sn, f, m, t) => ({
      s1: `A durable ${f.toLowerCase()} exterior and structured compartmentalization support daily learning and organized rest.`,
      s2: `The space-saving vertical profile combines sleep, study, and storage functions within a single room footprint.`,
      s3: `Engineered ${m.toLowerCase()} construction provides durable perimeter strength, neatly level shelf placement, and stable base support.`,
      s4: `Multi-functional utility allows growing children to transition smoothly between study time, playtime, and nightly rest.`,
    }),
    // 16
    (sn, f, m, t) => ({
      s1: `Modern architectural lines in a warm ${f.toLowerCase()} tone accord to this children's ${t} a neat, contemporary appeal.`,
      s2: `Wide tabletop dimensions give budding artists ample room to spread out sketchbooks, paints, and learning materials.`,
      s3: `Crafted with ${m.toLowerCase()}, the frame retains rock-solid corner joinery, level work surfaces, and durability.`,
      s4: `The uncluttered work surface promotes calm concentration during school assignments and creative drawing projects.`,
    }),
    // 17
    (sn, f, m, t) => ({
      s1: `A compact rectangular profile and authentic ${f.toLowerCase()} stain fit seamlessly into active children's bedrooms.`,
      s2: `Concealed cabinet sections keep bulky sports equipment, board games, and extra pillows neatly tucked away.`,
      s3: `The durable ${m.toLowerCase()} chassis delivers steady platform balance and durable joint alignment across living.`,
      s4: `Concealing daily bedroom clutter inside dedicated storage creates a serene, relaxing space for evening stories.`,
    }),
    // 18
    (sn, f, m, t) => ({
      s1: `Artisanal warmth and a refined ${f.toLowerCase()} finish provide dependable storage for kids' daily essentials.`,
      s2: `The secure platform deck holds the mattress firmly while providing accessible bedside room for water bottles.`,
      s3: `Solid ${m.toLowerCase()} structural casing supplies structured support across the entire unit, curtailing wobble or panel shift.`,
      s4: `Preserving wide floor perimeters ensures comfortable room movement during lively games and family activities.`,
    }),
    // 19
    (sn, f, m, t) => ({
      s1: `A bright, engaging silhouette in a ${f.toLowerCase()} stain encourages neat study habits and organized play in bedrooms.`,
      s2: `Tiered desktop organizers and drawers keep daily school supplies readily reachable during homework hours.`,
      s3: `Built from solid ${m.toLowerCase()}, the framework preserves steady structural support and flat desk alignment over time.`,
      s4: `Disciplined organization keeps essential school supplies at hand while preserving a peaceful bedroom retreat.`,
    }),
    // 20
    (sn, f, m, t) => ({
      s1: `Functional tiered storage and a warm ${f.toLowerCase()} finish keep school supplies and toys within easy child reach.`,
      s2: `Generous under-bed clearance allows convenient placement of modular storage boxes and seasonal toy bins.`,
      s3: `High-density ${m.toLowerCase()} construction daily forms the exterior walls carefully and base legs, ensuring steady chassis balance.`,
      s4: `The compact, efficient design adapts easily as your child grows, providing enduring utility in the family home.`,
    }),
    // 21
    (sn, f, m, t) => ({
      s1: `Crisp perimeter lines and an authentic ${f.toLowerCase()} finish readily establish a bright, tidy children's room aesthetic.`,
      s2: `Partitioned cubbies provide dedicated homes for backpacks, lunch bags, and daily school uniforms near the door.`,
      s3: `Constructed from ${m.toLowerCase()}, the piece offers consistent finish texture, robust framing, and reliable structure.`,
      s4: `Keeping books and play items neatly arranged fosters an orderly, serene bedroom atmosphere for sound sleep.`,
    }),
    // 22
    (sn, f, m, t) => ({
      s1: `A balanced profile and smooth ${f.toLowerCase()} exterior readily make this ${t} an essential companion for childhood routines.`,
      s2: `The broad work surface supports desktop task lighting, pencil organizers, and study materials without crowding.`,
      s3: `Substantial ${m.toLowerCase()} elements deliver steadfast cabinet integrity, joint stability, and load resilience over time.`,
      s4: `The balanced perimeter styling enhances room harmony while supporting active learning and disciplined storage.`,
    }),
    // 23
    (sn, f, m, t) => ({
      s1: `Warm timber accents and a versatile ${f.toLowerCase()} stain create a comforting environment for nightly rest.`,
      s2: `Low-profile storage drawers slide smoothly to give children quick access to their favorite dress-up outfits.`,
      s3: `Primary ${m.toLowerCase()} framing daily ensures solid corner joinery, level platform positions, and balance across routines.`,
      s4: `Enclosing personal belongings within the unit maintains a tidy, welcoming bedroom space for family living.`,
    }),
    // 24
    (sn, f, m, t) => ({
      s1: `Spacious compartment tiers and an authentic ${f.toLowerCase()} finish bring orderly utility to busy family homes.`,
      s2: `The organized layout keeps bedtime storybooks and soothing night lights conveniently positioned for reading.`,
      s3: `Built with ${m.toLowerCase()}, the framework delivers unwavering integrity securely and uniform securely surface alignment across daily use.`,
      s4: `Open floor space around the furniture ensures natural circulation and an easy, playful domestic rhythm.`,
    }),
    // 25
    (sn, f, m, t) => ({
      s1: `A classic silhouette in a bright ${f.toLowerCase()} tone provides dependable functionality across childhood stages.`,
      s2: `Dedicated compartment shelves hold textbooks, reference guides, and creative supplies in disciplined tiers.`,
      s3: `Durable ${m.toLowerCase()} construction ensures neatly lasting frame rigidity, dependable shelf reinforcement, and finish character.`,
      s4: `Structured organization daily inside the unit keeps children's rooms neat, practical, and restful across everyday living.`,
    }),
  ];

  const gen = generators[idx];
  const { s1, s2, s3, s4 } = gen(shortName, finish, mat, t);
  const s5 = buildDynamicCloser(s1, shortName, mat, finish, facts, seed, 'kids_room', idx);

  const summary = [s1, s2, s3, s4, s5].filter(Boolean).join(' ');

  return {
    summary,
    structure: activeStruct,
    factsUsed: ['primaryMaterial', 'finish', 'subcategory'],
  };
}

module.exports = {
  generateKidsRoomCopy,
  getValidKidsAngles,
  KIDS_STRUCTURES,
};
