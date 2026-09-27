// api/analyse-tirage.js
// Endpoint serverless pour analyse IA du tirage avec Claude
// Génère une analyse personnalisée avec section Fenêtre d'observation

// Dédoublonnée : ANTHROPIC_MODEL vaut en général déjà 'claude-haiku-4-5', qui était
// alors essayé deux fois. claude-3-5-haiku-20241022 (retiré par Anthropic) a été
// supprimé de la liste ; le dernier recours est un modèle actuel, plus cher mais
// qui déclenche l'alerte email "modèle remplacé" pour corriger ANTHROPIC_MODEL.
const MODELS_FALLBACK = [...new Set([
    process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    'claude-haiku-4-5',
    'claude-sonnet-5',
])];

// ── Limitation de débit persistante (voir lib/rate-limit.js) ────────────────
// La limite des 2 tirages gratuits n'existe que dans le navigateur (localStorage) :
// sans garde-fou serveur, un script pouvait appeler cette route en boucle, chaque
// appel étant facturé par Anthropic. Fenêtre glissante de 24 h par IP, plus un
// plafond global journalier qui sert de disjoncteur de coût.
const ANON_DAILY_PER_IP       = 10;  // 2 tirages gratuits + bonus parrainage + rechargements
const SUBSCRIBER_DAILY_PER_IP = 60;  // abonné actif (quota mensuel de 300 en plus)
const GLOBAL_DAILY_CAP = parseInt(process.env.ANALYSE_DAILY_CAP || '500', 10);
const DAY_SECONDS = 86400;

// Importer le tracker d'utilisation (en ESM)
import { logApiUsage } from '../lib/api-usage-tracker.js';
import { getClientIP, hitRateLimit } from '../lib/rate-limit.js';

async function sendDailyCapAlert(count) {
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
                subject: '⚠️ Oradia — Plafond journalier des analyses IA atteint',
                htmlContent: `
                    <p>Le plafond de <strong>${count}</strong> analyses IA sur 24 h glissantes vient d'être atteint.</p>
                    <p>Les nouvelles analyses sont suspendues jusqu'à ce que le volume redescende
                    (les visiteurs voient un message d'indisponibilité temporaire).</p>
                    <p>Si c'est un vrai pic de fréquentation, augmente la variable d'environnement
                    <code>ANALYSE_DAILY_CAP</code> dans Vercel. Sinon, il peut s'agir d'un usage abusif :
                    consulte la table <code>api_rate_limits</code> (colonne key = IP) dans Supabase.</p>
                `
            }),
        });
    } catch (e) {
        console.warn('[analyse-tirage] Alerte plafond non envoyée:', e.message);
    }
}

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
                
                // Journalisation attendue : sur Vercel, une promesse laissée en arrière-plan
                // peut être interrompue dès que la réponse HTTP est envoyée.
                const status = model !== firstModel ? 'fallback' : 'success';
                await logApiUsage({
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
            await logApiUsage({
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
            await logApiUsage({
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
      .ilike('email', email)
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
      .ilike('email', email);

    return { allowed: true, subscriber: true, count: currentCount + 1 };

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
  const clientIP = getClientIP(req);
  // Premier filet anti-rafale, local à l'instance (le vrai garde-fou est la limite
  // persistante plus bas, après la vérification d'abonnement).
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

  const { intention, cards, userEmail, gender, lang: rawLang } = body;
  const lang = rawLang === 'en' ? 'en' : 'fr';
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
    const resetDate = new Date(rateCheck.resetsAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
      day: 'numeric', month: 'long'
    });
    const message = lang === 'en'
      ? `Your draw space is taking a pause this month (${MONTHLY_DRAW_LIMIT} draws reached). It will reset on ${resetDate}.`
      : `Votre espace de tirage marque une pause ce mois-ci (${MONTHLY_DRAW_LIMIT} tirages atteints). Il se renouvellera le ${resetDate}.`;
    return res.status(429).json({
      error: 'monthly_limit_reached',
      message,
      resetsAt: rateCheck.resetsAt,
    });
  }

  // ── Limitation persistante par IP + plafond global ──────────────────────
  let sbLimit = null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    sbLimit = createClient(
      process.env.SUPABASE_URL || 'https://nxzetkdozynyutlbhxdx.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (e) {
    console.warn('[analyse-tirage] client Supabase indisponible, limitation désactivée:', e.message);
  }
  if (sbLimit) {
    const ipCheck = await hitRateLimit(sbLimit, {
      bucket: 'analyse-ip',
      key: clientIP,
      windowSeconds: DAY_SECONDS,
      max: rateCheck.subscriber ? SUBSCRIBER_DAILY_PER_IP : ANON_DAILY_PER_IP,
    });
    if (!ipCheck.allowed) {
      const resetsAt = new Date(Date.now() + DAY_SECONDS * 1000).toISOString();
      return res.status(429).json({
        error: 'daily_limit_reached',
        message: lang === 'en'
          ? 'Your draw space is taking a pause for today. Come back tomorrow for a new reading.'
          : "Votre espace de tirage marque une pause pour aujourd'hui. Revenez demain pour une nouvelle lecture.",
        resetsAt,
      });
    }
    const globalCheck = await hitRateLimit(sbLimit, {
      bucket: 'analyse-global',
      key: 'all',
      windowSeconds: DAY_SECONDS,
      max: GLOBAL_DAILY_CAP,
    });
    if (!globalCheck.allowed) {
      // Les appels refusés ne sont pas comptés : sans ce second compteur (1 alerte
      // par 24 h), chaque visiteur refusé déclencherait un nouvel email.
      const alertSlot = await hitRateLimit(sbLimit, {
        bucket: 'analyse-cap-alert', key: 'all', windowSeconds: DAY_SECONDS, max: 1,
      });
      if (alertSlot.allowed && !alertSlot.degraded) await sendDailyCapAlert(GLOBAL_DAILY_CAP);
      return res.status(503).json({
        error: 'analysis_temporarily_unavailable',
        message: lang === 'en'
          ? 'The oracle is receiving many requests right now. Please try again in a few hours.'
          : "L'oracle reçoit beaucoup de demandes en ce moment. Merci de réessayer dans quelques heures.",
      });
    }
  }

  // Prompt et nettoyage post-API partagés avec le runner des tirages programmés
  // (api/tirages/send-email.js) — une seule source de vérité, voir
  // lib/tore-analysis-prompt.js. Cette copie locale a longtemps dérivé de l'original
  // (elle annonçait "3 sections" pour 4 titres, entre autres) et ne portait pas les
  // correctifs appliqués à l'autre copie, comme l'interdiction de dates inventées.
  const { buildAnalysisPrompt, cleanAnalysisText } = require('../lib/tore-analysis-prompt.js');
  const userPrompt = buildAnalysisPrompt({ intention, cards, gender, lang });

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
    const analysis = cleanAnalysisText(data.content?.[0]?.text || '');

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
