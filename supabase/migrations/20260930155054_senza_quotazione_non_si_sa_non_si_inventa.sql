-- ═══════════════════════════════════════════════════════════════════════════
-- Senza quotazione «non si sa», non «meno diciottomila»
--
-- La vista appena fatta ha portato a galla un buco nei dati, non nel codice:
-- **tutti e 67** i progetti che hanno una fattura non hanno il valore della
-- quotazione. Sono entrati da migrazione, con le fatture ma senza l'offerta
-- che le aveva generate: 264.815 euro fatturati senza un quotato a cui
-- confrontarli.
--
-- Con `quotato = 0` il conto «resta da fatturare» diventava **−18.500** e la
-- percentuale di fatturazione **0%** su un progetto fatturato per intero. Sono
-- numeri aritmeticamente corretti e completamente falsi: dicono «hai fatturato
-- in negativo» quando la verita' e' «non sappiamo quanto era stato quotato».
--
-- Quando manca il termine di paragone, il risultato e' **nullo**. Una casella
-- vuota si vede e fa chiedere perche'; un −18.500 si legge e si crede.
--
-- Il buco si chiude caricando le quotazioni storiche (R14), non con una
-- formula.
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.v_progetti_fatturazione;

create view public.v_progetti_fatturazione as
select
  c.id,
  c.name as progetto,
  -- Chi paga e di chi e' il marchio sono due cose diverse: la fattura di Louis
  -- Vuitton Dallas e' intestata a TPG Architecture. Restano due colonne perche'
  -- sono due domande legittime, e sommarle in una sarebbe l'unico errore.
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
  nullif(coalesce(c.quotation_list_price, 0), 0)::numeric(14,2) as listino,
  -- Nullo, non zero: «non lo sappiamo» e «vale zero» sono due cose diverse, e
  -- confonderle fa nascere tutti i conti sbagliati che stanno sotto.
  nullif(coalesce(c.total_fees, 0), 0)::numeric(14,2) as quotato,
  coalesce(t.tranche_totali, 0)::numeric(14,2) as tranche_totali,
  coalesce(t.quante_tranche, 0) as quante_tranche,
  coalesce(t.tranche_fatturate, 0) as tranche_fatturate,
  coalesce(fa.fatturato, 0)::numeric(14,2) as fatturato,
  coalesce(fa.incassato, 0)::numeric(14,2) as incassato,
  (case when coalesce(c.total_fees, 0) > 0
        then c.total_fees - coalesce(fa.fatturato, 0)
        end)::numeric(14,2) as da_fatturare,
  -- Questo invece si sa sempre: e' fatturato meno incassato, e non dipende
  -- dalla quotazione.
  (coalesce(fa.fatturato, 0) - coalesce(fa.incassato, 0))::numeric(14,2) as da_incassare,
  case when coalesce(c.total_fees, 0) > 0
       then round(coalesce(fa.fatturato, 0) / c.total_fees, 4)
       end as pct_fatturazione,
  -- Detto in chiaro, cosi' la schermata non deve dedurlo da un nullo.
  (coalesce(c.total_fees, 0) = 0 and coalesce(fa.fatturato, 0) > 0) as quotazione_mancante
from public.certifications c
left join public.sites s on s.id = c.site_id
left join public.brands b on b.id = s.brand_id
left join public.profiles pr on pr.id = c.pm_id
left join public.contacts em on em.id = c.issuer_contact_id
left join public.contacts pag on pag.id = c.billing_contact_id
left join lateral (
  select count(*) as quante_tranche,
         sum(m.amount) as tranche_totali,
         count(*) filter (
           where exists (select 1 from public.invoices i where i.tranche_id = m.id)
         ) as tranche_fatturate
    from public.cert_payment_milestones m
   where m.certification_id = c.id
) t on true
left join lateral (
  select sum(f.total) as fatturato, sum(f.paid_amount) as incassato
    from public.v_invoices f
   where f.certification_id = c.id
) fa on true;

comment on view public.v_progetti_fatturazione is
  'L''«Elenco Progetti» del foglio di Francesca. Dove la quotazione non e'' stata registrata i conti che dipendono da lei restano nulli: non si sa, e non si inventa.';

grant select on public.v_progetti_fatturazione to authenticated;
