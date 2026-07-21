-- ============================================================
-- MIGRATION : Articles de blog gérés depuis le dashboard
-- ============================================================
-- Permet de créer/modifier/publier des articles de blog depuis
-- l'admin, sans redéployer. Les articles statiques existants dans
-- /blog/*.html restent tels quels ; cette table gère les NOUVEAUX.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_articles (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug          TEXT UNIQUE NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,                       -- meta description / chapeau
    cover_image   TEXT,                       -- URL image de couverture (Supabase Storage)
    content_html  TEXT NOT NULL DEFAULT '',   -- corps de l'article (HTML)
    read_minutes  INT DEFAULT 5,
    published     BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blog_articles_published ON blog_articles(published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_articles_slug ON blog_articles(slug);

ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blog_articles_service_role" ON blog_articles;
CREATE POLICY "blog_articles_service_role" ON blog_articles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Lecture publique des articles publiés uniquement (pour la page de rendu)
DROP POLICY IF EXISTS "blog_articles_public_read" ON blog_articles;
CREATE POLICY "blog_articles_public_read" ON blog_articles
    FOR SELECT TO anon USING (published = true);

-- Bucket Storage pour les images d'articles : à créer dans
-- Supabase > Storage > New bucket, nom "blog-images", public.
