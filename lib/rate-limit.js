// Limitation de débit persistante (Supabase), partagée entre fonctions serverless.
//
// Les compteurs en mémoire (Map) ne tiennent pas sur Vercel : chaque instance a
// sa propre mémoire, remise à zéro à chaque démarrage à froid — un script qui
// boucle sur une route coûteuse (ex: /api/analyse-tirage, facturée par Anthropic)
// n'est donc jamais réellement freiné. Ici chaque appel autorisé laisse une ligne
// dans api_rate_limits (voir supabase-migration-api-rate-limits.sql) et on compte
// les lignes de la fenêtre glissante.
//
// Fail-open : si la table n'existe pas encore ou si Supabase répond en erreur, on
// laisse passer (allowed: true, degraded: true) — une panne de la limitation ne
// doit jamais bloquer les vrais utilisateurs.

// Première IP de x-forwarded-for (l'en-tête peut contenir une chaîne de proxys
// "client, proxy1, proxy2") ; x-real-ip est posé par Vercel et prioritaire.
function getClientIP(req) {
  const realIp = String(req.headers?.['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

// Compte les appels de (bucket, key) sur les windowSeconds dernières secondes et
// enregistre celui-ci s'il reste de la place. Retourne { allowed, count, degraded }.
async function hitRateLimit(supabase, { bucket, key, windowSeconds, max }) {
  try {
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count, error } = await supabase
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('bucket', bucket)
      .eq('key', key)
      .gte('created_at', since);
    if (error) {
      console.warn(`[rate-limit] lecture ${bucket} échouée (fail-open):`, error.message);
      return { allowed: true, count: 0, degraded: true };
    }
    if ((count || 0) >= max) return { allowed: false, count: count || 0 };

    const { error: insertError } = await supabase
      .from('api_rate_limits')
      .insert({ bucket, key });
    if (insertError) console.warn(`[rate-limit] écriture ${bucket} échouée:`, insertError.message);

    // Purge opportuniste des lignes de plus de 2 jours (aucun cron dédié : on reste
    // à 12 fonctions / 7 crons) — ~2 % des appels suffisent à garder la table petite.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
      // Attendu (pas "fire and forget") : Vercel coupe la fonction dès la réponse envoyée.
      const { error: purgeError } = await supabase.from('api_rate_limits').delete().lt('created_at', cutoff);
      if (purgeError) console.warn('[rate-limit] purge échouée:', purgeError.message);
    }
    return { allowed: true, count: (count || 0) + 1 };
  } catch (err) {
    console.warn(`[rate-limit] ${bucket} exception (fail-open):`, err.message);
    return { allowed: true, count: 0, degraded: true };
  }
}

module.exports = { getClientIP, hitRateLimit };
