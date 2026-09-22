-- Tre interventi extra fatturati a settembre, fuori dal contratto: non sono
-- tranche di una percentuale, sono chiamate aggiuntive. Pagamento a 30 giorni
-- dall'emissione, e finche' non arrivano restano previsionali — tratteggiate.
--
--   Hangzhou, MixC                21/09/2026   1.000 EUR   scade 21/10/2026
--   Guangzhou, Taikoo Hui (Men)   11/09/2026     500 EUR   scade 11/10/2026
--   Shanghai, Plaza 66 (Women)    07/09/2026     500 EUR   scade 07/10/2026
--
-- Il valore dichiarato della commessa Fendi Energy 2024 non li comprende: lo
-- scarto fra dichiarato e fatturato si sposta di 2.000 EUR, ed e' corretto
-- che si veda.

alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

insert into public.cert_payment_milestones
  (certification_id, name, amount, due_date, status, tranche_state,
   tranche_pct, tranche_order, data_prevista, data_prevista_fonte,
   data_evento, data_evento_fonte, invoice_sent_date)
select c.id, 'Additional call out', v.importo, v.emissione + 30,
       'Pending', 'pending',
       null, coalesce((select max(m.tranche_order) from public.cert_payment_milestones m
                        where m.certification_id = c.id), 0) + 1,
       v.emissione + 30, 'scadenza_fattura',
       v.emissione, 'milestone_chiusa', v.emissione
from (values
  ('9149c5dd-69be-4209-9123-9bc79209d0ec'::uuid, date '2026-09-21', 1000.00),
  ('fbf09aa0-58d5-4aff-bc2f-68f4fe43470a'::uuid, date '2026-09-11',  500.00),
  ('22bc7a26-b8c7-44be-99df-d6a3dc63ea27'::uuid, date '2026-09-07',  500.00)
) as v(cert, emissione, importo)
join public.certifications c on c.id = v.cert
where not exists (
  select 1 from public.cert_payment_milestones m
   where m.certification_id = c.id
     and m.name = 'Additional call out'
     and m.invoice_sent_date = v.emissione
);

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;
