/**
 * optimize-images.js
 * Convertit les PNG/JPEG des cartes Tore en WebP optimisé pour mobile.
 *
 * Usage : node scripts/optimize-images.js
 *
 * Résultat :
 *   - images/<famille>/<carte>.webp  (qualité 82, max 600px de large)
 *   - images/dos/<nom>.webp          (dos de cartes)
 *   - images/coin-oradia.webp        etc.
 *
 * Les fichiers PNG originaux sont conservés (fallback <img> onerror).
 * tore.html charge les WebP en priorité via <source type="image/webp">.
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────
const BASE   = path.join(__dirname, '..', 'images');
const QUALITY = 82;       // 80-85 = bon compromis qualité / taille
const MAX_W   = 600;      // largeur max en px (cartes affichées ~200-300px)

// Dossiers à traiter
const CARD_DIRS = [
  'emotions', 'archetypes', 'besoins', 'actions',
  'revelations', 'transmutations', 'memoire_cosmos', 'dos'
];

// Fichiers racine à optimiser aussi
const ROOT_FILES = [
  'coin-oradia.png',
  'coin_cercle.png',
  'coin_triangle.png',
  'plateau.jpeg',
  'logo-hd-v2.jpeg',
];

// ── Utilitaires ───────────────────────────────────────────────────────────────
let converted = 0, skipped = 0, errors = 0;
let savedBytes = 0;

async function convertFile(srcPath) {
  const ext  = path.extname(srcPath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return;

  const outPath = srcPath.replace(/\.(png|jpe?g)$/i, '.webp');

  // Skip si WebP déjà à jour (plus récent que le PNG)
  if (fs.existsSync(outPath)) {
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    const dstMtime = fs.statSync(outPath).mtimeMs;
    if (dstMtime >= srcMtime) {
      skipped++;
      return;
    }
  }

  try {
    const srcSize = fs.statSync(srcPath).size;

    await sharp(srcPath)
      .resize({ width: MAX_W, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(outPath);

    const dstSize = fs.statSync(outPath).size;
    const saved   = srcSize - dstSize;
    savedBytes   += saved;
    converted++;

    const pct = Math.round((1 - dstSize / srcSize) * 100);
    const rel = path.relative(BASE + '/..', srcPath);
    console.log(`  ✓ ${rel} — ${kb(srcSize)} → ${kb(dstSize)} (−${pct}%)`);
  } catch (err) {
    errors++;
    console.error(`  ✗ ${srcPath} : ${err.message}`);
  }
}

function kb(bytes) {
  return bytes > 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    : Math.round(bytes / 1024) + ' KB';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔄  Optimisation des images Oradia → WebP\n');

  // Dossiers cartes
  for (const dir of CARD_DIRS) {
    const dirPath = path.join(BASE, dir);
    if (!fs.existsSync(dirPath)) continue;
    console.log(`\n📁 images/${dir}/`);
    const files = fs.readdirSync(dirPath);
    for (const f of files) {
      await convertFile(path.join(dirPath, f));
    }
  }

  // Fichiers racine
  console.log('\n📁 images/ (racine)');
  for (const f of ROOT_FILES) {
    const fp = path.join(BASE, f);
    if (fs.existsSync(fp)) await convertFile(fp);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`✅  ${converted} fichiers convertis | ${skipped} déjà à jour | ${errors} erreurs`);
  console.log(`💾  Économie totale : ${kb(savedBytes)}`);
  console.log('\n⚠️  Pensez à mettre à jour les balises <img> dans tore.html');
  console.log('    pour charger les .webp en priorité (voir commentaire en bas de ce script).');
  console.log('─'.repeat(60) + '\n');
}

main().catch(console.error);

/*
  ── Comment utiliser les WebP dans tore.html ──────────────────────────────────

  Remplacer :
    <img src="images/emotions/amour.png" alt="...">

  Par :
    <picture>
      <source srcset="images/emotions/amour.webp" type="image/webp">
      <img src="images/emotions/amour.png" alt="...">
    </picture>

  OU (plus simple, déjà géré par le code JS qui construit les cartes) :
  Dans le JS, modifier imgSrc pour pointer vers le .webp :
    const imgSrc = src.replace(/\.(png|jpe?g)$/, '.webp');

  Avec un fallback onerror vers le PNG original :
    onerror="this.src=this.src.replace('.webp','.png')"
*/
