## Obiettivo

Allineare le prime tre colonne di tutte le tabelle Monitor (Air, Energy, futura Water) al pattern già in uso in **Operations → Projects** e **Quotations**:

```
CLIENT  |  CITY  |  PROJECT
brand.name  sites.city  certifications.name (fallback sites.name)
```

Fonte unica di verità per queste tre colonne = i join a `sites` + `brands`, mai colonne "cached" scritte al momento della creazione del record. Se un brand viene rinominato o una città corretta, la Monitor page riflette il cambiamento immediatamente e senza intoppi.

## Diagnosi

- **Operations/Projects** (`useAdminPlannerData`): risolve `client` da `brands` via `sites.brand_id`. Corretto.
- **Quotations** (`Quotations.tsx`): stesso pattern. Corretto (fix già applicato in una passata precedente).
- **Monitor → Air** (`useAirRows`): join `sites (…, brand_id)` + fetch `brands` → `brand_name`. Corretto.
- **Monitor → Energy** (`useMonitorRows`): legge `brand_name`, `city`, `country`, `region` dalle colonne cached su `site_energy_records`. Queste colonne vengono compilate solo alla conferma del CT Builder; le righe "shell" create dal nuovo trigger di sync (o record legacy) hanno questi campi NULL → la colonna Client resta vuota nonostante il brand esista sul sito.
  - NO ASSOLUTAMENTE NO, NON GESTIRE COSì QUESTA COSA LE INFORMAZIONI VANNO CAMPITE ANCHE SE IL CT BUILDER è NULLO! è LO STATO CHE VARIA E CHE SARà PENDING O QUALCOS'ALTRO NON SCHERZIAMO
- **Monitor → Water**: nessun reader ancora presente.

Conseguenza: la stessa certificazione può apparire in Air con Client "Miu Miu" e in Energy con Client "—", generando confusione e potenziali doppioni logici.

## Strategia

Un unico "identity resolver" a livello di hook, condiviso da tutte le tabelle Monitor. Ignora le colonne cached e joina sempre `sites` + `brands`.

### Diagramma

```text
                ┌────────────────────────────┐
                │  sites  +  brands          │
                │  (source of truth)         │
                └────────────┬───────────────┘
                             │  join by site_id / brand_id
       ┌─────────────────────┼──────────────────────┐
       ▼                     ▼                      ▼
  useAirRows           useMonitorRows          useWaterRows
  (Air)                (Energy)                (Water)
       │                     │                      │
       └──────► identity: { client, city, project } ◄──┘
                             │
                             ▼
                Monitor.tsx tabs (Air | Energy | Water)
                first 3 columns identical layout
```

## Implementazione

### 1. Helper condiviso `src/lib/monitorIdentity.ts`

Nuova funzione `resolveMonitorIdentity(row, sitesById, brandsById)`:

```text
client  = brandsById.get(site.brand_id)?.name  ?? "—"
city    = site.city                             ?? "—"
project = certification.name ?? site.name       ?? "Untitled"
region  = site.region                           ?? null
country = site.country                          ?? null
```

Ritorna un oggetto piccolo che diventa la parte "identity" di ogni riga Monitor.

### 2. `useMonitorRows` (Energy) — refactor read model

- Aggiungere al select join a `sites (id, name, city, country, region, brand_id)` e prefetch `brands` come già fa `useAirRows`.
- Sovrascrivere `brand_name`, `city`, `country`, `region`, `project_name` in ogni `MonitorRow` con i valori risolti dai join. Le colonne cached sul record restano nel DB per compatibilità storica ma **non vengono più lette** dal frontend.
- Nessun cambio al tipo `MonitorRow`: si popolano gli stessi campi con dati freschi.

### 3. Nuovo `useWaterRows` (Water)

- Stesso schema/logica di `useAirRows`, adattato a `site_water_records`.
- Ritorna righe con la stessa identity `{ client, city, project, region, country }` più i pochi campi Water (`total_sensors`, `status`, `handover_date`, `po_numbers`, `notes`).

### 4. `Monitor.tsx` — layout uniforme e tab Water

- Estrarre in un mini-componente `<IdentityCells row={…} />` (Client | City | Project) usato dalle tabelle Air, Energy e Water così che l'ordine, il font, la stickyness siano identici in tutte e tre.
- Aggiungere una terza tab **Water** che monta una nuova `WaterTable.tsx` (copia scarna di `AirTable.tsx` senza logiche shipment, per ora).

### 5. Wizard di creazione — nessuna scrittura ridondante

Rimuovere/deprecare la scrittura di `brand_name / region / country / city` in `EnergyMonitoringPanel` al confirm del CT Builder (righe 152-156). Restano `project_name` (per compatibilità con vecchi export CSV) ma marcato come derivato. Le colonne cached su `site_energy_records` non vengono più aggiornate: se in futuro servono, un trigger DB può popolarle da `sites`.

### 6. Verifica

- Creare una nuova quotazione con brand X, sito con città Y, cert nome Z, flaggando IAQ+Energy+Water → aprire Monitor: le tre tab mostrano tutte "X | Y | Z" nelle prime tre colonne, stessa identity di Operations/Projects.
- Rinominare il brand in DB → le tre tab riflettono il nuovo nome senza bisogno di rilanciare CT Builder / hardware sync.

## Dettagli tecnici

- File toccati:
  - `src/lib/monitorIdentity.ts` (nuovo)
  - `src/hooks/useMonitorRows.ts` (join + override identity)
  - `src/hooks/useWaterRows.ts` (nuovo)
  - `src/pages/Monitor.tsx` (`IdentityCells` component + tab Water)
  - `src/components/projects/WaterMonitoring/WaterTable.tsx` (nuovo, minimal)
  - `src/components/projects/EnergyMonitoring/EnergyMonitoringPanel.tsx` (rimuove scritture cached)
- Nessuna nuova migrazione DB richiesta: `site_water_records` esiste già, i join sono su tabelle esistenti.
- Nessun `as any`; tipi in `src/types/site-water.ts` già presenti.
- Query key TanStack unificate: `["monitor-air-rows"]`, `["monitor-energy-rows"]`, `["monitor-water-rows"]`.

## Fuori scope

- Backfill delle colonne cached storiche su `site_energy_records`: superfluo, non vengono più lette.
- Consolidamento delle tre tabelle `site_air_records / site_energy_records / site_water_records` in una singola vista `monitoring_services`: rimandato quando i tre tipi convergono su lo stesso set di campi finanziari.