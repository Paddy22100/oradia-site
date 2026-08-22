-- Permet à l'admin de saisir manuellement un témoignage reçu hors du
-- formulaire de contact (ex: message Telegram, Facebook) dans
-- support_messages (type='temoignage'), pour qu'il suive le même circuit
-- de modération que les témoignages soumis via le site (publication
-- manuelle depuis le dashboard, respect du choix anonyme/prénom/non).
--
-- email est NOT NULL par défaut (supabase-migration-support-messages.sql)
-- car pensé pour les messages du formulaire de contact, où on peut
-- répondre au client. Un témoignage saisi à la main par l'admin n'a pas
-- toujours une adresse email sous la main — la colonne devient optionnelle.

ALTER TABLE support_messages ALTER COLUMN email DROP NOT NULL;
