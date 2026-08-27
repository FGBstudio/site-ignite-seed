-- ============================================================================
-- Le quotazioni hanno una valuta
--
-- Finora ogni importo era in euro per convenzione, mai dichiarata: `total_fees`
-- e' un numero e basta. Ma si vende anche in sterline, dollari e renminbi, e
-- quei numeri sarebbero finiti nella stessa colonna degli euro, sommati insieme
-- nei riepiloghi come se fossero la stessa cosa.
--
-- ── Cosa resta in euro e cosa no ───────────────────────────────────────────
--
-- La COSTRUZIONE del preventivo resta in euro: le tariffe giornaliere per ruolo
-- e i prezzi dell'hardware sono i nostri costi, e i nostri costi sono in euro.
-- Convertirli non avrebbe senso.
--
-- Cambia il modo in cui l'offerta viene ESPRESSA: `total_fees` e' l'importo
-- nella valuta scelta, quello che il cliente legge sul documento.
--
-- ── I tassi c'erano gia' ───────────────────────────────────────────────────
--
-- `public.fx_rates` esiste dall'inizio e la edge function `fx-rates-refresh` la
-- aggiorna ogni mattina alle 6 (cron "fx-rates-daily") con quattordici valute.
-- Nessuna parte dell'applicazione la leggeva. Qui non si crea una seconda
-- tabella di cambi: si usa quella.
--
-- Attenzione al verso: la riga dice quanto vale UN EURO nella valuta quotata
-- (EUR -> GBP = 0,856). Per portare un importo in euro si DIVIDE. Il verso
-- sbagliato non fa errore, fa numeri plausibili e sbagliati, quindi la
-- conversione sta in una funzione sola invece che sparsa nelle query.
--
-- ── Perche' il cambio si stampa sulla riga ─────────────────────────────────
--
-- `fx_rate_to_eur` non e' un riferimento alla tabella dei cambi ma una copia del
-- valore al momento del salvataggio. E' voluto: un'offerta mandata a marzo vale
-- gli euro di marzo, e non deve cambiare importo perche' sei mesi dopo il cambio
-- si e' mosso. Chi vuole rivalutarla a oggi riapre l'offerta e la salva.
--
-- `total_fees_eur` e' generata, ed e' la colonna su cui si sommano i
-- portafogli: sommare `total_fees` significherebbe sommare sterline con
-- renminbi.
-- ============================================================================

-- Quanti euro vale UNA unita' della valuta indicata.
create or replace function public.fn_fx_rate_to_eur(p_currency text)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when p_currency is null or upper(btrim(p_currency)) = 'EUR' then 1
    else (
      -- La riga EUR -> X dice quante X vale un euro: il cambio verso l'euro e'
      -- il suo reciproco. NULLIF perche' un tasso a zero renderebbe infinito
      -- ogni importo invece di lasciarlo mancante.
      select 1 / nullif(r.rate, 0)
        from public.fx_rates r
       where r.base = 'EUR' and r.quote = upper(btrim(p_currency))
    )
  end;
$function$;

comment on function public.fn_fx_rate_to_eur(text) is
  'Quanti euro vale una unita'' della valuta. Legge fx_rates, che tiene il verso opposto (EUR -> valuta), e ne fa il reciproco.';

grant execute on function public.fn_fx_rate_to_eur(text) to authenticated;

-- ── La certificazione dichiara la sua valuta ───────────────────────────────

-- Le colonne nascono gia' piene, col loro DEFAULT, invece di essere riempite da
-- un UPDATE: un UPDATE su tutte le certificazioni sveglierebbe
-- enforce_cert_not_on_hold, che rifiuta ogni modifica ai progetti sospesi e
-- farebbe fallire la migration. ADD COLUMN ... DEFAULT non passa dai trigger.
alter table public.certifications
  add column if not exists currency       text          not null default 'EUR',
  add column if not exists fx_rate_to_eur numeric(16,8) not null default 1;

-- La valuta dev'essere una di quelle che il refresh giornaliero conosce,
-- altrimenti domani il cambio non si aggiorna e nessuno se ne accorge. Il
-- controllo non puo' stare in un CHECK — Postgres non ammette sottoquery nei
-- vincoli — quindi vive nel trigger qui sotto, che e' comunque il punto in cui
-- si va a leggere fx_rates.

alter table public.certifications
  drop constraint if exists certifications_chk_fx_rate;
alter table public.certifications
  add constraint certifications_chk_fx_rate check (fx_rate_to_eur > 0) not valid;

alter table public.certifications
  drop column if exists total_fees_eur;
alter table public.certifications
  add column total_fees_eur numeric
  generated always as (total_fees * fx_rate_to_eur) stored;

comment on column public.certifications.currency is
  'La valuta in cui l''offerta e'' espressa. total_fees e'' in QUESTA valuta, non in euro.';
comment on column public.certifications.fx_rate_to_eur is
  'Il cambio al momento del salvataggio, copiato da fx_rates. Non si aggiorna da solo: un''offerta vale gli euro del giorno in cui e'' stata fatta.';
comment on column public.certifications.total_fees_eur is
  'total_fees riportato in euro. E'' la colonna da sommare nei riepiloghi: total_fees mescolerebbe valute diverse.';

-- Chi salva un'offerta sceglie la valuta, non il cambio: se cambia la valuta e
-- non dichiara un cambio, si prende quello di oggi.
create or replace function public.trg_certifications_stamp_fx()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_known boolean;
begin
  new.currency := upper(btrim(coalesce(nullif(new.currency, ''), 'EUR')));

  if new.currency <> 'EUR' then
    select exists (select 1 from public.fx_rates r
                    where r.base = 'EUR' and r.quote = new.currency)
      into v_known;
    if not v_known then
      raise exception
        'Valuta % sconosciuta: non e'' fra quelle che fx-rates-refresh aggiorna ogni giorno.',
        new.currency;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.fx_rate_to_eur is null or new.fx_rate_to_eur = 1 then
      new.fx_rate_to_eur := public.fn_fx_rate_to_eur(new.currency);
    end if;
  elsif new.currency is distinct from old.currency
        and new.fx_rate_to_eur is not distinct from old.fx_rate_to_eur then
    -- La valuta e' cambiata ma il cambio no: e' il caso di chi sceglie la
    -- valuta dalla tendina. Se avesse voluto un cambio suo lo avrebbe scritto.
    new.fx_rate_to_eur := public.fn_fx_rate_to_eur(new.currency);
  end if;

  -- Un cambio mancante e' meglio di un importo azzerato: si torna a 1 e
  -- l'importo resta quello scritto, in attesa che il refresh porti il tasso.
  if new.fx_rate_to_eur is null or new.fx_rate_to_eur <= 0 then
    new.fx_rate_to_eur := 1;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_certifications_stamp_fx on public.certifications;
create trigger trg_certifications_stamp_fx
  before insert or update of currency, fx_rate_to_eur on public.certifications
  for each row execute function public.trg_certifications_stamp_fx();
