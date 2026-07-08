## Contesto del problema

Oggi lo stato "questa certificazione richiede un monitoraggio IAQ / Energy / Water" vive in **quattro posti diversi**, senza collegamento automatico tra loro. Questo genera i rischi che segnalata: monitor che spariscono dalla tabella Monitor, siti/certificazioni duplicati, doppi conteggi.

### Le quattro sorgenti attuali

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 1. certifications.has_iaq/energy/water_monitoring   (bool)          │
│    ← scritto da NewQuotationWizard (i flag "ClAir IAQ / Energy…")   │
│                                                                     │
│ 2. sites.monitoring_types (text[]) + module_air/energy/water_enabled│
│    ← scritto da ProjectCreateWizard (onboarding sito)               │
│                                                                     │
│ 3. project_allocations (righe hardware)                             │
│    → trigger genera task_alerts.monitoring_*_requested              │
│                                                                     │
│ 4. site_air_records / site_energy_records                           │
│    ← Air: trigger refresh_site_air_record su hardwares AIR          │
│    ← Energy: upsert manuale da EnergyMonitoringPanel (CT Builder)   │
└─────────────────────────────────────────────────────────────────────┘
```

**Conseguenze:**

- Flaggo "IAQ" nel wizard di quotazione → viene scritto solo `certifications.has_iaq_monitoring`. `sites.monitoring_types` e `sites.module_air_enabled` **non vengono toccati**. Se il PM non alloca hardware AIR, il sito non compare in Monitor → Air.
- `site_energy_records` esiste solo dopo che l'admin conferma il CT Builder. Nel frattempo non c'è "riga richiesta" nella Monitor page → il monitor sembra scomparso.
- Se un sito ha più certificazioni (LEED + WELL) con flag diverse, `sites.monitoring_types` viene sovrascritto dall'ultimo wizard che lo tocca → si perdono servizi.
- Monitor page raggruppa Air per `site_id`, Energy per `certification_id` → stesso sito può apparire più volte con dati incoerenti.

---

## Strategia: singola sorgente di verità = `certifications.has_*_monitoring`

`mi va bene, nel caso allora io debba mettere solo il monitor dell'energia e non ci sia una certificazione LEED dovrò configurare la certificazione come Energy Audit, corretto?`  
`ricorda che devo sempre avere anche poi un occhio sul numero dei dispositivi previsti per sito, questa informazione da dove la prendo?`

Le flag sulla certificazione diventano **il contratto**. Tutto il resto (sites, records, alerts) è derivato via trigger DB. Questo garantisce:

- Un solo punto di scrittura lato UI (wizard di quotazione + editing PM Config).
- Impossibile perdere un monitor: se la flag è `true`, la riga in Monitor esiste sempre.
- Nessun duplicato: la Monitor page joina sempre da `certifications` con `DISTINCT ON (site_id, service_type)`.

### Diagramma target

```text
                     WRITE (UI)
        ┌────────────────────────────────────┐
        │  NewQuotationWizard / PMConfigModal│
        │      set certifications.has_*      │
        └────────────────┬───────────────────┘
                         │
                         ▼   (trigger DB, atomico)
        ┌────────────────────────────────────┐
        │ sync_site_monitoring_from_certs()  │
        │  - sites.monitoring_types = UNION  │
        │    di tutte le certs del sito      │
        │  - sites.module_*_enabled = OR     │
        │  - upsert shell in site_*_records  │
        │    con status "Requested"          │
        │  - insert task_alert "requested"   │
        │    se non esiste                   │
        └────────────────┬───────────────────┘
                         │
                         ▼   READ (Monitor page)
        ┌────────────────────────────────────┐
        │  useMonitorRows / useAirRows /     │
        │  (nuovo) useWaterRows              │
        │  keyed by (site_id, service_type)  │
        └────────────────────────────────────┘
```

---

## Piano di implementazione

### 1. Migrazione DB — trigger di sincronizzazione

Nuova funzione `public.sync_site_monitoring_from_certs(p_site_id uuid)`:

- Ricalcola `sites.monitoring_types` come UNION di `has_iaq/energy/water_monitoring` di **tutte** le certificazioni collegate a quel sito.
- Aggiorna `sites.module_air_enabled / module_energy_enabled / module_water_enabled` di conseguenza (OR logico).
- Per ogni flag `true`:
  - Upsert riga "shell" in `site_air_records` (se IAQ) / `site_energy_records` (se Energy) / nuova `site_water_records` (se Water) con `status='Requested'`, `certification_id`, `pm_id`, `project_name` presi dalla cert più recente.
  - Insert `task_alerts.monitoring_*_requested` se non ne esiste già uno non risolto per quella cert.
- Per ogni flag `false`: NON cancella i record (mantiene lo storico) ma marca `status='Deprecated'` se non ci sono hardware allocati.

Trigger: `AFTER INSERT OR UPDATE OF has_iaq_monitoring, has_energy_monitoring, has_water_monitoring, site_id ON certifications` → chiama la funzione.

Backfill nella stessa migrazione: `SELECT sync_site_monitoring_from_certs(id) FROM sites` per allineare i dati esistenti.

### 2. Tabella `site_water_records`

Creazione mirror di `site_air_records` per il servizio Water (già previsto nella UI Monitor, oggi vuoto). Stessa struttura minima: `site_id`, `certification_id`, `pm_id`, `status`, `handover_date`, campi finanziari, `notes`. Con GRANT e RLS analoghi ad Air.

### 3. UI — nessun cambio ai wizard esistenti

`NewQuotationWizard` continua a scrivere solo `certifications.has_*_monitoring` (già lo fa alla riga 460-462). Il trigger fa il resto. Rimuoviamo dai wizard qualunque scrittura diretta a `sites.monitoring_types` / `sites.module_*_enabled` per evitare drift (attualmente in `ProjectCreateWizard`).

`ProjectCreateWizard` → i checkbox Energy/Air/Water diventano un preset che alla creazione della prima cert setta le sue `has_*_monitoring`, poi si affida al trigger. Nessuna scrittura diretta su `sites.module_*`.

### 4. Monitor page — read model unificato

Nuovo hook `useMonitorServices()` che, per ogni tipo:

- Legge da `site_*_records` join `certifications` join `sites` join `brands`.
- Chiave riga = `(site_id, service_type)` → mai duplicati.
- Stato riga derivato: `Requested` (shell, nessun hw) → `In Progress` (hw allocato, non consegnato) → `Delivered` → `Installed` → `Completed`.
- `client_name` sempre da `brands.name` (fix già applicato a Air, esteso a Energy/Water).

`useAirRows` / `useMonitorRows` restano compatibili ma leggono dalla stessa base e usano lo stesso derivatore di stato.

### 5. Alerts — invariati come logica, deduplicati

Il trigger di sync inserisce un `task_alerts.monitoring_*_requested` **solo se** non ne esiste già uno aperto per la stessa cert/service, così l'attuale trigger su `project_allocations` non crea doppioni. Vincolo unico parziale su `task_alerts (certification_id, alert_type) WHERE is_resolved=false`.

### 6. Verifica

- Query di controllo post-migrazione: per ogni cert con `has_iaq_monitoring=true` deve esistere una riga in `site_air_records` con lo stesso `site_id`, e viceversa. Idem Energy/Water.
- UI: creare una nuova quotazione con flag IAQ → aprire Monitor → Air → la riga deve apparire subito in stato "Requested" con il brand corretto come Client.

---

## Dettagli tecnici (per implementazione)

- File toccati:
  - `supabase/migrations/<new>_unify_monitoring_sources.sql` (funzione + trigger + tabella water + backfill + GRANT/RLS).
  - `src/hooks/useMonitorServices.ts` (nuovo, o refactor di `useMonitorRows` + `useAirRows`).
  - `src/pages/Monitor.tsx` (aggiunge tab Water e usa il nuovo hook).
  - `src/pages/ProjectCreateWizard.tsx` (rimuove scrittura diretta a `sites.module_*`, delega alla cert).
  - `src/components/projects/NewQuotationWizard.tsx` (nessun cambio funzionale, solo verifica).
- Nessun cambio a `certifications.has_*_monitoring` schema: già presenti.
- RLS: le nuove policy su `site_water_records` seguono lo standard `is_admin(auth.uid()) OR is_cert_pm(auth.uid(), certification_id)`.
- Nessun `as any`, tipi in `src/types/site-water.ts` mirror di `site-air.ts`.

## Fuori scope (proponibile in un secondo giro)

- Migrazione dei valori esistenti in `sites.monitoring_types` scritti da vecchi wizard e in disaccordo con le flag di cert: la funzione di sync farà da riconciliatore automatico, ma se vogliamo una revisione manuale possiamo esportare un report prima del backfill.
- Merge di siti/certificazioni duplicati preesistenti (stesso brand+indirizzo con record doppi): task separato di data cleanup.