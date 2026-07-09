// api/analyse-tirage.js
// Endpoint serverless pour analyse IA du tirage avec Claude
// Génère une analyse personnalisée avec section Fenêtre d'observation

const MODELS_FALLBACK = [
    process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    'claude-haiku-4-5',
    'claude-3-5-haiku-20241022',
    'claude-sonnet-4-5',
];

// Importer le tracker d'utilisation (en ESM)
import { logApiUsage } from '../lib/api-usage-tracker.js';

async function sendModelAlert(failedModel, usedModel) {
    try {
        await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sender: { name: 'Oradia Système', email: 'contact@oradia.fr' },
                to: [{ email: 'contact@oradia.fr' }],
                subject: '⚠️ Oradia — Modèle IA remplacé automatiquement',
                htmlContent: `
                    <p>Le modèle <strong>${failedModel}</strong> est introuvable sur l'API Anthropic.</p>
                    <p>Le système a automatiquement basculé sur <strong>${usedModel}</strong>.</p>
                    <p>Mets à jour la variable d'environnement <code>ANTHROPIC_MODEL</code> 
                    dans Vercel avec la valeur <strong>${usedModel}</strong> pour éviter 
                    ce délai à chaque analyse.</p>
                    <p><a href="https://vercel.com/paddy22100s-projects/oradia-site/settings/environment-variables">
                    → Ouvrir les variables Vercel</a></p>
                `
            }),
        });
    } catch (e) {
        console.warn('[analyse-tirage] Alerte email non envoyée:', e.message);
    }
}

async function callAnthropicWithFallback(payload, userEmail, clientIP) {
    let firstModel = MODELS_FALLBACK[0];
    const startTime = Date.now();
    
    for (const model of MODELS_FALLBACK) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'anthropic-beta': 'messages-2023-12-15',
                },
                body: JSON.stringify({ ...payload, model }),
                signal: AbortSignal.timeout(25000),
            });

            if (response.ok) {
                const duration = Date.now() - startTime;
                
                // Extraire les informations d'utilisation de l'API
                const usage = response.headers.get('anthropic-ratelimit-usage');
                let requestTokens = null;
                let responseTokens = null;
                
                try {
                    // Essayer de parser les tokens depuis le corps de la réponse
                    const responseClone = response.clone();
                    const responseData = await responseClone.json();
                    if (responseData.usage) {
                        requestTokens = responseData.usage.input_tokens;
                        responseTokens = responseData.usage.output_tokens;
                    }
                } catch (e) {
                    // Si on ne peut pas extraire les tokens, on continue sans
                    console.warn('[analyse-tirage] Impossible d\'extraire les tokens:', e.message);
                }
                
                // Logger l'utilisation en arrière-plan (non bloquant)
                const status = model !== firstModel ? 'fallback' : 'success';
                logApiUsage({
                    apiName: 'anthropic-claude',
                    modelName: model,
                    requestTokens,
                    responseTokens,
                    userEmail,
                    ipAddress: clientIP,
                    status,
                    requestDurationMs: duration
                }).catch(err => {
                    console.warn('[analyse-tirage] Erreur logging API usage:', err.message);
                });
                
                if (model !== firstModel) {
                    // Fallback activé : envoyer alerte email (non bloquant)
                    sendModelAlert(firstModel, model);
                }
                
                return response;
            }

            const err = await response.json().catch(() => ({}));
            if (err.error?.type === 'not_found_error') {
                console.warn(`[analyse-tirage] Modèle ${model} introuvable, essai suivant...`);
                continue;
            }
            
            // Logger l'erreur
            const duration = Date.now() - startTime;
            logApiUsage({
                apiName: 'anthropic-claude',
                modelName: model,
                requestTokens: null,
                responseTokens: null,
                userEmail,
                ipAddress: clientIP,
                status: 'error',
                errorMessage: err.error?.message || 'Unknown error',
                requestDurationMs: duration
            }).catch(err => {
                console.warn('[analyse-tirage] Erreur logging API error:', err.message);
            });
            
            return response;
        } catch (e) {
            console.warn(`[analyse-tirage] Erreur modèle ${model}:`, e.message);
            
            // Logger l'exception
            const duration = Date.now() - startTime;
            logApiUsage({
                apiName: 'anthropic-claude',
                modelName: model,
                requestTokens: null,
                responseTokens: null,
                userEmail,
                ipAddress: clientIP,
                status: 'error',
                errorMessage: e.message,
                requestDurationMs: duration
            }).catch(err => {
                console.warn('[analyse-tirage] Erreur logging API exception:', err.message);
            });
            
            continue;
        }
    }
    throw new Error('Aucun modèle Anthropic disponible');
}

// Simple in-memory rate limiter for IP-based protection
const rateLimitStore = new Map();

function checkRateLimit(ip, limit = 20, windowMs = 60000) { // 20 requests per minute per IP
  const now = Date.now();
  const key = `analyse:${ip}`;
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const record = rateLimitStore.get(key);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

// ── Rate limiting : 300 tirages/mois par abonné actif ──────────────────────
const MONTHLY_DRAW_LIMIT = 300;

async function checkAndIncrementDrawCount(email) {
  if (!email) return { allowed: true }; // utilisateur anonyme/freemium : géré par localStorage

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { data: sub, error } = await supabase
      .from('tore_subscriptions')
      .select('status, expires_at, monthly_draws_count, monthly_draws_reset_at')
      .eq('email', email)
      .maybeSingle();

    if (error || !sub) return { allowed: true }; // pas d'abonnement → freemium, pas de limite serveur

    // Vérifier si l'abonnement est actif
    const isActive = sub.status === 'active' && new Date(sub.expires_at) > new Date();
    if (!isActive) return { allowed: true }; // abonnement expiré → freemium

    // Besoin de reset du compteur mensuel ?
    const now = new Date();
    const resetAt = sub.monthly_draws_reset_at ? new Date(sub.monthly_draws_reset_at) : new Date(0);
    const needsReset = now.getFullYear() !== resetAt.getFullYear()
                    || now.getMonth()    !== resetAt.getMonth();

    let currentCount = needsReset ? 0 : (sub.monthly_draws_count || 0);

    // Limite atteinte ?
    if (currentCount >= MONTHLY_DRAW_LIMIT) {
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return {
        allowed: false,
        reason: 'monthly_limit_reached',
        resetsAt: nextReset.toISOString(),
        count: currentCount,
      };
    }

    // Incrémenter le compteur (et reset si nécessaire)
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                           .toISOString().split('T')[0];
    await supabase
      .from('tore_subscriptions')
      .update({
        monthly_draws_count:    currentCount + 1,
        monthly_draws_reset_at: needsReset ? firstOfMonth : sub.monthly_draws_reset_at,
      })
      .eq('email', email);

    return { allowed: true, count: currentCount + 1 };

  } catch (err) {
    // En cas d'erreur Supabase : ne pas bloquer (fail-open pour expérience utilisateur)
    console.warn('[analyse-tirage] rate-limit check failed (fail-open):', err.message);
    return { allowed: true };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://oradia.fr');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting check
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIP, 20, 60000)) { // 20 requests per minute per IP
    return res.status(429).json({ 
      error: 'Trop de requêtes. Veuillez réessayer dans une minute.' 
    });
  }

  let body;
  try {
    body = typeof req.json === 'function' ? await req.json() : JSON.parse(await streamToString(req));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { intention, cards, userEmail, gender } = body;
  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'Cards array required' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Configuration error' });
  }

  // ── Gate rate limiting abonnés ───────────────────────────────────────────
  const rateCheck = await checkAndIncrementDrawCount(userEmail || null);
  if (!rateCheck.allowed) {
    const resetDate = new Date(rateCheck.resetsAt).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long'
    });
    return res.status(429).json({
      error: 'monthly_limit_reached',
      message: `Votre espace de tirage marque une pause ce mois-ci (${MONTHLY_DRAW_LIMIT} tirages atteints). Il se renouvellera le ${resetDate}.`,
      resetsAt: rateCheck.resetsAt,
    });
  }

  // Construction du prompt
  const cardsDescription = cards.map((c, i) => {
    const bridge = c.bridgeCard ? ` (passerelle: ${c.bridgeCard.name})` : '';
    const polarity = c.polarity ? ` [${c.polarity}]` : '';
    return `${i + 1}. ${c.family}: ${c.name}${polarity}${bridge}`;
  }).join('\n');

  const genderInstruction = gender === 'homme'
    ? "L'utilisateur est un homme. Accorde les adjectifs et participes passés au masculin quand tu t'adresses à lui directement."
    : gender === 'femme'
    ? "L'utilisateur est une femme. Accorde les adjectifs et participes passés au féminin quand tu t'adresses à elle directement."
    : "Ne fais pas d'accord genré — utilise des formulations neutres ou épicènes.";

  const userPrompt = `Tu es l'Oracle Oradia, un guide introspectif bienveillant.

${genderInstruction}

INTENTION DE L'UTILISATEUR : "${intention || 'question personnelle'}"

CARTES TIRÉES :
${cardsDescription}

Rédige une analyse en 3 sections, avec ce ton : chaleureux, précis, jamais générique.

IMPORTANT : Style d'écriture
- N'utilise JAMAIS de tirets (—) ou de points (•) dans ton texte
- Écris en phrases complètes et fluides
- Pas de listes à puces, pas de tirets narratifs
- Style narratif continu et élégant

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
Propose une durée en jours (7, 14 ou 28) adaptée à l'intention et aux cartes.
7 jours = question concrète ou relationnelle. 14 jours = question professionnelle ou de transition. 28 jours (cycle lunaire) = question de fond, transformation profonde.
Donne 2 points d'attention spécifiques à CE tirage (pas des généralités) :
des registres précis où porter l'attention (corps, relations, rêves, résistances, synchronicités, etc.)
en lien direct avec les cartes tirées.
Termine par une phrase courte qui dit comment savoir si la fenêtre a été fructueuse.
Format : texte narratif court, pas de liste à puces, pas de tirets.
IMPORTANT : Utilise une formulation comme "Une fenêtre de 3 jours est recommandée" plutôt que "accordée vous 3 jours".`

  try {
    const anthropicResponse = await callAnthropicWithFallback({
        max_tokens: 1024,
        temperature: 0.7,
        messages: [{ role: 'user', content: userPrompt }],
    }, userEmail, clientIP);

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error('[analyse-tirage] Claude API error:', errText);
      return res.status(502).json({ error: 'AI service unavailable' });
    }

    const data = await anthropicResponse.json();
    let analysis = data.content?.[0]?.text || '';

    // Nettoyage post-API pour supprimer les tirets narratifs indésirables
    analysis = analysis
      .replace(/—/g, '') // Supprimer tous les tirets demi-cadratin
      .replace(/–/g, '-') // Convertir tirets cadratin en tirets normaux
      .replace(/•/g, '')  // Supprimer les points
      .replace(/\s*—\s*/g, ' ') // Remplacer les tirets avec espaces par des espaces
      .replace(/\s*•\s*/g, ' ') // Remplacer les points avec espaces par des espaces
      .replace(/\n\s*—\s*/g, '\n') // Supprimer les tirets en début de ligne
      .replace(/\n\s*•\s*/g, '\n') // Supprimer les points en début de ligne
      .trim();

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
