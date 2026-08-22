-- Témoignages reçus via Telegram (communauté), saisis manuellement à la
-- demande de Rudy — pas soumis via le formulaire de contact du site.
-- Nécessite d'avoir exécuté supabase-migration-testimonials-manual.sql avant
-- (email devient optionnel sur support_messages).
--
-- Non publiés par défaut : à valider et publier depuis le dashboard admin
-- (onglet Témoignages → "Publier sur le site"), comme pour tout témoignage.

INSERT INTO support_messages (type, email, name, publication, message, status, admin_note) VALUES
('temoignage', NULL, 'Marlyse', 'prenom',
 'La réponse reçue par votre oracle est incroyablement ajustée à ce que je constate, ce qu''un médium m''a dit, ainsi que d''autres personnes dans mon environnement qui m''ont fait un retour de ce qu''ils perçoivent dans mon énergie sur le point précis de ma question. Bravo pour votre travail !',
 'read', 'Recueilli manuellement — source : Telegram'),
('temoignage', NULL, 'Sylvie', 'prenom',
 'Je viens d''utiliser ton oracle. Vraiment excellent ! Je vais d''ailleurs commander les cartes. Bravo, très beau travail.',
 'read', 'Recueilli manuellement — source : Telegram'),
('temoignage', NULL, 'Sophie', 'prenom',
 'Moi aussi j''ai été impressionnée de la justesse. Merci infiniment.',
 'read', 'Recueilli manuellement — source : Telegram');
