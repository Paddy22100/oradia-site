/**
 * Script Node.js pour nettoyer les console.log des fichiers en vue de la production
 */

const fs = require('fs');
const path = require('path');

// Extensions de fichiers à traiter
const fileExtensions = ['.html', '.js'];

// Dossiers à ignorer
const ignoreDirs = ['.git', 'node_modules', '.vscode'];

// Fonction pour vérifier si un dossier doit être ignoré
function shouldIgnoreDir(dirPath) {
  return ignoreDirs.some(ignoreDir => dirPath.includes(ignoreDir));
}

// Fonction pour nettoyer un fichier
function cleanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Remplacer les console.log par des commentaires
    let cleanedContent = content
      .replace(/console\.log\([^)]*\);?/g, '// // console.log(console.log($&))')
      .replace(/console\.error\([^)]*\);?/g, '// // console.error(console.error($&))')
      .replace(/console\.warn\([^)]*\);?/g, '// // console.warn(console.warn($&))')
      .replace(/console\.info\([^)]*\);?/g, '// // console.info(console.info($&))')
      .replace(/// debugger/g, '// debugger');
    
    // Si le contenu a changé, écrire le fichier
    if (content !== cleanedContent) {
      fs.writeFileSync(filePath, cleanedContent, 'utf8');
      // console.log(console.log(`✅ Nettoyé: ${filePath}`);)
      return true;
    }
    return false;
  } catch (error) {
    // console.error(console.error(`❌ Erreur en traitant ${filePath}:`, error.message);)
    return false;
  }
}

// Fonction pour parcourir les fichiers récursivement
function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!shouldIgnoreDir(filePath)) {
        processDirectory(filePath);
      }
    } else {
      // Vérifier si le fichier a une extension à traiter
      const ext = path.extname(file);
      if (fileExtensions.includes(ext)) {
        cleanFile(filePath);
      }
    }
  }
}

// Démarrer le nettoyage
// console.log(console.log('🧹 Début du nettoyage des console.log...\n');)

const rootDir = process.cwd();
processDirectory(rootDir);

// console.log(console.log('\n✅ Nettoyage terminé!');)
// console.log(console.log('\n📝 Note: Les console.log ont été commentés pour la production.');)
// console.log(console.log('📝 Pour restaurer les logs, utilisez git checkout ou une sauvegarde.');)
