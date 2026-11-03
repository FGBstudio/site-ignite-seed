-- ═══════════════════════════════════════════════════════════════════════════
-- Il quotato si deriva, e le commesse fatturabili sono una vista
--
-- Due difetti con la stessa radice: un numero che esiste nei dati e che nessuna
-- schermata sa leggere, e una regola scritta a mano in due posti che divergono.
--
-- ── Il quotato della flotta Energy ───────────────────────────────────────────
-- Il 21 settembre alle 12:09, in un minuto, sono nate 140 tranche su 70 progetti
-- Energy: è la ricostruzione a posteriori della scaletta di fatturazione della
-- flotta Greeny. Nessuno di quei 70 ha `total_fees` — non sono mai passati dal
-- wizard, che le tranche le crea solo con un totale — e 67 su 70 hanno già
-- fatture.
--
-- La somma delle loro tranche **è** il valore del contratto, e lo si verifica
-- contro le fatture: su 24 progetti coincide al centesimo col fatturato, su 42 il
-- fatturato è minore perché il lavoro non è finito. 421.075 € programmati contro
-- 297.365 € fatturati: **123.710 € ancora da fatturare** che esistono solo lì.
--
-- Finora `quotato` leggeva soltanto `total_fees`, quindi per quei 67 progetti il
-- prospetto diceva «quotazione mancante» e non mostrava né percentuale né
-- residuo. Ora `quotato` si **deriva**: il totale quando c'è, altrimenti la somma
-- delle tranche. Non si copia la somma dentro `total_fees` — sarebbe un secondo
-- numero libero di scollarsi dal primo — e `quotato_dalle_tranche` dice da dove
-- viene, così una schermata può distinguere un prezzo pattuito da uno ricostruito.
-- «Quotazione mancante» ora vuol dire quello che sembra: non c'è né un totale né
-- una scaletta. Scende da 74 casi a 15.
--
-- ── Chi si può fatturare ─────────────────────────────────────────────────────
-- La tendina «per quale progetto?» del dialogo di emissione elencava quattro
-- stati scritti a mano, e ne dimenticava uno: 111 progetti `completato` non si
-- potevano scegliere, 16 con un totale quotato e 23 che hanno già fatture. Il
-- pannello delle quotazioni da fatturare invece `completato` lo includeva: due
-- schermate della stessa applicazione non concordavano su cosa fosse fatturabile.
--
-- La regola si inverte: non «elenca questi stati» ma **«elenca tutto tranne ciò
-- su cui non si può fatturare»** — prima dell'approvazione non c'è niente da
-- fatturare, dopo la cancellazione non ci sarà più niente. È la stessa regola che
-- `progettoFatturabile` già scrive in TypeScript per le tranche, e che la query
-- contraddiceva con una lista positiva. Così ogni stato futuro è dentro per
-- default, e dimenticarlo non è più possibile.
--
-- La vista porta anche il residuo da fatturare, perché chi emette cerca il
-- progetto che ha qualcosa da fatturare, non il primo in ordine alfabetico.
--
-- `quotato_dalle_tranche` sta in fondo all'elenco delle colonne e non accanto a
-- `quotato`, dove si leggerebbe meglio: `create or replace view` non sa inserire
-- una colonna in mezzo, e per spostarla servirebbe un drop che porterebbe via le
-- viste che dipendono da questa.
-- ═══════════════════════════════════════════════════════════════════════════

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
    -- Il quotato: il totale pattuito, oppure la somma della scaletta quando un
    -- totale non c'e'. Derivato, non copiato.
    coalesce(
      nullif(coalesce(c.total_fees, 0::numeric), 0::numeric),
      nullif(coalesce(t.tranche_totali, 0::numeric), 0::numeric)
    )::numeric(14,2) as quotato,
    coalesce(t.tranche_totali, 0::numeric)::numeric(14,2) as tranche_totali,
    coalesce(t.quante_tranche, 0::bigint) as quante_tranche,
    coalesce(t.tranche_fatturate, 0::bigint) as tranche_fatturate,
    coalesce(fa.fatturato, 0::numeric)::numeric(14,2) as fatturato,
    coalesce(fa.incassato, 0::numeric)::numeric(14,2) as incassato,
    case
      when coalesce(
             nullif(coalesce(c.total_fees, 0::numeric), 0::numeric),
             nullif(coalesce(t.tranche_totali, 0::numeric), 0::numeric)
           ) > 0::numeric
      then coalesce(
             nullif(coalesce(c.total_fees, 0::numeric), 0::numeric),
             nullif(coalesce(t.tranche_totali, 0::numeric), 0::numeric)
           ) - coalesce(fa.fatturato, 0::numeric)
      else null::numeric
    end::numeric(14,2) as da_fatturare,
    (coalesce(fa.fatturato, 0::numeric) - coalesce(fa.incassato, 0::numeric))::numeric(14,2) as da_incassare,
    case
      when coalesce(
             nullif(coalesce(c.total_fees, 0::numeric), 0::numeric),
             nullif(coalesce(t.tranche_totali, 0::numeric), 0::numeric)
           ) > 0::numeric
      then round(coalesce(fa.fatturato, 0::numeric) / coalesce(
             nullif(coalesce(c.total_fees, 0::numeric), 0::numeric),
             nullif(coalesce(t.tranche_totali, 0::numeric), 0::numeric)
           ), 4)
      else null::numeric
    end as pct_fatturazione,
    -- Mancante vuol dire mancante: ne' un totale ne' una scaletta, e del denaro
    -- fatturato. Prima scattava anche su chi aveva la scaletta e non il totale.
    (coalesce(c.total_fees, 0::numeric) = 0::numeric
     and coalesce(t.tranche_totali, 0::numeric) = 0::numeric
     and coalesce(fa.fatturato, 0::numeric) > 0::numeric) as quotazione_mancante,
    coalesce(t.tranche_scollegate, 0::bigint) as tranche_scollegate,
    -- Da dove viene il quotato: un prezzo pattuito e un prezzo ricostruito dalla
    -- scaletta non si leggono allo stesso modo, e la differenza va detta.
    (coalesce(c.total_fees, 0::numeric) = 0::numeric
     and coalesce(t.tranche_totali, 0::numeric) > 0::numeric) as quotato_dalle_tranche
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

-- ── Le commesse su cui si puo' emettere ────────────────────────────────────
create or replace view public.v_commesse_fatturabili as
 select v.id,
    v.progetto as name,
    v.status,
    v.intestatario as client,
    v.intestatario_id as billing_contact_id,
    v.emittente,
    v.entity_code,
    v.currency,
    v.quotato as total_fees,
    v.quotato_dalle_tranche,
    v.fatturato,
    v.da_fatturare as residuo_da_fatturare,
    v.quante_tranche,
    v.brand,
    v.city,
    c.site_id,
    c.issuer_contact_id,
    s.brand_id
   from v_progetti_fatturazione v
   join certifications c on c.id = v.id
   left join sites s on s.id = c.site_id
  where lower(coalesce(c.status, '')) not in ('potential', 'quotation', 'canceled', 'cancelled');

alter view public.v_progetti_fatturazione set (security_invoker = on);
alter view public.v_commesse_fatturabili  set (security_invoker = on);
