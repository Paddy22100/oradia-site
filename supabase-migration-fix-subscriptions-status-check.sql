-- supabase-migration-fix-subscriptions-status-check.sql
-- Corrige la contrainte CHECK sur tore_subscriptions.status, qui en production
-- n'autorisait que ('active', 'revoked') — ajoutée hors de tout fichier de migration
-- suivi ici, probablement via l'éditeur de table Supabase, sans jamais être mise à
-- jour quand le webhook Stripe (api/stripe-webhook.js) a commencé à écrire
-- 'payment_failed' et 'cancelled'.
--
-- Conséquence en prod (2026-10-23 → 2026-10-26, 3 occurrences, 2 abonnés) : le
-- webhook Stripe plantait sur customer.subscription.deleted et sur l'échec d'un
-- prélèvement — la mise à jour du statut échouait silencieusement (abonné resté
-- 'active' dans la base malgré un paiement en échec ou une résiliation côté
-- Stripe), et l'email de notification correspondant n'était jamais envoyé
-- (le throw empêche d'atteindre sendSubscriptionEmail).
--
-- Déjà appliquée directement en production via Supabase MCP le 2026-10-27 —
-- ce fichier documente la correction pour que le schéma suivi en repo
-- corresponde à la réalité. CREATE TABLE IF NOT EXISTS tore_subscriptions dans
-- supabase-migration-missing-tables.sql ne pose explicitement aucune contrainte
-- CHECK et documente déjà ces 5 valeurs dans son commentaire — c'est cette
-- intention d'origine qui est restaurée ici, pas une nouvelle règle.

ALTER TABLE tore_subscriptions DROP CONSTRAINT IF EXISTS tore_subscriptions_status_check;
ALTER TABLE tore_subscriptions ADD CONSTRAINT tore_subscriptions_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'payment_failed'::text, 'cancelled'::text, 'pending'::text]));
