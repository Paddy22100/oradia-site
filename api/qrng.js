// api/qrng.js
// Endpoint serverless Vercel — proxy vers l'API quantique de l'ANU
// Retourne un tableau de nombres aléatoires quantiques entre 0 et 255

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://oradia.fr');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const count = Math.min(parseInt(req.query.count) || 6, 50);

  try {
    const url = `https://api.quantumnumbers.anu.edu.au?length=${count}&type=uint8`;

    const response = await fetch(url, {
      headers: {
        'x-api-key': process.env.ANU_QRNG_API_KEY,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      throw new Error(`ANU API error: ${response.status}`);
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      numbers: data.data,
      source: 'ANU Quantum Random Number Generator',
      method: 'quantum_vacuum_fluctuations',
    });

  } catch (err) {
    // Fallback gracieux : crypto.getRandomValues (non-quantique mais cryptographiquement sûr)
    const fallback = Array.from(
      { length: count },
      () => crypto.getRandomValues(new Uint8Array(1))[0]
    );

    return res.status(200).json({
      success: true,
      numbers: fallback,
      source: 'crypto.getRandomValues (fallback)',
      method: 'cryptographic_prng',
      warning: 'ANU QRNG temporarily unavailable',
    });
  }
}
