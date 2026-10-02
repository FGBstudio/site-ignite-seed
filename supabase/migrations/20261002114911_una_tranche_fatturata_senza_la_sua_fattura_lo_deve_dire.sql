-- ═══════════════════════════════════════════════════════════════════════════
-- Una tranche fatturata senza la sua fattura lo deve dire
--
-- 61 tranche per 184.720,50 € portano `tranche_state = 'invoiced'` — glielo ha
-- scritto la generazione degli schemi di pagamento di settembre — ma nessuna riga
-- di fattura le nomina. Il denaro c'è: sono progetti le cui fatture sono entrate
-- con l'archivio 2026, e quelle fatture hanno le loro righe senza `tranche_id`,
-- perché l'import non ha indovinato quale tranche pagasse quale riga.
--
-- I soldi sono giusti da entrambe le parti: `fatturato` e `da_fatturare` li
-- derivano dalle fatture, non dai collegamenti. Sbaglia il **conteggio**: la
-- spunta della tranche nasce dalla riga, quindi quelle 61 appaiono con il cerchio
-- vuoto e la colonna fattura vuota, dentro un progetto che intanto dichiara
-- migliaia di euro fatturati. Chi legge conclude che quelle tranche sono ancora
-- da emettere, e la seconda fattura la fa.
--
-- Non invento il collegamento: gli importi non combaciano (Bangkok ha tranche da
-- 2.960 e 19,50 su 4.440 fatturati), quindi attaccarle sarebbe tirare a indovinare
-- su quale riga paga cosa. Invece gli stati diventano tre — fatturata con la sua
-- fattura, fatturata senza collegamento, da fatturare — perché il terzo esiste nei
-- dati e finora nessuna schermata lo poteva dire.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_tranche_fatturazione as
 select m.id as tranche_id,
    m.certification_id,
    m.tranche_order,
    m.name as tranche,
    m.tranche_pct,
    m.amount as importo_previsto,
    m.trigger_event,
    m.payment_scheme,
    m.data_prevista,
    m.tranche_state,
    f.id as invoice_id,
    f.number as fattura,
    f.issue_date as emessa_il,
    f.due_date as scade_il,
    r.importo as fatturato,
    f.paid_amount as incassato_fattura,
    f.residual as residuo_fattura,
    f.currency,
    f.lifecycle_state,
    f.payment_status,
    f.days_late,
    f.data_incasso_attesa,
    f.ultima_nota,
    coalesce(f.quante_righe, 0::bigint) as righe_della_fattura,
    r.id is not null as fatturata,
    -- Il terzo stato: lo stato dice fatturata, ma nessuna riga la nomina.
    (m.tranche_state = 'invoiced' and r.id is null) as fatturata_scollegata
   from cert_payment_milestones m
     left join invoice_righe r on r.tranche_id = m.id
     left join v_invoices f on f.id = r.invoice_id;

create or replace view public.v_progetti_fatturazione as
 select c.id,
    c.name as progetto,
    b.name as brand,
    coalesce(pag.company_name, c.client) as intestatario,
    pag.id as intestatario_id,
    s.city,
    s.country,
    c.cert_type,
    c.cert_rating,
    c.cert_level,
    c.project_subtype,
    c.cert_version,
    c.status,
    c.currency,
    em.entity_code,
    em.company_name as emittente,
    pr.full_name as pm,
    c.quotation_sent_date,
    c.quotation_approved_at,
    c.handover_date,
    nullif(coalesce(c.quotation_list_price, 0::numeric), 0::numeric)::numeric(14,2) as listino,
    nullif(coalesce(c.total_fees, 0::numeric), 0::numeric)::numeric(14,2) as quotato,
    coalesce(t.tranche_totali, 0::numeric)::numeric(14,2) as tranche_totali,
    coalesce(t.quante_tranche, 0::bigint) as quante_tranche,
    coalesce(t.tranche_fatturate, 0::bigint) as tranche_fatturate,
    coalesce(fa.fatturato, 0::numeric)::numeric(14,2) as fatturato,
    coalesce(fa.incassato, 0::numeric)::numeric(14,2) as incassato,
        case
            when coalesce(c.total_fees, 0::numeric) > 0::numeric then c.total_fees - coalesce(fa.fatturato, 0::numeric)
            else null::numeric
        end::numeric(14,2) as da_fatturare,
    (coalesce(fa.fatturato, 0::numeric) - coalesce(fa.incassato, 0::numeric))::numeric(14,2) as da_incassare,
        case
            when coalesce(c.total_fees, 0::numeric) > 0::numeric then round(coalesce(fa.fatturato, 0::numeric) / c.total_fees, 4)
            else null::numeric
        end as pct_fatturazione,
    coalesce(c.total_fees, 0::numeric) = 0::numeric and coalesce(fa.fatturato, 0::numeric) > 0::numeric as quotazione_mancante,
    -- Quante tranche si dicono fatturate senza che una riga le nomini.
    coalesce(t.tranche_scollegate, 0::bigint) as tranche_scollegate
   from certifications c
     left join sites s on s.id = c.site_id
     left join brands b on b.id = s.brand_id
     left join profiles pr on pr.id = c.pm_id
     left join contacts em on em.id = c.issuer_contact_id
     left join contacts pag on pag.id = c.billing_contact_id
     left join lateral ( select count(*) as quante_tranche,
            sum(m.amount) as tranche_totali,
            count(*) filter (where (exists ( select 1
                   from invoice_righe r
                  where r.tranche_id = m.id))) as tranche_fatturate,
            count(*) filter (where m.tranche_state = 'invoiced' and not exists ( select 1
                   from invoice_righe r
                  where r.tranche_id = m.id)) as tranche_scollegate
           from cert_payment_milestones m
          where m.certification_id = c.id) t on true
     left join lateral ( select sum(f.total) as fatturato,
            sum(f.paid_amount) as incassato
           from v_invoices f
          where f.certification_id = c.id) fa on true;
