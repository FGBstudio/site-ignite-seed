-- ═══════════════════════════════════════════════════════════════════════════
-- La telemetria Kering torna al suo sito
--
-- `site_id` e' timbrato su ogni riga al momento dell'ingestione: spostare il
-- monitor sistema il futuro, non il passato. Senza questo, i dati gia' registrati
-- resterebbero a nome dell'ufficio di Milano — 326 righe grezze e 42 di
-- telemetry_latest, cioe' i valori che le schermate leggono per dire «adesso».
--
-- Il primo tentativo era dentro la migrazione dei monitor ed e' scaduto: l'UPDATE
-- senza un filtro sui device faceva scorrere tutta la tabella grezza, che porta
-- milioni di righe al giorno. Passando dai device — poche decine di id — il piano
-- usa l'indice e finisce in un istante. Il volume da correggere era minuscolo, il
-- modo di cercarlo no.
--
-- E' scritta per poter girare due volte: la seconda non trova niente da fare.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_siti text[] := array['KERING Senato','Kering Scandicci','KERING Trecate',
                         'Paris, Rue Monsieur','Kering Dubai','Kering Amsterdam',
                         'Kering San Paolo'];
begin
  with dev as (
    select d.id, d.site_id
      from public.devices d
      join public.sites s on s.id = d.site_id
     where s.name = any(v_siti)
  )
  update public.telemetry t set site_id = dev.site_id
    from dev where t.device_id = dev.id and t.site_id is distinct from dev.site_id;

  with dev as (
    select d.id, d.site_id
      from public.devices d
      join public.sites s on s.id = d.site_id
     where s.name = any(v_siti)
  )
  update public.telemetry_hourly t set site_id = dev.site_id
    from dev where t.device_id = dev.id and t.site_id is distinct from dev.site_id;

  with dev as (
    select d.id, d.site_id
      from public.devices d
      join public.sites s on s.id = d.site_id
     where s.name = any(v_siti)
  )
  update public.telemetry_daily t set site_id = dev.site_id
    from dev where t.device_id = dev.id and t.site_id is distinct from dev.site_id;

  with dev as (
    select d.id, d.site_id
      from public.devices d
      join public.sites s on s.id = d.site_id
     where s.name = any(v_siti)
  )
  update public.telemetry_latest t set site_id = dev.site_id
    from dev where t.device_id = dev.id and t.site_id is distinct from dev.site_id;
end $$;
