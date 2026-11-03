-- ═══════════════════════════════════════════════════════════════════════════
-- La data di consegna si pretende quando il progetto diventa lavoro
--
-- Il vincolo vecchio sembrava dire «un progetto operativo deve avere una data di
-- consegna». Non lo diceva. Era scritto così:
--
--   data IS NOT NULL OR lower(status) IN (...) OR cert_rating = 'O+M'
--
-- e con `cert_rating` nullo il terzo termine vale NULL, quindi l'intera
-- espressione vale NULL — e un CHECK passa su NULL. Il risultato è che il
-- vincolo **non guardava lo stato**: guardava se la riga avesse un rating. Un
-- LEED BD+C senza data veniva rifiutato, lo stesso progetto in WELL passava. E lo
-- rifiutava anche in `quotation`, cioè nel momento in cui una data di consegna
-- spesso non esiste ancora: il wizard ha reso quel campo opzionale per un buon
-- motivo, e il database lo smentiva all'ultimo click con un messaggio illeggibile.
--
-- La regola nuova dice quello che serve davvero, e lo dice una volta sola.
--
-- **Il momento è l'ingresso in `da_configurare`**, cioè quando Operations nomina
-- un PM e il progetto passa dall'essere un'offerta all'essere lavoro. È il punto
-- giusto per tre ragioni: da lì il PM costruisce la timeline e ogni scadenza si
-- conta da quella data; è una transizione sola, quindi nessuna schermata la può
-- saltare; e consegnare un progetto a un PM senza dirgli entro quando è il modo
-- più sicuro di farlo arrivare tardi.
--
-- `potential`, `quotation` e `quotation_approved` restano liberi: fino alla firma,
-- e anche subito dopo, «non lo sappiamo ancora» è una risposta vera. `completato`
-- e `certificato` restano liberi perché 325 righe storiche non ce l'hanno e
-- riscrivere il passato non è compito di un vincolo.
--
-- Gli O+M restano esentati — un immobile esistente non ha una consegna — ma ora
-- con `coalesce`, così il confronto non produce più NULL e la regola vale per
-- tutti gli altri invece di spegnersi.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.certifications
  drop constraint if exists certifications_handover_date_required_by_status_chk;

alter table public.certifications
  add constraint certifications_handover_date_required_by_status_chk check (
    handover_date is not null
    or lower(coalesce(status, '')) not in ('da_configurare', 'in_corso')
    or coalesce(cert_rating, '') = 'O+M'
  );
