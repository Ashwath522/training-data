'use strict';

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../../../../data/trainingSet/_generation_memory');

function ensureDirExists() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function sanitizeCategoryKey(catName) {
  return String(catName || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getMemoryFilePath(catName) {
  ensureDirExists();
  return path.join(MEMORY_DIR, `${sanitizeCategoryKey(catName)}.json`);
}

function getCategoryMemory(catName) {
  const fp = getMemoryFilePath(catName);
  if (!fs.existsSync(fp)) {
    return {
      category: catName,
      items: [],
      angleCounts: {},
      structureCounts: {},
      updated_at: new Date().toISOString(),
    };
  }
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return {
      category: catName,
      items: [],
      angleCounts: {},
      structureCounts: {},
      updated_at: new Date().toISOString(),
    };
  }
}

function saveCategoryMemory(catName, mem) {
  const fp = getMemoryFilePath(catName);
  ensureDirExists();
  mem.updated_at = new Date().toISOString();
  fs.writeFileSync(fp, JSON.stringify(mem, null, 2), 'utf-8');
}

function recordAcceptedItem(catName, itemData) {
  const mem = getCategoryMemory(catName);

  // Avoid duplicates in memory if rerunning
  const existingIdx = mem.items.findIndex((i) => i.id === itemData.id);
  if (existingIdx >= 0) {
    mem.items[existingIdx] = itemData;
  } else {
    mem.items.push(itemData);
  }

  // Recalculate usage statistics
  mem.angleCounts = {};
  mem.structureCounts = {};
  for (const it of mem.items) {
    if (it.angle) {
      mem.angleCounts[it.angle] = (mem.angleCounts[it.angle] || 0) + 1;
    }
    if (it.structure) {
      mem.structureCounts[it.structure] = (mem.structureCounts[it.structure] || 0) + 1;
    }
  }

  saveCategoryMemory(catName, mem);
}

/**
 * Returns candidate angles sorted by lowest usage frequency in this category.
 */
function rankAnglesByUsage(catName, validCandidateAngles = []) {
  const mem = getCategoryMemory(catName);
  return [...validCandidateAngles].sort((a, b) => {
    const countA = mem.angleCounts[a.id || a] || 0;
    const countB = mem.angleCounts[b.id || b] || 0;
    return countA - countB;
  });
}

/**
 * Returns candidate structures sorted by lowest usage frequency in this category.
 */
function rankStructuresByUsage(catName, candidateStructures = []) {
  const mem = getCategoryMemory(catName);
  return [...candidateStructures].sort((a, b) => {
    const countA = mem.structureCounts[a.id || a] || 0;
    const countB = mem.structureCounts[b.id || b] || 0;
    return countA - countB;
  });
}

function clearAllMemory() {
  ensureDirExists();
  const files = fs.readdirSync(MEMORY_DIR);
  for (const f of files) {
    if (f.endsWith('.json')) {
      fs.unlinkSync(path.join(MEMORY_DIR, f));
    }
  }
}

module.exports = {
  getCategoryMemory,
  recordAcceptedItem,
  rankAnglesByUsage,
  rankStructuresByUsage,
  clearAllMemory,
  getMemoryFilePath,
};
