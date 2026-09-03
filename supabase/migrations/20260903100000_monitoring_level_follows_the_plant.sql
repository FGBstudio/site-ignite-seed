-- ============================================================================
-- Il livello di Energy e Air lo dice l'impianto
--
-- 95 progetti su 98 avevano il livello vuoto: nessuno risultava Online, e
-- riempirli a mano uno per uno significava copiare a mano un dato che il
-- sistema conosce gia'.
--
-- ── Due sorgenti diverse, e una che non e' quella che sembrava ─────────────
--
-- ARIA: `site_air_records.online_status` e' calcolato dalla telemetria da
-- fn_air_line_online_status, che guarda sensor_health apparecchio per
-- apparecchio. E' affidabile e si usa cosi' com'e'.
--
-- ENERGIA: la stessa colonna esiste ma NON e' calcolata. Contiene una 'Y'
-- messa a mano, e non concorda con la realta': misurato oggi, 4 righe marcate
-- 'Y' non trasmettono da mai, e 7 che trasmettono non hanno il flag. Su 22
-- righe interessate, 11 sono sbagliate.
--
-- Per l'energia quindi non si guarda il flag ma le letture: `energy_latest`,
-- l'ultima lettura per sito. La finestra e' 48 ore, ma il dato e' netto e non
-- ci si appoggia sopra: ogni sito che ha mai trasmesso lo ha fatto nelle
-- ultime 48 ore, gli altri non hanno una sola lettura. Non ci sono casi
-- intermedi da arbitrare.
--
-- "Partial" — qualche sensore vivo e qualche altro spento — vale Online: il
-- cliente i dati li vede. Che siano tutti o quasi tutti e' un'informazione che
-- il Monitor gia' mostra riga per riga, e non e' compito di un livello con due
-- soli valori raccontarla.
--
-- ── Perche' una funzione e non solo un UPDATE ─────────────────────────────
--
-- Perche' fra un mese un contatore in piu' si accende e questo allineamento
-- sara' vecchio. La funzione si puo' rieseguire.
--
-- Non e' pero' schedulata, ed e' una scelta: `cert_level` e' anche un campo
-- che una persona compila dal modulo di progetto, e un lavoro notturno che lo
-- riscrive cancellerebbe quella modifica senza dirlo a nessuno. Agganciarla al
-- giro notturno e' una decisione da prendere, non da subire.
-- ============================================================================

create or replace function public.fn_sync_monitoring_level()
returns table (certification_id uuid, cert_type text, da text, a text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with lettura as (
    select l.site_id, max(l.ts) as ultima
      from public.energy_latest l
     group by l.site_id
  ),
  calcolato as (
    select c.id,
           c.cert_type,
           c.cert_level as attuale,
           case
             when c.cert_type = 'Air' then
               case when exists (
                      select 1 from public.site_air_records r
                       where r.certification_id = c.id
                         and r.online_status in ('Online', 'Partial')
                    ) then 'Online' else 'Pending' end
             else
               case when exists (
                      select 1 from public.site_energy_records r
                        join lettura l on l.site_id = r.site_id
                       where r.certification_id = c.id
                         and l.ultima >= now() - interval '48 hours'
                    ) then 'Online' else 'Pending' end
           end as nuovo
      from public.certifications c
     where c.cert_type in ('Energy', 'Air')
  ),
  scritte as (
    update public.certifications c
       set cert_level = k.nuovo,
           updated_at = now()
      from calcolato k
     where c.id = k.id
       and c.cert_level is distinct from k.nuovo
     returning c.id, c.cert_type, k.attuale, k.nuovo
  )
  select s.id, s.cert_type, s.attuale, s.nuovo from scritte s;
end;
$function$;

comment on function public.fn_sync_monitoring_level() is
  'Allinea certifications.cert_level (Pending/Online) di Energy e Air a cio'' che fa l''impianto: online_status per l''aria, ultima lettura per l''energia. Restituisce le righe cambiate. Non e'' schedulata di proposito: il campo e'' anche compilabile a mano.';

-- La prima esecuzione. Il trigger che blocca le modifiche ai progetti sospesi
-- si spegne per la transazione: qui non si cambia lo stato di un progetto, si
-- registra cosa stanno facendo i suoi sensori.
alter table public.certifications disable trigger trg_enforce_cert_not_on_hold;

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.fn_sync_monitoring_level();
  raise notice 'livelli allineati: %', v_n;
end $$;

alter table public.certifications enable trigger trg_enforce_cert_not_on_hold;
