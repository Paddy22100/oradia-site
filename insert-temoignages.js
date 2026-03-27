// Script pour insérer les témoignages dans index.html
const fs = require('fs');

// Lire les fichiers
const indexPath = 'd:\\Ma quête de sens\\Mes projets et pistes\\Oradia\\Oracle Oradia\\SiteOradia\\oradia-site-Travail\\index.html';
const temoignagesPath = 'd:\\Ma quête de sens\\Mes projets et pistes\\Oradia\\Oracle Oradia\\SiteOradia\\oradia-site-Travail\\temoignages.html';

try {
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    const temoignagesContent = fs.readFileSync(temoignagesPath, 'utf8');
    
    // Remplacer la section
    const oldPattern = /<\/section>\s+\s+\s+\s+<!-- Section Réservation -->/;
    const newContent = indexContent.replace(oldPattern, `</section>

  <!-- Témoignages -->
${temoignagesContent}

  <!-- Section Réservation -->`);
    
    // Écrire le fichier modifié
    fs.writeFileSync(indexPath, newContent, 'utf8');
    
    console.log('✅ Section témoignages insérée avec succès !');
    console.log('📍 Vérifiez le fichier index.html');
    
} catch (error) {
    console.error('❌ Erreur:', error.message);
}
