-- ═══════════════════════════════════════════════════════════════════════════
-- v_progetti_tempi distingue prevista e avvenuta
--
-- La vista dava una sola data di installazione, quella accaduta. Va bene per
-- chiedersi «quanto ci mettiamo a rientrare» su cio' che e' fatto, non per un
-- planning: le installazioni future restavano invisibili, e con loro le
-- settimane in cui cadono.
--
-- Due colonne invece di una, e il posto giusto per decidere resta a chi legge:
-- `data_installazione` e' il fatto, `installazione_prevista` il piano. Fonderle
-- qui con un coalesce vorrebbe dire consegnare a valle una data che non dice
-- piu' se e' successa — ed e' precisamente la distinzione da cui dipende se un
-- incasso e' esigibile o sperato.
--
-- La colonna nuova va in coda: CREATE OR REPLACE VIEW puo' solo aggiungere
-- colonne alla fine, non infilarne una in mezzo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_progetti_tempi as
 select c.id as certification_id,
    cp.commessa_id,
    c.name as progetto,
    si.city as citta,
    mat.data_materiali,
    coalesce(e.installation_date, a.handover_date) as data_installazione,
    pag.primo_incasso,
    pag.ultimo_incasso,
    pag.tranche_totali,
    pag.tranche_incassate,
    e.installation_date_planned as installazione_prevista
   from certifications c
     join commessa_progetti cp on cp.certification_id = c.id
     left join sites si on si.id = c.site_id
     left join site_energy_records e on e.certification_id = c.id
     left join site_air_records a on a.certification_id = c.id
     left join lateral ( select min(po.po_issued_date) as data_materiali
           from hardwares h
             join ops_purchase_orders po on po.id = h.purchase_order_id
          where h.site_id = c.site_id and po.po_issued_date is not null) mat on true
     left join lateral ( select min(m.data_prevista) as primo_incasso,
            max(m.data_prevista) as ultimo_incasso,
            count(*) as tranche_totali,
            count(m.payment_received_date) as tranche_incassate
           from cert_payment_milestones m
          where m.certification_id = c.id) pag on true;
