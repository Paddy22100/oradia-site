// api/analyse-tirage.js
// Endpoint serverless pour analyse IA du tirage avec Claude
// Génère une analyse personnalisée avec section Fenêtre d'observation

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://oradia.fr');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.json === 'function' ? await req.json() : JSON.parse(await streamToString(req));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { intention, cards } = body;
  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'Cards array required' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Configuration error' });
  }

  // Construction du prompt
  const cardsDescription = cards.map((c, i) => {
    const bridge = c.bridgeCard ? ` (passerelle: ${c.bridgeCard.name})` : '';
    const polarity = c.polarity ? ` [${c.polarity}]` : '';
    return `${i + 1}. ${c.family}: ${c.name}${polarity}${bridge}`;
  }).join('\n');

  const userPrompt = `Tu es l'Oracle Oradia, un guide introspectif bienveillant.

INTENTION DE L'UTILISATEUR : "${intention || 'question personnelle'}"

CARTES TIRÉES :
${cardsDescription}

Rédige une analyse en 3 sections, avec ce ton : chaleureux, précis, jamais générique.

## Ce que disent vos cartes
En 4-5 phrases maximum, raconte ce que ces cartes révèlent ensemble pour cette intention spécifique. 
Sois concret : nomme les cartes, évoque leurs énergies, montre la connexion entre elles.
Pas de généralités. Un seul utilisateur, une seule situation.

## Ce que cela vous invite à explorer
En 3-4 phrases, quelles pistes concrètes ouvertes par ce tirage ? 
Corps, relations, décisions, timing, ce qui demande attention — en lien direct avec les cartes.

## Synthèse
Un paragraphe court (3-4 phrases) qui noue le tout avec une phrase de fermeture porteuse.

## Fenêtre d'observation
En 3 à 5 lignes maximum :
- Propose une durée en jours (1, 3 ou 5) adaptée à l'intention et aux cartes.
  1 jour = question urgente ou concrète. 3 jours = question relationnelle ou professionnelle. 5 jours = question de fond, transformation profonde.
- Donne 2 points d'attention spécifiques à CE tirage (pas des généralités) :
  des registres précis où porter l'attention (corps, relations, rêves, résistances, synchronicités, etc.)
  en lien direct avec les cartes tirées.
- Termine par une phrase courte qui dit comment savoir si la fenêtre a été fructueuse.
Format : texte narratif court, pas de liste à puces.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1500,
        temperature: 0.7,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[analyse-tirage] Claude API error:', errText);
      return res.status(502).json({ error: 'AI service unavailable' });
    }

    const data = await response.json();
    const analysis = data.content?.[0]?.text || '';

    return res.status(200).json({ 
      success: true, 
      analysis,
      // La section fenêtre d'observation sera extraite côté client
    });

  } catch (err) {
    console.error('[analyse-tirage] Error:', err);
    return res.status(500).json({ error: 'Analysis failed' });
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}
