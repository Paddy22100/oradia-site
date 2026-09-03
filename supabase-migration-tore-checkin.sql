-- Suivi du mot de passe provisoire + check-in J+7 (abonné sans tirage depuis son paiement)
-- must_change_password : reflète côté tore_subscriptions le flag équivalent stocké dans
--   user_metadata (Supabase Auth), pour pouvoir l'afficher/le filtrer dans le dashboard
--   sans appel à l'API Admin Auth. Mis à true à la création du compte quand un mot de
--   passe provisoire est émis ; remis à false par l'abonné lui-même à sa première connexion
--   (member/login.html → /api/auth/mark-password-changed).
--   Volontairement NULLABLE SANS valeur par défaut : NULL = "non suivi" (abonné créé avant
--   la mise en place de ce système), à distinguer de false = "on sait qu'il a changé son mot
--   de passe". Un DEFAULT false aurait affiché à tort tous les abonnés existants comme
--   "mot de passe changé" alors qu'on n'en sait rien pour eux.
-- checkin_email_sent_at : empêche de renvoyer plusieurs fois le mail de relance J+7.
-- À exécuter dans Supabase → SQL Editor.

ALTER TABLE tore_subscriptions
  ADD COLUMN IF NOT EXISTS must_change_password boolean,
  ADD COLUMN IF NOT EXISTS checkin_email_sent_at timestamptz;

COMMENT ON COLUMN tore_subscriptions.must_change_password IS
  'true = mot de passe provisoire jamais remplacé (accès potentiellement bloqué). false = remplacé par l''abonné. NULL = non suivi (compte créé avant ce système).';

COMMENT ON COLUMN tore_subscriptions.checkin_email_sent_at IS
  'Date d''envoi du mail de relance "vous n''avez pas fait de tirage depuis votre abonnement" (J+7). Empêche les doublons.';
