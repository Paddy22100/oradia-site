// scripts/generate-cartes-index-en.js
// Génère en/cartes.html : équivalent anglais de cartes.html. Usage :
//   node scripts/generate-cartes-index-en.js
// Doit être exécuté après generate-card-pages-en.js (dépend des mêmes noms
// anglais / slugs pour que les liens correspondent).

const fs = require('fs');
const path = require('path');
const deck = require('../data/tore-deck.json');
const { slugify } = require('../lib/tore-card-slug.js');

// Doit rester synchronisé avec EN_NAMES dans generate-card-pages-en.js.
const EN_NAMES = require('./_en-card-names.js');

const FAMILIES = [
  { key: 'emotions', label: 'Emotions', back: 'dos_emotion.webp',
    desc: "The feelings lived in the moment of the draw, gathered into 9 mirror pairs." },
  { key: 'besoins', label: 'Needs', back: 'dos_besoin.webp',
    desc: "What, once named, sheds light on what's missing or already fulfilled." },
  { key: 'transmutation', label: 'Transmutation', back: 'dos_transmutation.webp',
    desc: "The passages from one inner posture to another." },
  { key: 'archetypes', label: 'Archetypes', back: 'dos_archetype.webp',
    desc: "Recurring inner figures that lend their perspective to the draw." },
  { key: 'revelations', label: 'Revelations', back: 'dos_revelation.webp',
    desc: "Clues, signs, or truths rising to the surface." },
  { key: 'actions', label: 'Actions', back: 'dos_action.webp',
    desc: "The concrete gestures a situation calls for, or the ones better left suspended." },
  { key: 'memoire_cosmos', label: 'Cosmic Memory', back: 'dos_memoire_cosmos.webp',
    desc: "Ten cards with no mirror, widening the lens: time, memory, cycles." }
];

function cardListHtml(familyKey) {
  const cards = deck[familyKey].slice().sort((a, b) => EN_NAMES[a.name].localeCompare(EN_NAMES[b.name], 'en'));
  return cards.map(card => {
    const enName = EN_NAMES[card.name];
    const slug = slugify(enName);
    return `        <a href="/en/cartes/${slug}.html" class="card-pill">${enName}</a>`;
  }).join('\n');
}

const familySections = FAMILIES.map(fam => `
    <section class="family-section">
      <div class="family-head">
        <img src="/images/dos/${fam.back}" alt="Card back, ${fam.label} family, Oracle Oradia" class="family-back" loading="lazy">
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
  deck[fam.key].map(card => `https://oradia.fr/en/cartes/${slugify(EN_NAMES[card.name])}.html`)
);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The ${totalCards} Cards of the Oracle Oradia</title>
  <meta name="description" content="Explore the ${totalCards} cards of the Oradia Oracle, grouped into 7 families (Emotions, Needs, Transmutation, Archetypes, Revelations, Actions, Cosmic Memory). Each card's meaning, one by one.">
  <link rel="canonical" href="https://oradia.fr/en/cartes.html">
  <link rel="alternate" hreflang="fr" href="https://oradia.fr/cartes.html">
  <link rel="alternate" hreflang="en" href="https://oradia.fr/en/cartes.html">
  <link rel="alternate" hreflang="x-default" href="https://oradia.fr/cartes.html">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://oradia.fr/en/cartes.html">
  <meta property="og:title" content="The ${totalCards} Cards of the Oracle Oradia">
  <meta property="og:description" content="Explore the ${totalCards} cards of the Oradia Oracle, grouped into 7 families.">
  <meta property="og:image" content="https://oradia.fr/images/medias/apercu_stripe.jpg">
  <meta property="og:site_name" content="Oradia">
  <meta property="og:locale" content="en_US">
  <meta name="author" content="Rudy Boucheron">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "The ${totalCards} Cards of the Oracle Oradia",
    "url": "https://oradia.fr/en/cartes.html",
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
    <a href="/en/oracle.html" class="back-link">&larr; The Oradia Oracle</a>

    <h1>The ${totalCards} Cards of the Oracle Oradia</h1>
    <p class="intro">The Torus draw pulls from ${totalCards} cards, grouped into 7 families. Each card has its own page: its general meaning, its polarity, and its mirror card when it has one. Every card's visual remains reserved for subscribers &mdash; this page only shows the meaning of the words.</p>
${familySections}

    <div class="cta-block">
      <p>Curious what cards the oracle reveals for your own question?</p>
      <a href="/tore.html" class="cta-btn">Do a free draw</a>
      <a href="https://oradia.fr/precommande-oracle.html" class="cta-btn secondary">Discover the physical oracle</a>
    </div>
  </main>

  <div id="footer-placeholder"></div>
  <script src="/components/header-manager-en.js" defer><\/script>
  <script src="/components/footer-manager-en.js" defer><\/script>
  <script src="/js/page-tracker.js" defer><\/script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'en', 'cartes.html'), html, 'utf8');
console.log(`en/cartes.html généré (${totalCards} cartes, ${FAMILIES.length} familles)`);
