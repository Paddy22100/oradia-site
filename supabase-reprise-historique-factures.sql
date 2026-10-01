-- ============================================================
-- REPRISE D'HISTORIQUE : les deux factures émises sous Word
-- ============================================================
-- Insère F01-00001 et F01-00002 avec leurs numéros d'origine, pour que le livre
-- des recettes et la numérotation repartent d'un historique complet.
--
-- Ce que ce script fait, et pourquoi :
--
-- 1. Les échéances sont RECALCULÉES. Les deux factures papier portent toutes deux
--    « 31/09/2026 », un jour qui n'existe pas — septembre a trente jours. Postgres
--    rejetterait cette valeur. Les échéances correctes sont le 25/09/2026 pour la
--    première (26/08 + 30 jours) et le 30/10/2026 pour la seconde (30/09 + 30).
--
-- 2. La période de F01-00002 est corrigée. Le papier indique « Date de la
--    prestation : août 2026 » alors que les trois interventions sont datées des
--    10, 17 et 23 septembre. C'est une coquille du modèle Word.
--
-- 3. F01-00001 est marquée payée et CRÉE la recette de 400 € correspondante.
--    Elle manque aujourd'hui : l'entretien du gîte ne transite pas par le site,
--    donc aucune de ces recettes n'est dans la base. C'est ce qui faisait que le
--    dashboard n'affichait qu'une fraction de l'activité réelle.
--
-- 4. F01-00002 reste « envoyée » : émise le 30/09 et payable à 30 jours, son
--    règlement tombera en octobre. Tu la marqueras payée depuis le dashboard à ce
--    moment-là, avec la date du virement.
--
-- 5. Aucun PDF n'est rattaché à ces deux pièces : les originaux sont tes fichiers
--    Word. Une relance envoyée depuis le dashboard partira donc sans pièce jointe.
--
-- 6. Le compteur reste à 2, pour que ta prochaine facture sorte en F01-00003.
--
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================

DO $$
DECLARE
    -- ⚠️  SEULE LIGNE À MODIFIER  ⚠️
    -- Jour où les 400 € de la facture F01-00001 ont été crédités sur le compte.
    -- Forcément entre le 26 et le 31 août. À relever sur le relevé bancaire :
    -- c'est cette date, et elle seule, qui détermine le mois de déclaration.
    v_date_paiement DATE := '2026-08-31';

    v_client UUID;
    v_snap   JSONB;
    v_f1     UUID;
    v_f2     UUID;
    v_tx     UUID;
BEGIN
    SELECT c.id, to_jsonb(c) INTO v_client, v_snap
      FROM clients c WHERE c.nom LIKE '%Hervé%' LIMIT 1;

    IF v_client IS NULL THEN
        RAISE EXCEPTION 'Client introuvable : crée la fiche de M. Hervé Stéphane avant de lancer ce script.';
    END IF;

    IF EXISTS (SELECT 1 FROM factures WHERE numero IN ('F01-00001', 'F01-00002')) THEN
        RAISE EXCEPTION 'F01-00001 ou F01-00002 existe déjà — script déjà joué, rien à faire.';
    END IF;

    -- ── F01-00001 — août 2026, 400 €, encaissée ──────────────────────────
    INSERT INTO factures (
        numero, serie, type, statut, client_id, client_snapshot,
        date_emission, date_echeance, delai_paiement_jours, periode_label,
        total_ht, urssaf_category, sent_at, date_paiement, mode_paiement, notes
    ) VALUES (
        'F01-00001', 'F01', 'facture', 'payee', v_client, v_snap,
        '2026-08-26', '2026-09-25', 30, 'août 2026',
        400.00, 'bic_prestations', '2026-08-26 12:00:00+02', v_date_paiement, 'Virement',
        'Reprise d''historique : facture émise sous Word. L''original portait une échéance au 31/09/2026, date inexistante, recalculée ici au 25/09/2026.'
    ) RETURNING id INTO v_f1;

    INSERT INTO facture_lignes (facture_id, designation, date_prestation, quantite, prix_unitaire, total, ordre)
    VALUES
        (v_f1, 'ENTRETIEN ET REMISE EN ETAT DU GITE', '2026-08-15', 1, 100.00, 100.00, 0),
        (v_f1, 'ENTRETIEN ET REMISE EN ETAT DU GITE', '2026-08-18', 1, 100.00, 100.00, 1),
        (v_f1, 'ENTRETIEN ET REMISE EN ETAT DU GITE', '2026-08-21', 1, 100.00, 100.00, 2),
        (v_f1, 'ENTRETIEN ET REMISE EN ETAT DU GITE', '2026-08-25', 1, 100.00, 100.00, 3);

    -- La recette manquante, datée de l'encaissement et non de l'émission.
    INSERT INTO transactions (date, type, category, description, amount, source, urssaf_category, facture_id)
    VALUES (v_date_paiement, 'recette', 'prestation',
            'F01-00001 — M. Hervé Stéphane', 400.00, 'manuel', 'bic_prestations', v_f1)
    RETURNING id INTO v_tx;

    UPDATE factures SET transaction_id = v_tx WHERE id = v_f1;

    -- ── F01-00002 — septembre 2026, 300 €, en attente ────────────────────
    INSERT INTO factures (
        numero, serie, type, statut, client_id, client_snapshot,
        date_emission, date_echeance, delai_paiement_jours, periode_label,
        total_ht, urssaf_category, sent_at, notes
    ) VALUES (
        'F01-00002', 'F01', 'facture', 'envoyee', v_client, v_snap,
        '2026-09-30', '2026-10-30', 30, 'septembre 2026',
        300.00, 'bic_prestations', '2026-09-30 12:00:00+02',
        'Reprise d''historique : facture émise sous Word. L''original portait « prestation : août 2026 » alors que les interventions sont de septembre, et une échéance au 31/09/2026, date inexistante, recalculée ici au 30/10/2026.'
    ) RETURNING id INTO v_f2;

    INSERT INTO facture_lignes (facture_id, designation, date_prestation, quantite, prix_unitaire, total, ordre)
    VALUES
        (v_f2, 'ENTRETIEN ET REMISE EN ETAT DU GITE', '2026-09-10', 1, 100.00, 100.00, 0),
        (v_f2, 'ENTRETIEN ET REMISE EN ETAT DU GITE', '2026-09-17', 1, 100.00, 100.00, 1),
        (v_f2, 'ENTRETIEN ET REMISE EN ETAT DU GITE', '2026-09-23', 1, 100.00, 100.00, 2);

    -- Le compteur reste à 2 : la prochaine facture sera F01-00003.
    UPDATE facture_sequences SET last_number = 2, updated_at = NOW() WHERE serie = 'F01';

    RAISE NOTICE 'Historique repris. 400 € encaissés le %, 300 € en attente.', v_date_paiement;
END $$;

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT f.numero, f.statut, f.date_emission, f.date_echeance, f.periode_label,
       f.total_ht, f.date_paiement,
       (SELECT COUNT(*) FROM facture_lignes l WHERE l.facture_id = f.id) AS lignes
  FROM factures f ORDER BY f.numero;

SELECT serie, last_number FROM facture_sequences WHERE serie = 'F01';

-- Encaissements du mois d'août, gîte compris
SELECT date, description, amount, urssaf_category
  FROM transactions
 WHERE type = 'recette' AND date BETWEEN '2026-08-01' AND '2026-08-31'
 ORDER BY date;
