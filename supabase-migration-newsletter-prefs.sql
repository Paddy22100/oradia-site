-- ============================================================
-- Préférences newsletter granulaires (member/parametres.html)
-- ============================================================
-- Remplace l'ancien interrupteur "Newsletter" unique (qui n'écrivait en réalité
-- que dans le localStorage du navigateur, jamais transmis au serveur) par 3
-- préférences réelles, une par type de contenu envoyé :
--   - pref_tirage_dimanche      : le tirage thématique du dimanche (cron-tirage-hebdo)
--   - pref_newsletter_mercredi  : réflexions & guidance hebdomadaires (cron-send-parcours-individual)
--   - pref_actualites_offres    : actualités, nouveautés, promotions et offres ponctuelles
--                                 (newsletters manuelles du Carnet + campagnes promo)
--
-- DEFAULT true : préserve le comportement actuel pour tous les abonnés déjà
-- inscrits (personne n'est désabonné silencieusement par cette migration).
ALTER TABLE newsletter_contacts
  ADD COLUMN IF NOT EXISTS pref_tirage_dimanche     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_newsletter_mercredi  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_actualites_offres    boolean NOT NULL DEFAULT true;
