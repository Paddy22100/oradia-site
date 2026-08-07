// lib/qrng.js
// Cœur de la génération de nombres quantiques (Outshift QRNG/Cisco en source
// principale, ANU en repli, crypto local en dernier recours), extrait de
// api/qrng.js pour être appelable directement (sans aller-repasser par HTTP)
// depuis les tirages programmés (api/tirages/send-email.js?action=run-scheduled-draws).
// Comportement identique à l'ancien handler inline : même ordre de tentative,
// même journalisation qrng_usage, mêmes libellés.
async function fetchQuantumNumbers(count) {
  let outcome = 'fallback';
  let statusCode = null;
  let reason = null;
  let numbers = null;
  let sourceLabel = 'crypto.getRandomValues (fallback)';
  let methodLabel = 'cryptographic_prng';

  // ── Source 1 : Outshift QRNG by Cisco (matériel quantique propre) ────
  if (process.env.OUTSHIFT_QRNG_API_KEY) {
    try {
      const bitsPerBlock = 8;
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
      if (!response.ok) throw new Error(`http_${response.status}`);

      const data = await response.json();
      const raw = data?.random_numbers ?? data?.data ?? data?.numbers ?? data?.blocks;
      const parsed = Array.isArray(raw)
        ? raw.map(v => (typeof v === 'object' && v !== null ? Number(v.decimal ?? v.value) : Number(v)))
        : null;

      if (!parsed || parsed.length === 0 || parsed.some(Number.isNaN)) throw new Error('invalid_response');

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
  if (outcome !== 'outshift') {
    try {
      if (!process.env.ANU_QRNG_API_KEY) throw new Error('missing_api_key');

      const url = `https://api.quantumnumbers.anu.edu.au?length=${count}&type=uint8`;
      const response = await fetch(url, {
        headers: { 'x-api-key': process.env.ANU_QRNG_API_KEY, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      statusCode = response.status;
      if (!response.ok) throw new Error(`http_${response.status}`);

      const data = await response.json();
      if (!data || !Array.isArray(data.data)) throw new Error('invalid_response');

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
    numbers = Array.from({ length: count }, () => crypto.getRandomValues(new Uint8Array(1))[0]);
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

  return { numbers, outcome, statusCode, reason, sourceLabel, methodLabel };
}

module.exports = { fetchQuantumNumbers };
