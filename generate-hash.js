/**
 * Script pour générer un hash bcrypt
 * Usage: node generate-hash.js VOTRE_MOT_DE_PASSE
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
    console.log('❌ Usage: node generate-hash.js VOTRE_MOT_DE_PASSE');
    process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\n✅ Hash généré:');
console.log(hash);
console.log('\n📋 Copie ce hash dans Vercel (ADMIN_PASSWORD_HASH)');
