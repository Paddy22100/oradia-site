// api/admin/newsletter-image-save.js
// Télécharge une image Unsplash et la commit dans GitHub

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const meRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://oradia.fr'}/api/admin/me`, {
    headers: { cookie: req.headers.cookie || '' }
  });
  if (!meRes.ok) return res.status(401).json({ error: 'Non autorisé' });

  const { unsplash_url, filename } = req.body;
  if (!unsplash_url || !filename) return res.status(400).json({ error: 'url et filename requis' });

  try {
    // Télécharge l'image depuis Unsplash
    const imageRes = await fetch(unsplash_url);
    if (!imageRes.ok) throw new Error('Impossible de télécharger l\'image');
    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const safeName = filename.replace(/[^a-z0-9_\-\.]/gi, '_').toLowerCase();
    const path = `images/newsletter/ambiance/${safeName}`;

    // Vérifie si le fichier existe déjà dans GitHub
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

    // Commit dans GitHub
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
