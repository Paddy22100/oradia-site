const fs = require('fs');
const path = require('path');

// Lire le fichier tore.html pour extraire window.DATA
const toreHtml = fs.readFileSync('tore.html', 'utf8');

// Extraire window.DATA
const dataMatch = toreHtml.match(/window\.DATA\s*=\s*({[\s\S]*?});/);
if (!dataMatch) {
  console.error('❌ Impossible de trouver window.DATA');
  process.exit(1);
}

const dataStr = dataMatch[1];
const DATA = eval(`(${dataStr})`);

// Fonction pour lister les fichiers PNG dans un dossier
function listPngFiles(folder) {
  const folderPath = path.join('images', folder);
  if (!fs.existsSync(folderPath)) {
    return [];
  }
  return fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.png') && !f.startsWith('dos_'))
    .map(f => f.replace('.png', ''));
}

// Fonction pour slugifier un nom (comme dans le code)
function slugifyName(name) {
  return (name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

console.log('\n📊 VÉRIFICATION COMPLÈTE DES CARTES ORADIA\n');
console.log('='.repeat(60));

const families = {
  emotions: 'emotions',
  besoins: 'besoins',
  transmutation: 'transmutations',
  actions: 'actions',
  archetypes: 'archetypes',
  revelations: 'revelations',
  memoire_cosmos: 'memoire_cosmos'
};

let totalCardsData = 0;
let totalImagesFiles = 0;
let errors = [];

Object.entries(families).forEach(([key, folder]) => {
  console.log(`\n📁 Famille: ${key.toUpperCase()}`);
  console.log('-'.repeat(60));
  
  const cardsData = DATA[key] || [];
  const imageFiles = listPngFiles(folder);
  
  totalCardsData += cardsData.length;
  totalImagesFiles += imageFiles.length;
  
  console.log(`   Cartes dans DATA: ${cardsData.length}`);
  console.log(`   Images dans dossier: ${imageFiles.length}`);
  
  // Créer un Set des slugs d'images
  const imageSet = new Set(imageFiles);
  
  // Vérifier chaque carte
  const cardSlugs = cardsData.map(card => slugifyName(card.name));
  const missingImages = [];
  const extraImages = new Set(imageFiles);
  
  cardSlugs.forEach((slug, idx) => {
    const cardName = cardsData[idx].name;
    if (!imageSet.has(slug)) {
      missingImages.push(`${cardName} (${slug}.png)`);
      errors.push(`❌ ${key}: Image manquante pour "${cardName}" (${slug}.png)`);
    } else {
      extraImages.delete(slug);
    }
  });
  
  if (missingImages.length > 0) {
    console.log(`\n   ⚠️  Images manquantes:`);
    missingImages.forEach(img => console.log(`      - ${img}`));
  }
  
  if (extraImages.size > 0) {
    console.log(`\n   ⚠️  Images sans carte correspondante:`);
    extraImages.forEach(img => {
      console.log(`      - ${img}.png`);
      errors.push(`❌ ${key}: Image "${img}.png" sans carte correspondante`);
    });
  }
  
  if (missingImages.length === 0 && extraImages.size === 0) {
    console.log(`   ✅ Parfait! Toutes les cartes ont leur image`);
  }
  
  // Afficher les cartes
  console.log(`\n   Cartes:`);
  cardsData.forEach((card, idx) => {
    const slug = slugifyName(card.name);
    const hasImage = imageSet.has(slug);
    const icon = hasImage ? '✅' : '❌';
    console.log(`      ${icon} ${idx + 1}. ${card.name} (${slug}.png)`);
  });
});

console.log('\n' + '='.repeat(60));
console.log(`\n📊 RÉSUMÉ GLOBAL\n`);
console.log(`   Total cartes dans DATA: ${totalCardsData}`);
console.log(`   Total images PNG: ${totalImagesFiles}`);
console.log(`   Objectif: 118 cartes (64 + 54)`);

if (errors.length > 0) {
  console.log(`\n❌ ERREURS DÉTECTÉES (${errors.length}):\n`);
  errors.forEach(err => console.log(`   ${err}`));
} else {
  console.log(`\n✅ AUCUNE ERREUR! Toutes les cartes correspondent aux images.`);
}

console.log('\n' + '='.repeat(60));
