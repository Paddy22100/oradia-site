-- Statut de livraison réel des envois de newsletter (newsletter_sends).
--
-- Jusqu'ici, newsletter_sends.sent_at ne prouvait que "l'API Brevo a accepté la
-- requête" — pas que l'email ait été réellement délivré. Un envoi bloqué ou
-- bounced chez le destinataire restait indiscernable d'un envoi réussi, aussi
-- bien dans le journal que dans le badge "Dernière newsletter" du dashboard
-- (newsletter_contacts), qui affichait une coche verte dans les deux cas.
--
-- Cette migration ajoute le nécessaire pour recevoir les événements de suivi
-- Brevo (delivered/opened/click/blocked/softBounced/hardBounced) via le webhook
-- existant (/api/admin/brevo-webhook) et les rattacher au bon envoi via
-- message_id, capturé à l'émission (voir logNewsletterSends dans
-- api/admin/index.js).
--
-- IMPORTANT — action manuelle requise : dans Brevo > Paramètres > Webhooks,
-- l'URL /api/admin/brevo-webhook doit être cochée pour les événements
-- "Delivered", "Opened", "Click", "Blocked" et "Soft bounce" en plus de
-- "Hard bounce" et "Unsubscribed" (déjà utilisés) — sinon ces colonnes
-- resteront vides indéfiniment, sans erreur visible.
--
-- À exécuter dans Supabase > SQL Editor.

ALTER TABLE newsletter_sends
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_type TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_message_id ON newsletter_sends(message_id);

-- Miroir léger sur newsletter_contacts, pour le badge "Dernière newsletter" du
-- dashboard : évite une jointure sur newsletter_sends juste pour un indicateur
-- couleur, cohérent avec last_newsletter_sent_at/last_newsletter_subject déjà
-- présents (supabase-migration-last-newsletter.sql). Mis à jour uniquement si
-- l'événement Brevo concerne bien le DERNIER envoi connu de ce contact — un
-- statut en retard sur un envoi plus ancien ne doit pas écraser un envoi plus
-- récent déjà en cours.
ALTER TABLE newsletter_contacts
  ADD COLUMN IF NOT EXISTS last_newsletter_status TEXT;

COMMENT ON COLUMN newsletter_sends.message_id IS
  'Message-Id retourné par Brevo à l''envoi (/v3/smtp/email) — sert à rattacher les événements de suivi reçus par webhook (delivered/opened/click/blocked/bounced).';
COMMENT ON COLUMN newsletter_contacts.last_newsletter_status IS
  'Dernier statut de livraison connu du dernier envoi (last_newsletter_subject) : delivered, blocked, bounced, ou NULL si encore inconnu (webhook pas encore reçu, ou événements non configurés côté Brevo).';
