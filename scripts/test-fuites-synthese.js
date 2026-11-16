#!/usr/bin/env node
// scripts/test-fuites-synthese.js
// Étape 4 de la lecture fractale (CLAUDE.md / mission "lecture fractale") : simule 20
// tirages variés et appelle la VRAIE route de synthèse (api/analyse-tirage.js), puis
// vérifie que le texte généré par l'IA ne laisse fuiter aucun terme réservé ni aucun
// nom de figure (lib/structure/anti-fuite.js).
//
// Appel réel à l'API Anthropic (coût réel, minime — 20 appels claude-haiku-4-5).
// S'authentifie auprès de la route via TEST_FUITES_SECRET (même mécanisme que
// MAKE_ASTRO_INGEST_SECRET) pour ne pas consommer le quota des visiteurs anonymes ni
// risquer de déclencher l'alerte de plafond global.
//
// Usage :
//   TEST_FUITES_SECRET=... TEST_FUITES_TARGET_URL=https://oradia.fr node scripts/test-fuites-synthese.js
// TEST_FUITES_TARGET_URL par défaut : https://oradia.fr (voir audit/audit-oradia.js
// pour la même convention AUDIT_TARGET_URL).

const TARGET_URL = process.env.TEST_FUITES_TARGET_URL || 'https://oradia.fr';
const SECRET = process.env.TEST_FUITES_SECRET;

const { detectLeaks } = require('../lib/structure/anti-fuite.js');
const deck = require('../data/tore-deck.json');
const { LINE_ORDER } = require('../lib/structure/derivees.js');

function pickCard(family, polarity) {
  const pool = deck[family] || [];
  const matching = polarity ? pool.filter(c => c.polarity === polarity) : pool;
  const usable = matching.length ? matching : pool;
  if (!usable.length) throw new Error(`Famille "${family}" introuvable dans data/tore-deck.json`);
  // Déterministe (pas de hasard) : premier résultat, pour un rapport reproductible.
  return usable[0];
}

// binaire : chaîne de 6 '0'/'1' (ligne1=bas...ligne6=haut, voir lib/structure/derivees.js).
// mutantPositions : lignes (1-indexées) où une carte passerelle doit être attachée.
function buildCards(binaire, mutantPositions = []) {
  const cards = LINE_ORDER.map((fam, i) => {
    const polarity = binaire[i] === '1' ? 'yang' : 'yin';
    const card = pickCard(fam, polarity);
    const out = { family: fam, name: card.name, quote: card.quote, polarity };
    if (mutantPositions.includes(i + 1)) {
      const bridge = pickCard('actions', null);
      out.bridgeCard = { family: 'actions', name: bridge.name, quote: bridge.quote, polarity: bridge.polarity };
    }
    return out;
  });
  const cosmos = pickCard('memoire_cosmos', null);
  cards.push({ family: 'memoire_cosmos', name: cosmos.name, quote: cosmos.quote, polarity: null });
  return cards;
}

// 20 cas : les 8 figures symétriques, les figures 1/2/11/12/63/64 (cas structurants déjà
// couverts par les tests unitaires, revérifiés ici en conditions réelles), et des
// combinaisons variées de lignes mutantes (0, 1, 2, 3 et 6 lignes) sur d'autres figures.
const CASES = [
  { label: 'Figure 1 (symétrique), sans mutation', binaire: '111111', mutants: [] },
  { label: 'Figure 2 (symétrique), sans mutation', binaire: '000000', mutants: [] },
  { label: 'Figure 27 (symétrique), sans mutation', binaire: '100001', mutants: [] },
  { label: 'Figure 28 (symétrique), sans mutation', binaire: '011110', mutants: [] },
  { label: 'Figure 29 (symétrique), sans mutation', binaire: '010010', mutants: [] },
  { label: 'Figure 30 (symétrique), sans mutation', binaire: '101101', mutants: [] },
  { label: 'Figure 61 (symétrique), sans mutation', binaire: '110011', mutants: [] },
  { label: 'Figure 62 (symétrique), sans mutation', binaire: '001100', mutants: [] },
  { label: 'Figure 11, sans mutation', binaire: '111000', mutants: [] },
  { label: 'Figure 12, sans mutation', binaire: '000111', mutants: [] },
  { label: 'Figure 63 (nucléaire=opposée=retournée=64), sans mutation', binaire: '101010', mutants: [] },
  { label: 'Figure 64 (nucléaire=opposée=retournée=63), sans mutation', binaire: '010101', mutants: [] },
  { label: 'Figure 1, une ligne mutante (Émotions)', binaire: '111111', mutants: [1] },
  { label: 'Figure 54, deux lignes mutantes', binaire: '110100', mutants: [2, 5] },
  { label: 'Figure 20, trois lignes mutantes', binaire: '000011', mutants: [1, 3, 6] },
  { label: 'Figure 45, six lignes mutantes (cas extrême)', binaire: '000110', mutants: [1, 2, 3, 4, 5, 6] },
  { label: 'Figure 7, une ligne mutante (Actions)', binaire: '010000', mutants: [6] },
  { label: 'Figure 37, deux lignes mutantes', binaire: '101011', mutants: [3, 4] },
  { label: 'Figure 50, sans mutation', binaire: '011101', mutants: [] },
  { label: 'Figure 42, quatre lignes mutantes', binaire: '100011', mutants: [1, 2, 4, 5] },
];

const INTENTIONS = [
  'Dois-je changer de travail ?',
  'Comment avancer dans ma relation en ce moment ?',
  "Qu'est-ce qui bloque mon projet personnel ?",
  'Quelle direction prendre pour ma santé et mon équilibre ?',
];

async function callAnalyse(cards, intention) {
  const res = await fetch(`${TARGET_URL}/api/analyse-tirage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SECRET ? { 'X-Internal-Test-Secret': SECRET } : {}),
    },
    body: JSON.stringify({ intention, cards, lang: 'fr', stream: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(`HTTP ${res.status} : ${data.error || data.message || 'réponse invalide'}`);
  }
  return data.analysis;
}

async function main() {
  if (!SECRET) {
    console.warn('⚠️  TEST_FUITES_SECRET non défini : les appels seront comptés dans le quota des visiteurs anonymes de cette IP (risque de blocage après 10 appels). Définis TEST_FUITES_SECRET (même valeur que la variable Vercel) pour l\'éviter.\n');
  }

  console.log(`Cible : ${TARGET_URL}/api/analyse-tirage`);
  console.log(`${CASES.length} tirages simulés...\n`);

  let totalLeaks = 0;
  const flagged = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const intention = INTENTIONS[i % INTENTIONS.length];
    const cards = buildCards(c.binaire, c.mutants);
    process.stdout.write(`[${i + 1}/${CASES.length}] ${c.label}... `);
    try {
      const analysis = await callAnalyse(cards, intention);
      const leaks = detectLeaks(analysis);
      if (leaks.length === 0) {
        console.log('OK');
      } else {
        console.log(`⚠️  ${leaks.length} fuite(s)`);
        totalLeaks += leaks.length;
        flagged.push({ case: c.label, leaks, analysis });
      }
    } catch (e) {
      console.log(`ERREUR (${e.message})`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  if (totalLeaks === 0) {
    console.log(`✅ Aucune fuite détectée sur ${CASES.length} tirages.`);
  } else {
    console.log(`🔴 ${totalLeaks} fuite(s) détectée(s) sur ${flagged.length} tirage(s) :\n`);
    for (const f of flagged) {
      console.log(`— ${f.case}`);
      for (const l of f.leaks) {
        console.log(`    [${l.type}] "${l.terme}"${l.numero ? ` (figure ${l.numero})` : ''} → ${l.excerpt}`);
      }
      console.log('');
    }
  }
  process.exit(totalLeaks === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('Échec du script :', e.message);
  process.exit(2);
});
