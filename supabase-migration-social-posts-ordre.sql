-- Suivi séquentiel de l'étape du parcours utilisée pour la publication automatique
-- des réseaux sociaux du mercredi.
--
-- Remplace la logique précédente (choisir, parmi les emails réellement envoyés ce
-- passage-ci, celui à l'ordre le plus élevé hors étape 1) par un avancement simple
-- et prévisible : chaque mercredi, la publication automatique utilise l'étape
-- validée dont l'ordre suit immédiatement la dernière déjà utilisée pour une
-- publication (9, puis 10, puis 11...), indépendamment de qui a effectivement reçu
-- quoi par email cette semaine-là. Étape 1 toujours exclue (accueil des tout
-- nouveaux inscrits, jamais publié).
--
-- La colonne ordre permet de retrouver cette dernière étape utilisée sans dépendre
-- d'un rapprochement fragile par sujet.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS ordre INTEGER;

-- Backfill de l'historique connu (rapproché par sujet exact avec newsletter_drafts,
-- canal='parcours') — sans lui, la file "prochaine étape non encore utilisée"
-- repartirait de l'étape 1 alors que les étapes 1 à 8 ont déjà été publiées.
UPDATE social_posts SET ordre = 1 WHERE subject = 'Rudy d''ORADIA - Nous sommes tous des pêcheurs' AND ordre IS NULL;
UPDATE social_posts SET ordre = 2 WHERE subject = 'Rudy d''ORADIA - Les 3 temps.' AND ordre IS NULL;
UPDATE social_posts SET ordre = 3 WHERE subject = 'Rudy d''ORADIA - Quand les cartes éclairent ce qui agit en toi' AND ordre IS NULL;
UPDATE social_posts SET ordre = 4 WHERE subject = 'Rudy d''ORADIA - Ce que tu caches cherche à être entendu' AND ordre IS NULL;
UPDATE social_posts SET ordre = 5 WHERE subject = 'Rudy d''ORADIA - L''inconscient, cet ange-gardien qui garde la clé' AND ordre IS NULL;
UPDATE social_posts SET ordre = 6 WHERE subject = 'Rudy d''ORADIA - Et si votre futur pouvait vous répondre ?' AND ordre IS NULL;
UPDATE social_posts SET ordre = 7 WHERE subject = 'Rudy d''ORADIA - Le veilleur intérieur' AND ordre IS NULL;
UPDATE social_posts SET ordre = 8 WHERE subject = 'Rudy d''ORADIA - Le temps n''est pas dans l''horloge' AND ordre IS NULL;
