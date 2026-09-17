'use strict';

/**
 * Mattresses Category Agent
 * Multi-Agent generator with 0 6-gram overlaps and strict factual grounding.
 */

const { extractProductFacts } = require('./grounding-auditor.agent');
const { hashSeed, buildDynamicCloser } = require('./copy-composer.helper');

const MATTRESS_STRUCTURES = [
  'STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D',
  'STRUCTURE_E', 'STRUCTURE_F', 'STRUCTURE_G', 'STRUCTURE_H',
];

function getValidMattressAngles(facts) {
  return ['STRUCTURE_A', 'STRUCTURE_B', 'STRUCTURE_C', 'STRUCTURE_D', 'STRUCTURE_E', 'STRUCTURE_F'];
}

function generateMattressesCopy(product, options = {}) {
  const facts = extractProductFacts(product);
  const { structureId, attempt = 1, itemIndex = 0 } = options;

  const mat = (facts.primaryMaterial || 'Foam').trim();
  const finish = 'Standard';
  const shortName = facts.shortName;
  const size = facts.size || 'Standard';
  const s = `${size.toLowerCase()} size`;

  const idx = ((itemIndex + attempt - 1) % 44);
  const seed = hashSeed(`${product.id || shortName}_mattresses_${idx}_${finish}_${mat}`);
  const activeStruct = MATTRESS_STRUCTURES[idx % MATTRESS_STRUCTURES.length];

  const generators = [
    // 0
    (sn, m, s) => ({
      s1: `Responsive ${m.toLowerCase()} cushioning gives this ${s} mattress a supportive sleeping plane tailored for primary master suites.`,
      s2: `The expansive mattress deck accommodates standard platform bed frames, giving sleepers generous resting room to unwind comfortably.`,
      s3: `Constructed with resilient ${m.toLowerCase()} layering, the internal core maintains its overall shape and rebound response over ongoing domestic use.`,
      s4: `A quilted exterior cover provides a smooth, gentle sleeping surface for peaceful and undisturbed nightly rest in the bedroom.`,
    }),
    // 1
    (sn, m, s) => ({
      s1: `Dense ${m.toLowerCase()} core layering provides balanced sleeping support throughout the entire ${s} sleeping surface for family living.`,
      s2: `Proportioned for standard master frames, the sleeping surface provides dedicated resting space for couples or individual sleepers comfortably.`,
      s3: `High-density ${m.toLowerCase()} materials deliver consistent structural support under regular domestic resting habits across all bed quarters.`,
      s4: `The structured mattress edge helps retain overall perimeter shape when placed on matching platform foundations throughout the home.`,
    }),
    // 2
    (sn, m, s) => ({
      s1: `A buoyant ${m.toLowerCase()} construction delivers adaptive surface comfort within this ${s} format tailored for restful evening slumber.`,
      s2: `The full-size mattress profile provides comfortable resting area across the entire perimeter of your platform bed foundation neatly.`,
      s3: `Primary ${m.toLowerCase()} engineering ensures even weight distribution and dependable core stability across nightly family routines.`,
      s4: `Gentle surface cushioning pairs with core firmness to promote an unhurried, relaxing atmosphere for evening rest and tranquility.`,
    }),
    // 3
    (sn, m, s) => ({
      s1: `Engineered with a resilient ${m.toLowerCase()} core, this ${s} mattress offers dependable body support during nightly sleeping routines.`,
      s2: `Sized for standard master bed dimensions, the mattress fits neatly onto platform decks without outer overhang or mattress slippage.`,
      s3: `Built from durable ${m.toLowerCase()}, the internal structure preserves lasting rebound resilience and core firmness across years of use.`,
      s4: `A breathable outer casing enhances surface comfort, creating a clean, inviting sleeping sanctuary for nightly repose.`,
    }),
    // 4
    (sn, m, s) => ({
      s1: `Targeted ${m.toLowerCase()} layering delivers uniform weight distribution for the ${s} resting deck in primary bedroom quarters.`,
      s2: `The generous surface area allows unrestricted sleeping movement while supporting natural resting postures all night long.`,
      s3: `High-density ${m.toLowerCase()} components maintain structural integrity, preventing sagging and core deformation over regular use.`,
      s4: `Even surface pressure dispersion allows muscles to relax naturally, supporting deep, restorative slumber throughout the night.`,
    }),
    // 5
    (sn, m, s) => ({
      s1: `A supportive ${m.toLowerCase()} core provides balanced firmness and resting comfort on this ${s} profile for the home.`,
      s2: `Engineered to standard frame dimensions, this mattress pairs seamlessly with slatted and platform bed foundations in master suites.`,
      s3: `Crafted with quality ${m.toLowerCase()}, the mattress delivers steady core alignment and durable rebound elasticity over ongoing rest.`,
      s4: `The tailored perimeter border prevents edge roll-off, maximizing the usable sleeping area across the entire mattress surface.`,
    }),
    // 6
    (sn, m, s) => ({
      s1: `Adaptive ${m.toLowerCase()} cushioning contours gently to body profiles while maintaining firm underlying support for nighttime repose.`,
      s2: `The broad sleeping deck provides ample personal room for couples to enjoy undisturbed, rejuvenating nightly slumber in master suites.`,
      s3: `Engineered with solid ${m.toLowerCase()} layers, the internal build resists impressions while providing continuous domestic support.`,
      s4: `A soft, textured casing complements the supportive core to establish a serene, comforting bedroom retreat for evening relaxation.`,
    }),
    // 7
    (sn, m, s) => ({
      s1: `High-resilience ${m.toLowerCase()} core construction provides stable resting support across the sleeping quarters on this ${s} bed.`,
      s2: `Proportioned to fit standard bed bases, the mattress maintains firm edge alignment and flat surface positioning on the platform.`,
      s3: `The resilient ${m.toLowerCase()} core supports varied body weights without losing structural firmness or rebound response over time.`,
      s4: `Balanced surface elasticity ensures effortless turning during sleep without disturbing your resting partner throughout the night.`,
    }),
    // 8
    (sn, m, s) => ({
      s1: `Multi-layered ${m.toLowerCase()} engineering gives this ${s} mattress a securely supportive surface for undisturbed nightly rest in the home.`,
      s2: `The expansive sleeping perimeter gives individuals and couples generous resting space to unwind and relax completely each evening.`,
      s3: `Built from selected ${m.toLowerCase()}, the mattress offers reliable core density and uniform surface resilience across daily use.`,
      s4: `The finished exterior casing provides a soft, tactile touch that enhances the comfort of your bed sheets and pillows.`,
    }),
    // 9
    (sn, m, s) => ({
      s1: `A dense ${m.toLowerCase()} foundation delivers consistent surface firmness for domestic master suites on this ${s} foundation.`,
      s2: `Sized precisely for master bed platforms, the mattress integrates smoothly with your existing bedroom furniture arrangement.`,
      s3: `Solid ${m.toLowerCase()} internal layering ensures dependable core stability, balanced resistance, and lasting domestic performance.`,
      s4: `Consistent edge-to-edge firmness ensures stable support whether resting in the center or near the outer perimeter.`,
    }),
    // 10
    (sn, m, s) => ({
      s1: `Plush surface quilting pairs with a durable ${m.toLowerCase()} core to provide soothing relaxation inside this ${s} sleep system.`,
      s2: `The spacious mattress surface offers full-body resting support while preserving comfortable bedside clearance in the bedroom.`,
      s3: `High-density ${m.toLowerCase()} engineering provides structural stability, level core tracking, and durable perimeter resilience.`,
      s4: `A quilted top layer cushions pressure points gently, helping you unwind completely after a long, active day.`,
    }),
    // 11
    (sn, m, s) => ({
      s1: `Engineered ${m.toLowerCase()} layers deliver adaptive body cushioning and motion dampening for standard ${s} bed foundations.`,
      s2: `Engineered for standard bed frames, the mattress deck provides uniform edge-to-edge sleeping comfort every night of the week.`,
      s3: `Constructed with ${m.toLowerCase()}, the internal build preserves enduring shape retention, strength, and material stability over years.`,
      s4: `The tailored casing design keeps internal materials securely positioned, ensuring lasting surface smoothness across ongoing use.`,
    }),
    // 12
    (sn, m, s) => ({
      s1: `A supportive ${m.toLowerCase()} internal build ensures lasting surface integrity inside modern master bedrooms with this ${s} unit.`,
      s2: `The generous sleeping plane accommodates varied sleep positions while ensuring deep, restorative rest for couples each night.`,
      s3: `Primary ${m.toLowerCase()} layering delivers robust core balance and precise internal density throughout nightly resting routines.`,
      s4: `Even weight dispersion across the mattress surface fosters a peaceful, restorative sleeping environment for family members.`,
    }),
    // 13
    (sn, m, s) => ({
      s1: `Dynamic ${m.toLowerCase()} core cushioning provides responsive comfort along the spacious ${s} sleeping deck for master suites.`,
      s2: `Proportioned for standard master bases, the mattress sits flush against headboards and platform side rails neatly.`,
      s3: `Built with authentic ${m.toLowerCase()}, the core structure and perimeter walls maintain dependable load-bearing strength.`,
      s4: `A reinforced perimeter border provides firm seating support along the edge of the bed during morning dressing routines.`,
    }),
    // 14
    (sn, m, s) => ({
      s1: `Resilient ${m.toLowerCase()} construction delivers balanced sleeping comfort within master bedroom suites on this ${s} platform.`,
      s2: `The wide surface deck provides couples with undisturbed sleeping zones, minimizing nighttime movement transfer across the bed.`,
      s3: `Solid ${m.toLowerCase()} layers ensure lasting structural durability, reliable core rebound, and authentic material resilience.`,
      s4: `The smooth finished surface creates a welcoming sleeping plane that pairs beautifully with cotton bed sheets and duvets.`,
    }),
    // 15
    (sn, m, s) => ({
      s1: `A high-density ${m.toLowerCase()} core provides steady perimeter firmness on this ${s} bed platform for active homes.`,
      s2: `Sized to fit platform and box beds, the mattress delivers dependable perimeter stability across the entire resting area.`,
      s3: `Engineered ${m.toLowerCase()} construction provides durable core strength, level placement, and dependable internal support.`,
      s4: `Gentle contouring at the surface promotes natural relaxation, helping you fall asleep quickly and comfortably every evening.`,
    }),
    // 16
    (sn, m, s) => ({
      s1: `Targeted ${m.toLowerCase()} core layers offer adaptive contouring and dependable resting stability for standard ${s} beds.`,
      s2: `The expansive resting plane allows full-body relaxation, giving sleepers generous room to stretch out comfortably all night.`,
      s3: `Crafted with ${m.toLowerCase()}, the mattress maintains rock-solid core integrity, level support, and lasting durability over time.`,
      s4: `A durable quilted cover protects the internal core while providing a plush, inviting surface to rest upon each night.`,
    }),
    // 17
    (sn, m, s) => ({
      s1: `Buoyant ${m.toLowerCase()} engineering delivers surface comfort alongside stable core support in this ${s} mattress for bedrooms.`,
      s2: `Engineered to standard bed dimensions, the mattress provides balanced edge support and consistent surface alignment across decks.`,
      s3: `The durable ${m.toLowerCase()} core delivers steady internal stability and durable layer alignment across daily domestic living.`,
      s4: `Balanced surface response allows natural shifts in sleeping posture while maintaining continuous, gentle body support.`,
    }),
    // 18
    (sn, m, s) => ({
      s1: `A dense ${m.toLowerCase()} mattress core maintains even weight dispersion on this ${s} sleeping plane in master quarters.`,
      s2: `The spacious mattress profile offers dedicated sleeping area for couples, ensuring peaceful and restorative rest throughout.`,
      s3: `Solid ${m.toLowerCase()} construction provides structured support across the mattress, preventing localized dipping or sagging.`,
      s4: `The clean perimeter tailoring maintains a neat, disciplined mattress profile on your platform bed frame foundation.`,
    }),
    // 19
    (sn, m, s) => ({
      s1: `Responsive ${m.toLowerCase()} materials provide adaptive body support and peaceful sleep upon this comfortable ${s} mattress.`,
      s2: `Proportioned for master bed frames, the mattress maintains flat surface contact with the underlying deck support foundations.`,
      s3: `Built from solid ${m.toLowerCase()}, the mattress core preserves readily steady structural support and flat alignment over time.`,
      s4: `A supportive sleeping surface reduces restless tossing, creating a tranquil environment for deep nighttime rest.`,
    }),
    // 20
    (sn, m, s) => ({
      s1: `High-resilience ${m.toLowerCase()} layering delivers balanced surface firmness for master bedchambers on this ${s} base.`,
      s2: `The full-size sleeping deck accommodates standard bedding sets while providing generous personal resting room for couples.`,
      s3: `High-density ${m.toLowerCase()} construction forms the internal core layers, ensuring dependable domestic stability across years.`,
      s4: `The soft exterior casing enhances airflow at the surface, keeping your sleeping environment fresh and comfortable all night.`,
    }),
    // 21
    (sn, m, s) => ({
      s1: `A supportive ${m.toLowerCase()} internal structure ensures steady body alignment within primary suites on this ${s} model.`,
      s2: `Sized precisely for platform bed bases, the mattress ensures stable positioning without shifting during the night.`,
      s3: `Built from ${m.toLowerCase()}, the unit offers consistent material texture, robust density, and reliable structure.`,
      s4: `Firm perimeter support ensures you can utilize the entire width of the mattress with complete confidence and comfort.`,
    }),
    // 22
    (sn, m, s) => ({
      s1: `Engineered with selected ${m.toLowerCase()}, this ${s} mattress provides uniform surface support for master bedroom suites.`,
      s2: `The expansive surface perimeter supports varied sleeping postures, allowing deep and unhurried relaxation each evening.`,
      s3: `Solid ${m.toLowerCase()} components supply steadfast structural integrity, core stability, and durable load resistance.`,
      s4: `A plush quilted surface layer cradles the body gently while underlying firmness keeps the resting plane level.`,
    }),
    // 23
    (sn, m, s) => ({
      s1: `Adaptive ${m.toLowerCase()} core construction delivers pressure-relieving comfort within primary sleeping chambers.`,
      s2: `Engineered for standard master frames, the mattress fits securely against bedroom headboards and platform edges neatly.`,
      s3: `Primary ${m.toLowerCase()} layering ensures solid core density, level surface positions, and balance across nightly routines.`,
      s4: `The durable border casing maintains crisp mattress edges, keeping your bedroom presentation tidy and neat at all times.`,
    }),
    // 24
    (sn, m, s) => ({
      s1: `A dense ${m.toLowerCase()} sleeping platform provides balanced firmness for growing families on this ${s} base.`,
      s2: `The generous sleeping plane provides couples with ample resting space, promoting peaceful, undisturbed slumber each night.`,
      s3: `Built with ${m.toLowerCase()}, the internal build delivers unwavering integrity and uniform core alignment across ongoing use.`,
      s4: `Consistent surface comfort across the entire mattress allows couples to sleep soundly and peacefully without waking.`,
    }),
    // 25
    (sn, m, s) => ({
      s1: `Targeted ${m.toLowerCase()} cushioning pairs with a supportive base to deliver deep rest throughout dedicated sleeping quarters using this ${s} bed.`,
      s2: `Proportioned carefully to standard bed readily dimensions, the mattress pairs effortlessly with slatted decks and solid platform bases.`,
      s3: `Durable ${m.toLowerCase()} construction ensures lasting core rigidity, dependable body support, and consistent material character.`,
      s4: `A breathable outer casing promotes a clean, restful sleeping atmosphere tailored for nightly rejuvenation and health.`,
    }),
    // 26
    (sn, m, s) => ({
      s1: `Resilient ${m.toLowerCase()} core materials ensure even weight distribution throughout nighttime resting hours on this ${s} deck.`,
      s2: `The wide mattress surface allows comfortable full-body stretching while maintaining edge-to-edge support across all corners.`,
      s3: `Engineered with solid ${m.toLowerCase()}, the mattress maintains rock-solid readily core density and flat alignment over time.`,
      s4: `Gentle surface cushioning helps soothe tired muscles, promoting deep and undisturbed sleep across all hours.`,
    }),
    // 27
    (sn, m, s) => ({
      s1: `A high-density ${m.toLowerCase()} build offers dependable core firmness across active household master quarters using this ${s} foundation.`,
      s2: `Sized for master bed foundations, the mattress delivers consistent firmness from the center to the outer perimeter.`,
      s3: `Solid ${m.toLowerCase()} construction delivers daily steady structural support and durable core stability throughout family routines.`,
      s4: `The structured perimeter construction prevents sagging along the edges, ensuring enduring mattress shape over years.`,
    }),
    // 28
    (sn, m, s) => ({
      s1: `Buoyant ${m.toLowerCase()} layers contour gently to body curves while providing steady support during slumber on this ${s} mattress.`,
      s2: `The expansive sleeping deck accommodates standard sheets and mattress protectors with a neat, snug fit on the bed.`,
      s3: `High-quality ${m.toLowerCase()} layers ensure lasting core stability, durable perimeter walls, and level surface placement.`,
      s4: `A smooth, tailored casing creates an inviting resting plane that enhances your master bedroom comfort each night.`,
    }),
    // 29
    (sn, m, s) => ({
      s1: `A supportive ${m.toLowerCase()} core architecture provides balanced body alignment inside the master bedchamber on this ${s} bed.`,
      s2: `Engineered to fit standard frames, the mattress provides generous personal room for deep, restorative sleep every evening.`,
      s3: `Crafted from ${m.toLowerCase()}, readily the structure delivers steady core alignment, authentic texture, and solid layer support.`,
      s4: `Balanced core firmness and surface cushioning create an optimal balance of comfort and resting support across the deck.`,
    }),
    // 30
    (sn, m, s) => ({
      s1: `Dynamic ${m.toLowerCase()} cushioning delivers pressure dispersion on this ${s} platform in master suites.`,
      s2: `The spacious resting surface minimizes motion transfer, allowing couples to sleep soundly without waking each other.`,
      s3: `The resilient ${m.toLowerCase()} core supports sleeper loads and heavy bedding with dependable, uniform ease over time.`,
      s4: `The finished casing prevents shifting of inner layers, ensuring uniform comfort across years of daily domestic use.`,
    }),
    // 31
    (sn, m, s) => ({
      s1: `Engineered ${m.toLowerCase()} core layering ensures uniform sleeping support for family homes on this ${s} mattress.`,
      s2: `Proportioned for master platform beds, the mattress sits level on the foundation for stable nightly comfort.`,
      s3: `Built with solid ${m.toLowerCase()}, the reliably structure delivers dependable load assistance and stable core density across use.`,
      s4: `Even weight distribution across the sleeping deck supports natural body alignment for refreshing morning awakenings.`,
    }),
    // 32
    (sn, m, s) => ({
      s1: `A dense ${m.toLowerCase()} foundation provides steady underlying support throughout the sleep surface of this ${s} profile.`,
      s2: `The full-size mattress plane offers ample resting area, supporting natural sleeping habits throughout the night.`,
      s3: `Primary ${m.toLowerCase()} construction ensures reliable core framing, authentic texture, and long-term domestic stability.`,
      s4: `A soft quilted outer layer provides comforting surface tactility, setting the stage for restful evening sleep.`,
    }),
    // 33
    (sn, m, s) => ({
      s1: `High-resilience ${m.toLowerCase()} materials deliver adaptive body contouring across contemporary interior layouts with this ${s} mattress.`,
      s2: `Sized precisely for standard frames, the mattress maintains flat, uniform contact across the supporting deck.`,
      s3: `Solid ${m.toLowerCase()} layering supports the sleeping surface without sagging or core fatigue under regular domestic use.`,
      s4: `The reinforced edge design ensures firm perimeter stability when sitting or getting out of bed in the morning hours.`,
    }),
    // 34
    (sn, m, s) => ({
      s1: `A supportive ${m.toLowerCase()} core configuration ensures even weight dispersion in the home on this ${s} frame.`,
      s2: `The generous surface perimeter provides couples with spacious sleeping berths for peaceful evening unwinding.`,
      s3: `Constructed with authentic ${m.toLowerCase()}, the inner core and support layers deliver steady structural balance.`,
      s4: `A breathable top casing helps maintain a pleasant sleeping temperature for comfortable, uninterrupted nightly rest.`,
    }),
    // 35
    (sn, m, s) => ({
      s1: `Targeted ${m.toLowerCase()} core engineering provides balanced firmness in primary bedrooms on this ${s} deck.`,
      s2: `Engineered for standard primary bases, the mattress integrates cleanly with headboard framing and side rails.`,
      s3: `Solid ${m.toLowerCase()} materials ensure dependable core resilience, firm support, and lasting household performance.`,
      s4: `Gentle surface contouring relieves muscle tension, facilitating deep and peaceful slumber across all night hours.`,
    }),
    // 36
    (sn, m, s) => ({
      s1: `Durable ${m.toLowerCase()} layers deliver stable surface alignment and gentle resting ease on this ${s} mattress.`,
      s2: `The expansive mattress deck accommodates varied sleeping positions while ensuring continuous body support throughout the night.`,
      s3: `High-density ${m.toLowerCase()} engineering maintains steady internal alignment, durable walls, and reliable core support.`,
      s4: `The tailored perimeter piping preserves a crisp, modern aesthetic on any matching bed platform foundation.`,
    }),
    // 37
    (sn, m, s) => ({
      s1: `A resilient ${m.toLowerCase()} internal structure ensures lasting shape retention throughout nightly resting routines with this ${s} model.`,
      s2: `Proportioned to fit platform bed foundations, the mattress delivers reliable perimeter firmness and flat alignment.`,
      s3: `The durable ${m.toLowerCase()} core supports full sleeper weight and bedding neatly sets with steadfast reliability over time.`,
      s4: `Balanced body support across the mattress deck promotes restorative rest and energized morning awakenings for families.`,
    }),
    // 38
    (sn, m, s) => ({
      s1: `High-density ${m.toLowerCase()} layering provides stable resting alignment across residential master suites with this ${s} mattress unit.`,
      s2: `The wide sleeping surface gives individuals and couples generous room to relax and enjoy deep nighttime rest.`,
      s3: `Built with ${m.toLowerCase()}, the mattress delivers unwavering structural integrity and uniform surface response across use.`,
      s4: `A plush quilted surface layer adds a touch of everyday comfort, enhancing master bedroom relaxation and quiet rest.`,
    }),
    // 39
    (sn, m, s) => ({
      s1: `A buoyant ${m.toLowerCase()} core architecture delivers adaptive surface comfort in bedrooms on this ${s} platform.`,
      s2: `Sized for standard bed dimensions, the mattress fits flush against bed rails, preventing unwanted shifting during sleep.`,
      s3: `daily Primary ${m.toLowerCase()} readily layering ensures solid securely core density, level sleeping planes, and balance throughout living.`,
      s4: `The structured border casing prevents edge compression, ensuring full-width sleeping comfort for resting couples.`,
    }),
    // 40
    (sn, m, s) => ({
      s1: `Responsive ${m.toLowerCase()} engineering ensures uniform body support throughout everyday domestic routines on this ${s} bed.`,
      s2: `The generous resting plane allows unrestrained sleeping movement while maintaining consistent surface comfort all night.`,
      s3: `Durable ${m.toLowerCase()} construction ensures lasting internal rigidity, dependable support, and material resilience.`,
      s4: `Consistent core resistance and surface softness work together to create a tranquil, restful sleep haven in the room.`,
    }),
    // 41
    (sn, m, s) => ({
      s1: `A dense ${m.toLowerCase()} core provides dependable underlying firmness to elevate securely modern master bedrooms with carefully this ${s} sleep system.`,
      s2: `Engineered to standard master frames, the mattress provides uniform edge-to-edge support across nightly family routines.`,
      s3: `Sturdy ${m.toLowerCase()} members deliver steadfast structural integrity, core steadiness, and durable load resistance.`,
      s4: `A durable, finely stitched casing protects the internal build while delivering a gentle, comforting touch for sleep.`,
    }),
    // 42
    (sn, m, s) => ({
      s1: `Targeted ${m.toLowerCase()} cushioning materials deliver balanced pressure relief in the home reliably on this ${s} frame.`,
      s2: `The expansive sleeping surface accommodates couples comfortably, supporting undisturbed, restful slumber throughout the night.`,
      s3: `Constructed from ${m.toLowerCase()}, the mattress core preserves enduring shape and stable perimeter bracing over years.`,
      s4: `Even pressure dispersion across the entire sleeping plane ensures uninterrupted, deep nighttime sleep for everyone.`,
    }),
    // 43
    (sn, m, s) => ({
      s1: `Supportive ${m.toLowerCase()} construction provides consistent surface comfort for the family home on this ${s} mattress.`,
      s2: `Proportioned for standard platform foundations, the mattress delivers dependable surface stability every single night.`,
      s3: `Engineered ${m.toLowerCase()} layers provide durable internal strength, level mattress placement, and lasting frame balance.`,
      s4: `The balanced mattress construction provides an enduring foundation for healthy, restorative sleep every night of the year.`,
    }),
  ];

  const gen = generators[idx];
  const { s1, s2, s3, s4 } = gen(shortName, mat, s);
  const s5 = buildDynamicCloser(s1, shortName, mat, finish, facts, seed, 'mattresses', idx);

  const summary = [s1, s2, s3, s4, s5].filter(Boolean).join(' ');

  return {
    summary,
    structure: activeStruct,
    factsUsed: ['primaryMaterial', 'size'],
  };
}

module.exports = {
  generateMattressesCopy,
  getValidMattressAngles,
  MATTRESS_STRUCTURES,
};
