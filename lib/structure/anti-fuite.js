// lib/structure/anti-fuite.js
// Détecteur de fuite vers la tradition sous-jacente à la lecture fractale (voir
// lib/structure/derivees.js). Partagé entre scripts/test-fuites-synthese.js (test à
// froid sur 20 tirages) et le garde-fou de production (api/analyse-tirage.js, une fois
// le flux terminé) — une seule définition de ce qui constitue une fuite.
//
// Ne vérifie PAS les numéros de figure nus (ex. juste "11" ou "63") : ce sont des
// faux positifs garantis contre le format de sortie existant, qui utilise déjà des
// nombres nus légitimes ("7 jours", "14 jours", "28 jours" dans la Fenêtre
// d'observation). Seuls les mots de jargon et les noms de figure (plus spécifiques,
// moins sujets au hasard) sont vérifiés.
const { figures } = require('../../data/figures.json');

const FORBIDDEN_TERMS = [
  'yi jing', 'yi king', 'i ching', 'livre des mutations',
  'hexagramme', 'trigramme', 'nucléaire', 'king wen', 'fu xi', 'gua', 'kua',
];

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(s) {
  return stripAccents(String(s || '')).toLowerCase();
}

const FIGURE_NAMES = figures.map(f => ({ numero: f.numero, nom: f.nom, normalized: normalize(f.nom) }));

// Fenêtre de contexte autour d'un terme trouvé, pour un rapport lisible sans avoir à
// relire tout le texte généré.
function excerptAround(text, index, len, context = 60) {
  const start = Math.max(0, index - context);
  const end = Math.min(text.length, index + len + context);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

// Retourne [] si rien trouvé, sinon [{ type: 'terme'|'nom_figure', terme, numero?, excerpt }].
function detectLeaks(text) {
  const raw = String(text || '');
  const norm = normalize(raw);
  const leaks = [];

  for (const term of FORBIDDEN_TERMS) {
    let from = 0;
    let idx;
    while ((idx = norm.indexOf(term, from)) !== -1) {
      leaks.push({ type: 'terme', terme: term, excerpt: excerptAround(raw, idx, term.length) });
      from = idx + term.length;
    }
  }

  for (const fig of FIGURE_NAMES) {
    let from = 0;
    let idx;
    while ((idx = norm.indexOf(fig.normalized, from)) !== -1) {
      leaks.push({ type: 'nom_figure', terme: fig.nom, numero: fig.numero, excerpt: excerptAround(raw, idx, fig.normalized.length) });
      from = idx + fig.normalized.length;
    }
  }

  return leaks;
}

module.exports = { detectLeaks, FORBIDDEN_TERMS };
