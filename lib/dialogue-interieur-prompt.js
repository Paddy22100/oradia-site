// lib/dialogue-interieur-prompt.js
// Construit le prompt de clôture (négociation / remerciement / réintégration)
// de l'expérience "Le Dialogue Intérieur" — un tirage complet du Tore
// (drawSevenCards, voir lib/tore-deck.js), révélé une carte à la fois, chaque
// famille portant un rôle précis dans un protocole d'externalisation inspiré
// de la série documentaire "À la recherche du Code Source" (Kevin Finel) et
// du travail avec les parts (IFS, Voice Dialogue, Gestalt) : localiser une
// tension, lui donner une forme, identifier l'émotion et le besoin qu'elle
// touche, rencontrer la part qui la porte (famille Archétypes), dialoguer
// avec elle, puis l'intégrer dans un chemin d'action et un contexte plus
// large (Mémoire Cosmos). Isolé dans ce fichier plutôt qu'inline dans
// api/admin/index.js pour pouvoir être réutilisé tel quel si l'expérience
// quitte un jour le statut de test admin-only.
const { logApiUsage } = require('./api-usage-tracker.js');

// Décrit une carte pour le prompt : nom, famille, citation, et la réponse
// libre éventuellement recueillie à cette étape du protocole.
function describeCard(card, reponseLabel, reponseValue) {
  if (!card) return '';
  const base = `Carte "${card.name}" (famille ${card.familyLabel || card.family}), citation : "${card.quote || ''}"`;
  return reponseValue ? `${base}\n${reponseLabel} : "${reponseValue}"` : base;
}

function buildDialogueSynthesisPrompt({ intention, cards, reponses }) {
  const byFamily = {};
  (cards || []).forEach(c => { byFamily[c.family] = c; });
  const r = reponses || {};

  const sections = [
    `Étape 1 (Émotions, ce que cette part vient chatouiller) :\n${describeCard(byFamily.emotions, "L'émotion nommée par l'utilisateur", r.emotion)}`,
    `Étape 2 (Besoins, une fois la part externalisée et dotée d'une forme) :\n${describeCard(byFamily.besoins, "Le besoin nommé par l'utilisateur", r.besoin)}`,
    `Étape 3 (Transmutation, la direction vers laquelle cela peut se transformer) :\n${describeCard(byFamily.transmutation)}`,
    `Étape 4 (Archétypes, la part elle-même, avec qui le dialogue a lieu) :\n${describeCard(byFamily.archetypes)}\nÀ la question "à quoi sers-tu ?", la réponse venue a été : "${r.sert || ''}"\nÀ la question "qu'aimerais-tu que je comprenne ?", la réponse venue a été : "${r.comprendre || ''}"\nÀ la question "que protèges-tu ?", la réponse venue a été : "${r.protege || ''}"`,
    `Étape 5 (Révélations, la clé qui se présente) :\n${describeCard(byFamily.revelations, "Ce que cette clé a inspiré à l'utilisateur", r.cle)}`,
    `Étape 6 (Actions, ce que ce chemin appelle à entreprendre) :\n${describeCard(byFamily.actions, "Ce que l'utilisateur sent devoir entreprendre", r.action)}`,
    `Étape 7 (Mémoire Cosmos, le contexte plus vaste dans lequel ce dialogue s'inscrit) :\n${describeCard(byFamily.memoire_cosmos)}`
  ].join('\n\n');

  return `Tu es l'Oracle Oradia, un guide introspectif bienveillant.

Un utilisateur vient de vivre un protocole complet de dialogue intérieur, inspiré des pratiques humaines d'externalisation de la souffrance (lui donner une forme, un nom, pour pouvoir lui parler) et du travail avec les parts de soi. Sept cartes de l'oracle, une par famille, se sont présentées successivement pour porter chaque étape de ce chemin.

La tension qu'il porte, telle qu'il l'a décrite au départ : "${intention || 'une tension non précisée'}"

${sections}

Rédige le texte de clôture de cette séance (négociation, remerciement, réintégration), avec ce ton : chaleureux, précis, jamais générique.

IMPORTANT : Style d'écriture
- Adresse-toi directement à l'utilisateur en "vous" — jamais "je" (tu parles DE cette part et DE ce dialogue, tu n'es pas la part elle-même qui parle)
- Reconstitue le chemin parcouru à travers les 7 cartes dans un texte narratif fluide, sans jamais les énumérer comme une liste ni les désigner par un numéro d'étape : nomme chaque carte à l'endroit naturel du récit, et jamais deux noms de carte accolés en un seul groupe nominal avec leur famille
- Prends appui sur la carte Archétypes comme le cœur du dialogue : c'est avec elle que la négociation et le remerciement ont lieu, les autres cartes éclairent le chemin autour
- Si une réponse n'a pas été donnée à une étape, ne l'invente pas : appuie-toi sur la carte elle-même et sur les réponses qui existent
- Remercie la part avec des mots qui reprennent ce que l'utilisateur a écrit, puis propose une transformation cohérente avec le protocole (une couleur qui s'apaise, une taille qui diminue, un éloignement, un relâchement)
- Relie la carte Mémoire Cosmos à une ouverture finale qui inscrit ce dialogue intime dans quelque chose de plus vaste, sans emphase excessive
- Termine par une invitation courte à respirer et à revenir, sans jamais promettre de résultat garanti
- Aucun vocabulaire médical, thérapeutique ou psychiatrique : ceci est un rituel symbolique, pas un soin
- N'utilise JAMAIS de tirets (—) ni de listes à puces : un texte narratif continu et fluide
- Écris exclusivement en français, sans aucun mot ni expression en anglais
- Longueur : 180 à 260 mots

Avant de répondre, relis l'intégralité du texte et corrige silencieusement toute faute : accords sujet-verbe avec "vous" (vous repoussez, pas vous repousse) y compris dans une subordonnée éloignée, et aucun mot tronqué ou mal orthographié.`;
}

// Appelle Claude pour générer la synthèse de clôture. Mêmes conventions que
// generateAnalysisViaClaude (lib/tore-analysis-prompt.js) : modèle, timeout,
// logging d'usage API — dupliqué plutôt que partagé car le découpage en
// sections (## Cartes / ## Explorer...) ne s'applique pas ici, la réponse
// est un texte de clôture unique.
async function generateDialogueSynthesis({ intention, cards, reponses, userEmail }) {
  const prompt = buildDialogueSynthesisPrompt({ intention, cards, reponses });
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
  const startTime = Date.now();

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 700, temperature: 0.7, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(25000)
    });
    const duration = Date.now() - startTime;
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      logApiUsage({
        apiName: 'anthropic-claude', modelName: model, requestTokens: null, responseTokens: null,
        userEmail, status: 'error', errorMessage: err.error?.message || 'Unknown error', requestDurationMs: duration
      }).catch(e => console.warn('[generateDialogueSynthesis] Erreur logging API error:', e.message));
      return null;
    }
    const data = await resp.json();
    logApiUsage({
      apiName: 'anthropic-claude', modelName: model,
      requestTokens: data.usage?.input_tokens ?? null,
      responseTokens: data.usage?.output_tokens ?? null,
      userEmail, status: 'success', requestDurationMs: duration
    }).catch(e => console.warn('[generateDialogueSynthesis] Erreur logging API usage:', e.message));
    const text = (data.content?.[0]?.text || '').replace(/—/g, '').trim();
    return text || null;
  } catch (e) {
    console.error('[generateDialogueSynthesis] Anthropic error:', e.message);
    logApiUsage({
      apiName: 'anthropic-claude', modelName: model, requestTokens: null, responseTokens: null,
      userEmail, status: 'error', errorMessage: e.message, requestDurationMs: Date.now() - startTime
    }).catch(err => console.warn('[generateDialogueSynthesis] Erreur logging API exception:', err.message));
    return null;
  }
}

module.exports = { buildDialogueSynthesisPrompt, generateDialogueSynthesis };
