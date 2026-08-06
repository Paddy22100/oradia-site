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

  let outcome = 'fallback';
  let statusCode = null;
  let reason = null;
  let numbers = null;
  let sourceLabel = 'crypto.getRandomValues (fallback)';
  let methodLabel = 'cryptographic_prng';

  // ── Source 1 : Outshift QRNG by Cisco (matériel quantique propre) ────
  // Priorité à Outshift : quota bien plus généreux (100k bits/jour) que le
  // plan gratuit ANU (100/mois), le temps que la clé ANU payante s'active.
  if (process.env.OUTSHIFT_QRNG_API_KEY) {
    try {
      const bitsPerBlock = 8; // 1 octet par bloc, pour rester compatible avec le format ANU (uint8)
      const response = await fetch('https://api.qrng.outshift.com/api/v1/random_numbers', {
        method: 'POST',
        headers: {
          'x-id-api-key': process.env.OUTSHIFT_QRNG_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encoding: 'raw',
          format: 'decimal',
          bits_per_block: bitsPerBlock,
          number_of_blocks: count,
        }),
        signal: AbortSignal.timeout(8000),
      });

      statusCode = response.status;

      if (!response.ok) {
        throw new Error(`http_${response.status}`);
      }

      const data = await response.json();
      // Réponse confirmée en conditions réelles : { random_numbers: [{ decimal: "123" }, ...] }.
      // On garde les autres formes en repli au cas où l'API évoluerait.
      const raw = data?.random_numbers ?? data?.data ?? data?.numbers ?? data?.blocks;
      const parsed = Array.isArray(raw)
        ? raw.map(v => (typeof v === 'object' && v !== null ? Number(v.decimal ?? v.value) : Number(v)))
        : null;

      if (!parsed || parsed.length === 0 || parsed.some(Number.isNaN)) {
        throw new Error('invalid_response');
      }

      numbers = parsed.slice(0, count);
      outcome = 'outshift';
      sourceLabel = 'Outshift QRNG (Cisco quantum hardware)';
      methodLabel = 'quantum_hardware_outshift';

    } catch (err) {
      if (err && err.name === 'TimeoutError') reason = 'timeout_outshift';
      else if (err && typeof err.message === 'string' && err.message) reason = `outshift_${err.message}`;
      else reason = 'outshift_unknown';
    }
  }

  // ── Source 2 : ANU (fluctuations du vide quantique) ───────────────────
  // Tentée uniquement si Outshift a échoué (ou n'est pas configuré).
  if (outcome !== 'outshift') {
    try {
      // Clé absente = cause n°1 des fallbacks : on la détecte explicitement plutôt
      // que d'envoyer un appel voué au 401, pour un diagnostic clair côté dashboard.
      if (!process.env.ANU_QRNG_API_KEY) {
        throw new Error('missing_api_key');
      }

      const url = `https://api.quantumnumbers.anu.edu.au?length=${count}&type=uint8`;

      // Timeout porté à 8 s : l'API ANU est souvent lente (5-15 s), 4 s la faisait
      // expirer trop souvent et basculait à tort en fallback.
      const response = await fetch(url, {
        headers: {
          'x-api-key': process.env.ANU_QRNG_API_KEY,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      statusCode = response.status;

      if (!response.ok) {
        throw new Error(`http_${response.status}`);
      }

      const data = await response.json();
      if (!data || !Array.isArray(data.data)) {
        throw new Error('invalid_response');
      }

      numbers = data.data;
      outcome = 'anu';
      reason = null;
      sourceLabel = 'ANU Quantum Random Number Generator';
      methodLabel = 'quantum_vacuum_fluctuations';

    } catch (err) {
      if (err && err.name === 'TimeoutError') reason = 'timeout';
      else if (err && typeof err.message === 'string' && err.message) reason = err.message;
      else reason = 'unknown';
    }
  }

  // ── Dernier recours : crypto.getRandomValues (non-quantique mais sûr) ─
  if (outcome !== 'anu' && outcome !== 'outshift') {
    numbers = Array.from(
      { length: count },
      () => crypto.getRandomValues(new Uint8Array(1))[0]
    );
  }

  // Journaliser l'usage (compteur de quota + diagnostic) sans jamais bloquer le tirage
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await supabase.from('qrng_usage').insert({ outcome, status_code: statusCode, reason, count });
  } catch (_) { /* table qrng_usage absente ou DB indisponible : on ne casse pas le tirage */ }

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
