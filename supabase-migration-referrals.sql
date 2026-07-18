-- Migration : programme de parrainage ("offre un tirage à un proche")
-- Parrain et filleul reçoivent chacun 1 tirage gratuit supplémentaire.
-- Fonctionne en freemium pur (pas de compte requis) : le code de parrainage
-- est généré côté navigateur (localStorage), cette table sert uniquement à
-- faire le lien entre "un filleul a converti avec le code X" et "le parrain
-- qui détient le code X peut venir réclamer son bonus" — sans jamais avoir
-- besoin de connaître l'identité ni l'email de personne.

CREATE TABLE IF NOT EXISTS referral_conversions (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code         TEXT NOT NULL,
    converted_at TIMESTAMPTZ DEFAULT NOW(),
    claimed_at   TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_conversions_code    ON referral_conversions(code);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_claimed ON referral_conversions(claimed_at) WHERE claimed_at IS NULL;

ALTER TABLE referral_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_conversions_service_role" ON referral_conversions;
CREATE POLICY "referral_conversions_service_role" ON referral_conversions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE referral_conversions IS
    'Une ligne par filleul ayant complété son premier tirage via un lien de '
    'parrainage. claimed_at se remplit quand le parrain (identifié uniquement '
    'par son code, détenu dans son localStorage) vient réclamer son bonus.';
