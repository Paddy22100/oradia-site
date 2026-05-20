// api/admin/newsletter-generate.js
// Génère une newsletter via l'API Claude à partir des livres et d'une intention

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Extraits de référence des deux livres — enrichis au fil du temps
const LIVRE_BOUSSOLE = `
LIVRE 1 — "La Boussole Intérieure" (essai)
Thèmes : Âme / Esprit / Corps / Conscience, PNEI, mémoire implicite, trauma, fascias,
fenêtre de tolérance, vulnérabilité, HPI/Sentinelle, partition de famille, transgénérationnel.

Métaphore centrale : Le poste de radio. L'Âme émet, l'Esprit reçoit et filtre, le Corps retransmet,
la Conscience observe et peut ajuster.

Concepts clés :
- Le dragon (l'Esprit non accordé) vs l'archange (la Conscience qui le remet à sa place)
- La mémoire implicite n'a pas de date : elle vit au présent comme si le danger était encore là
- La vulnérabilité n'est pas une faiblesse — c'est le sol meuble où les racines s'ancrent
- La fenêtre de tolérance (Dan Siegel) : ni trop activé, ni trop éteint — c'est là que la guérison est possible
- L'oracle crée une brèche synaptique : il hack le système de sécurité de l'Esprit
- Le canal direct : l'Âme communique au Corps via les fascias, sans passer par l'Esprit
- L'adaptome : ensemble des stratégies adaptatives construites face à un environnement inadéquat,
  encodées en mémoire implicite, qui tournent en arrière-plan même quand la menace a disparu.
  S'apprivoise (comme le renard du Petit Prince), ne se supprime pas.

Questions à tenir (fins de chapitres) :
- Quand avez-vous senti pour la dernière fois que votre Corps savait quelque chose que votre Esprit refusait d'entendre ?
- Dans quelle situation laissez-vous le dragon parler à votre place ?
- Quelle tension dans votre Corps porte peut-être une information que votre Esprit n'a pas encore formulée ?
- Qu'est-ce que votre Corps porte peut-être que vous n'avez pas choisi de porter ?
- Quelle musique joue votre famille depuis des générations ?
- Si votre câblage particulier était une ressource et non un défaut, à quoi ressemblerait votre vie ?
`;

const LIVRE_ROMAN = `
LIVRE 2 — Roman initiatique (Le Pèlerin)
Thèmes : biomimétisme, lois du Vivant, modèle RLC (Résistance / Inductance / Capacité),
résonance, synchronicité, écologie intérieure, polarité, choc vivant.

Figures rencontrées par le pèlerin :
- Le Vieux Chêne : "Je ne tiens pas : je me tiens." — La résistance juste n'est pas rigidité,
  c'est la forme qu'on donne au passage de la force. Trop rigide : tu casses. Trop souple : tu t'arraches.
- La Fileuse des Spires : l'inductance, la mémoire lente du vivant, la continuité des flux.
  "On ne dérange que ce qui est instable."
- L'Homme de la Grange : le potentiel en réserve, la capacité à accumuler avant d'agir.
- Le Musicien des Vibrations : la note juste, la résonance, trouver sa fréquence propre.
- La Maîtresse des Cycles : les saisons intérieures, le temps qui respire, Chronos vs Kairos.
- Le Voyageur des Polarités : la tension créatrice, Yin/Yang, deux forces opposées créent une tension, trois créent une structure.
- Le Guérisseur du Choc : le choc n'est pas une anomalie — c'est un mécanisme du vivant.
  "Le choc détruit seulement ce qui devait mourir. Il réveille ce qui voulait vivre."

Phrase centrale du prologue : "Le vivant ne supporte pas longtemps de ne pas être ce qu'il est."
`;

const ORACLE_BRIDGE = `
LA BOUSSOLE INTÉRIEURE (oracle) :
Système de 64 cartes combinant Yi Jing, Human Design et cosmologie vivante.
Familles de cartes : Émotions, Besoins, Transmutation, Actions.
L'oracle crée une brèche dans les défenses de l'Esprit pour permettre au signal de l'Âme d'atteindre la Conscience.
Chaque tirage est une invitation à s'entendre soi-même plutôt qu'une réponse toute faite.
En précommande sur oradia.fr
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const {
    intention,       // mot-clé, thème, ou fragment libre
    source,          // 'boussole' | 'roman' | 'les_deux'
    ton,             // 'poetique' | 'scientifique' | 'narratif' | 'contemplatif'
    energie,         // optionnel : énergie du moment, saison, hexagramme...
    idees_bonus      // optionnel : fragments du carnet d'idées à intégrer
  } = req.body;

  if (!intention) {
    return res.status(400).json({ error: 'Une intention est requise' });
  }

  const sourceTexte = source === 'roman'
    ? LIVRE_ROMAN
    : source === 'boussole'
      ? LIVRE_BOUSSOLE
      : `${LIVRE_BOUSSOLE}\n\n${LIVRE_ROMAN}`;

  const prompt = `Tu es le porte-voix de Rudy Boucheron, auteur, thérapeute et stratège basé en Bretagne.
Tu écris une newsletter hebdomadaire pour les abonnés d'Oradia, son site dédié à La Boussole Intérieure.

VOIX : directe, poétique sans être mièvre, ancrée dans le corps et le vivant. Ni guru, ni coach.
Quelqu'un qui pense à voix haute et invite à penser. Style breton : sobre, profond, pas de fioriture.
Ton ${ton || 'contemplatif et incarné'}.

SOURCES À TA DISPOSITION :
${sourceTexte}

${energie ? `ÉNERGIE DU MOMENT : ${energie}` : ''}
${idees_bonus ? `FRAGMENTS DU CARNET D'IDÉES À INTÉGRER : ${idees_bonus}` : ''}

INTENTION DE CETTE NEWSLETTER : ${intention}

STRUCTURE OBLIGATOIRE (respecte-la précisément) :
1. OBJET : Une phrase d'accroche email (max 60 caractères, pas de question, pas de cliché)
2. ACCROCHE : 2-3 lignes narratives ou poétiques qui ouvrent l'espace (pas de "Bonjour" générique)
3. RÉFLEXION : Le cœur — une idée tirée des livres, développée en 150-200 mots. Concret, incarné, pas abstrait.
4. PRISE DE CONSCIENCE : Une phrase courte, percutante, à méditer. Format : italique suggéré.
5. QUESTION À TENIR : Une seule question, dans la tradition du livre. Pas de réponse. Juste l'espace.
6. PONT ORACLE : 3-4 lignes naturelles qui relient la réflexion à La Boussole Intérieure.
   Pas de vente forcée. Une invitation sincère. Termine par : "→ oradia.fr"
7. SIGNATURE : Courte, dans la voix de Rudy. Max 2 lignes.

Génère la newsletter complète maintenant. Chaque section clairement délimitée par son titre en majuscules.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0].text;
    return res.status(200).json({ content, usage: message.usage });
  } catch (error) {
    console.error('Erreur Claude API:', error);
    return res.status(500).json({ error: 'Erreur lors de la génération', details: error.message });
  }
}
