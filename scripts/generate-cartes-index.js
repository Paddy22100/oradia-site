// scripts/generate-cartes-index.js
// Génère cartes.html : la page d'index qui liste les 118 cartes du deck
// (data/tore-deck.json), groupées par famille, chacune reliée vers sa page
// dédiée (cartes/<slug>.html). Usage : node scripts/generate-cartes-index.js
//
// Ne montre AUCUN visuel de carte individuelle (même logique que les pages
// carte elles-mêmes, voir js/card-image-gate.js) : seule la vignette de dos
// générique de la famille (images/dos/dos_*.webp, identique pour toutes les
// cartes de cette famille et déjà visible publiquement dans le tirage avant
// retournement) illustre chaque section.

const fs = require('fs');
const path = require('path');
const deck = require('../data/tore-deck.json');
const { slugify, titleCase } = require('../lib/tore-card-slug.js');

const FAMILIES = [
  { key: 'emotions', label: 'Émotions', back: 'dos_emotion.webp',
    desc: "Les ressentis vécus dans l'instant du tirage, réunis en 9 paires miroirs." },
  { key: 'besoins', label: 'Besoins', back: 'dos_besoin.webp',
    desc: "Ce qui, une fois nommé, éclaire ce qui manque ou ce qui est déjà comblé." },
  { key: 'transmutation', label: 'Transmutation', back: 'dos_transmutation.webp',
    desc: "Les mouvements de passage, d'une posture intérieure à une autre." },
  { key: 'archetypes', label: 'Archétypes', back: 'dos_archetype.webp',
    desc: "Des figures intérieures récurrentes qui prêtent leur regard au tirage." },
  { key: 'revelations', label: 'Révélations', back: 'dos_revelation.webp',
    desc: "Des indices, des signes ou des vérités qui affleurent à la surface." },
  { key: 'actions', label: 'Actions', back: 'dos_action.webp',
    desc: "Les gestes concrets qu'une situation appelle, ou ceux qu'il vaut mieux suspendre." },
  { key: 'memoire_cosmos', label: 'Mémoire Cosmos', back: 'dos_memoire_cosmos.webp',
    desc: "Dix cartes sans miroir, qui élargissent la focale : temps, mémoire, cycles." }
];

function cardListHtml(familyKey) {
  const cards = deck[familyKey].slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return cards.map(card => {
    const slug = slugify(card.name);
    const display = titleCase(card.name);
    return `        <a href="/cartes/${slug}.html" class="card-pill">${display}</a>`;
  }).join('\n');
}

const familySections = FAMILIES.map(fam => `
    <section class="family-section">
      <div class="family-head">
        <img src="/images/dos/${fam.back}" alt="Dos de carte, famille ${fam.label}, Oracle Oradia" class="family-back" loading="lazy">
        <div>
          <h2>${fam.label}</h2>
          <p class="family-desc">${fam.desc}</p>
        </div>
      </div>
      <div class="card-grid">
${cardListHtml(fam.key)}
      </div>
    </section>`).join('\n');

const totalCards = Object.values(deck).reduce((sum, arr) => sum + arr.length, 0);

const itemListEntries = FAMILIES.flatMap(fam =>
  deck[fam.key].map(card => `https://oradia.fr/cartes/${slugify(card.name)}.html`)
);

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Les ${totalCards} cartes de l'Oracle Oradia</title>
  <meta name="description" content="Explorez les ${totalCards} cartes de l'Oracle Oradia, réparties en 7 familles (Émotions, Besoins, Transmutation, Archétypes, Révélations, Actions, Mémoire Cosmos). Le sens de chaque carte, une par une.">
  <link rel="canonical" href="https://oradia.fr/cartes.html">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://oradia.fr/cartes.html">
  <meta property="og:title" content="Les ${totalCards} cartes de l'Oracle Oradia">
  <meta property="og:description" content="Explorez les ${totalCards} cartes de l'Oracle Oradia, réparties en 7 familles.">
  <meta property="og:image" content="https://oradia.fr/images/medias/apercu_stripe.jpg">
  <meta property="og:site_name" content="Oradia">
  <meta property="og:locale" content="fr_FR">
  <meta name="author" content="Rudy Boucheron">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Les ${totalCards} cartes de l'Oracle Oradia",
    "url": "https://oradia.fr/cartes.html",
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": ${JSON.stringify(itemListEntries.map((url, i) => ({ '@type': 'ListItem', position: i + 1, url })))}
    }
  }
  <\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: linear-gradient(rgba(10,25,47,0.82), rgba(10,25,47,0.92)), url('/images/oradia-hero-4k.webp') center top / cover no-repeat fixed, #0a192f; color: #c8c0a8; font-family: 'Lora', Georgia, serif; min-height: 100vh; }
    a { color: inherit; text-decoration: none; }
    main { max-width: 880px; margin: 0 auto; padding: 48px 24px 96px; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(212,175,55,0.5); margin-bottom: 32px; transition: color 0.2s; letter-spacing: 0.05em; }
    .back-link:hover { color: #d4af37; }
    h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: clamp(30px, 5vw, 42px); font-weight: 400; color: #f0c75e; line-height: 1.2; margin-bottom: 18px; text-align: center; }
    .intro { font-size: 15.5px; line-height: 1.8; color: rgba(200,192,168,0.85); text-align: center; max-width: 620px; margin: 0 auto 56px; }
    .family-section { margin-bottom: 48px; padding-bottom: 40px; border-bottom: 1px solid rgba(212,175,55,0.12); }
    .family-section:last-of-type { border-bottom: none; }
    .family-head { display: flex; align-items: center; gap: 18px; margin-bottom: 20px; }
    .family-back { width: 52px; height: 78px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(212,175,55,0.35); flex-shrink: 0; }
    .family-head h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; font-weight: 500; color: #f0c75e; margin-bottom: 4px; }
    .family-desc { font-size: 13.5px; color: rgba(200,192,168,0.65); line-height: 1.6; }
    .card-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .card-pill { font-size: 13.5px; color: #c8c0a8; border: 1px solid rgba(212,175,55,0.22); border-radius: 50px; padding: 7px 16px; transition: border-color 0.2s, color 0.2s; }
    .card-pill:hover { border-color: rgba(212,175,55,0.6); color: #f0c75e; }
    .cta-block { margin-top: 24px; padding: 36px; background: rgba(212,175,55,0.05); border: 1px solid rgba(212,175,55,0.15); border-radius: 12px; text-align: center; }
    .cta-block p { font-size: 14.5px; color: rgba(200,192,168,0.7); margin-bottom: 22px; line-height: 1.7; font-style: italic; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #d4af37, #f5e7a1); color: #0a1628; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 16px; font-weight: 600; padding: 14px 36px; border-radius: 50px; letter-spacing: 0.05em; transition: opacity 0.2s; margin: 0 6px 10px; }
    .cta-btn:hover { opacity: 0.88; }
    .cta-btn.secondary { background: transparent; border: 1px solid rgba(212,175,55,0.4); color: #d4af37; }
  </style>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="stylesheet" href="/style.css">
  <script src="/security.js"><\/script>
</head>
<body>
  <div id="header-placeholder"></div>

  <main>
    <a href="/oracle.html" class="back-link">&larr; L'Oracle Oradia</a>

    <h1>Les ${totalCards} cartes de l'Oracle Oradia</h1>
    <p class="intro">Le tirage du Tore puise parmi ${totalCards} cartes, r&eacute;parties en 7 familles. Chaque carte a sa page&nbsp;: son sens g&eacute;n&eacute;ral, sa polarit&eacute;, et sa carte miroir quand elle en a une. Le visuel de chaque carte reste r&eacute;serv&eacute; aux abonn&eacute;&middot;e&middot;s &mdash; cette page n'affiche que le sens des mots.</p>
${familySections}

    <div class="cta-block">
      <p>Envie de d&eacute;couvrir quelles cartes l'oracle r&eacute;v&egrave;le pour votre propre question&nbsp;?</p>
      <a href="/tore.html" class="cta-btn">Faire un tirage gratuit</a>
      <a href="/precommande-oracle.html" class="cta-btn secondary">D&eacute;couvrir l'oracle physique</a>
    </div>
  </main>

  <div id="footer-placeholder"></div>
  <script src="/components/header-manager.js" defer><\/script>
  <script src="/components/footer-manager.js" defer><\/script>
  <script src="/js/page-tracker.js" defer><\/script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'cartes.html'), html, 'utf8');
console.log(`cartes.html généré (${totalCards} cartes, ${FAMILIES.length} familles)`);
