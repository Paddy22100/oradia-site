-- Normalisation des e-mails (minuscules, sans espaces) + fusion des doublons de casse.
-- Cause : "Salamandre37@x.com" et "salamandre37@x.com" coexistaient comme deux contacts
-- distincts (index UNIQUE sensible à la casse), d'où double newsletter et risque de
-- contourner toute logique par e-mail (essais gratuits, parrainage).
-- Idempotent : peut être relancé sans risque. À exécuter dans le SQL Editor Supabase.

-- ── 1. newsletter_contacts : fusion des doublons de casse ─────────────────────────
-- On garde la fiche la plus ancienne et on y reporte tags, nom, téléphone ; si l'une
-- des fiches est désinscrite, la fiche conservée l'est aussi (on respecte l'opt-out).
CREATE TEMP TABLE _nl_dups AS
SELECT r.id, k.id AS keep_id
FROM (
  SELECT id, lower(btrim(email)) AS norm,
         row_number() OVER (PARTITION BY lower(btrim(email)) ORDER BY created_at ASC, id ASC) AS rn
  FROM newsletter_contacts
) r
JOIN (
  SELECT id, lower(btrim(email)) AS norm FROM (
    SELECT id, email,
           row_number() OVER (PARTITION BY lower(btrim(email)) ORDER BY created_at ASC, id ASC) AS rn
    FROM newsletter_contacts
  ) z WHERE rn = 1
) k ON k.norm = r.norm
WHERE r.rn > 1;

UPDATE newsletter_contacts c SET
  tags = (
    SELECT COALESCE(array_agg(DISTINCT t), ARRAY['general']::text[])
    FROM newsletter_contacts x, unnest(COALESCE(x.tags, ARRAY[]::text[])) AS t
    WHERE x.id = c.id OR x.id IN (SELECT id FROM _nl_dups WHERE keep_id = c.id)
  ),
  full_name = COALESCE(c.full_name, (
    SELECT x.full_name FROM newsletter_contacts x
    WHERE x.id IN (SELECT id FROM _nl_dups WHERE keep_id = c.id) AND x.full_name IS NOT NULL LIMIT 1
  )),
  phone = COALESCE(c.phone, (
    SELECT x.phone FROM newsletter_contacts x
    WHERE x.id IN (SELECT id FROM _nl_dups WHERE keep_id = c.id) AND x.phone IS NOT NULL LIMIT 1
  )),
  status = CASE WHEN EXISTS (
    SELECT 1 FROM newsletter_contacts x
    WHERE x.id IN (SELECT id FROM _nl_dups WHERE keep_id = c.id) AND x.status = 'unsubscribed'
  ) THEN 'unsubscribed' ELSE c.status END
WHERE c.id IN (SELECT keep_id FROM _nl_dups);

DELETE FROM newsletter_contacts WHERE id IN (SELECT id FROM _nl_dups);
DROP TABLE _nl_dups;

-- ── 2. tore_emails : même principe (on garde la ligne la plus ancienne) ───────────
DELETE FROM tore_emails a
USING tore_emails b
WHERE lower(btrim(a.email)) = lower(btrim(b.email))
  AND a.ctid > b.ctid;

-- ── 3. Mise en minuscules de l'existant ───────────────────────────────────────────
UPDATE newsletter_contacts SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));
UPDATE tore_emails        SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));

-- ── 4. Garde-fou permanent : tout INSERT/UPDATE normalise l'e-mail avant la
--      vérification d'unicité, quel que soit le code appelant (site, dashboard,
--      sync Brevo, import CSV, webhook Stripe…).
CREATE OR REPLACE FUNCTION normalize_email_lower() RETURNS trigger AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_email ON newsletter_contacts;
CREATE TRIGGER trg_normalize_email
  BEFORE INSERT OR UPDATE OF email ON newsletter_contacts
  FOR EACH ROW EXECUTE FUNCTION normalize_email_lower();

DROP TRIGGER IF EXISTS trg_normalize_email ON tore_emails;
CREATE TRIGGER trg_normalize_email
  BEFORE INSERT OR UPDATE OF email ON tore_emails
  FOR EACH ROW EXECUTE FUNCTION normalize_email_lower();
