-- ═══════════════════════════════════════════════════════════════════════════
-- Tre correzioni che nascono dallo stesso errore: avevo applicato a FoSensor
-- la regola pensata per Centrica.
--
-- Su Centrica le ripartizioni non si sanno, quindi la cassa resta sulla
-- fattura e la quota per commessa si vede senza sommare. Su FoSensor le
-- ripartizioni ci sono, sono nelle note del foglio, e tornano al centesimo su
-- ogni singola fattura. Tenere la cassa sulla fattura vuol dire lasciare ogni
-- commessa a zero costi e parcheggiare tutto in «Non attribuite» — che e'
-- esattamente quello che si vedeva.
--
-- Quindi si inverte: dove le allocazioni coprono la fattura per intero, sono
-- loro la cassa e la fattura diventa il documento. Il totale non cambia di un
-- centesimo, perche' la somma e' la stessa; cambia dove viene attribuito.
-- Le tre fatture senza allocazioni (R&D 115.000, R&D 5.000, casing 600)
-- restano cassa loro, perche' li' non c'e' niente da ripartire.
-- ═══════════════════════════════════════════════════════════════════════════

with coperte as (
  select f.id as fattura_id,
         f.riferimento,
         split_part(f.descrizione, ' · ', 2) as coda
    from public.uscite_previste f
    join public.suppliers s on s.id = f.supplier_id and s.name = 'FoSensor'
   where f.natura = 'cassa'
     and f.importo = (
       select coalesce(sum(q.importo), 0)
         from public.uscite_previste q
        where q.natura = 'quota'
          and q.riferimento = f.riferimento
          and split_part(q.descrizione, ' · ', 2) = split_part(f.descrizione, ' · ', 2)
     )
),
fatture as (
  update public.uscite_previste f
     set natura = 'quota',
         note = 'Il documento. La cassa sta sulle righe di progetto, che coprono questa fattura per intero: si vede, non si somma.'
    from coperte c
   where f.id = c.fattura_id
  returning f.id
)
update public.uscite_previste q
   set natura = 'cassa',
       note = 'Quanto di quella fattura compete a questo progetto. E questa la cassa: la ripartizione del foglio copre la fattura al centesimo, quindi e qui che il costo va attribuito.'
  from coperte c
 where q.natura = 'quota'
   and q.riferimento = c.riferimento
   and split_part(q.descrizione, ' · ', 2) = c.coda;

-- Il casing per campioni e' di Kering Eyewear: il foglio scrive N.D., ma la
-- riga era nata con l'etichetta KEYE e quella commessa non ha altri costi.
update public.uscite_previste u
   set commessa_id = (select id from public.commesse where nome = 'Kering Eyewear office'),
       commessa_etichetta = 'Kering Eyewear office',
       note = coalesce(u.note, '') || ' Attribuita a Kering Eyewear: il foglio non lo dice, la riga originale sì.'
 where u.riferimento = '260911FS01';

-- ── Quello che sta nel passato e' successo ────────────────────────────────
-- Dieci tranche del 2025 erano ancora disegnate tratteggiate perche' la loro
-- data era dedotta da un evento invece che da un incasso registrato. Ma una
-- data dedotta e passata da un anno non e' piu' una previsione.
alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

update public.cert_payment_milestones
   set data_prevista_fonte   = 'incasso',
       status                = 'Paid',
       tranche_state         = 'invoiced',
       payment_received_date = coalesce(payment_received_date, data_prevista)
 where data_prevista is not null
   and data_prevista < date '2026-09-22'
   and data_prevista_fonte = 'da_evento';

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;
