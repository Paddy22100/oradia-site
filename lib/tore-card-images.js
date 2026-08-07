// lib/tore-card-images.js
// Résout le chemin d'image d'une carte à partir de son nom, via le manifeste
// public/images/cartes-manifest.json (même normalisation que le hover-preview
// de l'historique des tirages, member/tirages.html).
const fs = require('fs');
const path = require('path');

let cachedMap = null;

function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function loadManifest() {
  if (cachedMap) return cachedMap;
  cachedMap = {};
  try {
    const manifestPath = path.join(process.cwd(), 'images', 'cartes-manifest.json');
    const list = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    list.forEach(item => {
      const baseName = (item.name || '').replace(/\s*\([^)]*\)\s*$/, '');
      cachedMap[normalize(baseName)] = item.path;
    });
  } catch (e) {
    console.error('[tore-card-images] manifest introuvable:', e.message);
  }
  return cachedMap;
}

// Retourne l'URL absolue (https://oradia.fr/images/...) de l'image d'une carte
// à partir de son nom (ex: "JOIE" -> images/emotions/joie.webp).
function resolveCardImageUrl(cardName) {
  const map = loadManifest();
  const relPath = map[normalize(cardName)];
  if (!relPath) return null;
  return `https://oradia.fr${relPath}`;
}

module.exports = { resolveCardImageUrl };
