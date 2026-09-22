-- Un'uscita gia' pagata ha una data reale, non prevista: il vocabolario della
-- colonna nasceva prima che distinguessimo previsto e avvenuto.
alter table public.uscite_previste drop constraint if exists uscite_previste_data_prevista_fonte_check;
alter table public.uscite_previste
  add constraint uscite_previste_data_prevista_fonte_check check (
    data_prevista_fonte is null or data_prevista_fonte in (
      'reale',      -- il pagamento e avvenuto
      'contratto',  -- la scadenza e scritta nel contratto o sulla fattura
      'evento',     -- dedotta lungo la catena ordine → produzione → ricezione
      'stima',
      'senza_data'
    )
  );
