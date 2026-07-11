-- Migration : création du bucket Supabase Storage pour les images newsletter
-- À exécuter dans Supabase > SQL Editor

-- Crée le bucket public "newsletter-uploads" s'il n'existe pas déjà
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'newsletter-uploads',
  'newsletter-uploads',
  true,
  5242880,  -- 5 Mo max par fichier
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Politique : le service_role peut tout faire (upload via l'API admin)
CREATE POLICY "service_role full access newsletter-uploads"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'newsletter-uploads')
WITH CHECK (bucket_id = 'newsletter-uploads');

-- Politique : lecture publique (les images sont accessibles dans les emails)
CREATE POLICY "public read newsletter-uploads"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'newsletter-uploads');

-- Vérification
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'newsletter-uploads';
