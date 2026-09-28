-- ============================================================
-- Retire la colonne single_draw_credits (ancien tirage unique à 3,90€)
-- ============================================================
-- Le tirage unique payant a été entièrement retiré du code (checkout Stripe,
-- webhook, endpoint de décompte api/auth/consume-tore-draw) : voir commit
-- "chore(tore): retire tout le code résiduel de l'ancien tirage unique à 3,90€".
-- La colonne n'était plus référencée nulle part et toutes les lignes en
-- production avaient une valeur de 0 (vérifié avant suppression).
--
-- Déjà exécutée directement en production (2026-09-28, via MCP Supabase).
-- Conservée ici pour la traçabilité du schéma, comme les autres migrations
-- du dépôt.
-- ============================================================

ALTER TABLE tore_subscriptions DROP COLUMN IF EXISTS single_draw_credits;
