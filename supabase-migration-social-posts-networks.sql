-- Sélection des réseaux (Facebook/Instagram/LinkedIn) par publication programmée.
--
-- Jusqu'ici, toute ligne social_posts envoyée à Make.com déclenchait
-- systématiquement les 3 réseaux (le scénario Make ne recevait aucune information
-- pour en exclure un). Ajoute une colonne networks pour que le dashboard admin
-- (case à cocher par réseau, les 3 cochées par défaut) puisse transmettre ce choix
-- jusqu'au webhook Make.com — à charge pour le scénario Make d'ajouter un filtre
-- sur chaque module (Facebook Pages / Instagram / LinkedIn) qui lit
-- {{1.networks.facebook}}, {{1.networks.instagram}}, {{1.networks.linkedin}}
-- (ou send_facebook/send_instagram/send_linkedin, envoyés en parallèle pour
-- compatibilité avec un filtre Make simple sur un booléen à plat).
--
-- Par défaut, les 3 réseaux restent activés (comportement inchangé pour toute
-- ligne existante ou insérée sans préciser networks).

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS networks JSONB NOT NULL
  DEFAULT '{"facebook":true,"instagram":true,"linkedin":true}'::jsonb;
