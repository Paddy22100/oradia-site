-- Concordance Oracle ↔ Yi King (dashboard admin, voir lib/structure/concordance-tirage.js) :
-- score (par figure dérivée + global) et verdict jugés par le modèle, comparant le texte
-- réellement reçu par l'utilisateur à la structure Yi King cachée de son tirage. Calculé
-- automatiquement après chaque tirage (manuel ou programmé) dès que l'analyse/synthèse est
-- disponible ; jamais exposé côté client, usage admin uniquement.

ALTER TABLE tirages ADD COLUMN IF NOT EXISTS concordance_yiking JSONB;
ALTER TABLE tirages ADD COLUMN IF NOT EXISTS concordance_computed_at TIMESTAMPTZ;
