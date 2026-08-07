// lib/tore-analysis-prompt.js
// Construit le prompt d'analyse IA du Tore et découpe la réponse en sections
// (cartes / pistes à explorer / synthèse). Utilisé par api/analyse-tirage.js
// (tirage manuel, via fetch côté client) et par le runner des tirages
// programmés (api/tirages/send-email.js?action=run-scheduled-draws), pour que
// les deux flux produisent exactement le même type d'analyse.
const { FAMILY_LABELS } = require('./tore-deck.js');

function buildAnalysisPrompt({ intention, cards, gender }) {
  const cardsDescription = cards.map((c, i) => {
    const bridge = c.bridgeCard ? ` (passerelle: ${c.bridgeCard.name})` : '';
    const polarity = c.polarity ? ` [${c.polarity}]` : '';
    const famLabel = FAMILY_LABELS[c.family] || c.family;
    return `${i + 1}. Famille ${famLabel}: ${c.name}${polarity}${bridge}`;
  }).join('\n');

  const genderInstruction = gender === 'homme'
    ? "L'utilisateur est un homme. Accorde les adjectifs et participes passés au masculin quand tu t'adresses à lui directement."
    : gender === 'femme'
    ? "L'utilisateur est une femme. Accorde les adjectifs et participes passés au féminin quand tu t'adresses à elle directement."
    : "Ne fais pas d'accord genré — utilise des formulations neutres ou épicènes.";

  return `Tu es l'Oracle Oradia, un guide introspectif bienveillant.

${genderInstruction}

INTENTION DE L'UTILISATEUR : "${intention || 'question personnelle'}"

CARTES TIRÉES :
${cardsDescription}

Rédige une analyse en 3 sections, avec ce ton : chaleureux, précis, jamais générique.

IMPORTANT : Style d'écriture
- N'utilise JAMAIS de tirets (—) ou de points (•) dans ton texte
- Écris en phrases complètes et fluides
- Pas de listes à puces, pas de tirets narratifs
- Style narratif continu et élégant

## Ce que disent vos cartes
En 4-5 phrases maximum, raconte ce que ces cartes révèlent ensemble pour cette intention spécifique.
Sois concret : nomme les cartes, évoque leurs énergies, montre la connexion entre elles.
Pas de généralités. Un seul utilisateur, une seule situation.

## Ce que cela vous invite à explorer
En 3-4 phrases, quelles pistes concrètes ouvertes par ce tirage ?
Corps, relations, décisions, timing, ce qui demande attention — en lien direct avec les cartes.

## Synthèse
Un paragraphe court (3-4 phrases) qui noue le tout avec une phrase de fermeture porteuse.

Contraintes : pas de tiret long (—), langage bienveillant, ne jamais promettre de résultats garantis.`;
}

// Nettoyage post-API identique à analyse-tirage.js (tirets/points narratifs).
function cleanAnalysisText(text) {
  return String(text || '')
    .replace(/—/g, '')
    .replace(/–/g, '-')
    .replace(/•/g, '')
    .replace(/\s*—\s*/g, ' ')
    .replace(/\s*•\s*/g, ' ')
    .replace(/\n\s*—\s*/g, '\n')
    .replace(/\n\s*•\s*/g, '\n')
    .trim();
}

// Découpe le texte généré par l'IA en { cards, explore, synthesis } à partir
// des titres "## ...". Même logique que splitAISections() dans tore-analysis.html.
function splitAnalysisSections(fullText) {
  const result = { cards: '', explore: '', synthesis: '' };
  const normalized = fullText || '';
  const matches = [...normalized.matchAll(/^##\s+(.+)$/gmi)];
  if (!matches.length) { result.cards = normalized.trim(); return result; }

  matches.forEach((match, index) => {
    const title = match[1].trim().toLowerCase();
    const start = match.index + match[0].length;
    const end = matches[index + 1] ? matches[index + 1].index : normalized.length;
    const content = normalized.slice(start, end).trim();
    if (title.includes('cartes')) result.cards = content;
    if (title.includes('explorer')) result.explore = content;
    if (title.includes('synthèse')) result.synthesis = content;
  });

  return result;
}

module.exports = { buildAnalysisPrompt, cleanAnalysisText, splitAnalysisSections };
