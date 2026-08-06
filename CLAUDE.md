# CLAUDE.md — Oradia Site

Ce fichier est lu automatiquement par Claude Code à chaque session.
Il décrit l'architecture du projet, les règles à respecter, et les audits à effectuer.

---

## Stack technique

- **Front** : HTML/CSS/JS vanilla (pas de framework)
- **Hébergement** : Vercel (Hobby plan — limite de 12 fonctions serverless)
- **Base de données** : Supabase (PostgreSQL)
- **Paiement** : Stripe (single-draw à 3,90€)
- **Emails** : Brevo (transactionnel + newsletter, list ID 5)
- **IA** : Anthropic API (claude-haiku-4-5, streaming)
- **QRNG** : Outshift QRNG/Cisco (source principale), ANU Quantum Random Numbers API (source de secours, plan gratuit limité), repli crypto local en dernier recours
- **Repo GitHub** : Paddy22100/oradia-site
- **IDE** : Devin Desktop (SWE-1.5)

---

## Conventions importantes

- Convention de déploiement Vercel : `tore-vX.Y.Z-tag`
- Ne jamais dépasser 12 fonctions serverless sur Vercel (Hobby plan)
- Les variables d'environnement sensibles ne doivent jamais apparaître côté client
- La logique freemium repose sur **localStorage** (2 tirages gratuits à vie)
- Le tirage payant passe par Stripe, déclenche un webhook Supabase, puis envoie un email Brevo

---

## Base de données — Tables actives et politique de rétention

### Tables actives (état vérifié en production — juin 2026)

| Table | Rôle | Notes |
|---|---|---|
| `preorders` | Précommandes physiques (Stripe) | colonnes relay ajoutées par `mondial-relay-migration.sql` |
| `donors` | Dons libres (contribution-libre) | — |
| `newsletter_contacts` | Inscriptions newsletter/waitlist → Brevo list 5 + contacts ajoutés manuellement (catégories `tags`) | migrations : `supabase-migration-missing-tables.sql`, `supabase-migration-contact-tags.sql` |
| `tore_subscriptions` | Membres actifs pour tirages en ligne | migration : `supabase-migration-missing-tables.sql` |
| `tirages` | Historique des tirages par user (RLS stricte) | purge auto : 20 max par user |
| `newsletter_drafts` | Brouillons de newsletter (5 lignes) | géré par le dashboard admin |
| `newsletter_ideas` | Idées de newsletter (0 ligne) | table feature, à garder |
| `observation_windows` | Fenêtres d'observation actives (20 lignes) | liée aux tirages |
| `users` | Profils membres (0 ligne — auth gérée par Supabase Auth) | table publique miroir de auth.users |
| `support_messages` | Messages support / témoignages / suggestions | migration : `supabase-migration-support-messages.sql` |

### Politique de rétention — table `tirages`

- **Maximum 20 tirages par utilisateur** (purge automatique via trigger `trg_trim_tirages_history`)
- Le trigger s'exécute après chaque INSERT — les plus anciens sont supprimés automatiquement
- Durée de conservation : indéfinie tant que l'utilisateur conserve son compte
- En cas de suppression de compte (`ON DELETE CASCADE`), tous les tirages sont supprimés
- **Confidentialité** : chaque utilisateur ne peut lire QUE ses propres tirages (RLS `auth.uid() = user_id`)
- Le service_role (fonctions serverless) garde un accès complet pour les besoins d'audit admin

### Tables supprimées (ménage juin 2026)

- `credits` (0 ligne) — concept "crédits Traversée" abandonné — **supprimée**
- `subscriptions` (0 ligne) — doublon de `tore_subscriptions` — **supprimée**
- `waitlist_tirages` — n'existait pas en production
- `precommande_subscribers` — n'existait pas en production
- `analytics_events` — n'existait pas en production

---

## Audit pré-production — à exécuter à chaque session

Quand je te demande de faire un audit ou de "tout vérifier", exécute les vérifications suivantes dans l'ordre :

### 1. SÉCURITÉ — Variables d'environnement

- [ ] Rechercher toute occurrence de `sk_live_`, `sk_test_`, `STRIPE_`, `SUPABASE_`, `BREVO_`, `ANTHROPIC_` dans les fichiers `.js`, `.html`, `.ts` du dossier `/public` ou tout fichier servi côté client
- [ ] Vérifier que `.env`, `.env.local`, `.env.production` sont bien dans `.gitignore`
- [ ] Vérifier que les clés API ne sont utilisées que dans les fonctions serverless (`/api/`)
- [ ] Signaler tout fichier suspect avec le nom du fichier et la ligne

### 2. STRIPE — Flux de paiement

- [ ] Localiser le fichier qui crée la session Stripe (`checkout.session.create` ou `paymentIntent`)
- [ ] Vérifier que le montant est bien `390` (centimes = 3,90€) et la devise `eur`
- [ ] Vérifier que le webhook Stripe est bien vérifié avec `stripe.webhooks.constructEvent` et la signature `STRIPE_WEBHOOK_SECRET`
- [ ] Vérifier que les cas d'erreur du webhook (`payment_intent.payment_failed`, etc.) sont gérés
- [ ] Vérifier la cohérence entre les events Stripe écoutés et ceux déclarés dans le dashboard (à confirmer manuellement)

### 3. SUPABASE — Base de données et webhooks

- [ ] Vérifier que toutes les requêtes Supabase utilisent le client avec la clé `SERVICE_ROLE` uniquement côté serveur (jamais `anon` key côté client pour des opérations sensibles)
- [ ] Vérifier que les tables impliquées dans le flux tirage existent bien dans le schéma (lire les fichiers de migration si présents)
- [ ] Vérifier que les webhooks entrants de Supabase sont bien authentifiés (header secret ou vérification de signature)
- [ ] Identifier les tables : `newsletter_ideas`, `newsletter_drafts`, et les tables liées aux tirages — signaler si une table référencée dans le code n'a pas de migration correspondante

### 4. BREVO — Emails transactionnels

- [ ] Vérifier que l'envoi d'email post-tirage utilise bien l'API Brevo (pas SMTP direct)
- [ ] Vérifier que la clé API Brevo n'est utilisée que côté serveur
- [ ] Identifier le template email post-tirage et vérifier que les variables dynamiques injectées (données du tirage) correspondent aux clés disponibles dans sessionStorage/response API
- [ ] Vérifier que la liste newsletter utilise bien le list ID `5`
- [ ] **Zéro duplication de template email** — voir règle ci-dessous, à vérifier pour tout nouveau type d'email ou modification d'un template existant

#### Règle : un template email = une seule fonction, jamais une copie

Chaque email transactionnel (confirmation abonnement, paiement échoué, précommande,
guidance, newsletter, etc.) doit exister en **un seul exemplaire**, sous forme de
fonction exportée dans `lib/` (ex. `lib/tore-subscription-email.js`,
`lib/guidance-email.js`, `lib/brevo-order-email.js`, ou une fonction exportée
d'`api/waitlist.js`). Cette même fonction doit être appelée :

1. par le code qui envoie réellement l'email au client (webhook Stripe, webhook
   Cal.com, inscription newsletter, etc.) ;
2. par le bouton "Envoyer test" correspondant dans l'onglet Mails du dashboard
   admin (`action=test-email` / `action=test-subscription-email` dans
   `api/admin/index.js`).

**Ne jamais** écrire une deuxième version du HTML directement dans le handler de
test — même "juste pour prévisualiser". Cause identifiée en 2026-08 : plusieurs
boutons de test avaient fini par envoyer une copie figée et obsolète, différente
de l'email réellement reçu par les clients, ce qui a rendu le diagnostic d'un bug
de production (abonnés sans accès) très difficile à repérer depuis le dashboard.

Avant d'ajouter un nouveau type d'email ou un nouveau bouton de test : créer/
réutiliser la fonction partagée d'abord, appeler cette fonction des deux côtés
avec des données d'exemple pour le test. Si un audit trouve un bouton de test qui
construit son propre HTML au lieu d'appeler une fonction partagée, c'est un
problème à signaler en priorité (catégorie "Problèmes importants").

### 5. LOGIQUE FREEMIUM — localStorage

- [ ] Localiser le code qui gère les 2 tirages gratuits dans `localStorage`
- [ ] Vérifier que le compteur est bien incrémenté APRÈS un tirage réussi (pas avant)
- [ ] Vérifier que le fallback vers Stripe est bien déclenché quand le compteur atteint 2
- [ ] Signaler si le compteur pourrait être contourné côté client (c'est acceptable pour du freemium, mais le noter)

### 6. ANTHROPIC API — Streaming

- [ ] Vérifier que l'appel à `claude-haiku-4-5` est bien fait côté serveur (fonction Vercel)
- [ ] Vérifier que le streaming est correctement géré avec `stream: true` et que les chunks sont bien transmis au client
- [ ] Vérifier que `max_tokens` est bien défini (pas de valeur par défaut implicite)
- [ ] Vérifier qu'il y a un timeout ou une gestion d'erreur si l'API Anthropic ne répond pas

### 7. VERCEL — Fonctions serverless

- [ ] Compter le nombre de fichiers dans `/api/` — signaler si > 12
- [ ] Vérifier que chaque fonction a bien un `export default` valide
- [ ] Vérifier que les fonctions qui doivent être protégées vérifient une autorisation avant d'agir
- [ ] Identifier les fonctions liées à la newsletter (5 routes API) et vérifier leur cohérence

### 8. TORE — Expérience de tirage (tore.html)

- [ ] Vérifier la logique d'animation de flip des cartes : les états CSS sont-ils bien gérés ?
- [ ] Identifier les clés `sessionStorage` utilisées pour stocker les données d'analyse du tirage
- [ ] Vérifier que ces clés sont bien lues par la fonction qui génère le template email
- [ ] Vérifier que le flux QRNG (ANU API) a un fallback si l'API est indisponible (Math.random() ou autre)

---

## À la fin de chaque audit

Produis un rapport structuré avec :

1. **Problèmes critiques** (sécurité, données exposées, flux cassés) — à corriger avant tout déploiement
2. **Problèmes importants** (logique incorrecte, gestion d'erreur manquante)
3. **Points à vérifier manuellement** (ce que tu ne peux pas tester sans accès aux services réels)
4. **OK** — ce qui est correct

---

## Ce que Claude Code ne peut PAS vérifier sans intervention manuelle

- La validité des clés API en production (Stripe live, Supabase, Brevo)
- Les variables d'environnement réellement configurées sur Vercel
- Le bon fonctionnement des webhooks en conditions réelles
- La réception effective des emails Brevo

Ces points doivent être vérifiés directement dans les dashboards Stripe, Supabase, Brevo et Vercel.
