'use strict';

/**
 * Fact Inventory Agent
 * Extracts a strict, verifiable factual inventory from raw product data.
 * The inventory forms the ONLY allowed source of truth for downstream generation and auditing.
 */

function extractProductFacts(product) {
  const input = product.input || product;
  const name = input.name || '';
  const shortName = input.product_short_name || name.split(' ')[0] || 'Product';
  const category = input.category || 'Furniture';
  const subcategory = input.subcategory || '';
  const primaryMaterial = input.primary_material || 'Solid Wood';
  const secondaryMaterial = input.secondary_material || '';
  const finish = input.color_finish || 'Natural';
  const storageType = input.storage_type || '';
  const dimensions = input.dimensions || '';
  const weight = input.weight || '';
  const warrantyMonths = input.warranty_months || 12;
  const price = input.price || null;
  const variantAxes = input.variant_axes || {};

  const fullText = `${name} ${subcategory} ${storageType} ${primaryMaterial} ${finish}`.toLowerCase();

  // Storage characteristics
  const isNonStorage =
    /non[- ]?storage/i.test(storageType) ||
    /without storage/i.test(name) ||
    (!storageType && !/storage|drawer|hydraulic|box|shelf|shelves|sliding/i.test(name));

  const isHydraulic = /hydraulic/i.test(storageType) || /hydraulic/i.test(name);
  const isBoxStorage = /box/i.test(storageType) || /box/i.test(name);
  const isDrawerStorage = /drawer/i.test(storageType) || /drawer/i.test(name);
  const isSlidingDoor = /sliding/i.test(fullText);
  const isHingedDoor = /hinged|door/i.test(fullText) && !isSlidingDoor;
  const hasMirror = /mirror/i.test(fullText);

  // Mattress features
  const isLatex = /latex/i.test(fullText);
  const isMemoryFoam = /memory|foam/i.test(fullText);
  const isCoir = /coir/i.test(fullText);
  const isSpring = /spring|pocket/i.test(fullText);

  // Size identification
  let size = '';
  if (/king/i.test(fullText)) size = 'King';
  else if (/queen/i.test(fullText)) size = 'Queen';
  else if (/single/i.test(fullText)) size = 'Single';
  else if (/double/i.test(fullText)) size = 'Double';

  // Supported features whitelist
  const supportedFeatures = [];
  if (isNonStorage) supportedFeatures.push('open base / non-storage');
  if (isHydraulic) supportedFeatures.push('hydraulic lift storage mechanism');
  if (isBoxStorage) supportedFeatures.push('under-bed box storage compartments');
  if (isDrawerStorage) supportedFeatures.push('integrated storage drawers');
  if (isSlidingDoor) supportedFeatures.push('sliding door mechanism');
  if (isHingedDoor) supportedFeatures.push('hinged wardrobe doors');
  if (hasMirror) supportedFeatures.push('integrated mirror panel');
  if (isLatex) supportedFeatures.push('natural latex cushioning core');
  if (isMemoryFoam) supportedFeatures.push('memory foam contouring layer');
  if (isCoir) supportedFeatures.push('high-density natural coir support core');
  if (isSpring) supportedFeatures.push('pocket spring or inner spring suspension');
  if (size) supportedFeatures.push(`${size.toLowerCase()} size dimensions`);
  if (secondaryMaterial) supportedFeatures.push(`secondary material: ${secondaryMaterial}`);

  return {
    productId: input.id || input.item_code || 'unknown',
    name,
    shortName,
    category,
    subcategory,
    primaryMaterial,
    secondaryMaterial,
    finish,
    storageType,
    dimensions,
    weight,
    warrantyMonths,
    price,
    variantAxes,
    size,
    isNonStorage,
    isHydraulic,
    isBoxStorage,
    isDrawerStorage,
    isSlidingDoor,
    isHingedDoor,
    hasMirror,
    isLatex,
    isMemoryFoam,
    isCoir,
    isSpring,
    supportedFeatures,
  };
}

module.exports = {
  extractProductFacts,
};
