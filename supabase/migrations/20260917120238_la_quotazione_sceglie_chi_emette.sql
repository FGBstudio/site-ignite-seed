-- Chi emette l'offerta, scelto sulla quotazione.
--
-- Il dialogo dell'offerta chiedeva una cosa sola: «Societa' a cui emettere
-- l'offerta», cioe' il DESTINATARIO. Chi emette non era un campo da nessuna
-- parte — stava scritto nel template Word e basta. Finche' la societa' era
-- una sola funzionava; con la UK accanto all'italiana, il documento non sa
-- piu' da chi esce, ed e' il punto in cui il processo si e' fermato.
--
-- Il campo sta sulla certificazione e non sull'offerta perche' la scelta vale
-- anche dopo: la fattura la emette la stessa societa' che ha firmato
-- l'offerta, e ricordarlo qui evita di richiederlo — o peggio, di lasciare che
-- le due divergano.
--
-- NESSUN BACKFILL, e non per prudenza generica: il primo tentativo e' stato
-- respinto da `enforce_cert_not_on_hold`, il trigger che impedisce di
-- modificare le commesse sospese. Il trigger ha ragione — un aggiornamento di
-- massa che scavalca una sospensione e' esattamente cio' che quel trigger
-- esiste per fermare. Quindi la colonna nasce vuota e il valore di default
-- («se di societa' emittente ce n'e' una sola, e' quella») si risolve dove va
-- risolto: al momento di leggerlo, in un posto solo. Cosi' non si scrive nulla
-- su milleduecento righe per dire una cosa che si sa gia'.

alter table public.certifications
  add column if not exists issuer_contact_id uuid
    references public.contacts(id) on delete set null;

comment on column public.certifications.issuer_contact_id is
  'La nostra societa'' che emette offerta e fattura per questa commessa (contacts.kind = ''issuer''). NULL significa «quella di default», non «nessuna»: finche'' l''emittente e'' uno solo non c''e'' niente da scegliere e niente da scrivere. Vive sulla certificazione e non sul documento perche'' offerta e fattura devono uscire dalla stessa societa''.';
