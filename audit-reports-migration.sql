-- Migration Supabase : table de stockage des rapports d'audit quotidien
-- Permet d'afficher l'état du dernier audit dans le dashboard admin.

CREATE TABLE IF NOT EXISTS audit_reports (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_url TEXT NOT NULL,
  global_score INTEGER,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_issues JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Sécurité : la table n'est accessible que via la clé service_role
-- (utilisée par GitHub Actions pour écrire, et par l'API admin pour lire).
ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE audit_reports IS 'Historique des rapports d''audit automatique quotidien (audit/audit-oradia.js)';
COMMENT ON COLUMN audit_reports.scores IS 'Scores par catégorie, ex: {"Sécurité": 92, "SEO": 80, ...}';
COMMENT ON COLUMN audit_reports.summary IS 'Compteurs globaux, ex: {"critical": 0, "important": 2, "minor": 5, "ok": 40}';
COMMENT ON COLUMN audit_reports.top_issues IS 'Liste des problèmes critiques/importants détectés, ex: [{"level":"critical","category":"Sécurité","title":"...","detail":"..."}]';

-- Index pour récupérer rapidement le dernier rapport
CREATE INDEX IF NOT EXISTS idx_audit_reports_created_at ON audit_reports (created_at DESC);
