// api/admin/newsletter-images.js
// Propose des images : 1 produit Oradia + images ambiance locales + Unsplash
// ET sauvegarde des images Unsplash dans GitHub

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const meRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://oradia.fr'}/api/admin/auth?action=me`, {
    headers: { cookie: req.headers.cookie || '' }
  });
  if (!meRes.ok) return res.status(401).json({ error: 'Non autorisé' });

  const { action, intention, theme_keywords, unsplash_url, filename } = req.body;

  // ACTION: save — Télécharge et commit une image Unsplash dans GitHub
  if (action === 'save') {
    if (!unsplash_url || !filename) return res.status(400).json({ error: 'url et filename requis' });

    try {
      const imageRes = await fetch(unsplash_url);
      if (!imageRes.ok) throw new Error('Impossible de télécharger l\'image');
      const buffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      const safeName = filename.replace(/[^a-z0-9_\-\.]/gi, '_').toLowerCase();
      const path = `images/newsletter/ambiance/${safeName}`;

      const GITHUB_API = `https://api.github.com/repos/Paddy22100/oradia-site/contents/${path}`;
      const checkRes = await fetch(GITHUB_API, {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json'
        }
      });

      let sha = null;
      if (checkRes.ok) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }

      const commitBody = {
        message: `feat: ajout image newsletter ambiance — ${safeName}`,
        content: base64,
        branch: 'main'
      };
      if (sha) commitBody.sha = sha;

      const commitRes = await fetch(GITHUB_API, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commitBody)
      });

      if (!commitRes.ok) {
        const err = await commitRes.json();
        throw new Error(err.message || 'Erreur GitHub commit');
      }

      const localPath = `/images/newsletter/ambiance/${safeName}`;
      return res.status(200).json({ success: true, path: localPath });

    } catch (error) {
      console.error('Erreur sauvegarde image:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ACTION: list (par défaut) — Liste les images disponibles
  if (!intention) return res.status(400).json({ error: 'intention requise' });

  const results = { produit: null, ambiance_locale: [], unsplash: [] };

  // 1. Images produit Oradia — jusqu'à 3 selon le thème
  const PRODUIT_IMAGES = [
    { path: '/images/Coffret.png', name: 'Le Coffret Oradia', tags: ['coffret','boussole','oracle','cadeau','intention','theme'] },
    { path: '/images/plateau.jpeg', name: 'Le Plateau de tirage', tags: ['plateau','tirage','oracle','cartes'] },
    { path: '/images/apercu-hd.png', name: 'Les Cartes Oradia', tags: ['cartes','oracle','tirage','deck','intention'] },
    { path: '/images/fenetre_observation.png', name: 'Fenêtre d\'observation', tags: ['observation','conscience','regard','interieur','introspection'] },
    { path: '/images/coin-oradia.png', name: 'Oradia', tags: ['oradia','symbole','logo','marque'] },
    { path: '/images/medias/apercu_stripe.png', name: 'Aperçu de l\'Oracle', tags: ['produit','precommande','oracle','intention'] },
    { path: '/images/tirage-exemple.png', name: 'Exemple de tirage', tags: ['tirage','exemple','cartes','oracle'] },
    { path: '/images/carte-emotion.png', name: 'Carte Émotion', tags: ['emotion','carte','famille','ressenti'] },
    { path: '/images/carte-besoin.png', name: 'Carte Besoin', tags: ['besoin','carte','famille','besoins'] }
  ];

  const intentionLower = (intention + ' ' + (theme_keywords || '')).toLowerCase();
  
  // Scorer toutes les images produit
  const scoredProduits = PRODUIT_IMAGES.map(img => {
    const score = img.tags.filter(t => intentionLower.includes(t)).length;
    return { ...img, score };
  });
  
  // Trier par score et prendre les 3 meilleures
  scoredProduits.sort((a, b) => b.score - a.score);
  results.produit = scoredProduits.slice(0, 3);

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
      results.ambiance_locale = scored.slice(0, 4).map(f => ({
        path: `/images/newsletter/ambiance/${f.name}`,
        name: f.name.replace(/[_\-]/g, ' ').replace(/\.[^.]+$/, ''),
        source: 'local'
      }));
    }
  } catch (e) {
    console.error('Erreur lecture GitHub ambiance:', e);
  }

  // 3. Images Unsplash — recherche adaptée à l'univers Oradia
  try {
    const keywords = theme_keywords || intention;
    // Mots-clés spirituels et contemplatifs pour Oradia
    const oradiaKeywords = 'spiritual contemplative minimalist nature meditation mindfulness serene peaceful';
    const query = encodeURIComponent(`${keywords} ${oradiaKeywords}`);
    const unsplashRes = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=12&orientation=landscape&content_filter=high`,
      {
        headers: {
          'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` 
        }
      }
    );

    if (unsplashRes.ok) {
      const data = await unsplashRes.json();
      // Filtrer les images avec des couleurs douces et composition minimaliste
      const filtered = data.results.filter(photo => {
        const desc = (photo.alt_description || photo.description || '').toLowerCase();
        // Exclure images trop chargées ou urbaines
        const exclude = ['city', 'urban', 'crowd', 'busy', 'neon', 'bright'];
        return !exclude.some(word => desc.includes(word));
      });
      
      results.unsplash = filtered.slice(0, 5).map(photo => ({
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
