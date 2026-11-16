// lib/structure/concordance-tirage.js
// Orchestration : à partir d'un tirage (sous l'une des deux formes existantes dans
// le code — cartes déjà en objets {family,name,polarity,quote,bridgeCard?} pour un
// tirage programmé, ou {cartes: string[], passerelles} pour un tirage manuel déjà
// enregistré), calcule la structure Yi King et la fait évaluer par le modèle face
// au texte réellement reçu. Ne lève jamais : un cas non calculable (tirage
// incomplet, carte introuvable, modèle indisponible) renvoie simplement null.
const { structureFromCards } = require('./derivees.js');
const { reconstruireCartesDepuisTirage } = require('./cartes-tirage.js');
const { evaluerConcordance } = require('./concordance-prompt.js');

async function calculerConcordanceTirage({ cards, cartes, passerelles, intention, synthese, analyseIA, userEmail }) {
  let cartesDetail = cards;
  if (!cartesDetail) {
    const { cards: reconstructed, incomplete } = reconstruireCartesDepuisTirage({ cartes, passerelles });
    if (incomplete.length) return null;
    cartesDetail = reconstructed;
  }

  const structure = structureFromCards(cartesDetail);
  if (!structure) return null;
  if (!synthese && !analyseIA) return null;

  const concordance = await evaluerConcordance({ intention, cartesDetail, synthese, analyseIA, structure, userEmail });
  if (!concordance) return null;

  return {
    concordance,
    structure: {
      principale: structure.principale,
      nucleaire: structure.nucleaire,
      opposee: structure.opposee,
      retournee: structure.retournee,
      devenir: structure.devenir,
      lignesMutantes: structure.lignesMutantes
    }
  };
}

module.exports = { calculerConcordanceTirage };
