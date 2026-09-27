// lib/tore-card-slug.js
// Slug et casse d'affichage d'un nom de carte du deck (data/tore-deck.json),
// partagés entre scripts/generate-card-pages.js et scripts/generate-cartes-index.js.

function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "LE TORE" -> "Le Tore", "L'ALCHIMISTE" -> "L'Alchimiste" (capitalise après
// espace, apostrophe ou tiret, contrairement à un simple charAt(0)+toLowerCase
// qui casse les noms à plusieurs mots).
function titleCase(name) {
  return String(name).toLowerCase()
    .replace(/(^|[\s'\-])([a-zà-öø-ÿ])/g, (m, sep, c) => sep + c.toUpperCase());
}

module.exports = { slugify, titleCase };
