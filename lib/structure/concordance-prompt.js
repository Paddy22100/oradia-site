// lib/structure/concordance-prompt.js
// Usage strictement interne/admin (dashboard) : contrairement à
// lib/tore-analysis-prompt.js (synthèse envoyée au client, qui ne doit JAMAIS
// nommer le Yi King), ce module sert à Rudy à vérifier, après coup, si le texte
// réellement reçu par un utilisateur est cohérent avec la structure Yi King cachée
// de son tirage. Le Yi King peut donc être nommé explicitement ici — rien de ceci
// n'est jamais renvoyé à un utilisateur final.
const { logApiUsage } = require('../api-usage-tracker.js');

function describeFigure(fig) {
  if (!fig) return null;
  return `n°${fig.numero} « ${fig.nom} » — ${fig.motsCles}`;
}

function buildConcordancePrompt({ intention, cartesDetail, synthese, analyseIA, structure }) {
  const cartesTxt = cartesDetail.map(c => {
    const bridge = c.bridgeCard ? ` [+ carte passerelle : ${c.bridgeCard.name} — "${c.bridgeCard.quote}"]` : '';
    return `- ${c.family} : ${c.name} (${c.polarity}) — "${c.quote}"${bridge}`;
  }).join('\n');

  const lignesMutantesTxt = structure.lignesMutantes.length
    ? structure.lignesMutantes.join(', ')
    : 'aucune';

  return `Tu es l'assistant technique interne d'Oradia (oracle "L'Oracle des Passerelles"). Rudy, le créateur, veut vérifier si le texte que son oracle a réellement généré pour cet utilisateur est cohérent avec la structure Yi King cachée du tirage (invisible pour l'utilisateur, calculée côté serveur).

INTENTION DE L'UTILISATEUR : "${intention || '(non renseignée)'}"

CARTES TIRÉES (telles que l'oracle les présente) :
${cartesTxt}

LIGNES MUTANTES (1=Émotions...6=Actions) : ${lignesMutantesTxt}

TEXTE RÉELLEMENT REÇU PAR L'UTILISATEUR :
--- analyse carte par carte ---
${analyseIA || '(absent)'}
--- synthèse ---
${synthese || '(absent)'}

STRUCTURE YI KING CALCULÉE POUR CE TIRAGE :
- Figure principale : ${describeFigure(structure.principale)}
- Figure nucléaire (le cœur du tirage) : ${describeFigure(structure.nucleaire)}
- Figure opposée (le miroir inversé) : ${describeFigure(structure.opposee)}
- Figure retournée (vue depuis l'autre bout) : ${describeFigure(structure.retournee) || '(identique à la principale — figure symétrique, rien à comparer)'}
- Figure de devenir (ce que deviennent les lignes mutantes) : ${describeFigure(structure.devenir) || "(aucune ligne mutante dans ce tirage)"}

TA TÂCHE : pour chaque figure dérivée présente ci-dessus (ignore celles marquées comme absentes), évalue de 0 à 100 à quel point le texte réellement reçu par l'utilisateur reflète le thème de cette figure — 0 = aucun rapport perceptible, 100 = correspondance quasi littérale. Puis donne un score global (0-100) de cohérence d'ensemble, et un court verdict en français (2-3 phrases, concret, citant si possible un fragment du texte) expliquant ce qui concorde et ce qui ne concorde pas.

Réponds UNIQUEMENT avec un objet JSON strictement de cette forme, sans markdown, sans texte autour :
{"scores":{"principale":<0-100>,"nucleaire":<0-100>,"opposee":<0-100>,"retournee":<0-100 ou null si absente>,"devenir":<0-100 ou null si absente>,"global":<0-100>},"verdict":"<texte>"}`;
}

function extractJson(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch (e) { return null; }
}

function isValidScore(n) {
  return n === null || (typeof n === 'number' && n >= 0 && n <= 100);
}

function validateResult(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const s = parsed.scores;
  if (!s || typeof s !== 'object') return null;
  const keys = ['principale', 'nucleaire', 'opposee', 'retournee', 'devenir', 'global'];
  for (const k of keys) {
    if (!(k in s) || !isValidScore(s[k])) return null;
  }
  if (typeof parsed.verdict !== 'string' || !parsed.verdict.trim()) return null;
  return { scores: s, verdict: parsed.verdict.trim() };
}

// { intention, cartesDetail, synthese, analyseIA, structure, userEmail? } → { scores, verdict } ou null.
// Ne lève jamais : un échec (modèle indisponible, JSON invalide...) renvoie null,
// pour que l'appelant puisse simplement renoncer sans jamais bloquer le tirage lui-même.
async function evaluerConcordance({ intention, cartesDetail, synthese, analyseIA, structure, userEmail }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const prompt = buildConcordancePrompt({ intention, cartesDetail, synthese, analyseIA, structure });
  const models = [...new Set([process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5', 'claude-haiku-4-5'])];

  for (const model of models) {
    const startTime = Date.now();
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 600, temperature: 0.3, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(25000)
      });
      const duration = Date.now() - startTime;
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        logApiUsage({
          apiName: 'anthropic-claude', modelName: model, requestTokens: null, responseTokens: null,
          userEmail, status: 'error', errorMessage: err.error?.message || 'Unknown error', requestDurationMs: duration
        }).catch(() => {});
        continue;
      }
      const data = await resp.json();
      logApiUsage({
        apiName: 'anthropic-claude', modelName: model,
        requestTokens: data.usage?.input_tokens ?? null,
        responseTokens: data.usage?.output_tokens ?? null,
        userEmail, status: 'success', requestDurationMs: duration
      }).catch(() => {});

      const parsed = extractJson(data.content?.[0]?.text || '');
      const validated = validateResult(parsed);
      if (validated) return validated;
    } catch (e) {
      console.error('[evaluerConcordance] Anthropic error:', e.message);
      logApiUsage({
        apiName: 'anthropic-claude', modelName: model, requestTokens: null, responseTokens: null,
        userEmail, status: 'error', errorMessage: e.message, requestDurationMs: Date.now() - startTime
      }).catch(() => {});
    }
  }
  return null;
}

module.exports = { buildConcordancePrompt, evaluerConcordance, extractJson, validateResult };
