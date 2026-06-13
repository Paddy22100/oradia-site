-- Migration : onglet "Communication" (newsletter + emails promotionnels)
-- À exécuter dans Supabase → SQL Editor
-- Toutes les instructions sont protégées (IF NOT EXISTS) : sans danger si déjà appliquées.

-- 1. Colonnes additionnelles sur newsletter_drafts
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'newsletter';
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS extra jsonb DEFAULT '{}'::jsonb;
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS intention text;
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'brouillon';
ALTER TABLE newsletter_drafts ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Contrainte sur le type de communication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_drafts_type_check'
  ) THEN
    ALTER TABLE newsletter_drafts
      ADD CONSTRAINT newsletter_drafts_type_check CHECK (type IN ('newsletter', 'promo'));
  END IF;
END $$;

-- 2. Table newsletter_ideas (carnet de fragments) — créée si absente
CREATE TABLE IF NOT EXISTS newsletter_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE newsletter_ideas ENABLE ROW LEVEL SECURITY;
