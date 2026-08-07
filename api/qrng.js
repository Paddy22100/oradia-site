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
      const email = (req.body.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const { data: sub } = await supabase
        .from('tore_subscriptions')
        .select('status, expires_at')
        .ilike('email', email)
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

  const { fetchQuantumNumbers } = require('../lib/qrng.js');
  const { numbers, outcome, reason, sourceLabel, methodLabel } = await fetchQuantumNumbers(count);

  const payload = {
    success: true,
    numbers,
    outcome,        // 'anu' | 'outshift' | 'fallback' — valeur fiable pour le client (ne pas parser `source`)
    source: sourceLabel,
    method: methodLabel,
  };
  if (outcome === 'fallback') {
    payload.warning = 'Quantum sources temporarily unavailable';
    payload.fallback_reason = reason;
  }
  return res.status(200).json(payload);
}
