-- Catégorie « spam » dans le dashboard (Support technique) : un message peut être
-- marqué comme spam depuis le dashboard, sans être supprimé. Élargit uniquement la
-- contrainte sur support_messages.status ; aucune donnée n'est modifiée.
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_status_check;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_status_check
  CHECK (status = ANY (ARRAY['new'::text, 'read'::text, 'archived'::text, 'replied'::text, 'spam'::text]));
