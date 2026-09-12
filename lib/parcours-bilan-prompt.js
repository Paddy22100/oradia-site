// lib/parcours-bilan-prompt.js
// Bilan de parcours : contrairement à l'analyse d'un tirage isolé
// (lib/tore-analysis-prompt.js), celle-ci porte sur l'historique complet d'un
// abonné (jusqu'à 20 tirages conservés, voir CLAUDE.md) pour en dégager les
// motifs récurrents sur plusieurs mois — la raison de rester abonné au-delà
// du tirage à l'unité.
const { logApiUsage } = require('./api-usage-tracker.js');

const MIN_TIRAGES_FOR_BILAN = 3;

function formatDateFr(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function buildParcoursPrompt(tirages) {
  // Du plus ancien au plus récent, pour que Claude perçoive une trajectoire
  // plutôt qu'une liste inversée.
  const chrono = [...tirages].reverse();

  const first = formatDateFr(chrono[0].date);
  const last = formatDateFr(chrono[chrono.length - 1].date);

  const entries = chrono.map((t, i) => {
    const cartes = (t.cartes || []).join(', ') || 'non renseignées';
    const intention = t.intention ? `"${t.intention}"` : 'non renseignée';
    const synthese = t.synthese ? t.synthese.replace(/\s+/g, ' ').slice(0, 400) : '';
    return `Tirage ${i + 1} (${formatDateFr(t.date)}) — intention : ${intention} — cartes : ${cartes}${synthese ? ` — synthèse : ${synthese}` : ''}`;
  }).join('\n');

  return `Tu es l'Oracle Oradia, un guide introspectif bienveillant.

Voici l'historique de ${chrono.length} tirages d'un même abonné, du ${first} au ${last} :

${entries}

Rédige un "bilan de parcours" en 3 sections, avec ce ton : chaleureux, précis, jamais générique — comme quelqu'un qui a vraiment suivi ce cheminement, pas un résumé statistique froid.

IMPORTANT : Style d'écriture
- N'utilise JAMAIS de tirets (—) ou de points (•) dans ton texte
- Écris en phrases complètes et fluides, style narratif continu
- Écris exclusivement en français, sans aucun mot ni expression en anglais
- Ne mentionne jamais une date précise inventée : tu peux référencer "vos premiers tirages" ou "ces dernières semaines", jamais un jour précis que tu n'as pas dans les données ci-dessus
- Ne promets jamais de résultat garanti, reste dans l'observation et l'invitation à la réflexion

## Ce qui revient
En 4-5 phrases, quels thèmes, intentions ou familles de cartes reviennent le plus souvent dans ce parcours ? Sois concret et nomme les éléments réels observés ci-dessus, pas des généralités.

## Ce qui a bougé
En 3-4 phrases, y a-t-il une évolution perceptible entre les premiers tirages et les plus récents (changement de ton dans les intentions, de registre de cartes, de préoccupation) ? Si rien ne bouge nettement, dis-le honnêtement plutôt que d'inventer une évolution.

## Une question pour la suite
Un court paragraphe (2-3 phrases) qui propose, à partir de ce qui revient et de ce qui a bougé, une question ou un axe d'attention pour les prochains tirages. Termine sur une note d'encouragement à poursuivre le parcours.

Contraintes : pas de tiret long (—), pas de liste à puces, langage bienveillant.`;
}

function cleanBilanText(text) {
  return String(text || '')
    .replace(/—/g, '')
    .replace(/–/g, '-')
    .replace(/•/g, '')
    .replace(/\s*—\s*/g, ' ')
    .replace(/\s*•\s*/g, ' ')
    .trim();
}

// Découpe la réponse en { recurrent, evolution, question } à partir des titres "## ...".
function splitBilanSections(fullText) {
  const result = { recurrent: '', evolution: '', question: '' };
  const matches = [...(fullText || '').matchAll(/^##\s+(.+)$/gmi)];
  if (!matches.length) { result.recurrent = (fullText || '').trim(); return result; }

  matches.forEach((match, index) => {
    const title = match[1].trim().toLowerCase();
    const start = match.index + match[0].length;
    const end = matches[index + 1] ? matches[index + 1].index : fullText.length;
    const content = fullText.slice(start, end).trim();
    if (title.includes('revient')) result.recurrent = content;
    if (title.includes('bougé')) result.evolution = content;
    if (title.includes('question')) result.question = content;
  });

  return result;
}

// Appelle Claude pour générer le bilan de parcours. Même pattern (modèle,
// retries, logging) que generateAnalysisViaClaude() dans tore-analysis-prompt.js.
async function generateParcoursBilan({ tirages, userEmail }) {
  const prompt = buildParcoursPrompt(tirages);
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
        }).catch(e => console.warn('[generateParcoursBilan] Erreur logging API error:', e.message));
        continue;
      }
      const data = await resp.json();
      logApiUsage({
        apiName: 'anthropic-claude', modelName: model,
        requestTokens: data.usage?.input_tokens ?? null,
        responseTokens: data.usage?.output_tokens ?? null,
        userEmail, status: 'success', requestDurationMs: duration
      }).catch(e => console.warn('[generateParcoursBilan] Erreur logging API usage:', e.message));
      const raw = cleanBilanText(data.content?.[0]?.text || '');
      if (!raw) continue;
      return splitBilanSections(raw);
    } catch (e) {
      console.error('[generateParcoursBilan] Anthropic error:', e.message);
      logApiUsage({
        apiName: 'anthropic-claude', modelName: model, requestTokens: null, responseTokens: null,
        userEmail, status: 'error', errorMessage: e.message, requestDurationMs: Date.now() - startTime
      }).catch(err => console.warn('[generateParcoursBilan] Erreur logging API exception:', err.message));
    }
  }
  return null;
}

module.exports = { MIN_TIRAGES_FOR_BILAN, buildParcoursPrompt, generateParcoursBilan };
