-- Statut transitoire « en_cours » : réservation atomique d'un post social avant son envoi
-- à Make (évite la double publication quand deux crons tombent à la même minute).
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_statut_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_statut_check
  CHECK (statut = ANY (ARRAY['programmé'::text, 'en_cours'::text, 'envoyé'::text, 'échec'::text]));
