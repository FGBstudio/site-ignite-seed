-- ═══════════════════════════════════════════════════════════════════════════
-- La gerarchia che serve alla WBS: macro-categoria sopra le commesse, e le
-- commesse che mancavano.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.commesse add column if not exists categoria text;
comment on column public.commesse.categoria is
  'La macro-categoria della WBS: Energy, Air. Esplicita e non dedotta dal servizio, perche una commessa mista deve poter stare dove ha senso commercialmente.';

update public.commesse set categoria = 'Energy' where servizio = 'energy' and categoria is null;
update public.commesse set categoria = 'Air'    where servizio = 'air'    and categoria is null;

-- ── Rome, Palazzo della Civilta: commessa propria ──────────────────────────
-- Nomenclatura di sistema, non un nome inventato per il foglio.
insert into public.commesse (nome, brand_id, categoria, servizio, anno, valore_dichiarato, stato, note)
select 'Rome, Palazzo della Civiltà',
       (select id from public.brands where name = 'FENDI'),
       'Energy', 'energy', 2025, 18500.00, 'aperta',
       'Fuori dalla commessa Fendi Energy 2024: appartiene a un ordine diverso.'
where not exists (select 1 from public.commesse where nome = 'Rome, Palazzo della Civiltà');

insert into public.commessa_progetti (commessa_id, certification_id)
select (select id from public.commesse where nome = 'Rome, Palazzo della Civiltà'), c.id
from public.certifications c
where c.cert_type = 'Energy' and c.name ilike 'Rome%Civilt%'
on conflict do nothing;

-- ── Kering Eyewear office ──────────────────────────────────────────────────
-- «KEYE» sulla fattura FoSensor 260911FS01 e Kering EYEwear, non Keye
-- Youcheng: sono due cose diverse che si scrivevano quasi uguali.
insert into public.commesse (nome, brand_id, categoria, servizio, anno, valore_dichiarato, stato, note)
select 'Kering Eyewear office',
       (select id from public.brands where name = 'KERING EYEWEAR'),
       'Air', 'air', 2026, 12000.00, 'aperta',
       'Offices HQ Padova, certificazioni LEED e WELL. Passivo: la sola offerta FoSensor da 600 RMB finora, altre attese.'
where not exists (select 1 from public.commesse where nome = 'Kering Eyewear office');

insert into public.commessa_progetti (commessa_id, certification_id)
select (select id from public.commesse where nome = 'Kering Eyewear office'), c.id
from public.certifications c
join public.sites s on s.id = c.site_id
join public.brands b on b.id = s.brand_id
where b.name = 'KERING EYEWEAR' and s.name = 'Offices HQ'
on conflict do nothing;

-- Il ciclo attivo: 12k, senza una data ancora. Resta nella colonna «Senza
-- data», che e anche il promemoria di doverla chiedere.
insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state, tranche_order, trigger_event)
select c.id, 'Ciclo attivo Kering Eyewear office', 12000.00, 'Pending', 'pending', 1, 'manual_sal'
from public.certifications c
join public.sites s on s.id = c.site_id
join public.brands b on b.id = s.brand_id
where b.name = 'KERING EYEWEAR' and s.name = 'Offices HQ' and c.cert_type = 'LEED'
  and not exists (
    select 1 from public.cert_payment_milestones m
     where m.certification_id = c.id and m.name = 'Ciclo attivo Kering Eyewear office'
  );

-- ── Le uscite trovano la loro commessa ─────────────────────────────────────
update public.uscite_previste
   set commessa_id = (select id from public.commesse where nome = 'Kering Eyewear office')
 where commessa_etichetta = 'KEYE';

-- La fattura FoSensor 260901FS01 copre Richard e Lucan Lodge insieme e non e
-- divisibile con quello che sappiamo. Va intera su Viale Richard, che e il
-- progetto piu grande; il materiale di Lucan sta dentro la stessa offerta.
update public.uscite_previste
   set commessa_id = (select id from public.commesse where nome = 'Viale Richard 1'),
       note = coalesce(note, '') || ' Offerta indivisa: copre anche Lucan Lodge.'
 where commessa_etichetta = 'Richard/Lucan Lodge';

-- ── Acquisto materiali, per commessa ───────────────────────────────────────
-- La somma della colonna Pkg del Monitor Energia sui progetti della commessa.
-- Centrica e saldata al 100%: le righe nascono gia pagate.
--
-- ATTENZIONE · la versione originale di questo blocco sommava con hardwares e
-- ops_purchase_orders gia in join, quindi moltiplicava ogni progetto per i suoi
-- pezzi. Corretto subito dopo in 20260921171517.
insert into public.suppliers (name, default_currency, default_terms_days, notes)
select 'Centrica', 'EUR', 30, 'Fornitore hardware energia. I 7 ordini a database sono tutti saldati.'
where not exists (select 1 from public.suppliers where name = 'Centrica');

with base as (
  select k.id as commessa_id, k.nome,
         round(sum(e.total_package_cost_eur), 2) as pkg_eur,
         min(po.po_issued_date) as data_ordine
  from public.commesse k
  join public.commessa_progetti cp on cp.commessa_id = k.id
  join public.site_energy_records e on e.certification_id = cp.certification_id
  left join public.certifications c on c.id = cp.certification_id
  left join public.hardwares h on h.site_id = c.site_id
  left join public.ops_purchase_orders po on po.id = h.purchase_order_id and po.po_issued_date is not null
  where k.nome in ('Fendi Energy 2024', 'Boucheron Energy 2025')
  group by 1, 2
)
insert into public.uscite_previste
  (supplier_id, corsia, commessa_id, commessa_etichetta, riferimento, descrizione,
   importo, valuta, cambio, data_prevista, data_prevista_fonte, data_effettiva, stato, note)
select (select id from public.suppliers where name = 'Centrica'),
       'merce', b.commessa_id, b.nome, 'Ordini Centrica',
       'Acquisto materiali',
       b.pkg_eur, 'EUR', 1, b.data_ordine, 'evento', b.data_ordine, 'pagata',
       'Somma della colonna Pkg del Monitor Energia sui progetti della commessa. Datata al primo ordine fornitore.'
from base b
where not exists (
  select 1 from public.uscite_previste u
   where u.commessa_id = b.commessa_id and u.descrizione = 'Acquisto materiali'
);
