// api/qrng.js
// Endpoint serverless Vercel — proxy vers l'API quantique de l'ANU
// Retourne un tableau de nombres aléatoires quantiques entre 0 et 255

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://oradia.fr');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Cache-Control', 'no-store');

  // ── Gestion quota Tore (POST) ───────────────────────────────────────
  if (req.method === 'POST') {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const { data: sub } = await supabase
        .from('tore_subscriptions')
        .select('status, expires_at')
        .eq('email', email)
        .single();

      if (!sub) {
        // Pas de ligne = utilisateur freemium pur (localStorage gère)
        return res.status(200).json({ canDraw: true, drawsUsed: 0 });
      }

      // Abonné actif → tirages illimités
      if (sub.status === 'active' && new Date(sub.expires_at) > new Date()) {
        return res.status(200).json({ canDraw: true, drawsUsed: 0 });
      }

      // Freemium : déléguer à localStorage (retourner true par défaut)
      return res.status(200).json({ canDraw: true, drawsUsed: 0 });

    } catch (err) {
      console.error('[check-tore-quota]', err);
      // En cas d'erreur serveur : ne pas bloquer l'utilisateur
      return res.status(200).json({ canDraw: true, drawsUsed: 0 });
    }
  }

  // ── QRNG (GET) ───────────────────────────────────────────────────────
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
