// lib/tore-analysis-prompt.js
// Construit le prompt d'analyse IA du Tore et découpe la réponse en sections
// (cartes / pistes à explorer / synthèse / fenêtre d'observation). Utilisé par
// api/analyse-tirage.js (tirage manuel, via fetch côté client) et par le
// runner des tirages programmés (api/tirages/send-email.js?action=run-scheduled-draws),
// pour que les deux flux produisent exactement le même type d'analyse.
const { FAMILY_LABELS } = require('./tore-deck.js');
const { logApiUsage } = require('./api-usage-tracker.js');

function buildAnalysisPrompt({ intention, cards, gender }) {
  const cardsDescription = cards.map((c, i) => {
    const bridge = c.bridgeCard ? ` (passerelle: ${c.bridgeCard.name})` : '';
    const famLabel = FAMILY_LABELS[c.family] || c.family;
    return `${i + 1}. Famille ${famLabel}: ${c.name}${bridge}`;
  }).join('\n');

  const genderInstruction = gender === 'homme'
    ? "L'utilisateur est un homme. Accorde les adjectifs et participes passés au masculin quand tu t'adresses à lui directement."
    : gender === 'femme'
    ? "L'utilisateur est une femme. Accorde les adjectifs et participes passés au féminin quand tu t'adresses à elle directement."
    : "Ne fais pas d'accord genré — utilise des formulations neutres ou épicènes.";

  return `Tu es l'Oracle Oradia, un guide introspectif bienveillant.

${genderInstruction}

INTENTION DE L'UTILISATEUR : "${intention || 'question personnelle'}"

CARTES TIRÉES :
${cardsDescription}

Rédige une analyse en 4 sections, avec ce ton : chaleureux, précis, jamais générique.

IMPORTANT : Style d'écriture
- N'utilise JAMAIS de tirets (—) ou de points (•) dans ton texte
- Écris en phrases complètes et fluides
- Pas de listes à puces, pas de tirets narratifs
- Style narratif continu et élégant
- Écris exclusivement en français, sans aucun mot ni expression en anglais (même des mots courants comme "mindset", "flow", "insight" : utilise toujours leur équivalent français)
- Ne mentionne jamais une date précise (jour, mois, "ce 28 janvier"...) : tu ne connais pas la date réelle de ce tirage. Utilise des formulations intemporelles ("aujourd'hui", "ce jour", "en ce moment", "les jours qui viennent")

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

Contraintes : pas de tiret long (—), langage bienveillant, ne jamais promettre de résultats garantis.`;
}

// Nettoyage post-API identique à analyse-tirage.js (tirets/points narratifs).
function cleanAnalysisText(text) {
  return String(text || '')
    .replace(/—/g, '')
    .replace(/–/g, '-')
    .replace(/•/g, '')
    .replace(/\s*—\s*/g, ' ')
    .replace(/\s*•\s*/g, ' ')
    .replace(/\n\s*—\s*/g, '\n')
    .replace(/\n\s*•\s*/g, '\n')
    .trim();
}

// Découpe le texte généré par l'IA en { cards, explore, synthesis, observation }
// à partir des titres "## ...". Même logique que splitAISections() dans tore-analysis.html.
function splitAnalysisSections(fullText) {
  const result = { cards: '', explore: '', synthesis: '', observation: '' };
  const normalized = fullText || '';
  const matches = [...normalized.matchAll(/^##\s+(.+)$/gmi)];
  if (!matches.length) { result.cards = normalized.trim(); return result; }

  matches.forEach((match, index) => {
    const title = match[1].trim().toLowerCase();
    const start = match.index + match[0].length;
    const end = matches[index + 1] ? matches[index + 1].index : normalized.length;
    const content = normalized.slice(start, end).trim();
    if (title.includes('cartes')) result.cards = content;
    if (title.includes('explorer')) result.explore = content;
    if (title.includes('synthèse')) result.synthesis = content;
    if (title.includes('observation')) result.observation = content;
  });

  return result;
}

// Extrait 2-3 points d'attention du texte de la fenêtre d'observation. Même
// heuristique que extractObservationPoints() dans tore-analysis.html.
function extractObservationPoints(text) {
  const explicit = text
    .split('\n')
    .filter(l => l.trim())
    .filter(l => /^[-•*\d]/.test(l.trim()))
    .map(l => l.replace(/^[-•*\d.]\s*/, '').trim())
    .filter(l => l.length > 15)
    .slice(0, 3);

  if (explicit.length) return explicit;

  let points = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => /(corps|relation|rêve|resistance|résistance|synchronicité|émotion|besoin|signe|conversation|décision|silence|tension|élan)/i.test(s))
    .filter(s => s.length > 25);

  points = points.filter((point, index) => {
    const pointLower = point.toLowerCase();
    return !points.slice(0, index).some(prevPoint => {
      const prevLower = prevPoint.toLowerCase();
      const pointWords = pointLower.split(' ').filter(w => w.length > 3);
      const prevWords = prevLower.split(' ').filter(w => w.length > 3);
      const commonWords = pointWords.filter(w => prevWords.includes(w));
      return commonWords.length > Math.min(pointWords.length, prevWords.length) * 0.7;
    });
  });

  return points.slice(0, 3);
}

// Durée suggérée par l'IA, ramenée à l'option la plus proche parmi 7/14/28
// (même règle que injectObservationWindow() dans tore-analysis.html).
function parseObservationSection(text) {
  if (!text) return null;
  const daysMatch = text.match(/\b(\d+)\s*jour/i);
  const rawDays = daysMatch ? parseInt(daysMatch[1], 10) : 14;
  const days = !rawDays ? 7 : rawDays <= 7 ? 7 : rawDays <= 14 ? 14 : 28;
  const points = extractObservationPoints(text);
  return { text, days, points };
}

// Appelle Claude pour générer l'analyse d'un tirage sans passer par le client
// (tirages programmés, tirage hebdomadaire automatique...). Partagé entre
// api/tirages/send-email.js (tirages programmés par abonné) et
// api/admin/index.js (action=cron-tirage-hebdo) pour qu'un seul endroit gère
// le choix du modèle, les retries et le logging d'usage API.
async function generateAnalysisViaClaude({ intention, cards, gender, userEmail }) {
  const prompt = buildAnalysisPrompt({ intention, cards, gender });
  // Dédoublonné : sans ANTHROPIC_MODEL configuré (cas courant), les deux entrées
  // valaient le même modèle — un timeout (25s, AbortSignal ci-dessous) sur la
  // 1ère tentative relançait alors une 2e tentative identique, doublant l'attente
  // pour rien. Un vrai modèle alternatif reste retenté.
  const models = [...new Set([process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5', 'claude-haiku-4-5'])];

  for (const model of models) {
    const startTime = Date.now();
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1024, temperature: 0.7, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(25000)
      });
      const duration = Date.now() - startTime;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        logApiUsage({
          apiName: 'anthropic-claude', modelName: model, requestTokens: null, responseTokens: null,
          userEmail, status: 'error', errorMessage: err.error?.message || 'Unknown error', requestDurationMs: duration
        }).catch(e => console.warn('[generateAnalysisViaClaude] Erreur logging API error:', e.message));
        continue;
      }
      const data = await resp.json();
      logApiUsage({
        apiName: 'anthropic-claude', modelName: model,
        requestTokens: data.usage?.input_tokens ?? null,
        responseTokens: data.usage?.output_tokens ?? null,
        userEmail, status: 'success', requestDurationMs: duration
      }).catch(e => console.warn('[generateAnalysisViaClaude] Erreur logging API usage:', e.message));
      const raw = cleanAnalysisText(data.content?.[0]?.text || '');
      if (!raw) continue;
      return splitAnalysisSections(raw);
    } catch (e) {
      console.error('[generateAnalysisViaClaude] Anthropic error:', e.message);
      logApiUsage({
        apiName: 'anthropic-claude', modelName: model, requestTokens: null, responseTokens: null,
        userEmail, status: 'error', errorMessage: e.message, requestDurationMs: Date.now() - startTime
      }).catch(err => console.warn('[generateAnalysisViaClaude] Erreur logging API exception:', err.message));
    }
  }
  return null;
}

module.exports = { buildAnalysisPrompt, cleanAnalysisText, splitAnalysisSections, parseObservationSection, generateAnalysisViaClaude };
