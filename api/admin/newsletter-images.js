// api/admin/newsletter-images.js
// Propose des images : 1 produit Oradia + images ambiance locales + Unsplash

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const meRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://oradia.fr'}/api/admin/me`, {
    headers: { cookie: req.headers.cookie || '' }
  });
  if (!meRes.ok) return res.status(401).json({ error: 'Non autorisé' });

  const { intention, theme_keywords } = req.body;
  if (!intention) return res.status(400).json({ error: 'intention requise' });

  const results = { produit: null, ambiance_locale: [], unsplash: [] };

  // 1. Image produit Oradia — choisie selon le thème
  const PRODUIT_IMAGES = [
    { path: '/images/Coffret.png', name: 'Le Coffret La Boussole Intérieure', tags: ['coffret','boussole','oracle','cadeau'] },
    { path: '/images/plateau.jpeg', name: 'Le Plateau de tirage', tags: ['plateau','tirage','oracle','cartes'] },
    { path: '/images/apercu-hd.png', name: 'Aperçu des cartes', tags: ['cartes','oracle','tirage','deck'] },
    { path: '/images/fenetre_observation.png', name: 'Fenêtre d\'observation', tags: ['observation','conscience','regard','interieur'] },
    { path: '/images/coin-oradia.png', name: 'Coin Oradia', tags: ['oradia','symbole','logo'] },
    { path: '/images/medias/apercu_stripe.png', name: 'Aperçu produit', tags: ['produit','precommande','oracle'] }
  ];

  const intentionLower = (intention + ' ' + (theme_keywords || '')).toLowerCase();
  let bestProduit = PRODUIT_IMAGES[0];
  let bestScore = 0;
  for (const img of PRODUIT_IMAGES) {
    const score = img.tags.filter(t => intentionLower.includes(t)).length;
    if (score > bestScore) { bestScore = score; bestProduit = img; }
  }
  results.produit = bestProduit;

  // 2. Images ambiance locales depuis GitHub
  try {
    const ghRes = await fetch(
      'https://api.github.com/repos/Paddy22100/oradia-site/contents/images/newsletter/ambiance',
      {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json'
        }
      }
    );

    if (ghRes.ok) {
      const files = await ghRes.json();
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name));

      // Score les images locales selon le thème
      const scored = imageFiles.map(f => {
        const nameLower = f.name.replace(/[_\-\.]/g, ' ').toLowerCase();
        const score = intentionLower.split(/\s+/)
          .filter(w => w.length > 3 && nameLower.includes(w)).length;
        return { ...f, score };
      });

      scored.sort((a, b) => b.score - a.score || Math.random() - 0.5);
      results.ambiance_locale = scored.slice(0, 2).map(f => ({
        path: `/images/newsletter/ambiance/${f.name}`,
        name: f.name.replace(/[_\-]/g, ' ').replace(/\.[^.]+$/, ''),
        source: 'local'
      }));
    }
  } catch (e) {
    console.error('Erreur lecture GitHub ambiance:', e);
  }

  // 3. Images Unsplash
  try {
    const keywords = theme_keywords || intention;
    const query = encodeURIComponent(`${keywords} nature spiritual contemplative`);
    const unsplashRes = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=6&orientation=landscape&content_filter=high`,
      {
        headers: {
          'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` 
        }
      }
    );

    if (unsplashRes.ok) {
      const data = await unsplashRes.json();
      results.unsplash = data.results.slice(0, 2).map(photo => ({
        path: photo.urls.regular,
        thumb: photo.urls.small,
        name: photo.alt_description || photo.description || 'Photo Unsplash',
        source: 'unsplash',
        unsplash_id: photo.id,
        photographer: photo.user.name,
        download_url: photo.urls.full,
        filename: `unsplash_${photo.id}_${keywords.replace(/\s+/g,'_').toLowerCase()}.jpg` 
      }));
    }
  } catch (e) {
    console.error('Erreur Unsplash:', e);
  }

  return res.status(200).json(results);
}
