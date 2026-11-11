-- Suppression de kickstarter_backers et ulule_backers : Rudy a décidé de ne pas faire de
-- campagne Kickstarter/Ulule finalement. Les deux tables étaient vides (0 ligne, aucun
-- import n'avait jamais été fait) — aucune donnée perdue. Fonctionnalité retirée du code
-- (dashboard admin, cagnotte publique /api/preorders/progress, comptabilité) dans le même
-- lot de commits.

DROP TABLE IF EXISTS kickstarter_backers;
DROP TABLE IF EXISTS ulule_backers;
